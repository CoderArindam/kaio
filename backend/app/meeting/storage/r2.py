"""CloudflareR2StorageProvider — StorageProvider implementation for Cloudflare R2.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.meeting.logger import get_logger
from app.meeting.storage.base import StorageProvider

log = get_logger("storage.r2")


class CloudflareR2StorageProvider(StorageProvider):
    """StorageProvider for Cloudflare R2 Object Storage (S3-compatible API)."""

    def __init__(
        self,
        bucket_name: str = "",
        endpoint_url: str = "",
        access_key_id: str = "",
        secret_access_key: str = "",
        public_url_prefix: str = "",
        account_id: str = "",
        local_fallback_root: str | Path | None = None,
    ) -> None:
        self._bucket_name = bucket_name
        self._account_id = account_id
        
        # Build R2 endpoint if endpoint_url is not explicit but account_id is provided
        if not endpoint_url and account_id:
            endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"
            
        self._endpoint_url = endpoint_url
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._public_url_prefix = public_url_prefix.rstrip("/") if public_url_prefix else ""
        self._local_fallback_root = Path(local_fallback_root).resolve() if local_fallback_root else None
        self._s3_client: Any = None

    @property
    def bucket_name(self) -> str:
        return self._bucket_name

    @property
    def endpoint_url(self) -> str:
        return self._endpoint_url

    def _get_client(self) -> Any:
        """Lazy-initialize boto3 S3 client configured for Cloudflare R2."""
        if self._s3_client is not None:
            return self._s3_client

        try:
            import boto3
            from botocore.config import Config
        except ImportError:
            raise RuntimeError(
                "boto3 package is required for CloudflareR2StorageProvider. "
                "Please install boto3 via pip."
            )

        if not self._bucket_name:
            raise ValueError("R2_BUCKET_NAME is required for CloudflareR2StorageProvider.")

        config = Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"}
        )

        self._s3_client = boto3.client(
            "s3",
            endpoint_url=self._endpoint_url,
            aws_access_key_id=self._access_key_id,
            aws_secret_access_key=self._secret_access_key,
            config=config,
        )
        return self._s3_client

    def _parse_key_from_uri(self, uri: str) -> str:
        """Extract object key from r2://, s3://, http(s):// or key path."""
        if uri.startswith("r2://") or uri.startswith("s3://"):
            prefix, remainder = uri.split("://", 1)
            parts = remainder.split("/", 1)
            return parts[1] if len(parts) > 1 else parts[0]
        elif uri.startswith("http://") or uri.startswith("https://"):
            if self._public_url_prefix and uri.startswith(self._public_url_prefix):
                return uri.removeprefix(self._public_url_prefix).lstrip("/")
            return uri.split("/", 3)[-1]
        return uri.lstrip("/")

    async def save(
        self, session_id: str, data: bytes, fmt: str, filename: str | None = None
    ) -> tuple[str, str]:
        """Persist data to Cloudflare R2. Returns (local_path, storage_uri)."""
        if not filename:
            ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
            uid = uuid.uuid4().hex[:8]
            target_filename = f"{ts}_{uid}.{fmt}"
        else:
            target_filename = filename

        key = f"{session_id}/{target_filename}"
        
        content_type_map = {
            "json": "application/json",
            "txt": "text/plain",
            "pdf": "application/pdf",
            "wav": "audio/wav",
            "webm": "audio/webm",
        }
        content_type = content_type_map.get(fmt.lower(), "application/octet-stream")

        client = self._get_client()

        def _upload() -> None:
            client.put_object(
                Bucket=self._bucket_name,
                Key=key,
                Body=data,
                ContentType=content_type,
            )

        await asyncio.to_thread(_upload)

        storage_uri = (
            f"{self._public_url_prefix}/{key}"
            if self._public_url_prefix
            else f"r2://{self._bucket_name}/{key}"
        )

        local_path = ""
        if self._local_fallback_root:
            session_dir = self._local_fallback_root / session_id
            session_dir.mkdir(parents=True, exist_ok=True)
            fpath = session_dir / target_filename
            fpath.write_bytes(data)
            local_path = str(fpath)

        log.info(
            "storage.r2.saved",
            session_id=session_id,
            key=key,
            uri=storage_uri,
            size_bytes=len(data),
        )
        return local_path, storage_uri

    async def get(self, uri: str) -> bytes:
        """Retrieve object bytes from Cloudflare R2."""
        key = self._parse_key_from_uri(uri)
        client = self._get_client()

        def _download() -> bytes:
            response = client.get_object(Bucket=self._bucket_name, Key=key)
            return response["Body"].read()

        try:
            return await asyncio.to_thread(_download)
        except Exception as exc:
            log.error("storage.r2.get_failed", key=key, error=str(exc))
            raise FileNotFoundError(f"Artifact at {uri} not found in R2: {exc}")

    async def delete(self, uri: str) -> None:
        """Remove object from Cloudflare R2. Silently ignores missing files."""
        key = self._parse_key_from_uri(uri)
        client = self._get_client()

        def _delete() -> None:
            client.delete_object(Bucket=self._bucket_name, Key=key)

        try:
            await asyncio.to_thread(_delete)
            log.info("storage.r2.deleted", key=key)
        except Exception as exc:
            log.warning("storage.r2.delete_failed", key=key, error=str(exc))

    async def exists(self, uri: str) -> bool:
        """Check whether object exists in Cloudflare R2."""
        key = self._parse_key_from_uri(uri)
        client = self._get_client()

        def _check() -> bool:
            try:
                client.head_object(Bucket=self._bucket_name, Key=key)
                return True
            except Exception:
                return False

        return await asyncio.to_thread(_check)

    def get_local_path(self, uri: str) -> Path | None:
        """Return local Path if local fallback file exists, else None."""
        if self._local_fallback_root:
            key = self._parse_key_from_uri(uri)
            p = self._local_fallback_root / key
            if p.exists():
                return p
        return None
