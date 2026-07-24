"""Meeting bot executor package."""

from app.meeting.bot.executor.base import MeetingExecutor
from app.meeting.bot.executor.local_playwright import LocalPlaywrightExecutor

__all__ = ["MeetingExecutor", "LocalPlaywrightExecutor"]
