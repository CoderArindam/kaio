"""StorageProvider — Abstract base class for storage persistence providers.

Defines a unified contract for saving, retrieving, deleting, and resolving artifacts
across local disk and cloud storage backends (R2, S3, GCS, Azure Blob).
"""

from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from pathlib import Path


class StorageProvider(ABC):
    """Abstract base class for all storage persistence providers."""

    @abstractmethod
    async def save(
        self, session_id: str, data: bytes, fmt: str, filename: str | None = None
    ) -> tuple[str, str]:
        """Persist recording or artifact data.

        Returns:
            (local_path, storage_uri) — local_path is the file path on disk (if available);
            storage_uri is the abstract URI (file://, s3://, r2://, etc.).
        """
        raise NotImplementedError

    @abstractmethod
    async def get(self, uri: str) -> bytes:
        """Retrieve raw bytes for a stored artifact by URI."""
        raise NotImplementedError

    @abstractmethod
    async def delete(self, uri: str) -> None:
        """Remove a stored artifact by URI. Silently ignores missing artifacts."""
        raise NotImplementedError

    @abstractmethod
    async def exists(self, uri: str) -> bool:
        """Check whether an artifact exists at the given URI."""
        raise NotImplementedError

    @abstractmethod
    def get_local_path(self, uri: str) -> Path | None:
        """Return Path on local disk if provider supports direct local file access."""
        raise NotImplementedError


def compute_sha256(data: bytes) -> str:
    """Return the hex-encoded SHA-256 checksum of the given bytes."""
    return hashlib.sha256(data).hexdigest()
