import csv
import io
import json
import logging
from datetime import datetime
from typing import List, Optional
import asyncpg
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse

from app.schemas.admin import UserCreateAdmin, UserRoleUpdate, AdminUserResponse, AdminBoardResponse, BoardMemberAssign, AdminBoardMemberResponse
from app.auth.permissions import require_super_admin, require_manager_or_above
from app.database.connection import get_db_connection
from app.services.admin_service import AdminService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])


def get_admin_service(conn = Depends(get_db_connection)) -> AdminService:
    return AdminService(conn)

@router.get("/users", response_model=List[AdminUserResponse])
async def get_all_users(
    current_user: dict = Depends(require_super_admin),
    admin_service: AdminService = Depends(get_admin_service)
):
    return await admin_service.get_all_users(current_user)

@router.post("/users", response_model=AdminUserResponse)
async def create_user(
    user_in: UserCreateAdmin,
    current_user: dict = Depends(require_super_admin),
    admin_service: AdminService = Depends(get_admin_service)
):
    return await admin_service.create_user(user_in, current_user)

@router.patch("/users/{user_id}/role", response_model=AdminUserResponse)
async def update_user_role(
    user_id: int,
    role_in: UserRoleUpdate,
    current_user: dict = Depends(require_super_admin),
    admin_service: AdminService = Depends(get_admin_service)
):
    return await admin_service.update_user_role(user_id, role_in, current_user)

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    current_user: dict = Depends(require_super_admin),
    admin_service: AdminService = Depends(get_admin_service)
):
    await admin_service.delete_user(user_id, current_user)
    return None

@router.get("/boards", response_model=List[AdminBoardResponse])
async def get_all_boards(
    current_user: dict = Depends(require_super_admin),
    admin_service: AdminService = Depends(get_admin_service)
):
    return await admin_service.get_all_boards(current_user)

@router.post("/boards/{board_id}/members", status_code=status.HTTP_201_CREATED)
async def assign_user(
    board_id: int,
    assign_in: BoardMemberAssign,
    current_user: dict = Depends(require_manager_or_above),
    admin_service: AdminService = Depends(get_admin_service)
):
    await admin_service.assign_user(board_id, assign_in, current_user)
    return {"message": "User assigned to board"}

@router.delete("/boards/{board_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_user(
    board_id: int,
    user_id: int,
    current_user: dict = Depends(require_super_admin),
    admin_service: AdminService = Depends(get_admin_service)
):
    await admin_service.remove_user(board_id, user_id)
    return None

@router.get("/boards/{board_id}/members", response_model=List[AdminBoardMemberResponse])
async def get_board_members_admin(
    board_id: int,
    current_user: dict = Depends(require_super_admin),
    admin_service: AdminService = Depends(get_admin_service)
):
    return await admin_service.get_board_members_admin(board_id)


@router.get("/audit-log/export")
async def export_audit_log_csv(
    from_date: Optional[str] = Query(None, description="Start date filter (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="End date filter (YYYY-MM-DD)"),
    format: str = Query("csv", description="Export format (csv)"),
    current_user: dict = Depends(require_super_admin),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    """Export org audit log (activities & security events) as a CSV file. Requires Superadmin role."""
    org_id = current_user.get("organization_id")

    from_ts: Optional[datetime] = None
    to_ts: Optional[datetime] = None

    if from_date:
        try:
            from_ts = datetime.fromisoformat(from_date)
        except Exception:
            pass

    if to_date:
        try:
            to_ts = datetime.fromisoformat(to_date)
        except Exception:
            pass

    s_org_id = str(org_id) if org_id is not None else None

    rows = await conn.fetch(
        """
        SELECT 
            created_at AS timestamp,
            COALESCE(NULLIF(TRIM(CONCAT(actor_first_name, ' ', actor_last_name)), ''), actor_email, 'System') AS actor_name,
            COALESCE(actor_email, '') AS actor_email,
            activity_type::text AS event_type,
            entity_type::text AS entity_type,
            target_reference,
            old_value,
            new_value,
            metadata,
            COALESCE(metadata->>'ip_address', '') AS ip_address,
            COALESCE(metadata->>'user_agent', '') AS user_agent
        FROM v_activities_canonical
        WHERE (organization_id::text = $1::text OR organization_id::text = LTRIM(RIGHT($1::text, 12), '0'))
          AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR created_at <= $3::timestamptz)

        UNION ALL

        SELECT 
            s.created_at AS timestamp,
            COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email, 'System') AS actor_name,
            COALESCE(u.email, '') AS actor_email,
            s.action::text AS event_type,
            'SECURITY' AS entity_type,
            '' AS target_reference,
            NULL::jsonb AS old_value,
            s.details AS new_value,
            s.details AS metadata,
            COALESCE(s.ip_address, '') AS ip_address,
            COALESCE(s.details->>'user_agent', '') AS user_agent
        FROM v_security_events_canonical s
        LEFT JOIN users u ON u.id = s.user_id
        WHERE (s.organization_id::text = $1::text OR s.organization_id::text = LTRIM(RIGHT($1::text, 12), '0'))
          AND ($2::timestamptz IS NULL OR s.created_at >= $2::timestamptz)
          AND ($3::timestamptz IS NULL OR s.created_at <= $3::timestamptz)

        ORDER BY timestamp DESC
        """,
        s_org_id,
        from_ts,
        to_ts,
    )

    def build_description(r) -> str:
        event_type = r.get("event_type") or ""
        entity_type = r.get("entity_type") or ""
        target_ref = r.get("target_reference") or ""
        old_val = r.get("old_value")
        new_val = r.get("new_value")

        if isinstance(old_val, str):
            try: old_val = json.loads(old_val)
            except Exception: old_val = {}
        elif not isinstance(old_val, dict):
            old_val = {}

        if isinstance(new_val, str):
            try: new_val = json.loads(new_val)
            except Exception: new_val = {}
        elif not isinstance(new_val, dict):
            new_val = {}

        ref_str = f" ({target_ref})" if target_ref else ""

        if event_type == "STATUS_CHANGED":
            old_col = old_val.get("column_name") or "To Do"
            new_col = new_val.get("column_name") or "In Progress"
            return f"Changed task{ref_str} status from '{old_col}' to '{new_col}'"

        elif event_type == "ASSIGNEE_CHANGED":
            old_ass = old_val.get("assignee_name") or "Unassigned"
            new_ass = new_val.get("assignee_name") or "Unassigned"
            return f"Reassigned task{ref_str} from '{old_ass}' to '{new_ass}'"

        elif event_type == "PRIORITY_CHANGED":
            old_p = old_val.get("priority") or "Low"
            new_p = new_val.get("priority") or "High"
            return f"Changed task{ref_str} priority from '{old_p}' to '{new_p}'"

        elif event_type == "DUE_DATE_CHANGED":
            old_d = str(old_val.get("due_date")) if old_val.get("due_date") else "None"
            new_d = str(new_val.get("due_date")) if new_val.get("due_date") else "None"
            return f"Changed task{ref_str} due date from '{old_d}' to '{new_d}'"

        elif event_type == "TITLE_CHANGED":
            new_t = new_val.get("title") or ""
            return f"Updated task{ref_str} title to '{new_t}'"

        elif event_type == "CREATED":
            title = new_val.get("title") or ""
            return f"Created task{ref_str}" + (f": '{title}'" if title else "")

        elif event_type == "COMMENT_ADDED":
            return f"Added a comment on task{ref_str}"

        elif entity_type == "SECURITY":
            sec_action = event_type.replace("_", " ").title()
            return f"Security Event: {sec_action}"

        else:
            event_clean = event_type.replace("_", " ").title()
            return f"{entity_type} {event_clean}{ref_str}".strip()

    def generate():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Timestamp", "Actor Name", "Actor Email", "Event Type",
            "Description", "IP Address", "User Agent"
        ])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)

        for r in rows:
            ts_str = r["timestamp"].strftime("%Y-%m-%d %H:%M:%S") if r.get("timestamp") else ""
            desc = build_description(r)
            writer.writerow([
                ts_str,
                r["actor_name"] or "",
                r["actor_email"] or "",
                r["event_type"] or "",
                desc,
                r["ip_address"] or "",
                r["user_agent"] or "",
            ])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    filename = "audit_log.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

