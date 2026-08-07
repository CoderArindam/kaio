import logging
from typing import Optional, List
import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks

from app.schemas.task import TaskCreate, TaskUpdate, TaskAssigneeUpdate, CanonicalTaskResponse, BoardDataResponse, TaskSearchResponse, BulkMoveTasksRequest, BulkDeleteTasksRequest, LogTaskTimeRequest
from app.schemas.envelope import DataEnvelope
from app.services.notification_service import NotificationService, _dispatch_notification_event
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
            message={"type": "task_created", "board_id": task.board_id, "task_id": task.id, "action": "created"},
            exclude_user_id=current_user["id"],
        )
        # Notify dashboard listeners to refresh KPI counts
        await connection_manager.send_to_org(
            org_id=current_user["organization_id"],
            message={"type": "dashboard_refresh"},
        )
    except Exception as e:
        logger.error(f"Error sending websocket task_created event: {e}")
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



@router.get("/tasks/{task_id}", response_model=DataEnvelope[CanonicalTaskResponse])
async def get_task(
    task_id: int,
    current_user: dict = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service)
):
    task = await task_service.get_task(task_id, current_user)
    return DataEnvelope(data=task)


@router.post("/tasks/{task_id}/log-time", response_model=DataEnvelope[CanonicalTaskResponse])
async def log_task_time(
    task_id: int,
    log_in: LogTaskTimeRequest,
    current_user: dict = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service)
):
    task = await task_service.log_task_time(task_id, log_in, current_user)
    try:
        await connection_manager.send_to_board(
            board_id=task.board_id,
            message={"type": "task_updated", "board_id": task.board_id, "task_id": task.id, "action": "logged_time"},
            exclude_user_id=current_user["id"],
        )
    except Exception:
        pass
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
    task_service: TaskService = Depends(get_task_service),
    conn: asyncpg.Connection = Depends(get_db_connection),
):
    new_task, old_dict, new_dict = await task_service.update_task(task_id, task_in, current_user)
    try:
        await connection_manager.send_to_board(
            board_id=new_task.board_id,
            message={"type": "task_updated", "board_id": new_task.board_id, "task_id": new_task.id, "action": "updated"},
            exclude_user_id=current_user["id"],
        )
    except Exception:
        pass

    if old_dict and new_dict:
        notif_svc = NotificationService(conn)
        actor_id = current_user["id"]
        org_id = current_user["organization_id"]

        if old_dict.get("assigned_to") != new_dict.get("assigned_to"):
            background_tasks.add_task(
                notif_svc.notify_assignee_changed,
                task_id=new_task.id,
                task_title=new_dict["title"],
                board_id=new_task.board_id,
                new_assignee_id=new_dict.get("assigned_to"),
                old_assignee_id=old_dict.get("assigned_to"),
                actor_id=actor_id,
                org_id=org_id,
            )

        if old_dict.get("due_date") != new_dict.get("due_date"):
            background_tasks.add_task(
                notif_svc.notify_due_date_changed,
                task_id=new_task.id,
                task_title=new_dict["title"],
                board_id=new_task.board_id,
                assignee_id=new_dict.get("assigned_to"),
                reporter_id=new_dict.get("reporter_id"),
                actor_id=actor_id,
                org_id=org_id,
                old_due_date=old_dict.get("due_date"),
                new_due_date=new_dict.get("due_date"),
            )

        if old_dict.get("reporter_id") != new_dict.get("reporter_id"):
            background_tasks.add_task(
                notif_svc.notify_reporter_changed,
                task_id=new_task.id,
                task_title=new_dict["title"],
                board_id=new_task.board_id,
                new_reporter_id=new_dict.get("reporter_id"),
                old_reporter_id=old_dict.get("reporter_id"),
                assignee_id=new_dict.get("assigned_to"),
                actor_id=actor_id,
                org_id=org_id,
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
                message={"type": "task_deleted", "board_id": board_id, "task_id": task_id, "action": "deleted"},
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
    task_service: TaskService = Depends(get_task_service),
    conn: asyncpg.Connection = Depends(get_db_connection),
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

    if old_dict and new_dict and old_dict.get("assigned_to") != new_dict.get("assigned_to"):
        notif_svc = NotificationService(conn)
        background_tasks.add_task(
            notif_svc.notify_assignee_changed,
            task_id=new_task.id,
            task_title=new_dict["title"],
            board_id=new_task.board_id,
            new_assignee_id=new_dict.get("assigned_to"),
            old_assignee_id=old_dict.get("assigned_to"),
            actor_id=current_user["id"],
            org_id=current_user["organization_id"],
        )

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
            await connection_manager.send_to_board(
                board_id=board_id,
                message={"type": "task_moved", "board_id": board_id, "task_ids": body.task_ids, "action": "moved"},
                exclude_user_id=current_user["id"],
            )
            await connection_manager.send_to_org(
                org_id=current_user["organization_id"],
                message={"type": "dashboard_refresh"},
            )
        except Exception:
            pass

    return DataEnvelope(data={"moved_count": moved_count, "message": f"Successfully moved {moved_count} tasks"})


@router.post("/tasks/bulk-delete", response_model=DataEnvelope[dict])
async def bulk_delete_tasks(
    body: BulkDeleteTasksRequest,
    current_user: dict = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service)
):
    board_id = None
    if body.task_ids:
        try:
            first_task = await task_service.get_task(body.task_ids[0], current_user)
            board_id = first_task.board_id
        except Exception:
            pass

    deleted_count = await task_service.bulk_delete_tasks(body.task_ids, current_user)

    if board_id and deleted_count:
        try:
            await connection_manager.send_to_board(
                board_id=board_id,
                message={"type": "task_deleted", "board_id": board_id, "task_ids": body.task_ids, "action": "deleted"},
                exclude_user_id=current_user["id"],
            )
            await connection_manager.send_to_org(
                org_id=current_user["organization_id"],
                message={"type": "dashboard_refresh"},
            )
        except Exception:
            pass

    return DataEnvelope(data={"deleted_count": deleted_count, "message": f"Successfully deleted {deleted_count} tasks"})



