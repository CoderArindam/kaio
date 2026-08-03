# 10 — Code Execution Flow

## 1. Executive Summary

This document contains Mermaid sequence diagrams tracing key user interactions and system execution paths across KAIO.

> [!IMPORTANT]
> All authenticated requests use **httpOnly cookie-based auth**. The `access_token` cookie is automatically sent with every request — no `Authorization` header attachment in the frontend code.

---

## 2. Sequence Diagram 1: User Login Flow (with Cookie Auth & Security Logging)

```mermaid
sequenceDiagram
    autonumber
    participant User as React SPA (authStore)
    participant API as /api/v1/auth/login
    participant Service as AuthService
    participant DB as PostgreSQL DB

    User->>API: POST /api/v1/auth/login {email, password}
    API->>Service: auth_service.login(user_in, ua_string, ip_address)
    Service->>DB: SELECT * FROM v_users_canonical WHERE email = $1
    DB-->>Service: User Record (Hashed Password)
    Service->>Service: Verify Password (bcrypt)
    Service->>DB: SELECT fn_refresh_session(user_id, token, user_agent, ip)
    DB-->>Service: Active Session Record
    Service->>DB: SELECT fn_log_security_event(user_id, 'user_login', ip, user_agent)
    DB-->>Service: Event Logged
    API->>API: Set access_token cookie (15 min, httpOnly)
    API->>API: Set refresh_token cookie (7 days, httpOnly, path=/api/v1/auth)
    API-->>User: 200 OK {message: "Login successful"}
    User->>API: GET /api/v1/auth/me (cookie sent automatically)
    API-->>User: UserResponse {id, email, role, organization_id, ...}
    User->>User: authStore.set({isAuthenticated: true, user})
```

---

## 3. Sequence Diagram 2: Protected Route Access & Session Validation

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Browser (React SPA)
    participant Axios as Axios (withCredentials: true)
    participant Auth as get_current_user dependency
    participant DB as PostgreSQL DB

    Browser->>Axios: Request to protected endpoint (cookie auto-attached)
    Axios->>Auth: Cookie: access_token=<JWT>
    Auth->>Auth: verify_token(cookie_value) — decode JWT
    Auth->>DB: SELECT fn_is_session_revoked(session_id)
    DB-->>Auth: false (session active)
    Auth-->>Axios: {id, email, role, organization_id, session_id}
    Axios-->>Browser: 200 OK with response data

    note over Browser,DB: If fn_is_session_revoked returns true:
    Auth->>Axios: 401 Unauthorized
    Axios->>Browser: Response interceptor: authStore.logout({forced: true})
    Browser->>Browser: Redirect to /login, toast "Session expired"
```

---

## 4. Sequence Diagram 3: Kanban Board Loading & Card Rendering

```mermaid
sequenceDiagram
    autonumber
    participant User as React SPA (BoardPage)
    participant API as /api/v1/boards/{id}
    participant DB as PostgreSQL DB

    User->>API: GET /api/v1/boards/{id} (access_token cookie)
    API->>DB: SELECT * FROM v_boards_canonical WHERE id = $1
    DB-->>API: Board Record (name, description, member count)
    API->>DB: SELECT * FROM v_tasks_canonical WHERE board_id = $1
    DB-->>API: Task Cards List (with assignee, priority, due date, column_id)
    API-->>User: 200 OK {board, columns, tasks}
    User->>User: taskStore.setBoard(board, columns, tasks)
    User->>User: KanbanBoard renders @dnd-kit columns + TaskCards
```

---

## 5. Sequence Diagram 4: Drag-and-Drop Task Move

```mermaid
sequenceDiagram
    autonumber
    participant User as React SPA (KanbanBoard)
    participant Store as taskStore (Zustand)
    participant API as /api/v1/tasks/{id}/move
    participant DB as PostgreSQL DB

    User->>Store: onDragEnd event — compute new column_id + position
    Store->>Store: Optimistic UI update (reorder tasks in store)
    Store->>API: POST /api/v1/tasks/{id}/move {column_id, position}
    API->>DB: SELECT fn_move_task(task_id, new_column_id, new_position)
    DB-->>API: Updated Task Record
    API-->>Store: 200 OK
    note over Store: On failure: rollback optimistic update
```

---

## 6. Sequence Diagram 5: Meeting Join & Recording Launch

```mermaid
sequenceDiagram
    autonumber
    participant User as React SPA
    participant API as Meeting API Router
    participant Service as MeetingService
    participant Bot as Playwright Bot Controller
    participant Rec as MeetingRecorder

    User->>API: POST /api/v1/meeting/join {meeting_url}
    API->>Service: join_meeting(meeting_url)
    Service->>Service: Create MeetingRuntime Instance
    Service->>Bot: launch_browser() & navigate(meeting_url)
    Bot->>Bot: Bypass Google Auth & Join Room
    Bot->>Rec: start_recording()
    Rec->>Rec: Spawn FFmpeg subprocess (PulseAudio capture)
    Rec-->>Service: Recording Active
    Service-->>API: Session ID & Status JOINED
    API-->>User: 200 OK {session_id, status: "JOINED"}
```

---

## 7. Sequence Diagram 6: Meeting Teardown, Audio Flush & Pipeline Processing

```mermaid
sequenceDiagram
    autonumber
    participant User as React SPA
    participant API as Meeting API Router
    participant Service as MeetingService
    participant Rec as MeetingRecorder
    participant Orchestrator as MeetingPipelineOrchestrator
    participant Deepgram as Deepgram Nova-3 API
    participant Engine as Dynamic Attribution Engine

    User->>API: POST /api/v1/meeting/leave
    API->>Service: leave_meeting(session_id)
    Service->>Rec: stop_recording()
    Rec->>Rec: Graceful SIGINT shutdown & write WebM output
    Rec-->>Service: Save storage/meeting/recordings/{id}/recording.webm
    Service->>Orchestrator: execute_pipeline(session_id)

    rect rgb(240, 240, 240)
        Note over Orchestrator: Stage 1: FFmpeg audio preprocessing → processed_audio.wav
        Note over Orchestrator: Stage 2: Participant presence collection
        Orchestrator->>Deepgram: Stage 3&4: POST /v1/listen?model=nova-3&diarize=true
        Deepgram-->>Orchestrator: RawTranscript + SpeakerTurns
        Orchestrator->>Engine: Stage 5&6: Speaker alignment + identity resolution
        Engine-->>Orchestrator: participant_attributed_transcript.json
        Note over Orchestrator: Stage 7: LLM task extraction → fn_create_task_proposal
    end

    Orchestrator-->>Service: Pipeline Complete (PROPOSALS_READY)
    Service->>Service: NotificationService.notify_managers()
    Service-->>API: Attributed Transcript JSON
    API-->>User: 200 OK (session status: PROPOSALS_READY)
```

---

## 8. Sequence Diagram 7: AI Task Proposal Approval & Task Creation

```mermaid
sequenceDiagram
    autonumber
    participant Manager as Manager / Admin SPA
    participant API as /api/v1/proposals/{id}/approve
    participant Auth as require_proposal_review_access
    participant DB as PostgreSQL DB
    participant Notif as NotificationService

    Manager->>API: POST /api/v1/proposals/{id}/approve {board_id: "..."}
    API->>Auth: fn_check_proposal_review_access(user_id, org_id)
    Auth->>DB: SELECT fn_check_proposal_review_access($1, $2)
    DB-->>Auth: true (Authorized)
    API->>DB: SELECT * FROM fn_approve_task_proposal(proposal_id, board_id, user_id)
    DB-->>API: Created Task Record
    API->>Notif: notify_proposal_approved(proposal, created_task)
    Notif->>DB: SELECT fn_create_notification(...)
    DB-->>Notif: Notification Record Created
    API-->>Manager: 200 OK {task: CreatedTask}
```

---

## 9. Sequence Diagram 8: Invitation Send & Accept Flow

```mermaid
sequenceDiagram
    autonumber
    participant Manager as Manager SPA
    participant API as /api/v1/invitations
    participant Service as InvitationService
    participant Email as Email Service (SMTP)
    participant Invitee as Invitee Browser

    Manager->>API: POST /api/v1/invitations {email, role} (Manager+ required)
    API->>Service: invitation_service.invite_user(invite_in, current_user)
    Service->>Service: Generate secure token, store in organization_invitations
    Service-->>API: {invitation, email, org_name, token}
    API->>Email: background_tasks.add_task(send_invitation_email, email, org_name, token)
    Email-->>Invitee: Email with invite link /accept-invitation?token=<TOKEN>
    API-->>Manager: 201 Created (InvitationResponse)

    Invitee->>API: GET /api/v1/invitations/verify/{token}
    API-->>Invitee: {email, org_name, role} (invitation details)
    Invitee->>API: POST /api/v1/invitations/accept {token, password, first_name, last_name}
    API->>Service: invitation_service.accept_invitation(body)
    Service->>Service: Create user account, mark invitation accepted_at
    API-->>Invitee: {message: "Account created successfully. You can now log in."}
```

---

## 10. Sequence Diagram 9: Invitation Revocation Flow

```mermaid
sequenceDiagram
    autonumber
    participant Manager as Manager SPA (Organization Settings)
    participant API as /api/v1/invitations/{id}
    participant Service as InvitationService
    participant DB as PostgreSQL DB

    Manager->>API: DELETE /api/v1/invitations/{invitation_id} (Manager+ required)
    API->>Service: invitation_service.revoke_invitation(invitation_id, current_user)
    Service->>DB: SELECT revoke_invitation(p_invitation_id, p_org_id)
    DB->>DB: DELETE FROM organization_invitations WHERE id=$1 AND accepted_at IS NULL
    DB-->>Service: Deleted invitation JSON
    Service-->>API: Success
    API-->>Manager: 204 No Content
```

---

## 11. Sequence Diagram 10: Dashboard Data Loading (Manager/Superadmin)

```mermaid
sequenceDiagram
    autonumber
    participant Manager as Manager SPA (DashboardView)
    participant API as /api/v1/dashboard/summary
    participant Auth as require_proposal_review_access
    participant Service as DashboardService
    participant DB as PostgreSQL DB

    Manager->>API: GET /api/v1/dashboard/summary (access_token cookie)
    API->>Auth: fn_check_proposal_review_access(user_id, org_id)
    DB-->>Auth: true (Manager or Superadmin)
    API->>Service: dashboard_service.get_dashboard_summary(current_user)
    Service->>DB: SELECT * FROM v_dashboard_kpis_canonical WHERE organization_id = $1
    DB-->>Service: KPI row (totals, by-status, overdue, pending proposals, etc.)
    Service->>DB: SELECT * FROM v_dashboard_board_summaries_canonical WHERE organization_id = $1
    DB-->>Service: Board summary rows (per-board task counts, completion %)
    Service->>DB: SELECT * FROM v_activities_canonical WHERE organization_id = $1 LIMIT 10
    DB-->>Service: Recent activity rows
    Service-->>API: DashboardSummaryResponse {kpis, boards, recent_activity}
    API-->>Manager: 200 OK {data: {kpis, boards, recent_activity}}
    Manager->>Manager: Render KpiCardsRow, BoardsOverviewWidget, RecentActivityWidget, etc.
```

---

## 12. Sequence Diagram 11: Timesheet Submission & Manager Approval Flow

```mermaid
sequenceDiagram
    autonumber
    participant Member as Member SPA (TimesheetWeekView)
    participant API as /api/v1/timesheets
    participant Manager as Manager SPA (ApprovalQueuePage)
    participant DB as PostgreSQL DB
    participant Notif as Notification Service

    Member->>API: POST /api/v1/timesheets/{id}/entries (board_id, task_id, entry_date, hours, entry_type)
    API->>DB: SELECT * FROM fn_upsert_timesheet_entry(...)
    DB->>DB: Enforce task owner assignment check (if task linked)
    DB-->>API: TimesheetEntryResponse
    API-->>Member: 201 Created / Updated

    Member->>API: POST /api/v1/timesheets/{id}/submit {member_note, approver_id}
    API->>DB: SELECT * FROM fn_submit_timesheet(...)
    DB->>DB: Acquire row-level lock (FOR UPDATE)
    DB->>DB: Re-validate task owner assignments (raise TASK_ASSIGNMENT_CHANGED if unassigned/reassigned)
    DB->>DB: Validate policy rules (deadlines, min hours, overtime lock) & update status to 'submitted'
    DB-->>API: Updated Timesheet Record
    API->>Notif: notify_timesheet_submitted(conn, timesheet_id, submitter_id, approver_id)
    Notif->>DB: SELECT fn_create_timesheet_notification(...)
    API-->>Member: 200 OK (TimesheetResponse status='submitted')

    Manager->>API: GET /api/v1/timesheets/approvals/queue
    API->>DB: SELECT * FROM v_timesheets_canonical WHERE org_id=$1 AND status='submitted'
    DB-->>API: Queue items
    API-->>Manager: 200 OK [ApprovalQueueItemResponse]

    Manager->>API: POST /api/v1/timesheets/{id}/approve {comment}
    API->>DB: SELECT * FROM fn_approve_timesheet(...)
    DB->>DB: Acquire row-level lock (FOR UPDATE), update status to 'approved', record reviewed_at & approver_id
    DB-->>API: Updated Timesheet Record
    API->>Notif: notify_timesheet_approved(conn, timesheet_id, submitter_id, approver_id)
    Notif->>DB: SELECT fn_create_timesheet_notification(...)
    API-->>Manager: 200 OK (TimesheetResponse status='approved')
```

---

## 13. Sequence Diagram 12: Meeting Pipeline Failure Recovery & Rerun Execution

```mermaid
sequenceDiagram
    autonumber
    participant User as Manager / Superadmin SPA
    participant Widget as RecentMeetingsWidget
    participant API as /api/v1/meeting/{id}/rerun
    participant DB as PostgreSQL DB
    participant Orchestrator as MeetingPipelineOrchestrator

    note over Orchestrator: Transient error during initial pipeline run (e.g. STT timeout)
    Orchestrator->>DB: SELECT fn_fail_meeting_session(session_id)
    DB->>DB: Set status = 'FAILED', failed_at = NOW()
    Widget->>DB: GET /api/v1/meeting/sessions
    DB-->>Widget: Session list with status 'FAILED'
    Widget->>User: Display red FAILED badge & Rerun button

    User->>Widget: Click 'Rerun Pipeline' button
    Widget->>API: POST /api/v1/meeting/{session_id}/rerun
    API->>DB: SELECT fn_reset_meeting_session_status(session_id)
    DB->>DB: Set status = 'PROCESSING', failed_at = NULL
    API->>Orchestrator: background_tasks.add_task(execute_pipeline, session_id)
    API-->>Widget: 200 OK {message: "Pipeline rerun initiated", status: "PROCESSING"}

    rect rgb(240, 240, 255)
        Note over Orchestrator: Background re-execution of audio, STT, attribution & task extraction
    end
    Orchestrator->>DB: Update session status to 'PROPOSALS_READY'
    Widget->>DB: Poll status -> status 'PROPOSALS_READY'
    Widget-->>User: Display green PROPOSALS_READY badge & view action items
```

---

## 14. Sequence Diagram 13: Global Search Flow (Cmd+K Modal)

```mermaid
sequenceDiagram
    autonumber
    participant User as React SPA (AppLayout)
    participant Modal as SearchModal (Cmd+K)
    participant API as /api/v1/search
    participant DB as PostgreSQL DB

    User->>Modal: Press Cmd+K / Ctrl+K key shortcut
    Modal->>Modal: Open search modal dialog, render static navigationCatalog shortcuts
    User->>Modal: Type search query string ("pipeline")
    Modal->>API: GET /api/v1/search?q=pipeline&limit=10 (access_token cookie)
    API->>DB: SELECT id, title, type, board_id, task_id, org_id FROM v_global_search_canonical WHERE org_id = $1 AND (search_vector @@ plainto_tsquery('english', $2) OR title ILIKE '%' || $2 || '%') LIMIT 10
    DB-->>API: Search result recordset (matching tasks, boards, meetings)
    API-->>Modal: 200 OK {data: [SearchResult]}
    Modal-->>User: Render grouped search results list with keyboard navigation
    User->>Modal: Select result item (Press Enter or Click)
    Modal->>User: Close modal and navigate to target page (/boards/1?task=45)
```

---

## 15. Sequence Diagram 14: Bulk Task Operations Flow (Multi-Select Move & Delete)

```mermaid
sequenceDiagram
    autonumber
    participant User as React SPA (KanbanBoard)
    participant API as FastAPI /tasks Router
    participant DB as PostgreSQL DB
    participant WS as ConnectionManager (WebSockets)

    User->>User: Select multiple task card checkboxes on board
    User->>User: Floating action toolbar appears showing selected count
    alt Bulk Move Flow
        User->>User: Select target destination column ("In Progress") & click Move
        User->>API: POST /api/v1/tasks/bulk-move {task_ids: [12, 14, 19], column_id: 3}
        API->>DB: SELECT fn_bulk_move_tasks($1, $2, $3, $4)
        DB-->>API: moved_count = 3
        API->>WS: send_to_board(board_id, {type: "task_moved", task_ids: [...]})
        API-->>User: 200 OK {data: {moved_count: 3}}
    else Bulk Delete Flow (Manager / Superadmin)
        User->>User: Click "Delete (N)" button & confirm prompt modal
        User->>API: POST /api/v1/tasks/bulk-delete {task_ids: [12, 14, 19]}
        API->>DB: SELECT fn_bulk_delete_tasks($1, $2)
        DB->>DB: Soft-delete tasks, comments, and purge associated notifications
        DB-->>API: deleted_count = 3
        API->>WS: send_to_board(board_id, {type: "task_deleted", task_ids: [...]})
        API-->>User: 200 OK {data: {deleted_count: 3}}
    end
    User->>User: Clear selection & refresh board state via WebSocket trigger
```


---

## 16. Sequence Diagram 15: Real-Time WebSocket Event & Notification Broadcasting

```mermaid
sequenceDiagram
    autonumber
    participant ClientA as React SPA Client A (Board 12)
    participant ClientB as React SPA Client B (Board 12)
    participant WS as WebSocket Endpoint (/ws)
    participant Manager as ConnectionManager
    participant Router as Tasks API Router
    participant DB as PostgreSQL DB

    ClientA->>WS: Connect GET /ws?token=JWT
    WS->>Manager: Register connection for User A
    ClientA->>WS: Send {"type": "subscribe_board", "board_id": 12}
    Manager->>Manager: Add User A connection to Board 12 room

    ClientB->>Router: POST /api/v1/tasks (Create Task in Board 12)
    Router->>DB: SELECT fn_create_task(...)
    DB-->>Router: Created Task Record
    Router->>Manager: broadcast_to_board(12, {"type": "task_created", "board_id": 12, "task": ...})
    Manager->>ClientA: Socket Push JSON Payload {"type": "task_created", ...}
    ClientA->>ClientA: taskStore updates local state & re-renders board view
```

---

## 17. Sequence Diagram 16: Task Modal Deep Linking & URL State Sync

```mermaid
sequenceDiagram
    autonumber
    participant User as User / Browser
    participant Board as KanbanBoard / NotificationLink
    participant Modal as TaskDetailsModal
    participant Store as uiStore (Zustand)

    User->>Board: Click Task Card or Notification Link (/boards/12?taskId=45)
    Board->>Store: openTaskModal(45)
    Store->>Modal: isTaskModalOpen = true, selectedTaskId = 45
    Modal->>User: Render task details dialog & push ?taskId=45 to browser URL history
    User->>Modal: Click Close or click backdrop
    Modal->>Store: closeTaskModal()
    Store->>Board: isTaskModalOpen = false, selectedTaskId = null
    Board->>User: Remove ?taskId query param from URL without page reload
```

---

## 18. Sequence Diagram 17: Task Label Creation, Attachment & Tagging Flow

```mermaid
sequenceDiagram
    autonumber
    participant User as React SPA (TaskDetailsModal / LabelPicker)
    participant API as FastAPI Labels Router (/api/v1)
    participant DB as PostgreSQL DB
    participant WS as ConnectionManager (WebSockets)
    participant OtherUser as React SPA (Viewing Board)

    alt Create New Board Label
        User->>API: POST /api/v1/boards/12/labels {name: "Frontend", color: "#3B82F6"}
        API->>DB: SELECT * FROM fn_create_label(12, 'Frontend', '#3B82F6', user_id)
        DB-->>API: Label record {id: 7, board_id: 12, name: 'Frontend', color: '#3B82F6'}
        API->>WS: send_to_board(12, {type: "label_created", board_id: 12, label: ...})
        API-->>User: 200 OK {data: Label}
    else Attach Label to Task
        User->>API: POST /api/v1/tasks/45/labels/7
        API->>DB: SELECT fn_attach_label(45, 7, user_id)
        DB-->>API: True
        API->>WS: send_to_board(12, {type: "task_updated", task_id: 45, action: "attach_label", label_id: 7})
        API-->>User: 200 OK {data: {success: true}}
        WS-->>OtherUser: Socket Push task_updated -> re-renders task card with color label tag
    end
```

---

## 19. Sequence Diagram 18: Password Reset & Email Verification Flow

```mermaid
sequenceDiagram
    autonumber
    participant User as User / Browser
    participant API as FastAPI Auth Router (/auth)
    participant Service as AuthService
    participant DB as PostgreSQL DB
    participant Mail as Async Email Service (SMTP)

    alt Forgot Password Request
        User->>API: POST /api/v1/auth/forgot-password {email: "user@example.com"}
        API->>Service: create_password_reset_token(email)
        Service->>DB: SELECT * FROM fn_create_password_reset_token(...)
        DB-->>Service: Token record {raw_token: "xyz123...", user_first_name: "Alex"}
        Service-->>API: Raw token details
        API->>Mail: background_tasks.add_task(send_email, reset_url)
        API-->>User: 200 OK {"data": {"message": "If registered, reset link sent."}}
        Mail-->>User: Delivers HTML Email with single-use reset URL
    else Reset Password Execution
        User->>API: POST /api/v1/auth/reset-password {token: "xyz123...", new_password: "..."}
        API->>Service: reset_password(token, hashed_password)
        Service->>DB: SELECT * FROM fn_reset_password(...)
        DB-->>Service: {success: true, user_id: 5}
        Service-->>API: Reset Success
        API-->>User: 200 OK {"data": {"message": "Password reset successfully."}}
    end
```

---

## 20. Sequence Diagram 19: Inline Comment Editing Flow

```mermaid
sequenceDiagram
    autonumber
    participant User as Comment Author (React SPA)
    participant Modal as TaskDetailsModal / CommentsTab
    participant API as /api/v1/tasks/{id}/comments/{id}
    participant Service as CommentService
    participant DB as PostgreSQL DB
    participant WS as ConnectionManager (WebSockets)

    User->>Modal: Click pencil edit icon on own comment
    Modal->>Modal: Render inline textarea with existing content (auto-focused)
    User->>Modal: Edit text, press Enter (or Esc to cancel)
    Modal->>API: PATCH /api/v1/tasks/{task_id}/comments/{comment_id} {content: "updated text"}
    API->>Service: comment_service.update_comment(...)
    Service->>DB: SELECT fn_update_comment(comment_id, content, user_id, org_id)
    DB->>DB: Owner check, SET content = $2, edited_at = NOW()
    DB-->>Service: Updated comment record
    Service->>WS: broadcast_to_board(board_id, {type: "comment_updated", comment_id})
    API-->>Modal: 200 OK {comment with edited_at timestamp}
    Modal->>Modal: Replace comment text, show "(edited)" label, exit edit mode
```

---

## 21. Sequence Diagram 20: @Mention Autocomplete & MENTIONED_IN_COMMENT Notification Flow

```mermaid
sequenceDiagram
    autonumber
    participant User as Comment Author (CommentsTab)
    participant API as FastAPI Comments Router
    participant Service as CommentService
    participant DB as PostgreSQL DB
    participant Notif as NotificationService
    participant WS as ConnectionManager (WebSockets)
    participant Mentioned as Mentioned User Client

    User->>User: Type "@" in comment textarea
    User->>User: Dropdown renders board member list (from GET /boards/{id}/members)
    User->>User: Select member — token inserted: "@[Full Name](user:42)"
    User->>API: POST /api/v1/tasks/{task_id}/comments {content: "...", mentioned_user_ids: [42]}
    API->>Service: comment_service.create_comment(...)
    Service->>DB: SELECT fn_create_comment(task_id, author_id, content, ...)
    DB-->>Service: Comment record {id: 88, ...}
    Service->>DB: SELECT fn_create_comment_mentions(88, [42], author_id)
    DB->>DB: INSERT INTO comment_mentions (comment_id, mentioned_user_id)
    DB->>DB: INSERT MENTIONED_IN_COMMENT notification for user 42
    DB->>DB: INSERT activity log row for mention action
    DB-->>Service: Mentions created
    Service->>WS: broadcast_to_board(board_id, {type: "task_updated", comment_id: 88})
    Service->>Notif: send_personal_message(42, {type: "notification", ...})
    Notif->>Mentioned: WebSocket push — MENTIONED_IN_COMMENT notification
    API-->>User: 201 Created {comment with mentioned_users array}
    User->>User: Comment renders @mention token as styled clickable chip
```
