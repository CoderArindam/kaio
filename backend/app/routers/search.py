import logging
from typing import List, Optional
import asyncpg
from fastapi import APIRouter, Depends, Query, HTTPException

from app.auth.dependencies import get_current_user
from app.database.connection import get_db_connection
from app.schemas.search import SearchResult
from app.schemas.envelope import DataEnvelope

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Search"])


@router.get("/search", response_model=DataEnvelope[List[SearchResult]])
async def global_search(
    q: str = Query(..., description="Search query string"),
    limit: int = Query(10, ge=1, le=50, description="Max results limit"),
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    query_str = q.strip()
    if not query_str:
        return DataEnvelope(data=[])

    org_id = current_user["organization_id"]

    try:
        sql = """
            SELECT id, title, type, board_id, task_id, org_id
            FROM v_global_search_canonical
            WHERE org_id = $1
              AND (
                  search_vector @@ plainto_tsquery('english', $2)
                  OR title ILIKE '%' || $2 || '%'
              )
            LIMIT $3
        """
        rows = await conn.fetch(sql, org_id, query_str, limit)
        results = [SearchResult(**dict(r)) for r in rows]
        return DataEnvelope(data=results)
    except Exception as e:
        logger.error(f"Error performing global search: {e}")
        raise HTTPException(status_code=400, detail="Search failed")
