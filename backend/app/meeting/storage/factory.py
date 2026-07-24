"""StorageProvider Factory.
"""

from __future__ import annotations

from pathlib import Path

from app.meeting.config import meeting_config
from app.meeting.storage.azure import AzureBlobStorageProvider
from app.meeting.storage.base import StorageProvider
from app.meeting.storage.gcs import GCSStorageProvider
from app.meeting.storage.local import LocalStorageProvider
from app.meeting.storage.r2 import CloudflareR2StorageProvider
from app.meeting.storage.s3 import S3StorageProvider


def get_storage_provider(
    provider_type: str | None = None,
    root_dir: Path | str | None = None,
    **kwargs,
) -> StorageProvider:
    """Instantiate and return the requested StorageProvider implementation."""
    selected_type = (provider_type or getattr(meeting_config, "STORAGE_PROVIDER", "local")).lower()
    if selected_type == "local":
        target_root = root_dir or meeting_config.RECORDING_OUTPUT_DIR
        return LocalStorageProvider(root=target_root)
    elif selected_type in ("r2", "cloudflare_r2"):
        bucket = kwargs.get("bucket_name") or meeting_config.R2_BUCKET_NAME
        account_id = kwargs.get("account_id") or meeting_config.R2_ACCOUNT_ID
        endpoint = kwargs.get("endpoint_url") or meeting_config.R2_ENDPOINT_URL
        access_key = kwargs.get("access_key_id") or meeting_config.R2_ACCESS_KEY_ID
        secret_key = kwargs.get("secret_access_key") or meeting_config.R2_SECRET_ACCESS_KEY
        public_url = kwargs.get("public_url_prefix") or meeting_config.R2_PUBLIC_URL_PREFIX
        return CloudflareR2StorageProvider(
            bucket_name=bucket,
            endpoint_url=endpoint,
            access_key_id=access_key,
            secret_access_key=secret_key,
            public_url_prefix=public_url,
            account_id=account_id,
            local_fallback_root=root_dir or meeting_config.RECORDING_OUTPUT_DIR,
        )
    elif selected_type == "s3":
        return S3StorageProvider(**kwargs)
    elif selected_type == "gcs":
        return GCSStorageProvider(**kwargs)
    elif selected_type in ("azure", "azure_blob"):
        return AzureBlobStorageProvider(**kwargs)
    else:
        raise ValueError(f"Unknown StorageProvider type: {selected_type}")
