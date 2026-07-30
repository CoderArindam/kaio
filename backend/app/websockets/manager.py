"""
In-memory WebSocket connection manager.
No DB access — all state is ephemeral and lost on server restart.
"""

import logging
from typing import Optional
from fastapi import WebSocket

logger = logging.getLogger("kaio.websockets.manager")


class ConnectionManager:
    def __init__(self):
        # user_id -> set of active WebSocket connections (multi-tab support)
        self._user_connections: dict[int, set[WebSocket]] = {}
        # board_id -> set of user_ids currently subscribed to that board
        self._board_subscribers: dict[int, set[int]] = {}
        # org_id -> set of connected user_ids
        self._org_users: dict[int, set[int]] = {}

    async def connect(self, websocket: WebSocket, user_id: int, org_id: int) -> None:
        await websocket.accept()
        if user_id not in self._user_connections:
            self._user_connections[user_id] = set()
        self._user_connections[user_id].add(websocket)

        if org_id not in self._org_users:
            self._org_users[org_id] = set()
        self._org_users[org_id].add(user_id)

        logger.debug(f"WS connect: user={user_id} org={org_id} total_conns={len(self._user_connections[user_id])}")

    async def disconnect(self, websocket: WebSocket, user_id: int, org_id: int) -> None:
        # Remove this specific socket
        if user_id in self._user_connections:
            self._user_connections[user_id].discard(websocket)
            if not self._user_connections[user_id]:
                del self._user_connections[user_id]
                # No more connections for this user — remove from org and board subs
                if org_id in self._org_users:
                    self._org_users[org_id].discard(user_id)
                    if not self._org_users[org_id]:
                        del self._org_users[org_id]
                # Clean up board subscriptions
                for board_id in list(self._board_subscribers.keys()):
                    self._board_subscribers[board_id].discard(user_id)
                    if not self._board_subscribers[board_id]:
                        del self._board_subscribers[board_id]

        logger.debug(f"WS disconnect: user={user_id} org={org_id}")

    async def subscribe_board(self, user_id: int, board_id: int) -> None:
        if board_id not in self._board_subscribers:
            self._board_subscribers[board_id] = set()
        self._board_subscribers[board_id].add(user_id)
        logger.debug(f"WS subscribe_board: user={user_id} board={board_id}")

    async def unsubscribe_board(self, user_id: int, board_id: int) -> None:
        if board_id in self._board_subscribers:
            self._board_subscribers[board_id].discard(user_id)
            if not self._board_subscribers[board_id]:
                del self._board_subscribers[board_id]
        logger.debug(f"WS unsubscribe_board: user={user_id} board={board_id}")

    async def send_to_user(self, user_id: int, message: dict) -> None:
        sockets = self._user_connections.get(user_id, set())
        dead = set()
        for ws in list(sockets):
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.debug(f"WS send_to_user dead socket for user={user_id}: {e}")
                dead.add(ws)
        # Clean up dead sockets silently
        for ws in dead:
            sockets.discard(ws)

    async def send_to_board(
        self,
        board_id: int,
        message: dict,
        exclude_user_id: Optional[int] = None,
    ) -> None:
        subscribers = self._board_subscribers.get(board_id, set())
        for uid in list(subscribers):
            if exclude_user_id is not None and uid == exclude_user_id:
                continue
            await self.send_to_user(uid, message)

    async def send_to_org_role(
        self,
        org_id: int,
        message: dict,
        roles: list[str],
        all_users_with_roles: list[dict],
    ) -> None:
        """
        Send to users whose role is in `roles` AND who are currently connected.
        all_users_with_roles is pre-fetched by caller — this method does NO DB access.
        """
        connected_in_org = self._org_users.get(org_id, set())
        roles_upper = {r.upper() for r in roles}
        for user_info in all_users_with_roles:
            uid = user_info.get("user_id") or user_info.get("id")
            role = str(user_info.get("role", "")).upper()
            if uid in connected_in_org and role in roles_upper:
                await self.send_to_user(uid, message)

    async def send_to_org(self, org_id: int, message: dict) -> None:
        for uid in list(self._org_users.get(org_id, set())):
            await self.send_to_user(uid, message)


# Singleton — import this everywhere events need to be dispatched
connection_manager = ConnectionManager()
