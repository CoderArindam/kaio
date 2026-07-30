"""
WebSocket router — single endpoint at /ws.
Registered in main.py with prefix /api/v1, so full path is /api/v1/ws.
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database.connection import db
from app.websockets.auth import authenticate_websocket
from app.websockets.manager import connection_manager

logger = logging.getLogger("kaio.websockets.router")

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    user_id: int | None = None
    org_id: int | None = None

    try:
        # Acquire a DB connection for auth check
        if not db.pool:
            await websocket.close(code=4003)
            return

        async with db.pool.acquire() as conn:
            claims = await authenticate_websocket(websocket, conn)

        if claims is None:
            return  # socket already closed by authenticate_websocket

        user_id = claims["user_id"]
        org_id = claims["org_id"]

        await connection_manager.connect(websocket, user_id, org_id)

        # Confirm connection to client
        await websocket.send_json({
            "type": "connected",
            "user_id": user_id,
            "org_id": org_id,
        })

        # Message receive loop
        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                break
            except Exception:
                # Any other receive error — treat as disconnect
                break

            msg_type = data.get("type", "")

            if msg_type == "subscribe_board":
                board_id = data.get("board_id")
                if isinstance(board_id, int):
                    await connection_manager.subscribe_board(user_id, board_id)
                    await websocket.send_json({"type": "subscribed_board", "board_id": board_id})

            elif msg_type == "unsubscribe_board":
                board_id = data.get("board_id")
                if isinstance(board_id, int):
                    await connection_manager.unsubscribe_board(user_id, board_id)
                    await websocket.send_json({"type": "unsubscribed_board", "board_id": board_id})

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            # Unknown types are silently ignored

    except Exception as e:
        logger.error(f"WS handler unexpected error user={user_id}: {e}")
    finally:
        if user_id is not None and org_id is not None:
            await connection_manager.disconnect(websocket, user_id, org_id)
