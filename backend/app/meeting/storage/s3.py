"""S3StorageProvider — StorageProvider implementation stub for Amazon S3.
"""

from __future__ import annotations

from pathlib import Path

from app.meeting.logger import get_logger
from app.meeting.storage.base import StorageProvider

log = get_logger("storage.s3")


class S3StorageProvider(StorageProvider):
    """StorageProvider for Amazon S3 Object Storage."""

    def __init__(self, bucket_name: str, region_name: str = "us-east-1", aws_access_key_id: str = "", aws_secret_access_key: str = "") -> None:
        self._bucket_name = bucket_name
        self._region_name = region_name
        self._aws_access_key_id = aws_access_key_id
        self._aws_secret_access_key = aws_secret_access_key

    async def save(self, session_id: str, data: bytes, fmt: str) -> tuple[str, str]:
        raise NotImplementedError("Amazon S3 storage provider is not yet configured.")

    async def get(self, uri: str) -> bytes:
        raise NotImplementedError("Amazon S3 storage provider is not yet configured.")

    async def delete(self, uri: str) -> None:
        raise NotImplementedError("Amazon S3 storage provider is not yet configured.")

    async def exists(self, uri: str) -> bool:
        raise NotImplementedError("Amazon S3 storage provider is not yet configured.")

    def get_local_path(self, uri: str) -> Path | None:
        return None
