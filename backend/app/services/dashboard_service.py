import json
import logging
from uuid import UUID
import asyncpg
from fastapi import HTTPException

from app.schemas.dashboard import (
    DashboardSummaryResponse,
    DashboardKPIs,
    DashboardTasksByStatus,
    DashboardBoardSummary,
    DashboardTopMember,
    DashboardRecentMeeting,
    DashboardFocusTask,
)
from app.schemas.activity import CanonicalActivityResponse

logger = logging.getLogger(__name__)


def _parse_uuid(val: str | UUID | int | None) -> UUID | None:
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


class DashboardService:
    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def get_dashboard_summary(self, current_user: dict) -> DashboardSummaryResponse:
        try:
            org_id = current_user.get("organization_id")
            user_id = current_user.get("id")
            role = current_user.get("role")
            if not org_id:
                raise HTTPException(status_code=400, detail="Organization context missing")

            ts_org_uuid = _parse_uuid(org_id)
            is_super_admin = (role == 'SUPER_ADMIN')

            if is_super_admin:
                # 1. Org KPIs
                kpi_row = await self.conn.fetchrow(
                    "SELECT * FROM v_dashboard_kpis_canonical WHERE organization_id = $1",
                    org_id
                )

                # 2. Per-board summaries
                board_rows = await self.conn.fetch(
                    "SELECT * FROM v_dashboard_board_summaries_canonical WHERE organization_id = $1 ORDER BY name ASC",
                    org_id
                )

                # 3. Recent activity
                activity_rows = await self.conn.fetch(
                    "SELECT * FROM v_activities_canonical WHERE organization_id = $1 ORDER BY created_at DESC, id DESC LIMIT 10",
                    org_id
                )
            else:
                # 1. Scoped KPIs
                kpi_row = await self.conn.fetchrow(
                    """
                    SELECT 
                        (SELECT COUNT(t.id) FROM tasks t JOIN boards b ON t.board_id = b.id WHERE b.organization_id = $1 AND can_view_board($2, b.id) AND t.deleted_at IS NULL AND b.deleted_at IS NULL) AS total_tasks,
                        (SELECT COUNT(t.id) FROM tasks t JOIN boards b ON t.board_id = b.id JOIN board_columns c ON t.column_id = c.id WHERE b.organization_id = $1 AND can_view_board($2, b.id) AND c.column_type = 'TODO' AND LOWER(c.name) NOT LIKE '%review%' AND t.deleted_at IS NULL AND b.deleted_at IS NULL) AS todo_tasks,
                        (SELECT COUNT(t.id) FROM tasks t JOIN boards b ON t.board_id = b.id JOIN board_columns c ON t.column_id = c.id WHERE b.organization_id = $1 AND can_view_board($2, b.id) AND c.column_type = 'IN_PROGRESS' AND LOWER(c.name) NOT LIKE '%review%' AND t.deleted_at IS NULL AND b.deleted_at IS NULL) AS in_progress_tasks,
                        (SELECT COUNT(t.id) FROM tasks t JOIN boards b ON t.board_id = b.id JOIN board_columns c ON t.column_id = c.id WHERE b.organization_id = $1 AND can_view_board($2, b.id) AND (LOWER(c.name) LIKE '%review%' OR c.column_type::text = 'REVIEW') AND t.deleted_at IS NULL AND b.deleted_at IS NULL) AS review_tasks,
                        (SELECT COUNT(t.id) FROM tasks t JOIN boards b ON t.board_id = b.id JOIN board_columns c ON t.column_id = c.id WHERE b.organization_id = $1 AND can_view_board($2, b.id) AND c.column_type = 'DONE' AND t.deleted_at IS NULL AND b.deleted_at IS NULL) AS done_tasks,
                        (SELECT COUNT(t.id) FROM tasks t JOIN boards b ON t.board_id = b.id JOIN board_columns c ON t.column_id = c.id WHERE b.organization_id = $1 AND can_view_board($2, b.id) AND t.due_date < CURRENT_TIMESTAMP AND c.column_type != 'DONE' AND t.deleted_at IS NULL AND b.deleted_at IS NULL) AS overdue_tasks,
                        (SELECT COUNT(*) FROM boards WHERE organization_id = $1 AND deleted_at IS NULL AND archived_at IS NULL AND can_view_board($2, id)) AS total_boards,
                        (SELECT COUNT(*) FROM (SELECT DISTINCT bm.user_id FROM board_members bm JOIN boards b ON bm.board_id = b.id WHERE b.organization_id = $1 AND b.deleted_at IS NULL AND can_view_board($2, b.id)) AS scoped_users) AS total_team_members,
                        (SELECT COUNT(*) FROM task_proposals tp JOIN boards b ON tp.board_id = b.id WHERE tp.org_id = $1 AND tp.status::text = 'pending' AND can_view_board($2, b.id)) AS pending_proposals_count,
                        (SELECT COUNT(*) FROM meeting_sessions ms WHERE ms.org_id = $1 AND ms.initiated_by_user_id = $2 AND LOWER(ms.status) NOT IN ('completed', 'failed', 'finished', 'terminated', 'disconnected', 'meeting_ended', 'meeting_not_found', 'permission_denied', 'network_failure', 'login_required', 'unknown_error')) AS active_meetings_count
                    """,
                    org_id, user_id
                )

                # 2. Scoped Per-board summaries
                board_rows = await self.conn.fetch(
                    "SELECT * FROM v_dashboard_board_summaries_canonical WHERE organization_id = $1 AND can_view_board($2, board_id) ORDER BY name ASC",
                    org_id, user_id
                )

                # 3. Scoped Recent activity
                activity_rows = await self.conn.fetch(
                    "SELECT * FROM v_activities_canonical WHERE organization_id = $1 AND target_board_id IS NOT NULL AND can_view_board($2, target_board_id) ORDER BY created_at DESC, id DESC LIMIT 10",
                    org_id, user_id
                )

            # 4. Recent meetings (last 5)
            if is_super_admin:
                meeting_rows = await self.conn.fetch(
                    "SELECT * FROM v_dashboard_recent_meetings_canonical WHERE org_id = $1 ORDER BY created_at DESC LIMIT 5",
                    org_id
                )
            else:
                meeting_rows = await self.conn.fetch(
                    "SELECT * FROM v_dashboard_recent_meetings_canonical WHERE org_id = $1 AND initiated_by_user_id = $2 ORDER BY created_at DESC LIMIT 5",
                    org_id, user_id
                )

            # 5. Focus tasks for current user
            focus_task_rows = await self.conn.fetch(
                """
                SELECT t.id, t.title, t.priority, t.due_date, t.board_id, t.column_id,
                       b.name AS board_name, c.column_type
                FROM tasks t
                JOIN boards b ON t.board_id = b.id
                JOIN board_columns c ON t.column_id = c.id
                WHERE t.assigned_to = $1
                  AND t.deleted_at IS NULL
                  AND b.deleted_at IS NULL
                  AND c.column_type != 'DONE'
                ORDER BY
                    CASE WHEN t.due_date IS NOT NULL THEN 0 ELSE 1 END,
                    t.due_date ASC,
                    CASE t.priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END
                LIMIT 5
                """,
                user_id
            )

            # 6. Pending approvals count
            if is_super_admin:
                approval_row = await self.conn.fetchrow(
                    "SELECT COUNT(*) AS pending_count FROM v_timesheets_canonical WHERE org_id = $1 AND status = 'submitted'",
                    ts_org_uuid
                )
            else:
                approval_row = await self.conn.fetchrow(
                    """
                    SELECT COUNT(*) AS pending_count FROM v_timesheets_canonical 
                    WHERE org_id = $1 AND status = 'submitted' 
                    AND (approver_id::text = $2::text OR LTRIM(RIGHT(approver_id::text, 12), '0') = LTRIM(RIGHT($2::text, 12), '0'))
                    """,
                    ts_org_uuid, str(user_id)
                )

            # 7. Latest timesheet compliance
            if is_super_admin:
                compliance_row = await self.conn.fetchrow(
                    "SELECT compliance_rate, total_hours_logged FROM v_timesheet_org_summary_canonical WHERE org_id = $1 ORDER BY week_start_date DESC LIMIT 1",
                    ts_org_uuid
                )
            else:
                # Scoped compliance metrics can be complex; we can just set to 0 for managers for now
                compliance_row = None

            # --- Build KPIs ---
            if kpi_row:
                kpis = DashboardKPIs(
                    total_tasks=kpi_row["total_tasks"] or 0,
                    tasks_by_status=DashboardTasksByStatus(
                        todo=kpi_row["todo_tasks"] or 0,
                        in_progress=kpi_row["in_progress_tasks"] or 0,
                        review=kpi_row["review_tasks"] or 0,
                        done=kpi_row["done_tasks"] or 0
                    ),
                    overdue_tasks=kpi_row["overdue_tasks"] or 0,
                    total_boards=kpi_row["total_boards"] or 0,
                    team_size=kpi_row["total_team_members"] or 0,
                    pending_proposals_count=kpi_row["pending_proposals_count"] or 0,
                    active_meetings_count=kpi_row["active_meetings_count"] or 0
                )
            else:
                kpis = DashboardKPIs(
                    total_tasks=0,
                    tasks_by_status=DashboardTasksByStatus(todo=0, in_progress=0, review=0, done=0),
                    overdue_tasks=0, total_boards=0, team_size=0,
                    pending_proposals_count=0, active_meetings_count=0
                )

            # --- Build board summaries with top_members ---
            boards = []
            for r in board_rows:
                raw = dict(r)
                raw_members = raw.pop("top_members", None) or []
                if isinstance(raw_members, str):
                    raw_members = json.loads(raw_members)
                top_members = [DashboardTopMember(**m) for m in (raw_members or [])]
                boards.append(DashboardBoardSummary(**raw, top_members=top_members))

            recent_activity = [CanonicalActivityResponse(**dict(r)) for r in activity_rows]
            recent_meetings = [DashboardRecentMeeting(**dict(r)) for r in meeting_rows]
            focus_tasks = [DashboardFocusTask(**dict(r)) for r in focus_task_rows]
            pending_approvals_count = int(approval_row["pending_count"]) if approval_row else 0
            timesheet_compliance_rate = float(compliance_row["compliance_rate"]) if compliance_row and compliance_row["compliance_rate"] is not None else 0.0
            timesheet_hours_logged = float(compliance_row["total_hours_logged"]) if compliance_row and compliance_row["total_hours_logged"] is not None else 0.0

            return DashboardSummaryResponse(
                kpis=kpis,
                boards=boards,
                recent_activity=recent_activity,
                recent_meetings=recent_meetings,
                focus_tasks=focus_tasks,
                pending_approvals_count=pending_approvals_count,
                timesheet_compliance_rate=timesheet_compliance_rate,
                timesheet_hours_logged=timesheet_hours_logged,
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error fetching dashboard summary: {e}")
            raise HTTPException(status_code=400, detail="An unexpected error occurred while generating dashboard summary")

    async def get_board_health_summary(
        self, board_id: int, current_user: dict
    ) -> dict:
        """
        Return a health snapshot for a single board.

        Board-level access is enforced by querying v_dashboard_board_summaries_canonical
        with both org_id and can_view_board(user_id, board_id) — the same pattern
        used in get_dashboard_summary().  If the user cannot see the board the view
        returns no rows and we raise ValueError.

        Args:
            board_id:     The integer ID of the board to inspect.
            current_user: Authenticated user dict — org_id and user_id taken from here.

        Returns:
            dict with board metadata, task counts by status, progress %, overdue count,
            member count, and top members.

        Raises:
            ValueError: board not found or user has no access.
        """
        org_id = current_user["organization_id"]
        user_id = current_user["id"]

        # Board summary row — access gate is baked into the WHERE clause
        board_row = await self.conn.fetchrow(
            """
            SELECT *
            FROM v_dashboard_board_summaries_canonical
            WHERE organization_id = $1
              AND board_id = $2
              AND can_view_board($3, board_id)
            """,
            org_id,
            board_id,
            user_id,
        )

        if not board_row:
            raise ValueError(
                f"Board {board_id} not found or you do not have access to it."
            )

        raw = dict(board_row)
        raw_members = raw.pop("top_members", None) or []
        if isinstance(raw_members, str):
            raw_members = json.loads(raw_members)
        top_members = [
            {
                "user_id": m.get("user_id"),
                "display_name": f"{m.get('first_name', '')} {m.get('last_name', '')}".strip(),
                "permission": m.get("permission"),
            }
            for m in (raw_members or [])
        ]

        # Overdue rate as a derived metric
        task_count = raw.get("task_count") or 0
        overdue_count = raw.get("overdue_count") or 0
        overdue_rate = (
            round(overdue_count / task_count * 100, 1) if task_count > 0 else 0.0
        )

        return {
            "board_id": raw.get("board_id") or board_id,
            "name": raw.get("name"),
            "total_tasks": task_count,
            "completed_tasks": raw.get("completed_task_count") or 0,
            "progress_percent": raw.get("completion_percentage") or 0.0,
            "overdue_tasks": overdue_count,
            "overdue_rate_percent": overdue_rate,
            "member_count": raw.get("member_count") or 0,
            "top_members": top_members,
        }

