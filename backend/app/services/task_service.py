import logging
from typing import Optional, List, Dict, Any
import asyncpg
from fastapi import HTTPException

from app.schemas.task import TaskCreate, TaskUpdate, TaskAssigneeUpdate, CanonicalTaskResponse, BoardDataResponse

logger = logging.getLogger(__name__)

import json

def _format_task_row(row: Any) -> dict:
    if not row:
        return {}
    d = dict(row)
    if "labels" in d and isinstance(d["labels"], str):
        try:
            d["labels"] = json.loads(d["labels"])
        except Exception:
            d["labels"] = []
    elif "labels" not in d or d["labels"] is None:
        d["labels"] = []
    return d

class TaskService:
    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def get_task(self, task_id: int, current_user: dict) -> CanonicalTaskResponse:
        try:
            row = await self.conn.fetchrow("SELECT * FROM v_tasks_canonical WHERE id = $1", task_id)
            if not row:
                raise HTTPException(status_code=404, detail="Task not found")
                
            board_id = row["board_id"]
            has_access = await self.conn.fetchval("SELECT can_view_board($1, $2)", current_user["id"], board_id)
            if not has_access:
                raise HTTPException(status_code=403, detail="Task not found or access denied")
                
            return CanonicalTaskResponse(**_format_task_row(row))
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting task: {e}")
            raise HTTPException(status_code=400, detail="An unexpected error occurred")

    async def create_task(self, task_in: TaskCreate, current_user: dict) -> CanonicalTaskResponse:
        role = current_user.get("role", "MEMBER")
        if role not in ("MANAGER", "SUPER_ADMIN"):
            raise HTTPException(status_code=403, detail="Only MANAGER or SUPER_ADMIN can create tasks")

        try:
            has_access = await self.conn.fetchval("SELECT can_view_board($1, $2)", current_user["id"], task_in.board_id)
            if not has_access:
                raise HTTPException(status_code=403, detail="Board not found or access denied")

            async with self.conn.transaction():
                await self.conn.execute("SELECT set_config('app.current_user_id', $1, true)", str(current_user["id"]))
                task_id = await self.conn.fetchval(
                    """
                    INSERT INTO tasks (board_id, column_id, title, description, priority, assigned_to, created_by, due_date, reminder_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    RETURNING id
                    """,
                    task_in.board_id, task_in.column_id, task_in.title, task_in.description,
                    task_in.priority, task_in.assigned_to, current_user["id"], task_in.due_date, task_in.reminder_at
                )
                
                if task_in.label_ids:
                    for label_id in task_in.label_ids:
                        await self.conn.execute("SELECT fn_attach_label($1, $2, $3)", task_id, label_id, current_user["id"])

                row = await self.conn.fetchrow("SELECT * FROM v_tasks_canonical WHERE id = $1", task_id)
                return CanonicalTaskResponse(**_format_task_row(row))
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating task: {e}")
            raise HTTPException(status_code=400, detail="An unexpected error occurred")

    async def get_board_tasks(self, board_id: int, assigned_to: Optional[int], current_user: dict) -> BoardDataResponse:
        try:
            has_access = await self.conn.fetchval("SELECT can_view_board($1, $2)", current_user["id"], board_id)
            if not has_access:
                raise HTTPException(status_code=403, detail="Board not found or access denied")

            columns_rows = await self.conn.fetch(
                "SELECT id, name, position, column_type, (column_type = 'DONE') AS is_completed FROM board_columns WHERE board_id = $1 AND deleted_at IS NULL ORDER BY position",
                board_id
            )
            
            query = "SELECT * FROM v_tasks_canonical WHERE board_id = $1"
            args = [board_id]
            
            if assigned_to is not None:
                query += " AND assigned_to = $2"
                args.append(assigned_to)
                
            tasks_rows = await self.conn.fetch(query, *args)
            
            return BoardDataResponse(
                columns=[dict(c) for c in columns_rows],
                tasks=[CanonicalTaskResponse(**_format_task_row(t)) for t in tasks_rows]
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting board tasks: {e}")
            raise HTTPException(status_code=400, detail="An unexpected error occurred")

    async def update_task(self, task_id: int, task_in: TaskUpdate, current_user: dict) -> tuple[CanonicalTaskResponse, Optional[dict], dict]:
        # Returns (updated_task, old_task_dict, new_task_dict) for notifications later
        try:
            has_access = await self.conn.fetchval("SELECT can_edit_task($1, $2)", current_user["id"], task_id)
            if not has_access:
                raise HTTPException(status_code=403, detail="Task not found or access denied")

            async with self.conn.transaction():
                await self.conn.execute("SELECT set_config('app.current_user_id', $1, true)", str(current_user["id"]))
                
                update_fields = []
                args = []
                idx = 1
                for field, value in task_in.model_dump(exclude_unset=True).items():
                    update_fields.append(f"{field} = ${idx}")
                    args.append(value)
                    idx += 1
                    
                if not update_fields:
                    row = await self.conn.fetchrow("SELECT * FROM v_tasks_canonical WHERE id = $1", task_id)
                    return CanonicalTaskResponse(**dict(row)), None, dict(row)

                old_task = await self.conn.fetchrow("SELECT * FROM v_tasks_canonical WHERE id = $1", task_id)

                args.append(task_id)
                update_query = f"UPDATE tasks SET {', '.join(update_fields)} WHERE id = ${idx} RETURNING id"
                
                updated_id = await self.conn.fetchval(update_query, *args)
                if not updated_id:
                    raise HTTPException(status_code=404, detail="Task not found")

                new_task = await self.conn.fetchrow("SELECT * FROM v_tasks_canonical WHERE id = $1", task_id)
                return CanonicalTaskResponse(**dict(new_task)), dict(old_task), dict(new_task)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error updating task: {e}")
            raise HTTPException(status_code=400, detail="An unexpected error occurred")

    async def delete_task(self, task_id: int, current_user: dict):
        role = current_user.get("role", "MEMBER")
        if role not in ("MANAGER", "SUPER_ADMIN"):
            raise HTTPException(status_code=403, detail="Only MANAGER or SUPER_ADMIN can delete tasks")

        try:
            async with self.conn.transaction():
                await self.conn.execute("SELECT set_config('app.current_user_id', $1, true)", str(current_user["id"]))
                await self.conn.execute("SELECT fn_delete_task($1, $2)", task_id, current_user["id"])
        except HTTPException:
            raise
        except Exception as e:
            err_msg = str(e)
            if "Task not found" in err_msg:
                raise HTTPException(status_code=404, detail="Task not found")
            elif "Only MANAGER or SUPER_ADMIN" in err_msg or "Access denied" in err_msg:
                raise HTTPException(status_code=403, detail="Task not found or access denied")
            logger.error(f"Error deleting task: {e}")
            raise HTTPException(status_code=400, detail="An unexpected error occurred")

    async def get_my_board_tasks(self, board_id: int, current_user: dict) -> List[CanonicalTaskResponse]:
        try:
            has_access = await self.conn.fetchval("SELECT can_view_board($1, $2)", current_user["id"], board_id)
            if not has_access:
                raise HTTPException(status_code=403, detail="Board not found or access denied")

            rows = await self.conn.fetch(
                "SELECT * FROM v_tasks_canonical WHERE board_id = $1 AND assigned_to = $2",
                board_id, current_user["id"]
            )
            return [CanonicalTaskResponse(**dict(row)) for row in rows]
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting my tasks: {e}")
            raise HTTPException(status_code=400, detail="An unexpected error occurred")

    async def get_tasks_assigned_by_me(self, board_id: int, current_user: dict) -> List[CanonicalTaskResponse]:
        try:
            has_access = await self.conn.fetchval("SELECT can_view_board($1, $2)", current_user["id"], board_id)
            if not has_access:
                raise HTTPException(status_code=403, detail="Board not found or access denied")

            rows = await self.conn.fetch(
                "SELECT * FROM v_tasks_canonical WHERE board_id = $1 AND created_by = $2 AND assigned_to != $2",
                board_id, current_user["id"]
            )
            return [CanonicalTaskResponse(**dict(row)) for row in rows]
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting tasks assigned by me: {e}")
            raise HTTPException(status_code=400, detail="An unexpected error occurred")

    async def update_task_assignee(self, task_id: int, body: TaskAssigneeUpdate, current_user: dict) -> tuple[CanonicalTaskResponse, Optional[dict], dict]:
        try:
            has_access = await self.conn.fetchval("SELECT can_edit_task($1, $2)", current_user["id"], task_id)
            if not has_access:
                raise HTTPException(status_code=403, detail="Task not found or access denied")

            async with self.conn.transaction():
                await self.conn.execute("SELECT set_config('app.current_user_id', $1, true)", str(current_user["id"]))
                old_task = await self.conn.fetchrow("SELECT * FROM v_tasks_canonical WHERE id = $1", task_id)

                updated_id = await self.conn.fetchval(
                    "UPDATE tasks SET assigned_to = $1 WHERE id = $2 RETURNING id",
                    body.assigned_to, task_id
                )
                if not updated_id:
                    raise HTTPException(status_code=404, detail="Task not found")

                new_task = await self.conn.fetchrow("SELECT * FROM v_tasks_canonical WHERE id = $1", task_id)
                return CanonicalTaskResponse(**dict(new_task)), dict(old_task), dict(new_task)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error updating task assignee: {e}")
            raise HTTPException(status_code=400, detail="An unexpected error occurred")

    async def search_tasks(
        self,
        current_user: dict,
        query: Optional[str] = None,
        board_id: Optional[str] = None,
        assigned_to_me: bool = True,
        page: int = 1,
        limit: int = 20,
    ) -> dict:
        try:
            org_id = current_user.get("organization_id")
            user_id = current_user.get("id")

            where_clauses = ["(organization_id::text = $1 OR LTRIM(RIGHT(organization_id::text, 12), '0') = LTRIM(RIGHT($1, 12), '0'))"]
            params: list[Any] = [str(org_id)]
            idx = 2

            if assigned_to_me and user_id:
                where_clauses.append(f"(assigned_to::text = ${idx} OR LTRIM(RIGHT(assigned_to::text, 12), '0') = LTRIM(RIGHT(${idx}, 12), '0'))")
                params.append(str(user_id))
                idx += 1

            if board_id and board_id != "general":
                where_clauses.append(f"(board_id::text = ${idx} OR LTRIM(RIGHT(board_id::text, 12), '0') = LTRIM(RIGHT(${idx}, 12), '0'))")
                params.append(str(board_id))
                idx += 1

            if query and query.strip():
                clean_q = f"%{query.strip()}%"
                where_clauses.append(
                    f"(title ILIKE ${idx} OR task_reference ILIKE ${idx} OR board_name ILIKE ${idx} OR COALESCE(description, '') ILIKE ${idx})"
                )
                params.append(clean_q)
                idx += 1

            where_sql = " AND ".join(where_clauses)

            count_sql = f"SELECT COUNT(*) FROM v_tasks_canonical WHERE {where_sql}"
            total = await self.conn.fetchval(count_sql, *params)

            offset = (page - 1) * limit
            data_sql = f"""
                SELECT * FROM v_tasks_canonical
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT ${idx} OFFSET ${idx+1}
            """
            data_params = list(params) + [limit, offset]

            rows = await self.conn.fetch(data_sql, *data_params)
            items = [dict(r) for r in rows]

            return {
                "items": items,
                "total": total or 0,
                "page": page,
                "limit": limit,
            }
        except Exception as e:
            logger.error(f"Error searching tasks: {e}")
            raise HTTPException(status_code=400, detail="An unexpected error occurred while searching tasks")

    async def bulk_move_tasks(self, task_ids: List[int], column_id: int, current_user: dict) -> int:
        try:
            user_id = current_user["id"]
            org_id = current_user["organization_id"]

            moved_count = await self.conn.fetchval(
                "SELECT fn_bulk_move_tasks($1, $2, $3, $4)",
                task_ids, column_id, user_id, org_id
            )
            return moved_count or 0
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error bulk moving tasks: {e}")
            raise HTTPException(status_code=400, detail="Failed to bulk move tasks")

    async def bulk_delete_tasks(self, task_ids: List[int], current_user: dict) -> int:
        role = current_user.get("role", "MEMBER")
        if role not in ("MANAGER", "SUPER_ADMIN"):
            raise HTTPException(status_code=403, detail="Only MANAGER or SUPER_ADMIN can delete tasks")

        try:
            user_id = current_user["id"]
            deleted_count = await self.conn.fetchval(
                "SELECT fn_bulk_delete_tasks($1, $2)",
                task_ids, user_id
            )
            return deleted_count or 0
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error bulk deleting tasks: {e}")
            raise HTTPException(status_code=400, detail="Failed to bulk delete tasks")

