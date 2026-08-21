"""
TimesheetReadService — read-only timesheet queries for the KAI tool layer.

MEMBER scope:    v_timesheets_canonical WHERE user_id = current AND org_id = current.
MANAGER / SUPER_ADMIN scope: v_timesheet_org_summary_canonical WHERE org_id = current.

Role-based scope downgrade is performed in the tool layer (GetTimesheetStatusTool),
not here, so this service exposes two clean, separate methods.
"""
import logging
from typing import Any, Dict, List
from uuid import UUID

import asyncpg

logger = logging.getLogger(__name__)


def _to_uuid(val: Any) -> UUID | None:
    """Coerce org_id to UUID — mirrors the pattern used in dashboard_service.py."""
    if val is None:
        return None
    if isinstance(val, UUID):
        return val
    s = str(val).strip()
    if s.isdigit():
        return UUID(f"00000000-0000-0000-0000-{int(s):012d}")
    try:
        return UUID(s)
    except Exception:
        return None


class TimesheetReadService:
    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def get_own_timesheets(
        self, current_user: Dict[str, Any], weeks: int = 4
    ) -> Dict[str, Any]:
        """
        Return the authenticated user's own timesheets for the last `weeks` weeks.

        Returns:
            {
                "scope": "own",
                "timesheets": [
                    {
                        "id": str,
                        "week_start_date": str,
                        "status": str,
                        "total_hours": float,
                        "submitted_at": str | None,
                    },
                    ...
                ]
            }
        """
        user_uuid = _to_uuid(current_user.get("id"))
        org_uuid = _to_uuid(current_user.get("organization_id"))

        rows = await self.conn.fetch(
            """
            SELECT id, week_start_date, status, total_hours, submitted_at
            FROM v_timesheets_canonical
            WHERE user_id = $1 AND org_id = $2
            ORDER BY week_start_date DESC
            LIMIT $3
            """,
            user_uuid,
            org_uuid,
            weeks,
        )

        timesheets = [
            {
                "id": str(r["id"]),
                "week_start_date": (
                    r["week_start_date"].isoformat()
                    if r["week_start_date"]
                    else None
                ),
                "status": r["status"],
                "total_hours": (
                    float(r["total_hours"]) if r["total_hours"] is not None else 0.0
                ),
                "submitted_at": (
                    r["submitted_at"].isoformat() if r["submitted_at"] else None
                ),
            }
            for r in rows
        ]

        return {"scope": "own", "timesheets": timesheets}

    async def get_org_summary(
        self, current_user: Dict[str, Any], weeks: int = 4
    ) -> Dict[str, Any]:
        """
        Return org-wide weekly timesheet summary for the last `weeks` weeks.
        Caller is responsible for ensuring the user has MANAGER/SUPER_ADMIN role
        before calling this method.

        Returns:
            {
                "scope": "org",
                "weekly_summaries": [
                    {
                        "week_start_date": str,
                        "total_hours_logged": float,
                        "compliance_rate": float,
                        "submitted_count": int | None,
                    },
                    ...
                ]
            }
        """
        org_uuid = _to_uuid(current_user.get("organization_id"))

        rows = await self.conn.fetch(
            """
            SELECT week_start_date, total_hours_logged, compliance_rate, submitted_count
            FROM v_timesheet_org_summary_canonical
            WHERE org_id = $1
            ORDER BY week_start_date DESC
            LIMIT $2
            """,
            org_uuid,
            weeks,
        )

        summaries = [
            {
                "week_start_date": (
                    r["week_start_date"].isoformat()
                    if r["week_start_date"]
                    else None
                ),
                "total_hours_logged": (
                    float(r["total_hours_logged"])
                    if r["total_hours_logged"] is not None
                    else 0.0
                ),
                "compliance_rate": (
                    float(r["compliance_rate"])
                    if r["compliance_rate"] is not None
                    else 0.0
                ),
                "submitted_count": r.get("submitted_count"),
            }
            for r in rows
        ]

        return {"scope": "org", "weekly_summaries": summaries}
