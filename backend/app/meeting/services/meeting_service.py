"""MeetingService — top-level orchestration for the meeting module.

Responsibilities (SRP Refactored):
- Pure orchestration facade for the meeting subsystem
- Delegates execution to BotController, RecordingService, PipelineService, StorageService
- Coordinates session lifecycle (MeetingSessionManager)
- Bridges EventBus events -> MeetingSession

Dependency rules:
- Depends ONLY on meeting-internal components
- Never imports app.ai, app.services, app.auth, app.database, etc.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable

from app.meeting.bot.executor import LocalPlaywrightExecutor, MeetingExecutor
from app.meeting.bot.session.manager import MeetingSessionManager
from app.meeting.config import meeting_config
from app.meeting.intelligence.event_bus import EventBus
from app.meeting.intelligence.lifecycle import MeetingLifecycle
from app.meeting.intelligence.models import (
    EventCategory,
    EventType,
    MeetingEvent,
    Participant,
)
from app.meeting.intelligence.supervisor import ObserverSupervisor
from app.meeting.logger import get_logger
from app.meeting.models.session import JoinState, MeetingSession, SessionStatus, TERMINAL_STATUSES
from app.meeting.bot.recorder.recorder import MeetingRecorder
from app.meeting.services.bot_controller import BotController
from app.meeting.services.pipeline_service import PipelineService
from app.meeting.services.recording_service import RecordingService
from app.meeting.services.storage_service import StorageService

log = get_logger("service")


# ------------------------------------------------------------------ #
# Single-Owner Runtime Model                                           #
# ------------------------------------------------------------------ #

class RuntimeState(str, Enum):
    """Internal lifecycle of a MeetingRuntime."""
    STARTING = "starting"
    RUNNING = "running"
    LEAVING = "leaving"
    CLEANING_UP = "cleaning_up"
    CLOSED = "closed"


@dataclass
class MeetingRuntime:
    """The single-owner container for all resources of a session.

    Guarantees cleanup is executed exactly once via the join task.
    """
    session_id: str

    state: RuntimeState = RuntimeState.STARTING
    shutdown_reason: str | None = None
    _cleanup_event: asyncio.Event = field(default_factory=asyncio.Event)
    _cleanup_finished: asyncio.Event = field(default_factory=asyncio.Event)

    # Executor abstraction
    executor: MeetingExecutor | None = None

    # Intelligence (populated after join)
    context: Any | None = None
    supervisor: ObserverSupervisor | None = None
    event_bus: EventBus | None = None
    lifecycle: MeetingLifecycle | None = None

    # Recording (populated after intelligence starts, before RUNNING)
    recorder: MeetingRecorder | None = None
    recording_artifact: Any | None = None

    # Task registry
    background_tasks: dict[str, asyncio.Task] = field(default_factory=dict)

    @property
    def controller(self) -> Any:
        return self.executor.get_controller() if self.executor else None

    @property
    def profile_path(self) -> Path | None:
        return self.executor.get_profile_path() if self.executor else None

    def request_shutdown(self, reason: str) -> None:
        """Signal the join flow owner to begin teardown."""
        log.info("cleanup_requested.set", reason=reason)
        if self.state in (RuntimeState.CLEANING_UP, RuntimeState.CLOSED):
            return
        self.shutdown_reason = reason
        self._cleanup_event.set()

    async def wait_for_shutdown(self) -> None:
        """Block until a shutdown is requested."""
        await self._cleanup_event.wait()

    async def wait_for_cleanup(self) -> None:
        """Block until the cleanup sequence is completely finished."""
        await self._cleanup_finished.wait()


# ------------------------------------------------------------------ #
# MeetingService (Pure Orchestrator)                                 #
# ------------------------------------------------------------------ #

class MeetingService:
    """High-level orchestrator — coordinates SRP services for meeting workflows."""

    def __init__(
        self,
        executor_factory: Callable[[], MeetingExecutor] | None = None,
        storage_service: StorageService | None = None,
        recording_service: RecordingService | None = None,
        pipeline_service: PipelineService | None = None,
        bot_controller: BotController | None = None,
    ) -> None:
        self._session_manager = MeetingSessionManager()
        self._storage_service = storage_service or StorageService()
        self._recording_service = recording_service or RecordingService(self._storage_service)
        self._pipeline_service = pipeline_service or PipelineService()
        self._bot_controller = bot_controller or BotController(
            executor_factory=executor_factory or (lambda: LocalPlaywrightExecutor()),
            session_manager=self._session_manager,
        )

        self._runtimes: dict[str, MeetingRuntime] = {}

    @property
    def bot_controller(self) -> BotController:
        return self._bot_controller

    @property
    def recording_service(self) -> RecordingService:
        return self._recording_service

    @property
    def pipeline_service(self) -> PipelineService:
        return self._pipeline_service

    @property
    def storage_service(self) -> StorageService:
        return self._storage_service

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    async def join_meeting(
        self,
        meeting_url: str,
        session_id: str | None = None,
        org_id: int = 1,
        metadata: dict | None = None
    ) -> MeetingSession:
        """Create a session and fire the join flow asynchronously."""
        executor = self._bot_controller.create_executor()
        profile_path = executor.get_profile_path()

        # Emit structured dump of every registered MeetingRuntime
        detailed_registry_dump = {}
        for sid, rt in self._runtimes.items():
            join_task = rt.background_tasks.get("join_flow")
            detailed_registry_dump[sid] = {
                "session_id": sid,
                "state": rt.state.value,
                "profile_name": rt.profile_path.name if rt.profile_path else None,
                "cleanup_requested": rt._cleanup_event.is_set(),
                "cleanup_completed": rt._cleanup_finished.is_set(),
                "join_task_is_none": join_task is None,
                "join_task_done": join_task.done() if join_task else None,
                "join_task_cancelled": join_task.cancelled() if join_task and join_task.done() else None,
                "join_task_exception": str(join_task.exception()) if join_task and join_task.done() and not join_task.cancelled() and not isinstance(join_task.exception(), asyncio.CancelledError) else None,
                "controller_exists": rt.controller is not None,
                "page_is_closed": rt.executor.get_page().is_closed() if rt.executor and rt.executor.get_page() and hasattr(rt.executor.get_page(), "is_closed") else None,
            }
        log.warning("diagnostic.registry_dump", dump=detailed_registry_dump)

        # Prevent concurrent join attempts on the same profile
        for existing_rt in self._runtimes.values():
            if existing_rt.profile_path == profile_path and existing_rt.state != RuntimeState.CLOSED:
                raise RuntimeError("Session is already running or shutting down.")

        session = self._session_manager.create(
            meeting_url,
            session_id=session_id,
            org_id=org_id,
            metadata=metadata
        )

        task = asyncio.create_task(
            self._run_join_flow(session.session_id, meeting_url, executor),
            name=f"meeting-join-{session.session_id[:8]}",
        )

        log.info(
            "meeting.join.start — async task fired",
            session_id=session.session_id,
            url=meeting_url,
        )
        return session

    async def leave_meeting(self, session_id: str) -> MeetingSession | None:
        """Gracefully leave a meeting by signaling the runtime to shut down."""
        session = self._session_manager.get(session_id)
        if not session:
            return None

        self._session_manager.update_state(session_id, SessionStatus.LEAVING)

        runtime = self._runtimes.get(session_id)
        if runtime:
            if runtime.state == RuntimeState.RUNNING:
                runtime.state = RuntimeState.LEAVING
                log.info("runtime.leaving", session_id=session_id, runtime_state=runtime.state.value, profile_name=runtime.profile_path.name if runtime.profile_path else "unknown")
            runtime.request_shutdown("api_leave_requested")
            await runtime.wait_for_cleanup()

        return self._session_manager.get(session_id)

    def get_session(self, session_id: str) -> MeetingSession | None:
        return self._session_manager.get(session_id)

    def get_active_sessions(self) -> list[MeetingSession]:
        return self._session_manager.get_active()

    def cleanup_finished(self) -> int:
        return self._session_manager.cleanup()

    async def notify_pipeline_failed(self, session_id: str, org_id: int = 1) -> None:
        """Notify organization managers when meeting pipeline processing fails."""
        try:
            from app.database.connection import db
            from app.services.notification_service import NotificationService
            if db.pool:
                async with db.pool.acquire() as conn:
                    notif_svc = NotificationService(conn)
                    await notif_svc.notify_pipeline_failed(session_id, org_id)
        except Exception as exc:
            log.error("meeting_service.notify_pipeline_failed_error", session_id=session_id, error=str(exc))

    # ------------------------------------------------------------------ #
    # Shutdown — called by FastAPI lifespan on exit                        #
    # ------------------------------------------------------------------ #

    async def shutdown_all(self) -> None:
        """Signal all runtimes to shutdown and await their clean exit."""
        if not self._runtimes:
            log.info("shutdown.no_active_sessions")
            return

        log.info("shutdown.starting", active_sessions=len(self._runtimes))

        tasks_to_await = []
        for session_id, runtime in list(self._runtimes.items()):
            if runtime.state == RuntimeState.RUNNING:
                runtime.state = RuntimeState.LEAVING
                log.info("runtime.leaving", session_id=session_id, runtime_state=runtime.state.value, profile_name=runtime.profile_path.name if runtime.profile_path else "unknown")
            runtime.request_shutdown("server_shutdown")
            tasks_to_await.append(runtime.wait_for_cleanup())

        if tasks_to_await:
            await asyncio.gather(*tasks_to_await, return_exceptions=True)

        self._bot_controller._monitor.stop_all()
        log.info("shutdown.completed")

    # ------------------------------------------------------------------ #
    # Intelligence data accessors (used by API router)                     #
    # ------------------------------------------------------------------ #

    def get_participants(self, session_id: str) -> list[Participant]:
        from datetime import datetime, timezone
        from app.meeting.providers.participant_presence.registry import presence_registry

        provider = presence_registry.get_provider(session_id)
        if not provider:
            return []

        participants = []
        for p in provider.get_current_snapshot():
            try:
                jt = datetime.fromisoformat(p.join_time.replace("Z", "+00:00"))
            except Exception:
                jt = datetime.now(timezone.utc)

            lt = None
            if p.leave_time:
                try:
                    lt = datetime.fromisoformat(p.leave_time.replace("Z", "+00:00"))
                except Exception:
                    pass

            participants.append(Participant(
                participant_id=p.participant_id,
                display_name=p.display_name,
                normalized_name=p.display_name.lower().strip(),
                join_order=p.join_order,
                is_bot=p.is_bot,
                is_present=not bool(p.leave_time),
                join_time=jt,
                leave_time=lt
            ))

        return participants

    def get_timeline(self, session_id: str) -> list[MeetingEvent]:
        runtime = self._runtimes.get(session_id)
        if not runtime or not runtime.event_bus:
            return []
        return runtime.event_bus.get_history()

    def get_observer_health(self, session_id: str) -> dict[str, Any]:
        runtime = self._runtimes.get(session_id)
        if not runtime or not runtime.supervisor:
            return {}
        return runtime.supervisor.get_health()

    # ------------------------------------------------------------------ #
    # Internal — async join flow (SINGLE OWNER)                            #
    # ------------------------------------------------------------------ #

    async def _run_join_flow(
        self,
        session_id: str,
        meeting_url: str,
        executor: MeetingExecutor,
    ) -> None:
        """Full join sequence — orchestrates BotController, RecordingService, and Runtime."""
        runtime = MeetingRuntime(session_id=session_id, executor=executor)
        self._runtimes[session_id] = runtime

        # Track this join task itself
        current_task = asyncio.current_task()
        if current_task:
            runtime.background_tasks["join_flow"] = current_task

        profile_path = executor.get_profile_path()
        profile_name = profile_path.name if profile_path else "unknown"

        log.info("runtime.starting", session_id=session_id, runtime_state=runtime.state.value, profile_name=profile_name)

        try:
            # ── Step 1: Launch browser & join via BotController ──────── #
            self._session_manager.update_state(session_id, SessionStatus.AUTHENTICATING)
            self._session_manager.update_state(session_id, SessionStatus.OPENING_MEET)
            self._session_manager.update_state(session_id, SessionStatus.JOINING)

            join_state = await self._bot_controller.launch_and_join(executor, session_id, meeting_url, meeting_config.BOT_NAME)

            page = executor.get_page()
            controller = executor.get_controller()
            if page and controller:
                self._session_manager.attach_browser(session_id, controller, page)

            self._session_manager.update_join_state(session_id, join_state)

            session = self._session_manager.get(session_id)
            if session and page:
                session.current_url = getattr(page, "url", "")

            # ── Step 2: Evaluate outcome and wait for shutdown ──────── #
            if join_state in (JoinState.IN_MEETING, JoinState.WAITING_FOR_ADMISSION):
                new_status = (
                    SessionStatus.IN_MEETING
                    if join_state == JoinState.IN_MEETING
                    else SessionStatus.WAITING_LOBBY
                )
                self._session_manager.update_state(session_id, new_status)
                await self._start_intelligence(session_id, page, runtime)

                # ── Step 3: Start Recording ──────────────────────────── #
                recorder = await self._recording_service.start_recording(session_id, page, session)
                runtime.recorder = recorder

                monitor_task = self._bot_controller.start_health_monitor(
                    session_id, controller, page,
                    supervisor=runtime.supervisor,
                    shutdown_cb=lambda sid, reason: runtime.request_shutdown(reason),
                    shutdown_req_cb=lambda: runtime._cleanup_event.is_set(),
                )
                runtime.background_tasks["health_monitor"] = monitor_task

                log.info("meeting.join.success", session_id=session_id, join_state=join_state.value)

                # Yield control to the runtime. Wait until something requests shutdown.
                runtime.state = RuntimeState.RUNNING
                log.info("runtime.running", session_id=session_id, runtime_state=runtime.state.value, profile_name=profile_name)
                log.info("join_flow.waiting_for_cleanup")
                await runtime.wait_for_shutdown()
                log.info("join_flow.cleanup_signal_received")
                return

            elif join_state == JoinState.UNKNOWN_ERROR:
                log.warning("meeting.join.unknown_state — deferring to HealthMonitor", session_id=session_id)
                self._session_manager.update_state(session_id, SessionStatus.IN_MEETING)
                await self._start_intelligence(session_id, page, runtime)

                # ── Step 3: Start Recording ──────────────────────────── #
                recorder = await self._recording_service.start_recording(session_id, page, session)
                runtime.recorder = recorder

                monitor_task = self._bot_controller.start_health_monitor(
                    session_id, controller, page,
                    supervisor=runtime.supervisor,
                    shutdown_cb=lambda sid, reason: runtime.request_shutdown(reason),
                    shutdown_req_cb=lambda: runtime._cleanup_event.is_set(),
                )
                runtime.background_tasks["health_monitor"] = monitor_task

                # Defer to HealthMonitor. Wait until shutdown requested.
                runtime.state = RuntimeState.RUNNING
                log.info("runtime.running", session_id=session_id, runtime_state=runtime.state.value, profile_name=profile_name)
                log.info("join_flow.waiting_for_cleanup")
                await runtime.wait_for_shutdown()
                log.info("join_flow.cleanup_signal_received")
                return

            else:
                # Definitive error state — capture diagnostics then trigger cleanup via finally
                if meeting_config.SCREENSHOT_ON_FAILURE:
                    debug_dir = await self._bot_controller.capture_debug_on_failure(executor, session_id, "join_failed")
                    if session and debug_dir:
                        session.debug_dir = debug_dir

                self._session_manager.fail(
                    session_id,
                    f"Join returned unexpected state: {join_state.value}",
                    join_state.value.upper(),
                )
                runtime.request_shutdown("join_failed")

        except asyncio.CancelledError:
            log.info("join_flow.cancelled", session_id=session_id)
            runtime.request_shutdown("join_task_cancelled")

        except Exception as exc:
            log.error(
                "join_flow.crashed",
                session_id=session_id,
                error=str(exc),
                error_type=type(exc).__name__,
            )

            if meeting_config.SCREENSHOT_ON_FAILURE:
                try:
                    debug_dir = await self._bot_controller.capture_debug_on_failure(executor, session_id, "exception")
                    session = self._session_manager.get(session_id)
                    if session and debug_dir:
                        session.debug_dir = debug_dir
                except Exception:
                    pass

            error_code = getattr(exc, "code", "UNKNOWN_ERROR")
            self._session_manager.fail(session_id, str(exc), error_code)
            runtime.request_shutdown(f"exception_{type(exc).__name__}")

        finally:
            try:
                await self._cleanup_runtime(runtime)
            except Exception as exc:
                log.critical("join_flow.fatal_cleanup_error", session_id=session_id, error=str(exc))

    # ------------------------------------------------------------------ #
    # Deterministic Teardown                                               #
    # ------------------------------------------------------------------ #

    async def _cleanup_runtime(self, runtime: MeetingRuntime) -> None:
        """Deterministic cleanup delegating sub-service shutdowns."""
        log.info("cleanup.started")
        if runtime.state in (RuntimeState.CLEANING_UP, RuntimeState.CLOSED):
            return

        import time
        start_time = time.time()

        profile_name = runtime.profile_path.name if runtime.profile_path else "unknown"
        log.info("cleanup.started", session_id=runtime.session_id, runtime_state=runtime.state.value, profile_name=profile_name, reason=runtime.shutdown_reason)

        # 1. Signal Shutdown
        t_stage = time.time()
        log.info("cleanup.signal_shutdown.start", session_id=runtime.session_id)
        runtime.state = RuntimeState.CLEANING_UP
        runtime.shutdown_reason = runtime.shutdown_reason or "cleanup"
        log.info("cleanup_requested.set", reason=runtime.shutdown_reason)
        runtime._cleanup_event.set()
        session = self._session_manager.get(runtime.session_id)
        if session and session.status not in TERMINAL_STATUSES:
            try:
                self._session_manager.update_state(runtime.session_id, SessionStatus.CLEANING_UP)
            except Exception as exc:
                log.error("cleanup.update_state_error", session_id=runtime.session_id, error=str(exc))
        log.info("cleanup.signal_shutdown.complete", session_id=runtime.session_id, duration_ms=int((time.time() - t_stage) * 1000))

        # 2. Monitor Shutdown (cooperative exit)
        t_stage = time.time()
        log.info("cleanup.monitor_shutdown.start", session_id=runtime.session_id)
        monitor_task = runtime.background_tasks.pop("health_monitor", None)
        if monitor_task and not monitor_task.done():
            try:
                await asyncio.wait_for(asyncio.shield(monitor_task), timeout=2.0)
            except asyncio.TimeoutError:
                log.warning("cleanup.monitor_cooperative_exit_timeout", session_id=runtime.session_id)
                monitor_task.cancel()
                try:
                    await asyncio.wait_for(monitor_task, timeout=2.0)
                except Exception:
                    pass
            except Exception:
                pass
        log.info("cleanup.monitor_shutdown.complete", session_id=runtime.session_id, duration_ms=int((time.time() - t_stage) * 1000))

        # 2.5 Stop Recording via RecordingService
        t_stage = time.time()
        log.info("cleanup.recording_stop.start", session_id=runtime.session_id)
        if runtime.recorder:
            try:
                artifact = await self._recording_service.stop_recording(runtime.session_id, runtime.recorder, session)
                if artifact:
                    runtime.recording_artifact = artifact
            except Exception as exc:
                log.error("cleanup.recording_stop.failed", session_id=runtime.session_id, error=str(exc))
            finally:
                runtime.recorder = None
        log.info("cleanup.recording_stop.complete", session_id=runtime.session_id, duration_ms=int((time.time() - t_stage) * 1000))

        # 3. Stop Observers via BotController
        t_stage = time.time()
        log.info("cleanup.observers_stop.start", session_id=runtime.session_id)
        try:
            if runtime.supervisor:
                await self._bot_controller.stop_intelligence(runtime.supervisor)
                if session:
                    session.intelligence_alive = False
        except Exception as exc:
            log.warning("cleanup.observers_stop_error", session_id=runtime.session_id, error=str(exc))
        log.info("cleanup.observers_stop.complete", session_id=runtime.session_id, duration_ms=int((time.time() - t_stage) * 1000))

        # 4. Cancel Remaining Tasks
        t_stage = time.time()
        log.info("cleanup.cancel_tasks.start", session_id=runtime.session_id)
        try:
            current = asyncio.current_task()
            tasks_to_cancel = [
                t for name, t in runtime.background_tasks.items()
                if not t.done() and t is not current
            ]
            for t in tasks_to_cancel:
                t.cancel()
            if tasks_to_cancel:
                await asyncio.gather(*tasks_to_cancel, return_exceptions=True)
        except Exception as exc:
            log.warning("cleanup.tasks_cancel_error", session_id=runtime.session_id, error=str(exc))
        log.info("cleanup.cancel_tasks.complete", session_id=runtime.session_id, duration_ms=int((time.time() - t_stage) * 1000))

        # 5. Leave Meeting via BotController
        t_stage = time.time()
        log.info("cleanup.leave_meeting.start", session_id=runtime.session_id)
        try:
            meeting_url = session.meeting_url if session else ""
            await self._bot_controller.leave_meeting(runtime.executor, meeting_url)
        except Exception as exc:
            log.warning("cleanup.leave_failed", session_id=runtime.session_id, error=str(exc))
        log.info("cleanup.leave_meeting.complete", session_id=runtime.session_id, duration_ms=int((time.time() - t_stage) * 1000))

        # 6. Close Browser & Release Profile Locks via BotController
        t_stage = time.time()
        log.info("cleanup.browser_close.start", session_id=runtime.session_id)
        try:
            await self._bot_controller.close_executor(runtime.executor)
            log.info("runtime.browser_closed", session_id=runtime.session_id, runtime_state=runtime.state.value, profile_name=profile_name)
        except Exception as exc:
            log.warning("cleanup.browser_close_error", session_id=runtime.session_id, error=str(exc))
        log.info("cleanup.browser_close.complete", session_id=runtime.session_id, duration_ms=int((time.time() - t_stage) * 1000))

        # 8. Remove Registry
        t_stage = time.time()
        log.info("cleanup.registry_remove.start", session_id=runtime.session_id)
        try:
            self._runtimes.pop(runtime.session_id, None)

            # Release presence provider
            from app.meeting.providers.participant_presence.registry import presence_registry
            presence_registry.release_provider(runtime.session_id)

        except Exception as exc:
            log.warning("cleanup.runtime_remove_error", session_id=runtime.session_id, error=str(exc))
        log.info("cleanup.registry_remove.complete", session_id=runtime.session_id, duration_ms=int((time.time() - t_stage) * 1000))

        # 9. Finished
        try:
            runtime.state = RuntimeState.CLOSED
            if session and session.status not in TERMINAL_STATUSES:
                self._session_manager.update_state(runtime.session_id, SessionStatus.FINISHED)
            log.info("runtime.closed", session_id=runtime.session_id, runtime_state=runtime.state.value, profile_name=profile_name)
        except Exception as exc:
            log.warning("cleanup.finalize_error", session_id=runtime.session_id, error=str(exc))

        runtime._cleanup_finished.set()
        log.info("cleanup.finished", session_id=runtime.session_id, total_duration_ms=int((time.time() - start_time) * 1000))

        # 9.5 Save DOM Speaker Timeline for the Pipeline
        try:
            from app.meeting.config import meeting_config
            from pathlib import Path
            import json
            
            timeline = None
            if runtime.supervisor and hasattr(runtime.supervisor, 'speaker_detector'):
                timeline = runtime.supervisor.speaker_detector.get_speaker_timeline()
                
            if timeline:
                out_dir = Path(meeting_config.PROCESSING_OUTPUT_DIR) / runtime.session_id
                out_dir.mkdir(parents=True, exist_ok=True)
                dom_speakers = [s.to_dict() for s in timeline]
                (out_dir / "dom_speakers.json").write_text(json.dumps(dom_speakers, indent=2), encoding="utf-8")
                log.info("cleanup.dom_speakers_saved", session_id=runtime.session_id, count=len(dom_speakers))
            else:
                log.info("cleanup.dom_speakers_empty", session_id=runtime.session_id)
        except Exception as exc:
            log.warning("cleanup.dom_speakers_save_error", session_id=runtime.session_id, error=str(exc))

        # 10. Start Pipeline via PipelineService
        self._pipeline_service.trigger_pipeline(runtime.session_id, session=session)

    # ------------------------------------------------------------------ #
    # Sub-service Delegates                                                #
    # ------------------------------------------------------------------ #

    async def _start_recording(
        self, session_id: str, page: Any, runtime: MeetingRuntime
    ) -> None:
        """Delegate recording start to RecordingService."""
        session = self._session_manager.get(session_id)
        recorder = await self._recording_service.start_recording(session_id, page, session)
        runtime.recorder = recorder

    async def _start_intelligence(
        self, session_id: str, page: Any, runtime: MeetingRuntime
    ) -> None:
        """Delegate intelligence start to BotController."""
        event_bus, clock, lifecycle, supervisor, ctx = await self._bot_controller.start_intelligence(
            session_id, page, self._make_event_handler(session_id)
        )

        runtime.context = ctx
        runtime.supervisor = supervisor
        runtime.event_bus = event_bus
        runtime.lifecycle = lifecycle

        session = self._session_manager.get(session_id)
        if session:
            session.intelligence_alive = True
            session.observer_health = supervisor.get_health()

        log.info("observers.started", session_id=session_id)
        if runtime.event_bus:
            asyncio.create_task(runtime.event_bus.emit(MeetingEvent(
                type=EventType.PARTICIPANT_UPDATED,
                category=EventCategory.PARTICIPANT,
                source="system_initialization",
                payload={"reason": "initial_presence_sync"}
            )))

    def _make_event_handler(self, session_id: str):
        """Return a bound async handler for a given session."""
        async def _handler(event: MeetingEvent) -> None:
            await self._on_intelligence_event(session_id, event)
        return _handler

    async def _on_intelligence_event(self, session_id: str, event: MeetingEvent) -> None:
        """Bridge EventBus events -> MeetingSession state."""
        log.info("meeting_service.event_received", event=event.type.value)
        session = self._session_manager.get(session_id)
        runtime = self._runtimes.get(session_id)
        if not session or not runtime or not runtime.supervisor:
            return

        et = event.type

        if et in (
            EventType.PARTICIPANT_JOINED,
            EventType.PARTICIPANT_LEFT,
            EventType.PARTICIPANT_UPDATED
        ):
            participants = self.get_participants(session_id)
            session.participants_detailed = participants
            session.participants = [
                p.display_name for p in participants if p.is_present
            ]
            present_count = sum(1 for p in participants if p.is_present)
            if runtime.lifecycle:
                runtime.lifecycle.update_participant_count(present_count)
                session.peak_participants = runtime.lifecycle.peak_participants
            session.participant_events.append(event)
            session.observer_health = runtime.supervisor.get_health()

            has_human_participants = any(
                p.is_present and not p.is_bot
                for p in participants
            )

            existing_timer = runtime.background_tasks.get("empty_timer")
            timer_exists = existing_timer is not None and not existing_timer.done()

            if not has_human_participants:
                if not timer_exists:
                    log.info(
                        "meeting.empty_detected",
                        session_id=session_id,
                        participant_count=present_count,
                        has_human_participants=has_human_participants,
                        runtime_state=runtime.state.value,
                    )
                    timer_task = asyncio.create_task(
                        self._empty_meeting_countdown(session_id, runtime),
                        name=f"empty-timer-{session_id[:8]}"
                    )
                    runtime.background_tasks["empty_timer"] = timer_task
            else:
                if timer_exists:
                    existing_timer.cancel()
                    log.info(
                        "meeting.empty_timer_cancelled",
                        session_id=session_id,
                        participant_count=present_count,
                        has_human_participants=has_human_participants,
                        runtime_state=runtime.state.value,
                    )

        elif et == EventType.HOST_JOINED:
            participant_name = event.payload.get("participant", {}).get("display_name", "")
            if participant_name and runtime.lifecycle:
                runtime.lifecycle.record_host(participant_name)

        elif et == EventType.SPEAKER_CHANGED:
            session.active_speaker = runtime.supervisor.speaker_detector.get_active_speaker()
            session.speaker_timeline = runtime.supervisor.speaker_detector.get_speaker_timeline()

        elif et in (
            EventType.MEETING_STATE_CHANGED,
            EventType.MEETING_STARTED,
            EventType.MEETING_ENDED,
            EventType.NETWORK_LOST,
        ):
            new_state = event.payload.get("new_state", "unknown")
            session.meeting_state = new_state

            if et == EventType.MEETING_STARTED:
                session.meeting_started_at = event.timestamp
                if runtime.lifecycle:
                    runtime.lifecycle.record_start(event.timestamp)
            elif et == EventType.MEETING_ENDED:
                session.meeting_ended_at = event.timestamp
                if runtime.lifecycle:
                    runtime.lifecycle.record_end(event.timestamp)
                elapsed = event.payload.get("elapsed_seconds")
                if elapsed is not None:
                    session.meeting_duration = elapsed
                runtime.request_shutdown(f"meeting_ended_{new_state}")

        elif et == EventType.OBSERVER_RESTARTED:
            session.observer_health = runtime.supervisor.get_health()

    async def _empty_meeting_countdown(self, session_id: str, runtime: MeetingRuntime) -> None:
        """Countdown when no humans are present, requesting shutdown if it expires."""
        try:
            await asyncio.sleep(10)

            if not runtime.supervisor:
                return

            participants = self.get_participants(session_id)
            present_count = sum(1 for p in participants if p.is_present)
            has_human_participants = any(p.is_present and not p.is_bot for p in participants)

            # Direct Playwright DOM fallback check
            if runtime.context and getattr(runtime.context, "page", None):
                try:
                    from app.meeting.intelligence.dom.participant_dom import ParticipantDOM
                    from app.meeting.intelligence.dom.meeting_dom import MeetingDOM
                    from app.meeting.intelligence.models import MeetingState

                    dom_participants = await ParticipantDOM().get_raw_participants(runtime.context.page)
                    human_dom_participants = [p for p in dom_participants if not p.get("is_self")]
                    if len(human_dom_participants) > 0:
                        has_human_participants = True
                    else:
                        m_state = await MeetingDOM().detect_state(runtime.context.page)
                        if m_state == MeetingState.EMPTY_POPUP:
                            has_human_participants = False
                except Exception:
                    pass

            if not has_human_participants:
                if runtime._cleanup_event.is_set():
                    return
                if runtime.state in (RuntimeState.CLEANING_UP, RuntimeState.CLOSED, RuntimeState.LEAVING):
                    return

                runtime.request_shutdown("empty_meeting_timeout")
        except asyncio.CancelledError:
            pass
        finally:
            current_task = asyncio.current_task()
            stored = runtime.background_tasks.get("empty_timer")
            if stored == current_task:
                runtime.background_tasks.pop("empty_timer", None)
