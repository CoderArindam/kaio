import json
from typing import Dict, Any, AsyncGenerator, Callable
from app.ai.schemas.planning import ExecutionResult, ExecutionContext, ExecutionStatus
from app.ai.gateway.ai_gateway import AIGateway
from app.ai.prompts.registry import PromptRegistry

from app.ai.orchestration.renderers import render_list, render_entity, render_success, render_failure


class TemplateRegistry:
    def __init__(self):
        self.templates: Dict[str, Callable[[Any], str | None]] = {}
        
    def register(self, action_name: str, handler: Callable[[Any], str | None]):
        self.templates[action_name] = handler
        
    def get_template(self, result: ExecutionResult) -> str | None:
        if result.status == ExecutionStatus.FAILED:
            # Extract error details from step results
            errors = [sr.error for sr in result.step_results if sr.error]
            if errors:
                return f"I ran into an issue: {errors[0]}"
            return "I encountered an error while trying to complete that request."
            
        if not hasattr(result, "step_results") or not result.step_results:
            return None
            
        parts = []
        for step_res in result.step_results:
            action_name = step_res.action
            if action_name in self.templates:
                rendered = self.templates[action_name](step_res.output)
                if rendered:
                    parts.append(rendered)
            elif step_res.tool_name in self.templates:
                rendered = self.templates[step_res.tool_name](step_res.output)
                if rendered:
                    parts.append(rendered)
                    
        # Filter out empty list messages ("You don't have any...") if there's already a successful mutation
        final_parts = []
        has_mutation = any("successfully" in p.lower() or "added" in p.lower() or "created" in p.lower() or "deleted" in p.lower() for p in parts)
        for p in parts:
            if has_mutation and ("you don't have any" in p.lower() or "no tasks found" in p.lower() or "no comments found" in p.lower()):
                continue
            final_parts.append(p)
            
        if final_parts:
            return "\n\n".join(final_parts)
            
        return None


template_registry = TemplateRegistry()


# --- Workspace Read Templates ---

def _render_projects(output):
    if not output or not isinstance(output, dict):
        return None
    projects = output.get("projects", [])
    if not projects:
        return "You don't have any projects yet. Would you like me to create one?"
    return render_list(
        f"You have **{len(projects)}** project{'s' if len(projects) != 1 else ''}:",
        projects,
        display_field="name"
    )

template_registry.register("list_projects", _render_projects)
template_registry.register("list_boards", _render_projects)


def _priority_emoji(priority: str | None) -> str:
    return {"HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🟢"}.get(
        (priority or "").upper(), "⚪"
    )


def _due_label(due_date_str: str | None, is_completed: bool) -> str:
    if not due_date_str or is_completed:
        return ""
    try:
        from datetime import datetime, timezone
        due = datetime.fromisoformat(due_date_str.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        delta = (due.date() - now.date()).days
        if delta < 0:
            return f"⚠️ Overdue by {abs(delta)}d"
        if delta == 0:
            return "📅 Due today"
        if delta <= 3:
            return f"📅 Due in {delta}d"
        return ""
    except Exception:
        return ""


def _render_tasks(output):
    if not output or not isinstance(output, dict):
        return None
    # Surface resolution warnings (e.g. unknown assignee name)
    meta_warning = output.get("_meta", {}).get("warning")
    tasks = output.get("tasks", [])
    if not tasks:
        if meta_warning:
            return f"⚠️ {meta_warning}"
        return "No tasks found matching your criteria."
    count = len(tasks)
    lines = [f"Found **{count}** task{'s' if count != 1 else ''}:\n"]
    for t in tasks:
        title = t.get("title", "Untitled")
        prio = _priority_emoji(t.get("priority"))
        status = t.get("column_name") or "—"
        assignee = t.get("assignee_name") or "Unassigned"
        board = t.get("board_name") or ""
        due_label = _due_label(t.get("due_date"), bool(t.get("is_completed")))
        board_part = f" · **{board}**" if board else ""
        due_part = f" · {due_label}" if due_label else ""
        lines.append(f"- {prio} **{title}**{board_part} · {status} · {assignee}{due_part}")
    return "\n".join(lines)

template_registry.register("list_tasks", _render_tasks)


# --- Analytics & Reporting Templates (Phase 2) ---

def _render_board_health(output):
    if not output or not isinstance(output, dict):
        return None
    name = output.get("name", "Board")
    total = output.get("total_tasks", 0)
    completed = output.get("completed_tasks", 0)
    progress = output.get("progress_percent", 0.0)
    overdue = output.get("overdue_tasks", 0)
    overdue_rate = output.get("overdue_rate_percent", 0.0)
    members = output.get("member_count", 0)
    top = output.get("top_members", [])

    lines = [f"### 📊 {name} — Health Summary\n"]
    lines.append(f"| Metric | Value |")
    lines.append(f"|---|---|")
    lines.append(f"| Total Tasks | **{total}** |")
    lines.append(f"| Completed | **{completed}** ({progress:.0f}%) |")
    if overdue > 0:
        lines.append(f"| ⚠️ Overdue | **{overdue}** ({overdue_rate:.0f}% of total) |")
    lines.append(f"| Members | **{members}** |")
    if top:
        members_str = ", ".join(m.get("display_name", "?") for m in top[:4])
        lines.append(f"| Top Members | {members_str} |")
    return "\n".join(lines)

template_registry.register("get_board_health_summary", _render_board_health)


def _render_my_tasks(output):
    return _render_tasks(output)

template_registry.register("get_my_overdue_and_upcoming_tasks", _render_my_tasks)


def _render_search(output):
    if not output or not isinstance(output, dict):
        return None
    results = output.get("results", [])
    query = output.get("query", "")
    if not results:
        return f"No results found for **\"{query}\"**."
    lines = [f"Found **{len(results)}** result{'s' if len(results) != 1 else ''}' for **\"{query}\"**:\n"]
    for r in results:
        rtype = str(r.get("type", "item")).capitalize()
        title = r.get("title", "Untitled")
        lines.append(f"- [{rtype}] **{title}**")
    return "\n".join(lines)

template_registry.register("search_workspace", _render_search)


def _render_proposals(output):
    if not output or not isinstance(output, dict):
        return None
    counts = output.get("counts", {})
    pending = counts.get("pending", 0)
    approved = counts.get("approved", 0)
    rejected = counts.get("rejected", 0)
    proposals = output.get("pending_proposals", [])

    lines = [
        "### 📋 Task Proposal Summary\n",
        f"| Status | Count |",
        f"|---|---|",
        f"| 🟡 Pending | **{pending}** |",
        f"| ✅ Approved | **{approved}** |",
        f"| ❌ Rejected | **{rejected}** |",
    ]
    if proposals:
        lines.append(f"\n**Pending proposals:**\n")
        for p in proposals[:10]:
            board = p.get("board_name") or "Unassigned"
            score = p.get("confidence_score")
            score_str = f" (confidence: {score:.0%})" if score is not None else ""
            lines.append(f"- **{p['title']}** · {board}{score_str}")
    return "\n".join(lines)

template_registry.register("get_pending_proposals_summary", _render_proposals)


def _render_timesheet(output):
    if not output or not isinstance(output, dict):
        return None
    scope = output.get("scope", "own")
    if scope == "org":
        summaries = output.get("weekly_summaries", [])
        if not summaries:
            return "No org-wide timesheet data available."
        lines = ["### 📊 Org Timesheet Summary\n", "| Week | Hours Logged | Compliance |", "|---|---|---|"]
        for s in summaries[:4]:
            week = (s.get("week_start_date") or "")[:10]
            hrs = f"{s.get('total_hours_logged', 0):.1f}h"
            compliance = f"{s.get('compliance_rate', 0) * 100:.0f}%"
            lines.append(f"| {week} | {hrs} | {compliance} |")
        return "\n".join(lines)
    else:
        timesheets = output.get("timesheets", [])
        if not timesheets:
            return "You have no timesheet records for the last 4 weeks."
        lines = ["### 🗓️ My Timesheets\n", "| Week | Status | Hours |", "|---|---|---|"]
        for ts in timesheets[:4]:
            week = (ts.get("week_start_date") or "")[:10]
            status = ts.get("status", "—")
            hrs = f"{ts.get('total_hours', 0):.1f}h"
            lines.append(f"| {week} | {status} | {hrs} |")
        return "\n".join(lines)

template_registry.register("get_timesheet_status", _render_timesheet)




def _render_users(output):
    if not output or not isinstance(output, dict):
        return None
    users = output.get("users", [])
    if not users:
        return "No workspace members found."
    return render_list(
        f"**{len(users)}** workspace member{'s' if len(users) != 1 else ''}:",
        users,
        display_field="first_name",
        secondary_field="email"
    )

template_registry.register("get_users", _render_users)


def _render_task_details(output):
    if not output or not isinstance(output, dict):
        return None
    task = output.get("task", {})
    if not task:
        return "Task details not found."
    
    title = task.get("title", "Untitled Task")
    status = task.get("column_name") or "—"
    board = task.get("board_name") or ""
    priority = task.get("priority") or "—"
    prio_emoji = _priority_emoji(priority)
    
    first = task.get("assignee_first_name") or ""
    last = task.get("assignee_last_name") or ""
    assignee = f"{first} {last}".strip() or "Unassigned"
    
    due = task.get("due_date")
    due_badge = _due_label(due, bool(task.get("is_completed"))) if due else ""
    due_str = f"{due[:10]} ({due_badge})" if due and due_badge else (due[:10] if due else "None")
    desc = task.get("description") or "No description provided."
    
    lines = [
        f"### 📌 {title}\n",
        f"| Field | Details |",
        f"|---|---|",
        f"| **Status** | {status} |",
        f"| **Board** | {board if board else '—'} |",
        f"| **Priority** | {prio_emoji} {priority} |",
        f"| **Assignee** | {assignee} |",
        f"| **Due Date** | {due_str} |",
        f"\n**Description:**\n> {desc}"
    ]
    return "\n".join(lines)

template_registry.register("get_task_details", _render_task_details)



def _render_board_summary(output):
    if not output or not isinstance(output, dict):
        return None
    total = output.get("total_tasks", 0)
    completed = output.get("completed_tasks", 0)
    progress = output.get("progress_percent", 0)
    overdue = output.get("overdue_tasks", 0)
    by_status = output.get("tasks_by_status", {})
    members = output.get("member_count", 0)
    
    lines = [f"### Project Summary\n"]
    lines.append(f"- **Total Tasks:** {total}")
    lines.append(f"- **Progress:** {progress}% complete ({completed}/{total})")
    if overdue > 0:
        lines.append(f"- ⚠️ **Overdue:** {overdue} task{'s' if overdue != 1 else ''}")
    lines.append(f"- **Members:** {members}")
    
    if by_status:
        lines.append(f"\n**By Status:**")
        for status, count in by_status.items():
            lines.append(f"- {status}: {count}")
    
    by_priority = output.get("tasks_by_priority", {})
    if by_priority:
        lines.append(f"\n**By Priority:**")
        for prio, count in by_priority.items():
            lines.append(f"- {prio}: {count}")
    
    return "\n".join(lines)

template_registry.register("get_board_summary", _render_board_summary)


# --- Mutation Templates ---

def _render_create_task(output):
    if not output or not isinstance(output, dict):
        return None
    msg = output.get("message", "Task created successfully")
    return render_success("Task Created", msg)

template_registry.register("create_task", _render_create_task)


def _render_update_task(output):
    if not output or not isinstance(output, dict):
        return None
    action = output.get("action", "updated")
    title = f"Task {action.replace('_', ' ').title()}"
    msg = output.get("message", "Task updated successfully")
    return render_success(title, msg)

template_registry.register("update_task", _render_update_task)


def _render_delete_task(output):
    if not output or not isinstance(output, dict):
        return None
    return render_success("Task Deleted", output.get("message", "Task deleted successfully"))

template_registry.register("delete_task", _render_delete_task)


def _render_create_board(output):
    if not output or not isinstance(output, dict):
        return None
    return render_success("Project Created", output.get("message", "Project created successfully"))

template_registry.register("create_board", _render_create_board)


def _render_archive_board(output):
    if not output or not isinstance(output, dict):
        return None
    return render_success("Project Archived", output.get("message", "Project archived successfully"))

template_registry.register("archive_board", _render_archive_board)


def _render_delete_board(output):
    if not output or not isinstance(output, dict):
        return None
    return render_success("Project Deleted", output.get("message", "Project deleted successfully"))

template_registry.register("delete_board", _render_delete_board)


def _render_add_comment(output):
    if not output or not isinstance(output, dict):
        return None
    return render_success("Comment Added", output.get("message", "Comment added successfully"))

template_registry.register("add_comment", _render_add_comment)


def _render_get_comments(output):
    if not output or not isinstance(output, dict):
        return None
    verified = output.get("verified", {})
    comments = verified.get("comments", [])
    if not comments:
        return "No comments found for this task."
    
    lines = [f"Found **{len(comments)}** comment{'s' if len(comments) != 1 else ''}:"]
    for c in comments:
        user_name = f"{c.get('user_first_name') or ''} {c.get('user_last_name') or ''}".strip() or "User"
        date = c.get('created_at', '').split('T')[0] if c.get('created_at') else ""
        content = c.get('content', '')
        lines.append(f"**{user_name}** ({date}):\n> {content}")
        
    return "\n\n".join(lines)

template_registry.register("get_comments", _render_get_comments)

# --- Profile and Appearance Templates ---

def _render_update_profile(output):
    if not output or not isinstance(output, dict):
        return None
    msg = output.get("message", "Profile updated successfully.")
    return render_success("Profile Updated", msg)

template_registry.register("update_profile", _render_update_profile)

def _render_get_my_profile(output):
    if not output or not isinstance(output, dict):
        return None
    return render_entity(
        "Your Profile",
        output.get("verified", {}),
        fields=["first_name", "last_name", "email"]
    )

template_registry.register("get_my_profile", _render_get_my_profile)

def _render_update_appearance(output):
    if not output or not isinstance(output, dict):
        return None
    msg = output.get("message", "Appearance preferences updated.")
    return render_success("Appearance Updated", msg)

template_registry.register("update_appearance", _render_update_appearance)

def _render_get_my_appearance(output):
    if not output or not isinstance(output, dict):
        return None
    return render_entity(
        "Appearance Preferences",
        output.get("verified", {}),
        fields=["theme", "accent_color", "sidebar_theme", "sidebar_collapsed"]
    )

template_registry.register("get_my_appearance", _render_get_my_appearance)



# --- Composer ---

class ResponseComposer:
    """
    Transforms an ExecutionResult into a user-friendly conversational response.
    Uses deterministic templates where possible to save tokens and latency,
    falling back to the LLM for complex summaries.
    """
    
    def __init__(self, gateway: AIGateway):
        self.gateway = gateway
        
    async def compose(self, result: ExecutionResult, context: ExecutionContext) -> AsyncGenerator[str, None]:
        from app.ai.telemetry.context import Span
        
        with Span("Compose Response", "ResponseComposer") as span:
            yield f"data: {json.dumps({'v': '1.0', 'type': 'assistant_message_start', 'execution_id': context.execution_id})}\n\n"
            
            template_response = template_registry.get_template(result)
            
            if template_response:
                span.metadata["method"] = "template"
                yield f"data: {json.dumps({'v': '1.0', 'type': 'assistant_message_chunk', 'content': template_response})}\n\n"
            else:
                span.metadata["method"] = "llm"
                system_prompt = PromptRegistry.render_prompt(
                    agent_name="workspace_assistant",
                    prompt_name="composer",
                    context={},
                    version="v1"
                )
                
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Please summarize this execution result:\n\n{result.model_dump_json()}"}
                ]
                
                stream_gen = self.gateway.stream_prompt(
                    messages=messages,
                    org_ai_enabled=True,
                    user_has_permission=True,
                    workflow_id="response_composition",
                    request_id=context.request_id,
                    organization_id=context.organization_id,
                    user_id=str(context.current_user.get("id"))
                )
                
                async for chunk in stream_gen:
                    if chunk and "content" in chunk:
                        yield f"data: {json.dumps({'v': '1.0', 'type': 'assistant_message_chunk', 'content': chunk['content']})}\n\n"
                        
            yield f"data: {json.dumps({'v': '1.0', 'type': 'assistant_message_end'})}\n\n"
