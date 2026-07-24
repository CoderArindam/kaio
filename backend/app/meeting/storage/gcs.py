"""GCSStorageProvider — StorageProvider implementation stub for Google Cloud Storage.
"""

from __future__ import annotations

from pathlib import Path

from app.meeting.logger import get_logger
from app.meeting.storage.base import StorageProvider

log = get_logger("storage.gcs")


class GCSStorageProvider(StorageProvider):
    """StorageProvider for Google Cloud Storage."""

    def __init__(self, bucket_name: str, credentials_path: str = "") -> None:
        self._bucket_name = bucket_name
        self._credentials_path = credentials_path

    async def save(self, session_id: str, data: bytes, fmt: str) -> tuple[str, str]:
        raise NotImplementedError("Google Cloud Storage provider is not yet configured.")

    async def get(self, uri: str) -> bytes:
        raise NotImplementedError("Google Cloud Storage provider is not yet configured.")

    async def delete(self, uri: str) -> None:
        raise NotImplementedError("Google Cloud Storage provider is not yet configured.")

    async def exists(self, uri: str) -> bool:
        raise NotImplementedError("Google Cloud Storage provider is not yet configured.")

    def get_local_path(self, uri: str) -> Path | None:
        return None
