import React, { useState, useEffect } from 'react';
import { Clock, Plus, Edit2, Check, X } from 'lucide-react';
import { type Task, type Column } from '../../../../services/tasksApi';
import { type User } from '../../../../services/usersApi';
import { useTaskStore } from '../../../../store/taskStore';
import StatusSelector from '../../../../components/shared/StatusSelector';
import AssigneeSelector from '../../../../components/shared/AssigneeSelector';
import PrioritySelector from '../../../../components/shared/PrioritySelector';
import DueDatePicker from '../../../../components/shared/DueDatePicker';
import LabelPicker from '../../../../components/shared/LabelPicker';
import { UserAvatar } from '../../../../components/common/UserAvatar';
import { formatUserName } from '../../../../utils/userHelpers';
import LogTimeModal from './LogTimeModal';

interface TaskSidebarProps {
  task: Task;
  columns: Column[];
  boardMembers: User[];
  canEdit: boolean;
  createdDate: string;
}

const TaskSidebar: React.FC<TaskSidebarProps> = ({ task, columns, boardMembers, canEdit, createdDate }) => {
  const { updateTaskData, moveTask, assignTask } = useTaskStore();
  const [isLogTimeOpen, setIsLogTimeOpen] = useState(false);

  const [isEditingEstimate, setIsEditingEstimate] = useState(false);
  const [estimateInput, setEstimateInput] = useState<string>(
    task.estimate_hours !== undefined && task.estimate_hours !== null ? String(task.estimate_hours) : ''
  );

  useEffect(() => {
    setEstimateInput(
      task.estimate_hours !== undefined && task.estimate_hours !== null ? String(task.estimate_hours) : ''
    );
  }, [task.estimate_hours]);

  const handleSaveEstimate = async () => {
    const parsed = estimateInput.trim() !== '' ? parseFloat(estimateInput) : null;
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) return;
    await updateTaskData(task.id, { estimate_hours: parsed });
    setIsEditingEstimate(false);
  };

  const creatorUser = boardMembers.find((m) => m.id === task.created_by) || {
    id: task.created_by,
    first_name: task.creator_first_name,
    last_name: task.creator_last_name,
    email: task.creator_email,
    avatar_url: task.creator_avatar_url,
  };

  const loggedHours = Number(task.logged_hours || 0);
  const estimateHours = task.estimate_hours !== undefined && task.estimate_hours !== null ? Number(task.estimate_hours) : null;
  const remainingHours = estimateHours !== null ? Math.max(0, estimateHours - loggedHours) : null;
  const percentLogged = estimateHours && estimateHours > 0 ? Math.min(100, Math.round((loggedHours / estimateHours) * 100)) : 0;

  return (
    <>
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

        {/* Time Tracking Section */}
        <div className="pt-4 border-t border-brand-border space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-brand-text-muted uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={13} className="text-brand-primary" />
              Time Tracking
            </p>
            <button
              onClick={() => setIsLogTimeOpen(true)}
              className="text-xs text-brand-primary hover:text-brand-primary-hover font-semibold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Plus size={13} />
              Log Time
            </button>
          </div>

          {/* Estimate Input / Display */}
          <div className="bg-brand-surface-low rounded-xl border border-brand-border/60 p-3 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-brand-text-muted font-medium">Estimated:</span>
              {isEditingEstimate ? (
                <div className="flex items-center gap-1.5">
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      autoFocus
                      placeholder="0.0"
                      value={estimateInput}
                      onChange={(e) => setEstimateInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEstimate();
                        if (e.key === 'Escape') setIsEditingEstimate(false);
                      }}
                      className="w-16 bg-brand-surface border border-brand-border/60 rounded px-2 py-1 text-xs text-brand-text outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/20 transition-all shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pr-4"
                    />
                    <span className="absolute right-2 text-[10px] text-brand-text-muted pointer-events-none select-none font-medium">h</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={handleSaveEstimate} 
                      className="p-1 rounded-md bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white transition-colors cursor-pointer"
                      title="Save (Enter)"
                    >
                      <Check size={12} strokeWidth={2.5} />
                    </button>
                    <button 
                      onClick={() => setIsEditingEstimate(false)} 
                      className="p-1 rounded-md bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
                      title="Cancel (Esc)"
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-brand-text">
                    {estimateHours !== null ? `${estimateHours}h` : 'Not set'}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => setIsEditingEstimate(true)}
                      className="text-brand-text-muted hover:text-brand-primary p-0.5 transition cursor-pointer"
                      title="Edit estimate"
                    >
                      <Edit2 size={12} />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-brand-text-muted font-medium">Logged:</span>
              <span className="font-semibold text-brand-primary">{loggedHours}h</span>
            </div>

            {estimateHours !== null && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-brand-text-muted font-medium">Remaining:</span>
                <span className={`font-semibold ${remainingHours === 0 && loggedHours > estimateHours ? 'text-red-500' : 'text-brand-text'}`}>
                  {remainingHours}h
                </span>
              </div>
            )}

            {/* Progress Bar */}
            {estimateHours && estimateHours > 0 ? (
              <div className="space-y-1 pt-1">
                <div className="w-full h-2 bg-brand-border/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      loggedHours > estimateHours ? 'bg-orange-500' : 'bg-brand-primary'
                    }`}
                    style={{ width: `${percentLogged}%` }}
                  />
                </div>
                <div className="flex justify-end text-[10px] text-brand-text-muted">
                  {percentLogged}% logged
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="pt-4 border-t border-brand-border">
          <p className="text-xs font-semibold text-brand-text-muted mb-2 uppercase tracking-wider">Reporter</p>
          <div className="flex items-center gap-2">
            <UserAvatar user={creatorUser} size="sm" />
            <span className="text-sm font-medium text-brand-text">
              {formatUserName(creatorUser, task.created_by ? `User #${task.created_by}` : 'Unknown')}
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

      {/* Log Time Modal */}
      <LogTimeModal
        isOpen={isLogTimeOpen}
        onClose={() => setIsLogTimeOpen(false)}
        task={task}
      />
    </>
  );
};

export default TaskSidebar;
