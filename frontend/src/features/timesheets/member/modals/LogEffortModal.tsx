import React from 'react';
import { type Board } from '../../../../services/boardsApi';
import { type Task } from '../../../../services/tasksApi';
import { ENTRY_TYPE_OPTIONS } from '../../shared/types';
import { toDateStr } from '../../shared/utils';
import { Button } from '../../../../components/ui/Button';
import { Modal } from '../../../../components/common/Modal';
import { TaskSearchSelector } from '../../shared/TaskSearchSelector';
import { Select } from '../../../../components/ui/Select';

interface LogEffortModalProps {
  isOpen: boolean;
  onClose: () => void;
  weekDates: Date[];
  accessibleBoards: Board[];
  boardTasksMap: Record<string, Task[]>;
  loadingTasks: boolean;
  boardId: string;
  onBoardChange: (boardId: string) => void;
  entryType: string;
  onEntryTypeChange: (val: string) => void;
  taskId: string;
  onTaskChange: (val: string) => void;
  date: string;
  onDateChange: (val: string) => void;
  hours: string;
  onHoursChange: (val: string) => void;
  description: string;
  onDescriptionChange: (val: string) => void;
  onSave: () => void;
}

export const LogEffortModal: React.FC<LogEffortModalProps> = ({
  isOpen,
  onClose,
  weekDates,
  accessibleBoards,
  boardTasksMap: _boardTasksMap,
  loadingTasks: _loadingTasks,
  boardId,
  onBoardChange,
  entryType,
  onEntryTypeChange,
  taskId,
  onTaskChange,
  date,
  onDateChange,
  hours,
  onHoursChange,
  description,
  onDescriptionChange,
  onSave,
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Log Effort Under Task / Board">
    <div className="space-y-4">
      {/* Board Selector */}
      <div>
        <label className="block text-xs font-semibold text-brand-text mb-1">
          Project Board * (Your Assigned Boards)
        </label>
        <Select
          value={boardId}
          onChange={(val) => onBoardChange(val)}
          options={[
            { value: 'general', label: '-- General & Time-off --' },
            ...accessibleBoards.map((b) => ({
              value: String(b.id),
              label: `${b.name} (${b.project_key})`,
            })),
          ]}
        />
      </div>

      {/* Category / Type */}
      <div>
        <label className="block text-xs font-semibold text-brand-text mb-1">
          Work Category / Type *
        </label>
        <Select
          value={entryType}
          onChange={(val) => onEntryTypeChange(val)}
          options={ENTRY_TYPE_OPTIONS.map((opt) => ({
            value: opt.value,
            label: opt.label,
          }))}
        />
      </div>

      {/* Task Selector */}
      {entryType === 'task' && boardId !== 'general' && (
        <div>
          <label className="block text-xs font-semibold text-brand-text mb-1">
            Select Task * (Assigned to You on Selected Board)
          </label>
          <TaskSearchSelector
            value={taskId}
            boardId={boardId}
            onChange={(tId) => onTaskChange(tId)}
            placeholder="Search tasks assigned to you on this board..."
          />
          {!taskId && (
            <p className="text-[11px] text-amber-500 mt-1 font-medium">
              * Please select a task assigned to you to log effort.
            </p>
          )}
        </div>
      )}

      {/* Date & Hours */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-brand-text mb-1">Log Date *</label>
          <Select
            value={date}
            onChange={(val) => onDateChange(val)}
            options={weekDates.map((d) => {
              const dStr = toDateStr(d);
              const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              return { value: dStr, label };
            })}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-brand-text mb-1">Hours Spent *</label>
          <input
            type="number"
            step="0.5"
            min="0.5"
            max="24"
            value={hours}
            onChange={(e) => onHoursChange(e.target.value)}
            className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary font-mono transition-colors shadow-sm"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-semibold text-brand-text mb-1">
          Effort Description / Details (Optional)
        </label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="What work was accomplished during these hours?"
          className="w-full bg-brand-surface border border-brand-border rounded-lg p-3 text-sm text-brand-text focus:outline-none focus:border-brand-primary resize-none transition-colors shadow-sm"
        />
      </div>

      <div className="flex justify-end gap-2 pt-3 border-t border-brand-border">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={parseFloat(hours) <= 0 || (entryType === 'task' && boardId !== 'general' && !taskId)}
          className="bg-brand-primary hover:bg-brand-primary-hover text-white font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save Effort Entry
        </Button>
      </div>
    </div>
  </Modal>
);
