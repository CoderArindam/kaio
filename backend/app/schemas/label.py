from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class LabelResponse(BaseModel):
    id: int
    board_id: int
    name: str
    color: str
    created_at: Optional[datetime] = None

class LabelCreate(BaseModel):
    name: str
    color: str
