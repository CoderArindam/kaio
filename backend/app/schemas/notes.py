from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime


class AnnotationItem(BaseModel):
    type: str  # 'pin' | 'highlight' | 'freehand'
    x: float
    y: float
    w: Optional[float] = None
    h: Optional[float] = None
    color: Optional[str] = None
    label: Optional[str] = None


class NoteCreate(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    content_type: str = Field("richtext", pattern="^(richtext|drawing|image)$")
    rich_content: Optional[dict] = None
    canvas_data: Optional[str] = None       # base64 PNG string
    image_url: Optional[str] = None
    annotations: Optional[List[dict]] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    rich_content: Optional[dict] = None
    canvas_data: Optional[str] = None
    image_url: Optional[str] = None
    annotations: Optional[List[dict]] = None
    is_pinned: Optional[bool] = None
    expected_version: int  # required for optimistic concurrency


class NoteResponse(BaseModel):
    id: int
    user_id: int
    organization_id: int
    title: Optional[str]
    content_type: str
    rich_content: Optional[dict]
    canvas_data: Optional[str]
    image_url: Optional[str]
    annotations: Optional[list]
    is_pinned: bool
    version: int
    created_at: datetime
    updated_at: datetime
