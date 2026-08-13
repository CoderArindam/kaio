import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, RotateCcw, Undo, Redo, Pencil, Move, Trash2, Check } from 'lucide-react';
import { type Annotation } from './ImageAnnotator';
import { normalizeAnnotations, drawAnnotations, ANNOTATION_COLORS } from './annotationUtils';

type AnnotationTool = 'pin' | 'highlight' | 'freehand';

interface AnnotationModalProps {
  imageUrl: string;
  annotations: Annotation[];
  onClose: () => void;
  onSave: (annotations: Annotation[]) => void;
}

export const AnnotationModal: React.FC<AnnotationModalProps> = ({
  imageUrl,
  annotations: rawAnnotations,
  onClose,
  onSave,
}) => {
  const initialAnnotations = normalizeAnnotations(rawAnnotations);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [history, setHistory] = useState<Annotation[][]>([initialAnnotations]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const annotations = normalizeAnnotations(history[historyIndex]);

  const setAnnotations = useCallback(
    (updater: Annotation[] | ((prev: Annotation[]) => Annotation[])) => {
      const newAnnotations = typeof updater === 'function' ? updater(annotations) : updater;
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newAnnotations);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [annotations, history, historyIndex]
  );

  const [activeTool, setActiveTool] = useState<AnnotationTool>('pin');
  const [activeColor, setActiveColor] = useState(ANNOTATION_COLORS[0]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPoints, setCurrentPoints] = useState<{ x: number; y: number }[]>([]);
  const [zoom, setZoom] = useState(1);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          setHistoryIndex((prev) => Math.min(history.length - 1, prev + 1));
        } else {
          setHistoryIndex((prev) => Math.max(0, prev - 1));
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        setHistoryIndex((prev) => Math.min(history.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, history.length]);

  const redrawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const img = containerRef.current?.querySelector('img');
    if (!canvas || !img || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const width = img.naturalWidth || rect.width;
    const height = img.naturalHeight || rect.height;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
    drawAnnotations(ctx, annotations);
  }, [annotations]);

  useEffect(() => { redrawOverlay(); }, [redrawOverlay]);

  const getPos = (e: React.PointerEvent) => {
    const canvas = overlayCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const pos = getPos(e);
    setIsDrawing(true);
    setStartPos(pos);
    if (activeTool === 'freehand') setCurrentPoints([pos]);

    if (activeTool === 'pin') {
      const newId = crypto.randomUUID();
      const newAnn: Annotation = {
        id: newId,
        type: 'pin',
        x: pos.x,
        y: pos.y,
        color: activeColor,
      };
      setAnnotations((prev) => [...prev, newAnn]);
      setIsDrawing(false);
      setEditingPinId(newId);
      setEditLabel("");
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || !startPos) return;
    const pos = getPos(e);
    const ctx = overlayCanvasRef.current!.getContext('2d')!;

    if (activeTool === 'highlight') {
      redrawOverlay();
      ctx.fillStyle = activeColor + '55';
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = 2.5;
      ctx.fillRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
      ctx.strokeRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
    } else if (activeTool === 'freehand') {
      setCurrentPoints((pts) => {
        const next = [...pts, pos];
        redrawOverlay();
        ctx.beginPath();
        ctx.moveTo(next[0].x, next[0].y);
        next.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        return next;
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing || !startPos) return;
    const pos = getPos(e);
    setIsDrawing(false);

    if (activeTool === 'highlight') {
      setAnnotations((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'highlight',
          x: startPos.x,
          y: startPos.y,
          w: pos.x - startPos.x,
          h: pos.y - startPos.y,
          color: activeColor,
        },
      ]);
    } else if (activeTool === 'freehand' && currentPoints.length > 1) {
      setAnnotations((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: 'freehand',
          x: startPos.x,
          y: startPos.y,
          color: activeColor,
          points: currentPoints,
        },
      ]);
      setCurrentPoints([]);
    }
    setStartPos(null);
  };

  const handleSave = () => {
    onSave(annotations);
    onClose();
  };

  const handlePinDragStart = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingPinId(id);
    e.currentTarget.setPointerCapture(e.pointerId);
    setAnnotations(annotations);
  };

  const handlePinDragMove = (e: React.PointerEvent) => {
    if (draggingPinId) {
      e.stopPropagation();
      const pos = getPos(e);
      setHistory((prev) => {
        const newHistory = [...prev];
        const lastIdx = newHistory.length - 1;
        newHistory[lastIdx] = newHistory[lastIdx].map((a) =>
          a.id === draggingPinId ? { ...a, x: pos.x, y: pos.y } : a
        );
        return newHistory;
      });
    }
  };

  const handlePinDragEnd = (e: React.PointerEvent) => {
    if (draggingPinId) {
      e.stopPropagation();
      setDraggingPinId(null);
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handlePinEdit = (id: string, currentLabel?: string) => {
    setEditingPinId(id);
    setEditLabel(currentLabel ?? '');
  };

  const savePinLabel = () => {
    if (editingPinId) {
      setAnnotations((prev) =>
        prev.map((a) => (a.id === editingPinId ? { ...a, label: editLabel.trim() || undefined } : a))
      );
    }
    setEditingPinId(null);
  };

  const handlePinDelete = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  const toolCursor =
    activeTool === 'pin' ? 'cursor-crosshair' : activeTool === 'highlight' ? 'cursor-cell' : 'cursor-crosshair';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal panel */}
      <div className="relative z-10 flex flex-col w-full h-full" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-brand-surface/90 border-b border-brand-border shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-[14px] font-semibold text-brand-text">Annotate Image</span>

            {/* Tool buttons */}
            <div className="flex gap-1 ml-4">
              {([
                { key: 'pin' as AnnotationTool, label: '📍 Pin' },
                { key: 'highlight' as AnnotationTool, label: '□ Highlight' },
                { key: 'freehand' as AnnotationTool, label: '✏️ Draw' },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTool(key)}
                  className={`px-3 py-1 rounded-lg text-[12px] font-medium transition-all ${
                    activeTool === key
                      ? 'bg-amber-500 text-white'
                      : 'bg-brand-surface-low text-brand-text-muted hover:text-brand-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Color swatches */}
            <div className="flex items-center gap-1 ml-2">
              {ANNOTATION_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setActiveColor(c)}
                  className={`rounded-full border-2 transition-all ${
                    activeColor === c ? 'border-white scale-125' : 'border-transparent hover:scale-110'
                  }`}
                  style={{ width: 18, height: 18, backgroundColor: c }}
                />
              ))}
            </div>

            {/* Zoom controls */}
            <div className="flex items-center gap-1 ml-3">
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                className="p-1 rounded text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[11px] text-brand-text-muted w-10 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
                className="p-1 rounded text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoom(1)}
                className="p-1 rounded text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low"
                title="Reset zoom"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {annotations.length > 0 && (
              <button
                onClick={() => setAnnotations([])}
                className="px-3 py-1.5 rounded-lg text-[12px] text-red-400 hover:bg-red-500/10 transition-all"
              >
                Clear all
              </button>
            )}

            <div className="flex items-center gap-1 mx-2 border-l border-brand-border/50 pl-3">
              <button
                onClick={() => setHistoryIndex((prev) => Math.max(0, prev - 1))}
                disabled={historyIndex === 0}
                className="p-1.5 rounded text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Undo (Ctrl+Z)"
              >
                <Undo className="w-4 h-4" />
              </button>
              <button
                onClick={() => setHistoryIndex((prev) => Math.min(history.length - 1, prev + 1))}
                disabled={historyIndex === history.length - 1}
                className="p-1.5 rounded text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Redo (Ctrl+Y)"
              >
                <Redo className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-[12px] text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg text-[12px] font-medium bg-amber-500 text-white hover:bg-amber-600 transition-all"
            >
              Save annotations
            </button>
            <button
              onClick={onClose}
              className="p-2 ml-1 rounded-lg text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low transition-all"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image + annotation canvas */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-6">
          <div
            ref={containerRef}
            className={`relative select-none ${toolCursor}`}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          >
            <img
              src={imageUrl}
              alt="Annotating"
              className="block max-w-none shadow-2xl rounded-lg"
              draggable={false}
              crossOrigin="anonymous"
              style={{ maxWidth: `${100 / zoom}vw`, maxHeight: `${80 / zoom}vh`, objectFit: 'contain' }}
              onLoad={() => redrawOverlay()}
            />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
            {/* Clickable interactive handles for pin annotations */}
            {annotations.map((ann) =>
              ann.type === 'pin' ? (
                <div
                  key={ann.id}
                  onMouseEnter={() => setHoveredId(ann.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                  style={{ left: ann.x, top: ann.y, width: 32, height: 32 }}
                >
                  {(hoveredId === ann.id || draggingPinId === ann.id || editingPinId === ann.id) && (
                    <div className="absolute -top-12 flex items-center gap-1 bg-brand-surface border border-brand-border shadow-lg rounded-lg p-1 animate-in fade-in zoom-in duration-200 cursor-default before:absolute before:-bottom-6 before:left-0 before:right-0 before:h-6 before:bg-transparent">
                      {editingPinId === ann.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') savePinLabel();
                              if (e.key === 'Escape') setEditingPinId(null);
                            }}
                            className="w-32 px-2 py-1 text-[12px] bg-brand-surface-low border border-brand-border rounded outline-none focus:border-amber-500 text-brand-text"
                            placeholder="Label..."
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); savePinLabel(); }}
                            className="p-1.5 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
                            title="Save"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onPointerDown={(e) => handlePinDragStart(e, ann.id)}
                            onPointerMove={handlePinDragMove}
                            onPointerUp={handlePinDragEnd}
                            onPointerCancel={handlePinDragEnd}
                            className="p-1.5 rounded-md text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low transition-colors cursor-move"
                            title="Move pin"
                          >
                            <Move className="w-3.5 h-3.5 pointer-events-none" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handlePinEdit(ann.id, ann.label); }}
                            className="p-1.5 rounded-md text-brand-text-muted hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
                            title="Edit label"
                          >
                            <Pencil className="w-3.5 h-3.5 pointer-events-none" />
                          </button>
                          <div className="w-px h-4 bg-brand-border mx-0.5" />
                          <button
                            onClick={(e) => { e.stopPropagation(); handlePinDelete(ann.id); }}
                            className="p-1.5 rounded-md text-brand-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            title="Delete pin"
                          >
                            <Trash2 className="w-3.5 h-3.5 pointer-events-none" />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : null
            )}
          </div>
        </div>

        {/* Annotation list sidebar */}
        {annotations.length > 0 && (
          <div className="absolute right-0 top-14 bottom-0 w-52 bg-brand-surface/95 border-l border-brand-border overflow-y-auto p-3 flex flex-col gap-2">
            <p className="text-[11px] font-semibold text-brand-text-muted uppercase tracking-wide mb-1">
              Annotations ({annotations.length})
            </p>
            {annotations.map((ann, i) => (
              <div key={ann.id} className="flex items-center gap-2 p-2 rounded-lg bg-brand-surface-low group">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ann.color }} />
                <span className="text-[11px] text-brand-text flex-1 truncate">
                  {ann.type === 'pin'
                    ? `Pin ${i + 1}${ann.label ? `: ${ann.label}` : ''}`
                    : ann.type === 'highlight'
                    ? 'Highlight'
                    : 'Freehand'}
                </span>
                <button
                  onClick={() => setAnnotations((prev) => prev.filter((a) => a.id !== ann.id))}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-red-400 hover:text-red-500 transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default AnnotationModal;
