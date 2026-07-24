"""Recording storage abstraction — aliases StorageProvider for backward compatibility.
"""

from __future__ import annotations

from app.meeting.storage.base import StorageProvider, compute_sha256
from app.meeting.storage.local import LocalStorageProvider

# Backward compatibility aliases
RecordingStorage = StorageProvider
LocalRecordingStorage = LocalStorageProvider

__all__ = [
    "RecordingStorage",
    "LocalRecordingStorage",
    "StorageProvider",
    "LocalStorageProvider",
    "compute_sha256",
]
