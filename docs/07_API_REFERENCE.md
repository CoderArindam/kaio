# 07 — API Reference

## 1. Executive Summary

All KAIO REST API endpoints are served by FastAPI under prefix `/api/v1`. All protected endpoints require a valid `access_token` **httpOnly cookie** (set during login/register). The frontend never manually attaches `Authorization` headers — cookies are sent automatically via `withCredentials: true` on the Axios client.

> [!IMPORTANT]
> **Auth Mechanism**: httpOnly cookies, NOT `Authorization: Bearer` headers.
> - `access_token` cookie: 15-minute lifetime, httpOnly, SameSite=lax
> - `refresh_token` cookie: 7-day lifetime, httpOnly, SameSite=lax, path=`/api/v1/auth`

**Standard Success Envelope** (most endpoints):
```json
{ "data": { ... } }
```

**Standard Error Format**:
```json
{
  "detail": "Session not found",
  "error_code": "RESOURCE_NOT_FOUND",
  "timestamp": "2026-07-21T18:45:00Z"
}
```

---

## 2. Authentication Router (`/api/v1/auth`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/auth/register` | `POST` | Public | Registers a new **organization** with an owner (Superadmin) account. Sets `access_token` + `refresh_token` cookies. Body: `{org_name, admin_email, password, first_name, last_name}`. |
| `/auth/login` | `POST` | Public | Authenticates user credentials. Sets `access_token` + `refresh_token` cookies. Logs `user_login` security event. Body: `{email, password}`. |
| `/auth/me` | `GET` | Cookie | Returns full user profile — id, email, first_name, last_name, role, organization_id, avatar_url, is_email_verified. |
| `/auth/refresh` | `POST` | Cookie (`refresh_token`) | Reads `refresh_token` cookie, issues new `access_token` + `refresh_token` cookies. |
| `/auth/logout` | `POST` | Cookie | Revokes current session, clears both cookies. Body is empty. |
| `/auth/forgot-password` | `POST` | Public | Requests password reset email link. Generates single-use token and dispatches async email. Body: `{email}`. |
| `/auth/reset-password` | `POST` | Public | Resets user password using single-use token. Body: `{token, new_password}`. |
| `/auth/send-verification-email` | `POST` | Cookie | Dispatches email verification link to logged-in user. |
| `/auth/verify-email` | `GET` | Public | Verifies email address using query parameter token (`?token=...`). |
| `/auth/sessions` | `GET` | Cookie | Lists all active multi-device sessions for current user (`v_user_active_sessions_canonical`). Marks current session. |
| `/auth/sessions/other` | `DELETE` | Cookie | Revokes all sessions except the currently active one. Logs security event. |
| `/auth/security-events` | `GET` | Cookie | Retrieves user security event audit history (`v_user_security_events_canonical`). |
| `/auth/password-policy` | `GET` | Public | Returns org password complexity requirements (min_length, require_uppercase, etc.). |

---

## 3. Boards Router (`/api/v1/boards`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/boards` | `GET` | Cookie | Lists all boards accessible to the user in their active organization. |
| `/boards` | `POST` | Cookie | Creates a new Kanban board. |
| `/boards/{id}` | `GET` | Cookie | Fetches board details including columns and task cards (`v_boards_canonical`). |
| `/boards/{id}` | `PUT` | Cookie (RBAC) | Updates board metadata (name, description). Requires Manager/Admin role. |
| `/boards/{id}` | `DELETE` | Cookie (RBAC) | Soft-deletes a board and all contained tasks. Requires Manager/Admin role. |
| `/boards/{board_id}/proposals` | `GET` | Cookie (RBAC) | Lists all pending task proposals for a board's meetings. Requires Manager/Admin. |

---

## 4. Labels Router (`/api/v1`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/boards/{board_id}/labels` | `GET` | Cookie | Lists all customizable color-coded labels created for a specific board (`v_labels_canonical`). |
| `/boards/{board_id}/labels` | `POST` | Cookie | Creates a new board label (`fn_create_label`). Broadcasts `label_created` WS event to board members. Body: `{name, color}`. |
| `/labels/{label_id}` | `DELETE` | Cookie | Deletes a board label (`fn_delete_label`). Requires board membership access. |
| `/tasks/{task_id}/labels/{label_id}` | `POST` | Cookie | Attaches a label tag to a task (`fn_attach_label`). Broadcasts `task_updated` WS event. |
| `/tasks/{task_id}/labels/{label_id}` | `DELETE` | Cookie | Detaches a label tag from a task (`fn_detach_label`). Broadcasts `task_updated` WS event. |

---

## 5. Board Members Router (`/api/v1/boards`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/boards/{board_id}/members` | `GET` | Cookie | Lists board members with their roles and avatars. |

---

## 6. Tasks Router (`/api/v1/tasks`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/tasks` | `POST` | Cookie | Creates a new task card in a specific board column (`fn_create_task`). |
| `/tasks/{id}` | `GET` | Cookie | Fetches detailed task information (`v_tasks_canonical`). |
| `/tasks/{id}` | `PUT` | Cookie | Updates task title, description, assignee, priority, or due date. |
| `/tasks/{id}/move` | `POST` | Cookie | Atomically moves task to a new column and position (`fn_move_task`). |
| `/tasks/bulk-move` | `POST` | Cookie | Atomically moves multiple tasks into a target column (`fn_bulk_move_tasks`). Body: `{task_ids: number[], column_id: number}`. |
| `/tasks/bulk-delete` | `POST` | Cookie (Manager+) | Atomically soft-deletes multiple tasks, task comments, and associated notifications (`fn_bulk_delete_tasks`). Body: `{task_ids: number[]}`. |
| `/tasks/{id}` | `DELETE` | Cookie | Soft-deletes a task card (`fn_delete_task`). |

| `/tasks/{id}/attachments` | `POST` | Cookie | Uploads a file attachment to a task. Stored on local disk at `uploads/`. |

---

## 6. Comments Router (`/api/v1/tasks`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/tasks/{task_id}/comments` | `POST` | Cookie | Creates a comment on a task (`fn_create_comment`). Accepts optional `mentioned_user_ids: number[]`. Inserts mention history into `comment_mentions` (`fn_create_comment_mentions`), dispatches `MENTIONED_IN_COMMENT` notifications, real-time WebSocket events, and email notifications to assignees/parents. |
| `/tasks/{task_id}/comments/{comment_id}` | `PATCH` | Cookie | Updates an existing comment (`fn_update_comment`). Owner-only access, sets `edited_at = NOW()`. Body: `{content: string}`. |
| `/tasks/{task_id}/comments` | `GET` | Cookie | Lists all comments for a task (surfaces `edited_at` timestamp and `mentioned_users` JSON array). |
| `/comments/{comment_id}` | `DELETE` | Cookie | Permanently deletes a comment from database (`fn_delete_comment`, owner-only access). |

---

## 7. Subtasks Router (`/api/v1`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/tasks/{task_id}/subtasks` | `GET` | Cookie | Lists all subtasks for a task ordered by position (`v_subtasks_canonical`). |
| `/tasks/{task_id}/subtasks` | `POST` | Cookie | Creates a new subtask row (`fn_create_subtask`). Broadcasts `task_updated` WS event to board members. Body: `{title}`. |
| `/subtasks/{subtask_id}/toggle` | `PATCH` | Cookie | Toggles `is_completed` status of a subtask (`fn_toggle_subtask`). Broadcasts `task_updated` WS event. |
| `/subtasks/{subtask_id}` | `DELETE` | Cookie | Soft-deletes a subtask (`fn_delete_subtask`). Broadcasts `task_updated` WS event. |
| `/tasks/{task_id}/subtasks/reorder` | `POST` | Cookie | Reorders subtasks position (`fn_reorder_subtasks`). Broadcasts `task_updated` WS event. Body: `{ordered_ids: number[]}`. |


---

## 7. Notifications Router (`/api/v1/notifications`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/notifications` | `GET` | Cookie | Lists user notifications with unread badge count (`v_notifications_canonical`). |
| `/notifications/{id}/read` | `PUT` | Cookie | Marks a single notification as read. |
| `/notifications/read-all` | `PUT` | Cookie | Marks all notifications for current user as read. |

---

## 8. Activity Router (`/api/v1/activity`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/activity` | `GET` | Cookie | Lists recent org audit log events (`v_activities_canonical`). |

---

## 9. Invitations Router (`/api/v1/invitations`)

All invitation endpoints require **Manager or Superadmin** role (`require_manager_or_above`).

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/invitations` | `POST` | Cookie (Manager+) | Sends a workspace invitation email to a new user. Dispatches email in background. Body: `{email, role}`. |
| `/invitations` | `GET` | Cookie (Manager+) | Lists all pending/accepted invitations for the current organization. |
| `/invitations/{invitation_id}` | `DELETE` | Cookie (Manager+) | Revokes a **pending** invitation by ID (`revoke_invitation` stored function). Returns `204 No Content`. |
| `/invitations/verify/{token}` | `GET` | Public | Verifies an invitation token and returns invitation detail (email, org name, role). |
| `/invitations/accept` | `POST` | Public | Accepts invitation — creates the invited user account. Body: `{token, password, first_name, last_name}`. |

---

## 10. Organization Router (`/api/v1/organization`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/organization` | `GET` | Cookie | Retrieves active organization profile and member list. |
| `/organization/settings` | `PUT` | Cookie (RBAC) | Updates organization settings & security rules. Requires Manager/Admin. |

---

## 11. Admin Router (`/api/v1/admin`)

All admin endpoints require **Superadmin** role unless noted.

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/admin/users` | `GET` | Cookie (Superadmin) | Lists all users in the organization. |
| `/admin/users` | `POST` | Cookie (Superadmin) | Creates a new user account directly (no invitation required). |
| `/admin/users/{user_id}/role` | `PATCH` | Cookie (Superadmin) | Updates a user's role (`MEMBER`, `MANAGER`, `SUPER_ADMIN`). |
| `/admin/users/{user_id}` | `DELETE` | Cookie (Superadmin) | Deletes (deactivates) a user account. Returns `204 No Content`. |
| `/admin/boards` | `GET` | Cookie (Superadmin) | Lists all boards in the organization (admin view). |
| `/admin/boards/{board_id}/members` | `POST` | Cookie (Manager+) | Assigns a user to a board. |
| `/admin/boards/{board_id}/members/{user_id}` | `DELETE` | Cookie (Superadmin) | Removes a user from a board. |
| `/admin/boards/{board_id}/members` | `GET` | Cookie (Superadmin) | Lists members of a specific board (admin view). |
| `/admin/system-status` | `GET` | Cookie (Superadmin) | Returns system health metrics, DB connection status, active workers, and pipeline status. |
| `/admin/audit-logs/export` | `GET` | Cookie (Superadmin) | Exports administrative security events and audit log entries in CSV format. |

---

## 12. My Work Router (`/api/v1/my-work`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/my-work/summary` | `GET` | Cookie | Returns personal work metrics — total assigned tasks, tasks by status, overdue count. |
| `/my-work/tasks` | `GET` | Cookie | Lists tasks assigned to current user. Query params: `due` (all/today/week/overdue), `sort` (due/priority/created), `limit` (1–100, default 50), `offset` (default 0). |

---

## 13. Preferences Router (`/api/v1/preferences`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/preferences` | `GET` | Cookie | Fetches user UI theme and notification preferences (`user_preferences`). |
| `/preferences` | `PUT` | Cookie | Updates user preference settings (theme, notification channels). |

---

## 14. Users Router (`/api/v1/users`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/users` | `GET` | Cookie | Lists users in the current organization (for assignee selector dropdowns). |
| `/users/me` | `PATCH` | Cookie | Updates current user's profile fields (first_name, last_name, avatar_url). |

---

## 15. Dashboard Router (`/api/v1/dashboard`)

Requires **Manager or Superadmin** role (`require_proposal_review_access`).

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/dashboard/summary` | `GET` | Cookie (RBAC) | Returns org KPIs (`v_dashboard_kpis_canonical`), per-board summaries (`v_dashboard_board_summaries_canonical`), and last 10 activity events (`v_activities_canonical`). |

**Response Schema**:
```json
{
  "data": {
    "kpis": {
      "total_tasks": 42,
      "tasks_by_status": { "todo": 10, "in_progress": 15, "review": 8, "done": 9 },
      "overdue_tasks": 3,
      "total_boards": 5,
      "team_size": 12,
      "pending_proposals_count": 7,
      "active_meetings_count": 1
    },
    "boards": [
      {
        "id": 1, "name": "Backend Sprint", "task_count": 14,
        "completed_task_count": 9, "completion_percentage": 64.3,
        "overdue_count": 2, "member_count": 4
      }
    ],
    "recent_activity": [ ... ]
  }
}
```

---

## 16. Meeting Orchestration Router (`/api/v1/meeting`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/meeting/join` | `POST` | Cookie (RBAC) | Launches Playwright bot to join Google Meet URL. Requires Superadmin or Manager role. |
| `/meeting/leave` | `POST` | Cookie | Triggers bot teardown, flushes WebM, and runs pipeline. |
| `/meeting/status/{session_id}` | `GET` | Cookie | Queries active runtime session state (`JOINING`, `RECORDING`, `PROCESSING`, `PROPOSALS_READY`, `FAILED`). |
| `/meeting/transcript/{session_id}` | `GET` | Cookie | Returns completed `participant_attributed_transcript.json`. |
| `/meeting/sessions/{session_id}/transcript` | `PUT` | Cookie (RBAC) | Updates transcript turns and speaker attributions post-meeting. |
| `/meeting/sessions` | `GET` | Cookie | Lists meeting sessions for current organization (`v_meeting_sessions_canonical`). Accepts optional `limit` query param. |
| `/meeting/{session_id}/rerun` | `POST` | Cookie (RBAC) | Resets session status from `FAILED` back to `PROCESSING` and triggers background pipeline rerun using stored audio. |

---

## 17. Extension Presence Router (`/api/v1/presence`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/presence/register` | `POST` | Token | Handshake registration endpoint for Chrome Extension. |
| `/presence/session/{session_id}/events` | `POST` | Token | Receives presence events (`ParticipantJoined`, `ParticipantLeft`, `ParticipantRenamed`). |
| `/presence/session/{session_id}/health` | `GET` | Token | Extension connection health status. |

---

## 18. Task Proposals Router (`/api/v1`)

All proposal review endpoints require **Superadmin or Manager** permission (`fn_check_proposal_review_access`).

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/meeting/{session_id}/proposals` | `GET` | Cookie (RBAC) | Lists AI task proposals for a meeting session ordered by confidence score. |
| `/proposals/{id}` | `GET` | Cookie (RBAC) | Fetches detail for a single task proposal. |
| `/proposals/{id}` | `PUT` | Cookie (RBAC) | Edits title, description, suggested assignee, priority, or target `board_id` for a proposal. |
| `/proposals/{id}/approve` | `POST` | Cookie (RBAC) | Atomically approves proposal and creates Kanban task card (`fn_approve_task_proposal`). Returns `422 BOARD_REQUIRED` if target board is unassigned. |
| `/proposals/{id}/reject` | `POST` | Cookie (RBAC) | Rejects task proposal (`fn_reject_task_proposal`). |

---

## 19. AI Router (`/api/v1/ai`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/ai/chat` | `POST` | Cookie | Sends a message to the KAI AI agent for board/task assistance. |

---

## 20. Health & Root

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/health` | `GET` | Public | Returns `{"status": "healthy", "service": "KAIO API", "version": "1.0.0"}`. |
| `/` | `GET` | Public | Returns welcome message with `/docs` link. |
| `/uploads/{filename}` | `GET` | Static | Serves uploaded attachment files from `backend/uploads/` directory. |

---

## 21. Timesheets Router (`/api/v1/timesheets`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/timesheets` | `GET` | Cookie | Lists timesheets with role-based visibility scoping (`status`, `week_start_date`, `user_id`, `scope`). Regular members see their own; Managers/Superadmins see authorized scope. |
| `/timesheets` | `POST` | Cookie | Creates a new draft timesheet for the authenticated user for target week (`week_start_date`). |
| `/timesheets/{timesheet_id}` | `GET` | Cookie | Retrieves complete timesheet detail with entries and audit log (`v_timesheets_canonical`, `v_timesheet_entries_canonical`). Gated by owner or approver access. |
| `/timesheets/{timesheet_id}/entries` | `POST` | Cookie (Owner) | Adds or updates a time entry row on a draft timesheet (`fn_upsert_timesheet_entry`). Enforces task assignment matching if linked to a task. |
| `/timesheets/{timesheet_id}/entries/{entry_id}` | `DELETE` | Cookie (Owner) | Deletes a specific time entry from a draft timesheet (`fn_delete_timesheet_entry`). |
| `/timesheets/{timesheet_id}/submit` | `POST` | Cookie (Owner) | Submits draft timesheet for approval (`fn_submit_timesheet`). Dispatches submission notification to configured approver/managers. |
| `/timesheets/{timesheet_id}/recall` | `POST` | Cookie (Owner) | Recalls a submitted timesheet back to draft status (`fn_recall_timesheet`), providing a reason string. |

---

## 22. Timesheet Approvals Router (`/api/v1/timesheets/approvals`)

All approval endpoints require **Superadmin or Manager** role (`_check_superadmin_or_manager`).

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/timesheets/approvals/queue` | `GET` | Cookie (RBAC) | Lists submitted timesheets pending manager review for the active organization (`status`, `board_id` filtering). |
| `/timesheets/approvals/queue/summary` | `GET` | Cookie (RBAC) | Returns manager queue metrics: pending count, approved this week, rejected this week, avg hours approved, oldest pending days. |
| `/timesheets/{timesheet_id}/approve` | `POST` | Cookie (RBAC) | Approves a submitted timesheet (`fn_approve_timesheet`). Locks timesheet and notifies submitter. |
| `/timesheets/{timesheet_id}/reject` | `POST` | Cookie (RBAC) | Rejects a submitted timesheet (`fn_reject_timesheet`), requiring a feedback comment. Reverts status to draft for revision and notifies submitter. |

---

## 23. Timesheet Admin & Policy Router (`/api/v1/timesheets`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/timesheets/policy` | `GET` | Cookie | Fetches organization timesheet policy settings (`week_start_day`, `standard_hours_per_day`, `max_hours_per_day`, `overtime_policy`, `require_task_link`, etc.). |
| `/timesheets/policy` | `PUT` | Cookie (Superadmin) | Updates organization timesheet policy settings (`fn_upsert_timesheet_policy`). Gated strictly to Superadmin role. |
| `/timesheets/approvers` | `GET` | Cookie (RBAC) | Lists active approver assignments (`v_timesheet_approver_assignments_canonical`). Requires Manager or Superadmin role. |
| `/timesheets/approvers/eligible` | `GET` | Cookie | Lists eligible approvers configured for timesheet submission dropdown selection. |
| `/timesheets/approvers/managers` | `GET` | Cookie (Superadmin) | Lists all organization managers with their active approver status (Superadmin management UI). |
| `/timesheets/approvers` | `POST` | Cookie (Superadmin) | Designates a Manager as a global organization approver (`fn_assign_timesheet_approver`). |
| `/timesheets/approvers/{assignment_id}` | `DELETE` | Cookie (Superadmin) | Removes an approver assignment (`fn_remove_timesheet_approver`). |
| `/timesheets/reports/org-summary` | `GET` | Cookie (RBAC) | Weekly org-wide timesheet submission & compliance summary analytics (`v_timesheet_org_summary_canonical`). |
| `/timesheets/reports/board-hours` | `GET` | Cookie (RBAC) | Board hours breakdown report (`v_timesheet_board_hours_canonical`). |
| `/timesheets/reports/member-compliance` | `GET` | Cookie (Superadmin) | Member compliance and submission timeliness report (`v_timesheet_member_summary_canonical`). |
| `/timesheets/{timesheet_id}/lock` | `POST` | Cookie (Superadmin) | Toggles or updates row-level lock status (`locked`, `locked_at`, `locked_by`) for a timesheet. |
| `/timesheets/export` | `GET` | Cookie (Superadmin) | Exports detailed organization timesheet effort report data in CSV format. |

---

## 24. Global Search Router (`/api/v1`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/search` | `GET` | Cookie | Workspace-wide full-text and title search querying `v_global_search_canonical`. Params: `q` (query string), `limit` (max results, default 10, max 50). Returns matching tasks, boards, and meetings for active organization. |

---

## 25. WebSocket Connection Endpoint (`/api/v1/ws`)

| Endpoint | Protocol | Auth | Description |
|---|---|---|---|
| `/ws` | `WebSocket` | Query Token (`?token=...`) | Bidirectional real-time event socket for board updates and unread notification alerts. |

### Message Protocols:

#### Client Outgoing Messages:
- **Board Room Subscription**:
  ```json
  { "type": "subscribe_board", "board_id": 12 }
  ```
- **Board Room Unsubscription**:
  ```json
  { "type": "unsubscribe_board", "board_id": 12 }
  ```
- **Connection Heartbeat**:
  ```json
  { "type": "ping" }
  ```

#### Server Incoming Events:
- **Board Task, Column & Comment Mutations**:
  ```json
  {
    "type": "task_created" | "task_updated" | "task_moved" | "task_deleted" | "column_created" | "column_updated" | "column_deleted" | "column_reordered" | "comment_updated",
    "board_id": 12,
    "task_id": 105,
    "comment_id": 42,
    "action": "created" | "updated" | "deleted"
  }
  ```
- **Direct Notification Push**:
  ```json
  {
    "type": "notification",
    "notification": { "id": 88, "activity_type": "TASK_ASSIGNED", "activity_target_reference": "ENG-24 Fix Auth Service" }
  }
  ```
---

## 26. Column Management Router (`/api/v1`)

All column mutation endpoints are gated by **Manager or Superadmin** authorization (`require_manager_or_above`).

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/boards/{board_id}/columns` | `POST` | Cookie (Manager+) | Creates a new column on a board using `fn_add_column(board_id, name, column_type, position, user_id)`. Broadcasts `column_created` WS event. |
| `/boards/{board_id}/columns/reorder` | `POST` | Cookie (Manager+) | Reorders columns on a board using `fn_reorder_columns(board_id, ordered_column_ids, user_id)`. Broadcasts `column_reordered` WS event. Body: `{ordered_column_ids: int[]}`. |
| `/columns/{column_id}` | `PATCH` | Cookie (Manager+) | Updates column name or column_type using `fn_rename_column(column_id, name, column_type, user_id)`. Broadcasts `column_updated` WS event. |
| `/columns/{column_id}` | `DELETE` | Cookie (Manager+) | Soft-deletes column using `fn_delete_column(column_id, target_column_id, user_id)` after migrating all existing tasks to `target_column_id`. Broadcasts `column_deleted` WS event. Body: `{target_column_id: int}`. |

