# 16 — Missing Day-to-Day Features & Basic UX Gaps

## 1. Purpose

While [15_SAAS_GAP_ANALYSIS.md](file:///d:/kanban-project/docs/15_SAAS_GAP_ANALYSIS.md) covers enterprise SaaS infrastructure (billing, SSO, compliance), this document focuses on **basic product-level features that everyday users expect** from a modern Kanban/task management tool. These are the gaps that impact daily usability, team collaboration, and user satisfaction — the features that tools like Trello, Linear, Asana, and Jira provide out of the box.

---

## 2. Gap Summary Matrix

| Feature Area | Current State | Expected State | Impact |
|---|---|---|---|
| **Labels / Tags** | Hardcoded placeholder UI (`backend`, `auth`, `bug`), no database support | Dynamic CRUD labels with colors, assignable to tasks, filterable | **Critical** |
| **Subtasks / Checklists** | Not implemented | Nested subtasks or checkbox checklists within a task | **Critical** |
| **Task Duplication** | Not implemented | One-click "Duplicate Task" action | **High** |
| **Comment Editing** | Create and delete only | Edit existing comments inline | **High** |
| **@Mentions in Comments** | Not implemented | Tag users with `@name`, trigger notifications | **High** |
| **Rich Text Descriptions** | Plain `<textarea>` | Markdown or WYSIWYG editor for task descriptions | **High** |
| **Board Views (List/Calendar)** | Kanban board only | List view, calendar view, table view toggle | **High** |
| **Column Management** | Fixed columns from board creation, no UI to add/rename/delete/reorder | Dynamic column CRUD + drag-to-reorder | **Critical** |
| **Board Favorites / Pinning** | Not implemented | Star/pin boards to sidebar top | **Medium** |
| **Task Sorting** | No sort controls | Sort by priority, due date, created date, assignee | **High** |
| **Password Reset / Forgot** | Not implemented — no recovery flow | Email-based "Forgot Password" + reset token | **Critical** |
| **Email Verification** | Not implemented | Verify email on signup before granting access | **High** |
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

### 3.1 Labels / Tags System (Critical)

**Current State**: [TaskSidebar.tsx](file:///d:/kanban-project/frontend/src/features/boards/modals/task-details/TaskSidebar.tsx#L77-L91) renders hardcoded labels (`backend`, `authentication`, `bug`) with `cursor-not-allowed` and `opacity-70`. The "Add Label" button is disabled. No database table, no API, no stored function.

**Required Implementation**:

#### Database
- `labels` table: `id`, `board_id`, `name`, `color` (hex), `created_at`
- `task_labels` junction table: `task_id`, `label_id`
- Canonical view: `v_task_labels_canonical`
- Functions: `fn_create_label`, `fn_delete_label`, `fn_attach_label`, `fn_detach_label`

#### Backend
- `POST /boards/{board_id}/labels` — create label
- `DELETE /labels/{label_id}` — delete label
- `POST /tasks/{task_id}/labels/{label_id}` — attach
- `DELETE /tasks/{task_id}/labels/{label_id}` — detach
- Include labels array in `CanonicalTaskResponse`

#### Frontend
- Label picker dropdown in task sidebar replacing hardcoded list
- Label pills rendered on `TaskCard` in board view
- Board-level label management UI (create, edit color, delete)
- Filter tasks by label in board toolbar

---

### 3.2 Subtasks / Checklists (Critical)

**Current State**: No subtask concept exists anywhere in the codebase.

**Required Implementation**:

#### Database
- `subtasks` table: `id`, `task_id`, `title`, `is_completed`, `position`, `created_by`, `created_at`
- Function: `fn_create_subtask`, `fn_toggle_subtask`, `fn_delete_subtask`, `fn_reorder_subtasks`

#### Backend
- CRUD endpoints under `/tasks/{task_id}/subtasks`
- Include `subtask_count` and `completed_subtask_count` in `CanonicalTaskResponse`

#### Frontend
- Checklist section in task detail modal (between description and tabs)
- Progress bar showing `3/5 completed`
- Subtask completion count badge on `TaskCard`
- Drag-to-reorder subtask items

---

### 3.3 Column Management (Critical)

**Current State**: Columns are created during board creation via [fn_create_board](file:///d:/kanban-project/database/migrations/003_schema_core.sql) with fixed defaults (To Do, In Progress, Done). No UI exists to add, rename, delete, or reorder columns after board creation.

**Required Implementation**:

#### Database
- Functions: `fn_add_column`, `fn_rename_column`, `fn_delete_column` (with task migration), `fn_reorder_columns`

#### Backend
- `POST /boards/{board_id}/columns` — add column
- `PATCH /columns/{column_id}` — rename + set `column_type`
- `DELETE /columns/{column_id}` — delete (must specify target column for existing tasks)
- `POST /boards/{board_id}/columns/reorder` — update positions

#### Frontend
- "Add Column" button at end of kanban board
- Column header inline rename on double-click
- Column header dropdown: rename, change type (TODO/IN_PROGRESS/DONE), delete, set WIP limit
- Drag columns to reorder

---

### 3.4 Forgot Password / Password Reset (Critical)

**Current State**: [auth.py](file:///d:/kanban-project/backend/app/routers/auth.py) has login, register, refresh, logout, sessions, and security events — but **no password reset or forgot password flow**. No matching grep results for `forgot_password` or `reset_password`.

**Required Implementation**:

#### Database
- `password_reset_tokens` table: `id`, `user_id`, `token_hash`, `expires_at`, `used_at`, `created_at`
- Function: `fn_create_password_reset_token`, `fn_consume_password_reset_token`

#### Backend
- `POST /auth/forgot-password` — accepts email, sends reset link via email service
- `POST /auth/reset-password` — accepts token + new password, validates token, updates password hash

#### Frontend
- "Forgot Password?" link on login page
- Reset password form (enter email → check inbox → enter new password)

---

### 3.5 Comment Editing (High)

**Current State**: [comments.py](file:///d:/kanban-project/backend/app/routers/comments.py) supports `POST` (create) and `DELETE` only. No `PATCH` endpoint for editing.

**Required Implementation**:
- `PATCH /comments/{comment_id}` — update comment content
- `fn_update_comment` stored function with `edited_at` timestamp
- Frontend: edit button on own comments, inline editing, "edited" indicator

---

### 3.6 @Mentions in Comments (High)

**Current State**: Comments are plain text. [CommentsTab.tsx](file:///d:/kanban-project/frontend/src/features/boards/modals/task-details/tabs/CommentsTab.tsx) has no mention parsing or autocomplete.

**Required Implementation**:
- `@username` autocomplete dropdown in comment input, sourced from board members
- Parse `@` references on submit, create notification for mentioned users
- Render mentions as styled, clickable chips in comment display

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
