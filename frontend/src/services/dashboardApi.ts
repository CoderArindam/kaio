import api from '../lib/axios';

export interface TasksByStatus {
  todo: number;
  in_progress: number;
  review: number;
  done: number;
}

export interface DashboardKPIs {
  total_tasks: number;
  tasks_by_status: TasksByStatus;
  overdue_tasks: number;
  total_boards: number;
  team_size: number;
  pending_proposals_count: number;
  active_meetings_count: number;
}

export interface DashboardTopMember {
  user_id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  permission?: string | null;
}

export interface DashboardBoardSummary {
  id: number;
  name: string;
  project_key?: string;
  description?: string;
  icon?: string;
  color?: string;
  cover_gradient?: string;
  task_count: number;
  completed_task_count: number;
  completion_percentage: number;
  overdue_count: number;
  member_count: number;
  created_at?: string;
  top_members?: DashboardTopMember[];
}

export interface DashboardActivityItem {
  id: number;
  organization_id: number;
  entity_type: string;
  entity_id: number;
  activity_type: string;
  old_value?: Record<string, any> | null;
  new_value?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  actor_id?: number | null;
  actor_first_name?: string | null;
  actor_last_name?: string | null;
  actor_avatar_url?: string | null;
  actor_email?: string | null;
  target_reference?: string | null;
}

export interface DashboardRecentMeeting {
  id: number;
  session_id: string;
  meeting_url: string;
  status: string;
  source: string;
  started_at?: string | null;
  created_at?: string | null;
  initiated_by_user_id?: number | null;
  initiator_email?: string | null;
  initiator_display_name?: string | null;
  initiator_avatar_url?: string | null;
}

export interface DashboardFocusTask {
  id: number;
  title: string;
  priority?: string | null;
  due_date?: string | null;
  board_name?: string | null;
  board_id?: number | null;
  column_id?: number | null;
  column_type?: string | null;
}

export interface DashboardSummaryResponse {
  kpis: DashboardKPIs;
  boards: DashboardBoardSummary[];
  recent_activity: DashboardActivityItem[];
  recent_meetings: DashboardRecentMeeting[];
  focus_tasks: DashboardFocusTask[];
  pending_approvals_count: number;
  timesheet_compliance_rate: number;
  timesheet_hours_logged: number;
}

export const getDashboardSummary = async (): Promise<DashboardSummaryResponse> => {
  const response = await api.get('/dashboard/summary');
  return response.data.data;
};
