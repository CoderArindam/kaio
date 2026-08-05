import logging
from typing import List
from fastapi import APIRouter, Depends, BackgroundTasks

from app.schemas.comments import CommentCreate, CommentUpdate, CommentResponse
from app.schemas.envelope import DataEnvelope
from app.services.notification_service import dispatch_task_email
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
    
    actor_name = current_user.get("first_name") or current_user.get("email")

    if task_row and task_row["assigned_to"] and task_row["assigned_to"] != current_user["id"]:
        background_tasks.add_task(
            dispatch_task_email,
            activity_type="COMMENT_ADDED",
            task_title=task_row["title"],
            board_name=task_row["board_name"],
            actor_name=actor_name,
            assignee_email=task_row["assignee_email"],
            assignee_name=task_row["assignee_first_name"],
            comment=comment_in.content
        )

    if parent_user and parent_user["id"] != current_user["id"]:
        if not task_row or parent_user["id"] != task_row["assigned_to"]:
            background_tasks.add_task(
                dispatch_task_email,
                activity_type="COMMENT_ADDED",
                task_title=task_row["title"] if task_row else "a task",
                board_name=task_row["board_name"] if task_row else "your board",
                actor_name=actor_name,
                assignee_email=parent_user["email"],
                assignee_name=parent_user["first_name"],
                comment=comment_in.content
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
    added, task_id, board_id = await comment_service.toggle_reaction(comment_id, emoji, current_user)
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
    added, task_id, board_id = await comment_service.toggle_reaction(comment_id, emoji, current_user)
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

