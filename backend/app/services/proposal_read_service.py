"""
ProposalReadService — read-only access to v_task_proposals_canonical.

This service is intentionally read-only and separate from any write path.
Role enforcement (MANAGER / SUPER_ADMIN) is handled by BaseTool.run() via
required_roles; this service does not re-check roles.  It only needs org_id
from the caller to scope queries.
"""
import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

import asyncpg

from app.schemas.task_proposal import TaskProposalOut

logger = logging.getLogger(__name__)


class ProposalReadService:
    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def get_pending_summary(
        self, current_user: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Return a count-by-status summary and the list of pending proposals
        for the current user's organisation, ordered by confidence_score DESC.

        The view is already scoped to the org; we add org_id as an explicit
        filter so index coverage is predictable.

        Returns:
            {
                "counts": {"pending": int, "approved": int, "rejected": int},
                "pending_proposals": [
                    {
                        "id": str,
                        "title": str,
                        "board_name": str | None,
                        "confidence_score": float | None,
                        "source_quote_excerpt": str | None,
                        "created_at": str,
                    },
                    ...
                ]
            }
        """
        org_id = current_user["organization_id"]

        # Count by status in a single pass
        count_rows = await self.conn.fetch(
            """
            SELECT status, COUNT(*)::int AS cnt
            FROM v_task_proposals_canonical
            WHERE org_id = $1
            GROUP BY status
            """,
            org_id,
        )
        counts: Dict[str, int] = {"pending": 0, "approved": 0, "rejected": 0}
        for row in count_rows:
            status = str(row["status"]).lower()
            if status in counts:
                counts[status] = row["cnt"]

        # Fetch pending proposals — only fields useful to KAI
        pending_rows = await self.conn.fetch(
            """
            SELECT id, title, board_name, confidence_score,
                   source_transcript_quote, created_at
            FROM v_task_proposals_canonical
            WHERE org_id = $1 AND status = 'pending'
            ORDER BY confidence_score DESC NULLS LAST, created_at DESC
            LIMIT 25
            """,
            org_id,
        )

        proposals = []
        for r in pending_rows:
            quote = r["source_transcript_quote"] or ""
            proposals.append(
                {
                    "id": str(r["id"]),
                    "title": r["title"],
                    "board_name": r["board_name"],
                    "confidence_score": (
                        round(float(r["confidence_score"]), 2)
                        if r["confidence_score"] is not None
                        else None
                    ),
                    # Truncate quote to 120 chars to keep KAI context lean
                    "source_quote_excerpt": quote[:120] if quote else None,
                    "created_at": (
                        r["created_at"].isoformat() if r["created_at"] else None
                    ),
                }
            )

        return {"counts": counts, "pending_proposals": proposals}
