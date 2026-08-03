import React, { useEffect, useRef, useState } from 'react';
import { Video, Sparkles, Loader2, Search, Folder } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import {
  useBoardStore,
  useActiveBoards,
  useArchivedBoards,
} from '../../store/boardStore';
import { useUiStore } from '../../store/uiStore';
import { useOrganizationStore } from '../../store/organizationStore';
import { usePageTitle } from '../../hooks/usePageTitle';
import EmptyState from '../../components/common/EmptyState';
import { ProjectCard } from '../../components/common/ProjectCard';
import JoinMeetingModal from '../meeting/components/JoinMeetingModal';
import TranscriptEditor from '../meeting/TranscriptEditor';
import Modal from '../../components/common/Modal';
import toast from 'react-hot-toast';
import { deleteMeetingSession, rerunMeetingPipeline } from '../../services/meetingApi';
import GlobalProposalsModal from '../proposals/components/GlobalProposalsModal';
import {
  getDashboardSummary,
  type DashboardKPIs,
  type DashboardBoardSummary,
  type DashboardActivityItem,
  type DashboardRecentMeeting,
  type DashboardFocusTask,
} from '../../services/dashboardApi';
import { isManagerOrAdmin } from '../../lib/rbac';

// Widgets
import { KpiCardsRow } from './components/KpiCardsRow';
import { StrategicProjectsWidget } from './components/StrategicProjectsWidget';
import { FocusTasksWidget } from './components/FocusTasksWidget';
import { SmartSuggestionsWidget } from './components/SmartSuggestionsWidget';
import { RecentActivityWidget } from './components/RecentActivityWidget';
import { QuickActionsWidget } from './components/QuickActionsWidget';
import { RecentMeetingsWidget } from './components/RecentMeetingsWidget';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export const DashboardView: React.FC = () => {
  const { user } = useAuthStore();
  usePageTitle('Dashboard');

  const { isFetching } = useBoardStore();
  const activeBoards = useActiveBoards();
  const archivedBoards = useArchivedBoards();
  const { openCreateProjectModal } = useUiStore();
  const { profile } = useOrganizationStore();

  const [search, setSearch] = useState('');
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isProposalsModalOpen, setIsProposalsModalOpen] = useState(false);
  const [transcriptEditorSessionId, setTranscriptEditorSessionId] = useState<string | null>(null);

  // Aggregated dashboard summary state
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [summaryBoards, setSummaryBoards] = useState<DashboardBoardSummary[]>([]);
  const [recentActivities, setRecentActivities] = useState<DashboardActivityItem[]>([]);
  const [recentSessions, setRecentSessions] = useState<DashboardRecentMeeting[]>([]);
  const [focusTasks, setFocusTasks] = useState<DashboardFocusTask[]>([]);
  const [pendingProposalsCount, setPendingProposalsCount] = useState<number>(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);
  const [timesheetComplianceRate, setTimesheetComplianceRate] = useState<number>(0);
  const [timesheetHoursLogged, setTimesheetHoursLogged] = useState<number>(0);
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);
  const [hasSummaryError, setHasSummaryError] = useState<boolean>(false);

  const canAccessAdminFeatures = isManagerOrAdmin(user);
  const userName = user?.first_name || (user?.last_name ? user.last_name : null) || 'there';

  // --- Single aggregated fetch ---
  const fetchSummaryData = React.useCallback(async () => {
    if (!canAccessAdminFeatures) return;
    setIsLoadingSummary(true);
    setHasSummaryError(false);
    try {
      const summary = await getDashboardSummary();
      if (summary) {
        setKpis(summary.kpis);
        setSummaryBoards(summary.boards);
        setRecentActivities(summary.recent_activity);
        setRecentSessions(summary.recent_meetings ?? []);
        setFocusTasks(summary.focus_tasks ?? []);
        setPendingProposalsCount(summary.kpis?.pending_proposals_count ?? 0);
        setPendingApprovalsCount(summary.pending_approvals_count ?? 0);
        setTimesheetComplianceRate(summary.timesheet_compliance_rate ?? 0);
        setTimesheetHoursLogged(summary.timesheet_hours_logged ?? 0);
      }
    } catch (err) {
      console.error('Failed to load dashboard summary:', err);
      setHasSummaryError(true);
    } finally {
      setIsLoadingSummary(false);
    }
  }, [canAccessAdminFeatures]);

  // Track latest fetchSummaryData in a ref so WS handler always has current version
  const fetchSummaryRef = useRef(fetchSummaryData);
  useEffect(() => { fetchSummaryRef.current = fetchSummaryData; }, [fetchSummaryData]);

  useEffect(() => {
    if (!canAccessAdminFeatures) return;

    fetchSummaryData();

    // Window focus fallback (no polling — WebSocket handles real-time pushes)
    const handleFocus = () => fetchSummaryRef.current();
    const handleRefresh = () => fetchSummaryRef.current();

    window.addEventListener('focus', handleFocus);
    window.addEventListener('kaio:dashboard_refresh', handleRefresh);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('kaio:dashboard_refresh', handleRefresh);
    };
  }, [canAccessAdminFeatures, fetchSummaryData]);

  // Session mutation handlers (delete/rerun still need direct API calls)
  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteMeetingSession(sessionId);
      setRecentSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const handleRerunPipeline = async (sessionId: string) => {
    try {
      await rerunMeetingPipeline(sessionId);
      toast.success('Meeting pipeline re-run started');
      fetchSummaryData(); // refresh meetings from the aggregated endpoint
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to re-run meeting pipeline');
    }
  };

  const filteredActiveBoards = activeBoards.filter((board: any) =>
    board.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredArchivedBoards = archivedBoards.filter((board: any) =>
    board.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
      {/* Header Greeting & Quick Actions — role-aware */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-brand-text">
            {getGreeting()}, {userName}
          </h1>
          {canAccessAdminFeatures ? (
            (() => {
              const onTrackCount = summaryBoards.length > 0 ? summaryBoards.filter(b => b.overdue_count === 0).length : activeBoards.length;
              const efficiencyRate = kpis && kpis.total_tasks > 0 ? Math.round(((kpis.tasks_by_status?.done || 0) / kpis.total_tasks) * 100) : 0;
              return (
                <p className="text-sm text-brand-text-muted mt-1 font-medium">
                  Today: {pendingProposalsCount} new AI recommendation{pendingProposalsCount === 1 ? '' : 's'}, {onTrackCount} project{onTrackCount === 1 ? '' : 's'} on track, and {efficiencyRate}% efficiency rate.
                </p>
              );
            })()
          ) : (
            <p className="text-sm text-brand-text-muted mt-1 font-medium">
              Here's an overview of your assigned projects and tasks.
            </p>
          )}
        </div>

        {canAccessAdminFeatures && (
          <div className="flex items-center flex-wrap gap-3 shrink-0">
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="bg-brand-primary hover:bg-brand-primary-hover text-white px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all shadow-xs hover:shadow-md cursor-pointer focus:ring-2 focus:ring-brand-primary focus:outline-none"
              aria-label="Start or Join Meeting"
            >
              <Video className="w-4 h-4" aria-hidden="true" />
              Start / Join Meeting
            </button>

            <button
              onClick={() => setIsProposalsModalOpen(true)}
              className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all shadow-xs hover:shadow-md cursor-pointer focus:ring-2 focus:ring-teal-500 focus:outline-none"
              aria-label="View AI Proposals"
            >
              <Sparkles className="w-4 h-4 text-white" aria-hidden="true" />
              View Proposals ({pendingProposalsCount})
            </button>
          </div>
        )}
      </div>

      {/* MEMBER ROLE VIEW */}
      {!canAccessAdminFeatures ? (
        <div className="space-y-8">
          <section className="space-y-6" aria-label="Member Active Projects">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-lg font-bold text-brand-text">Active Projects</h2>
                <p className="text-xs text-brand-text-muted">Your assigned Kanban boards</p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-outline"
                  aria-hidden="true"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects..."
                  className="w-full pl-9 pr-4 py-2 bg-brand-surface border border-brand-border rounded-full text-xs outline-none focus:border-brand-primary transition-colors text-brand-text placeholder:text-brand-text-muted"
                  aria-label="Search assigned projects"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {isFetching ? (
                <div className="col-span-full h-48 flex flex-col items-center justify-center text-brand-text-muted">
                  <Loader2 className="w-7 h-7 animate-spin mb-3 text-brand-primary opacity-50" />
                  <p className="text-xs">Loading projects...</p>
                </div>
              ) : filteredActiveBoards.length === 0 ? (
                <div className="col-span-full">
                  <EmptyState
                    icon={<Folder size={48} />}
                    title={search ? 'No matching projects.' : 'No active projects yet.'}
                    description="You will see your assigned projects here."
                  />
                </div>
              ) : (
                filteredActiveBoards.map((board: any) => (
                  <ProjectCard key={board.id} board={board} className="shadow-xs hover:shadow-md" />
                ))
              )}
            </div>
          </section>
        </div>
      ) : (
        /* MANAGER & SUPERADMIN DASHBOARD LAYOUT */
        <div className="space-y-8">
          {/* 1. KPI Cards Row */}
          <KpiCardsRow
            kpis={kpis}
            isLoading={isLoadingSummary}
            hasError={hasSummaryError}
            onRetry={fetchSummaryData}
            totalTasksFallback={activeBoards.reduce((acc: number, b: any) => acc + (b.task_count || 0), 0)}
            activeBoardsFallback={activeBoards.length}
            pendingProposalsCount={pendingProposalsCount}
            organizationName={profile?.name}
            onOpenProposalsModal={() => setIsProposalsModalOpen(true)}
            pendingApprovalsCount={pendingApprovalsCount}
            timesheetComplianceRate={timesheetComplianceRate}
            timesheetHoursLogged={timesheetHoursLogged}
          />

          {/* 2. Main Content 2-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* LEFT COLUMN */}
            <div className="lg:col-span-8 space-y-8">
              <StrategicProjectsWidget
                summaryBoards={summaryBoards}
                activeBoardsFallback={activeBoards}
                isFetching={isFetching || isLoadingSummary}
                hasError={hasSummaryError}
                onRetry={fetchSummaryData}
                onOpenCreateProjectModal={openCreateProjectModal}
              />
            </div>

            {/* RIGHT COLUMN */}
            <div className="lg:col-span-4 space-y-8">
              <QuickActionsWidget
                userRole={user?.role || 'MEMBER'}
                pendingPropsCount={pendingProposalsCount}
                onOpenJoinModal={() => setIsJoinModalOpen(true)}
                onOpenProposalsModal={() => setIsProposalsModalOpen(true)}
                onOpenCreateProjectModal={openCreateProjectModal}
              />

              <FocusTasksWidget
                pendingPropsCount={pendingProposalsCount}
                onOpenProposalsModal={() => setIsProposalsModalOpen(true)}
                summaryBoards={summaryBoards}
                prefetchedTasks={focusTasks}
              />

              <SmartSuggestionsWidget
                summaryBoards={summaryBoards}
                pendingProposals={pendingProposalsCount}
                onOpenJoinModal={() => setIsJoinModalOpen(true)}
                onOpenProposalsModal={() => setIsProposalsModalOpen(true)}
                onProposalProcessed={fetchSummaryData}
              />

              <RecentMeetingsWidget
                sessions={recentSessions}
                isLoading={isLoadingSummary}
                onRetry={fetchSummaryData}
                pendingPropsCount={pendingProposalsCount}
                onDeleteSession={handleDeleteSession}
                onOpenJoinModal={() => setIsJoinModalOpen(true)}
                onOpenProposalsModal={() => setIsProposalsModalOpen(true)}
                onRerunPipeline={handleRerunPipeline}
                onOpenTranscriptEditor={(id) => setTranscriptEditorSessionId(id)}
              />

              <RecentActivityWidget
                activities={recentActivities}
                isLoading={isLoadingSummary}
                hasError={hasSummaryError}
                onRetry={fetchSummaryData}
              />
            </div>
          </div>
        </div>
      )}

      {/* Archived Projects Section */}
      {filteredArchivedBoards.length > 0 && (
        <section className="pt-8 border-t border-brand-border space-y-6 pb-24" aria-label="Archived Projects">
          <div>
            <h2 className="text-lg font-bold text-brand-text">Archived Projects</h2>
            <p className="text-xs text-brand-text-muted mt-0.5">
              Read-only view of projects that have been archived.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredArchivedBoards.map((board: any) => (
              <div key={board.id} className="opacity-70 grayscale-[30%] pointer-events-none">
                <ProjectCard board={board} isLink={false} className="shadow-xs" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Modals */}
      <JoinMeetingModal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)} />

      <GlobalProposalsModal
        isOpen={isProposalsModalOpen}
        onClose={() => setIsProposalsModalOpen(false)}
        onProposalsUpdated={fetchSummaryData}
      />

      <Modal
        isOpen={!!transcriptEditorSessionId}
        onClose={() => setTranscriptEditorSessionId(null)}
        width="max-w-3xl"
        hideCloseButton={true}
        noPadding={true}
      >
        {transcriptEditorSessionId && (
          <TranscriptEditor
            sessionId={transcriptEditorSessionId}
            onClose={() => setTranscriptEditorSessionId(null)}
            onSaved={fetchSummaryData}
          />
        )}
      </Modal>
    </div>
  );
};

export default DashboardView;
