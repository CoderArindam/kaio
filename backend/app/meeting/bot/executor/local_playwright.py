"""LocalPlaywrightExecutor — Playwright-backed MeetingExecutor implementation.

Handles local Playwright browser lifecycle, profile management, and room automation.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from app.meeting.bot.browser.controller import BrowserController
from app.meeting.bot.browser.profile_manager import ProfileManager
from app.meeting.bot.executor.base import MeetingExecutor
from app.meeting.config import meeting_config
from app.meeting.exceptions import BrowserLaunchError
from app.meeting.logger import get_logger
from app.meeting.models.session import JoinState
from app.meeting.providers import get_provider
from app.meeting.utils.playwright_errors import page_is_usable
from app.meeting.utils.retry import with_retry

log = get_logger("bot.executor.local_playwright")


class LocalPlaywrightExecutor(MeetingExecutor):
    """Executes meeting sessions locally using Playwright and persistent browser contexts."""

    def __init__(self, profile_manager: ProfileManager | None = None) -> None:
        self._profile_manager = profile_manager or ProfileManager(meeting_config.PROFILE_DIR)
        self._controller: BrowserController | None = None
        self._profile_path: Path | None = None
        self._session_id: str | None = None
        self._is_locked: bool = False

    def get_profile_path(self) -> Path | None:
        if self._profile_path:
            return self._profile_path
        return self._profile_manager.get_profile_path()

    def get_page(self) -> Any:
        if self._controller and hasattr(self._controller, "get_page"):
            return self._controller.get_page()
        return None

    def get_controller(self) -> BrowserController | None:
        return self._controller

    def is_page_usable(self) -> bool:
        page = self.get_page()
        return page_is_usable(page)

    async def launch_and_join(
        self,
        session_id: str,
        meeting_url: str,
        bot_name: str = "",
    ) -> JoinState:
        self._session_id = session_id
        controller = BrowserController()
        self._controller = controller

        profile_path = self._profile_manager.get_profile_path()
        self._profile_path = profile_path
        profile_name = profile_path.name

        self._profile_manager.ensure_exists(profile_path)
        self._profile_manager.lock(profile_path, session_id, profile_name)
        self._is_locked = True

        try:
            await with_retry(
                lambda: controller.launch_persistent(
                    str(profile_path),
                    headless=meeting_config.HEADLESS,
                    page_timeout=meeting_config.PAGE_TIMEOUT,
                ),
                max_attempts=meeting_config.RETRY_COUNT,
                base_delay=meeting_config.RETRY_BASE_DELAY,
                max_delay=meeting_config.RETRY_MAX_DELAY,
                retryable_exceptions=(BrowserLaunchError,),
                logger=log,
                session_id=session_id,
            )

            page = await controller.new_page()

            provider = get_provider(meeting_url)
            await provider.ensure_authenticated(page)

            join_state = await provider.join(page, meeting_url, bot_name or meeting_config.BOT_NAME)
            return join_state

        except Exception:
            # Clean up immediately if launch or join setup fails before returning control
            await self.close()
            raise

    async def leave(self, meeting_url: str = "") -> None:
        page = self.get_page()
        if page_is_usable(page):
            try:
                provider = get_provider(meeting_url)
                await provider.leave(page)
            except Exception as exc:
                log.warning("executor.leave_failed", session_id=self._session_id, error=str(exc))

    async def close(self) -> None:
        if self._controller:
            try:
                await self._controller.close()
            except Exception as exc:
                log.warning("executor.browser_close_error", session_id=self._session_id, error=str(exc))
            finally:
                self._controller = None

        if self._profile_path and self._is_locked:
            try:
                self._profile_manager.unlock(self._profile_path, self._session_id or "unknown")
                self._is_locked = False
            except Exception as exc:
                log.warning("executor.profile_unlock_error", session_id=self._session_id, error=str(exc))
