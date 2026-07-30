import api from '../lib/axios';

export interface SearchResultItem {
  id: number;
  title: string;
  type: 'task' | 'board' | 'comment';
  board_id: number | null;
  task_id: number | null;
  org_id: number;
}

export const searchApi = {
  globalSearch: async (query: string, limit = 10): Promise<SearchResultItem[]> => {
    const response = await api.get('/search', {
      params: { q: query, limit },
    });
    return response.data.data;
  },
};
