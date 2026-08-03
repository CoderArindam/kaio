import logging
from typing import List
import asyncpg
from fastapi import APIRouter, Depends, HTTPException

from app.schemas.label import LabelCreate, LabelResponse
from app.schemas.envelope import DataEnvelope
from app.auth.dependencies import get_current_user
from app.database.connection import get_db_connection
from app.websockets.manager import connection_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Labels"])

@router.get("/boards/{board_id}/labels", response_model=DataEnvelope[List[LabelResponse]])
async def get_board_labels(
    board_id: int,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    try:
        has_access = await conn.fetchval("SELECT can_view_board($1, $2)", current_user["id"], board_id)
        if not has_access:
            raise HTTPException(status_code=403, detail="Board not found or access denied")

        rows = await conn.fetch("SELECT id, board_id, name, color, created_at FROM v_labels_canonical WHERE board_id = $1 ORDER BY name ASC", board_id)
        labels = [LabelResponse(**dict(r)) for r in rows]
        return DataEnvelope(data=labels)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching board labels: {e}")
        raise HTTPException(status_code=400, detail="Failed to fetch board labels")


@router.post("/boards/{board_id}/labels", response_model=DataEnvelope[LabelResponse])
async def create_label(
    board_id: int,
    label_in: LabelCreate,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    try:
        row = await conn.fetchrow(
            "SELECT * FROM fn_create_label($1, $2, $3, $4)",
            board_id, label_in.name, label_in.color, current_user["id"]
        )
        if not row:
            raise HTTPException(status_code=400, detail="Failed to create label")

        label = LabelResponse(**dict(row))

        # Broadcast real-time websocket notification to board members
        await connection_manager.send_to_board(
            board_id=board_id,
            message={"type": "label_created", "board_id": board_id, "label": label.model_dump(mode="json")}
        )

        return DataEnvelope(data=label)
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e)
        if "Access denied" in err_msg:
            raise HTTPException(status_code=403, detail=err_msg)
        elif "unique constraint" in err_msg.lower() or "labels_board_name_unique_idx" in err_msg:
            raise HTTPException(status_code=409, detail=f"Label '{label_in.name}' already exists on this board")
        logger.error(f"Error creating label: {e}")
        raise HTTPException(status_code=400, detail="Failed to create label")


@router.delete("/labels/{label_id}", response_model=DataEnvelope[dict])
async def delete_label(
    label_id: int,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    try:
        success = await conn.fetchval("SELECT fn_delete_label($1, $2)", label_id, current_user["id"])
        return DataEnvelope(data={"success": bool(success)})
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e)
        if "Access denied" in err_msg:
            raise HTTPException(status_code=403, detail=err_msg)
        elif "Label not found" in err_msg:
            raise HTTPException(status_code=404, detail="Label not found")
        logger.error(f"Error deleting label: {e}")
        raise HTTPException(status_code=400, detail="Failed to delete label")


@router.post("/tasks/{task_id}/labels/{label_id}", response_model=DataEnvelope[dict])
async def attach_label(
    task_id: int,
    label_id: int,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    try:
        success = await conn.fetchval("SELECT fn_attach_label($1, $2, $3)", task_id, label_id, current_user["id"])
        
        # Fetch updated task board_id to broadcast websocket event
        task_row = await conn.fetchrow("SELECT board_id FROM v_tasks_canonical WHERE id = $1", task_id)
        if task_row:
            await connection_manager.send_to_board(
                board_id=task_row["board_id"],
                message={"type": "task_updated", "task_id": task_id, "action": "attach_label", "label_id": label_id}
            )

        return DataEnvelope(data={"success": bool(success)})
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e)
        if "Access denied" in err_msg:
            raise HTTPException(status_code=403, detail=err_msg)
        elif "not found" in err_msg.lower():
            raise HTTPException(status_code=404, detail=err_msg)
        logger.error(f"Error attaching label: {e}")
        raise HTTPException(status_code=400, detail="Failed to attach label")


@router.delete("/tasks/{task_id}/labels/{label_id}", response_model=DataEnvelope[dict])
async def detach_label(
    task_id: int,
    label_id: int,
    current_user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_db_connection)
):
    try:
        success = await conn.fetchval("SELECT fn_detach_label($1, $2, $3)", task_id, label_id, current_user["id"])
        
        task_row = await conn.fetchrow("SELECT board_id FROM v_tasks_canonical WHERE id = $1", task_id)
        if task_row:
            await connection_manager.send_to_board(
                board_id=task_row["board_id"],
                message={"type": "task_updated", "task_id": task_id, "action": "detach_label", "label_id": label_id}
            )

        return DataEnvelope(data={"success": bool(success)})
    except HTTPException:
        raise
    except Exception as e:
        err_msg = str(e)
        if "Access denied" in err_msg:
            raise HTTPException(status_code=403, detail=err_msg)
        elif "not found" in err_msg.lower():
            raise HTTPException(status_code=404, detail=err_msg)
        logger.error(f"Error detaching label: {e}")
        raise HTTPException(status_code=400, detail="Failed to detach label")
