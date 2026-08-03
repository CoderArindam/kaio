from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List

class ColumnCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    column_type: Optional[str] = Field(default="TODO")
    position: Optional[int] = Field(default=None)

class ColumnUpdate(BaseModel):
    name: Optional[str] = Field(default=None)
    column_type: Optional[str] = Field(default=None)

class ColumnDelete(BaseModel):
    target_column_id: int = Field(..., description="Target column ID to migrate existing tasks to before deletion")

class ColumnReorder(BaseModel):
    ordered_column_ids: List[int] = Field(..., description="Ordered list of column IDs")

class ColumnResponse(BaseModel):
    id: int
    board_id: int
    name: str
    position: int
    column_type: str
    created_at: datetime
