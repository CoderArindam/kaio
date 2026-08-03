import logging
import asyncpg
from typing import Optional
from fastapi import HTTPException

from app.schemas.column import ColumnCreate, ColumnUpdate, ColumnDelete, ColumnReorder, ColumnResponse

logger = logging.getLogger("kaio.services.column")

class ColumnService:
    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def add_column(self, board_id: int, column_in: ColumnCreate, current_user: dict) -> ColumnResponse:
        try:
            row = await self.conn.fetchrow(
                "SELECT * FROM fn_add_column($1, $2, $3, $4, $5)",
                board_id,
                column_in.name,
                column_in.column_type,
                column_in.position,
                current_user["id"]
            )
            if not row:
                raise HTTPException(status_code=400, detail="Failed to create column")
            return ColumnResponse(**dict(row))
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating column on board {board_id}: {e}")
            raise HTTPException(status_code=400, detail=str(e))

    async def rename_column(self, column_id: int, column_in: ColumnUpdate, current_user: dict) -> ColumnResponse:
        try:
            row = await self.conn.fetchrow(
                "SELECT * FROM fn_rename_column($1, $2, $3, $4)",
                column_id,
                column_in.name,
                column_in.column_type,
                current_user["id"]
            )
            if not row:
                raise HTTPException(status_code=404, detail="Column not found or failed to update")
            return ColumnResponse(**dict(row))
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error updating column {column_id}: {e}")
            raise HTTPException(status_code=400, detail=str(e))

    async def delete_column(self, column_id: int, delete_in: ColumnDelete, current_user: dict) -> dict:
        try:
            success = await self.conn.fetchval(
                "SELECT fn_delete_column($1, $2, $3)",
                column_id,
                delete_in.target_column_id,
                current_user["id"]
            )
            if not success:
                raise HTTPException(status_code=400, detail="Failed to delete column")
            return {"success": True}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error deleting column {column_id}: {e}")
            raise HTTPException(status_code=400, detail=str(e))

    async def reorder_columns(self, board_id: int, reorder_in: ColumnReorder, current_user: dict) -> dict:
        try:
            success = await self.conn.fetchval(
                "SELECT fn_reorder_columns($1, $2, $3)",
                board_id,
                reorder_in.ordered_column_ids,
                current_user["id"]
            )
            if not success:
                raise HTTPException(status_code=400, detail="Failed to reorder columns")
            return {"success": True}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error reordering columns on board {board_id}: {e}")
            raise HTTPException(status_code=400, detail=str(e))
