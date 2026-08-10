import React from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { type Column } from '../../../services/tasksApi';

interface BulkActionBarProps {
  selectedCount: number;
  columns: Column[];
  bulkTargetColumnId: number | '';
  isBulkMoving: boolean;
  isBulkDeleting: boolean;
  canDelete: boolean;
  onTargetColumnChange: (value: number | '') => void;
  onMove: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  columns,
  bulkTargetColumnId,
  isBulkMoving,
  isBulkDeleting,
  canDelete,
  onTargetColumnChange,
  onMove,
  onDelete,
  onClearSelection,
}) => {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] bg-brand-surface border border-brand-border shadow-2xl rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 animate-in slide-in-from-bottom-5 duration-200">
      <span className="text-xs font-semibold text-brand-text">
        {selectedCount} task{selectedCount !== 1 ? 's' : ''} selected
      </span>
      <div className="h-4 w-[1px] bg-brand-border" />
      <select
        value={bulkTargetColumnId}
        onChange={(e) => onTargetColumnChange(e.target.value ? Number(e.target.value) : '')}
        className="bg-brand-surface-low text-brand-text text-xs border border-brand-border rounded-lg px-3 py-1.5 focus:outline-none"
      >
        <option value="">Move to column...</option>
        {columns.map((col) => (
          <option key={col.id} value={col.id}>
            {col.name}
          </option>
        ))}
      </select>
      <button
        disabled={!bulkTargetColumnId || isBulkMoving || isBulkDeleting}
        onClick={onMove}
        className="bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
      >
        {isBulkMoving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Move
      </button>

      {canDelete && (
        <button
          disabled={isBulkDeleting || isBulkMoving}
          onClick={onDelete}
          className="bg-brand-error hover:bg-red-700 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          {isBulkDeleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Trash2 className="w-3.5 h-3.5" />
          )}
          Delete ({selectedCount})
        </button>
      )}

      <button
        onClick={onClearSelection}
        className="text-brand-text-muted hover:text-brand-text text-xs px-2 py-1 transition-colors cursor-pointer"
      >
        Clear selection
      </button>
    </div>
  );
};

export default BulkActionBar;
