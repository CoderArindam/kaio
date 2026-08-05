import logging
import json
from typing import List, Tuple, Optional, Dict
import asyncpg
from fastapi import HTTPException

from app.schemas.comments import CommentCreate, CommentUpdate, CommentResponse

logger = logging.getLogger(__name__)

def _parse_comment_row(row) -> dict:
    d = dict(row) if row else {}
    if isinstance(d.get("reactions"), str):
        d["reactions"] = json.loads(d["reactions"])
    elif d.get("reactions") is None:
        d["reactions"] = []
    return d


class CommentService:
    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def create_comment(self, task_id: int, comment_in: CommentCreate, current_user: dict) -> Tuple[CommentResponse, Optional[Dict], Optional[Dict]]:
        try:
            has_access = await self.conn.fetchval("SELECT can_view_task($1, $2)", current_user["id"], task_id)
            if not has_access:
                raise HTTPException(status_code=403, detail="Task not found or access denied")

            async with self.conn.transaction():
                await self.conn.execute("SELECT set_config('app.current_user_id', $1, true)", str(current_user["id"]))
                comment_id = await self.conn.fetchval(
                    "SELECT fn_create_comment($1, $2, $3, $4, $5)",
                    task_id, current_user["id"], comment_in.parent_comment_id, comment_in.content, current_user["organization_id"]
                )

                notified_user_ids = []
                if comment_in.mentioned_user_ids:
                    notified_user_ids = await self.conn.fetchval(
                        "SELECT fn_create_comment_mentions($1, $2, $3)",
                        comment_id, comment_in.mentioned_user_ids, current_user["id"]
                    ) or []

                task_row = await self.conn.fetchrow("SELECT * FROM v_tasks_canonical WHERE id = $1", task_id)
                parent_user = None
                root_user_id = None
                if comment_in.parent_comment_id:
                    parent_user = await self.conn.fetchrow(
                        """
                        SELECT u.id, u.email, u.first_name 
                        FROM v_comments_canonical c 
                        JOIN users u ON c.user_id = u.id 
                        WHERE c.id = $1
                        """,
                        comment_in.parent_comment_id
                    )

                    curr_id = comment_in.parent_comment_id
                    while curr_id:
                        p_row = await self.conn.fetchrow("SELECT id, parent_comment_id, user_id FROM v_comments_canonical WHERE id = $1", curr_id)
                        if not p_row:
                            break
                        if p_row["parent_comment_id"]:
                            curr_id = p_row["parent_comment_id"]
                        else:
                            root_user_id = p_row["user_id"]
                            break

                row = await self.conn.fetchrow(
                    "SELECT * FROM v_comments_canonical WHERE id = $1",
                    comment_id
                )

            # Dispatch real-time WebSocket notifications to mentioned users, parent comment author, and thread root author
            from app.services.notification_service import _dispatch_notification_event
            if notified_user_ids:
                for user_id in notified_user_ids:
                    await _dispatch_notification_event(self.conn, user_id)

            if parent_user and parent_user["id"] != current_user["id"]:
                await _dispatch_notification_event(self.conn, parent_user["id"])

            if root_user_id and root_user_id != current_user["id"] and (not parent_user or root_user_id != parent_user["id"]):
                await _dispatch_notification_event(self.conn, root_user_id)

            return CommentResponse(**_parse_comment_row(row)), dict(task_row) if task_row else None, dict(parent_user) if parent_user else None
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f'Unexpected error: {e}')
            raise HTTPException(status_code=400, detail='An unexpected error occurred')

    async def get_task_comments(self, task_id: int, current_user: dict) -> List[CommentResponse]:
        try:
            has_access = await self.conn.fetchval("SELECT can_view_task($1, $2)", current_user["id"], task_id)
            if not has_access:
                raise HTTPException(status_code=403, detail="Task not found or access denied")

            async with self.conn.transaction():
                await self.conn.execute("SELECT set_config('app.current_user_id', $1, true)", str(current_user["id"]))
                rows = await self.conn.fetch(
                    """
                    SELECT * FROM v_comments_canonical
                    WHERE task_id = $1
                    ORDER BY created_at ASC
                    """,
                    task_id
                )
            return [CommentResponse(**_parse_comment_row(row)) for row in rows]
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f'Unexpected error: {e}')
            raise HTTPException(status_code=400, detail='An unexpected error occurred')

    async def delete_comment(self, comment_id: int, current_user: dict) -> Tuple[Optional[int], Optional[int]]:
        try:
            comment_row = await self.conn.fetchrow(
                "SELECT task_id FROM v_comments_canonical WHERE id = $1", comment_id
            )
            task_id = comment_row["task_id"] if comment_row else None
            board_id = None
            if task_id:
                task_row = await self.conn.fetchrow(
                    "SELECT board_id FROM v_tasks_canonical WHERE id = $1", task_id
                )
                board_id = task_row["board_id"] if task_row else None

            async with self.conn.transaction():
                await self.conn.execute("SELECT set_config('app.current_user_id', $1, true)", str(current_user["id"]))
                await self.conn.execute(
                    "SELECT fn_delete_comment($1, $2, $3, $4)",
                    comment_id, current_user["id"], current_user.get("role", "MEMBER"), current_user["organization_id"]
                )
            return task_id, board_id
        except HTTPException:
            raise
        except Exception as e:
            err_msg = str(e)
            logger.error(f'Error deleting comment: {err_msg}')
            if 'Comment not found' in err_msg:
                raise HTTPException(status_code=404, detail="Comment not found")
            elif 'Access denied' in err_msg or 'Not authorized' in err_msg:
                raise HTTPException(status_code=403, detail="Not authorized to delete this comment")
            raise HTTPException(status_code=400, detail=err_msg if isinstance(e, asyncpg.exceptions.PostgresError) else 'An unexpected error occurred')

    async def update_comment(self, comment_id: int, comment_in: CommentUpdate, current_user: dict) -> Tuple[CommentResponse, Optional[int]]:
        try:
            async with self.conn.transaction():
                await self.conn.execute("SELECT set_config('app.current_user_id', $1, true)", str(current_user["id"]))
                await self.conn.execute(
                    "SELECT fn_update_comment($1, $2, $3, $4)",
                    comment_id, comment_in.content, current_user["id"], current_user["organization_id"]
                )
                row = await self.conn.fetchrow(
                    "SELECT * FROM v_comments_canonical WHERE id = $1",
                    comment_id
                )
                if not row:
                    raise HTTPException(status_code=404, detail="Comment not found")
                
                task_row = await self.conn.fetchrow(
                    "SELECT board_id FROM v_tasks_canonical WHERE id = $1", row["task_id"]
                )
                board_id = task_row["board_id"] if task_row else None
                return CommentResponse(**_parse_comment_row(row)), board_id
        except HTTPException:
            raise
        except Exception as e:
            err_msg = str(e)
            logger.error(f'Error updating comment: {err_msg}')
            if 'Comment not found' in err_msg:
                raise HTTPException(status_code=404, detail="Comment not found")
            elif 'Access denied' in err_msg or 'Not authorized' in err_msg:
                raise HTTPException(status_code=403, detail="Not authorized to edit this comment")
            raise HTTPException(status_code=400, detail=err_msg if isinstance(e, asyncpg.exceptions.PostgresError) else 'An unexpected error occurred')

    async def toggle_reaction(self, comment_id: int, emoji: str, current_user: dict) -> Tuple[bool, Optional[int], Optional[int]]:
        try:
            comment_row = await self.conn.fetchrow(
                "SELECT task_id FROM v_comments_canonical WHERE id = $1", comment_id
            )
            if not comment_row:
                raise HTTPException(status_code=404, detail="Comment not found")
            task_id = comment_row["task_id"]

            has_access = await self.conn.fetchval("SELECT can_view_task($1, $2)", current_user["id"], task_id)
            if not has_access:
                raise HTTPException(status_code=403, detail="Task not found or access denied")

            task_row = await self.conn.fetchrow(
                "SELECT board_id FROM v_tasks_canonical WHERE id = $1", task_id
            )
            board_id = task_row["board_id"] if task_row else None

            async with self.conn.transaction():
                await self.conn.execute("SELECT set_config('app.current_user_id', $1, true)", str(current_user["id"]))
                added = await self.conn.fetchval(
                    "SELECT fn_toggle_comment_reaction($1::integer, $2::integer, $3::text)",
                    comment_id, current_user["id"], emoji
                )


            return added, task_id, board_id
        except HTTPException:
            raise
        except Exception as e:
            err_msg = str(e)
            logger.error(f'Error toggling comment reaction: {err_msg}')
            if 'Comment not found' in err_msg:
                raise HTTPException(status_code=404, detail="Comment not found")
            raise HTTPException(status_code=400, detail=err_msg if isinstance(e, asyncpg.exceptions.PostgresError) else 'An unexpected error occurred')