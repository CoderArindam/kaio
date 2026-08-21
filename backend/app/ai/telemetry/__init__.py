import os
from .bus import telemetry_bus
from .sinks import ConsoleLoggerSink, LogLevel
from .file_sink import StructuredFileLogSink
from .context import Span, TraceContext
from .events import EventType

# Configure console sink based on environment variable
debug_mode = os.getenv("AI_DEBUG_MODE", "INFO").upper()
try:
    log_level = LogLevel[debug_mode]
except KeyError:
    log_level = LogLevel.INFO

console_sink = ConsoleLoggerSink(level=log_level)
telemetry_bus.register_sink(console_sink)

# INTERIM: structured JSON file sink for tool execution audit trail.
# Replace with a DB sink (ai_tool_execution_log table via stored function)
# in the next migration phase.
file_sink = StructuredFileLogSink()
telemetry_bus.register_sink(file_sink)

__all__ = ["telemetry_bus", "Span", "TraceContext", "EventType", "LogLevel"]
