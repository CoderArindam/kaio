"""RecordingService — Manages audio recording lifecycle for meeting sessions.
"""

import logging
from typing import Any

from app.meeting.config import meeting_config
from app.meeting.models.session import MeetingSession
from app.meeting.bot.recorder.recorder import MeetingRecorder
from app.meeting.recording.storage import LocalRecordingStorage
from app.meeting.services.storage_service import StorageService

from app.meeting.logger import get_logger

log = get_logger("recording_service")


class RecordingService:
    """Handles audio recording startup, shutdown, and artifact metadata binding."""

    def __init__(self, storage_service: StorageService | None = None):
        self._storage_service = storage_service or StorageService()

    @property
    def storage(self) -> LocalRecordingStorage:
        return self._storage_service.recording_storage

    async def start_recording(self, session_id: str, page: Any, session: MeetingSession | None = None) -> MeetingRecorder | None:
        """Initialize and start recording on a page."""
        if not getattr(meeting_config, "RECORDING_ENABLED", True):
            log.info("recording.disabled", session_id=session_id)
            return None

        try:
            recorder = MeetingRecorder(storage=self.storage)
            await recorder.initialize(page, session_id, meeting_id=session_id)
            await recorder.start()
            if session:
                session.recording_status = "recording"
            log.info("recording.started", session_id=session_id)
            return recorder
        except Exception as exc:
            log.error("recording.start_failed", session_id=session_id, error=str(exc))
            if session:
                session.recording_status = "failed"
            return None

    async def stop_recording(self, session_id: str, recorder: MeetingRecorder | None, session: MeetingSession | None = None) -> Any | None:
        """Stop recording and update session artifact details."""
        if not recorder:
            return None

        try:
            artifact = await recorder.stop()
            if artifact and session:
                artifact_id = str(getattr(artifact, "id", getattr(artifact, "artifact_id", "")))
                duration_ms = getattr(artifact, "duration_ms", int(getattr(artifact, "duration_seconds", 0.0) * 1000))

                session.recording_artifact_id = artifact_id
                session.audio_filepath = artifact.file_path
                session.recording_duration_ms = duration_ms
                session.recording_status = "completed"
                log.info(
                    "recording.saved",
                    session_id=session_id,
                    artifact_id=artifact_id,
                    duration_ms=duration_ms,
                    file_path=artifact.file_path,
                )
            return artifact
        except Exception as exc:
            log.error("recording.stop_failed", session_id=session_id, error=str(exc))
            if session:
                session.recording_status = "failed"
            return None
