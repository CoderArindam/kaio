import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  GitMerge,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useTaskStore } from '../../store/taskStore';
import { type Column } from '../../services/tasksApi';
import toast from 'react-hot-toast';

export const ProjectWorkflowSettings: React.FC = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const parsedBoardId = boardId ? parseInt(boardId, 10) : null;

  const {
    getColumnsList,
    getBoardTasksList,
    initializeBoard,
    addColumn,
    renameColumn,
    removeColumn,
    reorderBoardColumns,
    boardView,
  } = useTaskStore();

  const columns = getColumnsList();
  const tasks = getBoardTasksList();
  const isLoading = boardView.isFetching;

  // Add Column Form state
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState<'TODO' | 'IN_PROGRESS' | 'DONE'>('TODO');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit state
  const [editingColumnId, setEditingColumnId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  // Delete modal state
  const [columnToDelete, setColumnToDelete] = useState<{ id: number; name: string; taskCount: number } | null>(null);
  const [targetColumnIdForDelete, setTargetColumnIdForDelete] = useState<number | ''>('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (parsedBoardId && columns.length === 0) {
      initializeBoard(parsedBoardId);
    }
  }, [parsedBoardId, initializeBoard, columns.length]);

  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedBoardId || !newColumnName.trim()) return;

    setIsSubmitting(true);
    try {
      await addColumn(parsedBoardId, {
        name: newColumnName.trim(),
        column_type: newColumnType,
      });
      toast.success(`Column "${newColumnName.trim()}" added successfully`);
      setNewColumnName('');
      setNewColumnType('TODO');
      setIsAddingColumn(false);
    } catch {
      toast.error('Failed to add column');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveRename = async (columnId: number) => {
    if (!editingName.trim()) {
      setEditingColumnId(null);
      return;
    }
    try {
      await renameColumn(columnId, { name: editingName.trim() });
      toast.success('Column renamed');
    } catch {
      toast.error('Failed to rename column');
    } finally {
      setEditingColumnId(null);
    }
  };

  const handleChangeType = async (columnId: number, newType: 'TODO' | 'IN_PROGRESS' | 'DONE') => {
    try {
      await renameColumn(columnId, { column_type: newType });
      toast.success('Column status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleMoveColumn = async (currentIndex: number, delta: number) => {
    if (!parsedBoardId) return;
    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= columns.length) return;

    const newOrderedIds = columns.map((c) => c.id);
    const [movedColId] = newOrderedIds.splice(currentIndex, 1);
    newOrderedIds.splice(targetIndex, 0, movedColId);

    try {
      await reorderBoardColumns(parsedBoardId, newOrderedIds);
      toast.success('Column order updated');
    } catch {
      toast.error('Failed to reorder columns');
    }
  };

  const handleConfirmDelete = async () => {
    if (!columnToDelete) return;
    let targetId = Number(targetColumnIdForDelete);
    if (!targetId) {
      const fallbackCol = columns.find((c) => c.id !== columnToDelete.id);
      if (fallbackCol) targetId = fallbackCol.id;
    }

    if (!targetId) {
      toast.error('Cannot delete the only remaining column.');
      return;
    }

    setIsDeleting(true);
    try {
      await removeColumn(columnToDelete.id, targetId);
      toast.success(`Column "${columnToDelete.name}" deleted`);
      setColumnToDelete(null);
      setTargetColumnIdForDelete('');
    } catch {
      toast.error('Failed to delete column');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading && columns.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-brand-text-muted">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary opacity-60 mr-3" />
        <span>Loading workflow settings...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-brand-border/60">
        <div>
          <h2 className="text-xl font-bold text-brand-text flex items-center gap-2.5">
            <GitMerge className="text-brand-primary" size={22} />
            <span>Workflow & Board Columns</span>
          </h2>
          <p className="text-sm text-brand-text-muted mt-1">
            Customize status columns, reorder workflow stages, and control how tasks flow through your board.
          </p>
        </div>

        <button
          onClick={() => setIsAddingColumn(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-white text-sm font-semibold rounded-xl transition-all cursor-pointer shadow-sm hover:shadow shrink-0"
        >
          <Plus size={18} />
          <span>Add Column</span>
        </button>
      </div>

      {/* Add Column Form */}
      {isAddingColumn && (
        <form
          onSubmit={handleAddColumn}
          className="p-5 bg-brand-surface border border-brand-border rounded-2xl shadow-lg space-y-4 animate-in fade-in-50 duration-150"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-brand-text text-sm">Create New Column</h3>
            <button
              type="button"
              onClick={() => {
                setIsAddingColumn(false);
                setNewColumnName('');
              }}
              className="text-brand-text-muted hover:text-brand-text p-1 rounded-lg hover:bg-brand-surface-low cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-brand-text-muted mb-1.5">Column Name</label>
              <input
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="e.g. Code Review, Testing..."
                autoFocus
                className="w-full px-3.5 py-2 bg-brand-surface-low border border-brand-border rounded-xl text-sm text-brand-text focus:outline-none focus:border-brand-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-brand-text-muted mb-1.5">Column Category (Type)</label>
              <select
                value={newColumnType}
                onChange={(e) => setNewColumnType(e.target.value as any)}
                className="w-full px-3.5 py-2 bg-brand-surface-low border border-brand-border rounded-xl text-sm text-brand-text focus:outline-none focus:border-brand-primary cursor-pointer"
              >
                <option value="TODO">To Do (Open Tasks)</option>
                <option value="IN_PROGRESS">In Progress (Active Work)</option>
                <option value="DONE">Done (Completed)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsAddingColumn(false);
                setNewColumnName('');
              }}
              className="px-4 py-2 text-xs font-medium text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newColumnName.trim() || isSubmitting}
              className="px-4 py-2 text-xs font-semibold bg-brand-primary text-white hover:bg-brand-primary-hover rounded-xl disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              <span>Save Column</span>
            </button>
          </div>
        </form>
      )}

      {/* Columns List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-brand-text-muted px-1 uppercase tracking-wider">
          <span>Column Order & Details ({columns.length})</span>
          <span>Actions</span>
        </div>

        <div className="space-y-2.5">
          {columns.map((column: Column, idx: number) => {
            const columnTasks = tasks.filter((t: any) => t.column_id === column.id);
            const isEditing = editingColumnId === column.id;

            return (
              <div
                key={column.id}
                className="group bg-brand-surface border border-brand-border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs hover:border-brand-border/80 transition-all"
              >
                <div className="flex items-center gap-3.5 flex-1 min-w-0">
                  {/* Reorder Buttons */}
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      disabled={idx === 0}
                      onClick={() => handleMoveColumn(idx, -1)}
                      className="p-1 hover:bg-brand-surface-low rounded text-brand-text-muted disabled:opacity-20 cursor-pointer"
                      title="Move Up"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      disabled={idx === columns.length - 1}
                      onClick={() => handleMoveColumn(idx, 1)}
                      className="p-1 hover:bg-brand-surface-low rounded text-brand-text-muted disabled:opacity-20 cursor-pointer"
                      title="Move Down"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>

                  {/* Status Indicator */}
                  <div
                    className={`w-3 h-3 rounded-full shrink-0 ${
                      column.column_type === 'DONE'
                        ? 'bg-emerald-500 shadow-xs'
                        : column.column_type === 'IN_PROGRESS'
                        ? 'bg-amber-500 shadow-xs'
                        : 'bg-brand-primary shadow-xs'
                    }`}
                  />

                  {/* Column Name / Rename input */}
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1 max-w-sm">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(column.id);
                          if (e.key === 'Escape') setEditingColumnId(null);
                        }}
                        autoFocus
                        className="w-full px-3 py-1.5 text-sm bg-brand-surface-low border border-brand-border rounded-xl text-brand-text focus:outline-none focus:border-brand-primary"
                      />
                      <button
                        onClick={() => handleSaveRename(column.id)}
                        className="p-1.5 hover:bg-emerald-500/10 rounded-lg text-emerald-500 cursor-pointer"
                        title="Save"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={() => setEditingColumnId(null)}
                        className="p-1.5 hover:bg-brand-surface-low rounded-lg text-brand-text-muted cursor-pointer"
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 min-w-0">
                      <h4 className="font-bold text-sm text-brand-text truncate">
                        {column.name}
                      </h4>
                      <button
                        onClick={() => {
                          setEditingColumnId(column.id);
                          setEditingName(column.name);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-brand-text-muted hover:text-brand-text rounded hover:bg-brand-surface-low transition-opacity cursor-pointer"
                        title="Rename Column"
                      >
                        <Edit2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Right Metadata & Controls */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-brand-border/40">
                  {/* Task Count Badge */}
                  <span className="px-2.5 py-1 bg-brand-surface-low border border-brand-border rounded-lg text-xs font-medium text-brand-text-muted">
                    {columnTasks.length} {columnTasks.length === 1 ? 'task' : 'tasks'}
                  </span>

                  {/* Type Select */}
                  <select
                    value={column.column_type}
                    onChange={(e) =>
                      handleChangeType(column.id, e.target.value as 'TODO' | 'IN_PROGRESS' | 'DONE')
                    }
                    className="px-2.5 py-1 text-xs font-semibold bg-brand-surface-low border border-brand-border rounded-lg text-brand-text focus:outline-none cursor-pointer"
                  >
                    <option value="TODO">TODO</option>
                    <option value="IN_PROGRESS">IN_PROGRESS</option>
                    <option value="DONE">DONE</option>
                  </select>

                  {/* Delete Button */}
                  <button
                    disabled={columns.length <= 1}
                    onClick={() => {
                      const target = columns.find((c) => c.id !== column.id);
                      setTargetColumnIdForDelete(target ? target.id : '');
                      setColumnToDelete({
                        id: column.id,
                        name: column.name,
                        taskCount: columnTasks.length,
                      });
                    }}
                    className="p-1.5 text-brand-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-20 cursor-pointer"
                    title={columns.length <= 1 ? 'Cannot delete the only column' : 'Delete Column'}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delete Column Dialog */}
      {columnToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-50 duration-150">
          <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-500">
              <div className="p-2.5 rounded-full bg-red-500/10">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand-text">Delete "{columnToDelete.name}" Column</h3>
            </div>

            {columnToDelete.taskCount > 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-brand-text-muted">
                  This column currently contains <strong className="text-brand-text">{columnToDelete.taskCount}</strong> tasks. Select a column to move these tasks to before deleting:
                </p>
                <select
                  value={targetColumnIdForDelete}
                  onChange={(e) => setTargetColumnIdForDelete(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-brand-surface-low border border-brand-border rounded-xl text-sm text-brand-text focus:outline-none focus:border-brand-primary"
                >
                  {columns
                    .filter((c) => c.id !== columnToDelete.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        Move to {c.name} ({c.column_type})
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <p className="text-sm text-brand-text-muted">
                Are you sure you want to delete this column? This action cannot be undone.
              </p>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t border-brand-border/60">
              <button
                onClick={() => setColumnToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl disabled:opacity-50 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {isDeleting && <Loader2 size={14} className="animate-spin" />}
                <span>Delete Column</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
