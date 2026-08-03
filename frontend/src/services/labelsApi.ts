import api from '../lib/axios';

export interface Label {
  id: number;
  board_id: number;
  name: string;
  color: string;
  created_at?: string;
}

export const getBoardLabels = async (boardId: number): Promise<Label[]> => {
  const response = await api.get(`/boards/${boardId}/labels`);
  return response.data.data;
};

export const createLabel = async (boardId: number, data: { name: string; color: string }): Promise<Label> => {
  const response = await api.post(`/boards/${boardId}/labels`, data);
  return response.data.data;
};

export const updateLabel = async (labelId: number, data: { name?: string; color?: string }): Promise<Label> => {
  const response = await api.patch(`/labels/${labelId}`, data);
  return response.data.data;
};

export const deleteLabel = async (labelId: number): Promise<void> => {
  await api.delete(`/labels/${labelId}`);
};


export const attachLabel = async (taskId: number, labelId: number): Promise<void> => {
  await api.post(`/tasks/${taskId}/labels/${labelId}`);
};

export const detachLabel = async (taskId: number, labelId: number): Promise<void> => {
  await api.delete(`/tasks/${taskId}/labels/${labelId}`);
};
