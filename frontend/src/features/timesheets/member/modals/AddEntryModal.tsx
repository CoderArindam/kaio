import React from 'react';
import { type Task } from '../../../../services/tasksApi';
import { ENTRY_TYPE_OPTIONS } from '../../shared/types';
import { Button } from '../../../../components/ui/Button';
import { Modal } from '../../../../components/common/Modal';
import { TaskSearchSelector } from '../../shared/TaskSearchSelector';
import { Select } from '../../../../components/ui/Select';

interface AddEntryModalProps {
  boardName: string;
  onClose: () => void;
  selectedEntryType: string;
  onEntryTypeChange: (val: string) => void;
  selectedTaskId: string;
  onTaskChange: (val: string) => void;
  boardTasks: Task[];
  loadingTasks: boolean;
  onConfirm: () => void;
}

export const AddEntryModal: React.FC<AddEntryModalProps> = ({
  boardName,
  onClose,
  selectedEntryType,
  onEntryTypeChange,
  selectedTaskId,
  onTaskChange,
  boardTasks: _boardTasks,
  loadingTasks: _loadingTasks,
  onConfirm,
}) => (
  <Modal isOpen onClose={onClose} title={`Add Entry to ${boardName}`}>
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-brand-text-muted mb-1">
          Entry Category / Type
        </label>
        <Select
          value={selectedEntryType}
          onChange={(val) => onEntryTypeChange(val)}
          options={ENTRY_TYPE_OPTIONS.map((opt) => ({
            value: opt.value,
            label: opt.label,
          }))}
        />
      </div>

      {selectedEntryType === 'task' && (
        <div>
          <label className="block text-xs font-medium text-brand-text-muted mb-1">
            Select Task * (Assigned to You)
          </label>
          <TaskSearchSelector
            value={selectedTaskId}
            onChange={(tId) => onTaskChange(tId)}
            placeholder="Search your assigned tasks..."
          />
          {!selectedTaskId && (
            <p className="text-[11px] text-amber-500 mt-1 font-medium">
              * Please select a task assigned to you before adding row.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onConfirm}
          disabled={selectedEntryType === 'task' && !selectedTaskId}
          className="disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add Row
        </Button>
      </div>
    </div>
  </Modal>
);
