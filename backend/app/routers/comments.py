import logging
from typing import List
from fastapi import APIRouter, Depends, BackgroundTasks

from app.schemas.comments import CommentCreate, CommentUpdate, CommentResponse
from app.schemas.envelope import DataEnvelope
from app.services.notification_service import NotificationService
from app.auth.dependencies import get_current_user
from app.database.connection import get_db_connection
from app.services.comment_service import CommentService
from app.websockets.manager import connection_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Comments"])

def get_comment_service(conn = Depends(get_db_connection)) -> CommentService:
    return CommentService(conn)

@router.post("/tasks/{task_id}/comments", response_model=DataEnvelope[CommentResponse])
async def create_comment(
    task_id: int,
    comment_in: CommentCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    comment_service: CommentService = Depends(get_comment_service)
):
    comment, task_row, parent_user = await comment_service.create_comment(task_id, comment_in, current_user)

    # Notify parent comment author of reply (skip if they were already notified via mention)
    if parent_user and parent_user["id"] != current_user["id"]:
        board_id = task_row.get("board_id") if task_row else None
        task_title = task_row.get("title", "a task") if task_row else "a task"
        org_id = current_user["organization_id"]
        if board_id:
            notif_svc = NotificationService(comment_service.conn)
            background_tasks.add_task(
                notif_svc.notify_comment_reply,
                task_id=task_id,
                task_title=task_title,
                board_id=board_id,
                parent_author_id=parent_user["id"],
                commenter_id=current_user["id"],
                org_id=org_id,
            )

    if task_row and task_row.get("board_id"):
        await connection_manager.send_to_board(
            board_id=task_row["board_id"],
            message={
                "type": "comment_updated",
                "board_id": task_row["board_id"],
                "task_id": task_id,
                "comment_id": comment.id,
                "action": "created"
            }
        )
            
    return DataEnvelope(data=comment)

@router.patch("/tasks/{task_id}/comments/{comment_id}", response_model=DataEnvelope[CommentResponse])
async def update_comment(
    task_id: int,
    comment_id: int,
    comment_in: CommentUpdate,
    current_user: dict = Depends(get_current_user),
    comment_service: CommentService = Depends(get_comment_service)
):
    comment, board_id = await comment_service.update_comment(comment_id, comment_in, current_user)
    if board_id:
        await connection_manager.send_to_board(
            board_id=board_id,
            message={
                "type": "comment_updated",
                "board_id": board_id,
                "task_id": task_id,
                "comment_id": comment_id,
                "action": "updated"
            }
        )
    return DataEnvelope(data=comment)

@router.get("/tasks/{task_id}/comments", response_model=DataEnvelope[List[CommentResponse]])
async def get_task_comments(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    comment_service: CommentService = Depends(get_comment_service)
):
    comments = await comment_service.get_task_comments(task_id, current_user)
    return DataEnvelope(data=comments)

@router.delete("/comments/{comment_id}", status_code=204)
async def delete_comment(
    comment_id: int,
    current_user: dict = Depends(get_current_user),
    comment_service: CommentService = Depends(get_comment_service)
):
    task_id, board_id = await comment_service.delete_comment(comment_id, current_user)
    if board_id and task_id:
        await connection_manager.send_to_board(
            board_id=board_id,
            message={
                "type": "comment_updated",
                "board_id": board_id,
                "task_id": task_id,
                "comment_id": comment_id,
                "action": "deleted"
            }
        )
    return None

@router.post("/comments/{comment_id}/reactions/{emoji}", response_model=DataEnvelope[dict])
async def add_or_toggle_reaction(
    comment_id: int,
    emoji: str,
    current_user: dict = Depends(get_current_user),
    comment_service: CommentService = Depends(get_comment_service)
):
    added, task_id, board_id = await comment_service.add_reaction(comment_id, emoji, current_user)
    if board_id and task_id:
        await connection_manager.send_to_board(
            board_id=board_id,
            message={
                "type": "comment_updated",
                "board_id": board_id,
                "task_id": task_id,
                "comment_id": comment_id,
                "action": "reaction_updated"
            }
        )
    return DataEnvelope(data={"comment_id": comment_id, "emoji": emoji, "added": added})

@router.delete("/comments/{comment_id}/reactions/{emoji}", response_model=DataEnvelope[dict])
async def remove_reaction(
    comment_id: int,
    emoji: str,
    current_user: dict = Depends(get_current_user),
    comment_service: CommentService = Depends(get_comment_service)
):
    added, task_id, board_id = await comment_service.remove_reaction(comment_id, emoji, current_user)
    if board_id and task_id:
        await connection_manager.send_to_board(
            board_id=board_id,
            message={
                "type": "comment_updated",
                "board_id": board_id,
                "task_id": task_id,
                "comment_id": comment_id,
                "action": "reaction_updated"
            }
        )
    return DataEnvelope(data={"comment_id": comment_id, "emoji": emoji, "added": added})

