import os
import uuid
import shutil
import logging
import mimetypes
from pathlib import Path
from fastapi import UploadFile
from app.config.settings import settings

logger = logging.getLogger(__name__)

# Top-level safe Cloudinary import check
try:
    import cloudinary  # type: ignore
    import cloudinary.uploader  # type: ignore
    HAS_CLOUDINARY = True
except Exception:
    cloudinary = None  # type: ignore
    HAS_CLOUDINARY = False

# Base Upload Directories
UPLOAD_DIR = Path("uploads/avatars")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

LOGO_DIR = Path("uploads/logos")
LOGO_DIR.mkdir(parents=True, exist_ok=True)

ATTACHMENT_BASE_DIR = Path("uploads/attachments")
ATTACHMENT_BASE_DIR.mkdir(parents=True, exist_ok=True)


class StorageService:
    @staticmethod
    def _is_cloudinary_configured() -> bool:
        if not HAS_CLOUDINARY:
            return False
        return bool(
            settings.CLOUDINARY_URL or 
            (settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET)
        )

    @staticmethod
    def _configure_cloudinary():
        if not HAS_CLOUDINARY or not cloudinary:
            return
        if settings.CLOUDINARY_URL:
            try:
                from urllib.parse import urlparse
                p = urlparse(settings.CLOUDINARY_URL)
                cloudinary.config(
                    cloud_name=p.hostname,
                    api_key=p.username,
                    api_secret=p.password,
                    secure=True
                )
            except Exception as e:
                logger.error(f"Failed to parse CLOUDINARY_URL: {e}")
        elif settings.CLOUDINARY_CLOUD_NAME:
            cloudinary.config(
                cloud_name=settings.CLOUDINARY_CLOUD_NAME,
                api_key=settings.CLOUDINARY_API_KEY,
                api_secret=settings.CLOUDINARY_API_SECRET,
                secure=True
            )


    @staticmethod
    async def save_avatar(file: UploadFile) -> str:
        """
        Saves an uploaded avatar locally (or to Cloudinary if configured) and returns the public URL path.
        """
        if StorageService._is_cloudinary_configured():
            try:
                StorageService._configure_cloudinary()
                content = await file.read()
                res = cloudinary.uploader.upload(content, folder="kaio/avatars", resource_type="auto")
                if res and "secure_url" in res:
                    return res.get("secure_url")
            except Exception as e:
                logger.error(f"Cloudinary avatar upload failed, falling back to local: {e}")
                await file.seek(0)

        file_extension = os.path.splitext(file.filename or "")[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = UPLOAD_DIR / unique_filename

        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return f"/uploads/avatars/{unique_filename}"

    @staticmethod
    async def save_logo(file: UploadFile) -> str:
        """
        Saves an uploaded workspace logo locally (or to Cloudinary if configured) and returns the public URL path.
        """
        if StorageService._is_cloudinary_configured():
            try:
                StorageService._configure_cloudinary()
                content = await file.read()
                res = cloudinary.uploader.upload(content, folder="kaio/logos", resource_type="auto")
                if res and "secure_url" in res:
                    return res.get("secure_url")
            except Exception as e:
                logger.error(f"Cloudinary logo upload failed, falling back to local: {e}")
                await file.seek(0)

        file_extension = os.path.splitext(file.filename or "")[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = LOGO_DIR / unique_filename

        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return f"/uploads/logos/{unique_filename}"

    @staticmethod
    async def save_attachment(file: UploadFile, task_id: int) -> tuple[str, int, str]:
        """
        Saves an uploaded task attachment locally or to Cloudinary if configured.
        Returns tuple of (file_url, file_size, mime_type).
        """
        content = await file.read()
        file_size = len(content)
        mime_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"

        if StorageService._is_cloudinary_configured():
            try:
                StorageService._configure_cloudinary()
                res = cloudinary.uploader.upload(
                    content,
                    folder=f"kaio/attachments/{task_id}",
                    resource_type="auto",
                    use_filename=True
                )
                if res and "secure_url" in res:
                    return res.get("secure_url"), file_size, mime_type
            except Exception as e:
                logger.error(f"Cloudinary attachment upload failed, falling back to local storage: {e}")

        # Local storage fallback
        task_dir = ATTACHMENT_BASE_DIR / str(task_id)
        task_dir.mkdir(parents=True, exist_ok=True)

        original_name = Path(file.filename or "attachment").name
        unique_filename = f"{uuid.uuid4().hex[:12]}_{original_name}"
        file_path = task_dir / unique_filename

        with file_path.open("wb") as buffer:
            buffer.write(content)

        file_url = f"/uploads/attachments/{task_id}/{unique_filename}"
        return file_url, file_size, mime_type

    @staticmethod
    async def delete_attachment(file_url: str):
        """
        Deletes a stored attachment from Cloudinary or local disk.
        """
        if not file_url:
            return

        if file_url.startswith("http://") or file_url.startswith("https://"):
            if StorageService._is_cloudinary_configured() and "cloudinary.com" in file_url:
                try:
                    StorageService._configure_cloudinary()
                    url_parts = file_url.split("/")
                    if "upload" in url_parts:
                        upload_idx = url_parts.index("upload")
                        public_parts = url_parts[upload_idx + 2:] if url_parts[upload_idx + 1].startswith("v") else url_parts[upload_idx + 1:]
                        public_id = "/".join(public_parts).rsplit(".", 1)[0]
                        cloudinary.uploader.destroy(public_id)
                except Exception as e:
                    logger.error(f"Failed to delete attachment from Cloudinary: {e}")
        elif file_url.startswith("/uploads/"):
            try:
                local_path = Path(file_url.lstrip("/"))
                if local_path.exists():
                    local_path.unlink()
            except Exception as e:
                logger.error(f"Failed to delete local attachment file {file_url}: {e}")
