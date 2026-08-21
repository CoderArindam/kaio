# AI Subsystem Audit — `app/ai/`

> **Scope**: Read-only audit of the KAI AI agent subsystem.
> **No code changes were made.**
> **Date**: 2026-08-21

---

## 1. Tool Inventory — `app/ai/tools/`

There are five source files defining **15 tools** across four logical categories.

---

### 1.1 `base.py` — `BaseTool` (abstract)

Not a usable tool itself; it is the common base class all tools inherit from. Key properties declared at this level:

| Property | Purpose |
|---|---|
| `required_roles` | Optional list of allowed role strings (`MANAGER`, `SUPER_ADMIN`). `None` = all authenticated roles. |
| `risk_level` | `RiskLevel` enum (`SAFE`, `MEDIUM`, `HIGH`). Read by `Executor` to gate confirmation. |
| `is_write_action` | Boolean flag marking state-mutating tools. Currently unused beyond a `# Future` stub. |
| `action` | Abstract action name used by `Executor` to look up the tool at runtime. |

The `run()` method on `BaseTool` is the **single centralised RBAC enforcement point** for all tools — it checks `required_roles` before calling `execute()` and delegates to `ToolTelemetryTracker` after execution.

---

### 1.2 `workspace_tools.py` — Read-only Workspace Tools

| Tool Class | `name` / `action` | What it does | DB Object Called | RBAC (`required_roles`) |
|---|---|---|---|---|
| `ListBoardsTool` | `list_boards` / `list_projects` | Lists all boards visible to the current user. | `board_service.get_user_boards()` → reads `v_boards_canonical` | None (all roles) |
| `ListTasksTool` | `list_tasks` | Lists/filters tasks for one or all boards; supports status, assignee, priority, overdue filters. | `task_service.get_board_tasks()` → reads `v_tasks_canonical` | None (all roles) |
| `GetWorkspaceUsersTool` | `get_workspace_users` / `get_users` | Returns all org members (name, email). | `user_service.get_all_users()` → reads `v_users_canonical` | None (all roles) |
| `GetTaskTool` | `get_task` / `get_task_details` | Fetches full detail of a single task by ID or fuzzy name. | `task_service.get_task()` → reads `v_tasks_canonical` | None (all roles) |
| `GetBoardSummaryTool` | `get_board_summary` | Computes task-count stats per board (by status, priority, overdue, members). | `task_service.get_board_tasks()` + `board_service.get_board_members()` | None (all roles) |

**Observations:**
- All five tools are read-only (`is_write_action = False` by default).
- None declares `required_roles`, meaning any authenticated user can invoke them.
- Org scoping is **implicitly enforced** by passing `current_user` into every service call; services read from canonical views that filter by `org_id`. There is no explicit `org_id` parameter in tool signatures — it flows through `current_user["organization_id"]`.

---

### 1.3 `domain_tools.py` — Mutating Domain Tools

| Tool Class | `name` / `action` | What it does | DB Object Called | RBAC (`required_roles`) | `risk_level` |
|---|---|---|---|---|---|
| `CreateTaskTool` | `create_task` | Creates a new task in a board column; resolves board/column/assignee by name; fires WS broadcast and optional assignment notification. | `task_service.create_task()` → `fn_create_task(...)` | `["MANAGER", "SUPER_ADMIN"]` | `SAFE` |
| `UpdateTaskTool` | `update_task` | Updates title, description, status (column), priority, assignee, or due date; fires WS broadcast. | `task_service.update_task()` + `update_task_assignee()` → `fn_update_task(...)` | `["MANAGER", "SUPER_ADMIN"]` | `SAFE` |
| `DeleteTaskTool` | `delete_task` | Soft-deletes a task; fires WS broadcast. | `task_service.delete_task()` → `fn_delete_task(task_id, user_id)` | `["MANAGER", "SUPER_ADMIN"]` | `HIGH` |
| `CreateBoardTool` | `create_board` | Creates a new Kanban board in the organisation. | `board_service.create_board()` → underlying board mutation stored proc | `["MANAGER", "SUPER_ADMIN"]` | `SAFE` |
| `ArchiveBoardTool` | `archive_board` | Archives a board. | `board_service.archive_project(board_id, current_user)` | `["MANAGER", "SUPER_ADMIN"]` | `HIGH` |
| `DeleteBoardTool` | `delete_board` | Permanently soft-deletes a board and all its tasks. | `board_service.delete_board(board_id, current_user)` | `["MANAGER", "SUPER_ADMIN"]` | `HIGH` |
| `AddCommentTool` | `add_comment` / `comment_added` | Posts a comment on a task. | `comment_service.create_comment()` → `fn_create_comment(...)` | **None (all roles)** | `SAFE` |
| `GetCommentsTool` | `get_comments` | Retrieves all comments for a task. | `comment_service.get_task_comments()` → `v_comments_canonical` | **None (all roles)** | `SAFE` |

**Observations:**
- The six board/task mutation tools correctly gate themselves behind `MANAGER` or `SUPER_ADMIN`.
- `AddCommentTool` and `GetCommentsTool` have no `required_roles` — this is intentional (all members can comment), but it means `MEMBER`-role accounts can post comments via KAI without restriction.
- `DeleteTaskTool`, `ArchiveBoardTool`, and `DeleteBoardTool` carry `risk_level = RiskLevel.HIGH`. The `Executor` uses this to inject a `confirmation_required` SSE event before executing (see §2). However, this gate exists only in the `Executor`; the `BaseTool.run()` method contains a `# Future` stub for write-action pre-flight checks that is **not yet implemented**.

---

### 1.4 `profile_tools.py` — User Profile Tools

| Tool Class | `name` / `action` | What it does | DB Object Called | RBAC |
|---|---|---|---|---|
| `UpdateProfileTool` | `update_profile` | Updates the authenticated user's `first_name` / `last_name`. | `user_service.update_me()` → stored proc via `/users/me` service path | None (all roles — scoped to self) |
| `GetMyProfileTool` | `get_my_profile` | Returns the `current_user` dict directly (first_name, last_name, email). No DB round-trip. | **None** — reads from in-memory `current_user` dict | None |

**Observations:**
- Both tools operate exclusively on the authenticated user's own data; cross-user manipulation is not possible by design.
- `GetMyProfileTool` does not hit the database at all; it reflects JWT claims already in `current_user`.

---

### 1.5 `appearance_tools.py` — Preferences/Appearance Tools

| Tool Class | `name` / `action` | What it does | DB Object Called | RBAC |
|---|---|---|---|---|
| `UpdateAppearanceTool` | `update_appearance` / `appearance_updated` | Updates the user's theme, accent colour, sidebar theme, and sidebar collapsed state. Normalises colour aliases (`purple` → `indigo`, etc.). | `preferences_service.update_preferences()` → stored proc for user preferences | None (all roles — scoped to self) |
| `GetMyAppearanceTool` | `get_my_appearance` / `appearance_fetched` | Returns current theme/colour/sidebar preferences. | `preferences_service.get_preferences(user_id)` | None |

---

## 2. Agent Tool Invocation — `app/ai/agents/`

### 2.1 Agent Structure

There is a single concrete agent: **`WorkspaceAssistantAgent`** (`workspace_assistant.py`), inheriting from `BaseAgent`. It holds a static list `available_tools` containing all 15 tool classes as class references (not instances).

### 2.2 Invocation Pipeline — Central Dispatcher

The invocation flow is **centralised through the `Executor`**, not through the agent itself:

```
POST /api/v1/ai/chat
  └─ AIService.chat_stream()
      ├─ IntentRouter.classify()          → CONVERSATIONAL | KNOWLEDGE | WORKSPACE_ACTION
      └─ [If WORKSPACE_ACTION]
          ├─ Planner.create_plan()        → LLM produces ExecutionPlan with ordered steps
          ├─ PlanValidator.validate()     → checks required fields exist
          └─ Executor.execute()           → central dispatcher loop
              └─ for each step in plan:
                  ├─ action_to_tool[step.action]   ← tool lookup by name/action
                  ├─ risk_level check               ← optional confirmation gate
                  └─ tool_instance.run(validated_args, current_user, services)
                      ├─ BaseTool.run():
                      │   ├─ required_roles RBAC check
                      │   └─ tool_instance.execute()
                      └─ ToolTelemetryTracker.record_tool_execution()
```

**Key findings:**

1. **No per-tool RBAC self-check** inside `execute()`. All role enforcement is concentrated in `BaseTool.run()`, which is always called by the `Executor` via `tool_instance.run()`.

2. **Risk-level confirmation gate in `Executor`**: if a tool's `risk_level` is `MEDIUM` or `HIGH` and `skip_confirmation=False`, the executor emits a `confirmation_required` SSE event and halts. The frontend must resend with `confirmed_plan` set.

3. **`confirmed_plan` bypass**: When `request.confirmed_plan` is present, `chat_service` immediately wraps it as `ExecutionPlan` and calls `Executor` with `skip_confirmation=True`, bypassing the risk-level gate. This is the intended confirmation flow, but **there is no server-side re-validation that the confirmed plan is identical to the plan that triggered confirmation**. A modified client could alter the plan before resubmitting.

4. **`action_to_tool` dispatch map** is keyed by both `tool_cls.action` and `tool_cls.name`. An LLM could potentially select a tool by either key, though both always resolve to the same tool class.

---

## 3. Org-ID Scoping Analysis

### 3.1 How `org_id` Reaches Tools

`org_id` is **never passed as an explicit parameter** to any tool's `execute()` method. It flows exclusively via `current_user`:

```
JWT cookie
  → get_current_user() dependency
  → current_user dict: {"id": ..., "organization_id": ..., "role": ...}
  → ExecutionContext.current_user = current_user
  → Executor passes current_user into tool_instance.run()
  → Each service receives current_user
  → Service passes org_id / user_id into canonical views / stored functions
  → DB enforces org isolation at stored-function/view level
```

### 3.2 Per-Tool Org Scoping Assessment

| Tool | Org Scoping Mechanism | Risk |
|---|---|---|
| `ListBoardsTool` | `board_service.get_user_boards(current_user=current_user)` → `v_boards_canonical` filters by `org_id` | ✅ Safe |
| `ListTasksTool` | `task_service.get_board_tasks(..., current_user=current_user)` → view is org-scoped | ✅ Safe |
| `GetWorkspaceUsersTool` | `user_service.get_all_users(current_user=current_user)` → scoped to org | ✅ Safe |
| `GetTaskTool` | `task_service.get_task(task_id, current_user)` → `fn_check_board_access` enforced inside service | ✅ Safe |
| `GetBoardSummaryTool` | Same as `ListTasksTool` path | ✅ Safe |
| `CreateTaskTool` | `task_service.create_task(task_in, current_user)` → `fn_create_task` uses `org_id` from session | ✅ Safe |
| `UpdateTaskTool` | `task_service.update_task(...)` with `current_user` | ✅ Safe |
| `DeleteTaskTool` | `task_service.delete_task(task_id, current_user)` → `fn_delete_task(task_id, user_id)` validates ownership at DB level | ✅ Safe |
| `CreateBoardTool` | `board_service.create_board(board_in, current_user)` | ✅ Safe |
| `ArchiveBoardTool` | `board_service.archive_project(board_id, current_user)` | ✅ Safe |
| `DeleteBoardTool` | `board_service.delete_board(board_id, current_user)` | ✅ Safe |
| `AddCommentTool` | `comment_service.create_comment(task_id, comment_in, current_user)` | ✅ Safe |
| `GetCommentsTool` | `comment_service.get_task_comments(task_id, current_user)` | ✅ Safe |
| `UpdateProfileTool` | `user_service.update_me(updates, current_user)` — always the caller's own record | ✅ Safe |
| `GetMyProfileTool` | Reads `current_user` dict directly — no DB query, no cross-org access possible | ✅ Safe |
| `UpdateAppearanceTool` | `preferences_service.update_preferences(user_id=current_user["id"], ...)` — user-scoped | ✅ Safe |
| `GetMyAppearanceTool` | `preferences_service.get_preferences(current_user["id"])` | ✅ Safe |

### 3.3 Cross-Org Query Risk: None Found

No tool accepts an arbitrary external `org_id`. All org isolation flows through `current_user` into services and ultimately into DB stored functions and canonical views.

**One subtlety to note**: The fuzzy `resolve_task_id()` helper in `domain_tools.py` performs a cross-board search when no `board_id` is specified (lines 157–170). It calls `board_service.get_user_boards()` first, so it can only iterate boards that `current_user` has access to. A user cannot inadvertently reach tasks in another org through this path.

---

## 4. `ClarificationRouter` — `app/ai/orchestration/clarification_router.py`

### 4.1 What It Does

`ClarificationRouter` handles the **follow-up turn** after the system has already paused due to missing required fields in a plan. It is **not** involved in classifying new intents (that is `IntentRouter`'s job).

**Trigger flow:**
1. `Planner` produces a plan with one or more missing required fields.
2. `PlanValidator.validate()` raises `MissingInformationError`.
3. `chat_service` emits a `pending_clarification` SSE event (containing the partial plan and `missing_fields`) and halts.
4. On the user's **next message**, `chat_service._extract_history_state()` reads the saved pending plan from conversation history.
5. If a pending plan exists, `ClarificationRouter.resolve()` is called.

**LLM classification**: `ClarificationRouter` sends the pending plan + missing fields + user reply to the LLM and expects one of:

| Decision | Meaning | Outcome |
|---|---|---|
| `RESUME` | User supplied the missing info | Returns `updated_plan` with fields populated; `chat_service` feeds it back into the execution pipeline |
| `CANCEL` | User wants to abort | Emits "Okay, cancelled." and stops |
| `NEW_INTENT` | User changed subject entirely | Falls through to a fresh planning cycle |

### 4.2 Does It Gate Destructive Actions?

**No.** `ClarificationRouter` is purely for **missing-field resolution**. It has no awareness of `risk_level` and does not evaluate whether the action being resumed is destructive.

The destructive-action confirmation gate is handled separately and upstream in the **`Executor`** (via the `risk_level` check that emits `confirmation_required`). These are two entirely separate mechanisms:

- **`ClarificationRouter`** → resolves **what** to do (fills missing arguments, resolves ambiguous intent).
- **`Executor` risk gate** → confirms **whether** to do it (for `MEDIUM` / `HIGH` risk tools).

---

## 5. Telemetry — `app/ai/telemetry/`

### 5.1 Architecture

```
Code → telemetry_bus.publish(EventType, **kwargs)
    → TelemetryEvent (Pydantic model, in-memory only)
    → [registered TelemetrySink list]
    → ConsoleLoggerSink (currently the only registered sink — stdout/log)
```

The bus is a **global in-memory singleton**. There are no persistent sinks (no database, no file, no external observability service) registered by default.

### 5.2 What Is Recorded

#### `RequestTracer` (`tracer.py`)
- Emits `REQUEST_STARTED` with `start_time`.
- Emits `REQUEST_COMPLETED` with: duration, total LLM calls, total tokens, tools executed, services invoked, retries, status.
- Emits `ERROR_OCCURRED` on unhandled exceptions.
- **`user_id` is NOT embedded in `RequestTracer` events.** It lives only in `ExecutionContext`.

#### `TraceContext` (`context.py`) + `Span` context manager
- Per-request `contextvars` store: `request_id`, `execution_id`, `span_id`, aggregate counters.
- Every logical unit of work emits `SPAN_STARTED` / `SPAN_COMPLETED` (with `name`, `component`, `duration_ms`, `status`).
- Errors emit an additional `ERROR_OCCURRED` (with `component`, `message`, `exception_type`).
- **Tool arguments and tool results are never included in span metadata.**

#### `ToolTelemetryTracker` (`tracker.py`)
- Called by `BaseTool.run()` after every tool execution.
- Records: `tool_name`, `agent_name`, `latency_ms`, `success`, `error` (string on failure).
- **No `user_id`, no `org_id`, no input arguments, and no output/result are logged.**

#### `ConsoleLoggerSink` (`sinks.py`) — Output Behaviour

| Log Level | What Is Emitted |
|---|---|
| `ERROR` | Error message, component, exception type |
| `INFO` | Full request summary at `REQUEST_COMPLETED` (aggregate metrics) |
| `DEBUG` | Individual `SPAN_COMPLETED`, `LLM_CALL_COMPLETED`, `TOOL_EXECUTION_COMPLETED`, `RETRY_OCCURRED` events |
| `TRACE` | Full execution tree with span hierarchy and LLM call details (provider, model, prompt_id, token count) |

### 5.3 Gap Analysis — What Is NOT Logged

| Audit Requirement | Current State |
|---|---|
| **Which user triggered which tool call** | ❌ Not logged. `user_id` is in `ExecutionContext` and gateway calls but never emitted as a telemetry field on tool execution events. |
| **What arguments were passed to each tool** | ❌ Not logged. `step.arguments` are never published to the telemetry bus. |
| **What result a tool returned** | ❌ Not logged. `tool_output` is not published. Only success/failure and latency are recorded by `ToolTelemetryTracker`. |
| **Which org the call was scoped to** | ❌ Not logged in telemetry events (present in `ExecutionContext.organization_id`, never emitted to the bus). |
| **Tool input validation failures** | ❌ Not recorded as discrete events; caught by `Executor` and turned into `execution_failed` SSE events only. |
| **Persistent audit trail** | ❌ No database sink. All telemetry is stdout/log only and ephemeral — lost on process restart. |

### 5.4 What IS Available

- Per-request aggregate metrics (LLM call count, total tokens, tool count, latency).
- Span-level timing and error messages for each logical pipeline stage.
- Tool name, success/failure, and latency per invocation (via `ToolTelemetryTracker`).
- LLM provider, model, prompt ID, and token counts at `DEBUG`/`TRACE` log levels.

---

## 6. Summary of Findings

| Area | Finding | Severity |
|---|---|---|
| **Tool RBAC** | Centralised in `BaseTool.run()`. All board/task write tools correctly require `MANAGER` or `SUPER_ADMIN`. `AddCommentTool` intentionally open to all roles. | Low |
| **Destructive action confirmation gate** | `Executor` correctly pauses `HIGH`-risk tools (`delete_task`, `archive_board`, `delete_board`). `confirmed_plan` bypass is client-controlled — **no server-side diff/re-validation** that the confirmed plan matches the original. | Medium |
| **Org-ID scoping** | No tool accepts an arbitrary `org_id`. All scoping flows implicitly through `current_user` into services and DB stored functions. Cross-org access is not possible via any current tool. | Low (no current risk) |
| **ClarificationRouter** | Purely a missing-field resolver. Does not evaluate or gate destructive actions. Destructive confirmation is a separate `Executor`-level mechanism. | Informational |
| **Telemetry — user identity** | Tool executions are not tagged with `user_id` or `org_id` in telemetry events. Cannot answer "who ran what" without correlating `request_id` back to HTTP access logs. | High (forensics gap) |
| **Telemetry — tool arguments / results** | Neither input arguments nor output results are recorded. No way to replay or audit what data was actually mutated via KAI. | High (compliance gap) |
| **Telemetry — persistence** | No persistent sink registered. All telemetry is ephemeral stdout. No audit trail survives process restart. | High (compliance gap) |
| **`is_write_action` pre-flight hook** | Property exists on `BaseTool` but the actual pre-flight check is a `# Future` stub — not implemented. | Low (structural) |
