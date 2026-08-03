from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class SubtaskCreate(BaseModel):
    title: str

class SubtaskReorder(BaseModel):
    ordered_ids: List[int]

class SubtaskResponse(BaseModel):
    id: int
    task_id: int
    title: str
    is_completed: bool
    position: int
    created_by: Optional[int] = None
    creator_name: Optional[str] = ""
    created_at: Optional[datetime] = None
