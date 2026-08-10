import logging
import base64
import uuid
from io import BytesIO
from fastapi import APIRouter, Depends, UploadFile, File, Query
from app.schemas.notes import NoteCreate, NoteUpdate
from app.schemas.envelope import DataEnvelope
from app.auth.dependencies import get_current_user
from app.database.connection import get_db_connection
from app.services.notes_service import NoteService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Notes"])


def get_note_service(conn=Depends(get_db_connection)) -> NoteService:
    return NoteService(conn)


@router.get("/notes", response_model=DataEnvelope[list])
async def get_notes(
    current_user: dict = Depends(get_current_user),
    note_service: NoteService = Depends(get_note_service),
):
    notes = await note_service.get_notes(current_user)
    return DataEnvelope(data=notes)


@router.post("/notes", response_model=DataEnvelope[dict])
async def create_note(
    note_in: NoteCreate,
    current_user: dict = Depends(get_current_user),
    note_service: NoteService = Depends(get_note_service),
):
    note = await note_service.create_note(note_in, current_user)
    return DataEnvelope(data=note)


@router.patch("/notes/{note_id}", response_model=DataEnvelope[dict])
async def update_note(
    note_id: int,
    note_in: NoteUpdate,
    current_user: dict = Depends(get_current_user),
    note_service: NoteService = Depends(get_note_service),
):
    note = await note_service.update_note(note_id, note_in, current_user)
    return DataEnvelope(data=note)


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(
    note_id: int,
    current_user: dict = Depends(get_current_user),
    note_service: NoteService = Depends(get_note_service),
):
    await note_service.delete_note(note_id, current_user)
    return None


@router.get("/notes/search", response_model=DataEnvelope[list])
async def search_notes(
    q: str = Query(..., min_length=1),
    current_user: dict = Depends(get_current_user),
    note_service: NoteService = Depends(get_note_service),
):
    notes = await note_service.search_notes(q, current_user)
    return DataEnvelope(data=notes)


@router.post("/notes/{note_id}/pin", response_model=DataEnvelope[dict])
async def toggle_pin(
    note_id: int,
    current_user: dict = Depends(get_current_user),
    note_service: NoteService = Depends(get_note_service),
):
    result = await note_service.toggle_pin(note_id, current_user)
    return DataEnvelope(data=result)


@router.post("/notes/{note_id}/image-upload", response_model=DataEnvelope[dict])
async def upload_note_image(
    note_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    note_service: NoteService = Depends(get_note_service),
):
    result = await note_service.upload_image(note_id, file, current_user)
    return DataEnvelope(data=result)


@router.post("/notes/screenshot", response_model=DataEnvelope[dict])
async def upload_screenshot(
    payload: dict,
    current_user: dict = Depends(get_current_user),
    note_service: NoteService = Depends(get_note_service),
):
    """
    Accepts a base64-encoded PNG screenshot from the client,
    stores it via StorageService, and returns the URL.
    """
    try:
        data_url = payload.get("data_url", "")
        if not data_url:
            from fastapi import HTTPException
            raise HTTPException(status_code=422, detail="data_url is required")

        # Strip data URL header: "data:image/png;base64,<data>"
        if "," in data_url:
            data_url = data_url.split(",", 1)[1]

        image_bytes = base64.b64decode(data_url)
        filename = f"screenshot_{uuid.uuid4().hex[:8]}.png"

        file_obj = UploadFile(
            filename=filename,
            file=BytesIO(image_bytes),
            headers={"content-type": "image/png"},
        )

        result = await note_service.upload_image(0, file_obj, current_user)
        return DataEnvelope(data=result)
    except Exception as e:
        logger.error(f"Screenshot upload failed: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="Screenshot upload failed")
