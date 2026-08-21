"""
SearchService — wraps fn_global_search for the KAI tool layer.
Org isolation is implicit: fn_global_search takes user_id + org_id as the
first two arguments, so cross-org leakage is impossible at the DB layer.
"""
import logging
from typing import Any, Dict, List

import asyncpg

from app.schemas.search import SearchResult

logger = logging.getLogger(__name__)

_MAX_LIMIT = 20  # Hard ceiling enforced server-side regardless of caller input


class SearchService:
    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def search(
        self,
        query: str,
        current_user: Dict[str, Any],
        limit: int = 10,
    ) -> List[SearchResult]:
        """
        Execute a full-text workspace search scoped to current_user's org.

        Args:
            query:        Search string; empty strings return an empty list immediately.
            current_user: Authenticated user dict; org_id and user_id taken from here.
            limit:        Max results; capped internally at _MAX_LIMIT.

        Returns:
            List of SearchResult ordered by relevance.
        """
        query = query.strip()
        if not query:
            return []

        safe_limit = min(max(1, limit), _MAX_LIMIT)
        user_id = current_user["id"]
        org_id = current_user["organization_id"]

        rows = await self.conn.fetch(
            "SELECT * FROM fn_global_search($1, $2, $3, $4)",
            user_id, org_id, query, safe_limit,
        )
        return [SearchResult(**dict(r)) for r in rows]
