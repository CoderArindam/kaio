from app.database.connection import get_db_connection
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.schemas.envelope import DataEnvelope
from app.services.board_service import BoardService

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
    return DataEnvelope(data={"success": True, "message": "Member added to project"})

@router.delete("/boards/{board_id}/members/{user_id}", status_code=status.HTTP_200_OK)
async def remove_board_member(
    board_id: int,
    user_id: int,
    current_user: dict = Depends(get_current_user),
    board_service: BoardService = Depends(get_board_service),
):
    await board_service.remove_board_member(board_id, user_id, current_user)
    return DataEnvelope(data={"success": True, "message": "Member removed from project"})

