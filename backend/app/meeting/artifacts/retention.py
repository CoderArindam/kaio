"""Artifact retention policy and manager for meeting recording lifecycle cleanup.
"""

from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Set

from app.meeting.logger import get_logger

log = get_logger("artifacts.retention")


class ArtifactRetentionPolicy(str, Enum):
    """Artifact retention policy for meeting processing lifecycle."""

    KEEP_ALL = "KEEP_ALL"
    KEEP_TRANSCRIPT_ONLY = "KEEP_TRANSCRIPT_ONLY"
    KEEP_NOTHING = "KEEP_NOTHING"


class ArtifactRetentionManager:
    """Handles automatic cleanup of meeting recording and processing artifacts."""

    TRANSCRIPT_ALLOWED_FILES: Set[str] = {
        "participant_attributed_transcript.json",
        "task_proposals_manifest.json",
    }

    @classmethod
    def apply_retention_policy(
        cls,
        meeting_id: str,
        policy: ArtifactRetentionPolicy | str | None = None,
        recording_dir: Path | str | None = None,
        processing_dir: Path | str | None = None,
    ) -> None:
        """Applies the specified retention policy to meeting artifacts idempotently.

        Args:
            meeting_id: Meeting session identifier.
            policy: retention policy to enforce (defaults to config setting).
            recording_dir: custom recording directory (defaults to RECORDING_OUTPUT_DIR/meeting_id).
            processing_dir: custom processing directory (defaults to PROCESSING_OUTPUT_DIR/meeting_id).
        """
        from app.meeting.config import meeting_config

        if policy is None:
            policy = meeting_config.ARTIFACT_RETENTION_POLICY

        if isinstance(policy, str):
            try:
                policy = ArtifactRetentionPolicy(policy.upper())
            except ValueError:
                log.warning(
                    "retention.invalid_policy",
                    meeting_id=meeting_id,
                    invalid_policy=policy,
                    fallback=ArtifactRetentionPolicy.KEEP_TRANSCRIPT_ONLY.value,
                )
                policy = ArtifactRetentionPolicy.KEEP_TRANSCRIPT_ONLY

        log.info(
            "retention.apply_started",
            meeting_id=meeting_id,
            policy=policy.value,
        )

        if policy == ArtifactRetentionPolicy.KEEP_ALL:
            log.info("retention.skipped_keep_all", meeting_id=meeting_id)
            return

        rec_dir = Path(recording_dir) if recording_dir else Path(meeting_config.RECORDING_OUTPUT_DIR) / meeting_id
        proc_dir = Path(processing_dir) if processing_dir else Path(meeting_config.PROCESSING_OUTPUT_DIR) / meeting_id

        dirs_to_clean: list[Path] = []
        if rec_dir.exists():
            dirs_to_clean.append(rec_dir.resolve())
        if proc_dir.exists() and proc_dir.resolve() not in dirs_to_clean:
            dirs_to_clean.append(proc_dir.resolve())

        deleted_files: list[str] = []
        kept_files: list[str] = []

        for target_dir in dirs_to_clean:
            if not target_dir.exists() or not target_dir.is_dir():
                continue

            for file_path in list(target_dir.rglob("*")):
                if file_path.is_file():
                    fname = file_path.name

                    should_keep = False
                    if policy == ArtifactRetentionPolicy.KEEP_TRANSCRIPT_ONLY:
                        if fname in cls.TRANSCRIPT_ALLOWED_FILES:
                            should_keep = True

                    if should_keep:
                        kept_files.append(str(file_path))
                    else:
                        try:
                            file_path.unlink(missing_ok=True)
                            deleted_files.append(str(file_path))
                            log.info(
                                "retention.file_deleted",
                                meeting_id=meeting_id,
                                file=fname,
                                path=str(file_path),
                            )
                        except Exception as exc:
                            log.warning(
                                "retention.file_delete_failed",
                                meeting_id=meeting_id,
                                path=str(file_path),
                                error=str(exc),
                            )

            # Clean up empty subdirectories if any
            for sub_dir in sorted(target_dir.rglob("*"), reverse=True):
                if sub_dir.is_dir():
                    try:
                        sub_dir.rmdir()
                    except OSError:
                        pass

            # Remove main directory if empty
            try:
                if target_dir.exists() and not any(target_dir.iterdir()):
                    target_dir.rmdir()
                    log.info("retention.directory_removed", meeting_id=meeting_id, path=str(target_dir))
            except OSError:
                pass

        log.info(
            "retention.apply_completed",
            meeting_id=meeting_id,
            policy=policy.value,
            deleted_count=len(deleted_files),
            kept_count=len(kept_files),
            kept_files=[Path(f).name for f in kept_files],
        )
