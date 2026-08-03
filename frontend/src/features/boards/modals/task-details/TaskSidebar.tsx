import React from 'react';
import { type Task, type Column } from '../../../../services/tasksApi';
import { type User } from '../../../../services/usersApi';
import { useTaskStore } from '../../../../store/taskStore';
import StatusSelector from '../../../../components/shared/StatusSelector';
import AssigneeSelector from '../../../../components/shared/AssigneeSelector';
import PrioritySelector from '../../../../components/shared/PrioritySelector';
import DueDatePicker from '../../../../components/shared/DueDatePicker';
import LabelPicker from '../../../../components/shared/LabelPicker';

interface TaskSidebarProps {
  task: Task;
  columns: Column[];
  boardMembers: User[];
  canEdit: boolean;
  createdDate: string;
}

const TaskSidebar: React.FC<TaskSidebarProps> = ({ task, columns, boardMembers, canEdit, createdDate }) => {
  const { updateTaskData, moveTask, assignTask } = useTaskStore();

  return (
    <aside className="w-80 p-8 bg-brand-surface border-l border-brand-border space-y-6 shrink-0 overflow-y-auto">
      <div>
        <p className="text-xs font-semibold text-brand-text-muted mb-2 uppercase tracking-wider">Status</p>
        <StatusSelector 
          columnId={task.column_id} 
          columns={columns} 
          onChange={(newColumnId: number) => moveTask(task.id, newColumnId)} 
          disabled={!canEdit}
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-brand-text-muted mb-2 uppercase tracking-wider">Assignee</p>
        <AssigneeSelector 
          assigneeId={task.assigned_to} 
          users={boardMembers} 
          onChange={(newAssignee: number | null) => assignTask(task.id, newAssignee)} 
          disabled={!canEdit}
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-brand-text-muted mb-2 uppercase tracking-wider">Priority</p>
        <PrioritySelector 
          priority={task.priority || "Medium"} 
          onChange={(newPriority: string) => updateTaskData(task.id, { priority: newPriority })} 
          disabled={!canEdit}
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-brand-text-muted mb-2 uppercase tracking-wider">Due Date</p>
        <DueDatePicker 
          dueDate={task.due_date} 
          onChange={(newDueDate: string | null) => updateTaskData(task.id, { due_date: newDueDate })} 
          disabled={!canEdit}
        />
      </div>

      <div className="pt-4 border-t border-brand-border">
        <p className="text-xs font-semibold text-brand-text-muted mb-2 uppercase tracking-wider">Reporter</p>
        <div className="flex items-center gap-2">
          {task.creator_avatar_url ? (
            <img
              src={task.creator_avatar_url}
              alt="Reporter"
              className="w-6 h-6 rounded-full object-cover"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-brand-primary text-white flex items-center justify-center text-[10px] font-bold">
              {((task.creator_first_name?.[0] || task.creator_email?.[0] || 'U')).toUpperCase()}
            </div>
          )}
          <span className="text-sm text-brand-text">
            {[task.creator_first_name, task.creator_last_name].filter(Boolean).join(' ') || task.creator_email || `User #${task.created_by || '—'}`}
          </span>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-brand-text-muted mb-2 uppercase tracking-wider">Created</p>
        <p className="text-sm text-brand-text">{createdDate}</p>
      </div>

      <div className="pt-4 border-t border-brand-border">
        <p className="text-xs font-semibold text-brand-text-muted mb-2 uppercase tracking-wider">Labels</p>
        <LabelPicker task={task} canEdit={canEdit} />
      </div>
    </aside>
  );
};

export default TaskSidebar;
