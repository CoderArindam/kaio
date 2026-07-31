from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime
from app.schemas.activity import CanonicalActivityResponse

class DashboardTasksByStatus(BaseModel):
    todo: int = 0
    in_progress: int = 0
    review: int = 0
    done: int = 0

class DashboardKPIs(BaseModel):
    total_tasks: int = 0
    tasks_by_status: DashboardTasksByStatus
    overdue_tasks: int = 0
    total_boards: int = 0
    team_size: int = 0
    pending_proposals_count: int = 0
    active_meetings_count: int = 0

class DashboardTopMember(BaseModel):
    user_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    permission: Optional[str] = None

class DashboardBoardSummary(BaseModel):
    id: int
    name: str
    project_key: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    cover_gradient: Optional[str] = None
    task_count: int = 0
    completed_task_count: int = 0
    completion_percentage: float = 0.0
    overdue_count: int = 0
    member_count: int = 0
    created_at: Optional[datetime] = None
    top_members: List[DashboardTopMember] = []

class DashboardRecentMeeting(BaseModel):
    id: int
    session_id: str
    meeting_url: str
    status: str
    source: str
    started_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    initiated_by_user_id: Optional[int] = None
    initiator_email: Optional[str] = None
    initiator_display_name: Optional[str] = None
    initiator_avatar_url: Optional[str] = None

class DashboardFocusTask(BaseModel):
    id: int
    title: str
    priority: Optional[str] = None
    due_date: Optional[datetime] = None
    board_name: Optional[str] = None
    board_id: Optional[int] = None
    column_id: Optional[int] = None
    column_type: Optional[str] = None

class DashboardSummaryResponse(BaseModel):
    kpis: DashboardKPIs
    boards: List[DashboardBoardSummary]
    recent_activity: List[CanonicalActivityResponse]
    # Aggregated fields — eliminates separate API calls
    recent_meetings: List[DashboardRecentMeeting] = []
    focus_tasks: List[DashboardFocusTask] = []
    pending_approvals_count: int = 0
    timesheet_compliance_rate: float = 0.0
    timesheet_hours_logged: float = 0.0
