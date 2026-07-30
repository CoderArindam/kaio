import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus, UserPlus, CheckSquare } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useTaskStore } from '../../../store/taskStore';
import { useUiStore } from '../../../store/uiStore';
import { useAuthStore } from '../../../store/authStore';
import { isManagerOrAdmin } from '../../../lib/rbac';
import TaskCard from './TaskCard';
import TaskDetailsModal from '../modals/task-details';
import CreateTaskModal from '../modals/CreateTaskModal';
import AddMemberModal from '../modals/AddMemberModal';
import AssigneeFilter from './AssigneeFilter';
import DueDateFilter, { type DueDateFilterOption } from './DueDateFilter';
import { type Column, type Task, bulkMoveTasks } from '../../../services/tasksApi';
import { type User } from '../../../services/usersApi';
import ConfirmDialog from '../../../components/common/ConfirmDialog';

interface KanbanBoardProps {
  boardId: number;
}

// Droppable column wrapper
function DroppableColumn({
  column,
  children,
}: {
  column: Column;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column.id}` });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto space-y-4 min-h-[200px] rounded-2xl transition-colors ${isOver ? "bg-brand-surface-container" : ""}`}
    >
      {children}
    </div>
  );
}

// Draggable task wrapper
function DraggableTask({
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
}: {
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
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { task },
    disabled: !canEdit || isMultiSelect,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.4 : 1 }}
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
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ boardId }) => {
  const {
    getColumnsList,
    getBoardTasksList,
    getBoardMembersList,
    boardView,
    moveTask,
    removeTask,
    assignTask,
    setSelectedAssigneeId,
    initializeBoard,
  } = useTaskStore();

  const columns = getColumnsList();
  const tasks = getBoardTasksList();
  const boardMembers = getBoardMembersList();
  const { isFetching, selectedAssigneeId } = boardView;

  const { openTaskModal, openCreateTaskModal } = useUiStore();
  const { user } = useAuthStore();

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedDueDateFilter, setSelectedDueDateFilter] =
    useState<DueDateFilterOption>("All");
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);

  // Multi-select state
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [bulkTargetColumnId, setBulkTargetColumnId] = useState<number | ''>('');
  const [isBulkMoving, setIsBulkMoving] = useState(false);

  const toggleTaskSelection = (taskId: number) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleBulkMove = async () => {
    if (!bulkTargetColumnId || selectedTaskIds.length === 0) return;
    setIsBulkMoving(true);
    try {
      await bulkMoveTasks({
        task_ids: selectedTaskIds,
        column_id: Number(bulkTargetColumnId),
      });
      setSelectedTaskIds([]);
      setBulkTargetColumnId('');
      setIsMultiSelect(false);
      await initializeBoard(boardId);
    } catch (err) {
      console.error('Failed to bulk move tasks:', err);
    } finally {
      setIsBulkMoving(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const [searchParams] = useSearchParams();

  // Process deep links ONCE when the board loads
  useEffect(() => {
    const taskIdParam = searchParams.get('taskId');
    if (taskIdParam) {
      const taskIdNum = parseInt(taskIdParam, 10);
      if (!isNaN(taskIdNum)) {
        openTaskModal(taskIdNum);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    initializeBoard(boardId);
  }, [boardId, initializeBoard]);

  const handleDeleteTask = (taskId: number) => {
    setTaskToDelete(taskId);
  };

  const handleConfirmDeleteTask = async () => {
    if (taskToDelete === null) return;
    setIsDeleting(true);
    await removeTask(taskToDelete);
    setIsDeleting(false);
    setTaskToDelete(null);
  };

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task as Task;
    setActiveTask(task ?? null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over, active } = event;
    if (!over) return;

    const task = active.data.current?.task as Task;
    if (!task) return;

    const overId = String(over.id);
    let targetColumnId: number | null = null;

    if (overId.startsWith("col-")) {
      targetColumnId = parseInt(overId.replace("col-", ""), 10);
    } else if (overId.startsWith("task-")) {
      const overTaskId = parseInt(overId.replace("task-", ""), 10);
      const overTask = tasks.find((t: any) => t.id === overTaskId);
      if (overTask) targetColumnId = overTask.column_id;
    }

    if (targetColumnId !== null && task.column_id !== targetColumnId) {
      task.column_id = targetColumnId;
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { over, active } = event;
    setActiveTask(null);

    if (!over) return;

    const task = active.data.current?.task as Task;
    if (!task) return;

    let targetColumnId: number | null = null;
    const overId = String(over.id);
    if (overId.startsWith("col-")) {
      targetColumnId = parseInt(overId.replace("col-", ""), 10);
    } else if (overId.startsWith("task-")) {
      const overTaskId = parseInt(overId.replace("task-", ""), 10);
      const overTask = tasks.find((t: any) => t.id === overTaskId);
      if (overTask) targetColumnId = overTask.column_id;
    }

    if (targetColumnId === null) return;
    if (task.column_id === targetColumnId) return;

    await moveTask(task.id, targetColumnId);
  };

  const isManager = isManagerOrAdmin(user);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col overflow-hidden bg-brand-bg relative">
        <header className="h-20 flex items-center justify-between px-4 md:px-8 shrink-0">
          <h1 className="text-2xl md:text-3xl font-bold text-brand-text">
            Kanban
          </h1>

          <div className="flex gap-3 items-center">
            <button
              onClick={() => {
                setIsMultiSelect(!isMultiSelect);
                if (isMultiSelect) setSelectedTaskIds([]);
              }}
              className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border ${
                isMultiSelect
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'bg-brand-surface text-brand-text border-brand-border hover:bg-brand-surface-low'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              {isMultiSelect ? 'Exit Select Mode' : 'Select Tasks'}
            </button>
            {isManager && (
              <button
                onClick={() => setIsAddMemberModalOpen(true)}
                className="bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer focus:ring-2 focus:ring-brand-primary focus:outline-none"
              >
                <UserPlus className="w-4 h-4" /> Add Member
              </button>
            )}
          </div>
        </header>

        {/* Filters */}
        <div className="px-4 md:px-8 flex flex-wrap gap-4 items-center">
          <AssigneeFilter
            users={boardMembers}
            selectedAssigneeId={selectedAssigneeId}
            onChange={(val) => setSelectedAssigneeId(boardId, val)}
          />
          <DueDateFilter
            value={selectedDueDateFilter}
            onChange={setSelectedDueDateFilter}
          />
        </div>

        {/* Board columns */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 md:px-8 pb-40 pt-4">
          {isFetching ? (
            <div className="h-full flex flex-col items-center justify-center text-brand-text-muted">
              <Loader2 className="w-10 h-10 animate-spin text-brand-primary opacity-50 mb-4" />
              <p>Loading board...</p>
            </div>
          ) : (
            <div className="flex gap-6 h-full">
              {columns.map((column: any) => {
                let columnTasks = tasks.filter((task: any) => {
                  if (task.column_id !== column.id) return false;
                  if (
                    selectedAssigneeId !== null &&
                    task.assigned_to !== selectedAssigneeId
                  )
                    return false;

                  if (selectedDueDateFilter !== "All") {
                    if (selectedDueDateFilter === "No Due Date")
                      return !task.due_date;
                    if (!task.due_date) return false;

                    const due = new Date(task.due_date);
                    due.setHours(0, 0, 0, 0);
                    const now = new Date();
                    now.setHours(0, 0, 0, 0);
                    const diffDays = Math.round(
                      (due.getTime() - now.getTime()) / (1000 * 3600 * 24),
                    );

                    if (selectedDueDateFilter === "Overdue")
                      return diffDays < 0 && !column.is_completed;
                    if (selectedDueDateFilter === "Today")
                      return diffDays === 0;
                    if (selectedDueDateFilter === "This Week")
                      return diffDays >= 0 && diffDays <= 7;
                  }

                  return true;
                });

                columnTasks.sort((a: any, b: any) => {
                  const getUrgency = (t: any) => {
                    if (column.is_completed) return 100;
                    if (!t.due_date) return 50;
                    const due = new Date(t.due_date);
                    due.setHours(0, 0, 0, 0);
                    const now = new Date();
                    now.setHours(0, 0, 0, 0);
                    const diffDays = Math.round(
                      (due.getTime() - now.getTime()) / (1000 * 3600 * 24),
                    );
                    if (diffDays < 0) return 1; // Overdue
                    if (diffDays === 0) return 2; // Today
                    if (diffDays === 1) return 3; // Tomorrow
                    return 4 + diffDays; // Future
                  };
                  const scoreA = getUrgency(a);
                  const scoreB = getUrgency(b);
                  if (scoreA !== scoreB) return scoreA - scoreB;
                  return a.id - b.id;
                });

                return (
                  <div
                    key={column.id}
                    className="w-[340px] shrink-0 flex flex-col"
                  >
                    <div className="flex justify-between items-center px-4 py-3 bg-brand-surface rounded-2xl border border-brand-border mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-brand-primary" />
                        <h3 className="font-semibold text-brand-text">
                          {column.name}
                        </h3>
                      </div>
                      <span className="px-3 py-1 rounded-full bg-brand-surface-low text-xs">
                        {columnTasks.length}
                      </span>
                    </div>

                    <DroppableColumn column={column}>
                      {columnTasks.length === 0 ? (
                        <div className="h-[200px] flex flex-col items-center justify-center text-brand-text-muted border-2 border-dashed border-brand-border rounded-xl bg-brand-surface-low opacity-60">
                          <p className="text-sm">No tasks</p>
                        </div>
                      ) : (
                        columnTasks.map((task: any) => {
                          const canEdit =
                            user?.role !== "MEMBER" ||
                            task.assigned_to === user?.id;
                          const canReassign = canEdit;
                          return (
                            <DraggableTask
                              key={task.id}
                              task={task}
                              columns={columns}
                              users={boardMembers}
                              onStatusChange={(newColumnId) =>
                                moveTask(task.id, newColumnId)
                              }
                              onDelete={() => handleDeleteTask(task.id)}
                              onAssigneeChange={(assignedTo) =>
                                assignTask(task.id, assignedTo)
                              }
                              onOpen={() => openTaskModal(task.id)}
                              canEdit={canEdit}
                              canReassign={canReassign}
                              isMultiSelect={isMultiSelect}
                              isSelected={selectedTaskIds.includes(task.id)}
                              onToggleSelect={() => toggleTaskSelection(task.id)}
                            />
                          );
                        })
                      )}
                    </DroppableColumn>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating Bulk Move Action Bar */}
        {isMultiSelect && selectedTaskIds.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-brand-surface border border-brand-border shadow-2xl rounded-2xl p-4 flex items-center gap-4 animate-in slide-in-from-bottom-5 duration-200">
            <span className="text-xs font-semibold text-brand-text">
              {selectedTaskIds.length} task{selectedTaskIds.length !== 1 ? 's' : ''} selected
            </span>
            <div className="h-4 w-[1px] bg-brand-border" />
            <select
              value={bulkTargetColumnId}
              onChange={(e) => setBulkTargetColumnId(e.target.value ? Number(e.target.value) : '')}
              className="bg-brand-surface-low text-brand-text text-xs border border-brand-border rounded-lg px-3 py-1.5 focus:outline-none"
            >
              <option value="">Move to column...</option>
              {columns.map((col: any) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
            <button
              disabled={!bulkTargetColumnId || isBulkMoving}
              onClick={handleBulkMove}
              className="bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {isBulkMoving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Move
            </button>
            <button
              onClick={() => setSelectedTaskIds([])}
              className="text-brand-text-muted hover:text-brand-text text-xs px-2 py-1 transition-colors cursor-pointer"
            >
              Clear selection
            </button>
          </div>
        )}

        {/* Floating Create Bar */}
        {user?.role !== "MEMBER" && !isMultiSelect && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
            <button
              onClick={openCreateTaskModal}
              className="bg-brand-primary hover:bg-brand-primary-hover text-white shadow-xl shadow-brand-primary/20 px-6 py-3 rounded-full font-medium flex items-center gap-2 transition cursor-pointer"
            >
              <Plus size={18} />
              Create Task
            </button>
          </div>
        )}
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeTask && (
          <div style={{ opacity: 0.9, cursor: "grabbing" }}>
            <TaskCard
              task={activeTask}
              columns={columns}
              users={boardMembers}
              onStatusChange={() => {}}
              onDelete={() => {}}
              onAssigneeChange={() => {}}
              onOpen={() => {}}
              canEdit={
                user?.role !== "MEMBER" || activeTask.assigned_to === user?.id
              }
              canReassign={
                user?.role !== "MEMBER" || activeTask.assigned_to === user?.id
              }
            />
          </div>
        )}
      </DragOverlay>

      <TaskDetailsModal />
      <CreateTaskModal />
      <AddMemberModal
        isOpen={isAddMemberModalOpen}
        onClose={() => setIsAddMemberModalOpen(false)}
        boardId={boardId}
        onMemberAdded={() => initializeBoard(boardId)}
      />

      <ConfirmDialog
        isOpen={taskToDelete !== null}
        onClose={() => setTaskToDelete(null)}
        onConfirm={handleConfirmDeleteTask}
        title="Delete Task"
        description="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete"
        isDestructive={true}
        isLoading={isDeleting}
      />
    </DndContext>
  );
};

export default KanbanBoard;
