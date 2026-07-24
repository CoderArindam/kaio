"""StorageService — Manages storage directories and StorageProvider instance for meetings.
"""

from __future__ import annotations

from pathlib import Path

from app.meeting.config import meeting_config
from app.meeting.logger import get_logger
from app.meeting.storage.base import StorageProvider
from app.meeting.storage.factory import get_storage_provider

log = get_logger("storage_service")


class StorageService:
    """Handles directory resolution, StorageProvider access, and artifact uploads for meetings."""

    ALLOWED_UPLOAD_FILENAMES: set[str] = {
        "participant_attributed_transcript.json",
        "task_proposals_manifest.json",
    }

    FORBIDDEN_AUDIO_EXTENSIONS: set[str] = {
        ".webm", ".wav", ".mp3", ".ogg", ".flac", ".mkv", ".mp4", ".pcm", ".raw", ".aac"
    }

    def __init__(
        self,
        output_dir: Path | str | None = None,
        provider: StorageProvider | None = None,
    ) -> None:
        self._output_dir = Path(output_dir or meeting_config.RECORDING_OUTPUT_DIR).resolve()
        self._provider = provider or get_storage_provider(root_dir=self._output_dir)
        self.ensure_directories()

    def ensure_directories(self) -> None:
        """Ensure all required output and debug directories exist."""
        self._output_dir.mkdir(parents=True, exist_ok=True)
        if hasattr(meeting_config, "DEBUG_DIR") and meeting_config.DEBUG_DIR:
            Path(meeting_config.DEBUG_DIR).mkdir(parents=True, exist_ok=True)

    @property
    def provider(self) -> StorageProvider:
        """Get the underlying StorageProvider instance."""
        return self._provider

    @property
    def recording_storage(self) -> StorageProvider:
        """Alias for backward compatibility."""
        return self._provider

    def get_output_dir(self) -> Path:
        """Return the base output directory for recordings."""
        return self._output_dir

    def get_session_dir(self, session_id: str) -> Path:
        """Get or create a dedicated subdirectory for a specific session."""
        session_dir = self._output_dir / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        return session_dir

    async def upload_pipeline_artifacts(
        self, session_id: str, session_dir: Path | str | None = None
    ) -> dict[str, str]:
        """Upload allowed pipeline artifacts to the configured StorageProvider.

        Only uploads:
          - participant_attributed_transcript.json
          - task_proposals_manifest.json (optional)

        Strictly rejects all audio and WebM/WAV files.
        Returns dict of filename -> storage_uri.
        """
        target_dir = Path(session_dir) if session_dir else self.get_session_dir(session_id)
        if not target_dir.exists() or not target_dir.is_dir():
            log.warning("storage_service.upload_skipped_missing_dir", session_id=session_id, path=str(target_dir))
            return {}

        uploaded: dict[str, str] = {}

        for file_path in target_dir.rglob("*"):
            if not file_path.is_file():
                continue

            fname = file_path.name
            suffix = file_path.suffix.lower()

            # Safety check: block any audio/video file explicitly
            if suffix in self.FORBIDDEN_AUDIO_EXTENSIONS:
                log.info(
                    "storage_service.upload_blocked_audio_file",
                    session_id=session_id,
                    filename=fname,
                    reason="audio_and_video_uploads_forbidden"
                )
                continue

            # Upload check: upload only whitelisted JSON artifacts
            if fname in self.ALLOWED_UPLOAD_FILENAMES:
                try:
                    data = file_path.read_bytes()
                    fmt = suffix.lstrip(".") or "json"
                    _, storage_uri = await self._provider.save(
                        session_id=session_id,
                        data=data,
                        fmt=fmt,
                        filename=fname
                    )
                    uploaded[fname] = storage_uri
                    log.info(
                        "storage_service.artifact_uploaded",
                        session_id=session_id,
                        filename=fname,
                        uri=storage_uri,
                    )
                except Exception as exc:
                    log.error(
                        "storage_service.artifact_upload_failed",
                        session_id=session_id,
                        filename=fname,
                        error=str(exc),
                    )
            else:
                log.debug(
                    "storage_service.upload_skipped_unlisted_file",
                    session_id=session_id,
                    filename=fname,
                )

        return uploaded
