import React, { useState, useMemo } from "react";

import {
  Kanban,
  Plus,
  FolderPlus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../../../components/ui/Card";
import { Skeleton } from "../../../components/ui/Skeleton";
import { WidgetError } from "../../../components/ui/WidgetError";
import type { DashboardBoardSummary } from "../../../services/dashboardApi";
import EmptyState from "../../../components/common/EmptyState";

import { ProjectCard } from "../../../components/common/ProjectCard";

interface StrategicProjectsWidgetProps {
  userRole?: string;
  summaryBoards: DashboardBoardSummary[];
  activeBoardsFallback: any[];
  isFetching: boolean;
  hasError?: boolean;
  onRetry?: () => void;
  onOpenCreateProjectModal: () => void;
}

export const StrategicProjectsWidget: React.FC<
  StrategicProjectsWidgetProps
> = ({
  userRole = "MEMBER",
  summaryBoards,
  activeBoardsFallback,
  isFetching,
  hasError = false,
  onRetry,
  onOpenCreateProjectModal,
}) => {
  const isSuperAdmin = userRole.toUpperCase() === "SUPER_ADMIN";
  // const { user: currentUser } = useAuthStore();
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 3;

  const displayBoards = useMemo(() => {
    const mappedBoards = summaryBoards.length > 0
      ? summaryBoards.map((sb) => {
          const fallback = activeBoardsFallback.find((b) => b.id === sb.id);
          return {
            id: sb.id,
            name: sb.name,
            project_key: sb.project_key,
            description: sb.description,
            icon: sb.icon,
            color: sb.color,
            cover_gradient: sb.cover_gradient,
            task_count: sb.task_count,
            completed_task_count: sb.completed_task_count,
            completion_percentage: sb.completion_percentage,
            overdue_count: sb.overdue_count,
            member_count: sb.member_count || 1,
            created_at: sb.created_at,
            top_members: sb.top_members || [],
            is_favorited: fallback ? fallback.is_favorited : false,
          };
        })
      : activeBoardsFallback.map((ab) => ({
          id: ab.id,
          name: ab.name,
          project_key: ab.project_key,
          description: ab.description,
          icon: ab.icon,
          color: ab.color,
          cover_gradient: ab.cover_gradient,
          task_count: ab.task_count || 0,
          completed_task_count: ab.completed_task_count || 0,
          completion_percentage:
            ab.task_count > 0
              ? Math.round(
                  ((ab.completed_task_count || 0) / ab.task_count) * 100,
                )
              : 0,
          overdue_count: ab.overdue_count || 0,
          member_count: ab.member_count || 1,
          created_at: ab.created_at,
          top_members: [],
          is_favorited: ab.is_favorited,
        }));

    return mappedBoards.sort((a, b) => {
      // 1. Favorited first
      if (a.is_favorited !== b.is_favorited) {
        return a.is_favorited ? -1 : 1;
      }
      // 2. Created at descending (newest first)
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [summaryBoards, activeBoardsFallback]);

  const totalPages = Math.ceil(displayBoards.length / pageSize) || 1;
  const paginatedBoards = displayBoards.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <Card variant="default" padding="lg" className="space-y-6 shadow-sm">
      <CardHeader className="flex-row items-center justify-between mb-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-lg font-bold text-brand-text flex items-center gap-2">
            <Kanban className="w-5 h-5 text-brand-primary" aria-hidden="true" />
            <span>Strategic Projects Overview</span>
          </CardTitle>
          <CardDescription className="text-xs text-brand-text-muted">
            High-priority organizational initiatives, team assignments, and
            milestone completion
          </CardDescription>
        </div>

        {/* Primary Create Project Action Button */}
        <button
          onClick={onOpenCreateProjectModal}
          className="bg-brand-primary hover:bg-brand-primary-hover text-white px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer focus:ring-2 focus:ring-brand-primary focus:outline-none shrink-0"
        >
          <Plus className="w-4 h-4" /> Create Project
        </button>
      </CardHeader>

      {hasError ? (
        <WidgetError
          title="Could not load projects overview"
          message="Failed to retrieve active project statuses."
          onRetry={onRetry}
        />
      ) : isFetching && displayBoards.length === 0 ? (
        <div
          className="space-y-4"
          aria-busy="true"
          aria-label="Loading strategic projects"
        >
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="p-5 rounded-2xl bg-brand-surface-low/60 border border-brand-border/60 space-y-4 animate-pulse"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2 flex-1">
                  <Skeleton variant="text" width="60%" height={18} />
                  <Skeleton variant="text" width="30%" height={12} />
                </div>
                <Skeleton variant="circular" width={32} height={32} />
              </div>
              <Skeleton variant="rectangular" width="100%" height={8} />
            </div>
          ))}
        </div>
      ) : displayBoards.length === 0 ? (
        <EmptyState
          icon={<FolderPlus size={44} className="text-brand-primary/70" />}
          title={
            isSuperAdmin
              ? "No strategic projects created yet"
              : "No projects assigned yet"
          }
          description={
            isSuperAdmin
              ? "Get started by initializing your team's first Kanban project board."
              : "You currently don't have access to any projects. Contact your administrator to be assigned to a project."
          }
          action={
            isSuperAdmin ? (
              <button
                onClick={onOpenCreateProjectModal}
                className="bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Create Project
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedBoards.map((board) => (
            <ProjectCard key={board.id} board={board} />
          ))}
        </div>
      )}

      {/* Arrow Pagination Toggle at Bottom for > 3 Projects */}
      {displayBoards.length > 3 && (
        <div className="flex items-center justify-between pt-4 border-t border-brand-border/60 text-xs">
          <span className="text-brand-text-muted font-medium">
            Page {currentPage} of {totalPages} ({displayBoards.length} total
            projects)
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-2 rounded-xl border border-brand-border text-brand-text hover:bg-brand-surface-low disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-2 rounded-xl border border-brand-border text-brand-text hover:bg-brand-surface-low disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
};

export default StrategicProjectsWidget;
