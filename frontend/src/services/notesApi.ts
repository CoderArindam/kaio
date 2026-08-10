import api from '../lib/axios';

export interface NoteCreatePayload {
  title?: string;
  content_type: 'richtext' | 'drawing' | 'image';
  rich_content?: object | null;
  canvas_data?: string | null;
  image_url?: string | null;
  annotations?: object[] | null;
}

export interface NoteUpdatePayload {
  title?: string;
  rich_content?: object | null;
  canvas_data?: string | null;
  image_url?: string | null;
  annotations?: object[] | null;
  is_pinned?: boolean;
  expected_version: number;
}

export const fetchNotes = async () => {
  const res = await api.get('/notes');
  return res.data.data;
};

export const createNote = async (payload: NoteCreatePayload) => {
  const res = await api.post('/notes', payload);
  return res.data.data;
};

export const updateNote = async (id: number, payload: NoteUpdatePayload) => {
  const res = await api.patch(`/notes/${id}`, payload);
  return res.data.data;
};

export const deleteNote = async (id: number) => {
  await api.delete(`/notes/${id}`);
};

export const searchNotes = async (q: string) => {
  const res = await api.get('/notes/search', { params: { q } });
  return res.data.data;
};

export const togglePin = async (id: number) => {
  const res = await api.post(`/notes/${id}/pin`);
  return res.data.data;
};

export const uploadNoteImage = async (noteId: number, file: File) => {
  const form = new FormData();
  form.append('file', file);
  const res = await api.post(`/notes/${noteId}/image-upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
};

export const uploadScreenshot = async (dataUrl: string) => {
  const res = await api.post('/notes/screenshot', { data_url: dataUrl });
  return res.data.data;
};
