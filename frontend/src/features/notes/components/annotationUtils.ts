import { type Annotation } from './ImageAnnotator';

/** Resolve local /uploads/ paths to the full backend URL */
export function resolveUrl(url: string | null): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = import.meta.env.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL.replace('/api/v1', '')
    : 'http://localhost:8000';
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** Normalize annotations parameter safely into an Annotation array */
export function normalizeAnnotations(ann: unknown): Annotation[] {
  if (Array.isArray(ann)) return ann as Annotation[];
  if (typeof ann === 'string') {
    try {
      const parsed = JSON.parse(ann);
      if (Array.isArray(parsed)) return parsed as Annotation[];
    } catch {
      return [];
    }
  }
  return [];
}

/** Shared canvas drawing helper */
export function drawAnnotations(ctx: CanvasRenderingContext2D, rawAnnotations: unknown) {
  const annotations = normalizeAnnotations(rawAnnotations);
  annotations.forEach((ann, i) => {
    if (ann.type === 'highlight' && ann.w != null && ann.h != null) {
      ctx.fillStyle = ann.color + '55';
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = 2.5;
      ctx.fillRect(ann.x, ann.y, ann.w, ann.h);
      ctx.strokeRect(ann.x, ann.y, ann.w, ann.h);
    } else if (ann.type === 'pin') {
      const r = 16;
      ctx.beginPath();
      ctx.arc(ann.x, ann.y, r, 0, Math.PI * 2);
      ctx.fillStyle = ann.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), ann.x, ann.y);
      if (ann.label) {
        const lw = ann.label.length * 8 + 16;
        const lx = ann.x + r + 4;
        const ly = ann.y - 12;
        ctx.fillStyle = ann.color;
        ctx.beginPath();
        ctx.roundRect(lx, ly, lw, 24, 4);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText(ann.label, lx + 8, ly + 12);
      }
    } else if (ann.type === 'freehand' && ann.points && ann.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      ann.points.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  });
}

export const ANNOTATION_COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899'];
