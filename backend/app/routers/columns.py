import logging
import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas.column import ColumnCreate, ColumnUpdate, ColumnDelete, ColumnReorder, ColumnResponse
from app.schemas.envelope import DataEnvelope
from app.auth.permissions import require_manager_or_above
from app.database.connection import get_db_connection
from app.services.column_service import ColumnService
from app.websockets.manager import connection_manager

logger = logging.getLogger("kaio.routers.columns")

router = APIRouter(tags=["Columns"])

def get_column_service(conn: asyncpg.Connection = Depends(get_db_connection)) -> ColumnService:
    return ColumnService(conn)

@router.post("/boards/{board_id}/columns", response_model=DataEnvelope[ColumnResponse])
async def create_column(
    board_id: int,
    column_in: ColumnCreate,
    current_user: dict = Depends(require_manager_or_above),
    column_service: ColumnService = Depends(get_column_service)
):
    column = await column_service.add_column(board_id, column_in, current_user)
    await connection_manager.send_to_board(
        board_id=board_id,
        message={
            "type": "column_created",
            "board_id": board_id,
            "column": column.model_dump(mode="json")
        },
        exclude_user_id=current_user["id"],
    )
    return DataEnvelope(data=column)

@router.post("/boards/{board_id}/columns/reorder", response_model=DataEnvelope[dict])
async def reorder_columns(
    board_id: int,
    reorder_in: ColumnReorder,
    current_user: dict = Depends(require_manager_or_above),
    column_service: ColumnService = Depends(get_column_service)
):
    result = await column_service.reorder_columns(board_id, reorder_in, current_user)
    await connection_manager.send_to_board(
        board_id=board_id,
        message={
            "type": "column_reordered",
            "board_id": board_id,
            "ordered_column_ids": reorder_in.ordered_column_ids
        },
        exclude_user_id=current_user["id"],
    )
    return DataEnvelope(data=result)

@router.patch("/columns/{column_id}", response_model=DataEnvelope[ColumnResponse])
async def rename_column(
    column_id: int,
    column_in: ColumnUpdate,
    current_user: dict = Depends(require_manager_or_above),
    column_service: ColumnService = Depends(get_column_service)
):
    column = await column_service.rename_column(column_id, column_in, current_user)
    await connection_manager.send_to_board(
        board_id=column.board_id,
        message={
            "type": "column_updated",
            "board_id": column.board_id,
            "column": column.model_dump(mode="json")
        },
        exclude_user_id=current_user["id"],
    )
    return DataEnvelope(data=column)

@router.delete("/columns/{column_id}", response_model=DataEnvelope[dict])
async def delete_column(
    column_id: int,
    delete_in: ColumnDelete,
    current_user: dict = Depends(require_manager_or_above),
    column_service: ColumnService = Depends(get_column_service),
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    # Lookup board_id before deleting for WS notification
    board_id = await conn.fetchval(
        "SELECT board_id FROM board_columns WHERE id = $1 AND deleted_at IS NULL",
        column_id
    )
    result = await column_service.delete_column(column_id, delete_in, current_user)
    if board_id:
        await connection_manager.send_to_board(
            board_id=board_id,
            message={
                "type": "column_deleted",
                "board_id": board_id,
                "column_id": column_id,
                "target_column_id": delete_in.target_column_id
            },
            exclude_user_id=current_user["id"],
        )
    return DataEnvelope(data=result)
