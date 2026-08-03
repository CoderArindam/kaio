import React, { useState, useEffect, useRef } from 'react';
import { Tag, Plus, Check, Trash2, X, Loader2 } from 'lucide-react';
import { type Label, getBoardLabels, createLabel, deleteLabel, attachLabel, detachLabel } from '../../services/labelsApi';
import { type Task } from '../../services/tasksApi';
import { useTaskStore } from '../../store/taskStore';
import toast from 'react-hot-toast';

interface LabelPickerProps {
  task?: Task;
  boardId?: number;
  selectedLabelIds?: number[];
  onChangeSelectedLabelIds?: (labelIds: number[]) => void;
  canEdit?: boolean;
}

const PRESET_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#64748B', // Slate
];

export const LabelPicker: React.FC<LabelPickerProps> = ({
  task,
  boardId: propBoardId,
  selectedLabelIds = [],
  onChangeSelectedLabelIds,
  canEdit = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [boardLabels, setBoardLabels] = useState<Label[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { _updateTaskEntity } = useTaskStore();

  const effectiveBoardId = task?.board_id || propBoardId;

  // Attached labels calculation
  const attachedLabels: Label[] = task
    ? task.labels || []
    : boardLabels.filter((l) => selectedLabelIds.includes(l.id));

  const fetchLabels = async () => {
    if (!effectiveBoardId) return;
    setIsLoading(true);
    try {
      const labels = await getBoardLabels(effectiveBoardId);
      setBoardLabels(labels);
    } catch (err) {
      console.error('Failed to load board labels:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen || (!task && effectiveBoardId)) {
      fetchLabels();
    }
  }, [isOpen, effectiveBoardId]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleAttach = async (label: Label, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!canEdit) return;

    if (task) {
      // Live Task Mode
      const isAttached = (task.labels || []).some((l) => l.id === label.id);
      const updated = isAttached
        ? (task.labels || []).filter((l) => l.id !== label.id)
        : [...(task.labels || []), label];

      // Optimistic update
      _updateTaskEntity(task.id, () => ({ labels: updated }));

      try {
        if (isAttached) {
          await detachLabel(task.id, label.id);
        } else {
          await attachLabel(task.id, label.id);
        }
      } catch (err) {
        // Rollback on error
        _updateTaskEntity(task.id, () => ({ labels: task.labels || [] }));
        toast.error('Failed to update task label');
      }
    } else if (onChangeSelectedLabelIds) {
      // Creation Mode
      const isAttached = selectedLabelIds.includes(label.id);
      const updated = isAttached
        ? selectedLabelIds.filter((id) => id !== label.id)
        : [...selectedLabelIds, label.id];
      onChangeSelectedLabelIds(updated);
    }
  };

  const handleCreateLabel = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!newLabelName.trim() || !effectiveBoardId) return;

    try {
      const created = await createLabel(effectiveBoardId, {
        name: newLabelName.trim(),
        color: selectedColor,
      });
      setBoardLabels((prev) => [...prev, created]);
      setNewLabelName('');
      setIsCreating(false);

      // Automatically select / attach newly created label
      await handleToggleAttach(created);
      toast.success(`Label "${created.name}" created`);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to create label';
      toast.error(msg);
    }
  };

  const handleDeleteLabel = async (labelId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canEdit) return;
    if (!window.confirm('Delete this label from the entire board?')) return;

    try {
      await deleteLabel(labelId);
      setBoardLabels((prev) => prev.filter((l) => l.id !== labelId));

      if (task) {
        const updated = (task.labels || []).filter((l) => l.id !== labelId);
        _updateTaskEntity(task.id, () => ({ labels: updated }));
      } else if (onChangeSelectedLabelIds) {
        onChangeSelectedLabelIds(selectedLabelIds.filter((id) => id !== labelId));
      }
      toast.success('Label deleted');
    } catch (err) {
      toast.error('Failed to delete label');
    }
  };

  return (
    <div className="relative" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
      {/* Attached Label Pills display */}
      <div className="flex gap-2 flex-wrap items-center">
        {attachedLabels.map((label) => (
          <span
            key={label.id}
            style={{
              backgroundColor: `${label.color}15`,
              borderColor: `${label.color}40`,
              color: label.color,
            }}
            className="px-2.5 py-1 rounded-md text-xs font-semibold border flex items-center gap-1.5 transition-all shadow-xs"
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: label.color }} />
            {label.name}
            {canEdit && (
              <button
                type="button"
                onClick={(e) => handleToggleAttach(label, e)}
                className="hover:opacity-75 focus:outline-hidden cursor-pointer"
                title="Remove label"
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}

        {canEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
            className="px-2.5 py-1 rounded-md bg-brand-surface-low border border-brand-border text-xs text-brand-text hover:bg-brand-surface-container transition flex items-center gap-1 cursor-pointer font-medium"
          >
            <Plus size={13} /> {attachedLabels.length === 0 ? "Add Label" : "Edit Labels"}
          </button>
        )}
      </div>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 bg-brand-surface border border-brand-border rounded-xl shadow-xl z-50 p-3 flex flex-col gap-3 text-brand-text">
          <div className="flex items-center justify-between pb-2 border-b border-brand-border">
            <span className="text-xs font-semibold text-brand-text-muted uppercase tracking-wider flex items-center gap-1.5">
              <Tag size={13} /> Board Labels
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="text-brand-text-muted hover:text-brand-text cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-4 text-brand-text-muted text-xs">
              <Loader2 className="animate-spin mr-2" size={14} /> Loading labels...
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {boardLabels.length === 0 && !isCreating && (
                <p className="text-xs text-brand-text-muted text-center py-3">No labels on this board yet.</p>
              )}
              {boardLabels.map((label) => {
                const isAttached = task
                  ? (task.labels || []).some((l) => l.id === label.id)
                  : selectedLabelIds.includes(label.id);
                return (
                  <div
                    key={label.id}
                    onClick={(e) => handleToggleAttach(label, e)}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-brand-surface-low cursor-pointer group text-xs transition"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                      <span className="truncate font-medium">{label.name}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      {isAttached && <Check size={14} className="text-brand-primary shrink-0" />}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteLabel(label.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-brand-text-muted hover:text-red-500 p-1 rounded-sm cursor-pointer"
                          title="Delete label"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Create New Label (No nested <form> element) */}
          {canEdit && (
            <div className="pt-2 border-t border-brand-border">
              {!isCreating ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsCreating(true);
                  }}
                  className="w-full text-xs font-semibold text-brand-primary hover:text-brand-primary-hover flex items-center justify-center gap-1 py-1.5 rounded-lg bg-brand-primary/5 hover:bg-brand-primary/10 transition cursor-pointer"
                >
                  <Plus size={14} /> Create New Label
                </button>
              ) : (
                <div className="space-y-2.5">
                  <input
                    type="text"
                    placeholder="Label name..."
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        handleCreateLabel(e);
                      }
                    }}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-brand-surface-low border border-brand-border focus:border-brand-primary focus:outline-hidden text-brand-text"
                    autoFocus
                  />

                  <div>
                    <span className="text-[10px] uppercase font-semibold text-brand-text-muted block mb-1">Color</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedColor(color);
                          }}
                          style={{ backgroundColor: color }}
                          className={`w-5 h-5 rounded-full transition transform cursor-pointer ${
                            selectedColor === color ? 'ring-2 ring-brand-primary ring-offset-2 scale-110' : 'hover:scale-105'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsCreating(false);
                      }}
                      className="px-2.5 py-1 rounded-md text-xs text-brand-text-muted hover:text-brand-text cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!newLabelName.trim()}
                      onClick={(e) => handleCreateLabel(e)}
                      className="px-3 py-1 rounded-md text-xs bg-brand-primary text-white font-medium hover:bg-brand-primary-hover disabled:opacity-50 cursor-pointer"
                    >
                      Create
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LabelPicker;
