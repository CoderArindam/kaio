from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date

class TaskCreate(BaseModel):
    board_id: int
    column_id: int
    title: str
    description: Optional[str] = None
    priority: Optional[str] = None
    estimate_hours: Optional[float] = None
    assigned_to: Optional[int] = None
    due_date: Optional[datetime] = None
    reminder_at: Optional[datetime] = None
    label_ids: Optional[List[int]] = []

class TaskUpdate(BaseModel):
    column_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    estimate_hours: Optional[float] = None
    due_date: Optional[datetime] = None
    reminder_at: Optional[datetime] = None

class TaskAssigneeUpdate(BaseModel):
    assigned_to: Optional[int] = None

class LogTaskTimeRequest(BaseModel):
    entry_date: date
    hours: float = Field(..., gt=0, le=24, description="Hours worked must be greater than 0 and at most 24")
    description: Optional[str] = None

from app.schemas.label import LabelResponse

class CanonicalTaskResponse(BaseModel):
    id: int
    board_id: int
    board_name: Optional[str] = ""
    organization_id: int
    task_reference: Optional[str] = ""
    column_id: int
    column_name: Optional[str] = ""
    column_type: Optional[str] = "TODO"
    is_completed: Optional[bool] = False
    title: str
    description: Optional[str] = None
    priority: Optional[str] = None
    estimate_hours: Optional[float] = None
    logged_hours: Optional[float] = 0.0
    due_date: Optional[datetime] = None
    reminder_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    assigned_to: Optional[int] = None
    assignee_email: Optional[str] = None
    assignee_first_name: Optional[str] = None
    assignee_last_name: Optional[str] = None
    assignee_avatar_url: Optional[str] = None
    
    created_by: Optional[int] = None
    creator_email: Optional[str] = None
    creator_first_name: Optional[str] = None
    creator_last_name: Optional[str] = None
    creator_avatar_url: Optional[str] = None
    labels: List[LabelResponse] = []
    subtask_count: int = 0
    completed_subtask_count: int = 0


class ColumnResponse(BaseModel):
    id: int
    name: str
    position: int
    column_type: str
    is_completed: bool

class BoardDataResponse(BaseModel):
    columns: List[ColumnResponse]
    tasks: List[CanonicalTaskResponse]

class TaskSearchResponse(BaseModel):
    items: List[CanonicalTaskResponse]
    total: int
    page: int
    limit: int

class BulkMoveTasksRequest(BaseModel):
    task_ids: List[int]
    column_id: int


class BulkDeleteTasksRequest(BaseModel):
    task_ids: List[int]



