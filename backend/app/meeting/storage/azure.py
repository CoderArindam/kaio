"""AzureBlobStorageProvider — StorageProvider implementation stub for Azure Blob Storage.
"""

from __future__ import annotations

from pathlib import Path

from app.meeting.logger import get_logger
from app.meeting.storage.base import StorageProvider

log = get_logger("storage.azure")


class AzureBlobStorageProvider(StorageProvider):
    """StorageProvider for Azure Blob Storage."""

    def __init__(self, container_name: str, connection_string: str = "") -> None:
        self._container_name = container_name
        self._connection_string = connection_string

    async def save(self, session_id: str, data: bytes, fmt: str) -> tuple[str, str]:
        raise NotImplementedError("Azure Blob Storage provider is not yet configured.")

    async def get(self, uri: str) -> bytes:
        raise NotImplementedError("Azure Blob Storage provider is not yet configured.")

    async def delete(self, uri: str) -> None:
        raise NotImplementedError("Azure Blob Storage provider is not yet configured.")

    async def exists(self, uri: str) -> bool:
        raise NotImplementedError("Azure Blob Storage provider is not yet configured.")

    def get_local_path(self, uri: str) -> Path | None:
        return None
