from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum

class ThemeEnum(str, Enum):
    LIGHT = 'light'
    DARK = 'dark'
    SYSTEM = 'system'

class UserPreferencesBase(BaseModel):
    theme: ThemeEnum
    accent_color: str
    sidebar_theme: str
    tour_completed: bool = False
    task_sidebar_layout: Optional[Dict[str, List[str]]] = None

class UserPreferencesUpdate(BaseModel):
    theme: Optional[ThemeEnum] = None
    accent_color: Optional[str] = None
    sidebar_theme: Optional[str] = None
    sidebar_collapsed: Optional[bool] = None
    tour_completed: Optional[bool] = None
    task_sidebar_layout: Optional[Dict[str, List[str]]] = None

class UserPreferencesResponse(UserPreferencesBase):
    id: int
    user_id: int
    sidebar_collapsed: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, extra="ignore")
