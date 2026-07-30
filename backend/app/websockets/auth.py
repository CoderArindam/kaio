"""
WebSocket authentication — reuses the same httpOnly cookie JWT as REST endpoints.
"""

import logging
import asyncpg
from fastapi import WebSocket

from app.auth.jwt import verify_token

logger = logging.getLogger("kaio.websockets.auth")


async def authenticate_websocket(
    websocket: WebSocket,
    conn: asyncpg.Connection,
) -> dict | None:
    """
    Authenticate a WebSocket upgrade request using the access_token httpOnly cookie.
    Returns user claims dict on success, or None if auth fails (socket already closed).
    """
    token = websocket.cookies.get("access_token")
    if not token:
        await websocket.close(code=4001)
        logger.debug("WS auth failed: no access_token cookie")
        return None

    payload = verify_token(token)
    if payload is None:
        await websocket.close(code=4001)
        logger.debug("WS auth failed: invalid JWT")
        return None

    user_id: int = payload.get("user_id")
    org_id: int = payload.get("organization_id")
    role: str = payload.get("role", "MEMBER")
    session_id = payload.get("session_id")

    if not user_id or not org_id:
        await websocket.close(code=4001)
        logger.debug("WS auth failed: missing user_id or org_id in token")
        return None

    if session_id:
        try:
            is_revoked = await conn.fetchval(
                "SELECT fn_is_session_revoked($1)",
                session_id
            )
            if is_revoked:
                await websocket.close(code=4001)
                logger.debug(f"WS auth failed: session {session_id} revoked")
                return None
        except Exception as e:
            logger.error(f"WS auth session revocation check failed: {e}")
            await websocket.close(code=4001)
            return None

    return {
        "user_id": user_id,
        "org_id": org_id,
        "role": role,
        "session_id": session_id,
    }
