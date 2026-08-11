import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Eraser, Trash2, Undo2, Redo2, Download } from 'lucide-react';

interface DrawingCanvasProps {
  canvasData: string | null;
  onChange: (dataUrl: string) => void;
}

const COLORS = [
  '#f59e0b', '#ef4444', '#3b82f6', '#10b981',
  '#8b5cf6', '#ec4899', '#f97316', '#06b6d4',
  '#ffffff', '#1e293b',
];

const STROKE_WIDTHS = [2, 4, 8, 14];

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({ canvasData, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);

  const [color, setColor] = useState(COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Initialize canvas from saved data or blank
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const init = () => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (canvasData) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0);
        img.src = canvasData;
      }
    };

    // Fit canvas to container
    const resize = () => {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      init();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(containerRef.current!);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    undoStackRef.current = [...undoStackRef.current.slice(-49), ctx.getImageData(0, 0, canvas.width, canvas.height)];
    redoStackRef.current = [];
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    saveSnapshot();
    isDrawingRef.current = true;
    lastPosRef.current = getPos(e);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !lastPosRef.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e);

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = tool === 'eraser' ? '#1e293b' : color;
    ctx.lineWidth = tool === 'eraser' ? strokeWidth * 4 : strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPosRef.current = pos;
  };

  const onPointerUp = () => {
    isDrawingRef.current = false;
    lastPosRef.current = null;
    const canvas = canvasRef.current!;
    onChangeRef.current(canvas.toDataURL('image/png'));
  };

  const undo = useCallback(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    if (undoStackRef.current.length === 0) return;
    redoStackRef.current = [...redoStackRef.current, ctx.getImageData(0, 0, canvas.width, canvas.height)];
    const snapshot = undoStackRef.current.pop()!;
    ctx.putImageData(snapshot, 0, 0);
    onChangeRef.current(canvas.toDataURL('image/png'));
  }, []);

  const redo = useCallback(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    if (redoStackRef.current.length === 0) return;
    undoStackRef.current = [...undoStackRef.current, ctx.getImageData(0, 0, canvas.width, canvas.height)];
    const snapshot = redoStackRef.current.pop()!;
    ctx.putImageData(snapshot, 0, 0);
    onChangeRef.current(canvas.toDataURL('image/png'));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const clearCanvas = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    saveSnapshot();
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChangeRef.current(canvas.toDataURL('image/png'));
  };


  const download = () => {
    const canvas = canvasRef.current!;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'note-drawing.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };


  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-brand-border/50 bg-brand-surface/50 flex-wrap shrink-0">
        {/* Tool toggle */}
        <div className="flex gap-1">
          <button
            onClick={() => setTool('pen')}
            title="Pen"
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${tool === 'pen' ? 'bg-amber-500 text-white' : 'bg-brand-surface-low text-brand-text-muted hover:text-brand-text'}`}
          >
            ✏️ Pen
          </button>
          <button
            onClick={() => setTool('eraser')}
            title="Eraser"
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1 ${tool === 'eraser' ? 'bg-slate-600 text-white' : 'bg-brand-surface-low text-brand-text-muted hover:text-brand-text'}`}
          >
            <Eraser className="w-3 h-3" /> Eraser
          </button>
        </div>

        {/* Stroke width */}
        <div className="flex items-center gap-1">
          {STROKE_WIDTHS.map((w) => (
            <button
              key={w}
              onClick={() => setStrokeWidth(w)}
              title={`Stroke width ${w}px`}
              className={`rounded-full transition-all border-2 ${strokeWidth === w ? 'border-amber-500' : 'border-transparent hover:border-brand-border'}`}
              style={{ width: w + 12, height: w + 12, backgroundColor: color }}
            />
          ))}
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-1 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { setColor(c); setTool('pen'); }}
              className={`rounded-full transition-all border-2 ${color === c && tool === 'pen' ? 'border-white scale-110' : 'border-transparent hover:scale-110'}`}
              style={{ width: 18, height: 18, backgroundColor: c }}
            />
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button onClick={undo} title="Undo" className="p-1.5 rounded-md text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low transition-all">
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={redo} title="Redo" className="p-1.5 rounded-md text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low transition-all">
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={download} title="Download" className="p-1.5 rounded-md text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low transition-all">
            <Download className="w-3.5 h-3.5" />
          </button>
          <button onClick={clearCanvas} title="Clear" className="p-1.5 rounded-md text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden rounded-b-xl">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
    </div>
  );
};
