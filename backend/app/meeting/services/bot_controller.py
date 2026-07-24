"""BotController — Manages bot execution environment, Playwright/executor interaction, health monitoring, and intelligence observers.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any, Callable

from app.meeting.bot.executor import LocalPlaywrightExecutor, MeetingExecutor
from app.meeting.bot.session.manager import MeetingSessionManager
from app.meeting.bot.session.monitor import HealthMonitor
from app.meeting.config import meeting_config
from app.meeting.intelligence.clock import MeetingClock
from app.meeting.intelligence.context import MeetingContext
from app.meeting.intelligence.event_bus import EventBus
from app.meeting.intelligence.lifecycle import MeetingLifecycle
from app.meeting.intelligence.supervisor import ObserverSupervisor
from app.meeting.models.session import JoinState
from app.meeting.utils.debug import DebugCapture

from app.meeting.logger import get_logger

log = get_logger("bot_controller")


class BotController:
    """Controls bot execution environment, Playwright executor lifecycle, health monitoring, and observers."""

    def __init__(
        self,
        executor_factory: Callable[[], MeetingExecutor] | None = None,
        session_manager: MeetingSessionManager | None = None,
    ) -> None:
        self._executor_factory = executor_factory or (lambda: LocalPlaywrightExecutor())
        self._session_manager = session_manager or MeetingSessionManager()
        self._monitor = HealthMonitor(self._session_manager)
        debug_dir = Path(meeting_config.DEBUG_DIR) if getattr(meeting_config, "DEBUG_DIR", None) else None
        self._debug = DebugCapture(debug_dir)

    def create_executor(self) -> MeetingExecutor:
        """Instantiate a new MeetingExecutor."""
        return self._executor_factory()

    async def launch_and_join(
        self,
        executor: MeetingExecutor,
        session_id: str,
        meeting_url: str,
        bot_name: str,
    ) -> JoinState:
        """Launch browser context and join room via the executor."""
        return await executor.launch_and_join(session_id, meeting_url, bot_name)

    async def capture_debug_on_failure(
        self,
        executor: MeetingExecutor,
        session_id: str,
        reason: str = "exception",
    ) -> str | None:
        """Capture screenshot and HTML debug context if page is usable."""
        if not executor or not executor.is_page_usable():
            return None
        try:
            return await self._debug.capture(executor.get_page(), session_id, reason)
        except Exception as exc:
            log.warning("bot_controller.debug_capture_failed", session_id=session_id, error=str(exc))
            return None

    async def start_intelligence(
        self,
        session_id: str,
        page: Any,
        event_handler_cb: Callable[[Any], Any],
    ) -> tuple[EventBus, MeetingClock, MeetingLifecycle, ObserverSupervisor, MeetingContext]:
        """Initialize and start intelligence observers, event bus, clock, and lifecycle."""
        event_bus = EventBus()
        clock = MeetingClock()
        lifecycle = MeetingLifecycle(session_id)
        supervisor = ObserverSupervisor()

        ctx = MeetingContext(
            session_id=session_id,
            page=page,
            config=meeting_config,
            event_bus=event_bus,
            clock=clock,
            bot_name=meeting_config.BOT_NAME,
        )

        event_bus.subscribe(None, event_handler_cb)
        await supervisor.start_all(ctx)
        log.info("bot_controller.intelligence_started", session_id=session_id)

        return event_bus, clock, lifecycle, supervisor, ctx

    async def stop_intelligence(self, supervisor: ObserverSupervisor | None) -> None:
        """Stop all intelligence observers."""
        if supervisor:
            try:
                await asyncio.wait_for(supervisor.stop_all(), timeout=5.0)
            except Exception as exc:
                log.warning("bot_controller.stop_intelligence_failed", error=str(exc))

    def start_health_monitor(
        self,
        session_id: str,
        controller: Any,
        page: Any,
        supervisor: Any,
        shutdown_cb: Callable[[str, str], None],
        shutdown_req_cb: Callable[[], bool],
    ) -> asyncio.Task[None]:
        """Start session health monitoring task."""
        return self._monitor.start(
            session_id,
            controller,
            page,
            supervisor=supervisor,
            shutdown_callback=shutdown_cb,
            shutdown_requested=shutdown_req_cb,
        )

    async def leave_meeting(self, executor: MeetingExecutor | None, meeting_url: str = "") -> None:
        """Send leave command via executor."""
        if executor:
            try:
                await executor.leave(meeting_url)
            except Exception as exc:
                log.warning("bot_controller.leave_failed", error=str(exc))

    async def close_executor(self, executor: MeetingExecutor | None) -> None:
        """Close browser context and release profile lock."""
        if executor:
            try:
                await executor.close()
            except Exception as exc:
                log.warning("bot_controller.close_executor_failed", error=str(exc))
