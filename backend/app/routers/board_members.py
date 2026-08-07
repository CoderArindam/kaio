from app.database.connection import get_db_connection
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.schemas.envelope import DataEnvelope
from app.services.board_service import BoardService
from app.services.notification_service import NotificationService

router = APIRouter(tags=["Board Members"])


class AddBoardMemberRequest(BaseModel):
    user_id: int
    permission: str = Field(default="EDITOR")


def get_board_service(conn = Depends(get_db_connection)) -> BoardService:
    return BoardService(conn)

@router.get("/boards/{board_id}/members")
async def get_board_members(
    board_id: int,
    current_user: dict = Depends(get_current_user),
    board_service: BoardService = Depends(get_board_service),
):
    members = await board_service.get_board_members(board_id, current_user)
    return DataEnvelope(data=members)

@router.post("/boards/{board_id}/members", status_code=status.HTTP_201_CREATED)
async def add_board_member(
    board_id: int,
    payload: AddBoardMemberRequest,
    current_user: dict = Depends(get_current_user),
    board_service: BoardService = Depends(get_board_service),
):
    await board_service.add_board_member(board_id, payload.user_id, payload.permission, current_user)
    # Notify the added user
    if payload.user_id != current_user["id"]:
        try:
            board_name = await board_service.conn.fetchval(
                "SELECT name FROM boards WHERE id = $1", board_id
            ) or f"Project #{board_id}"
            notif_svc = NotificationService(board_service.conn)
            await notif_svc.notify_board_member_added(
                board_id=board_id,
                board_name=board_name,
                user_id=payload.user_id,
                actor_id=current_user["id"],
                org_id=current_user["organization_id"],
            )
        except Exception:
            pass
    return DataEnvelope(data={"success": True, "message": "Member added to project"})

@router.delete("/boards/{board_id}/members/{user_id}", status_code=status.HTTP_200_OK)
async def remove_board_member(
    board_id: int,
    user_id: int,
    current_user: dict = Depends(get_current_user),
    board_service: BoardService = Depends(get_board_service),
):
    await board_service.remove_board_member(board_id, user_id, current_user)
    # Notify the removed user
    if user_id != current_user["id"]:
        try:
            board_name = await board_service.conn.fetchval(
                "SELECT name FROM boards WHERE id = $1", board_id
            ) or f"Project #{board_id}"
            notif_svc = NotificationService(board_service.conn)
            await notif_svc.notify_board_member_removed(
                board_id=board_id,
                board_name=board_name,
                user_id=user_id,
                actor_id=current_user["id"],
                org_id=current_user["organization_id"],
            )
        except Exception:
            pass
    return DataEnvelope(data={"success": True, "message": "Member removed from project"})

