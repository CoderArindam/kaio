"""MeetingExecutor interface.

Defines the contract for meeting execution environments.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from app.meeting.models.session import JoinState


class MeetingExecutor(ABC):
    """Abstract interface for executing a meeting session.

    Encapsulates browser/environment lifecycle, authentication, meeting room join/leave,
    and profile/resource management.
    """

    @abstractmethod
    def get_profile_path(self) -> Path | None:
        """Return the profile path associated with this executor, if any."""
        pass

    @abstractmethod
    def get_page(self) -> Any:
        """Return the underlying browser/page instance (e.g. Playwright Page)."""
        pass

    @abstractmethod
    def get_controller(self) -> Any:
        """Return the browser controller instance (e.g. BrowserController)."""
        pass

    @abstractmethod
    def is_page_usable(self) -> bool:
        """Check if the underlying page is open and usable."""
        pass

    @abstractmethod
    async def launch_and_join(self, session_id: str, meeting_url: str, bot_name: str) -> JoinState:
        """Launch the execution environment and join the meeting.

        Returns:
            JoinState describing the join outcome.
        """
        pass

    @abstractmethod
    async def leave(self, meeting_url: str = "") -> None:
        """Gracefully leave the meeting."""
        pass

    @abstractmethod
    async def close(self) -> None:
        """Close browser/environment resources and release profile locks."""
        pass
