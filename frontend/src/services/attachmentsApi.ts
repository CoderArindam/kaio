import api from '../lib/axios';

export interface Attachment {
  id: number;
  task_id: number;
  uploaded_by: number;
  file_name: string;
  file_url: string;
  file_size?: number | null;
  mime_type?: string | null;
  created_at: string;
  uploader_first_name?: string | null;
  uploader_last_name?: string | null;
  uploader_avatar_url?: string | null;
}

export const getTaskAttachments = async (taskId: number): Promise<Attachment[]> => {
  const response = await api.get(`/tasks/${taskId}/attachments`);
  return response.data;
};

export const createAttachment = async (
  taskId: number,
  data: { file_name: string; file_url: string }
): Promise<Attachment> => {
  const response = await api.post(`/tasks/${taskId}/attachments`, data);
  return response.data;
};

export const uploadAttachment = async (
  taskId: number,
  file: File,
  onProgress?: (percent: number) => void
): Promise<Attachment> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post(`/tasks/${taskId}/attachments/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      }
    },
  });

  return response.data;
};

export const deleteAttachment = async (attachmentId: number): Promise<{ success: boolean; id: number }> => {
  const response = await api.delete(`/attachments/${attachmentId}`);
  return response.data;
};
