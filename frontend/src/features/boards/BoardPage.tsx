import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Settings, Folder, LayoutGrid, List, Calendar } from 'lucide-react';
import KanbanBoard from './components/KanbanBoard';
import TaskListView from './components/TaskListView';
import TaskCalendarView from './components/TaskCalendarView';
import { useBoardStore } from '../../store/boardStore';
import { useProjectSettingsStore, type ViewMode } from '../../store/projectSettingsStore';
import { useAuthStore } from '../../store/authStore';
import { usePageTitle } from '../../hooks/usePageTitle';
import { ProjectIdentity } from '../../components/common/ProjectIdentity';
import EmptyState from '../../components/common/EmptyState';

import BoardProposalsBadge from '../proposals/components/BoardProposalsBadge';
import { sendWsMessage } from '../../hooks/useWebSocket';

export const Board: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { boards, fetchBoards } = useBoardStore();
  const { getViewMode, setViewMode } = useProjectSettingsStore();
  const { user } = useAuthStore();
  
  const userRole = (user?.role || '').toUpperCase();
  const isManagerOrAdmin = ['SUPER_ADMIN', 'MANAGER'].includes(userRole);

  useEffect(() => {
    if (boards.length === 0) {
      fetchBoards();
    }
  }, [boards.length, fetchBoards]);

  const boardId = id ? parseInt(id, 10) : 0;
  const board = boards.find((b: any) => b.id === boardId);

  const viewMode: ViewMode = getViewMode(boardId);

  // Subscribe to real-time board events via the shared WebSocket connection
  useEffect(() => {
    if (!boardId) return;
    sendWsMessage({ type: 'subscribe_board', board_id: boardId });
    return () => {
      sendWsMessage({ type: 'unsubscribe_board', board_id: boardId });
    };
  }, [boardId]);

  usePageTitle(board ? `${board.icon || ''} ${board.name}`.trim() : "Board");

  if (board && board.archived_at) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-8">
         <EmptyState
            icon={<Folder size={48} />}
            title="Project Archived"
            description="This project has been archived and is no longer accessible."
            action={
               <Link to="/dashboard" className="px-5 py-2.5 bg-brand-primary text-white rounded-full text-sm font-medium hover:bg-brand-primary-hover transition-colors">
                 Return to Dashboard
               </Link>
            }
         />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 px-4 sm:px-8 py-3.5 sm:py-6 bg-brand-surface border-b border-brand-border shrink-0">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Link
            to="/dashboard"
            className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-brand-surface-low text-brand-text-muted hover:text-brand-text transition-colors shrink-0"
            title="Back to Projects"
          >
            <ArrowLeft size={18} />
          </Link>
          {board ? (
            <ProjectIdentity board={board} showKey size="lg" />
          ) : (
            <h1 className="text-lg sm:text-2xl font-bold text-brand-text">Board {id}</h1>
          )}
        </div>

        {/* View Mode Toggle Controls */}
        <div className="flex items-center bg-brand-surface-low border border-brand-border rounded-xl p-1 shadow-2xs">
          <button
            onClick={() => setViewMode(boardId, 'board')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'board'
                ? 'bg-brand-surface text-brand-primary shadow-xs font-bold'
                : 'text-brand-text-muted hover:text-brand-text'
            }`}
          >
            <LayoutGrid size={15} />
            <span className="hidden sm:inline">Board</span>
          </button>

          <button
            onClick={() => setViewMode(boardId, 'list')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'list'
                ? 'bg-brand-surface text-brand-primary shadow-xs font-bold'
                : 'text-brand-text-muted hover:text-brand-text'
            }`}
          >
            <List size={15} />
            <span className="hidden sm:inline">List</span>
          </button>

          <button
            onClick={() => setViewMode(boardId, 'calendar')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'calendar'
                ? 'bg-brand-surface text-brand-primary shadow-xs font-bold'
                : 'text-brand-text-muted hover:text-brand-text'
            }`}
          >
            <Calendar size={15} />
            <span className="hidden sm:inline">Calendar</span>
          </button>
        </div>
        
        {/* Settings & Proposal Badge Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {boardId > 0 && <BoardProposalsBadge boardId={boardId} />}
          {isManagerOrAdmin && (
            <Link
              to={`/board/${boardId}/settings`}
              className="px-3 sm:px-4 py-1.5 sm:py-2 bg-brand-surface-low border border-brand-border hover:bg-brand-surface-hover rounded-md text-xs sm:text-sm font-medium text-brand-text flex items-center gap-1.5 sm:gap-2 transition-colors"
            >
              <Settings size={15} />
              <span className="hidden sm:inline">Project Settings</span>
              <span className="sm:hidden">Settings</span>
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-x-auto bg-brand-bg flex flex-col">
        {!boardId ? (
          <div className="h-full flex items-center justify-center text-brand-text-muted">
            Invalid Board ID
          </div>
        ) : viewMode === 'list' ? (
          <TaskListView boardId={boardId} />
        ) : viewMode === 'calendar' ? (
          <TaskCalendarView boardId={boardId} />
        ) : (
          <KanbanBoard boardId={boardId} />
        )}
      </main>
    </div>
  );
};

export default Board;
