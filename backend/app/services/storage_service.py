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
UPLOAD_DIR = Path("uploads/orgs")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)



class StorageService:
    @staticmethod
    def _is_cloudinary_configured() -> bool:
        if not HAS_CLOUDINARY:
            return False
        url = (settings.CLOUDINARY_URL or "").strip('\'" ')
        cloud_name = (settings.CLOUDINARY_CLOUD_NAME or "").strip('\'" ')
        api_key = (settings.CLOUDINARY_API_KEY or "").strip('\'" ')
        api_secret = (settings.CLOUDINARY_API_SECRET or "").strip('\'" ')
        return bool(url or (cloud_name and api_key and api_secret))

    @staticmethod
    def _configure_cloudinary():
        if not HAS_CLOUDINARY or not cloudinary:
            return
        url = (settings.CLOUDINARY_URL or "").strip('\'" ')
        cloud_name = (settings.CLOUDINARY_CLOUD_NAME or "").strip('\'" ')
        api_key = (settings.CLOUDINARY_API_KEY or "").strip('\'" ')
        api_secret = (settings.CLOUDINARY_API_SECRET or "").strip('\'" ')

        if url:
            try:
                cloudinary.config(cloudinary_url=url, secure=True)
            except Exception as e:
                logger.error(f"Failed to configure CLOUDINARY_URL: {e}")
        elif cloud_name:
            cloudinary.config(
                cloud_name=cloud_name,
                api_key=api_key,
                api_secret=api_secret,
                secure=True
            )


    @staticmethod
    async def save_avatar(file: UploadFile, org_id: int) -> str:
        """
        Saves an uploaded avatar locally (or to Cloudinary if configured) and returns the public URL path.
        """
        if StorageService._is_cloudinary_configured():
            try:
                StorageService._configure_cloudinary()
                content = await file.read()
                res = cloudinary.uploader.upload(content, folder=f"kaio/orgs/{org_id}/avatars", resource_type="auto")
                if res and "secure_url" in res:
                    return res.get("secure_url")
            except Exception as e:
                logger.error(f"Cloudinary avatar upload failed, falling back to local: {e}")
                await file.seek(0)

        file_extension = os.path.splitext(file.filename or "")[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        
        org_dir = UPLOAD_DIR / str(org_id) / "avatars"
        org_dir.mkdir(parents=True, exist_ok=True)
        file_path = org_dir / unique_filename

        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return f"/uploads/orgs/{org_id}/avatars/{unique_filename}"

    @staticmethod
    async def save_logo(file: UploadFile, org_id: int) -> str:
        """
        Saves an uploaded workspace logo locally (or to Cloudinary if configured) and returns the public URL path.
        """
        if StorageService._is_cloudinary_configured():
            try:
                StorageService._configure_cloudinary()
                content = await file.read()
                res = cloudinary.uploader.upload(content, folder=f"kaio/orgs/{org_id}/logos", resource_type="auto")
                if res and "secure_url" in res:
                    return res.get("secure_url")
            except Exception as e:
                logger.error(f"Cloudinary logo upload failed, falling back to local: {e}")
                await file.seek(0)

        file_extension = os.path.splitext(file.filename or "")[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        
        org_dir = UPLOAD_DIR / str(org_id) / "logos"
        org_dir.mkdir(parents=True, exist_ok=True)
        file_path = org_dir / unique_filename

        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return f"/uploads/orgs/{org_id}/logos/{unique_filename}"

    @staticmethod
    async def save_attachment(file: UploadFile, task_id: int, org_id: int) -> tuple[str, int, str]:
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
                    folder=f"kaio/orgs/{org_id}/attachments/{task_id}",
                    resource_type="auto",
                    use_filename=True
                )
                if res and "secure_url" in res:
                    return res.get("secure_url"), file_size, mime_type
            except Exception as e:
                logger.error(f"Cloudinary attachment upload failed, falling back to local storage: {e}")

        # Local storage fallback
        task_dir = UPLOAD_DIR / str(org_id) / "attachments" / str(task_id)
        task_dir.mkdir(parents=True, exist_ok=True)

        original_name = Path(file.filename or "attachment").name
        unique_filename = f"{uuid.uuid4().hex[:12]}_{original_name}"
        file_path = task_dir / unique_filename

        with file_path.open("wb") as buffer:
            buffer.write(content)

        file_url = f"/uploads/orgs/{org_id}/attachments/{task_id}/{unique_filename}"
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

    @staticmethod
    async def save_note_image(file: UploadFile, user_id: int, org_id: int) -> str:
        """
        Saves a note image (upload or screenshot) to Cloudinary or local storage.
        Returns the public URL.
        """
        content = await file.read()
        mime_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "image/png"

        if StorageService._is_cloudinary_configured():
            try:
                StorageService._configure_cloudinary()
                res = cloudinary.uploader.upload(
                    content,
                    folder=f"kaio/orgs/{org_id}/notes/{user_id}",
                    resource_type="image",
                    use_filename=True,
                )
                if res and "secure_url" in res:
                    return res.get("secure_url")
            except Exception as e:
                logger.error(f"Cloudinary note image upload failed, falling back: {e}")

        # Local storage fallback
        note_dir = UPLOAD_DIR / str(org_id) / "notes" / str(user_id)
        note_dir.mkdir(parents=True, exist_ok=True)

        original_name = Path(file.filename or "image.png").name
        unique_filename = f"{uuid.uuid4().hex[:12]}_{original_name}"
        file_path = note_dir / unique_filename

        with file_path.open("wb") as buffer:
            buffer.write(content)

        return f"/uploads/orgs/{org_id}/notes/{user_id}/{unique_filename}"

    @staticmethod
    async def delete_organization_assets(org_id: int):
        """
        Deletes all assets (avatars, logos, attachments) scoped to a specific organization.
        This deletes the local directory entirely and uses Cloudinary API to delete by folder prefix.
        """
        # Local Delete
        org_dir = UPLOAD_DIR / str(org_id)
        if org_dir.exists() and org_dir.is_dir():
            try:
                shutil.rmtree(org_dir)
                logger.info(f"Deleted local assets for organization {org_id}")
            except Exception as e:
                logger.error(f"Failed to delete local assets for org {org_id}: {e}")

        # Cloudinary Delete
        if StorageService._is_cloudinary_configured():
            try:
                StorageService._configure_cloudinary()
                import cloudinary.api # type: ignore
                # Cloudinary requires a specific API call to delete resources by prefix
                prefix = f"kaio/orgs/{org_id}"
                # Delete resources (files)
                cloudinary.api.delete_resources_by_prefix(prefix)
                # Note: This might not delete the empty folders themselves, which is fine, 
                # but we can optionally try to delete the folder using cloudinary.api.delete_folder
                try:
                    cloudinary.api.delete_folder(prefix)
                except Exception as folder_e:
                    logger.debug(f"Could not delete empty cloudinary folder {prefix}: {folder_e}")
                
                logger.info(f"Deleted Cloudinary assets for organization {org_id}")
            except Exception as e:
                logger.error(f"Failed to delete Cloudinary assets for org {org_id}: {e}")
                raise e # Propagate to the worker to handle failures
