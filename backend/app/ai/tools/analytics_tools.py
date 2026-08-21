"""
Analytics & reporting tools for KAI — Phase 2.

All tools in this module are read-only.  They follow the same security invariants
established in the audit and enforced by BaseTool.run():
  - org_id and user_id are always taken from current_user, never from LLM arguments.
  - Required-role checks (where present) happen in BaseTool.run() before execute().
  - Each tool's RBAC intent is documented inline.
"""
from typing import Any, Dict, Literal, Optional, Union
from pydantic import BaseModel, Field

from app.ai.tools.base import BaseTool, RiskLevel


# ---------------------------------------------------------------------------
# Tool 1 — GetBoardHealthSummaryTool
# ---------------------------------------------------------------------------

class BoardHealthInput(BaseModel):
    model_config = {"populate_by_name": True}
    board_id: Optional[Union[int, str]] = Field(None, description="The integer ID of the board to inspect.")
    board_name: Optional[str] = Field(None, description="The name of the board (if ID is unknown or referring to current board).")


class GetBoardHealthSummaryTool(BaseTool):
    """
    Retrieve a health snapshot for a single board: progress, overdue rate,
    member count, and top-member workload.
    """
    name = "get_board_health_summary"
    description = (
        "Get a detailed health summary for a specific board including task progress, "
        "overdue rate, and member workload. Use this when the user asks about a "
        "specific board's health, progress, or status breakdown."
    )
    action = "get_board_health_summary"
    category = "analytics"
    risk_level = RiskLevel.SAFE
    is_write_action = False
    input_schema = BoardHealthInput
    output_schema = Any
    # RBAC: intentionally open to all authenticated roles.
    # Board-level access is enforced by can_view_board() inside DashboardService,
    # which queries v_dashboard_board_summaries_canonical with user_id + board_id.
    # A user who cannot view the board receives a ValueError, not silently empty data.

    async def execute(
        self,
        params: BoardHealthInput,
        current_user: dict,
        services: Dict[str, Any],
    ) -> Any:
        from app.ai.tools.domain_tools import resolve_board_id
        real_board_id = await resolve_board_id(params.board_id, params.board_name, current_user, services)
        dashboard_service = services["dashboard_service"]
        return await dashboard_service.get_board_health_summary(
            board_id=real_board_id,
            current_user=current_user,
        )



# ---------------------------------------------------------------------------
# Tool 2 — GetMyOverdueAndUpcomingTasksTool
# ---------------------------------------------------------------------------

class MyTasksInput(BaseModel):
    due_filter: Literal["overdue", "upcoming", "today", "all"] = Field(
        default="overdue",
        description=(
            "Filter by due date: 'overdue' (past due, not done), "
            "'upcoming' (future due, not done), 'today' (due today, not done), "
            "'all' (all assigned tasks)."
        ),
    )
    # Note: 'user_id' is intentionally ABSENT from this schema.
    # The tool always operates on current_user["id"]; there is no mechanism
    # for the LLM to supply a different user ID.  Any unknown field in the
    # arguments dict is rejected by Pydantic's model_config default.


class GetMyOverdueAndUpcomingTasksTool(BaseTool):
    """
    Return the current user's own tasks filtered by due-date status.
    Always scoped to the authenticated user — not configurable by the LLM.
    """
    name = "get_my_overdue_and_upcoming_tasks"
    description = (
        "Get the current user's own tasks filtered by due status: overdue, upcoming, "
        "due today, or all. Always returns tasks for the authenticated user only. "
        "Use this when the user asks 'what are my overdue tasks', 'what's due today', etc."
    )
    action = "get_my_overdue_and_upcoming_tasks"
    category = "analytics"
    risk_level = RiskLevel.SAFE
    is_write_action = False
    input_schema = MyTasksInput
    output_schema = Any
    # RBAC: intentionally open to all authenticated roles.
    # Scope is structurally enforced: user_id is not in the input schema,
    # so the LLM cannot supply it.  execute() always uses current_user["id"].

    async def execute(
        self,
        params: MyTasksInput,
        current_user: dict,
        services: Dict[str, Any],
    ) -> Any:
        my_work_service = services["my_work_service"]
        # Pass due_filter as the `due` parameter; sort=due for sensible ordering.
        tasks = await my_work_service.get_my_work_tasks(
            due=params.due_filter if params.due_filter != "all" else None,
            sort="due",
            limit=30,
            offset=0,
            current_user=current_user,
        )
        return {
            "scope": "own",
            "due_filter": params.due_filter,
            "count": len(tasks),
            "tasks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "board_name": getattr(t, "board_name", None),
                    "column_name": getattr(t, "column_name", None),
                    "priority": getattr(t, "priority", None),
                    "due_date": t.due_date.isoformat() if t.due_date else None,
                    "is_completed": t.is_completed,
                }
                for t in tasks
            ],
        }


# ---------------------------------------------------------------------------
# Tool 3 — SearchWorkspaceTool
# ---------------------------------------------------------------------------

class SearchInput(BaseModel):
    query: str = Field(..., min_length=1, description="Search term (tasks, boards, comments).")
    limit: int = Field(default=10, ge=1, le=20, description="Max results to return (1–20).")


class SearchWorkspaceTool(BaseTool):
    """
    Full-text search across tasks, boards, and comments within the org.
    Org isolation is enforced by fn_global_search via user_id + org_id.
    """
    name = "search_workspace"
    description = (
        "Search across tasks, boards, and comments in the current workspace. "
        "Use when the user says 'find', 'search', or 'look for' something. "
        "Returns items ranked by relevance."
    )
    action = "search_workspace"
    category = "analytics"
    risk_level = RiskLevel.SAFE
    is_write_action = False
    input_schema = SearchInput
    output_schema = Any
    # RBAC: intentionally open to all authenticated roles.
    # Org isolation enforced by fn_global_search($user_id, $org_id, $query, $limit).

    async def execute(
        self,
        params: SearchInput,
        current_user: dict,
        services: Dict[str, Any],
    ) -> Any:
        search_service = services["search_service"]
        results = await search_service.search(
            query=params.query,
            current_user=current_user,
            limit=params.limit,
        )
        return {
            "query": params.query,
            "count": len(results),
            "results": [r.model_dump() for r in results],
        }


# ---------------------------------------------------------------------------
# Tool 4 — GetPendingProposalsSummaryTool
# ---------------------------------------------------------------------------

class ProposalSummaryInput(BaseModel):
    pass  # No user-supplied parameters; org_id comes from current_user


class GetPendingProposalsSummaryTool(BaseTool):
    """
    Return a count-by-status summary and list of pending AI-extracted task proposals.
    Restricted to MANAGER and SUPER_ADMIN — same gate as the REST proposals endpoint.
    """
    name = "get_pending_proposals_summary"
    description = (
        "Get a summary of pending AI-extracted task proposals from recent meetings, "
        "including counts by status and the list of proposals awaiting review. "
        "Only available to Managers and Super Admins."
    )
    action = "get_pending_proposals_summary"
    category = "analytics"
    # Mirror DeleteTaskTool's pattern exactly (domain_tools.py:349-350)
    required_roles = ["MANAGER", "SUPER_ADMIN"]
    risk_level = RiskLevel.SAFE
    is_write_action = False
    input_schema = ProposalSummaryInput
    output_schema = Any

    async def execute(
        self,
        params: ProposalSummaryInput,
        current_user: dict,
        services: Dict[str, Any],
    ) -> Any:
        proposal_service = services["proposal_read_service"]
        return await proposal_service.get_pending_summary(current_user=current_user)


# ---------------------------------------------------------------------------
# Tool 5 — GetTimesheetStatusTool
# ---------------------------------------------------------------------------

class TimesheetStatusInput(BaseModel):
    scope: Literal["own", "org"] = Field(
        default="own",
        description=(
            "'own' returns your personal timesheets for the last 4 weeks. "
            "'org' returns org-wide weekly compliance summary (Manager/Super Admin only; "
            "silently treated as 'own' for Members)."
        ),
    )


class GetTimesheetStatusTool(BaseTool):
    """
    Return timesheet data for the current user (own scope) or the organisation
    (org scope).  Members requesting org scope are silently downgraded to own —
    this avoids confirming whether org-wide data exists, which would be an
    information leak.
    """
    name = "get_timesheet_status"
    description = (
        "Get timesheet status. For 'own' scope: returns your personal timesheets "
        "for the last 4 weeks (status, hours, week). For 'org' scope: returns "
        "org-wide weekly compliance summary (Manager/Super Admin only; Members "
        "automatically receive own-scope data)."
    )
    action = "get_timesheet_status"
    category = "analytics"
    risk_level = RiskLevel.SAFE
    is_write_action = False
    input_schema = TimesheetStatusInput
    output_schema = Any
    # RBAC: intentionally open to all authenticated roles.
    # Scope enforcement is inside execute(): Members are silently downgraded
    # from "org" to "own" rather than erroring, to avoid leaking the existence
    # of org-wide timesheet data.

    async def execute(
        self,
        params: TimesheetStatusInput,
        current_user: dict,
        services: Dict[str, Any],
    ) -> Any:
        timesheet_service = services["timesheet_read_service"]
        role = (current_user.get("role") or "MEMBER").upper()

        # Silent downgrade: a MEMBER requesting "org" gets their own data.
        # We never raise here — raising would confirm org-wide data exists.
        effective_scope = params.scope
        if effective_scope == "org" and role not in ("MANAGER", "SUPER_ADMIN"):
            effective_scope = "own"

        if effective_scope == "org":
            return await timesheet_service.get_org_summary(current_user=current_user)
        else:
            return await timesheet_service.get_own_timesheets(current_user=current_user)
