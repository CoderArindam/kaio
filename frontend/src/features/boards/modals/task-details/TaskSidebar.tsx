import React, { useState, useEffect } from 'react';
import { Clock, Plus, Edit2, Check, X, GripVertical, Pin, ChevronDown, ChevronRight } from 'lucide-react';
import { type Task, type Column } from '../../../../services/tasksApi';
import { type User } from '../../../../services/usersApi';
import { useTaskStore } from '../../../../store/taskStore';
import { useAuthStore } from '../../../../store/authStore';
import { usePreferencesStore } from '../../../../store/preferencesStore';
import StatusSelector from '../../../../components/shared/StatusSelector';
import AssigneeSelector from '../../../../components/shared/AssigneeSelector';
import PrioritySelector from '../../../../components/shared/PrioritySelector';
import DueDatePicker from '../../../../components/shared/DueDatePicker';
import LabelPicker from '../../../../components/shared/LabelPicker';
import { UserAvatar } from '../../../../components/common/UserAvatar';
import { formatUserName } from '../../../../utils/userHelpers';
import LogTimeModal from './LogTimeModal';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TaskSidebarProps {
  task: Task;
  columns: Column[];
  boardMembers: User[];
  canEdit: boolean;
  createdDate: string;
}

interface SortableSidebarFieldProps {
  id: string;
  field: { label: string; render: () => React.ReactNode };
  isPinned: boolean;
  onTogglePin: (id: string) => void;
}

const SortableSidebarField: React.FC<SortableSidebarFieldProps> = ({ id, field, isPinned, onTogglePin }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div className="flex items-center justify-between mb-2">
         <div className="flex items-center relative w-full">
           <div 
             {...attributes} 
             {...listeners} 
             className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-brand-text-muted hover:text-brand-text transition-opacity p-0.5"
           >
             <GripVertical size={14} />
           </div>
           <p className="text-xs font-semibold text-brand-text-muted uppercase tracking-wider">{field.label}</p>
           <div className="flex-1" />
           <button 
             onClick={() => onTogglePin(id)}
             className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded ${isPinned ? 'text-yellow-500 bg-yellow-500/10 opacity-100' : 'text-brand-text-muted hover:bg-brand-surface-low'}`}
             title={isPinned ? 'Unpin field' : 'Pin field'}
           >
             <Pin size={14} />
           </button>
         </div>
      </div>
      <div>
        {field.render()}
      </div>
    </div>
  );
};

const DEFAULT_LAYOUT = {
  pinned: [] as string[],
  unpinned: ['assignee', 'reporter', 'priority', 'due_date', 'time_tracking', 'created_by', 'labels'] as string[]
};

const TaskSidebar: React.FC<TaskSidebarProps> = ({ task, columns, boardMembers, canEdit, createdDate }) => {
  const { updateTaskData, moveTask, assignTask } = useTaskStore();
  const { user } = useAuthStore();
  const { preferences, updatePreferences } = usePreferencesStore();
  
  const [isLogTimeOpen, setIsLogTimeOpen] = useState(false);
  const [isEditingEstimate, setIsEditingEstimate] = useState(false);
  const [estimateInput, setEstimateInput] = useState<string>(
    task.estimate_hours !== undefined && task.estimate_hours !== null ? String(task.estimate_hours) : ''
  );
  
  const [pinnedFieldsOpen, setPinnedFieldsOpen] = useState(true);

  const sidebarLayout = preferences?.task_sidebar_layout || DEFAULT_LAYOUT;
  
  // Clean up any potential mismatched state
  const allAvailable = DEFAULT_LAYOUT.unpinned;
  const currentPinned = sidebarLayout.pinned.filter(id => allAvailable.includes(id));
  const currentUnpinned = sidebarLayout.unpinned.filter(id => allAvailable.includes(id));
  
  // Ensure fields that are newly added to DEFAULT_LAYOUT show up
  const missing = allAvailable.filter(id => !currentPinned.includes(id) && !currentUnpinned.includes(id));
  const finalPinned = currentPinned;
  const finalUnpinned = [...currentUnpinned, ...missing];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
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
  const estimateHours = task.estimate_hours !== undefined && task.estimate_hours !== null && Number(task.estimate_hours) > 0 ? Number(task.estimate_hours) : null;
  const remainingHours = estimateHours !== null ? Math.max(0, estimateHours - loggedHours) : null;
  const percentLogged = estimateHours && estimateHours > 0 ? Math.min(100, Math.round((loggedHours / estimateHours) * 100)) : 0;

  const canChangeReporter = canEdit && (
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'MANAGER' ||
    task.created_by === user?.id ||
    task.reporter_id === user?.id
  );

  const fieldRenderers: Record<string, { label: string; render: () => React.ReactNode }> = {
    assignee: {
      label: 'Assignee',
      render: () => (
        <AssigneeSelector 
          assigneeId={task.assigned_to} 
          users={boardMembers} 
          onChange={(newAssignee: number | null) => assignTask(task.id, newAssignee)} 
          disabled={!canEdit}
        />
      )
    },
    reporter: {
      label: 'Reporter',
      render: () => (
        <AssigneeSelector 
          assigneeId={task.reporter_id ?? null} 
          users={boardMembers} 
          onChange={(newReporter: number | null) => updateTaskData(task.id, { reporter_id: newReporter })} 
          disabled={!canChangeReporter}
        />
      )
    },
    priority: {
      label: 'Priority',
      render: () => (
        <PrioritySelector 
          priority={task.priority || "Medium"} 
          onChange={(newPriority: string) => updateTaskData(task.id, { priority: newPriority })} 
          disabled={!canEdit}
        />
      )
    },
    due_date: {
      label: 'Due Date',
      render: () => (
        <DueDatePicker 
          dueDate={task.due_date} 
          onChange={(newDueDate: string | null) => updateTaskData(task.id, { due_date: newDueDate })} 
          disabled={!canEdit}
        />
      )
    },
    time_tracking: {
      label: 'Time Tracking',
      render: () => (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-brand-text-muted flex items-center gap-1.5">
              <Clock size={12} className="text-brand-primary" />
              Progress
            </p>
            <button
              onClick={() => setIsLogTimeOpen(true)}
              className="text-[11px] text-brand-primary hover:text-brand-primary-hover font-semibold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Plus size={11} />
              Log
            </button>
          </div>

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
      )
    },
    created_by: {
      label: 'Created By / Created',
      render: () => (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <UserAvatar user={creatorUser} size="sm" />
            <span className="text-sm font-medium text-brand-text">
              {formatUserName(creatorUser, task.created_by ? `User #${task.created_by}` : 'Unknown')}
            </span>
          </div>
          <p className="text-xs text-brand-text-muted">{createdDate}</p>
        </div>
      )
    },
    labels: {
      label: 'Labels',
      render: () => (
        <LabelPicker task={task} canEdit={canEdit} />
      )
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    const activeContainer = finalPinned.includes(activeId) ? 'pinned' : 'unpinned';
    const overContainer = finalPinned.includes(overId) ? 'pinned' : 'unpinned';

    let newPinned = [...finalPinned];
    let newUnpinned = [...finalUnpinned];

    if (activeContainer === overContainer) {
      if (activeContainer === 'pinned') {
        const oldIndex = newPinned.indexOf(activeId);
        const newIndex = newPinned.indexOf(overId);
        newPinned = arrayMove(newPinned, oldIndex, newIndex);
      } else {
        const oldIndex = newUnpinned.indexOf(activeId);
        const newIndex = newUnpinned.indexOf(overId);
        newUnpinned = arrayMove(newUnpinned, oldIndex, newIndex);
      }
    } else {
      // Moving between containers
      if (activeContainer === 'pinned') {
        newPinned = newPinned.filter(id => id !== activeId);
        const overIndex = newUnpinned.indexOf(overId);
        newUnpinned.splice(overIndex, 0, activeId);
      } else {
        newUnpinned = newUnpinned.filter(id => id !== activeId);
        const overIndex = newPinned.indexOf(overId);
        newPinned.splice(overIndex, 0, activeId);
      }
    }

    updatePreferences({
      task_sidebar_layout: {
        pinned: newPinned,
        unpinned: newUnpinned
      }
    });
  };

  const togglePin = (id: string) => {
    const isCurrentlyPinned = finalPinned.includes(id);
    let newPinned = [...finalPinned];
    let newUnpinned = [...finalUnpinned];

    if (isCurrentlyPinned) {
      newPinned = newPinned.filter(f => f !== id);
      newUnpinned.push(id);
    } else {
      newUnpinned = newUnpinned.filter(f => f !== id);
      newPinned.push(id);
    }

    updatePreferences({
      task_sidebar_layout: {
        pinned: newPinned,
        unpinned: newUnpinned
      }
    });
  };

  return (
    <>
      <aside className="w-[340px] px-8 py-6 bg-brand-surface border-l border-brand-border flex-shrink-0 overflow-y-auto">
        <div className="space-y-6 pl-4">
          
          {/* Status - Fixed at Top */}
          <div>
            <p className="text-xs font-semibold text-brand-text-muted mb-2 uppercase tracking-wider">Status</p>
            <StatusSelector 
              columnId={task.column_id} 
              columns={columns} 
              onChange={(newColumnId: number) => moveTask(task.id, newColumnId)} 
              disabled={!canEdit}
            />
          </div>

          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            {/* Pinned Fields Section */}
            {finalPinned.length > 0 && (
              <div className="pt-2">
                <button 
                  onClick={() => setPinnedFieldsOpen(!pinnedFieldsOpen)}
                  className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-text mb-4 -ml-4 p-1 hover:bg-brand-surface-low rounded transition-colors w-full"
                >
                  {pinnedFieldsOpen ? <ChevronDown size={16} className="text-brand-text-muted" /> : <ChevronRight size={16} className="text-brand-text-muted" />}
                  Your pinned fields
                </button>
                
                {pinnedFieldsOpen && (
                  <div className="space-y-5">
                    <SortableContext 
                      items={finalPinned}
                      strategy={verticalListSortingStrategy}
                    >
                      {finalPinned.map(id => (
                        <SortableSidebarField 
                          key={id} 
                          id={id} 
                          field={fieldRenderers[id]} 
                          isPinned={true}
                          onTogglePin={togglePin}
                        />
                      ))}
                    </SortableContext>
                  </div>
                )}
              </div>
            )}

            {/* Unpinned Fields Section */}
            <div className="pt-5 mt-5 border-t border-brand-border border-dashed space-y-5">
              <SortableContext 
                items={finalUnpinned}
                strategy={verticalListSortingStrategy}
              >
                {finalUnpinned.map(id => (
                  <SortableSidebarField 
                    key={id} 
                    id={id} 
                    field={fieldRenderers[id]} 
                    isPinned={false}
                    onTogglePin={togglePin}
                  />
                ))}
              </SortableContext>
            </div>
          </DndContext>
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
