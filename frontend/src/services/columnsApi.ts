import api from '../lib/axios';
import { type Column } from './tasksApi';

export interface CreateColumnPayload {
  name: string;
  column_type?: 'TODO' | 'IN_PROGRESS' | 'DONE';
  position?: number;
  color?: string;
}

export interface UpdateColumnPayload {
  name?: string;
  column_type?: 'TODO' | 'IN_PROGRESS' | 'DONE';
  color?: string;
}

export const createColumn = async (boardId: number, data: CreateColumnPayload): Promise<Column> => {
  const response = await api.post(`/boards/${boardId}/columns`, data);
  return response.data.data;
};

export const updateColumn = async (columnId: number, data: UpdateColumnPayload): Promise<Column> => {
  const response = await api.patch(`/columns/${columnId}`, data);
  return response.data.data;
};

export const deleteColumn = async (columnId: number, targetColumnId: number): Promise<void> => {
  await api.delete(`/columns/${columnId}`, { data: { target_column_id: targetColumnId } });
};

export const reorderColumns = async (boardId: number, orderedColumnIds: number[]): Promise<void> => {
  await api.post(`/boards/${boardId}/columns/reorder`, { ordered_column_ids: orderedColumnIds });
};
