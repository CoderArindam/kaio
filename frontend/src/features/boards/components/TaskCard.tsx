import React from 'react';
import { Trash2, UserRound, CalendarClock, CheckSquare } from 'lucide-react';
import { type Task, type Column } from '../../../services/tasksApi';
import { type User } from '../../../services/usersApi';
import { UserAvatar } from '../../../components/common/UserAvatar';
import { formatUserName } from '../../../utils/userHelpers';

interface TaskCardProps {
  task: Task & { board_name?: string; column_name?: string };
  columns: Column[];
  users: User[];
  onStatusChange?: (newColumnId: number) => void;
  onDelete: () => void;
  onAssigneeChange: (assignedTo: number | null) => void;
  onOpen: () => void;
  canEdit: boolean;
  canReassign: boolean;
  variant?: 'board' | 'list';
  isMultiSelect?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = React.memo(({
  task,
  columns,
  users,
  onDelete,
  onAssigneeChange,
  onOpen,
  canEdit,
  canReassign,
  variant = 'board',
  isMultiSelect = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const assignee = users.find((u) => u.id === task.assigned_to);

  const handleAssigneeSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();

    const val = e.target.value;

    onAssigneeChange(val === "" ? null : parseInt(val, 10));
  };

  const currentColumn = columns.find(c => c.id === task.column_id);
  const isCompleted = currentColumn?.is_completed || false;

  let dueDateBadge = null;
  if (task.due_date) {
    const due = new Date(task.due_date);
    due.setHours(0,0,0,0);
    const now = new Date();
    now.setHours(0,0,0,0);
    const diffDays = Math.round((due.getTime() - now.getTime()) / (1000 * 3600 * 24));
    
    let colorClass = "bg-brand-surface-low text-brand-text-muted";
    let text = "Due on " + due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    if (!isCompleted) {
      if (diffDays < 0) {
        colorClass = "bg-red-50 text-red-600 font-semibold";
        text = `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''}`;
      } else if (diffDays === 0) {
        colorClass = "bg-orange-50 text-orange-600 font-semibold";
        text = "Due today";
      } else if (diffDays === 1) {
        colorClass = "bg-yellow-50 text-yellow-600 font-semibold";
        text = "Due tomorrow";
      } else if (diffDays <= 7) {
        text = `Due in ${diffDays} days`;
      }
    } else {
      colorClass = "bg-brand-surface-low text-brand-text-muted opacity-70";
    }

    dueDateBadge = (
      <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${colorClass}`}>
        <CalendarClock size={14} />
        {text}
      </span>
    );
  }

  if (variant === 'list') {
    return (
      <div
        className="group bg-brand-surface rounded-xl border border-brand-border p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm hover:shadow-md transition cursor-pointer gap-3 sm:gap-4"
        onClick={onOpen}
      >
        <div className="flex flex-col flex-1 gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm sm:text-base font-semibold text-brand-text leading-tight break-words">
              {task.title}
            </h4>
            {task.priority && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                task.priority === "High" ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                  : task.priority === "Medium" ? "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400"
                  : "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400"
              }`}>
                {task.priority}
              </span>
            )}
          </div>
          <div className="text-xs text-brand-text-muted flex flex-wrap items-center gap-2">
            {task.board_name && <span className="font-medium">{task.board_name}</span>}
            {task.board_name && <span>•</span>}
            {task.column_name && <span>{task.column_name}</span>}
            {!task.column_name && currentColumn && <span>{currentColumn.name}</span>}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-brand-border/50">
          {dueDateBadge}
          <div className="shrink-0">
            {assignee ? (
              <UserAvatar user={assignee} size="sm" />
            ) : (
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-brand-surface-low border border-brand-border flex items-center justify-center overflow-hidden">
                <UserRound size={14} className="text-brand-outline" />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handleCardClick = (e: React.MouseEvent) => {
    if (isMultiSelect && onToggleSelect) {
      e.stopPropagation();
      onToggleSelect();
    } else {
      onOpen();
    }
  };

  return (
    <div
      className={`group bg-brand-surface rounded-2xl border p-3.5 sm:p-4 flex flex-col gap-3 shadow-2xs hover:-translate-y-0.5 hover:shadow-xs transition-[transform,box-shadow,border-color,opacity] duration-150 ease-out cursor-pointer relative ${
        isSelected ? 'border-brand-primary ring-2 ring-brand-primary/30 bg-brand-primary/5' : 'border-brand-border'
      }`}
      onClick={handleCardClick}
    >
      <div className="flex justify-between items-start gap-2.5">
        {isMultiSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
            className="w-4 h-4 text-brand-primary rounded border-brand-border focus:ring-brand-primary cursor-pointer mt-0.5"
          />
        )}
        <h4 className="text-sm font-semibold text-brand-text leading-snug flex-1 break-words">
          {task.title}
        </h4>

        {canEdit && !isMultiSelect && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 bg-brand-surface-low text-brand-outline hover:text-brand-error w-7 h-7 rounded-full flex items-center justify-center transition"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {task.labels.map((label) => (
            <span
              key={label.id}
              style={{
                backgroundColor: `${label.color}15`,
                borderColor: `${label.color}40`,
                color: label.color,
              }}
              className="px-2 py-0.5 rounded-md text-[11px] font-semibold border flex items-center gap-1 leading-tight"
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: label.color }} />
              {label.name}
            </span>
          ))}
        </div>
      )}

      {task.description && (() => {
        // Strip markdown to plain text for the card preview
        const plain = task.description
          .replace(/!\[.*?\]\(.*?\)/g, '')           // images
          .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')     // links → label
          .replace(/#{1,6}\s+/g, '')                 // headings
          .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // bold/italic
          .replace(/~~([^~]+)~~/g, '$1')             // strikethrough
          .replace(/`{1,3}[^`]*`{1,3}/g, '')         // code
          .replace(/^\s*[-*+>]\s+/gm, '')            // bullets / blockquote
          .replace(/^\s*\d+\.\s+/gm, '')             // ordered list
          .replace(/\[[ x]\]\s*/gi, '')               // task checkboxes
          .replace(/\n+/g, ' ')
          .trim();

        if (!plain) return null;
        return (
          <p className="text-xs text-brand-text-muted leading-relaxed line-clamp-2 break-words">
            {plain}
          </p>
        );
      })()}

      {dueDateBadge && (
        <div className="flex">
          {dueDateBadge}
        </div>
      )}

      <div className="flex justify-between items-center pt-3 border-t border-brand-border/50 mt-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          {task.priority && (
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold ${
                task.priority === "High"
                  ? "bg-red-50 text-red-600 border border-red-200/50"
                  : task.priority === "Medium"
                    ? "bg-orange-50 text-orange-600 border border-orange-200/50"
                    : "bg-green-50 text-green-600 border border-green-200/50"
              }`}
            >
              {task.priority} Priority
            </span>
          )}
          {task.subtask_count !== undefined && task.subtask_count > 0 && (
            <span
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                task.completed_subtask_count === task.subtask_count
                  ? "bg-green-50 text-green-700"
                  : "bg-brand-surface-low text-brand-text-muted"
              }`}
              title={`${task.completed_subtask_count}/${task.subtask_count} subtasks completed`}
            >
              <CheckSquare size={12} />
              <span>
                {task.completed_subtask_count ?? 0}/{task.subtask_count}
              </span>
            </span>
          )}
        </div>

        {/* Assignee Avatar Dropdown with Tooltip */}
        <div className="relative shrink-0" title={assignee ? `Assigned to: ${formatUserName(assignee)}` : "Unassigned"}>
          {canReassign && (
            <select
              value={task.assigned_to ?? ""}
              onChange={handleAssigneeSelect}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
              title={assignee ? `Assigned to: ${formatUserName(assignee)}` : "Assign user"}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {formatUserName(u)}
                </option>
              ))}
            </select>
          )}

          <div className="relative">
            {assignee ? (
              <UserAvatar user={assignee} size="sm" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-brand-surface-low border border-brand-border flex items-center justify-center overflow-hidden cursor-pointer">
                <UserRound size={13} className="text-brand-text-muted" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

TaskCard.displayName = 'TaskCard';

export default TaskCard;
