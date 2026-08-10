import React from 'react';
import { type Column } from '../../../services/tasksApi';

interface DeleteColumnDialogProps {
  column: { id: number; name: string; taskCount: number };
  columns: Column[];
  targetColumnId: number | '';
  onTargetColumnChange: (id: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteColumnDialog: React.FC<DeleteColumnDialogProps> = ({
  column,
  columns,
  targetColumnId,
  onTargetColumnChange,
  onCancel,
  onConfirm,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-brand-surface border border-brand-border rounded-2xl shadow-2xl p-6">
        <h3 className="text-lg font-bold text-brand-text mb-2">
          Delete Column "{column.name}"
        </h3>
        {column.taskCount > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-brand-text-muted">
              This column currently contains{' '}
              <strong className="text-brand-text">{column.taskCount}</strong> task card(s). Select a
              destination column to migrate all existing cards into before deleting:
            </p>
            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">
                Destination Column
              </label>
              <select
                value={targetColumnId}
                onChange={(e) => onTargetColumnChange(Number(e.target.value))}
                className="w-full px-3 py-2 bg-brand-surface-low border border-brand-border rounded-xl text-sm text-brand-text focus:outline-none focus:border-brand-primary cursor-pointer"
              >
                {columns
                  .filter((c) => c.id !== column.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.column_type})
                    </option>
                  ))}
              </select>
            </div>
          </div>
        ) : (
          <p className="text-sm text-brand-text-muted">
            Are you sure you want to delete this column? This action will soft-delete the column.
          </p>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-brand-text-muted hover:bg-brand-surface-low rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={column.taskCount > 0 && !targetColumnId}
            className="px-4 py-2 text-sm bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {column.taskCount > 0 ? 'Migrate Cards & Delete' : 'Delete Column'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteColumnDialog;
