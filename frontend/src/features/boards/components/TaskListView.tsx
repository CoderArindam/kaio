import React, { useState, useEffect } from 'react';
import { Loader2, ArrowUpDown, ArrowUp, ArrowDown, Plus } from 'lucide-react';
import { useTaskStore } from '../../../store/taskStore';
import { useUiStore } from '../../../store/uiStore';
import { useAuthStore } from '../../../store/authStore';
import TaskCard from './TaskCard';
import AssigneeFilter from './AssigneeFilter';
import DueDateFilter, { type DueDateFilterOption } from './DueDateFilter';
import LabelFilter from './LabelFilter';
import TaskDetailsModal from '../modals/task-details';
import CreateTaskModal from '../modals/CreateTaskModal';

interface TaskListViewProps {
  boardId: number;
}

type SortField = 'title' | 'status' | 'assignee' | 'priority' | 'due_date';
type SortOrder = 'asc' | 'desc';

export const TaskListView: React.FC<TaskListViewProps> = ({ boardId }) => {
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
  } = useTaskStore();

  const columns = getColumnsList();
  const tasks = getBoardTasksList();
  const boardMembers = getBoardMembersList();
  const { isFetching, selectedAssigneeIds } = boardView;

  const { openTaskModal, openCreateTaskModal } = useUiStore();
  const { user } = useAuthStore();

  const [selectedDueDateFilter, setSelectedDueDateFilter] = useState<DueDateFilterOption>('All');
  const [selectedLabelId, setSelectedLabelId] = useState<number | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('due_date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  useEffect(() => {
    initializeBoard(boardId);
  }, [boardId, initializeBoard]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    if (selectedAssigneeIds && selectedAssigneeIds.length > 0 && !selectedAssigneeIds.includes(task.assigned_to as number)) {
      return false;
    }

    if (
      selectedLabelId !== null &&
      (!task.labels || !task.labels.some((l) => l.id === selectedLabelId))
    ) {
      return false;
    }

    if (selectedDueDateFilter !== 'All') {
      if (selectedDueDateFilter === 'No Due Date') return !task.due_date;
      if (!task.due_date) return false;

      const due = new Date(task.due_date);
      due.setHours(0, 0, 0, 0);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diffDays = Math.round((due.getTime() - now.getTime()) / (1000 * 3600 * 24));

      const col = columns.find((c) => c.id === task.column_id);
      if (selectedDueDateFilter === 'Overdue') return diffDays < 0 && !col?.is_completed;
      if (selectedDueDateFilter === 'Today') return diffDays === 0;
      if (selectedDueDateFilter === 'This Week') return diffDays >= 0 && diffDays <= 7;
    }

    return true;
  });

  // Sort tasks
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    let result = 0;

    switch (sortField) {
      case 'title':
        result = a.title.localeCompare(b.title);
        break;
      case 'status': {
        const colA = columns.find((c) => c.id === a.column_id);
        const colB = columns.find((c) => c.id === b.column_id);
        const posA = colA ? colA.position : 0;
        const posB = colB ? colB.position : 0;
        result = posA - posB;
        break;
      }
      case 'assignee': {
        const memberA = boardMembers.find((m) => m.id === a.assigned_to);
        const memberB = boardMembers.find((m) => m.id === b.assigned_to);
        const nameA = memberA ? memberA.first_name || memberA.email : 'ZZZZ';
        const nameB = memberB ? memberB.first_name || memberB.email : 'ZZZZ';
        result = nameA.localeCompare(nameB);
        break;
      }
      case 'priority': {
        const priorityWeight = { High: 3, Medium: 2, Low: 1 };
        const weightA = a.priority ? priorityWeight[a.priority as keyof typeof priorityWeight] || 0 : 0;
        const weightB = b.priority ? priorityWeight[b.priority as keyof typeof priorityWeight] || 0 : 0;
        result = weightA - weightB;
        break;
      }
      case 'due_date': {
        if (!a.due_date && !b.due_date) result = 0;
        else if (!a.due_date) result = 1;
        else if (!b.due_date) result = -1;
        else result = new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        break;
      }
    }

    return sortOrder === 'asc' ? result : -result;
  });

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-brand-text-muted opacity-50 group-hover:opacity-100" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-brand-primary" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-brand-primary" />
    );
  };

  return (
    <div className="h-full flex flex-col min-h-0 bg-brand-bg relative overflow-hidden">
      {/* Header Bar */}
      <header className="flex flex-wrap items-center justify-between px-4 sm:px-8 py-3.5 shrink-0 gap-2">
        <h1 className="text-lg sm:text-2xl font-bold text-brand-text flex items-center gap-2">
          List View
          <span className="text-xs font-normal px-2.5 py-0.5 rounded-full bg-brand-surface-low text-brand-text-muted border border-brand-border">
            {sortedTasks.length} {sortedTasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </h1>
      </header>

      {/* Filter Bar */}
      <div className="px-4 sm:px-8 flex flex-wrap gap-2.5 sm:gap-4 items-center pb-3">
        <AssigneeFilter
          users={boardMembers}
          selectedAssigneeIds={selectedAssigneeIds}
          onChange={(val) => setSelectedAssigneeIds(boardId, val)}
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

      {/* Main List Table Container */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-8 pb-24">
        {isFetching ? (
          <div className="h-64 flex flex-col items-center justify-center text-brand-text-muted">
            <Loader2 className="w-10 h-10 animate-spin text-brand-primary opacity-50 mb-4" />
            <p>Loading tasks...</p>
          </div>
        ) : sortedTasks.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-brand-border rounded-2xl bg-brand-surface-low/40 p-8 text-center text-brand-text-muted">
            <p className="text-base font-semibold text-brand-text mb-1">No tasks found</p>
            <p className="text-xs">Adjust your active filters or create a new task to get started.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-w-6xl mx-auto">
            {/* Table Header Bar */}
            <div className="hidden md:flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-brand-text-muted uppercase tracking-wider bg-brand-surface sticky top-0 z-10 rounded-xl border border-brand-border shadow-2xs">
              <button
                onClick={() => handleSort('title')}
                className="group flex items-center gap-1.5 flex-1 text-left cursor-pointer hover:text-brand-text transition-colors"
              >
                Task Title {renderSortIcon('title')}
              </button>
              <button
                onClick={() => handleSort('status')}
                className="group flex items-center gap-1.5 w-32 justify-start cursor-pointer hover:text-brand-text transition-colors"
              >
                Status {renderSortIcon('status')}
              </button>
              <button
                onClick={() => handleSort('priority')}
                className="group flex items-center gap-1.5 w-28 justify-start cursor-pointer hover:text-brand-text transition-colors"
              >
                Priority {renderSortIcon('priority')}
              </button>
              <button
                onClick={() => handleSort('due_date')}
                className="group flex items-center gap-1.5 w-36 justify-start cursor-pointer hover:text-brand-text transition-colors"
              >
                Due Date {renderSortIcon('due_date')}
              </button>
              <button
                onClick={() => handleSort('assignee')}
                className="group flex items-center gap-1.5 w-28 justify-end cursor-pointer hover:text-brand-text transition-colors"
              >
                Assignee {renderSortIcon('assignee')}
              </button>
            </div>

            {/* Task Rows */}
            {sortedTasks.map((task) => {
              const canEdit = user?.role !== 'MEMBER' || task.assigned_to === user?.id;
              const canReassign = canEdit;

              return (
                <TaskCard
                  key={task.id}
                  task={task}
                  columns={columns}
                  users={boardMembers}
                  variant="list"
                  onStatusChange={(newColumnId) => moveTask(task.id, newColumnId)}
                  onDelete={() => removeTask(task.id)}
                  onAssigneeChange={(assignedTo) => assignTask(task.id, assignedTo)}
                  onOpen={() => openTaskModal(task.id)}
                  canEdit={canEdit}
                  canReassign={canReassign}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Create Task Button */}
      {user?.role !== 'MEMBER' && (
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

      {/* Shared Modals */}
      <TaskDetailsModal />
      <CreateTaskModal />
    </div>
  );
};

export default TaskListView;
