import json
import logging
import asyncpg
from fastapi import HTTPException, UploadFile
from app.schemas.attachments import AttachmentCreate
from app.services.storage_service import StorageService

logger = logging.getLogger(__name__)

# 25 MB max attachment file size
MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024

class AttachmentService:
    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def _verify_task_access(self, task_id: int, current_user: dict):
        task_org_id = await self.conn.fetchval(
            "SELECT organization_id FROM v_tasks_canonical WHERE id = $1", 
            task_id
        )
        if not task_org_id or task_org_id != current_user.get("organization_id"):
            raise HTTPException(status_code=403, detail="Task not found or access denied")
        return task_org_id

    async def upload_attachment(self, task_id: int, file: UploadFile, current_user: dict):
        try:
            await self._verify_task_access(task_id, current_user)

            # Store file using StorageService (Cloudinary or local fallback)
            file_url, file_size, mime_type = await StorageService.save_attachment(
                file, task_id, current_user["organization_id"]
            )

            # Insert attachment record in DB using fn_create_attachment
            result = await self.conn.fetchval(
                "SELECT fn_create_attachment($1, $2, $3, $4, $5, $6)",
                task_id,
                current_user["id"],
                file.filename or "attachment",
                file_url,
                file_size,
                mime_type
            )
            if not result:
                raise HTTPException(status_code=500, detail="Failed to record attachment in database")

            parsed = json.loads(result) if isinstance(result, str) else result
            return parsed
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f'Unexpected error uploading attachment for task {task_id}: {e}')
            raise HTTPException(status_code=400, detail=f'Attachment upload failed: {str(e)}')

    async def create_attachment(self, task_id: int, attachment_in: AttachmentCreate, current_user: dict):
        try:
            await self._verify_task_access(task_id, current_user)

            result = await self.conn.fetchval(
                "SELECT fn_create_attachment($1, $2, $3, $4, $5, $6)",
                task_id,
                current_user["id"],
                attachment_in.file_name,
                attachment_in.file_url,
                None,
                None
            )
            if not result:
                raise HTTPException(status_code=500, detail="Failed to create attachment")
            return json.loads(result) if isinstance(result, str) else result
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f'Unexpected error creating attachment: {e}')
            raise HTTPException(status_code=400, detail=f'Failed to create attachment: {str(e)}')

    async def get_task_attachments(self, task_id: int, current_user: dict):
        try:
            await self._verify_task_access(task_id, current_user)

            result = await self.conn.fetchval(
                "SELECT fn_get_task_attachments($1)",
                task_id
            )
            return json.loads(result) if isinstance(result, str) else result
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f'Unexpected error fetching attachments for task {task_id}: {e}')
            raise HTTPException(status_code=400, detail=f'Failed to fetch attachments: {str(e)}')

    async def update_attachment_annotations(self, task_id: int, attachment_id: int, annotations: list, current_user: dict):
        try:
            await self._verify_task_access(task_id, current_user)
            
            result = await self.conn.fetchval(
                "SELECT fn_update_attachment_annotations($1, $2)",
                attachment_id,
                json.dumps(annotations)
            )
            if not result:
                raise HTTPException(status_code=404, detail="Attachment not found")
                
            return json.loads(result) if isinstance(result, str) else result
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f'Unexpected error updating annotations for attachment {attachment_id}: {e}')
            raise HTTPException(status_code=400, detail=f'Failed to update annotations: {str(e)}')

    async def delete_attachment(self, attachment_id: int, current_user: dict):
        try:
            # Execute DB deletion first (fn_delete_attachment verifies record exists and returns file_url & task_id)
            result = await self.conn.fetchval(
                "SELECT fn_delete_attachment($1, $2)",
                attachment_id,
                current_user["id"]
            )
            if not result:
                raise HTTPException(status_code=404, detail="Attachment not found")

            deleted_info = json.loads(result) if isinstance(result, str) else result
            file_url = deleted_info.get("file_url")

            # Clean up stored file from Cloudinary or local disk
            if file_url:
                await StorageService.delete_attachment(file_url)

            return {"success": True, "id": attachment_id, "file_url": file_url}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f'Unexpected error deleting attachment {attachment_id}: {e}')
            raise HTTPException(status_code=400, detail=f'Failed to delete attachment: {str(e)}')