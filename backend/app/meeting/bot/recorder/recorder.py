"""MeetingRecorder — browser audio capture using Linux Audio Subsystem (PulseAudio/PipeWire) and FFmpeg.

Captures system/browser audio output directly via FFmpeg reading from PulseAudio/PipeWire.
On stop(), the FFmpeg process is gracefully stopped via SIGINT, and the recording is
persisted and returned as a MeetingRecording artifact.
"""

from __future__ import annotations

import asyncio
import os
import signal
import tempfile
import time
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Any

from app.meeting.artifacts.recording import MeetingRecording
from app.meeting.config import meeting_config
from app.meeting.exceptions import RecordingInitError, RecordingWriteError
from app.meeting.logger import get_logger
from app.meeting.recording.storage import RecordingStorage, compute_sha256

if TYPE_CHECKING:
    pass

import subprocess
import re


log = get_logger("recording")


def discover_win_audio_devices(ffmpeg_path: str = "ffmpeg") -> list[str]:
    """Scans Windows DirectShow audio input devices via FFmpeg."""
    try:
        cmd = [ffmpeg_path, "-list_devices", "true", "-f", "dshow", "-i", "dummy"]
        res = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True, timeout=5)
        output = res.stderr or ""
        devices = []
        for line in output.splitlines():
            if "(audio)" in line:
                match = re.search(r'"([^"]+)"\s+\(audio\)', line)
                if match:
                    devices.append(match.group(1))
        return devices
    except Exception as exc:
        log.warning("recording.dshow_scan_failed", error=str(exc))
        return []


# ------------------------------------------------------------------ #
# Recorder State                                                       #
# ------------------------------------------------------------------ #

class RecorderState(str, Enum):
    IDLE = "idle"
    INITIALIZING = "initializing"
    READY = "ready"
    RECORDING = "recording"
    STOPPING = "stopping"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


# ------------------------------------------------------------------ #
# MeetingRecorder                                                      #
# ------------------------------------------------------------------ #

class MeetingRecorder:
    """Single-owner component for meeting audio capture lifecycle via FFmpeg."""

    def __init__(self, storage: RecordingStorage) -> None:
        self._storage = storage
        self._state = RecorderState.IDLE
        self._page: Any = None
        self._session_id: str | None = None
        self._meeting_id: str | None = None

        # FFmpeg process management
        self._process: asyncio.subprocess.Process | None = None
        self._temp_output_path: str | None = None

        # Timing
        self._start_time: float | None = None
        self._end_time: float | None = None
        self._start_dt: datetime | None = None
        self._end_dt: datetime | None = None

        # Metadata
        self._mime_type: str = "audio/webm;codecs=opus"
        self._artifact: MeetingRecording | None = None

    @property
    def state(self) -> RecorderState:
        return self._state

    @property
    def is_recording(self) -> bool:
        return self._state == RecorderState.RECORDING

    async def initialize(self, page: Any, session_id: str, meeting_id: str | None = None) -> None:
        """Prepare recorder for session.

        Must be called before start(). Maintained for signature & lifecycle compatibility.
        """
        if self._state != RecorderState.IDLE:
            return

        self._state = RecorderState.INITIALIZING
        self._page = page
        self._session_id = session_id
        self._meeting_id = meeting_id or session_id

        log.info("recording.initializing", session_id=session_id)

        try:
            self._state = RecorderState.READY
            log.info("recording.initialized", session_id=session_id)
        except Exception as exc:
            self._state = RecorderState.FAILED
            raise RecordingInitError(f"Recorder initialization failed: {exc}") from exc

    async def start(self) -> None:
        """Spawn FFmpeg process to capture browser/system audio from PulseAudio."""
        if self._state != RecorderState.READY:
            log.warning(
                "recording.start.skipped",
                session_id=self._session_id,
                state=self._state.value,
            )
            return

        try:
            fd, tmp_path = tempfile.mkstemp(suffix=".webm", prefix="kaio_rec_")
            os.close(fd)
            self._temp_output_path = tmp_path

            import sys
            pulse_source = getattr(meeting_config, "RECORDING_PULSE_SOURCE", "default")
            
            if sys.platform == "win32":
                connected_devices = discover_win_audio_devices(meeting_config.FFMPEG_PATH)
                log.info("recording.dshow_devices_found", devices=connected_devices)

                win_sys_device = getattr(meeting_config, "RECORDING_WIN_AUDIO_DEVICE", "")
                win_mic_device = getattr(meeting_config, "RECORDING_WIN_MIC_DEVICE", "")

                valid_sys = win_sys_device if win_sys_device in connected_devices else ""
                valid_mic = win_mic_device if win_mic_device in connected_devices else ""

                if not valid_sys:
                    for d in connected_devices:
                        if "stereo mix" in d.lower() or "mix" in d.lower():
                            valid_sys = d
                            break

                if not valid_mic:
                    for d in connected_devices:
                        if d != valid_sys and ("mic" in d.lower() or "headset" in d.lower() or "array" in d.lower()):
                            valid_mic = d
                            break

                if valid_sys and valid_mic and valid_sys != valid_mic:
                    log.info("recording.ffmpeg.dual_channel_mix", sys_device=valid_sys, mic_device=valid_mic)
                    audio_input = [
                        "-f", "dshow", "-i", f"audio={valid_sys}",
                        "-f", "dshow", "-i", f"audio={valid_mic}",
                        "-filter_complex", "amix=inputs=2:duration=first"
                    ]
                elif valid_sys:
                    log.info("recording.ffmpeg.single_channel", device=valid_sys)
                    audio_input = ["-f", "dshow", "-i", f"audio={valid_sys}"]
                elif valid_mic:
                    log.info("recording.ffmpeg.single_channel", device=valid_mic)
                    audio_input = ["-f", "dshow", "-i", f"audio={valid_mic}"]
                elif connected_devices:
                    log.info("recording.ffmpeg.fallback_connected", device=connected_devices[0])
                    audio_input = ["-f", "dshow", "-i", f"audio={connected_devices[0]}"]
                else:
                    log.warning("recording.ffmpeg.no_dshow_devices_found_using_sine_generator")
                    audio_input = ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000"]
            else:
                audio_input = ["-f", "pulse", "-i", pulse_source]

            cmd = [
                meeting_config.FFMPEG_PATH,
                "-y",
                *audio_input,
                "-acodec", "libopus",
                "-ar", str(meeting_config.RECORDING_SAMPLE_RATE),
                "-ac", "2",
                "-b:a", "128k",
                "-f", "webm",
                self._temp_output_path,
            ]

            log.info("recording.ffmpeg.starting", session_id=self._session_id, pulse_source=pulse_source, platform=sys.platform, output=self._temp_output_path)

            # Phase 1: Brief probe to validate DirectShow devices can be opened.
            # Uses stderr=PIPE but only lives for ~1 second so pipe buffer never fills.
            if sys.platform == "win32":
                probe_ok = await self._probe_ffmpeg_devices(cmd)
                if not probe_ok:
                    fallback_device = valid_sys or (connected_devices[0] if connected_devices else "")
                    if fallback_device:
                        log.info("recording.ffmpeg.fallback_single_channel", session_id=self._session_id, device=fallback_device)
                        cmd = [
                            meeting_config.FFMPEG_PATH,
                            "-y",
                            "-f", "dshow", "-i", f"audio={fallback_device}",
                            "-acodec", "libopus",
                            "-ar", str(meeting_config.RECORDING_SAMPLE_RATE),
                            "-ac", "2",
                            "-b:a", "128k",
                            "-f", "webm",
                            self._temp_output_path,
                        ]
                    else:
                        raise RecordingInitError("No audio devices available and probe failed")

            # Phase 2: Real long-running process — stderr=DEVNULL so pipe buffer NEVER blocks.
            self._process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )

            # Quick sanity: if FFmpeg exits instantly (bad codec, missing file, etc.)
            await asyncio.sleep(0.5)
            if self._process.returncode is not None:
                log.error("recording.ffmpeg.instant_exit", session_id=self._session_id, returncode=self._process.returncode)
                raise RecordingInitError(f"FFmpeg exited immediately with code {self._process.returncode}")

            self._start_time = time.monotonic()
            self._start_dt = datetime.now(timezone.utc)
            self._state = RecorderState.RECORDING

            log.info("recording.started", session_id=self._session_id, pid=self._process.pid)

        except Exception as exc:
            self._state = RecorderState.FAILED
            log.error("recording.start.failed", session_id=self._session_id, error=str(exc))
            raise RecordingInitError(f"Failed to start FFmpeg recording process: {exc}") from exc

    async def _probe_ffmpeg_devices(self, cmd: list[str]) -> bool:
        """Spawn a short-lived FFmpeg process to verify devices can be opened.

        Returns True if the probe stays alive (devices valid), False otherwise.
        The probe is always killed before returning — it never becomes the
        long-running recording process, so stderr=PIPE is safe here.
        """
        probe = None
        try:
            # Use NUL output — we only care if FFmpeg can open the input devices
            probe_cmd = list(cmd)
            # Replace output path with NUL to avoid writing
            probe_cmd[-1] = "NUL"
            probe = await asyncio.create_subprocess_exec(
                *probe_cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            await asyncio.sleep(1.0)

            if probe.returncode is not None:
                _, err_bytes = await probe.communicate()
                err_msg = err_bytes.decode("utf-8", errors="replace") if err_bytes else ""
                log.warning("recording.probe.failed", session_id=self._session_id, returncode=probe.returncode, error=err_msg[:500])
                return False

            log.info("recording.probe.passed", session_id=self._session_id)
            return True
        except Exception as exc:
            log.warning("recording.probe.error", session_id=self._session_id, error=str(exc))
            return False
        finally:
            if probe and probe.returncode is None:
                try:
                    probe.kill()
                    await probe.wait()
                except Exception:
                    pass

    async def stop(self) -> MeetingRecording | None:
        """Stop FFmpeg process gracefully, read WebM audio, persist artifact, and return."""
        if self._state not in (RecorderState.RECORDING, RecorderState.READY):
            log.info(
                "recording.stop.skipped",
                session_id=self._session_id,
                state=self._state.value,
            )
            return None

        self._state = RecorderState.STOPPING
        self._end_time = time.monotonic()
        self._end_dt = datetime.now(timezone.utc)

        log.info("recording.stopping", session_id=self._session_id)

        try:
            if self._process and self._process.returncode is None:
                try:
                    import sys
                    if self._process.stdin and not self._process.stdin.is_closing():
                        self._process.stdin.write(b"q\n")
                        await self._process.stdin.drain()
                    elif sys.platform != "win32" and hasattr(signal, "SIGINT"):
                        self._process.send_signal(signal.SIGINT)
                    else:
                        self._process.terminate()

                    await asyncio.wait_for(self._process.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    log.warning("recording.ffmpeg.stop_timeout", session_id=self._session_id)
                    try:
                        self._process.terminate()
                        await asyncio.wait_for(self._process.wait(), timeout=2.0)
                    except Exception:
                        self._process.kill()
                except Exception as exc:
                    log.warning("recording.ffmpeg.stop_error", session_id=self._session_id, error=str(exc))
                    try:
                        self._process.kill()
                    except Exception:
                        pass

            if not self._temp_output_path or not Path(self._temp_output_path).exists():
                log.warning("recording.stop.no_file", session_id=self._session_id)
                self._state = RecorderState.FAILED
                return None

            audio_data = Path(self._temp_output_path).read_bytes()
            if not audio_data:
                log.warning("recording.stop.no_data", session_id=self._session_id)
                self._state = RecorderState.FAILED
                return None

            artifact = await self._persist(audio_data)
            self._artifact = artifact

            self._state = RecorderState.COMPLETED
            log.info(
                "recording.completed",
                session_id=self._session_id,
                artifact_id=artifact.id,
                duration_seconds=artifact.duration_seconds,
                file_size_bytes=artifact.file_size_bytes,
            )
            return artifact

        except Exception as exc:
            self._state = RecorderState.FAILED
            log.error("recording.stop.failed", session_id=self._session_id, error=str(exc))
            return None
        finally:
            await self.cleanup()

    async def cancel(self) -> None:
        """Abort recording immediately. Terminate FFmpeg process and discard data."""
        if self._state in (RecorderState.COMPLETED, RecorderState.CANCELLED):
            return

        log.info("recording.cancelled", session_id=self._session_id, state=self._state.value)
        self._state = RecorderState.CANCELLED

        if self._process and self._process.returncode is None:
            try:
                self._process.terminate()
                await asyncio.wait_for(self._process.wait(), timeout=2.0)
            except Exception:
                try:
                    self._process.kill()
                except Exception:
                    pass

        await self.cleanup()

    async def cleanup(self) -> None:
        """Idempotent cleanup. Removes temporary file artifacts."""
        log.info("recording.cleanup.started", session_id=self._session_id)

        if self._temp_output_path:
            try:
                Path(self._temp_output_path).unlink(missing_ok=True)
            except OSError as exc:
                log.warning("recording.cleanup.temp_delete_failed", path=self._temp_output_path, error=str(exc))
            self._temp_output_path = None

        self._process = None
        log.info("recording.cleanup.completed", session_id=self._session_id)

    # ------------------------------------------------------------------ #
    # Internal                                                             #
    # ------------------------------------------------------------------ #

    async def _persist(self, audio_data: bytes) -> MeetingRecording:
        checksum = compute_sha256(audio_data)

        local_path, storage_uri = await self._storage.save(
            self._session_id, audio_data, "webm"
        )

        duration = (
            (self._end_time - self._start_time)
            if self._start_time and self._end_time
            else 0.0
        )

        return MeetingRecording(
            meeting_id=self._meeting_id,
            file_path=local_path,
            storage_uri=storage_uri,
            duration_seconds=round(duration, 3),
            format="webm",
            sample_rate=meeting_config.RECORDING_SAMPLE_RATE,
            channel_count=2,
            codec="opus",
            mime_type=self._mime_type,
            file_size_bytes=len(audio_data),
            checksum_sha256=checksum,
            recording_start_time=self._start_dt.isoformat() if self._start_dt else "",
            recording_end_time=self._end_dt.isoformat() if self._end_dt else "",
            recording_status="completed",
        )
