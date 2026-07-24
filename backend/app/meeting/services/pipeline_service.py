"""PipelineService — Manages triggering post-meeting AI processing pipeline orchestrator.
"""

import asyncio
import logging
from typing import Any

from app.meeting.models.session import MeetingSession

from app.meeting.logger import get_logger

log = get_logger("pipeline_service")


class PipelineService:
    """Handles post-meeting processing pipeline dispatching."""

    def trigger_pipeline(self, session_id: str, session: MeetingSession | None = None, metadata: dict[str, Any] | None = None) -> asyncio.Task | None:
        """Trigger asynchronous execution of the MeetingPipelineOrchestrator."""
        recording_artifact_id = getattr(session, "recording_artifact_id", None) if session else True
        if session and not recording_artifact_id:
            log.info("pipeline.skipped_no_recording", session_id=session_id)
            return None

        try:
            from app.meeting.pipeline.orchestrator import MeetingPipelineOrchestrator
            org_id = getattr(session, "org_id", 1) if session else 1
            session_meta = getattr(session, "metadata", {}) if session else {}
            merged_meta = {"org_id": org_id, **(session_meta or {}), **(metadata or {})}

            log.info("pipeline.starting", session_id=session_id, org_id=org_id)
            orchestrator = MeetingPipelineOrchestrator(meeting_id=session_id, metadata=merged_meta)
            task = asyncio.create_task(
                orchestrator.execute_pipeline(),
                name=f"pipeline-{session_id[:8]}",
            )
            return task
        except Exception as exc:
            log.error("pipeline.start_failed", session_id=session_id, error=str(exc))
            return None
