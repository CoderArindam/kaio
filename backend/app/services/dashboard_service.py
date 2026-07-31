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
            if not org_id:
                raise HTTPException(status_code=400, detail="Organization context missing")

            ts_org_uuid = _parse_uuid(org_id)

            # 1. Org KPIs
            kpi_row = await self.conn.fetchrow(
                "SELECT * FROM v_dashboard_kpis_canonical WHERE organization_id = $1",
                org_id
            )

            # 2. Per-board summaries (now includes top_members JSON)
            board_rows = await self.conn.fetch(
                "SELECT * FROM v_dashboard_board_summaries_canonical WHERE organization_id = $1 ORDER BY name ASC",
                org_id
            )

            # 3. Recent activity (last 10)
            activity_rows = await self.conn.fetch(
                "SELECT * FROM v_activities_canonical WHERE organization_id = $1 ORDER BY created_at DESC, id DESC LIMIT 10",
                org_id
            )

            # 4. Recent meetings (last 5) — replaces separate /meeting/sessions frontend call
            meeting_rows = await self.conn.fetch(
                "SELECT * FROM v_dashboard_recent_meetings_canonical WHERE org_id = $1 ORDER BY created_at DESC LIMIT 5",
                org_id
            )

            # 5. Focus tasks for current user — replaces /my-work/tasks frontend call
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

            # 6. Pending approvals count — replaces /timesheets/approvals/queue/summary frontend call
            approval_row = await self.conn.fetchrow(
                "SELECT COUNT(*) AS pending_count FROM v_timesheets_canonical WHERE org_id = $1 AND status = 'submitted'",
                ts_org_uuid
            )

            # 7. Latest timesheet compliance — replaces /timesheets/reports/org-summary frontend call
            compliance_row = await self.conn.fetchrow(
                "SELECT compliance_rate, total_hours_logged FROM v_timesheet_org_summary_canonical WHERE org_id = $1 ORDER BY week_start_date DESC LIMIT 1",
                ts_org_uuid
            )

            # --- Build KPIs ---
            if kpi_row:
                kpis = DashboardKPIs(
                    total_tasks=kpi_row["total_tasks"],
                    tasks_by_status=DashboardTasksByStatus(
                        todo=kpi_row["todo_tasks"],
                        in_progress=kpi_row["in_progress_tasks"],
                        review=kpi_row["review_tasks"],
                        done=kpi_row["done_tasks"]
                    ),
                    overdue_tasks=kpi_row["overdue_tasks"],
                    total_boards=kpi_row["total_boards"],
                    team_size=kpi_row["total_team_members"],
                    pending_proposals_count=kpi_row["pending_proposals_count"],
                    active_meetings_count=kpi_row["active_meetings_count"]
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
                # asyncpg with json codec returns list directly; fallback for string
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
