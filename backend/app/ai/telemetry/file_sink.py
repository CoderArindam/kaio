"""
Structured JSON file sink for AI tool execution audit logs.

INTERIM IMPLEMENTATION — replace with a DB sink writing to
`ai_tool_execution_log` via a stored function in a future migration phase.
This file sink exists purely to close the telemetry persistence gap identified
in the AI audit (2026-08-21) while the DB migration is scheduled.

Records are appended as newline-delimited JSON to:
    <backend working directory>/logs/ai_tool_audit.jsonl

Each line is a self-contained JSON object so the file can be streamed,
rotated, or imported without a parser that understands the full file.
"""
import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

from .events import TelemetryEvent, EventType
from .sinks import TelemetrySink

logger = logging.getLogger("ai.telemetry.file_sink")

# Events this sink persists — only tool-level audit events, not every span.
_PERSISTED_EVENTS = {
    EventType.TOOL_EXECUTION_STARTED,
    EventType.TOOL_EXECUTION_COMPLETED,
}


class StructuredFileLogSink(TelemetrySink):
    """
    Appends tool execution audit records to a newline-delimited JSON file.

    Each record schema:
    {
        "ts":         "<ISO-8601 UTC>",
        "event":      "preflight_write" | "tool_executed",
        "tool_name":  str,
        "user_id":    int | None,
        "org_id":     int | None,
        "arguments":  dict,          # free-text fields redacted
        "result":     dict | None,   # None on pre-flight
        "success":    bool | None,   # None on pre-flight
        "error":      str | None,
        "latency_ms": int | None,
        "request_id": str | None,
        "execution_id": str | None,
    }
    """

    def __init__(self, log_path: str | None = None):
        if log_path is None:
            base = Path(os.getcwd())
            log_path = str(base / "logs" / "ai_tool_audit.jsonl")
        self._path = Path(log_path)
        self._lock = threading.Lock()
        self._ensure_dir()

    def _ensure_dir(self) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.warning(f"StructuredFileLogSink: could not create log dir: {e}")

    def process_event(self, event: TelemetryEvent) -> None:
        # This sink writes records injected via metadata by tracker.py.
        # It listens for our custom event types carried inside TOOL_EXECUTION_COMPLETED
        # and a custom "PREFLIGHT_WRITE" marker we embed in metadata["_sink_record"].
        record = event.metadata.get("_sink_record")
        if record is None:
            return
        record.setdefault("request_id", event.request_id)
        record.setdefault("execution_id", event.execution_id)
        record.setdefault("ts", datetime.now(timezone.utc).isoformat())
        self._write(record)

    def _write(self, record: dict) -> None:
        try:
            line = json.dumps(record, default=str) + "\n"
            with self._lock:
                with open(self._path, "a", encoding="utf-8") as f:
                    f.write(line)
        except Exception as e:
            logger.error(f"StructuredFileLogSink: write failed: {e}")
