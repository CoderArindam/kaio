import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Paperclip, UploadCloud, Loader2, FileText, Download, Trash2, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { getTaskAttachments, uploadAttachment, deleteAttachment, createAttachment, type Attachment } from '../../../../../services/attachmentsApi';
import { type Task } from '../../../../../services/tasksApi';
import toast from 'react-hot-toast';
import { useActivityStore } from '../../../../../store/activityStore';
import Modal from '../../../../../components/common/Modal';
interface AttachmentsTabProps {
  task: Task;
}

const formatFileSize = (bytes?: number | null): string => {
  if (bytes === null || bytes === undefined || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isImageFile = (fileName: string, mimeType?: string | null, fileUrl?: string | null): boolean => {
  if (mimeType?.startsWith('image/')) return true;
  if (/\.(jpeg|jpg|gif|png|webp|svg)$/i.test(fileName)) return true;
  if (fileUrl && /\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i.test(fileUrl)) return true;
  return false;
};

const getFileUrl = (url?: string | null): string => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const baseUrl = import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL.replace('/api/v1', '')
    : 'http://localhost:8000';
  return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
};

const getHostname = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return '';
  }
};

const AttachmentsTab: React.FC<AttachmentsTabProps> = ({ task }) => {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFileName, setUploadingFileName] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [attachmentToDelete, setAttachmentToDelete] = useState<Attachment | null>(null);

  // Optional legacy URL form state
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [urlName, setUrlName] = useState('');
  const [urlAddress, setUrlAddress] = useState('');
  const [isSubmittingUrl, setIsSubmittingUrl] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchAttachments = async () => {
    setIsLoading(true);
    try {
      const data = await getTaskAttachments(task.id);
      setAttachments(data);
    } catch (error) {
      console.error('Failed to fetch attachments', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttachments();
  }, [task.id]);

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    setIsUploading(true);
    setUploadProgress(0);
    setUploadingFileName(file.name);

    try {
      const newAtt = await uploadAttachment(task.id, file, (percent) => {
        setUploadProgress(percent);
      });

      setAttachments((prev) => [newAtt, ...prev]);

      useActivityStore.getState().appendActivity(task.id, {
        entity_type: 'TASK',
        entity_id: task.id,
        activity_type: 'ATTACHMENT_ADDED',
        old_value: null,
        new_value: { file_name: file.name, file_url: newAtt.file_url },
        metadata: {}
      });

      toast.success('File uploaded successfully');
    } catch (error) {
      console.error('Failed to upload file', error);
      toast.error('Failed to upload file');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadingFileName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [task.id]);

  const submitLink = useCallback(async (url: string, name?: string) => {
    setIsSubmittingUrl(true);
    let finalName = name?.trim();
    if (!finalName) {
      try {
        const urlObj = new URL(url);
        finalName = urlObj.pathname !== '/' ? urlObj.pathname.split('/').pop() : urlObj.hostname;
        if (!finalName) finalName = urlObj.hostname;
      } catch (e) {
        finalName = 'Link';
      }
    }

    try {
      const newAtt = await createAttachment(task.id, { file_name: finalName as string, file_url: url });
      setAttachments((prev) => [newAtt, ...prev]);
      setUrlName('');
      setUrlAddress('');
      setShowUrlForm(false);
      
      useActivityStore.getState().appendActivity(task.id, {
        entity_type: 'TASK',
        entity_id: task.id,
        activity_type: 'ATTACHMENT_ADDED',
        old_value: null,
        new_value: { file_name: finalName, file_url: url },
        metadata: {}
      });

      toast.success('URL attachment added');
    } catch (error) {
      console.error('Failed to add attachment URL', error);
      toast.error('Failed to add attachment URL');
    } finally {
      setIsSubmittingUrl(false);
    }
  }, [task.id]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Ignore paste if typing in an input or textarea
      const isInput = e.target instanceof HTMLInputElement || 
                      e.target instanceof HTMLTextAreaElement || 
                      (e.target as HTMLElement).isContentEditable;
      
      if (isInput) return;

      // 1. Handle files (images, etc)
      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        e.preventDefault();
        handleFileUpload(e.clipboardData.files);
        return;
      }

      // 2. Handle text (URLs)
      const pastedText = e.clipboardData?.getData('text');
      if (pastedText && (pastedText.startsWith('http://') || pastedText.startsWith('https://'))) {
        e.preventDefault();
        submitLink(pastedText);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handleFileUpload, submitLink]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const confirmDelete = async () => {
    if (!attachmentToDelete) return;

    setDeletingId(attachmentToDelete.id);
    try {
      await deleteAttachment(attachmentToDelete.id);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentToDelete.id));
      toast.success('Attachment deleted');
      setAttachmentToDelete(null);
    } catch (error) {
      console.error('Failed to delete attachment', error);
      toast.error('Failed to delete attachment');
    } finally {
      setDeletingId(null);
    }
  };
  const handleAddUrl = () => {
    if (!urlAddress) return;
    submitLink(urlAddress, urlName);
  };

  return (
    <section className="space-y-4">
      {/* Hidden native file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
      />

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 flex flex-col items-center justify-center gap-2 ${
          isDragging
            ? 'border-brand-primary bg-brand-primary/10 shadow-lg scale-[1.01]'
            : 'border-brand-border bg-brand-surface-low hover:border-brand-primary/50 hover:bg-brand-surface'
        }`}
      >
        <div className="p-3 bg-brand-primary/10 text-brand-primary rounded-full mb-1">
          <UploadCloud size={28} />
        </div>
        <div className="text-sm font-medium text-brand-text">
          <span className="text-brand-primary font-semibold">Click to upload</span> or drag and drop
        </div>
        <p className="text-xs text-brand-text-muted">
          Supports images, documents, PDFs, zip files up to 25 MB
        </p>
        <p className="text-xs text-brand-primary/70 mt-1">
          Tip: You can also paste links directly anywhere in this tab
        </p>

        {/* Upload Progress Indicator */}
        {isUploading && (
          <div className="w-full mt-3 p-3 bg-brand-surface border border-brand-border rounded-lg text-left shadow-sm space-y-2">
            <div className="flex justify-between items-center text-xs font-medium text-brand-text">
              <span className="truncate max-w-[70%]">{uploadingFileName}</span>
              <span className="text-brand-primary font-bold">{uploadProgress}%</span>
            </div>
            <div className="w-full bg-brand-surface-low rounded-full h-2 overflow-hidden border border-brand-border/50">
              <div
                className="bg-brand-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Header Bar with URL fallback toggle */}
      <div className="flex justify-between items-center pt-2">
        <h3 className="font-semibold text-sm text-brand-text flex items-center gap-2">
          <Paperclip size={16} className="text-brand-primary" />
          Task Attachments ({attachments.length})
        </h3>
        <button
          type="button"
          onClick={() => setShowUrlForm(!showUrlForm)}
          className="text-xs text-brand-primary hover:underline font-medium flex items-center gap-1"
        >
          {showUrlForm ? 'Cancel URL input' : '+ Add URL Link'}
        </button>
      </div>

      {/* Fallback URL Form */}
      {showUrlForm && (
        <div className="p-4 border border-brand-border rounded-lg bg-brand-surface-low space-y-3">
          <input
            type="text"
            placeholder="File Name (optional)"
            value={urlName}
            onChange={(e) => setUrlName(e.target.value)}
            className="w-full bg-brand-surface border border-brand-border rounded p-2 text-sm outline-none focus:border-brand-primary"
          />
          <input
            type="text"
            placeholder="File URL (https://...)"
            value={urlAddress}
            onChange={(e) => setUrlAddress(e.target.value)}
            onPaste={(e) => {
              const pastedText = e.clipboardData.getData('text');
              if (pastedText && (pastedText.startsWith('http://') || pastedText.startsWith('https://'))) {
                e.preventDefault();
                submitLink(pastedText, urlName);
              }
            }}
            className="w-full bg-brand-surface border border-brand-border rounded p-2 text-sm outline-none focus:border-brand-primary"
          />
          <button
            onClick={handleAddUrl}
            disabled={isSubmittingUrl || !urlAddress}
            className="bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-1.5 rounded text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition"
          >
            {isSubmittingUrl && <Loader2 size={14} className="animate-spin" />}
            {isSubmittingUrl ? 'Saving...' : 'Add Link'}
          </button>
        </div>
      )}

      {/* Attachments List / Grid */}
      {isLoading ? (
        <div className="py-8 text-sm text-brand-text-muted flex flex-col items-center justify-center bg-brand-surface-low rounded-xl border border-dashed border-brand-border">
          <Loader2 size={24} className="mb-2 animate-spin text-brand-primary" />
          Loading attachments...
        </div>
      ) : attachments.length === 0 ? (
        <div className="py-8 text-sm text-brand-text-muted flex flex-col items-center justify-center bg-brand-surface-low rounded-xl border border-dashed border-brand-border">
          <Paperclip size={28} className="mb-2 opacity-40 text-brand-text-muted" />
          <p className="font-medium">No attachments yet</p>
          <p className="text-xs mt-1">Upload a file, add a link, or paste directly here</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {attachments.map((att) => {
            const isImg = isImageFile(att.file_name, att.mime_type, att.file_url);
            const sizeStr = formatFileSize(att.file_size);
            const fullUrl = getFileUrl(att.file_url);
            const isExternalLink = att.file_url?.startsWith('http://') || att.file_url?.startsWith('https://');
            const hostname = isExternalLink ? getHostname(fullUrl) : '';

            return (
              <div
                key={att.id}
                className="group relative rounded-xl border border-brand-border bg-brand-surface hover:border-brand-primary/50 hover:shadow-md transition-all flex flex-col overflow-hidden"
              >
                {/* Thumbnail / Icon Container */}
                <div className="aspect-video bg-brand-surface-low flex items-center justify-center overflow-hidden relative">
                  {isImg ? (
                    <img
                      src={fullUrl}
                      alt={att.file_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        // Fallback icon if image fails to load
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : isExternalLink && hostname ? (
                    <div className="flex flex-col items-center justify-center w-full h-full bg-brand-surface group-hover:text-brand-primary transition">
                      <img 
                        src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=128`} 
                        alt="Link icon"
                        className="w-12 h-12 rounded-lg shadow-sm"
                        onError={(e) => {
                           (e.target as HTMLElement).style.display = 'none';
                           (e.target as HTMLElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <LinkIcon size={32} className="hidden text-brand-text-muted group-hover:text-brand-primary" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 text-brand-text-muted group-hover:text-brand-primary transition">
                      <FileText size={32} />
                    </div>
                  )}

                  {/* Hover Overlay with Actions */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                    <a
                      href={fullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-full bg-white/90 text-gray-800 hover:bg-white transition hover:scale-110"
                      title="Open / Download"
                    >
                      <Download size={16} />
                    </a>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAttachmentToDelete(att);
                      }}
                      disabled={deletingId === att.id}
                      className="p-2 rounded-full bg-red-600/90 text-white hover:bg-red-600 transition hover:scale-110 disabled:opacity-50"
                      title="Delete attachment"
                    >
                      {deletingId === att.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Info Footer */}
                <div className="p-2.5 flex flex-col justify-between flex-1 bg-brand-surface">
                  <div className="font-medium text-xs text-brand-text truncate" title={att.file_name}>
                    {att.file_name}
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-brand-text-muted">
                    <span>{sizeStr || (isImg ? 'Image' : 'File')}</span>
                    <a
                      href={fullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-brand-primary text-brand-text-muted flex items-center gap-0.5"
                    >
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        isOpen={!!attachmentToDelete}
        onClose={() => setAttachmentToDelete(null)}
        title="Delete Attachment"
      >
        <div className="space-y-4">
          <p className="text-sm text-brand-text">
            Are you sure you want to delete <span className="font-semibold">"{attachmentToDelete?.file_name}"</span>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setAttachmentToDelete(null)}
              className="px-4 py-2 text-sm font-medium text-brand-text hover:bg-brand-surface-low rounded-md transition"
              disabled={deletingId !== null}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deletingId !== null}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition flex items-center justify-center gap-2 min-w-[100px]"
            >
              {deletingId !== null ? <Loader2 size={16} className="animate-spin" /> : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
};

export default AttachmentsTab;
