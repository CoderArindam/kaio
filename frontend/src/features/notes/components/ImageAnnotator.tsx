import React, { useRef, useEffect, useState } from 'react';
import { Upload, Camera, Trash2, Maximize2, Download } from 'lucide-react';
import { uploadNoteImage, uploadScreenshot } from '../../../services/notesApi';
import toast from 'react-hot-toast';
import { resolveUrl, normalizeAnnotations, drawAnnotations } from './annotationUtils';
import { AnnotationModal } from './AnnotationModal';

export interface Annotation {
  id: string;
  type: 'pin' | 'highlight' | 'freehand';
  x: number;
  y: number;
  w?: number;
  h?: number;
  color: string;
  label?: string;
  points?: { x: number; y: number }[];
}

interface ImageAnnotatorProps {
  noteId: number;
  imageUrl: string | null;
  annotations: Annotation[];
  onImageChange: (url: string) => void;
  onAnnotationsChange: (annotations: Annotation[]) => void;
}

export const ImageAnnotator: React.FC<ImageAnnotatorProps> = ({
  noteId,
  imageUrl,
  annotations: rawAnnotations,
  onImageChange,
  onAnnotationsChange,
}) => {
  const annotations = normalizeAnnotations(rawAnnotations);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewImgRef = useRef<HTMLImageElement>(null);

  const resolvedUrl = resolveUrl(imageUrl);

  // Draw static preview of annotations in the thumbnail
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const img = previewImgRef.current;
    if (!canvas || !img || !resolvedUrl) return;

    const draw = () => {
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawAnnotations(ctx, annotations);
    };

    if (img.complete && img.naturalWidth > 0) {
      draw();
    } else {
      img.onload = draw;
    }
  }, [annotations, resolvedUrl]);

  /** Composite image + annotations onto an offscreen canvas and download as PNG */
  const downloadAnnotated = async () => {
    if (!resolvedUrl) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;

      ctx.drawImage(img, 0, 0);
      drawAnnotations(ctx, annotations);

      canvas.toBlob((blob) => {
        if (!blob) { toast.error('Failed to generate image'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'annotated-note.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    img.onerror = () => toast.error('Failed to load image for download');
    // Cache-bust to avoid opaque cached responses blocking CORS
    img.src = `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) return toast.error('Please select an image file');
    if (file.size > 10 * 1024 * 1024) return toast.error('Image must be under 10 MB');
    setIsUploading(true);
    try {
      const result = await uploadNoteImage(noteId, file);
      onImageChange(result.image_url);
      onAnnotationsChange([]);
    } catch {
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleScreenshot = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      const dataUrl = canvas.toDataURL('image/png');
      setIsUploading(true);
      const result = await uploadScreenshot(dataUrl);
      onImageChange(result.image_url);
      onAnnotationsChange([]);
      // Auto-open annotation modal after screenshot
      setTimeout(() => setIsModalOpen(true), 300);
    } catch (err) {
      const msg = (err as Error).message || '';
      if (!msg.toLowerCase().includes('cancel') && !msg.toLowerCase().includes('abort')) {
        toast.error('Screenshot failed or was cancelled');
      }
    } finally {
      setIsUploading(false);
    }
  };

  if (!imageUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-6">
        <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center">
          <Upload className="w-7 h-7 text-violet-500" />
        </div>
        <p className="text-[13px] text-brand-text-muted text-center max-w-xs">
          Upload an image or capture a screenshot to start annotating
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500 text-white rounded-xl text-[13px] font-medium hover:bg-violet-600 transition-all disabled:opacity-50"
          >
            <Upload className="w-4 h-4" /> Upload Image
          </button>
          <button
            onClick={handleScreenshot}
            disabled={isUploading}
            className="flex items-center gap-2 px-4 py-2 bg-brand-surface border border-brand-border rounded-xl text-[13px] font-medium text-brand-text hover:bg-brand-surface-low transition-all disabled:opacity-50"
          >
            <Camera className="w-4 h-4" /> {isUploading ? 'Processing...' : 'Screenshot'}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
        />
      </div>
    );
  }

  return (
    <>
      {/* Compact toolbar shown when image exists */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-brand-border/50 bg-brand-surface/50 shrink-0 flex-wrap">
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-[12px] font-medium hover:bg-amber-600 transition-all"
        >
          <Maximize2 className="w-3.5 h-3.5" /> Open &amp; Annotate
        </button>
        {annotations.length > 0 && (
          <span className="text-[11px] text-brand-text-muted">
            {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Replace image"
            className="p-1.5 rounded-md text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleScreenshot}
            title="New screenshot"
            className="p-1.5 rounded-md text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low transition-all"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={downloadAnnotated}
            title="Download annotated image"
            className="p-1.5 rounded-md text-brand-text-muted hover:text-emerald-500 hover:bg-emerald-500/10 transition-all"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => { onImageChange(''); onAnnotationsChange([]); }}
            title="Remove image"
            className="p-1.5 rounded-md text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { e.target.files?.[0] && handleFileUpload(e.target.files[0]); }}
        />
      </div>

      {/* Image preview — click to open modal */}
      <div className="flex-1 overflow-hidden relative bg-brand-bg/50 flex items-center justify-center">
        <button
          onClick={() => setIsModalOpen(true)}
          className="group relative max-w-full max-h-full"
          title="Click to annotate"
        >
          <img
            ref={previewImgRef}
            src={resolvedUrl}
            alt="Note image"
            crossOrigin="anonymous"
            className="max-w-full max-h-full object-contain rounded-lg shadow-md transition-all duration-200 group-hover:brightness-90"
            style={{ maxHeight: 'calc(100vh - 280px)' }}
          />
          {/* Static canvas for thumbnail annotations */}
          <canvas
            ref={previewCanvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none object-contain"
            style={{ maxHeight: 'calc(100vh - 280px)' }}
          />
          {/* Hover overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200">
            <div className="flex items-center gap-2 px-4 py-2 bg-black/70 backdrop-blur-sm text-white rounded-xl text-[13px] font-medium shadow-lg">
              <Maximize2 className="w-4 h-4" /> Click to annotate
            </div>
          </div>
          {/* Annotation count badge */}
          {annotations.length > 0 && (
            <div className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
              {annotations.length}
            </div>
          )}
        </button>
      </div>

      {/* Fullscreen Annotation Modal */}
      {isModalOpen && (
        <AnnotationModal
          imageUrl={resolvedUrl}
          annotations={annotations}
          onClose={() => setIsModalOpen(false)}
          onSave={(updated) => {
            onAnnotationsChange(updated);
            setIsModalOpen(false);
          }}
        />
      )}
    </>
  );
};
