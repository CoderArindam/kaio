"""LocalStorageProvider — Local filesystem implementation of StorageProvider.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.meeting.logger import get_logger
from app.meeting.storage.base import StorageProvider

log = get_logger("storage.local")


class LocalStorageProvider(StorageProvider):
    """Persists artifacts to the local filesystem.

    Directory layout::
        {root}/{session_id}/{timestamp}_{uuid}.{fmt}

    Writes are atomic: data is written to a .tmp file first, then
    renamed to the final filename, preventing partial reads.
    """

    def __init__(self, root: str | Path) -> None:
        self._root = Path(root).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    @property
    def root(self) -> Path:
        return self._root

    async def save(
        self, session_id: str, data: bytes, fmt: str, filename: str | None = None
    ) -> tuple[str, str]:
        """Write recording or artifact data atomically. Returns (local_path, storage_uri)."""
        session_dir = self._root / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        if not filename:
            ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
            uid = uuid.uuid4().hex[:8]
            target_filename = f"{ts}_{uid}.{fmt}"
        else:
            target_filename = filename

        final_path = session_dir / target_filename
        tmp_path = final_path.with_suffix(f".{fmt}.tmp")

        try:
            tmp_path.write_bytes(data)
            tmp_path.rename(final_path)
        except OSError as exc:
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                pass
            raise exc

        storage_uri = final_path.as_uri()
        log.info(
            "storage.local.saved",
            session_id=session_id,
            path=str(final_path),
            uri=storage_uri,
            size_bytes=len(data),
        )
        return str(final_path), storage_uri

    async def get(self, uri: str) -> bytes:
        """Read bytes from local file:// URI or direct file path."""
        path = self.get_local_path(uri)
        if not path or not path.exists():
            raise FileNotFoundError(f"Artifact at {uri} not found.")
        return path.read_bytes()

    async def delete(self, uri: str) -> None:
        """Remove a local file. Silently ignores missing files."""
        path = self.get_local_path(uri)
        if not path:
            log.warning("storage.local.delete_skipped_invalid_uri", uri=uri)
            return
        try:
            path.unlink(missing_ok=True)
            log.info("storage.local.deleted", path=str(path))
        except OSError as exc:
            log.warning("storage.local.delete_failed", path=str(path), error=str(exc))

    async def exists(self, uri: str) -> bool:
        """Check if local file exists."""
        path = self.get_local_path(uri)
        return path is not None and path.exists()

    def get_local_path(self, uri: str) -> Path | None:
        """Resolve URI to a local Path instance."""
        if uri.startswith("file:///"):
            clean_uri = uri.removeprefix("file:///")
            # Windows drive letter file:///D:/ -> D:/
            if len(clean_uri) > 1 and clean_uri[1] == ":":
                return Path(clean_uri)
            return Path("/" + clean_uri)
        elif uri.startswith("file://"):
            return Path(uri.removeprefix("file://"))
        else:
            p = Path(uri)
            if p.is_absolute():
                return p
            return self._root / uri
