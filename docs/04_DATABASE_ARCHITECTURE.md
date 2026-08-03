# 04 — Database Architecture

## 1. Executive Summary & Design Principles

KAIO uses **PostgreSQL 15+** as its relational database store. The database layer strictly enforces separation between public interfaces and underlying data tables:

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
├─────────────────────────────────────────────────────────────┤
│  Canonical Views (v_*_canonical) │ Stored Functions (fn_*)  │
├──────────────────────────────────┴──────────────────────────┤
│                  PostgreSQL Schema Tables                   │
└─────────────────────────────────────────────────────────────┘
```

### Key Principles:
1. **Raw SQL Strict Prohibition**: Backend Python code never issues inline `SELECT`, `INSERT`, `UPDATE`, or `DELETE` statements.
2. **Canonical Views (`v_*_canonical`)**: Application code reads exclusively from standardized view layer objects that combine multi-table joins.
3. **Stored Procedure Mutations (`fn_*`)**: All create, update, and delete actions are wrapped in PostgreSQL PL/pgSQL functions.

### Migration Execution:
Migrations live in `database/migrations/` and are applied via `database/scripts/rebuild.py`:
```powershell
# Apply incrementally (no data loss)
python database/scripts/rebuild.py

# Full reset — drops and recreates public schema, then applies all migrations
python database/scripts/rebuild.py --reset
```

---

## 2. Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    organizations ||--o{ users : "has members"
    organizations ||--o{ boards : "owns"
    organizations ||--o{ organization_invitations : "sends"
    organizations ||--o{ meeting_sessions : "hosts"
    users ||--o{ board_members : "participates in"
    users ||--o{ tasks : "assigned to"
    users ||--o{ comments : "authored by"
    users ||--o{ notifications : "receives"
    users ||--o{ user_preferences : "configures"
    users ||--o{ active_sessions : "has sessions"
    users ||--o{ security_events : "generates events"
    users ||--o{ activity : "performs"
    boards ||--o{ board_members : "has members"
    boards ||--o{ board_columns : "contains columns"
    boards ||--o{ tasks : "contains tasks"
    boards ||--o{ meeting_sessions : "linked to"
    boards ||--o{ labels : "defines"
    board_columns ||--o{ tasks : "holds"
    tasks ||--o{ comments : "has"
    tasks ||--o{ attachments : "has"
    tasks ||--o{ subtasks : "contains"
    tasks ||--o{ task_labels : "tagged with"
    tasks ||--o{ activity : "logged by"
    labels ||--o{ task_labels : "applied via"
    comments ||--o{ comment_mentions : "mentions"
    users ||--o{ comment_mentions : "mentioned in"
    meeting_sessions ||--o{ task_proposals : "generates"

    users {
        int id PK
        string email
        string first_name
        string last_name
        string password_hash
        string role
        int organization_id FK
        string avatar_url
        timestamp deleted_at
    }

    organizations {
        int id PK
        string name
        string slug
    }

    boards {
        int id PK
        int org_id FK
        string name
        string description
        string project_key
        string icon
        string color
        string cover_gradient
        timestamp archived_at
        timestamp deleted_at
    }

    board_columns {
        int id PK
        int board_id FK
        string name
        string column_type
        int position
        timestamp deleted_at
    }

    tasks {
        int id PK
        int board_id FK
        int column_id FK
        string title
        string description
        int assigned_to FK
        string priority
        timestamp due_date
        int position
        timestamp deleted_at
    }

    labels {
        int id PK
        int board_id FK
        string name
        string color
        timestamp deleted_at
    }

    task_labels {
        int task_id FK
        int label_id FK
    }

    subtasks {
        int id PK
        int task_id FK
        string title
        bool is_completed
        int position
        int created_by FK
        timestamp deleted_at
    }

    comment_mentions {
        int id PK
        int comment_id FK
        int mentioned_user_id FK
        timestamp created_at
    }

    meeting_sessions {
        int id PK
        string session_id
        int org_id FK
        string meeting_url
        string status
        timestamp started_at
        timestamp failed_at
    }

    task_proposals {
        int id PK
        int meeting_session_id FK
        int org_id FK
        string title
        string description
        string status
        float confidence_score
        string priority
        timestamp due_date
    }
```

---

## 3. Core Database Tables Catalog

| Migration File | Table / Object | Description |
|---|---|---|
| `001_extensions.sql` | Extensions | Enables `uuid-ossp`, `pgcrypto` extensions. |
| `002_enums.sql` | Enums | Enums for `user_role`, `task_priority`, `task_status`, `session_status`. |
| `003_schema_core.sql` | `organizations`, `users`, `boards`, `board_columns`, `board_members`, `tasks`, `comments`, `attachments`, `activity` | Core schema tables for tenancy, authentication, board management, tasks, and audit logs. |
| `004_indexes.sql` | Indexes | Performance indexes on foreign keys, email lookups, task status, column ordering. |
| `005_functions_authz.sql` | Authz Functions | Functions verifying user permissions (`fn_check_board_access`, etc.). |
| `006_functions_mutations.sql` | Mutation Functions | Core mutation functions (`fn_create_task`, `fn_move_task`, `fn_update_task`, etc.). |
| `007_triggers.sql` | Triggers | Updated-at timestamps & automated audit trail triggers. |
| `008_views.sql` | Views | Initial canonical views (`v_users_canonical`, `v_boards_canonical`, `v_tasks_canonical`). |
| `009_seed_data.sql` | Seed Data | Initial development seed data. |
| `010_admin_functions.sql` | Admin Functions | Platform admin management functions. |
| `011_invitation_functions.sql` | `organization_invitations` | Workspace member invitation PL/pgSQL procedures and table. |
| `012_authz_refinements.sql` | Security Updates | Fine-grained access control updates. |
| `013_fix_task_authz.sql` | Security Patch | Authorization bug fixes for task item access. |
| `014_notification_enhancements.sql` | `notifications` | Notification storage table and unread counters. |
| `015_account_security.sql` | Security Tables | Failed login tracking & account lockout constraints. |
| `016_user_preferences.sql` | `user_preferences` | User UI theme, notification channels, & preferences. |
| `017_appearance_updates.sql` | Appearance | Custom UI layout settings. |
| `018_organization_profile.sql` | `organization_profile` | Organization profile metadata & branding options. |
| `019_project_settings.sql` | `project_settings` | Board project configurations (icon, color, key, cover_gradient). |
| `020_update_user_profile.sql` | User Profiles | Extended user profile fields (first_name, last_name, avatar_url). |
| `021_task_proposals_schema.sql` | `task_proposals` | AI-generated action items proposal schema. |
| `022_task_proposals_view.sql` | `v_task_proposals_canonical` | Canonical view aggregating proposal details. |
| `023_task_proposals_functions.sql` | Proposal Functions | Stored functions to create, update, approve (`fn_approve_task_proposal`), and reject proposals. |
| `024_task_proposals_hardening.sql` | Security Hardening | `fn_check_proposal_review_access` permission guard for proposal approval queue. |
| `025_task_proposals_nullable_board.sql` | Board Nullability | Permits meeting proposals prior to board assignment. |
| `026_meeting_sessions_org_scope.sql` | Org Scoping | `org_id` added to `meeting_sessions`; scopes sessions strictly to organization tenants. |
| `027_task_proposals_priority_due_date.sql` | Proposal Metadata | Adds `priority` and `due_date` fields to task proposals. |
| `028_users_email_unique.sql` | Constraints | Case-insensitive unique constraint on email addresses. |
| `029_comment_functions.sql` | Comment Procedures | `fn_create_comment`, `fn_delete_comment` stored functions. |
| `030_activity_logging_enhancements.sql` | Audit Trail | Enhanced activity logging, `v_activities_canonical` view. |
| `031_notification_canonical_enhancements.sql` | Notification Views | `v_notifications_canonical` updated with entity target type and deep-link payloads. |
| `032_revoke_invitation_function.sql` | Invitation Revocation | `revoke_invitation(p_invitation_id, p_org_id)` — deletes pending invitations. |
| `032_seed_techinnovators.sql` | Seed Data | TechInnovators workspace demo dataset (users, boards, tasks, members). |
| `033_seed_latest_meeting.sql` | Seed Data | Latest meeting session transcript & task proposals seed data. |
| `034_security_event_functions.sql` | `security_events` | `fn_log_security_event()` stored function + `v_user_security_events_canonical` view. |
| `035_auth_session_functions.sql` | `active_sessions` | `fn_refresh_session()`, `fn_revoke_session()`, `fn_is_session_revoked()` + `v_user_active_sessions_canonical` view. |
| `036_dashboard_views.sql` | Dashboard Views | `v_dashboard_kpis_canonical` (org KPIs) + `v_dashboard_board_summaries_canonical` (per-board summaries). |
| `037_timesheet_enums.sql` | Timesheet Enums | Defines `timesheet_status_enum`, `timesheet_entry_type_enum`, `timesheet_overtime_policy_enum`, `week_start_day_enum`. |
| `038_timesheet_policy_schema.sql` | `timesheet_policies` | Organization-level timesheet policy settings (standard hours, overtime thresholds, lockouts). |
| `039_timesheet_core_schema.sql` | Core Timesheet Tables | Core schema tables: `timesheets`, `timesheet_entries`, `timesheet_approver_assignments`, `timesheet_audit_logs`. |
| `040_timesheet_indexes.sql` | Indexes | Performance indexes on `user_id`, `org_id`, `week_start_date`, `board_id`, `status`. |
| `041_timesheet_functions.sql` | Timesheet Functions | Stored functions (`fn_create_timesheet`, `fn_upsert_timesheet_entry`, `fn_submit_timesheet`, `fn_approve_timesheet`, `fn_reject_timesheet`, etc.). |
| `042_timesheet_triggers.sql` | Triggers | Updated-at timestamps & automated audit trail triggers for timesheets. |
| `043_timesheet_views.sql` | Canonical Views | `v_timesheets_canonical`, `v_timesheet_entries_canonical`, `v_timesheet_policy_canonical`, `v_timesheet_approver_assignments_canonical`, `v_timesheet_audit_canonical`. |
| `044_timesheet_reports_views.sql` | Report Views | `v_timesheet_org_summary_canonical`, `v_timesheet_board_hours_canonical`, `v_timesheet_member_summary_canonical`. |
| `045_simplify_timesheet_approvers.sql` | Approver Simplification | Simplified approver lookup and active status resolution (`fn_get_eligible_approvers`). |
| `046_enforce_task_assignment_timesheets.sql` | Task Assignment Check | Enforces that task-based time logging is restricted to assigned task owners. |
| `047_fix_rejected_timesheet_status.sql` | Status & Workflow Fix | Fixes status transition rules for rejected/recalled timesheets and resubmission. |
| `048_timesheet_row_locking.sql` | Row-Level Locking | Implements row locking (`FOR UPDATE`) for timesheet actions and re-validates task owner assignments on submission (`TASK_ASSIGNMENT_CHANGED`). |
| `049_meeting_session_fail_status.sql` | Meeting Failure Procedure | Adds `failed_at` timestamp column to `meeting_sessions` and `fn_fail_meeting_session` stored procedure. |
| `050_meeting_session_rerun.sql` | Meeting Rerun Reset | Adds `fn_reset_meeting_session_status` stored procedure to reset failed session status to `PROCESSING` and clear `failed_at`. |
| `051_global_search_view.sql` | Global Search View | Creates `v_global_search_canonical` indexing tasks, boards, and meetings for full-text search. |
| `052_bulk_task_operations.sql` | Bulk Task Operations | Adds `fn_bulk_move_tasks` for multi-select task moves across columns and `fn_bulk_delete_tasks` for multi-task atomic soft-deletion. |
| `053_notification_target_reference_with_title.sql` | Target Reference Titles | Enhances `v_activities_canonical` to format task `target_reference` with project key, sequence ID, and task title (e.g. `ENG-24 Fix Auth Service`), and rebuilds `v_notifications_canonical`. |
| `054_task_deletion_notifications_cleanup.sql` | Task Deletion & Notification Cleanup | Adds `fn_delete_task` procedure for atomic task soft deletion, comment soft deletion, and notification purging; updates `v_activities_canonical` & `v_notifications_canonical` to exclude soft-deleted tasks/comments. |
| `055_password_reset_email_verification.sql` | Password Reset & Email Verification | `password_reset_tokens` & `email_verification_tokens` tables schema, `fn_create_password_reset_token`, `fn_reset_password`, `fn_create_email_verification_token`, `fn_verify_email` procedures. |
| `056_dashboard_performance_optimization.sql` | Dashboard Performance Indexes | Creates composite indexes on tasks, activities, and board memberships for instant dashboard KPI rendering. |
| `057_labels_schema.sql` | `labels`, `task_labels` | Board labels taxonomy table (`labels`) and task-label mapping junction table (`task_labels`). |
| `058_labels_functions.sql` | Label Procedures | Stored functions: `fn_create_label`, `fn_delete_label`, `fn_attach_label`, `fn_detach_label` with board ownership & permissions check. |
| `059_labels_view.sql` | Label Canonical Views | `v_labels_canonical`, `v_task_labels_canonical`, and updated `v_tasks_canonical` aggregating array of assigned label objects. |
| `060_subtasks_schema.sql` | `subtasks` | Subtasks table schema for task checklists (`task_id`, `title`, `is_completed`, `position`, `created_by`, `deleted_at`). |
| `061_subtasks_functions.sql` | Subtask Procedures | Stored functions: `fn_create_subtask`, `fn_toggle_subtask`, `fn_delete_subtask`, `fn_reorder_subtasks` with board access check. |
| `062_subtasks_view.sql` | Subtask Canonical Views | `v_subtasks_canonical` view and updated `v_tasks_canonical` exposing aggregated `subtask_count` and `completed_subtask_count`. |
| `063_column_management_functions.sql` | Column Management Functions | Stored functions for adding, renaming, deleting (with task re-assignment), and reordering board columns. |
| `064_comment_editing.sql` | Comment Editing & Hard Delete | Adds `edited_at` timestamp to `task_comments`, updates `v_comments_canonical`, adds `fn_update_comment` procedure, and updates `fn_delete_comment` for hard delete & owner-only check. |
| `065_comment_mentions.sql` | `comment_mentions` | Table schema for user @mentions in task comments (`comment_id`, `mentioned_user_id`, `created_at`), `v_comment_mentions_canonical` view, `fn_create_comment_mentions` procedure, `fn_get_comment_mentions` function, and activity/notification triggers. |

---

## 4. Stored Functions & Views Catalog

### 4.1 Canonical View Layer

| View Name | Source Migration | Description |
|---|---|---|
| `v_users_canonical` | `008_views.sql` | User profile combined with organization role. |
| `v_boards_canonical` | `008_views.sql` | Board details with member counts and task counts. |
| `v_tasks_canonical` | `008_views.sql` | Task attributes combined with assignee details, comment/attachment counts, label objects array, subtask counts. |
| `v_comments_canonical` | `008_views.sql` / `064_*.sql` / `065_*.sql` | Task comments with author metadata, parent comment reference, `edited_at` timestamp, and `mentioned_users` JSON array. |
| `v_comment_mentions_canonical` | `065_comment_mentions.sql` | User @mentions in comments joined with mentioned user details and comment metadata. |
| `v_task_proposals_canonical` | `022_task_proposals_view.sql` | Proposal details with confidence scores and source transcript snippets. |
| `v_notifications_canonical` | `031_*.sql` / `054_*.sql` / `065_*.sql` | Notifications with target entity type, deep-link payload, and target title reference (includes `COMMENT_MENTIONED` events; strictly excludes deleted tasks/comments). |
| `v_activities_canonical` | `030_*.sql` / `054_*.sql` / `065_*.sql` | Org-scoped activity log with actor names, action descriptions, and task titles in `target_reference` (strictly excludes deleted tasks/comments). |
| `v_user_active_sessions_canonical` | `035_*.sql` | Multi-device active JWT session details (user agent, IP, last active). |
| `v_user_security_events_canonical` | `034_*.sql` | Security audit log of authentication and authorization events. |
| `v_dashboard_kpis_canonical` | `036_*.sql` | Org-wide KPIs: total tasks by status, overdue, boards, team size, pending proposals, active meetings. |
| `v_dashboard_board_summaries_canonical` | `036_*.sql` | Per-board: task count, completed task count, completion %, overdue count, member count. |
| `v_timesheets_canonical` | `043_*.sql` | Timesheet details with submitter metadata, status, total hours, and review info. |
| `v_timesheet_entries_canonical` | `043_*.sql` | Time log entries with board & task titles, entry dates, hours, and overtime flags. |
| `v_timesheet_policy_canonical` | `043_*.sql` | Organization timesheet configuration policy rules. |
| `v_timesheet_approver_assignments_canonical` | `043_*.sql` | Active approver assignments linking managers to submitters/orgs. |
| `v_timesheet_audit_canonical` | `043_*.sql` | Complete audit trail log of timesheet state transitions (submit, approve, reject, recall). |
| `v_timesheet_org_summary_canonical` | `044_*.sql` | Weekly org-wide timesheet submission & compliance summary analytics. |
| `v_timesheet_board_hours_canonical` | `044_*.sql` | Board-level hours logging distribution report. |
| `v_timesheet_member_summary_canonical` | `044_*.sql` | Member-level compliance, logged hours, and submission timeliness metrics. |
| `v_global_search_canonical` | `051_global_search_view.sql` | Global workspace search index combining tasks, boards, and meetings with full-text search vector and title matching. |
| `v_labels_canonical` | `059_labels_view.sql` | Board taxonomy labels with usage counts across active tasks. |
| `v_subtasks_canonical` | `062_subtasks_view.sql` | Task subtasks/checklists with completion status, position, and author info. |

### 4.2 Authz & Mutation Functions

| Function | Source Migration | Description |
|---|---|---|
| `fn_check_board_access(user_id, board_id)` | `005_*.sql` | Boolean: does this user have access to this board? |
| `fn_create_task(...)` | `006_*.sql` | Atomically creates a task card and records audit log. |
| `fn_move_task(task_id, new_column_id, new_position)` | `006_*.sql` | Atomically moves task to column and position. |
| `fn_delete_task(task_id, user_id)` | `054_task_deletion_notifications_cleanup.sql` | Atomically soft-deletes a task and its comments, and purges all associated notifications across all users. |
| `fn_bulk_move_tasks(task_ids, target_column_id, user_id)` | `052_bulk_task_operations.sql` | Atomically moves multiple selected task cards into a target board column. |
| `fn_bulk_delete_tasks(task_ids, user_id)` | `052_bulk_task_operations.sql` | Atomically soft-deletes multiple task cards, their comments, and purges associated notifications. |
| `fn_approve_task_proposal(proposal_id, board_id, reviewer_id)` | `023_*.sql` | Converts approved proposal into a Kanban task card. |
| `fn_reject_task_proposal(proposal_id, reviewer_id)` | `023_*.sql` | Marks proposal status as `rejected`. |
| `fn_check_proposal_review_access(user_id, org_id)` | `024_*.sql` | Boolean: is this user a Manager or Superadmin in this org? |
| `fn_check_meeting_initiation_access(user_id, org_id)` | `026_*.sql` | Boolean: is this user authorized to start a meeting? |
| `fn_create_comment(...)` | `029_*.sql` | Creates a comment on a task. |
| `fn_update_comment(comment_id, content, user_id, org_id)` | `064_comment_editing.sql` | Updates a comment's text and sets `edited_at = NOW()` (owner-only check). |
| `fn_delete_comment(comment_id, user_id, user_role, org_id)` | `029_*.sql` / `064_*.sql` | Permanently deletes a comment record from database (owner-only check). |
| `fn_create_comment_mentions(...)` | `065_comment_mentions.sql` | Inserts comment mention records, creates `COMMENT_MENTIONED` notification and activity log records for each mentioned user. |
| `fn_get_comment_mentions(comment_id)` | `065_comment_mentions.sql` | Returns JSON array of mentioned users for a specific comment. |
| `fn_create_subtask(task_id, title, user_id)` | `061_subtasks_functions.sql` | Creates a new subtask row for a task. |
| `fn_toggle_subtask(subtask_id, user_id)` | `061_subtasks_functions.sql` | Toggles `is_completed` on a subtask row. |
| `fn_delete_subtask(subtask_id, user_id)` | `061_subtasks_functions.sql` | Soft-deletes a subtask row. |
| `fn_reorder_subtasks(task_id, ordered_ids, user_id)` | `061_subtasks_functions.sql` | Reorders subtask positions for a task. |
| `fn_add_column(board_id, name, column_type, position, user_id)` | `063_column_management_functions.sql` | Creates a new column on a board at a specified position. |
| `fn_rename_column(column_id, name, column_type, user_id)` | `063_column_management_functions.sql` | Updates column name and/or type. |
| `fn_delete_column(column_id, target_column_id, user_id)` | `063_column_management_functions.sql` | Migrates tasks to target column, then soft-deletes the column. |
| `fn_reorder_columns(board_id, ordered_column_ids, user_id)` | `063_column_management_functions.sql` | Reorders all board columns atomically. |
| `fn_refresh_session(user_id, token, user_agent, ip)` | `035_*.sql` | Upserts an active session record. |
| `fn_revoke_session(session_id, user_id)` | `035_*.sql` | Marks session as revoked. |
| `fn_is_session_revoked(session_id)` | `035_*.sql` | Returns `true` if session is revoked (called on every authenticated request). |
| `fn_log_security_event(...)` | `034_*.sql` | Logs a security event (login, logout, session revoke, password change, role update). |
| `revoke_invitation(p_invitation_id, p_org_id)` | `032_revoke_invitation_function.sql` | Deletes a pending invitation by ID (org-scoped). |
| `fn_create_timesheet(user_id, org_id, week_start_date)` | `041_*.sql` | Creates a draft timesheet record for the specified week. |
| `fn_upsert_timesheet_entry(...)` | `041_*.sql` | Creates or updates a time entry row on a draft timesheet. |
| `fn_delete_timesheet_entry(entry_id, user_id)` | `041_*.sql` | Deletes a specific entry from a draft timesheet. |
| `fn_submit_timesheet(...)` | `041_*.sql` | Submits a draft timesheet for approval and logs audit action. |
| `fn_recall_timesheet(...)` | `041_*.sql` | Recalls a submitted timesheet back to draft status. |
| `fn_approve_timesheet(...)` | `041_*.sql` | Approves a submitted timesheet and locks it. |
| `fn_reject_timesheet(...)` | `041_*.sql` | Rejects a timesheet with mandatory feedback comment, reverting status to draft. |
| `fn_assign_timesheet_approver(...)` | `041_*.sql` | Designates a Manager as an organization approver. |
| `fn_remove_timesheet_approver(...)` | `041_*.sql` | Removes an approver assignment. |
| `fn_upsert_timesheet_policy(...)` | `041_*.sql` | Updates organization timesheet policy settings. |
| `fn_check_timesheet_approver_access(user_id, timesheet_id)` | `041_*.sql` | Boolean: does this user have approver rights for this timesheet? |
| `fn_fail_meeting_session(session_id)` | `049_*.sql` | Updates meeting session status to `FAILED` and sets `failed_at = NOW()`. |
| `fn_reset_meeting_session_status(session_id)` | `050_*.sql` | Resets meeting session status to `PROCESSING` and clears `failed_at` for pipeline rerun. |

---

## 5. Migration Execution & Maintenance

Migrations are SQL files in `database/migrations/` applied alphabetically by `database/scripts/rebuild.py`:

```
001_extensions.sql
002_enums.sql
003_schema_core.sql
004_indexes.sql
005_functions_authz.sql
006_functions_mutations.sql
007_triggers.sql
008_views.sql
009_seed_data.sql
010_admin_functions.sql
011_invitation_functions.sql
012_authz_refinements.sql
013_fix_task_authz.sql
014_notification_enhancements.sql
015_account_security.sql
016_user_preferences.sql
017_appearance_updates.sql
018_organization_profile.sql
019_project_settings.sql
020_update_user_profile.sql
021_task_proposals_schema.sql
022_task_proposals_view.sql
023_task_proposals_functions.sql
024_task_proposals_hardening.sql
025_task_proposals_nullable_board.sql
026_meeting_sessions_org_scope.sql
027_task_proposals_priority_due_date.sql
028_users_email_unique.sql
029_comment_functions.sql
030_activity_logging_enhancements.sql
031_notification_canonical_enhancements.sql
032_revoke_invitation_function.sql
032_seed_techinnovators.sql
033_seed_latest_meeting.sql
034_security_event_functions.sql
035_auth_session_functions.sql
036_dashboard_views.sql
037_timesheet_enums.sql
038_timesheet_policy_schema.sql
039_timesheet_core_schema.sql
040_timesheet_indexes.sql
041_timesheet_functions.sql
042_timesheet_triggers.sql
043_timesheet_views.sql
044_timesheet_reports_views.sql
045_simplify_timesheet_approvers.sql
046_enforce_task_assignment_timesheets.sql
047_fix_rejected_timesheet_status.sql
048_timesheet_row_locking.sql
049_meeting_session_fail_status.sql
050_meeting_session_rerun.sql
054_task_deletion_notifications_cleanup.sql
055_password_reset_email_verification.sql
056_dashboard_performance_optimization.sql
057_labels_schema.sql
058_labels_functions.sql
059_labels_view.sql
060_subtasks_schema.sql
061_subtasks_functions.sql
062_subtasks_view.sql
063_column_management_functions.sql
064_comment_editing.sql
065_comment_mentions.sql
```

### Stored Procedures for Column Management (`063_column_management_functions.sql`)
- `fn_add_column(p_board_id, p_name, p_column_type, p_position, p_user_id)`: Creates a new column for a board, setting position and logging activity. Manager/Superadmin authorized.
- `fn_rename_column(p_column_id, p_name, p_column_type, p_user_id)`: Updates name and/or column_type of a column, logging activity. Manager/Superadmin authorized.
- `fn_delete_column(p_column_id, p_target_column_id, p_user_id)`: Atomically migrates all tasks from the column to `p_target_column_id`, soft-deletes the column row (`deleted_at = CURRENT_TIMESTAMP`), re-indexes active column positions, and logs activity.
- `fn_reorder_columns(p_board_id, p_ordered_column_ids[], p_user_id)`: Reorders columns according to array order and updates position values atomically.

### Stored Procedures for Comment Mentions (`065_comment_mentions.sql`)
- `fn_create_comment_mentions(comment_id, mentioned_user_ids[], actor_id)`: Inserts rows in `comment_mentions`, generates `COMMENT_MENTIONED` notification events, and logs user activity.

> [!NOTE]
> File `032_revoke_invitation_function.sql` and `032_seed_techinnovators.sql` share the `032_` prefix. They are both applied; the rebuild script sorts alphabetically so `032_revoke_invitation_function.sql` runs before `032_seed_techinnovators.sql`.
