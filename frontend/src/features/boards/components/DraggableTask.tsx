import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { type Task, type Column } from '../../../services/tasksApi';
import { type User } from '../../../services/usersApi';
import TaskCard from './TaskCard';

interface DraggableTaskProps {
  task: Task;
  columns: Column[];
  users: User[];
  onStatusChange: (columnId: number) => void;
  onDelete: () => void;
  onAssigneeChange: (assignedTo: number | null) => void;
  onOpen: () => void;
  canEdit: boolean;
  canReassign: boolean;
  isMultiSelect?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export const DraggableTask: React.FC<DraggableTaskProps> = ({
  task,
  columns,
  users,
  onStatusChange,
  onDelete,
  onAssigneeChange,
  onOpen,
  canEdit,
  canReassign,
  isMultiSelect,
  isSelected,
  onToggleSelect,
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { task },
    disabled: !canEdit || isMultiSelect,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1, touchAction: 'none' }}
      {...listeners}
      {...attributes}
    >
      <TaskCard
        task={task}
        columns={columns}
        users={users}
        onStatusChange={onStatusChange}
        onDelete={onDelete}
        onAssigneeChange={onAssigneeChange}
        onOpen={onOpen}
        canEdit={canEdit}
        canReassign={canReassign}
        isMultiSelect={isMultiSelect}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
      />
    </div>
  );
};

export default DraggableTask;
