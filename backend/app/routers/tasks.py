import logging
from typing import Optional, List
import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks

from app.schemas.task import TaskCreate, TaskUpdate, TaskAssigneeUpdate, CanonicalTaskResponse, BoardDataResponse, TaskSearchResponse, BulkMoveTasksRequest
from app.schemas.envelope import DataEnvelope
from app.services.notification_service import dispatch_task_email, NotificationService, _dispatch_notification_event
from app.auth.dependencies import get_current_user
from app.database.connection import get_db_connection
from app.services.task_service import TaskService

logger = logging.getLogger(__name__)

from app.websockets.manager import connection_manager

router = APIRouter(tags=["Tasks"])

def get_task_service(conn: asyncpg.Connection = Depends(get_db_connection)) -> TaskService:
    return TaskService(conn)

@router.get("/tasks/search", response_model=DataEnvelope[TaskSearchResponse])
async def search_tasks(
    query: Optional[str] = Query(default=None),
    board_id: Optional[str] = Query(default=None),
    assigned_to_me: bool = Query(default=True),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service)
):
    result = await task_service.search_tasks(
        current_user=current_user,
        query=query,
        board_id=board_id,
        assigned_to_me=assigned_to_me,
        page=page,
        limit=limit,
    )
    return DataEnvelope(data=TaskSearchResponse(**result))

@router.post("/tasks", response_model=DataEnvelope[CanonicalTaskResponse])
async def create_task(
    task_in: TaskCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    task = await task_service.create_task(task_in, current_user)
    try:
        await connection_manager.send_to_board(
            board_id=task.board_id,
            message={"type": "task.updated", "board_id": task.board_id, "task_id": task.id, "action": "created"},
            exclude_user_id=current_user["id"],
        )
    except Exception:
        pass
    if task.assigned_to and task.assigned_to != current_user["id"]:
        try:
            notif_svc = NotificationService(conn)
            await notif_svc.notify_task_assigned(
                task_id=task.id,
                task_title=task.title,
                board_name=task.board_name or str(task.board_id),
                assignee_id=task.assigned_to,
                actor_id=current_user["id"],
                org_id=current_user["organization_id"],
            )
        except Exception as e:
            logger.error(f"notify_task_assigned failed for task={task.id}: {e}")
    return DataEnvelope(data=task)



@router.get("/boards/{board_id}/tasks", response_model=DataEnvelope[BoardDataResponse])
async def get_board_tasks(
    board_id: str,
    assigned_to: Optional[int] = Query(default=None),
    current_user: dict = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service)
):
    b_str = str(board_id).strip()
    try:
        int_board_id = int(b_str.split('-')[-1]) if '-' in b_str else int(b_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid board ID format: {board_id}")

    data = await task_service.get_board_tasks(int_board_id, assigned_to, current_user)
    return DataEnvelope(data=data)



@router.patch("/tasks/{task_id}", response_model=DataEnvelope[CanonicalTaskResponse])
async def update_task(
    task_id: int,
    task_in: TaskUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service)
):
    new_task, old_dict, new_dict = await task_service.update_task(task_id, task_in, current_user)
    try:
        await connection_manager.send_to_board(
            board_id=new_task.board_id,
            message={"type": "task.updated", "board_id": new_task.board_id, "task_id": new_task.id, "action": "updated"},
            exclude_user_id=current_user["id"],
        )
    except Exception:
        pass
    
    if old_dict and new_dict:
        actor_name = current_user.get("first_name") or current_user.get("email")

        if old_dict.get("assigned_to") != new_dict.get("assigned_to"):
            background_tasks.add_task(
                dispatch_task_email,
                activity_type="ASSIGNEE_CHANGED",
                task_title=new_dict["title"],
                board_name=new_dict["board_name"],
                actor_name=actor_name,
                assignee_email=new_dict["assignee_email"],
                assignee_name=new_dict["assignee_first_name"],
                old_assignee_email=old_dict["assignee_email"],
                old_assignee_name=old_dict["assignee_first_name"],
            )
            # Push real-time WS event — DB trigger already inserted the notification row
            new_assignee_id = new_dict.get("assigned_to")
            if new_assignee_id and new_assignee_id != current_user["id"]:
                try:
                    await _dispatch_notification_event(task_service.conn, new_assignee_id)
                except Exception as e:
                    logger.error(f"WS push failed for task={new_task.id} assignee={new_assignee_id}: {e}")

        if old_dict.get("due_date") != new_dict.get("due_date"):
            background_tasks.add_task(
                dispatch_task_email,
                activity_type="DUE_DATE_CHANGED",
                task_title=new_dict["title"],
                board_name=new_dict["board_name"],
                actor_name=actor_name,
                assignee_email=new_dict["assignee_email"],
                assignee_name=new_dict["assignee_first_name"],
            )

        if old_dict.get("column_id") != new_dict.get("column_id"):
            background_tasks.add_task(
                dispatch_task_email,
                activity_type="STATUS_CHANGED",
                task_title=new_dict["title"],
                board_name=new_dict["board_name"],
                actor_name=actor_name,
                assignee_email=new_dict["assignee_email"],
                assignee_name=new_dict["assignee_first_name"],
                old_status=old_dict["column_name"],
                new_status=new_dict["column_name"],
            )

    return DataEnvelope(data=new_task)


@router.delete("/tasks/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service)
):
    # Read board_id before deletion so we can dispatch the WS event
    try:
        task_row = await task_service.get_task(task_id, current_user)
        board_id = task_row.board_id
    except Exception:
        board_id = None

    await task_service.delete_task(task_id, current_user)

    if board_id:
        try:
            await connection_manager.send_to_board(
                board_id=board_id,
                message={"type": "task.updated", "board_id": board_id, "task_id": task_id, "action": "deleted"},
                exclude_user_id=current_user["id"],
            )
        except Exception:
            pass
    return None


@router.get("/boards/{board_id}/my-tasks", response_model=DataEnvelope[List[CanonicalTaskResponse]])
async def get_my_board_tasks(
    board_id: int,
    current_user: dict = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service)
):
    tasks = await task_service.get_my_board_tasks(board_id, current_user)
    return DataEnvelope(data=tasks)


@router.get("/boards/{board_id}/assigned-by-me", response_model=DataEnvelope[List[CanonicalTaskResponse]])
async def get_tasks_assigned_by_me(
    board_id: int,
    current_user: dict = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service)
):
    tasks = await task_service.get_tasks_assigned_by_me(board_id, current_user)
    return DataEnvelope(data=tasks)


@router.patch("/tasks/{task_id}/assignee", response_model=DataEnvelope[CanonicalTaskResponse])
async def update_task_assignee(
    task_id: int,
    body: TaskAssigneeUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service)
):
    new_task, old_dict, new_dict = await task_service.update_task_assignee(task_id, body, current_user)

    try:
        await connection_manager.send_to_board(
            board_id=new_task.board_id,
            message={"type": "task.updated", "board_id": new_task.board_id, "task_id": new_task.id, "action": "updated"},
            exclude_user_id=current_user["id"],
        )
    except Exception:
        pass

    if old_dict and new_dict:
        actor_name = current_user.get("first_name") or current_user.get("email")
        if old_dict.get("assigned_to") != new_dict.get("assigned_to"):
            background_tasks.add_task(
                dispatch_task_email,
                activity_type="ASSIGNEE_CHANGED",
                task_title=new_dict["title"],
                board_name=new_dict["board_name"],
                actor_name=actor_name,
                assignee_email=new_dict["assignee_email"],
                assignee_name=new_dict["assignee_first_name"],
                old_assignee_email=old_dict["assignee_email"],
                old_assignee_name=old_dict["assignee_first_name"],
            )
            # Push real-time WS event — DB trigger already inserted the notification row
            new_assignee_id = new_dict.get("assigned_to")
            if new_assignee_id and new_assignee_id != current_user["id"]:
                try:
                    await _dispatch_notification_event(task_service.conn, new_assignee_id)
                except Exception as e:
                    logger.error(f"WS push failed for task={new_task.id} assignee={new_assignee_id}: {e}")

    return DataEnvelope(data=new_task)


@router.post("/tasks/bulk-move", response_model=DataEnvelope[dict])
async def bulk_move_tasks(
    body: BulkMoveTasksRequest,
    current_user: dict = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service)
):
    # Read board_id from first task before move for WS dispatch
    board_id = None
    if body.task_ids:
        try:
            first_task = await task_service.get_task(body.task_ids[0], current_user)
            board_id = first_task.board_id
        except Exception:
            pass

    moved_count = await task_service.bulk_move_tasks(body.task_ids, body.column_id, current_user)

    if board_id and moved_count:
        try:
            for task_id in body.task_ids:
                await connection_manager.send_to_board(
                    board_id=board_id,
                    message={"type": "task.updated", "board_id": board_id, "task_id": task_id, "action": "moved"},
                    exclude_user_id=current_user["id"],
                )
        except Exception:
            pass

    return DataEnvelope(data={"moved_count": moved_count, "message": f"Successfully moved {moved_count} tasks"})


