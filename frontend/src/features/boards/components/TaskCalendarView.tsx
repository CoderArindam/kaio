import React, { useState, useEffect, useMemo } from 'react';
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Plus,
  Inbox,
  CheckSquare,
} from 'lucide-react';
import { useTaskStore } from '../../../store/taskStore';
import { useUiStore } from '../../../store/uiStore';
import { useAuthStore } from '../../../store/authStore';
import { type Task } from '../../../services/tasksApi';
import AssigneeFilter from './AssigneeFilter';
import DueDateFilter, { type DueDateFilterOption } from './DueDateFilter';
import LabelFilter from './LabelFilter';
import TaskDetailsModal from '../modals/task-details';
import CreateTaskModal from '../modals/CreateTaskModal';
import { UserAvatar } from '../../../components/common/UserAvatar';

interface TaskCalendarViewProps {
  boardId: number;
}

type CalendarSubView = 'month' | 'week';

export const TaskCalendarView: React.FC<TaskCalendarViewProps> = ({ boardId }) => {
  const {
    getColumnsList,
    getBoardTasksList,
    getBoardMembersList,
    boardView,
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

  // Calendar navigation state
  const [calendarSubView, setCalendarSubView] = useState<CalendarSubView>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [showUnscheduled, setShowUnscheduled] = useState<boolean>(true);

  useEffect(() => {
    initializeBoard(boardId);
  }, [boardId, initializeBoard]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
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
  }, [tasks, selectedAssigneeIds, selectedLabelId, selectedDueDateFilter, columns]);

  // Group tasks by date string (YYYY-MM-DD)
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    filteredTasks.forEach((task) => {
      if (task.due_date) {
        const dateStr = task.due_date.substring(0, 10);
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push(task);
      }
    });
    return map;
  }, [filteredTasks]);

  // Unscheduled tasks
  const unscheduledTasks = useMemo(() => {
    return filteredTasks.filter((t) => !t.due_date);
  }, [filteredTasks]);

  // Navigation handlers
  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (calendarSubView === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (calendarSubView === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Generate grid days for Month view
  const monthGridDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sun

    const lastDayOfMonth = new Date(year, month + 1, 0);
    const totalDaysInMonth = lastDayOfMonth.getDate();

    const days: Array<{ date: Date; isCurrentMonth: boolean; key: string }> = [];

    // Previous month padding days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      const key = d.toISOString().substring(0, 10);
      days.push({ date: d, isCurrentMonth: false, key });
    }

    // Current month days
    for (let i = 1; i <= totalDaysInMonth; i++) {
      const d = new Date(year, month, i);
      // Ensure key uses local timezone YYYY-MM-DD
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(i).padStart(2, '0');
      const key = `${year}-${monthStr}-${dayStr}`;
      days.push({ date: d, isCurrentMonth: true, key });
    }

    // Next month padding days to complete week grid (42 days total for 6 rows)
    const remainingDays = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remainingDays; i++) {
      const d = new Date(year, month + 1, i);
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const dayStr = String(i).padStart(2, '0');
      const key = `${d.getFullYear()}-${monthStr}-${dayStr}`;
      days.push({ date: d, isCurrentMonth: false, key });
    }

    return days;
  }, [currentDate]);

  // Generate grid days for Week view
  const weekGridDays = useMemo(() => {
    const dayOfWeek = currentDate.getDay(); // 0 = Sun
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - dayOfWeek);

    const days: Array<{ date: Date; isCurrentMonth: boolean; key: string }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);

      const year = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const dayStr = String(d.getDate()).padStart(2, '0');
      const key = `${year}-${monthStr}-${dayStr}`;

      days.push({
        date: d,
        isCurrentMonth: d.getMonth() === currentDate.getMonth(),
        key,
      });
    }
    return days;
  }, [currentDate]);

  const gridDays = calendarSubView === 'month' ? monthGridDays : weekGridDays;

  // Header Title String
  const headerTitle = useMemo(() => {
    if (calendarSubView === 'month') {
      return currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    } else {
      const start = weekGridDays[0]?.date;
      const end = weekGridDays[6]?.date;
      if (!start || !end) return '';
      return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
  }, [calendarSubView, currentDate, weekGridDays]);

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="h-full flex flex-col min-h-0 bg-brand-bg relative overflow-hidden">
      {/* Top Header Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-8 py-3 shrink-0 border-b border-brand-border/60 bg-brand-surface/50">
        <div className="flex items-center gap-3 sm:gap-4">
          <h1 className="text-lg sm:text-2xl font-bold text-brand-text flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-brand-primary" />
            <span className="truncate">{headerTitle}</span>
          </h1>

          <div className="flex items-center bg-brand-surface-low border border-brand-border rounded-lg p-0.5">
            <button
              onClick={handlePrev}
              className="p-1 sm:p-1.5 hover:bg-brand-surface-hover rounded-md text-brand-text-muted hover:text-brand-text transition-colors cursor-pointer"
              title="Previous"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleToday}
              className="px-2 sm:px-2.5 py-1 text-xs font-semibold text-brand-text hover:bg-brand-surface-hover rounded-md transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={handleNext}
              className="p-1 sm:p-1.5 hover:bg-brand-surface-hover rounded-md text-brand-text-muted hover:text-brand-text transition-colors cursor-pointer"
              title="Next"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Unscheduled Sidebar Toggle */}
          <button
            onClick={() => setShowUnscheduled(!showUnscheduled)}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
              showUnscheduled
                ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/30'
                : 'bg-brand-surface-low text-brand-text-muted border-brand-border hover:bg-brand-surface-hover'
            }`}
          >
            <Inbox size={14} />
            <span className="hidden sm:inline">Unscheduled ({unscheduledTasks.length})</span>
            <span className="sm:hidden">({unscheduledTasks.length})</span>
          </button>

          {/* Month / Week Toggle */}
          <div className="flex items-center bg-brand-surface-low border border-brand-border rounded-lg p-0.5">
            <button
              onClick={() => setCalendarSubView('month')}
              className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                calendarSubView === 'month'
                  ? 'bg-brand-surface text-brand-primary shadow-xs'
                  : 'text-brand-text-muted hover:text-brand-text'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setCalendarSubView('week')}
              className={`px-2.5 sm:px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                calendarSubView === 'week'
                  ? 'bg-brand-surface text-brand-primary shadow-xs'
                  : 'text-brand-text-muted hover:text-brand-text'
              }`}
            >
              Week
            </button>
          </div>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="px-4 sm:px-8 flex flex-wrap gap-3 sm:gap-4 items-center py-2.5 sm:py-3 border-b border-brand-border/40 shrink-0">
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

      {/* Main Content Area (Calendar Grid + Unscheduled Side Panel) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Calendar Grid Container */}
        <div className="flex-1 flex flex-col overflow-y-auto px-2 sm:px-4 md:px-8 py-3 sm:py-4">
          {isFetching ? (
            <div className="h-64 flex flex-col items-center justify-center text-brand-text-muted">
              <Loader2 className="w-10 h-10 animate-spin text-brand-primary opacity-50 mb-4" />
              <p>Loading calendar...</p>
            </div>
          ) : (
            <div className="overflow-x-auto w-full flex-1">
              <div className="min-w-[620px] lg:min-w-0 flex-1 flex flex-col min-h-[480px]">
                {/* Day Headers (Sun, Mon, Tue...) */}
                <div className="grid grid-cols-7 gap-px bg-brand-border/50 rounded-t-xl border border-brand-border overflow-hidden shrink-0">
                  {weekDayNames.map((name) => (
                    <div
                      key={name}
                      className="bg-brand-surface-low py-2 text-center text-[11px] sm:text-xs font-semibold text-brand-text-muted uppercase tracking-wider"
                    >
                      {name}
                    </div>
                  ))}
                </div>

                {/* Grid Cells */}
                <div
                  className={`grid grid-cols-7 gap-px bg-brand-border/50 rounded-b-xl border-x border-b border-brand-border overflow-hidden flex-1 ${
                    calendarSubView === 'month' ? 'auto-rows-fr' : 'h-full'
                  }`}
                >
                  {gridDays.map(({ date, isCurrentMonth, key }) => {
                    const dayTasks = tasksByDate[key] || [];
                    const isToday = key === todayStr;

                    return (
                      <div
                        key={key}
                        className={`bg-brand-surface p-1.5 sm:p-2 flex flex-col gap-1 min-h-[85px] transition-colors ${
                          !isCurrentMonth ? 'bg-brand-surface-low/30 text-brand-text-muted opacity-60' : ''
                        } ${isToday ? 'ring-2 ring-brand-primary/40 z-10 bg-brand-primary/5' : ''}`}
                      >
                        {/* Cell Date Header */}
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-xs font-semibold w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center ${
                              isToday
                                ? 'bg-brand-primary text-white font-bold'
                                : isCurrentMonth
                                ? 'text-brand-text'
                                : 'text-brand-text-muted'
                            }`}
                          >
                            {date.getDate()}
                          </span>
                          {dayTasks.length > 0 && (
                            <span className="text-[10px] font-medium text-brand-text-muted bg-brand-surface-low px-1.5 py-0.5 rounded-full">
                              {dayTasks.length}
                            </span>
                          )}
                        </div>

                        {/* Task Pills in Cell */}
                        <div className="flex-1 flex flex-col gap-1 overflow-y-auto max-h-[110px] custom-scrollbar">
                          {dayTasks.map((task) => {
                            const col = columns.find((c) => c.id === task.column_id);
                            const isDone = col?.is_completed;

                            return (
                              <div
                                key={task.id}
                                onClick={() => openTaskModal(task.id)}
                                className={`p-1 sm:p-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-all hover:shadow-sm hover:-translate-y-0.5 group flex items-start justify-between gap-1.5 ${
                                  isDone
                                    ? 'bg-brand-surface-low text-brand-text-muted border-brand-border/60 line-through opacity-75'
                                    : task.priority === 'High'
                                    ? 'bg-red-50/80 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300'
                                    : task.priority === 'Medium'
                                    ? 'bg-orange-50/80 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50 text-orange-700 dark:text-orange-300'
                                    : 'bg-brand-surface-low/80 border-brand-border text-brand-text'
                                }`}
                                title={`${task.title} (${col?.name || 'Task'})`}
                              >
                                <div className="flex items-center gap-1 min-w-0 flex-1">
                                  {isDone && <CheckSquare size={12} className="shrink-0 text-emerald-500" />}
                                  <span className="truncate leading-tight">{task.title}</span>
                                </div>

                                {task.assigned_to && (
                                  <div className="shrink-0">
                                    {(() => {
                                      const assignee = boardMembers.find((m) => m.id === task.assigned_to);
                                      return assignee ? <UserAvatar user={assignee} size="sm" /> : null;
                                    })()}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Unscheduled Side Panel */}
        {showUnscheduled && (
          <aside className="w-full lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-brand-border bg-brand-surface p-4 flex flex-col gap-3 max-h-72 lg:max-h-none overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-brand-border">
              <h3 className="font-semibold text-sm text-brand-text flex items-center gap-2">
                <Inbox size={16} className="text-brand-primary" />
                Unscheduled Tasks
              </h3>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-surface-low text-brand-text-muted">
                {unscheduledTasks.length}
              </span>
            </div>

            {unscheduledTasks.length === 0 ? (
              <div className="p-6 text-center text-xs text-brand-text-muted border-2 border-dashed border-brand-border rounded-xl bg-brand-surface-low/30">
                All tasks have scheduled due dates!
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {unscheduledTasks.map((task) => {
                  const col = columns.find((c) => c.id === task.column_id);
                  const assignee = boardMembers.find((m) => m.id === task.assigned_to);

                  return (
                    <div
                      key={task.id}
                      onClick={() => openTaskModal(task.id)}
                      className="p-3 bg-brand-surface-low hover:bg-brand-surface-hover border border-brand-border rounded-xl cursor-pointer transition flex flex-col gap-2 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-semibold text-brand-text leading-tight line-clamp-2">
                          {task.title}
                        </h4>
                        {task.priority && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase shrink-0 ${
                              task.priority === 'High'
                                ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400'
                                : task.priority === 'Medium'
                                ? 'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400'
                                : 'bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400'
                            }`}
                          >
                            {task.priority}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-brand-text-muted">
                        <span>{col?.name || 'Column'}</span>
                        {assignee && <UserAvatar user={assignee} size="sm" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </aside>
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

export default TaskCalendarView;
