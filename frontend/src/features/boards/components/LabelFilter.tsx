import React, { useState, useRef, useEffect } from 'react';
import { Tag, ChevronDown, Check } from 'lucide-react';
import { type Label, getBoardLabels } from '../../../services/labelsApi';

interface LabelFilterProps {
  boardId: number;
  selectedLabelId: number | null;
  onChange: (labelId: number | null) => void;
}

export const LabelFilter: React.FC<LabelFilterProps> = ({ boardId, selectedLabelId, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (boardId) {
      getBoardLabels(boardId)
        .then(setLabels)
        .catch((err) => console.error('Failed to load labels for filter:', err));
    }
  }, [boardId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // WebSocket event listener
  useEffect(() => {
    if (!boardId) return;
    const handleLabelChange = (e: any) => {
      const payload = e.detail;
      if (payload?.board_id === boardId) {
        if (payload.type === 'label_created') {
          setLabels((prev) => {
            if (prev.find((l) => l.id === payload.label.id)) return prev;
            return [...prev, payload.label];
          });
        } else if (payload.type === 'label_updated') {
          setLabels((prev) =>
            prev.map((l) => (l.id === payload.label.id ? payload.label : l))
          );
        } else if (payload.type === 'label_deleted') {
          setLabels((prev) => prev.filter((l) => l.id !== payload.label_id));
        }
      }
    };
    window.addEventListener('kaio:label_changed', handleLabelChange);
    return () => window.removeEventListener('kaio:label_changed', handleLabelChange);
  }, [boardId]);

  const selectedLabel = labels.find((l) => l.id === selectedLabelId);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-brand-border bg-brand-surface text-sm font-medium hover:bg-brand-surface-low transition text-brand-text cursor-pointer"
      >
        <Tag size={16} className="text-brand-text-muted" />
        {selectedLabel ? (
          <span className="flex items-center gap-1.5 font-semibold" style={{ color: selectedLabel.color }}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedLabel.color }} />
            {selectedLabel.name}
          </span>
        ) : (
          <span>All Labels</span>
        )}
        <ChevronDown size={14} className={`text-brand-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 w-52 bg-brand-surface border border-brand-border rounded-xl shadow-lg z-20 py-2">
          <button
            onClick={() => {
              onChange(null);
              setIsOpen(false);
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-brand-surface-low flex items-center justify-between cursor-pointer"
          >
            <span className={selectedLabelId === null ? "text-brand-primary font-medium" : "text-brand-text"}>
              All Labels
            </span>
            {selectedLabelId === null && <Check size={14} className="text-brand-primary" />}
          </button>

          {labels.length > 0 && <div className="my-1 border-t border-brand-border" />}

          {labels.map((label) => {
            const isSelected = selectedLabelId === label.id;
            return (
              <button
                key={label.id}
                onClick={() => {
                  onChange(label.id);
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-brand-surface-low flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                  <span className={`truncate ${isSelected ? 'font-semibold' : ''}`} style={{ color: label.color }}>
                    {label.name}
                  </span>
                </div>
                {isSelected && <Check size={14} className="text-brand-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LabelFilter;
