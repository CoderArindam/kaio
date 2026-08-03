from fastapi import APIRouter, Depends, UploadFile, File
from app.schemas.attachments import AttachmentCreate
from app.auth.dependencies import get_current_user
from app.database.connection import get_db_connection
from app.services.attachment_service import AttachmentService

router = APIRouter(tags=["Attachments"])

def get_attachment_service(conn = Depends(get_db_connection)) -> AttachmentService:
    return AttachmentService(conn)

@router.post("/tasks/{task_id}/attachments/upload")
async def upload_task_attachment(
    task_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    attachment_service: AttachmentService = Depends(get_attachment_service)
):
    """
    Accepts a multipart file upload for a task attachment, stores it via StorageService
    (Cloudinary or local disk), and records metadata in the database.
    """
    result = await attachment_service.upload_attachment(task_id, file, current_user)
    return result

@router.post("/tasks/{task_id}/attachments")
async def create_attachment(
    task_id: int,
    attachment_in: AttachmentCreate,
    current_user: dict = Depends(get_current_user),
    attachment_service: AttachmentService = Depends(get_attachment_service)
):
    """
    URL-based attachment creation (legacy fallback).
    """
    result = await attachment_service.create_attachment(task_id, attachment_in, current_user)
    return result

@router.get("/tasks/{task_id}/attachments")
async def get_task_attachments(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    attachment_service: AttachmentService = Depends(get_attachment_service)
):
    """
    Fetches all attachments for a task.
    """
    result = await attachment_service.get_task_attachments(task_id, current_user)
    return result

@router.delete("/attachments/{attachment_id}")
async def delete_attachment(
    attachment_id: int,
    current_user: dict = Depends(get_current_user),
    attachment_service: AttachmentService = Depends(get_attachment_service)
):
    """
    Deletes an attachment record and removes the file from Cloudinary / local storage.
    """
    result = await attachment_service.delete_attachment(attachment_id, current_user)
    return result
