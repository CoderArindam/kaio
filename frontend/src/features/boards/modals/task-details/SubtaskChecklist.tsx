import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckSquare, Plus, Trash2, GripVertical, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import {
  getSubtasks,
  createSubtask,
  toggleSubtask,
  deleteSubtask,
  reorderSubtasks,
  type Subtask,
} from '../../../../services/subtasksApi';
import { type Task } from '../../../../services/tasksApi';
import { useTaskStore } from '../../../../store/taskStore';

interface SubtaskChecklistProps {
  task: Task;
  canEdit: boolean;
}

interface SortableSubtaskItemProps {
  subtask: Subtask;
  canEdit: boolean;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}

const SortableSubtaskItem: React.FC<SortableSubtaskItemProps> = ({
  subtask,
  canEdit,
  onToggle,
  onDelete,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: subtask.id, disabled: !canEdit });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center justify-between gap-3 p-2.5 rounded-xl border border-transparent hover:border-brand-border hover:bg-brand-surface-low/50 transition-all ${
        isDragging ? 'bg-brand-surface-container shadow-md z-10' : ''
      }`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {canEdit && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="text-brand-outline hover:text-brand-text cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
            title="Drag to reorder"
          >
            <GripVertical size={16} />
          </button>
        )}

        <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={subtask.is_completed}
            disabled={!canEdit}
            onChange={() => onToggle(subtask.id)}
            className="w-4 h-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary cursor-pointer disabled:cursor-not-allowed"
          />
          <span
            className={`text-sm font-medium transition-all truncate ${
              subtask.is_completed
                ? 'line-through text-brand-text-muted opacity-75'
                : 'text-brand-text'
            }`}
          >
            {subtask.title}
          </span>
        </label>
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={() => onDelete(subtask.id)}
          className="opacity-0 group-hover:opacity-100 text-brand-outline hover:text-brand-error p-1 rounded-lg hover:bg-brand-surface-container transition-all"
          title="Delete subtask"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
};

export const SubtaskChecklist: React.FC<SubtaskChecklistProps> = ({ task, canEdit }) => {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  const _updateTaskEntity = useTaskStore((state) => state._updateTaskEntity);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const syncTaskStoreCounts = useCallback(
    (items: Subtask[]) => {
      const total = items.length;
      const completed = items.filter((s) => s.is_completed).length;
      _updateTaskEntity(task.id, () => ({
        subtask_count: total,
        completed_subtask_count: completed,
      }));
    },
    [task.id, _updateTaskEntity]
  );

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    getSubtasks(task.id)
      .then((data) => {
        if (!isMounted) return;
        setSubtasks(data);
        syncTaskStoreCounts(data);
      })
      .catch((err) => {
        console.error('Failed to load subtasks:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [task.id, syncTaskStoreCounts]);

  const handleAddSubtask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const title = newTitle.trim();
    if (!title || isAdding) return;

    setIsAdding(true);
    try {
      const created = await createSubtask(task.id, title);
      const updatedList = [...subtasks, created];
      setSubtasks(updatedList);
      syncTaskStoreCounts(updatedList);
      setNewTitle('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add subtask');
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleSubtask = async (subtaskId: number) => {
    const prevList = [...subtasks];
    const updatedList = subtasks.map((s) =>
      s.id === subtaskId ? { ...s, is_completed: !s.is_completed } : s
    );

    setSubtasks(updatedList);
    syncTaskStoreCounts(updatedList);

    try {
      await toggleSubtask(subtaskId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update subtask');
      setSubtasks(prevList);
      syncTaskStoreCounts(prevList);
    }
  };

  const handleDeleteSubtask = async (subtaskId: number) => {
    const prevList = [...subtasks];
    const updatedList = subtasks.filter((s) => s.id !== subtaskId);

    setSubtasks(updatedList);
    syncTaskStoreCounts(updatedList);

    try {
      await deleteSubtask(subtaskId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete subtask');
      setSubtasks(prevList);
      syncTaskStoreCounts(prevList);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = subtasks.findIndex((item) => item.id === active.id);
    const newIndex = subtasks.findIndex((item) => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(subtasks, oldIndex, newIndex);
    setSubtasks(reordered);

    const orderedIds = reordered.map((item) => item.id);
    reorderSubtasks(task.id, orderedIds).catch((err) => {
      console.error('Failed to save subtask order:', err);
      toast.error('Failed to update subtask order');
      setSubtasks(subtasks); // Rollback
    });
  };

  const completedCount = subtasks.filter((s) => s.is_completed).length;
  const totalCount = subtasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-4 bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-brand-text">
          <CheckSquare size={18} className="text-brand-primary" />
          <h3 className="text-base font-semibold">Subtasks</h3>
        </div>

        {totalCount > 0 && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-surface-low text-brand-text-muted">
            {completedCount}/{totalCount} completed ({progressPercent}%)
          </span>
        )}
      </div>

      {totalCount > 0 && (
        <div className="w-full bg-brand-surface-low h-2 rounded-full overflow-hidden">
          <div
            className="bg-brand-primary h-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-4 text-brand-text-muted gap-2 text-sm">
          <Loader2 size={16} className="animate-spin text-brand-primary" />
          <span>Loading subtasks...</span>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {subtasks.map((subtask) => (
                <SortableSubtaskItem
                  key={subtask.id}
                  subtask={subtask}
                  canEdit={canEdit}
                  onToggle={handleToggleSubtask}
                  onDelete={handleDeleteSubtask}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {canEdit && (
        <form onSubmit={handleAddSubtask} className="flex items-center gap-2 pt-1">
          <div className="relative flex-1">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add a subtask..."
              disabled={isAdding}
              className="w-full px-3.5 py-2 text-sm bg-brand-surface-low border border-brand-border rounded-xl text-brand-text placeholder-brand-text-muted focus:outline-hidden focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={!newTitle.trim() || isAdding}
            className="px-3.5 py-2 bg-brand-primary hover:bg-brand-primary-dark text-white text-sm font-medium rounded-xl flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {isAdding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            <span>Add</span>
          </button>
        </form>
      )}
    </div>
  );
};

export default SubtaskChecklist;
