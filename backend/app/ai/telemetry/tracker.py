import logging
from typing import Any, Optional

logger = logging.getLogger("ai.telemetry")
logger.setLevel(logging.INFO)

# Free-text argument keys whose values are REDACTED in audit logs.
# Entity IDs (task_id, board_id, etc.) are NOT in this set and always log in full.
_REDACT_KEYS = frozenset({
    "content", "description", "title", "comment",
    "rich_content", "canvas_data", "annotations",
    "body", "text", "message", "note",
})


def _redact_arguments(arguments: Any) -> Any:
    """
    Recursively redact free-text fields from tool argument dicts.
    Replaces string values for keys in _REDACT_KEYS with a safe summary.
    Entity IDs and all other fields pass through unchanged.
    """
    if isinstance(arguments, dict):
        redacted = {}
        for k, v in arguments.items():
            if k in _REDACT_KEYS and isinstance(v, str):
                redacted[k] = {"__redacted": True, "length": len(v)}
            else:
                redacted[k] = _redact_arguments(v)
        return redacted
    if isinstance(arguments, list):
        return [_redact_arguments(item) for item in arguments]
    return arguments


class ToolTelemetryTracker:

    @staticmethod
    def record_tool_execution(
        tool_name: str,
        latency: float,
        success: bool,
        error: Optional[str] = None,
        agent_name: Optional[str] = None,
        # --- new audit fields ---
        user_id: Optional[int] = None,
        org_id: Optional[int] = None,
        arguments: Optional[Any] = None,
        result: Optional[Any] = None,
    ) -> None:
        """
        Record the outcome of a single tool execution.

        Free-text argument fields (content, description, title, etc.) are
        redacted to length-only summaries.  Entity ID fields always log in full.
        """
        from app.ai.telemetry.bus import telemetry_bus
        from app.ai.telemetry.events import EventType
        from app.ai.telemetry.context import TraceContext

        redacted_args = _redact_arguments(arguments) if arguments is not None else {}

        payload = {
            "type": "ai_tool_telemetry",
            "tool_name": tool_name,
            "agent_name": agent_name,
            "latency_ms": int(latency * 1000),
            "success": success,
            "error": error,
        }

        if success:
            logger.info(f"Tool {tool_name} Executed Successfully", extra=payload)
        else:
            logger.error(f"Tool {tool_name} Failed: {error}", extra=payload)

        # Publish structured record to all sinks (including StructuredFileLogSink).
        sink_record = {
            "event": "tool_executed",
            "tool_name": tool_name,
            "user_id": user_id,
            "org_id": org_id,
            "arguments": redacted_args,
            "result": result if success else None,
            "success": success,
            "error": error,
            "latency_ms": int(latency * 1000),
        }

        telemetry_bus.publish(
            event_type=EventType.TOOL_EXECUTION_COMPLETED,
            request_id=TraceContext.get_request_id(),
            execution_id=TraceContext.get_execution_id(),
            metadata={"_sink_record": sink_record, **payload},
        )

    @staticmethod
    def record_preflight_write(
        tool_name: str,
        user_id: Optional[int],
        org_id: Optional[int],
        arguments: Optional[Any],
    ) -> None:
        """
        Emit a pre-flight audit record BEFORE execute() is called.

        This ensures mutation intent is logged even when execute() raises
        mid-call (e.g. partial DB failure).  Always logged for is_write_action=True tools.
        """
        from app.ai.telemetry.bus import telemetry_bus
        from app.ai.telemetry.events import EventType
        from app.ai.telemetry.context import TraceContext

        redacted_args = _redact_arguments(arguments) if arguments is not None else {}

        sink_record = {
            "event": "preflight_write",
            "tool_name": tool_name,
            "user_id": user_id,
            "org_id": org_id,
            "arguments": redacted_args,
            "result": None,
            "success": None,
            "error": None,
            "latency_ms": None,
        }

        telemetry_bus.publish(
            event_type=EventType.TOOL_EXECUTION_STARTED,
            request_id=TraceContext.get_request_id(),
            execution_id=TraceContext.get_execution_id(),
            metadata={"_sink_record": sink_record},
        )


tool_telemetry = ToolTelemetryTracker()
