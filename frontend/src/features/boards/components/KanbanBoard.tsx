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
} from '@dnd-kit/core';
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
import { type Task, bulkMoveTasks, bulkDeleteTasks } from '../../../services/tasksApi';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import { DroppableColumn } from './DroppableColumn';
import { DraggableTask } from './DraggableTask';
import { BulkActionBar } from './BulkActionBar';
import { DeleteColumnDialog } from './DeleteColumnDialog';
import { ColumnHeader } from './ColumnHeader';

interface KanbanBoardProps {
  boardId: number;
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
    setSelectedAssigneeIds,
    initializeBoard,
    renameColumn,
    removeColumn,
    reorderBoardColumns,
    setIsDragging,
  } = useTaskStore();

  const columns = getColumnsList();
  const tasks = getBoardTasksList();
  const boardMembers = getBoardMembersList();
  const { isFetching, selectedAssigneeIds } = boardView;

  const { openTaskModal, openCreateTaskModal } = useUiStore();
  const { user } = useAuthStore();
  const canManageColumns = isManagerOrAdmin(user);

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedDueDateFilter, setSelectedDueDateFilter] = useState<DueDateFilterOption>('All');
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
    if (!editingColumnName.trim()) { setEditingColumnId(null); return; }
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
    if (targetId) await removeColumn(columnToDelete.id, targetId);
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
      await bulkMoveTasks({ task_ids: selectedTaskIds, column_id: Number(bulkTargetColumnId) });
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
      await bulkDeleteTasks({ task_ids: selectedTaskIds });
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const [searchParams] = useSearchParams();

  useEffect(() => {
    const taskIdParam = searchParams.get('taskId');
    if (taskIdParam) {
      const taskIdNum = parseInt(taskIdParam, 10);
      if (!isNaN(taskIdNum)) openTaskModal(taskIdNum);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { initializeBoard(boardId); }, [boardId, initializeBoard]);

  const handleDeleteTask = (taskId: number) => setTaskToDelete(taskId);

  const handleConfirmDeleteTask = async () => {
    if (taskToDelete === null) return;
    setIsDeleting(true);
    await removeTask(taskToDelete);
    setIsDeleting(false);
    setTaskToDelete(null);
  };

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
    if (overId.startsWith('col-')) {
      targetColumnId = parseInt(overId.replace('col-', ''), 10);
    } else if (overId.startsWith('task-')) {
      const overTaskId = parseInt(overId.replace('task-', ''), 10);
      const overTask = tasks.find((t: any) => t.id === overTaskId);
      if (overTask) targetColumnId = overTask.column_id;
    }

    if (targetColumnId === null || task.column_id === targetColumnId) return;
    await moveTask(task.id, targetColumnId);
  };

  const isManager = isManagerOrAdmin(user);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="h-full flex flex-col min-h-0 bg-brand-bg relative overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-8 py-3.5 sm:py-4 shrink-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-brand-text">Kanban</h1>

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
        <div className="px-4 sm:px-8 flex flex-wrap gap-2.5 sm:gap-4 items-center pb-3 shrink-0 bg-brand-bg z-20 relative">
          <AssigneeFilter
            users={boardMembers}
            selectedAssigneeIds={selectedAssigneeIds}
            onChange={(val) => setSelectedAssigneeIds(boardId, val)}
          />
          <DueDateFilter value={selectedDueDateFilter} onChange={setSelectedDueDateFilter} />
          <LabelFilter boardId={boardId} selectedLabelId={selectedLabelId} onChange={setSelectedLabelId} />
        </div>

        {/* Board columns */}
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto px-4 sm:px-8 pb-6 pt-0 custom-scrollbar">
          {isFetching ? (
            <div className="h-full flex flex-col items-center justify-center text-brand-text-muted">
              <Loader2 className="w-10 h-10 animate-spin text-brand-primary opacity-50 mb-4" />
              <p>Loading board...</p>
            </div>
          ) : (
            <div className="flex gap-3 sm:gap-4.5 min-h-full items-stretch pb-1">
              {columns.map((column: any, colIdx: number) => {
                let columnTasks = tasks.filter((task: any) => {
                  if (task.column_id !== column.id) return false;
                  if (selectedAssigneeIds?.length > 0 && !selectedAssigneeIds.includes(task.assigned_to)) return false;
                  if (selectedLabelId !== null && (!task.labels || !task.labels.some((l: any) => l.id === selectedLabelId))) return false;

                  if (selectedDueDateFilter !== 'All') {
                    if (selectedDueDateFilter === 'No Due Date') return !task.due_date;
                    if (!task.due_date) return false;

                    const due = new Date(task.due_date);
                    due.setHours(0, 0, 0, 0);
                    const now = new Date();
                    now.setHours(0, 0, 0, 0);
                    const diffDays = Math.round((due.getTime() - now.getTime()) / (1000 * 3600 * 24));

                    if (selectedDueDateFilter === 'Overdue') return diffDays < 0 && !column.is_completed;
                    if (selectedDueDateFilter === 'Today') return diffDays === 0;
                    if (selectedDueDateFilter === 'This Week') return diffDays >= 0 && diffDays <= 7;
                  }

                  return true;
                });

                columnTasks.sort((a: any, b: any) => {
                  const timeA = new Date(a.updated_at || a.created_at).getTime();
                  const timeB = new Date(b.updated_at || b.created_at).getTime();
                  if (timeA !== timeB) return timeA - timeB;
                  return a.id - b.id;
                });

                const colEstHours = columnTasks.reduce(
                  (sum: number, t: any) => sum + (t.estimate_hours ? Number(t.estimate_hours) : 0),
                  0
                );

                return (
                  <div
                    key={column.id}
                    className="flex-1 min-w-[260px] sm:min-w-[280px] md:min-w-[300px] max-w-[440px] shrink-0 flex flex-col bg-brand-surface border border-brand-border/80 rounded-2xl shadow-2xs transition-all"
                  >
                    <ColumnHeader
                      column={column}
                      colIdx={colIdx}
                      totalColumns={columns.length}
                      taskCount={columnTasks.length}
                      estimatedHours={colEstHours}
                      canManage={canManageColumns}
                      isEditing={editingColumnId === column.id}
                      editingName={editingColumnName}
                      isMenuOpen={openMenuColumnId === column.id}
                      onEditingNameChange={setEditingColumnName}
                      onSaveRename={() => handleSaveColumnRename(column.id)}
                      onCancelRename={() => setEditingColumnId(null)}
                      onStartRename={() => {
                        setEditingColumnId(column.id);
                        setEditingColumnName(column.name);
                        setOpenMenuColumnId(null);
                      }}
                      onToggleMenu={() => setOpenMenuColumnId(openMenuColumnId === column.id ? null : column.id)}
                      onMoveLeft={() => { setOpenMenuColumnId(null); handleMoveColumn(colIdx, -1); }}
                      onMoveRight={() => { setOpenMenuColumnId(null); handleMoveColumn(colIdx, 1); }}
                      onChangeType={async (type) => {
                        setOpenMenuColumnId(null);
                        await renameColumn(column.id, { column_type: type });
                      }}
                      onDeleteRequest={() => {
                        setOpenMenuColumnId(null);
                        const target = columns.find((c: any) => c.id !== column.id);
                        setTargetColumnIdForDelete(target ? target.id : '');
                        setColumnToDelete({ id: column.id, name: column.name, taskCount: columnTasks.length });
                      }}
                    />

                    <DroppableColumn column={column}>
                      {columnTasks.length === 0 ? (
                        <div className="h-36 flex flex-col items-center justify-center text-brand-text-muted border-2 border-dashed border-brand-border/70 rounded-xl bg-brand-surface-low/50 opacity-60">
                          <p className="text-xs font-medium">No tasks</p>
                        </div>
                      ) : (
                        columnTasks.map((task: any) => {
                          const canEdit = user?.role !== 'MEMBER' || task.assigned_to === user?.id;
                          return (
                            <DraggableTask
                              key={task.id}
                              task={task}
                              columns={columns}
                              users={boardMembers}
                              onStatusChange={(newColumnId) => moveTask(task.id, newColumnId)}
                              onDelete={() => handleDeleteTask(task.id)}
                              onAssigneeChange={(assignedTo) => assignTask(task.id, assignedTo)}
                              onOpen={() => openTaskModal(task.id)}
                              canEdit={canEdit}
                              canReassign={canEdit}
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

        {/* Floating Bulk Action Bar */}
        {isMultiSelect && selectedTaskIds.length > 0 && (
          <BulkActionBar
            selectedCount={selectedTaskIds.length}
            columns={columns}
            bulkTargetColumnId={bulkTargetColumnId}
            isBulkMoving={isBulkMoving}
            isBulkDeleting={isBulkDeleting}
            canDelete={user?.role !== 'MEMBER'}
            onTargetColumnChange={setBulkTargetColumnId}
            onMove={handleBulkMove}
            onDelete={() => setShowBulkDeleteConfirm(true)}
            onClearSelection={() => setSelectedTaskIds([])}
          />
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
        {user?.role !== 'MEMBER' && !isMultiSelect && (
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
          <div style={{ opacity: 0.9, cursor: 'grabbing' }}>
            <TaskCard
              task={activeTask}
              columns={columns}
              users={boardMembers}
              onStatusChange={() => {}}
              onDelete={() => {}}
              onAssigneeChange={() => {}}
              onOpen={() => {}}
              canEdit={user?.role !== 'MEMBER' || activeTask.assigned_to === user?.id}
              canReassign={user?.role !== 'MEMBER' || activeTask.assigned_to === user?.id}
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
        <DeleteColumnDialog
          column={columnToDelete}
          columns={columns}
          targetColumnId={targetColumnIdForDelete}
          onTargetColumnChange={setTargetColumnIdForDelete}
          onCancel={() => setColumnToDelete(null)}
          onConfirm={handleConfirmDeleteColumn}
        />
      )}
    </DndContext>
  );
};

export default KanbanBoard;
