import json
import logging
import asyncpg
from fastapi import HTTPException, UploadFile
from app.schemas.notes import NoteCreate, NoteUpdate
from app.services.storage_service import StorageService

logger = logging.getLogger(__name__)

# 10 MB max image size for notes
MAX_NOTE_IMAGE_BYTES = 10 * 1024 * 1024


class NoteService:
    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    def _clean_note(self, note: dict) -> dict:
        if not isinstance(note, dict):
            return note
        annotations = note.get("annotations")
        if isinstance(annotations, str):
            try:
                note["annotations"] = json.loads(annotations)
            except Exception:
                note["annotations"] = []
        elif annotations is None:
            note["annotations"] = []

        rich_content = note.get("rich_content")
        if isinstance(rich_content, str):
            try:
                note["rich_content"] = json.loads(rich_content)
            except Exception:
                note["rich_content"] = None
        return note

    def _parse(self, result):
        if result is None:
            return None
        parsed = json.loads(result) if isinstance(result, str) else result
        if isinstance(parsed, list):
            return [self._clean_note(n) for n in parsed]
        if isinstance(parsed, dict):
            return self._clean_note(parsed)
        return parsed

    async def get_notes(self, current_user: dict) -> list:
        try:
            result = await self.conn.fetchval(
                "SELECT fn_get_user_notes($1, $2)",
                current_user["id"],
                current_user["organization_id"],
            )
            return self._parse(result) or []
        except Exception as e:
            logger.error(f"Error fetching notes for user {current_user['id']}: {e}")
            raise HTTPException(status_code=500, detail="Failed to fetch notes")

    async def create_note(self, note_in: NoteCreate, current_user: dict) -> dict:
        try:
            annotations_json = None
            if note_in.annotations is not None:
                ann = note_in.annotations
                if isinstance(ann, str):
                    try:
                        ann = json.loads(ann)
                    except Exception:
                        ann = []
                annotations_json = json.dumps(ann)

            rich_content_json = None
            if note_in.rich_content:
                rich_content_json = json.dumps(note_in.rich_content)

            result = await self.conn.fetchval(
                "SELECT fn_create_note($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb)",
                current_user["id"],
                current_user["organization_id"],
                note_in.title,
                note_in.content_type,
                rich_content_json,
                note_in.canvas_data,
                note_in.image_url,
                annotations_json,
            )
            parsed = self._parse(result)
            if not parsed:
                raise HTTPException(status_code=500, detail="Failed to create note")
            return parsed
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating note: {e}")
            raise HTTPException(status_code=500, detail="Failed to create note")

    async def update_note(self, note_id: int, note_in: NoteUpdate, current_user: dict) -> dict:
        try:
            annotations_json = None
            if note_in.annotations is not None:
                ann = note_in.annotations
                if isinstance(ann, str):
                    try:
                        ann = json.loads(ann)
                    except Exception:
                        ann = []
                annotations_json = json.dumps(ann)

            rich_content_json = None
            if note_in.rich_content is not None:
                rich_content_json = json.dumps(note_in.rich_content)

            result = await self.conn.fetchval(
                "SELECT fn_update_note($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9, $10)",
                note_id,
                current_user["id"],
                current_user["organization_id"],
                note_in.title,
                rich_content_json,
                note_in.canvas_data,
                note_in.image_url,
                annotations_json,
                note_in.is_pinned,
                note_in.expected_version,
            )
            parsed = self._parse(result)
            if not parsed:
                raise HTTPException(status_code=404, detail="Note not found")
            return parsed
        except asyncpg.exceptions.RaiseError as e:
            err = str(e)
            if "VERSION_CONFLICT" in err:
                raise HTTPException(
                    status_code=409,
                    detail="Note was modified by another session. Please refresh and try again."
                )
            if "NOTE_NOT_FOUND" in err:
                raise HTTPException(status_code=404, detail="Note not found")
            logger.error(f"DB error updating note {note_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to update note")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Unexpected error updating note {note_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to update note")

    async def delete_note(self, note_id: int, current_user: dict) -> dict:
        try:
            result = await self.conn.fetchval(
                "SELECT fn_delete_note($1, $2, $3)",
                note_id,
                current_user["id"],
                current_user["organization_id"],
            )
            parsed = self._parse(result)
            if not parsed:
                raise HTTPException(status_code=404, detail="Note not found")

            # Clean up stored image if present
            image_url = parsed.get("image_url")
            if image_url:
                await StorageService.delete_attachment(image_url)

            return {"success": True, "id": note_id}
        except asyncpg.exceptions.RaiseError as e:
            if "NOTE_NOT_FOUND" in str(e):
                raise HTTPException(status_code=404, detail="Note not found")
            logger.error(f"DB error deleting note {note_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to delete note")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Unexpected error deleting note {note_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to delete note")

    async def toggle_pin(self, note_id: int, current_user: dict) -> dict:
        try:
            result = await self.conn.fetchval(
                "SELECT fn_toggle_pin_note($1, $2, $3)",
                note_id,
                current_user["id"],
                current_user["organization_id"],
            )
            parsed = self._parse(result)
            if not parsed:
                raise HTTPException(status_code=404, detail="Note not found")
            return parsed
        except asyncpg.exceptions.RaiseError as e:
            if "NOTE_NOT_FOUND" in str(e):
                raise HTTPException(status_code=404, detail="Note not found")
            raise HTTPException(status_code=500, detail="Failed to toggle pin")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error toggling pin on note {note_id}: {e}")
            raise HTTPException(status_code=500, detail="Failed to toggle pin")

    async def search_notes(self, query: str, current_user: dict) -> list:
        try:
            if not query or not query.strip():
                return await self.get_notes(current_user)
            result = await self.conn.fetchval(
                "SELECT fn_search_notes($1, $2, $3)",
                current_user["id"],
                current_user["organization_id"],
                query.strip(),
            )
            return self._parse(result) or []
        except Exception as e:
            logger.error(f"Error searching notes: {e}")
            raise HTTPException(status_code=500, detail="Failed to search notes")

    async def upload_image(self, note_id: int, file: UploadFile, current_user: dict) -> dict:
        """Upload a note image and update the note's image_url."""
        try:
            content = await file.read()
            if len(content) > MAX_NOTE_IMAGE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"Image exceeds 10 MB limit"
                )
            await file.seek(0)

            image_url = await StorageService.save_note_image(
                file, current_user["id"], current_user["organization_id"]
            )
            return {"image_url": image_url}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error uploading note image: {e}")
            raise HTTPException(status_code=500, detail="Image upload failed")
