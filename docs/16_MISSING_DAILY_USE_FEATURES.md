# 16 — Missing Day-to-Day Features & Basic UX Gaps

## 1. Purpose

While [15_SAAS_GAP_ANALYSIS.md](file:///d:/kanban-project/docs/15_SAAS_GAP_ANALYSIS.md) covers enterprise SaaS infrastructure (billing, SSO, compliance), this document focuses on **basic product-level features that everyday users expect** from a modern Kanban/task management tool. These are the gaps that impact daily usability, team collaboration, and user satisfaction — the features that tools like Trello, Linear, Asana, and Jira provide out of the box.

---

## 2. Gap Summary Matrix

| Feature Area | Current State | Expected State | Impact |
|---|---|---|---|
| **Labels / Tags** | **IMPLEMENTED (Migrations 057–059)** | Dynamic board-scoped CRUD labels (`057`-`059`), color picker, tag attachment, real-time WS events, board filter pills bar | **Resolved (Completed)** |
| **Subtasks / Checklists** | **IMPLEMENTED (Migrations 060–062)** | Nested subtasks checklist inside task modal (`060`-`062`), progress bar ratio, drag-to-reorder, instant toggle, task card ratio badge | **Resolved (Completed)** |
| **Task Duplication** | Not implemented | One-click "Duplicate Task" action | **High** |
| **Comment Editing** | **IMPLEMENTED (Migration 064)** | Inline comment editing (`064`), owner-only check, `PATCH /tasks/{id}/comments/{id}`, auto-focus textarea, `(edited)` timestamp | **Resolved (Completed)** |
| **@Mentions in Comments** | **IMPLEMENTED (Migration 065)** | `@user` autocomplete dropdown (`065`), `comment_mentions` junction table, styled chips, real-time WS & in-app notification dispatch | **Resolved (Completed)** |
| **Rich Text Descriptions** | Plain `<textarea>` | Markdown or WYSIWYG editor for task descriptions | **High** |
| **Board Views (List/Calendar)** | Kanban board only | List view, calendar view, table view toggle | **High** |
| **Column Management** | **IMPLEMENTED (Migration 063)** | Dynamic column CRUD (`063`), inline rename, column type selector, reordering handles, ghost card "+ Add Column", atomic card migration on delete | **Resolved (Completed)** |
| **Board Favorites / Pinning** | Not implemented | Star/pin boards to sidebar top | **Medium** |
| **Task Sorting** | No sort controls | Sort by priority, due date, created date, assignee | **High** |
| **Password Reset / Forgot** | **IMPLEMENTED (Migration 055)** | Single-use cryptographic reset tokens via async SMTP email (`/auth/forgot-password`, `/auth/reset-password`) | **Resolved (Completed)** |
| **Email Verification** | **IMPLEMENTED (Migration 055)** | Email verification tokens and async email link dispatch (`/auth/send-verification-email`, `/auth/verify-email`) | **Resolved (Completed)** |
| **File Upload for Attachments** | URL-based `AttachmentCreate` only | Drag-and-drop file upload to task | **High** |
| **WIP Limits** | Not implemented | Configurable work-in-progress limits per column | **Medium** |
| **Task Estimation** | Not implemented | Story points / time estimates on tasks | **Medium** |
| **Swimlanes** | Not implemented | Group tasks by assignee, priority, or label within board | **Medium** |
| **Keyboard Shortcuts** | Only `Cmd+K` for search | Full shortcut set (N=new task, E=edit, ←→ move) | **Medium** |
| **Board/Task Export** | Admin audit log CSV only | Export board tasks to CSV/PDF | **Medium** |
| **Undo/Redo** | Not implemented | Undo last action (move, delete, edit) with toast | **Medium** |
| **Due Date Reminders** | `reminder_at` field exists in schema but no scheduler or notification dispatch | Automated email/in-app reminders before due date | **High** |
| **Reporter Name Resolution** | Shows `User #123` in task sidebar | Resolve and display reporter's actual name/avatar | **Low** |
| **Comment Reactions** | Not implemented | Emoji reactions on comments (👍 ✅ ❤️) | **Low** |
| **Task Cover Images** | Not implemented | Visual cover image on task cards | **Low** |

---

## 3. Detailed Feature Specifications

### 3.1 Labels / Tags System (IMPLEMENTED)

**Current Implementation**: Implemented across database migrations `057_labels_schema.sql`, `058_labels_functions.sql`, `059_labels_view.sql`, backend FastAPI router `labels.py`, frontend API client `labelsApi.ts`, shared components `LabelPicker.tsx`, `LabelFilter.tsx`, and task cards rendering.

#### Implemented Components & Specs:
- **Database Tables**: `labels` (`id`, `board_id`, `name`, `color`, `created_at`), `task_labels` (`task_id`, `label_id`)
- **Canonical Views**: `v_labels_canonical`, `v_task_labels_canonical`, and updated `v_tasks_canonical`
- **Stored Functions**: `fn_create_label`, `fn_delete_label`, `fn_attach_label`, `fn_detach_label`
- **Backend Endpoints**: `GET/POST /boards/{board_id}/labels`, `DELETE /labels/{id}`, `POST/DELETE /tasks/{task_id}/labels/{label_id}` with real-time WebSocket event broadcasting
- **Frontend UI**: Color-coded label tag pills on task cards, `LabelPicker` dropdown in task modal, and `LabelFilter` pills bar on Kanban boards

---

### 3.2 Subtasks / Checklists (IMPLEMENTED)

**Current Implementation**: Implemented across database migrations `060_subtasks_schema.sql`, `061_subtasks_functions.sql`, `062_subtasks_view.sql`, backend router `subtasks.py`, frontend API client `subtasksApi.ts`, component `SubtaskChecklist.tsx`, and `TaskCard.tsx` subtask ratio badge.

#### Implemented Features:
- **Database**: `subtasks` table schema, stored procedures `fn_create_subtask`, `fn_toggle_subtask`, `fn_delete_subtask`, `fn_reorder_subtasks`, view `v_subtasks_canonical`, and `v_tasks_canonical` aggregated `subtask_count` & `completed_subtask_count`.
- **Backend**: `/tasks/{task_id}/subtasks` CRUD and reorder endpoints with real-time WebSocket event broadcasting.
- **Frontend**: Interactive checklist in `TaskDetailsModal` with progress bar, drag-to-reorder via `@dnd-kit/sortable`, inline subtask addition on Enter, instant completion toggles, and ratio badge (`3/5`) on `TaskCard`.

---

### 3.3 Column Management (IMPLEMENTED)

**Current Implementation**: Implemented across database migration `063_column_management_functions.sql`, backend FastAPI router `columns.py`, frontend API client `columnsApi.ts`, and `KanbanBoard.tsx` workspace.

#### Implemented Features:
- **Database**: Stored procedures `fn_add_column`, `fn_rename_column`, `fn_delete_column` (with atomic task card migration to target column), and `fn_reorder_columns`.
- **Backend**: `/boards/{board_id}/columns`, `/boards/{board_id}/columns/reorder`, `/columns/{column_id}` (PATCH/DELETE) endpoints gated by Manager/Superadmin RBAC with real-time WebSocket event broadcasting.
- **Frontend**: Inline column title rename on double-click, column header dropdown menu with type selection, move left/right reordering handles, ghost card "+ Add Column" container, and target column migration selector modal on column deletion.

---

### 3.4 Forgot Password / Password Reset (IMPLEMENTED)

**Current Implementation**: Implemented across migration `055_password_reset_email_verification.sql`, backend `auth.py` router (`/auth/forgot-password`, `/auth/reset-password`), `auth_service.py`, and email notification service.

---

### 3.5 Comment Editing (IMPLEMENTED)

**Current Implementation**: Implemented across database migration `064_comment_editing.sql`, backend FastAPI router `comments.py` (`PATCH /tasks/{task_id}/comments/{comment_id}`), `comment_service.py`, and `CommentsTab.tsx`.

#### Implemented Features:
- **Database**: `fn_update_comment` stored procedure, `edited_at` timestamp in `v_comments_canonical`, and hard delete permissions enforcement in `fn_delete_comment`.
- **Backend**: `PATCH /tasks/{task_id}/comments/{comment_id}` endpoint with owner authorization check and WebSocket `comment_updated` event broadcasting.
- **Frontend**: Pencil edit icon visible for comment author, inline auto-focused textarea editor, keyboard shortcuts (`Enter` to save, `Esc` to cancel), optimistic UI updates, and `(edited)` timestamp badge.

---

### 3.6 @Mentions in Comments (IMPLEMENTED)

**Current Implementation**: Implemented across database migration `065_comment_mentions.sql`, backend `comments.py` router, `comment_service.py`, `notification_service.py`, and frontend `CommentsTab.tsx`.

#### Implemented Features:
- **Database**: `comment_mentions` table, `v_comment_mentions_canonical` view, `fn_create_comment_mentions` procedure, `fn_get_comment_mentions` function, and activity/notification triggers (`COMMENT_MENTIONED`).
- **Backend**: `POST /tasks/{task_id}/comments` parsing `mentioned_user_ids`, real-time WebSocket notification dispatch, and email dispatch to mentioned users.
- **Frontend**: `@` autocomplete suggestions dropdown sourced from board members (`GET /boards/{board_id}/members`), structured token format `@[Full Name](user:id)`, styled clickable chip rendering for mentioned users in comment text, and deep linking from notification items.

---

### 3.7 Rich Text Task Descriptions (High)

**Current State**: [TaskDescription.tsx](file:///d:/kanban-project/frontend/src/features/boards/modals/task-details/TaskDescription.tsx) and [CreateTaskModal.tsx](file:///d:/kanban-project/frontend/src/features/boards/modals/CreateTaskModal.tsx) use a plain `<textarea>` for descriptions.

**Required Implementation**:
- Integrate a lightweight Markdown editor (e.g., `@uiw/react-md-editor` or `tiptap`) 
- Support basic formatting: bold, italic, bullet lists, code blocks, links
- Render markdown in description display mode
- Store raw markdown in database (no schema change needed — `description TEXT` already exists)

---

### 3.8 Task Duplication (High)

**Current State**: No duplicate/copy task functionality anywhere.

**Required Implementation**:
- `POST /tasks/{task_id}/duplicate` — creates a copy with `[Copy] ` title prefix
- Copies: title, description, priority, labels, column, subtasks
- Does NOT copy: comments, attachments, activity history
- Frontend: "Duplicate" option in task detail header dropdown and task card context menu

---

### 3.9 Board Views — List & Calendar (High)

**Current State**: Only Kanban board view exists in [KanbanBoard.tsx](file:///d:/kanban-project/frontend/src/features/boards/components/KanbanBoard.tsx). `TaskCard` has a `variant` prop supporting `'board' | 'list'` but no list view page uses it.

**Required Implementation**:
- View mode toggle in board toolbar: **Board** | **List** | **Calendar**
- **List View**: Table/row layout with sortable columns (title, status, assignee, priority, due date)
- **Calendar View**: Month/week calendar showing tasks by due date
- Persist preferred view mode per board in user preferences

---

### 3.10 Task Sorting & Grouping (High)

**Current State**: Tasks appear in creation order within columns. [AssigneeFilter.tsx](file:///d:/kanban-project/frontend/src/features/boards/components/AssigneeFilter.tsx) and [DueDateFilter.tsx](file:///d:/kanban-project/frontend/src/features/boards/components/DueDateFilter.tsx) exist for filtering, but no sorting controls.

**Required Implementation**:
- Sort dropdown in board toolbar: Priority (High→Low), Due Date (Nearest first), Created Date, Alphabetical
- Sort applies within each column
- Persist sort preference per board

---

### 3.11 File Upload Attachments (High)

**Current State**: [attachments.py](file:///d:/kanban-project/backend/app/routers/attachments.py) accepts `AttachmentCreate` (likely URL-based). No `UploadFile` multipart form handling for actual file uploads in the attachments router, although the user service does handle avatar file uploads via `UploadFile`.

**Required Implementation**:
- `POST /tasks/{task_id}/attachments/upload` — accept `multipart/form-data` with `UploadFile`
- Store in `uploads/attachments/{task_id}/` directory (reuse existing `StorageService` pattern)
- `DELETE /attachments/{attachment_id}` — delete file + DB record
- Frontend: drag-and-drop zone in AttachmentsTab, file preview thumbnails, download links

---

### 3.12 Due Date Reminders (High)

**Current State**: `reminder_at` column exists in the `tasks` table and is included in [TaskCreate](file:///d:/kanban-project/backend/app/schemas/task.py) / [TaskUpdate](file:///d:/kanban-project/backend/app/schemas/task.py) schemas. However, **no background scheduler checks this field** and no reminder notification is ever dispatched.

**Required Implementation**:
- Background scheduled task (cron job or asyncio periodic task) polling `reminder_at` timestamps
- Dispatch in-app notification + optional email when `reminder_at <= NOW()` and not yet sent
- Frontend: reminder date picker in task sidebar (next to due date)
- Mark reminder as sent to avoid duplicate dispatches

---

### 3.13 Email Verification on Signup (High)

**Current State**: No email verification. Users can register and immediately access the workspace.

**Required Implementation**:
- `email_verifications` table: `user_id`, `token_hash`, `expires_at`, `verified_at`
- `POST /auth/verify-email` — accepts token, marks user as verified
- `POST /auth/resend-verification` — resend verification email
- Block access to workspace until email is verified (or show a persistent banner)

---

### 3.14 Reporter Name Resolution (Low)

**Current State**: [TaskSidebar.tsx](file:///d:/kanban-project/frontend/src/features/boards/modals/task-details/TaskSidebar.tsx#L62-L69) displays `User #{task.created_by}` with a numeric ID placeholder instead of the reporter's actual name/avatar.

**Required Fix**:
- Creator fields already exist in the `CanonicalTaskResponse` (`creator_first_name`, `creator_email`, `creator_avatar_url`)
- Frontend fix only: render `task.creator_first_name + task.creator_last_name` and use `UserAvatar` component

---

### 3.15 Board Favorites / Pinning (Medium)

**Required Implementation**:
- `user_board_favorites` table: `user_id`, `board_id`, `created_at`
- `POST/DELETE /boards/{board_id}/favorite` — toggle
- Sidebar: show starred boards at top in a "Favorites" section
- Star icon on board cards in sidebar

---

### 3.16 WIP Limits (Medium)

**Required Implementation**:
- Add `wip_limit` column to `board_columns` table (nullable integer)
- Show limit indicator on column header: `In Progress (3/5)`
- Visual warning (amber) when at limit, error (red) when over
- Configurable via column header dropdown

---

### 3.17 Task Estimation (Medium)

**Required Implementation**:
- Add `story_points` or `estimate_hours` column to `tasks` table
- Estimation field in task sidebar and create task modal
- Column total estimation display in column header
- Include in dashboard KPI calculations

---

### 3.18 Keyboard Shortcuts (Medium)

**Current State**: Only `Cmd+K` search shortcut exists.

**Required Implementation**:
- `N` — new task (when on board)
- `E` — edit selected task
- `Del` / `Backspace` — delete selected task
- `←` `→` — move task between columns
- `?` — show shortcuts help overlay
- `Esc` — close modal/panel

---

### 3.19 Board/Task Export (Medium)

**Required Implementation**:
- `GET /boards/{board_id}/export?format=csv` — export all tasks as CSV
- Optional: PDF export with board summary
- Frontend: export button in board toolbar
- CSV columns: Reference, Title, Status, Assignee, Priority, Due Date, Created, Description

---

### 3.20 Undo/Redo (Medium)

**Required Implementation**:
- Undo toast after destructive actions (task delete, move, status change)
- 5-second "Undo" countdown toast with action reversal
- Client-side action history stack (last 10 actions)

---

## 4. Prioritized Implementation Roadmap

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DAILY-USE FEATURES ROADMAP                               │
├────────────────────────┬────────────────────────┬──────────────────────────┤
│  WAVE 1 (FOUNDATIONS)  │  WAVE 2 (PRODUCTIVITY) │  WAVE 3 (POLISH)        │
│  Target: 1-2 Weeks     │  Target: 2-3 Weeks     │  Target: 2 Weeks        │
├────────────────────────┼────────────────────────┼──────────────────────────┤
│ • Labels / Tags System │ • Rich Text Desc.      │ • Board Favorites       │
│ • Column Management    │ • @Mentions            │ • WIP Limits            │
│ • Forgot Password      │ • Task Duplication     │ • Task Estimation       │
│ • Reporter Name Fix    │ • Board Views (List)   │ • Keyboard Shortcuts    │
│ • Comment Editing      │ • Task Sorting         │ • Board/Task Export     │
│ • File Upload Attach.  │ • Subtasks/Checklists  │ • Undo/Redo            │
│ • Email Verification   │ • Due Date Reminders   │ • Comment Reactions     │
│                        │ • Calendar View        │ • Task Cover Images     │
│                        │ • Swimlanes            │                         │
└────────────────────────┴────────────────────────┴──────────────────────────┘
```

---

## 5. Quick Wins (< 1 Day Each)

These are low-effort fixes that immediately improve perceived quality:

| # | Item | Effort | Files Affected |
|---|------|--------|----------------|
| 1 | **Reporter name resolution** — use `creator_first_name` instead of `User #{id}` | 30 min | `TaskSidebar.tsx` |
| 2 | **Comment edit endpoint** — add `PATCH /comments/{id}` | 2 hrs | `comments.py`, `comment_service.py`, `CommentsTab.tsx` |
| 3 | **Task duplication** — `POST /tasks/{id}/duplicate` | 3 hrs | `tasks.py`, `task_service.py`, task detail header |
| 4 | **Sort within columns** — client-side sort toggle | 3 hrs | `KanbanBoard.tsx`, `taskStore.ts` |
| 5 | **Board export CSV** — `GET /boards/{id}/export` | 4 hrs | New endpoint, board toolbar button |

---

## 6. Relationship to SaaS Gap Analysis

This document is **complementary** to [15_SAAS_GAP_ANALYSIS.md](file:///d:/kanban-project/docs/15_SAAS_GAP_ANALYSIS.md):

| Concern | Doc 15 (SaaS Gaps) | Doc 16 (Daily-Use Gaps) |
|---|---|---|
| **Focus** | Enterprise infrastructure & monetization | Core product usability & features |
| **Audience** | CTO / Platform Engineers | End users / Product Managers |
| **Examples** | Stripe billing, SSO, SCIM, rate limiting | Labels, subtasks, password reset, column mgmt |
| **Priority** | Required for commercial launch | Required for user retention & satisfaction |
| **Dependency** | Many items need Wave 1–3 of this doc first | Independent of SaaS infra |
