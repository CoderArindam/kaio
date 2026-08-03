import logging
from typing import List
import asyncpg
from fastapi import APIRouter, Depends, HTTPException

from app.schemas.subtask import SubtaskCreate, SubtaskReorder, SubtaskResponse
from app.schemas.envelope import DataEnvelope
from app.auth.dependencies import get_current_user
from app.database.connection import get_db_connection
from app.websockets.manager import connection_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Subtasks"])

@router.get("/tasks/{task_id}/subtasks", response_model=DataEnvelope[List[SubtaskResponse]])
async def list_subtasks(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    try:
        task_row = await conn.fetchrow("SELECT board_id FROM v_tasks_canonical WHERE id = $1", task_id)
        if not task_row:
            raise HTTPException(status_code=404, detail="Task not found")

        has_access = await conn.fetchval("SELECT can_view_board($1, $2)", current_user["id"], task_row["board_id"])
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied")

        rows = await conn.fetch(
            "SELECT id, task_id, title, is_completed, position, created_by, creator_name, created_at FROM v_subtasks_canonical WHERE task_id = $1 ORDER BY position ASC, id ASC",
            task_id
        )
        subtasks = [SubtaskResponse(**dict(r)) for r in rows]
        return DataEnvelope(data=subtasks)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching subtasks: {e}")
        raise HTTPException(status_code=400, detail="Failed to fetch subtasks")


@router.post("/tasks/{task_id}/subtasks", response_model=DataEnvelope[SubtaskResponse])
async def create_subtask(
    task_id: int,
    subtask_in: SubtaskCreate,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    try:
        row = await conn.fetchrow(
            "SELECT * FROM fn_create_subtask($1, $2, $3)",
            task_id, subtask_in.title, current_user["id"]
        )
        if not row:
            raise HTTPException(status_code=400, detail="Failed to create subtask")

        # Fetch canonical details including creator_name
        canonical_row = await conn.fetchrow(
            "SELECT id, task_id, title, is_completed, position, created_by, creator_name, created_at FROM v_subtasks_canonical WHERE id = $1",
            row["id"]
        )
        subtask = SubtaskResponse(**dict(canonical_row or row))

        task_row = await conn.fetchrow("SELECT board_id FROM v_tasks_canonical WHERE id = $1", task_id)
        if task_row:
            await connection_manager.send_to_board(
                board_id=task_row["board_id"],
                message={"type": "task_updated", "board_id": task_row["board_id"], "task_id": task_id, "action": "subtask_created"}
            )

        return DataEnvelope(data=subtask)
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e)
        if "Access denied" in err_msg:
            raise HTTPException(status_code=403, detail=err_msg)
        elif "Task not found" in err_msg:
            raise HTTPException(status_code=404, detail="Task not found")
        logger.error(f"Error creating subtask: {e}")
        raise HTTPException(status_code=400, detail="Failed to create subtask")


@router.patch("/subtasks/{subtask_id}/toggle", response_model=DataEnvelope[SubtaskResponse])
async def toggle_subtask(
    subtask_id: int,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    try:
        row = await conn.fetchrow(
            "SELECT * FROM fn_toggle_subtask($1, $2)",
            subtask_id, current_user["id"]
        )
        if not row:
            raise HTTPException(status_code=400, detail="Failed to toggle subtask")

        canonical_row = await conn.fetchrow(
            "SELECT id, task_id, title, is_completed, position, created_by, creator_name, created_at FROM v_subtasks_canonical WHERE id = $1",
            subtask_id
        )
        subtask = SubtaskResponse(**dict(canonical_row or row))

        task_row = await conn.fetchrow("SELECT board_id FROM v_tasks_canonical WHERE id = $1", subtask.task_id)
        if task_row:
            await connection_manager.send_to_board(
                board_id=task_row["board_id"],
                message={"type": "task_updated", "board_id": task_row["board_id"], "task_id": subtask.task_id, "action": "subtask_toggled"}
            )

        return DataEnvelope(data=subtask)
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e)
        if "Access denied" in err_msg:
            raise HTTPException(status_code=403, detail=err_msg)
        elif "Subtask not found" in err_msg:
            raise HTTPException(status_code=404, detail="Subtask not found")
        logger.error(f"Error toggling subtask: {e}")
        raise HTTPException(status_code=400, detail="Failed to toggle subtask")


@router.delete("/subtasks/{subtask_id}", response_model=DataEnvelope[dict])
async def delete_subtask(
    subtask_id: int,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    try:
        subtask_row = await conn.fetchrow("SELECT task_id FROM v_subtasks_canonical WHERE id = $1", subtask_id)
        task_id = subtask_row["task_id"] if subtask_row else None

        success = await conn.fetchval("SELECT fn_delete_subtask($1, $2)", subtask_id, current_user["id"])

        if task_id:
            task_row = await conn.fetchrow("SELECT board_id FROM v_tasks_canonical WHERE id = $1", task_id)
            if task_row:
                await connection_manager.send_to_board(
                    board_id=task_row["board_id"],
                    message={"type": "task_updated", "board_id": task_row["board_id"], "task_id": task_id, "action": "subtask_deleted"}
                )

        return DataEnvelope(data={"success": bool(success)})
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e)
        if "Access denied" in err_msg:
            raise HTTPException(status_code=403, detail=err_msg)
        elif "Subtask not found" in err_msg:
            raise HTTPException(status_code=404, detail="Subtask not found")
        logger.error(f"Error deleting subtask: {e}")
        raise HTTPException(status_code=400, detail="Failed to delete subtask")


@router.post("/tasks/{task_id}/subtasks/reorder", response_model=DataEnvelope[dict])
async def reorder_subtasks(
    task_id: int,
    payload: SubtaskReorder,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    try:
        success = await conn.fetchval(
            "SELECT fn_reorder_subtasks($1, $2, $3)",
            task_id, payload.ordered_ids, current_user["id"]
        )

        task_row = await conn.fetchrow("SELECT board_id FROM v_tasks_canonical WHERE id = $1", task_id)
        if task_row:
            await connection_manager.send_to_board(
                board_id=task_row["board_id"],
                message={"type": "task_updated", "board_id": task_row["board_id"], "task_id": task_id, "action": "subtasks_reordered"}
            )

        return DataEnvelope(data={"success": bool(success)})
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e)
        if "Access denied" in err_msg:
            raise HTTPException(status_code=403, detail=err_msg)
        elif "Task not found" in err_msg:
            raise HTTPException(status_code=404, detail="Task not found")
        logger.error(f"Error reordering subtasks: {e}")
        raise HTTPException(status_code=400, detail="Failed to reorder subtasks")
