import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus, UserPlus, CheckSquare, Trash2, MoreVertical, MoveLeft, MoveRight, Edit2, Check, X } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
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
import LabelFilter from './LabelFilter';
import { type Column, type Task, bulkMoveTasks, bulkDeleteTasks } from '../../../services/tasksApi';

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
      className={`flex-1 overflow-y-auto space-y-3 min-h-[160px] p-1.5 rounded-xl transition-all duration-150 custom-scrollbar ${
        isOver ? "bg-brand-primary/10 ring-2 ring-brand-primary/40" : ""
      }`}
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
    renameColumn,
    removeColumn,
    reorderBoardColumns,
    setIsDragging,
  } = useTaskStore();

  const columns = getColumnsList();
  const tasks = getBoardTasksList();
  const boardMembers = getBoardMembersList();
  const { isFetching, selectedAssigneeId } = boardView;

  const { openTaskModal, openCreateTaskModal } = useUiStore();
  const { user } = useAuthStore();
  const canManageColumns = isManagerOrAdmin(user);

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedDueDateFilter, setSelectedDueDateFilter] =
    useState<DueDateFilterOption>("All");
  const [selectedLabelId, setSelectedLabelId] = useState<number | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);

  // Multi-select state
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [bulkTargetColumnId, setBulkTargetColumnId] = useState<number | ''>('');
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Column management state
  const [editingColumnId, setEditingColumnId] = useState<number | null>(null);
  const [editingColumnName, setEditingColumnName] = useState('');
  const [openMenuColumnId, setOpenMenuColumnId] = useState<number | null>(null);
  const [columnToDelete, setColumnToDelete] = useState<{ id: number; name: string; taskCount: number } | null>(null);
  const [targetColumnIdForDelete, setTargetColumnIdForDelete] = useState<number | ''>('');

  const handleSaveColumnRename = async (columnId: number) => {
    if (!editingColumnName.trim()) {
      setEditingColumnId(null);
      return;
    }
    await renameColumn(columnId, { name: editingColumnName.trim() });
    setEditingColumnId(null);
  };

  const handleMoveColumn = async (currentIndex: number, delta: number) => {
    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= columns.length) return;
    const newOrderedIds = columns.map((c: any) => c.id);
    const [movedColId] = newOrderedIds.splice(currentIndex, 1);
    newOrderedIds.splice(targetIndex, 0, movedColId);
    await reorderBoardColumns(boardId, newOrderedIds);
  };

  const handleConfirmDeleteColumn = async () => {
    if (!columnToDelete) return;

    let targetId = Number(targetColumnIdForDelete);
    if (!targetId) {
      const otherCol = columns.find((c: any) => c.id !== columnToDelete.id);
      if (otherCol) targetId = otherCol.id;
    }

    if (targetId) {
      await removeColumn(columnToDelete.id, targetId);
    }
    setColumnToDelete(null);
    setTargetColumnIdForDelete('');
  };

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

  const handleBulkDelete = async () => {
    if (selectedTaskIds.length === 0) return;
    setIsBulkDeleting(true);
    try {
      await bulkDeleteTasks({
        task_ids: selectedTaskIds,
      });
      setSelectedTaskIds([]);
      setShowBulkDeleteConfirm(false);
      setIsMultiSelect(false);
      await initializeBoard(boardId);
    } catch (err) {
      console.error('Failed to bulk delete tasks:', err);
    } finally {
      setIsBulkDeleting(false);
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
    setIsDragging(true);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { over, active } = event;
    setActiveTask(null);
    setIsDragging(false);

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
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col overflow-hidden bg-brand-bg relative">
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-8 py-3.5 sm:py-4 shrink-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-brand-text">
            Kanban
          </h1>

          <div className="flex gap-2 sm:gap-3 items-center">
            <button
              onClick={() => {
                setIsMultiSelect(!isMultiSelect);
                if (isMultiSelect) setSelectedTaskIds([]);
              }}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border ${
                isMultiSelect
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'bg-brand-surface text-brand-text border-brand-border hover:bg-brand-surface-low'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              <span>{isMultiSelect ? 'Exit Select' : 'Select Tasks'}</span>
            </button>
            {isManager && (
              <button
                onClick={() => setIsAddMemberModalOpen(true)}
                className="bg-brand-primary hover:bg-brand-primary-hover text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer focus:ring-2 focus:ring-brand-primary focus:outline-none"
              >
                <UserPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Member</span>
                <span className="sm:hidden">Add</span>
              </button>
            )}
          </div>
        </header>

        {/* Filters */}
        <div className="px-4 sm:px-8 flex flex-wrap gap-2.5 sm:gap-4 items-center pb-2 shrink-0">
          <AssigneeFilter
            users={boardMembers}
            selectedAssigneeId={selectedAssigneeId}
            onChange={(val) => setSelectedAssigneeId(boardId, val)}
          />
          <DueDateFilter
            value={selectedDueDateFilter}
            onChange={setSelectedDueDateFilter}
          />
          <LabelFilter
            boardId={boardId}
            selectedLabelId={selectedLabelId}
            onChange={setSelectedLabelId}
          />
        </div>

        {/* Board columns */}
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden px-4 sm:px-8 pb-4 pt-2 custom-scrollbar">
          {isFetching ? (
            <div className="h-full flex flex-col items-center justify-center text-brand-text-muted">
              <Loader2 className="w-10 h-10 animate-spin text-brand-primary opacity-50 mb-4" />
              <p>Loading board...</p>
            </div>
          ) : (
            <div className="flex gap-3 sm:gap-4.5 h-full items-stretch pb-1">
              {columns.map((column: any, colIdx: number) => {
                let columnTasks = tasks.filter((task: any) => {
                  if (task.column_id !== column.id) return false;
                  if (
                    selectedAssigneeId !== null &&
                    task.assigned_to !== selectedAssigneeId
                  )
                    return false;

                  if (
                    selectedLabelId !== null &&
                    (!task.labels || !task.labels.some((l: any) => l.id === selectedLabelId))
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
                    className="flex-1 min-w-[260px] sm:min-w-[280px] md:min-w-[300px] max-w-[440px] shrink-0 flex flex-col bg-brand-surface border border-brand-border/80 rounded-2xl p-2 sm:p-2.5 h-full shadow-2xs transition-all overflow-hidden"
                  >
                    <div className="flex justify-between items-center px-2 py-2 mb-2 relative border-b border-brand-border/40 pb-2.5">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            column.column_type === 'DONE'
                              ? 'bg-emerald-500 shadow-xs'
                              : column.column_type === 'IN_PROGRESS'
                              ? 'bg-amber-500 shadow-xs'
                              : 'bg-brand-primary shadow-xs'
                          }`}
                        />
                        {editingColumnId === column.id ? (
                          <div className="flex items-center gap-1.5 flex-1 mr-2">
                            <input
                              type="text"
                              value={editingColumnName}
                              onChange={(e) => setEditingColumnName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveColumnRename(column.id);
                                if (e.key === 'Escape') setEditingColumnId(null);
                              }}
                              autoFocus
                              className="w-full px-2 py-1 text-sm bg-brand-surface-low border border-brand-border rounded text-brand-text focus:outline-none focus:border-brand-primary"
                            />
                            <button
                              onClick={() => handleSaveColumnRename(column.id)}
                              className="p-1 hover:bg-brand-surface-container rounded text-emerald-500 cursor-pointer"
                              title="Save"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingColumnId(null)}
                              className="p-1 hover:bg-brand-surface-container rounded text-brand-text-muted cursor-pointer"
                              title="Cancel"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <h3
                              onDoubleClick={() => {
                                if (canManageColumns) {
                                  setEditingColumnId(column.id);
                                  setEditingColumnName(column.name);
                                }
                              }}
                              className={`font-bold text-xs sm:text-sm tracking-wide text-brand-text uppercase truncate ${
                                canManageColumns ? 'cursor-pointer hover:text-brand-primary' : ''
                              }`}
                              title={canManageColumns ? 'Double-click to rename' : undefined}
                            >
                              {column.name}
                            </h3>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="px-2.5 py-0.5 rounded-full bg-brand-surface-low text-brand-text-muted border border-brand-border text-xs font-semibold shrink-0">
                          {columnTasks.length}
                        </span>

                        {canManageColumns && (
                          <div className="relative">
                            <button
                              onClick={() =>
                                setOpenMenuColumnId(openMenuColumnId === column.id ? null : column.id)
                              }
                              className="p-1 text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low rounded-lg transition-colors cursor-pointer"
                            >
                              <MoreVertical size={16} />
                            </button>

                            {openMenuColumnId === column.id && (
                              <div className="absolute right-0 top-full mt-1 w-48 bg-brand-surface border border-brand-border rounded-xl shadow-xl z-30 py-1 text-sm">
                                <button
                                  onClick={() => {
                                    setEditingColumnId(column.id);
                                    setEditingColumnName(column.name);
                                    setOpenMenuColumnId(null);
                                  }}
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
                                    onClick={async () => {
                                      setOpenMenuColumnId(null);
                                      await renameColumn(column.id, { column_type: type });
                                    }}
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
                                      onClick={() => {
                                        setOpenMenuColumnId(null);
                                        handleMoveColumn(colIdx, -1);
                                      }}
                                      className="p-1 hover:bg-brand-surface-low rounded disabled:opacity-30 cursor-pointer"
                                      title="Move left"
                                    >
                                      <MoveLeft size={14} />
                                    </button>
                                    <button
                                      disabled={colIdx === columns.length - 1}
                                      onClick={() => {
                                        setOpenMenuColumnId(null);
                                        handleMoveColumn(colIdx, 1);
                                      }}
                                      className="p-1 hover:bg-brand-surface-low rounded disabled:opacity-30 cursor-pointer"
                                      title="Move right"
                                    >
                                      <MoveRight size={14} />
                                    </button>
                                  </div>
                                </div>

                                <div className="border-t border-brand-border my-1" />

                                <button
                                  disabled={columns.length <= 1}
                                  onClick={() => {
                                    setOpenMenuColumnId(null);
                                    const target = columns.find((c: any) => c.id !== column.id);
                                    setTargetColumnIdForDelete(target ? target.id : '');
                                    setColumnToDelete({
                                      id: column.id,
                                      name: column.name,
                                      taskCount: columnTasks.length,
                                    });
                                  }}
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

                    <DroppableColumn column={column}>
                      {columnTasks.length === 0 ? (
                        <div className="h-36 flex flex-col items-center justify-center text-brand-text-muted border-2 border-dashed border-brand-border/70 rounded-xl bg-brand-surface-low/50 opacity-60">
                          <p className="text-xs font-medium">No tasks</p>
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
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] bg-brand-surface border border-brand-border shadow-2xl rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 animate-in slide-in-from-bottom-5 duration-200">
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
              disabled={!bulkTargetColumnId || isBulkMoving || isBulkDeleting}
              onClick={handleBulkMove}
              className="bg-brand-primary hover:bg-brand-primary-hover disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {isBulkMoving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Move
            </button>

            {user?.role !== "MEMBER" && (
              <button
                disabled={isBulkDeleting || isBulkMoving}
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="bg-brand-error hover:bg-red-700 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {isBulkDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Delete ({selectedTaskIds.length})
              </button>
            )}

            <button
              onClick={() => setSelectedTaskIds([])}
              className="text-brand-text-muted hover:text-brand-text text-xs px-2 py-1 transition-colors cursor-pointer"
            >
              Clear selection
            </button>
          </div>
        )}

        <ConfirmDialog
          isOpen={showBulkDeleteConfirm}
          onClose={() => setShowBulkDeleteConfirm(false)}
          onConfirm={handleBulkDelete}
          title="Delete Multiple Tasks"
          description={`Are you sure you want to delete ${selectedTaskIds.length} selected task${selectedTaskIds.length !== 1 ? 's' : ''}? This action will soft-delete the tasks and clean up associated notifications.`}
          confirmText="Delete Tasks"
          isDestructive={true}
          isLoading={isBulkDeleting}
        />


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

      {columnToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-brand-surface border border-brand-border rounded-2xl shadow-2xl p-6">
            <h3 className="text-lg font-bold text-brand-text mb-2">
              Delete Column "{columnToDelete.name}"
            </h3>
            {columnToDelete.taskCount > 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-brand-text-muted">
                  This column currently contains <strong className="text-brand-text">{columnToDelete.taskCount}</strong> task card(s). Select a destination column to migrate all existing cards into before deleting:
                </p>
                <div>
                  <label className="block text-xs font-semibold text-brand-text-muted mb-1">
                    Destination Column
                  </label>
                  <select
                    value={targetColumnIdForDelete}
                    onChange={(e) => setTargetColumnIdForDelete(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-brand-surface-low border border-brand-border rounded-xl text-sm text-brand-text focus:outline-none focus:border-brand-primary cursor-pointer"
                  >
                    {columns
                      .filter((c: any) => c.id !== columnToDelete.id)
                      .map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.column_type})
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            ) : (
              <p className="text-sm text-brand-text-muted">
                Are you sure you want to delete this column? This action will soft-delete the column.
              </p>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setColumnToDelete(null)}
                className="px-4 py-2 text-sm text-brand-text-muted hover:bg-brand-surface-low rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteColumn}
                disabled={columnToDelete.taskCount > 0 && !targetColumnIdForDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {columnToDelete.taskCount > 0 ? 'Migrate Cards & Delete' : 'Delete Column'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
};

export default KanbanBoard;
