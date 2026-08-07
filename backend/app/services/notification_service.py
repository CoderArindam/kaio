import json
from app.services.email_service import send_email
from app.services.email_templates import (
    task_assigned_template,
    task_assignment_changed_template,
    task_status_changed_template,
    task_comment_added_template
)
import logging

logger = logging.getLogger(__name__)

def dispatch_task_email(
    activity_type: str,
    task_title: str,
    board_name: str,
    actor_name: str,
    assignee_email: str = None,
    assignee_name: str = None,
    old_assignee_email: str = None,
    old_assignee_name: str = None,
    old_status: str = None,
    new_status: str = None,
    comment: str = None
):
    """
    Dispatches appropriate emails based on the activity.
    Should be called via FastAPI BackgroundTasks so it doesn't block the API.
    """
    # TEMPORARILY DISABLED: Task emails (creation, assignee updates, status changes, comments) are bypassed
    # to avoid hitting email provider rate limits during testing. Account emails (signup, 2FA, password reset, invitations) remain active.
    logger.info(f"[TEMPORARILY DISABLED] Task email dispatch skipped for activity_type='{activity_type}', task='{task_title}'")
    return

    try:
        if activity_type == "ASSIGNEE_CHANGED":
            if assignee_email:
                subject = "You have been assigned a task"
                body = task_assigned_template(task_title, board_name, actor_name)
                send_email(assignee_email, subject, body)
                
            if old_assignee_email and old_assignee_email != assignee_email:
                subject = "Task assignment updated"
                body = task_assignment_changed_template(task_title, assignee_name or assignee_email)
                send_email(old_assignee_email, subject, body)

        elif activity_type == "STATUS_CHANGED":
            if assignee_email:
                subject = f"Task status updated to {new_status}"
                body = task_status_changed_template(task_title, old_status, new_status, actor_name)
                send_email(assignee_email, subject, body)
                
        elif activity_type == "DUE_DATE_CHANGED":
            if assignee_email:
                subject = "Task due date updated"
                # using assignment changed template as a fallback since no specific template exists for due dates,
                # but standard practice is just reuse a generic update or create one.
                # Actually, let's just send a simple text email if there's no template
                body = f"Hi {assignee_name or 'there'},\n\nThe due date for the task '{task_title}' was updated by {actor_name}.\n\nThanks,\nThe Team"
                send_email(assignee_email, subject, body)

        elif activity_type == "COMMENT_ADDED":
            if assignee_email:
                subject = "New comment on your task"
                body = task_comment_added_template(task_title, actor_name, comment or "")
                send_email(assignee_email, subject, body)

    except Exception as e:
        logger.error(f"Failed to dispatch email notification for {activity_type}: {e}")

import asyncpg
from fastapi import HTTPException
from typing import List, Optional
from app.schemas.notifications import MarkBatchReadRequest, CanonicalNotificationResponse
from app.schemas.envelope import MetaResponse
from app.websockets.manager import connection_manager

class NotificationService:
    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def get_notifications(self, cursor: Optional[int], limit: int, current_user: dict):
        try:
            query = "SELECT * FROM v_notifications_canonical WHERE user_id = $1"
            args = [current_user["id"]]
            
            if cursor is not None:
                query += " AND id < $2"
                args.append(cursor)
                
            args.append(limit + 1)
            query += f" ORDER BY id DESC LIMIT ${len(args)}"
            
            rows = await self.conn.fetch(query, *args)
            
            has_more = len(rows) > limit
            notifications = rows[:limit]
            
            next_cursor = str(notifications[-1]["id"]) if notifications else None
            
            return [CanonicalNotificationResponse(**dict(row)) for row in notifications], MetaResponse(cursor=next_cursor, has_more=has_more)
        except Exception as e:
            logger.error(f"Error fetching notifications: {e}")
            raise HTTPException(status_code=500, detail="An error occurred while fetching notifications")

    async def mark_read(self, notification_id: int, current_user: dict):
        try:
            await self.conn.execute(
                "UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2",
                notification_id, current_user["id"]
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail="Failed to mark notification as read")

    async def mark_unread(self, notification_id: int, current_user: dict):
        try:
            await self.conn.execute(
                "UPDATE notifications SET is_read = false WHERE id = $1 AND user_id = $2",
                notification_id, current_user["id"]
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail="Failed to mark notification as unread")

    async def mark_batch_read(self, payload: MarkBatchReadRequest, current_user: dict):
        if not payload.notification_ids:
            return
        try:
            await self.conn.execute(
                "UPDATE notifications SET is_read = true WHERE user_id = $1 AND id = ANY($2::int[])",
                current_user["id"], payload.notification_ids
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail="Failed to mark notifications as read")

    async def mark_all_read(self, current_user: dict):
        try:
            await self.conn.execute(
                "UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false",
                current_user["id"]
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail="Failed to mark all notifications as read")

    async def delete_notification(self, notification_id: int, current_user: dict):
        try:
            await self.conn.execute(
                "DELETE FROM notifications WHERE id = $1 AND user_id = $2",
                notification_id, current_user["id"]
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail="Failed to delete notification")

    async def notify_timesheet_submitted(self, timesheet_id, submitter_id, approver_id, week_label, submitter_name: str = None):
        return await notify_timesheet_submitted(self.conn, timesheet_id, submitter_id, approver_id, week_label, submitter_name)

    async def notify_timesheet_approved(self, timesheet_id, submitter_id, approver_id, week_label):
        return await notify_timesheet_approved(self.conn, timesheet_id, submitter_id, approver_id, week_label)

    async def notify_timesheet_rejected(self, timesheet_id, submitter_id, approver_id, week_label, comment: str = None):
        return await notify_timesheet_rejected(self.conn, timesheet_id, submitter_id, approver_id, week_label, comment)

    async def notify_timesheet_recalled(self, timesheet_id, submitter_id, approver_id, week_label, reason: str = None, submitter_name: str = None):
        return await notify_timesheet_recalled(self.conn, timesheet_id, submitter_id, approver_id, week_label, reason, submitter_name)

    async def notify_pipeline_failed(self, session_id: str, org_id: int = 1):
        return await notify_pipeline_failed(self.conn, session_id, org_id)

    async def notify_task_assigned(
        self,
        task_id: int,
        task_title: str,
        board_name: str,
        assignee_id: int,
        actor_id: int,
        org_id: int,
    ) -> None:
        """
        Create an in-app notification for a user who has been assigned a task,
        and push a real-time WS notification.new event to them.
        """
        try:
            actor_name = await self.conn.fetchval(
                "SELECT first_name FROM users WHERE id = $1", actor_id
            ) or "Someone"
            title = f"{actor_name} assigned you a task: {task_title}"
            deep_link = f"/boards/{board_name}?task={task_id}"

            act_id = await self.conn.fetchval(
                """
                INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
                VALUES ($1, 'TASK', $2, $3, 'ASSIGNEE_CHANGED', $4::jsonb)
                RETURNING id
                """,
                org_id,
                task_id,
                actor_id,
                {"assigned_to": assignee_id, "title": title, "deep_link": deep_link},
            )
            await self.conn.execute(
                "INSERT INTO notifications (user_id, activity_id, is_read) VALUES ($1, $2, false)",
                assignee_id, act_id,
            )
            await _dispatch_notification_event(self.conn, assignee_id)
        except Exception as e:
            logger.error(f"notify_task_assigned failed task={task_id} assignee={assignee_id}: {e}")

    async def notify_task_reminder(
        self,
        task_id: int,
        task_title: str,
        board_id: int,
        assignee_id: int,
        org_id: int,
    ) -> None:
        """
        Create an in-app notification for a user reminding them of a due task,
        and push a real-time WS notification.new event.
        """
        try:
            title = f"Task reminder: '{task_title}' is due soon or overdue"
            deep_link = f"/boards/{board_id}?task={task_id}"

            act_id = await self.conn.fetchval(
                """
                INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
                VALUES ($1, 'TASK', $2, $3, 'TASK_REMINDER', $4::jsonb)
                RETURNING id
                """,
                org_id,
                task_id,
                assignee_id,
                {"assigned_to": assignee_id, "title": title, "deep_link": deep_link},
            )
            await self.conn.execute(
                "INSERT INTO notifications (user_id, activity_id, is_read) VALUES ($1, $2, false)",
                assignee_id, act_id,
            )
            await _dispatch_notification_event(self.conn, assignee_id)
        except Exception as e:
            logger.error(f"notify_task_reminder failed task={task_id} assignee={assignee_id}: {e}")

    async def notify_assignee_changed(
        self,
        task_id: int,
        task_title: str,
        board_id: int,
        new_assignee_id: Optional[int],
        old_assignee_id: Optional[int],
        actor_id: int,
        org_id: int,
    ) -> None:
        """
        DB trigger already inserts the activity + notification rows.
        Python just pushes the real-time WS event to the right recipients.
        Reassign (A→B): push WS to B only.
        Unassign (A→None): push WS to A only.
        """
        try:
            if new_assignee_id and new_assignee_id != actor_id:
                await _dispatch_notification_event(self.conn, new_assignee_id)
            elif not new_assignee_id and old_assignee_id and old_assignee_id != actor_id:
                await _dispatch_notification_event(self.conn, old_assignee_id)
        except Exception as e:
            logger.error(f"notify_assignee_changed WS push failed task={task_id}: {e}")

    async def notify_due_date_changed(
        self,
        task_id: int,
        task_title: str,
        board_id: int,
        assignee_id: Optional[int],
        reporter_id: Optional[int],
        actor_id: int,
        org_id: int,
        old_due_date=None,
        new_due_date=None,
    ) -> None:
        """
        DB trigger already notifies the assignee via DUE_DATE_CHANGED activity.
        Python pushes WS to assignee (real-time) + creates a notification row for
        the task creator if they differ from the assignee and actor.
        """
        try:
            # WS push to assignee (DB trigger row is already there)
            if assignee_id and assignee_id != actor_id:
                await _dispatch_notification_event(self.conn, assignee_id)

            # Notification row for reporter (not covered by DB trigger)
            if reporter_id and reporter_id != actor_id and reporter_id != assignee_id:
                actor_name = await self.conn.fetchval(
                    "SELECT first_name FROM users WHERE id = $1", actor_id
                ) or "Someone"
                deep_link = f"/boards/{board_id}?task={task_id}"

                def _fmt(d) -> str:
                    if d is None:
                        return "none"
                    if hasattr(d, "strftime"):
                        return d.strftime("%d %b %Y")
                    return str(d)[:10]

                act_id = await self.conn.fetchval(
                    """
                    INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, old_value, new_value)
                    VALUES ($1, 'TASK', $2, $3, 'DUE_DATE_CHANGED', $4::jsonb, $5::jsonb)
                    RETURNING id
                    """,
                    org_id, task_id, actor_id,
                    {"due_date": str(old_due_date)[:10] if old_due_date else None},
                    {"due_date": str(new_due_date)[:10] if new_due_date else None},
                )
                await self.conn.execute(
                    "INSERT INTO notifications (user_id, activity_id, is_read) VALUES ($1, $2, false)",
                    reporter_id, act_id,
                )
                await _dispatch_notification_event(self.conn, reporter_id)
        except Exception as e:
            logger.error(f"notify_due_date_changed failed task={task_id}: {e}")

    async def notify_reporter_changed(
        self,
        task_id: int,
        task_title: str,
        board_id: int,
        new_reporter_id: Optional[int],
        old_reporter_id: Optional[int],
        assignee_id: Optional[int],
        actor_id: int,
        org_id: int,
    ) -> None:
        try:
            actor_name = await self.conn.fetchval(
                "SELECT first_name FROM users WHERE id = $1", actor_id
            ) or "Someone"
            
            old_reporter_name = None
            if old_reporter_id:
                old_reporter_name = await self.conn.fetchval(
                    "SELECT COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email) FROM users WHERE id = $1", old_reporter_id
                )

            new_reporter_name = None
            if new_reporter_id:
                new_reporter_name = await self.conn.fetchval(
                    "SELECT COALESCE(NULLIF(TRIM(CONCAT(first_name, ' ', last_name)), ''), email) FROM users WHERE id = $1", new_reporter_id
                )
            
            deep_link = f"/boards/{board_id}?task={task_id}"
            
            act_id = await self.conn.fetchval(
                """
                INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, old_value, new_value)
                VALUES ($1, 'TASK', $2, $3, 'REPORTER_CHANGED', $4::jsonb, $5::jsonb)
                RETURNING id
                """,
                org_id, task_id, actor_id,
                {"reporter_id": old_reporter_id, "reporter_name": old_reporter_name},
                {"reporter_id": new_reporter_id, "reporter_name": new_reporter_name, "deep_link": deep_link}
            )
            
            notify_users = set()
            if assignee_id and assignee_id != actor_id:
                notify_users.add(assignee_id)
            if old_reporter_id and old_reporter_id != actor_id:
                notify_users.add(old_reporter_id)
            if new_reporter_id and new_reporter_id != actor_id:
                notify_users.add(new_reporter_id)
                
            for user_id in notify_users:
                await self.conn.execute(
                    "INSERT INTO notifications (user_id, activity_id, is_read) VALUES ($1, $2, false)",
                    user_id, act_id
                )
                await _dispatch_notification_event(self.conn, user_id)
                
        except Exception as e:
            logger.error(f"notify_reporter_changed failed task={task_id}: {e}")

    async def notify_comment_reply(
        self,
        task_id: int,
        task_title: str,
        board_id: int,
        parent_author_id: int,
        commenter_id: int,
        org_id: int,
    ) -> None:
        """Notify the author of the parent comment that someone replied."""
        if parent_author_id == commenter_id:
            return
        try:
            commenter_name = await self.conn.fetchval(
                "SELECT first_name FROM users WHERE id = $1", commenter_id
            ) or "Someone"
            title = f"{commenter_name} replied to your comment on: {task_title}"
            deep_link = f"/boards/{board_id}?task={task_id}"

            act_id = await self.conn.fetchval(
                """
                INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
                VALUES ($1, 'TASK', $2, $3, 'COMMENTED', $4::jsonb)
                RETURNING id
                """,
                org_id, task_id, commenter_id,
                {"title": title, "deep_link": deep_link},
            )
            await self.conn.execute(
                "INSERT INTO notifications (user_id, activity_id, is_read) VALUES ($1, $2, false)",
                parent_author_id, act_id,
            )
            await _dispatch_notification_event(self.conn, parent_author_id)
        except Exception as e:
            logger.error(f"notify_comment_reply failed task={task_id}: {e}")

    async def notify_board_member_added(
        self,
        board_id: int,
        board_name: str,
        user_id: int,
        actor_id: int,
        org_id: int,
    ) -> None:
        """Notify a user they were added to a project/board."""
        if user_id == actor_id:
            return
        try:
            actor_name = await self.conn.fetchval(
                "SELECT first_name FROM users WHERE id = $1", actor_id
            ) or "Someone"
            title = f"{actor_name} added you to the project: {board_name}"
            deep_link = f"/boards/{board_id}"

            act_id = await self.conn.fetchval(
                """
                INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
                VALUES ($1, 'BOARD', $2, $3, 'UPDATED', $4::jsonb)
                RETURNING id
                """,
                org_id, board_id, actor_id,
                {"title": title, "deep_link": deep_link},
            )
            await self.conn.execute(
                "INSERT INTO notifications (user_id, activity_id, is_read) VALUES ($1, $2, false)",
                user_id, act_id,
            )
            await _dispatch_notification_event(self.conn, user_id)
        except Exception as e:
            logger.error(f"notify_board_member_added failed board={board_id} user={user_id}: {e}")

    async def notify_board_member_removed(
        self,
        board_id: int,
        board_name: str,
        user_id: int,
        actor_id: int,
        org_id: int,
    ) -> None:
        """Notify a user they were removed from a project/board."""
        if user_id == actor_id:
            return
        try:
            actor_name = await self.conn.fetchval(
                "SELECT first_name FROM users WHERE id = $1", actor_id
            ) or "Someone"
            title = f"{actor_name} removed you from the project: {board_name}"
            deep_link = f"/boards"

            act_id = await self.conn.fetchval(
                """
                INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
                VALUES ($1, 'BOARD', $2, $3, 'UPDATED', $4::jsonb)
                RETURNING id
                """,
                org_id, board_id, actor_id,
                {"title": title, "deep_link": deep_link},
            )
            await self.conn.execute(
                "INSERT INTO notifications (user_id, activity_id, is_read) VALUES ($1, $2, false)",
                user_id, act_id,
            )
            await _dispatch_notification_event(self.conn, user_id)
        except Exception as e:
            logger.error(f"notify_board_member_removed failed board={board_id} user={user_id}: {e}")


from uuid import UUID

def _to_uuid(val) -> UUID | None:
    if val is None:
        return None
    if isinstance(val, UUID):
        return val
    s_val = str(val).strip()
    if s_val.isdigit():
        return UUID(f"00000000-0000-0000-0000-{int(s_val):012d}")
    try:
        return UUID(s_val)
    except Exception:
        return None


async def _dispatch_notification_event(conn: asyncpg.Connection, recipient_id) -> None:
    """Read unread count for recipient and push notification.new WS event. Never raises."""
    try:
        from uuid import UUID as _UUID
        # _to_uuid() packs integer IDs as 00000000-0000-0000-0000-{id:012d}
        # UUID.node is the last 48 bits, which equals the original int when packed this way
        if isinstance(recipient_id, _UUID):
            user_id_int = recipient_id.node
        elif isinstance(recipient_id, str) and '-' in recipient_id:
            user_id_int = _UUID(recipient_id).node
        else:
            user_id_int = int(recipient_id)

        unread_count = await conn.fetchval(
            "SELECT COUNT(*) FROM v_notifications_canonical WHERE user_id = $1 AND is_read = FALSE",
            user_id_int
        )
        await connection_manager.send_to_user(
            user_id=user_id_int,
            message={"type": "notification.new", "user_id": user_id_int, "unread_count": int(unread_count or 0)},
        )
    except Exception as e:
        logger.debug(f"WS notification.new dispatch failed for {recipient_id}: {e}")



async def notify_pipeline_failed(conn: asyncpg.Connection, session_id: str, org_id: int = 1):
    try:
        rows = await conn.fetch(
            "SELECT id FROM v_users_canonical WHERE (organization_id = $1 OR organization_id::text = $1::text) AND LOWER(role::text) IN ('superadmin', 'super_admin', 'manager')",
            org_id
        )
        if not rows:
            return

        title = f"Meeting processing failed for session {session_id}"
        body = f"Audio processing failed for meeting session {session_id}."

        for r in rows:
            user_int_id = r["id"]
            act_id = await conn.fetchval(
                """
                INSERT INTO activities (organization_id, entity_type, entity_id, user_id, activity_type, new_value)
                VALUES ($1, 'ORGANIZATION', $1, NULL, 'UPDATED', $2::jsonb)
                RETURNING id
                """,
                org_id,
                json.dumps({"title": title, "body": body, "session_id": session_id})
            )
            if act_id:
                await conn.execute(
                    "INSERT INTO notifications (user_id, activity_id) VALUES ($1, $2)",
                    user_int_id, act_id
                )
    except Exception as e:
        logger.error(f"Failed to create pipeline failure notification for session {session_id}: {e}")


async def notify_timesheet_submitted(conn: asyncpg.Connection, timesheet_id, submitter_id, approver_id, week_label: str, submitter_name: str = None):
    name_str = submitter_name or "A team member"
    title = f"{name_str} submitted a timesheet for {week_label}"
    deep_link = f"/timesheets/approvals?id={timesheet_id}"

    ts_uuid = _to_uuid(timesheet_id)
    sub_uuid = _to_uuid(submitter_id)

    targets = []
    if approver_id:
        targets = [_to_uuid(approver_id)]
    else:
        org_id = await conn.fetchval("SELECT org_id FROM v_timesheets_canonical WHERE id = $1", ts_uuid)
        if org_id:
            rows = await conn.fetch(
                "SELECT id FROM v_users_canonical WHERE (organization_id = $1 OR organization_id::text = $1::text) AND LOWER(role::text) IN ('superadmin', 'super_admin', 'manager')",
                org_id
            )
            targets = [_to_uuid(r["id"]) for r in rows if str(r["id"]) != str(submitter_id)]

    for target_id in targets:
        if not target_id:
            continue
        try:
            await conn.fetchval(
                "SELECT fn_create_timesheet_notification($1, $2, $3, $4, $5, $6, $7)",
                target_id, sub_uuid, title, None, deep_link, ts_uuid, "CREATED"
            )
            await _dispatch_notification_event(conn, target_id)
        except Exception as e:
            logger.error(f"Failed to create timesheet submitted notification for target {target_id}: {e}")


async def notify_timesheet_approved(conn: asyncpg.Connection, timesheet_id, submitter_id, approver_id, week_label: str):
    sub_uuid = _to_uuid(submitter_id)
    app_uuid = _to_uuid(approver_id)
    ts_uuid = _to_uuid(timesheet_id)
    if not sub_uuid:
        return None
    title = f"Your timesheet for {week_label} was approved"
    deep_link = f"/timesheets?id={timesheet_id}"
    try:
        result = await conn.fetchval(
            "SELECT fn_create_timesheet_notification($1, $2, $3, $4, $5, $6, $7)",
            sub_uuid, app_uuid, title, None, deep_link, ts_uuid, "STATUS_CHANGED"
        )
        await _dispatch_notification_event(conn, sub_uuid)
        return result
    except Exception as e:
        logger.error(f"Failed to create timesheet approved notification: {e}")
        return None

async def notify_timesheet_rejected(conn: asyncpg.Connection, timesheet_id, submitter_id, approver_id, week_label: str, comment: str = None):
    sub_uuid = _to_uuid(submitter_id)
    app_uuid = _to_uuid(approver_id)
    ts_uuid = _to_uuid(timesheet_id)
    if not sub_uuid:
        return None
    title = f"Your timesheet for {week_label} needs revision"
    body = comment[:120] if comment else None
    deep_link = f"/timesheets?id={timesheet_id}"
    try:
        result = await conn.fetchval(
            "SELECT fn_create_timesheet_notification($1, $2, $3, $4, $5, $6, $7)",
            sub_uuid, app_uuid, title, body, deep_link, ts_uuid, "STATUS_CHANGED"
        )
        await _dispatch_notification_event(conn, sub_uuid)
        return result
    except Exception as e:
        logger.error(f"Failed to create timesheet rejected notification: {e}")
        return None

async def notify_timesheet_recalled(conn: asyncpg.Connection, timesheet_id, submitter_id, approver_id, week_label: str, reason: str = None, submitter_name: str = None):
    sub_uuid = _to_uuid(submitter_id)
    app_uuid = _to_uuid(approver_id)
    ts_uuid = _to_uuid(timesheet_id)
    if not app_uuid:
        return None
    name_str = submitter_name or "A team member"
    title = f"{name_str} recalled their timesheet for {week_label}"
    body = reason[:120] if reason else None
    deep_link = "/timesheets/approvals"
    try:
        result = await conn.fetchval(
            "SELECT fn_create_timesheet_notification($1, $2, $3, $4, $5, $6, $7)",
            app_uuid, sub_uuid, title, body, deep_link, ts_uuid, "STATUS_CHANGED"
        )
        await _dispatch_notification_event(conn, app_uuid)
        return result
    except Exception as e:
        logger.error(f"Failed to create timesheet recalled notification: {e}")
        return None
