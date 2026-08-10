import React from 'react';
import {
  Clock,
  MoreVertical,
  MoveLeft,
  MoveRight,
  Edit2,
  Check,
  X,
  Trash2,
} from 'lucide-react';
import { type Column } from '../../../services/tasksApi';

interface ColumnHeaderProps {
  column: Column;
  colIdx: number;
  totalColumns: number;
  taskCount: number;
  estimatedHours: number;
  canManage: boolean;
  isEditing: boolean;
  editingName: string;
  isMenuOpen: boolean;
  onEditingNameChange: (name: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onToggleMenu: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onChangeType: (type: 'TODO' | 'IN_PROGRESS' | 'DONE') => void;
  onDeleteRequest: () => void;
}

export const ColumnHeader: React.FC<ColumnHeaderProps> = ({
  column,
  colIdx,
  totalColumns,
  taskCount,
  estimatedHours,
  canManage,
  isEditing,
  editingName,
  isMenuOpen,
  onEditingNameChange,
  onSaveRename,
  onCancelRename,
  onStartRename,
  onToggleMenu,
  onMoveLeft,
  onMoveRight,
  onChangeType,
  onDeleteRequest,
}) => {
  return (
    <div className="sticky top-0 z-10 bg-brand-surface border-b border-brand-border/40 px-3 sm:px-3.5 py-2.5 rounded-t-2xl flex justify-between items-center shadow-xs">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
          style={{
            backgroundColor:
              column.color ||
              (column.column_type === 'DONE'
                ? '#10B981'
                : column.column_type === 'IN_PROGRESS'
                ? '#F59E0B'
                : '#3B82F6'),
          }}
        />
        {isEditing ? (
          <div className="flex items-center gap-1.5 flex-1 mr-2">
            <input
              type="text"
              value={editingName}
              onChange={(e) => onEditingNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveRename();
                if (e.key === 'Escape') onCancelRename();
              }}
              autoFocus
              className="w-full px-2 py-1 text-sm bg-brand-surface-low border border-brand-border rounded text-brand-text focus:outline-none focus:border-brand-primary"
            />
            <button
              onClick={onSaveRename}
              className="p-1 hover:bg-brand-surface-container rounded text-emerald-500 cursor-pointer"
              title="Save"
            >
              <Check size={14} />
            </button>
            <button
              onClick={onCancelRename}
              className="p-1 hover:bg-brand-surface-container rounded text-brand-text-muted cursor-pointer"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <h3
            onDoubleClick={canManage ? onStartRename : undefined}
            className={`font-bold text-xs sm:text-sm tracking-wide text-brand-text uppercase truncate ${
              canManage ? 'cursor-pointer hover:text-brand-primary' : ''
            }`}
            title={canManage ? 'Double-click to rename' : undefined}
          >
            {column.name}
          </h3>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {estimatedHours > 0 && (
          <span
            className="px-2 py-0.5 rounded-full bg-brand-surface-low text-brand-text-muted border border-brand-border text-xs font-semibold shrink-0 flex items-center gap-1"
            title="Total Estimated Hours for Column"
          >
            <Clock size={11} className="text-brand-primary" />
            {estimatedHours % 1 === 0 ? estimatedHours : estimatedHours.toFixed(1)}h
          </span>
        )}
        <span className="px-2.5 py-0.5 rounded-full bg-brand-surface-low text-brand-text-muted border border-brand-border text-xs font-semibold shrink-0">
          {taskCount}
        </span>

        {canManage && (
          <div className="relative">
            <button
              onClick={onToggleMenu}
              className="p-1 text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low rounded-lg transition-colors cursor-pointer"
            >
              <MoreVertical size={16} />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-brand-surface border border-brand-border rounded-xl shadow-xl z-30 py-1 text-sm">
                <button
                  onClick={onStartRename}
                  className="w-full text-left px-3 py-2 hover:bg-brand-surface-low flex items-center gap-2 text-brand-text cursor-pointer"
                >
                  <Edit2 size={14} />
                  <span>Rename</span>
                </button>

                <div className="px-3 py-1.5 border-t border-brand-border text-xs text-brand-text-muted font-medium">
                  Column Type
                </div>
                {(['TODO', 'IN_PROGRESS', 'DONE'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => onChangeType(type)}
                    className={`w-full text-left px-4 py-1.5 text-xs flex items-center justify-between hover:bg-brand-surface-low cursor-pointer ${
                      column.column_type === type ? 'text-brand-primary font-semibold' : 'text-brand-text'
                    }`}
                  >
                    <span>{type}</span>
                    {column.column_type === type && <Check size={12} />}
                  </button>
                ))}

                <div className="border-t border-brand-border my-1" />

                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-xs text-brand-text-muted font-medium">Move</span>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={colIdx === 0}
                      onClick={onMoveLeft}
                      className="p-1 hover:bg-brand-surface-low rounded disabled:opacity-30 cursor-pointer"
                      title="Move left"
                    >
                      <MoveLeft size={14} />
                    </button>
                    <button
                      disabled={colIdx === totalColumns - 1}
                      onClick={onMoveRight}
                      className="p-1 hover:bg-brand-surface-low rounded disabled:opacity-30 cursor-pointer"
                      title="Move right"
                    >
                      <MoveRight size={14} />
                    </button>
                  </div>
                </div>

                <div className="border-t border-brand-border my-1" />

                <button
                  disabled={totalColumns <= 1}
                  onClick={onDeleteRequest}
                  className="w-full text-left px-3 py-2 hover:bg-red-500/10 text-red-500 flex items-center gap-2 disabled:opacity-40 cursor-pointer"
                >
                  <Trash2 size={14} />
                  <span>Delete Column</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ColumnHeader;
