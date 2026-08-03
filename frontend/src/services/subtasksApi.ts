import api from '../lib/axios';

export interface Subtask {
  id: number;
  task_id: number;
  title: string;
  is_completed: boolean;
  position: number;
  created_by?: number;
  creator_name?: string;
  created_at?: string;
}

export const getSubtasks = async (taskId: number): Promise<Subtask[]> => {
  const response = await api.get(`/tasks/${taskId}/subtasks`);
  return response.data.data;
};

export const createSubtask = async (taskId: number, title: string): Promise<Subtask> => {
  const response = await api.post(`/tasks/${taskId}/subtasks`, { title });
  return response.data.data;
};

export const toggleSubtask = async (subtaskId: number): Promise<Subtask> => {
  const response = await api.patch(`/subtasks/${subtaskId}/toggle`);
  return response.data.data;
};

export const deleteSubtask = async (subtaskId: number): Promise<void> => {
  await api.delete(`/subtasks/${subtaskId}`);
};

export const reorderSubtasks = async (taskId: number, orderedIds: number[]): Promise<void> => {
  await api.post(`/tasks/${taskId}/subtasks/reorder`, { ordered_ids: orderedIds });
};
