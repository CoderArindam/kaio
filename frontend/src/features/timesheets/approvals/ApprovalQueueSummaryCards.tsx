import React from 'react';
import { Clock, CheckCircle2, XCircle, BarChart3, AlertTriangle, RefreshCw } from 'lucide-react';
import type { ApprovalQueueSummary } from '../../../services/timesheetApprovalService';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Button } from '../../../components/ui/Button';

interface ApprovalQueueSummaryCardsProps {
  summary: ApprovalQueueSummary | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
}

export const ApprovalQueueSummaryCards: React.FC<ApprovalQueueSummaryCardsProps> = ({
  summary,
  loading,
  error,
  onRetry,
}) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Skeleton key={idx} variant="card" className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3 text-red-400 text-sm font-medium">
          <AlertTriangle size={18} className="shrink-0" />
          <span>Failed to load summary metrics: {error}</span>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-2 text-xs">
            <RefreshCw size={14} /> Retry
          </Button>
        )}
      </div>
    );
  }

  const oldestPendingDays = summary?.oldest_pending_days ?? 0;
  const isOldestWarning = oldestPendingDays > 2;

  const cards = [
    {
      title: 'Pending Review',
      value: summary?.pending_count ?? 0,
      icon: Clock,
      iconColor: 'bg-[#fef3c7] text-[#78350f] border border-[#fcd34d]/60 dark:bg-amber-950/50 dark:text-[#fde68a] dark:border-amber-700/40',
      warning: isOldestWarning ? `Oldest pending: ${oldestPendingDays} days` : null,
    },
    {
      title: 'Approved This Week',
      value: summary?.approved_this_week ?? 0,
      icon: CheckCircle2,
      iconColor: 'bg-[#dcfce7] text-[#14532d] border border-[#86efac]/60 dark:bg-emerald-950/50 dark:text-[#6ee7b7] dark:border-emerald-700/40',
      warning: null,
    },
    {
      title: 'Rejected This Week',
      value: summary?.rejected_this_week ?? 0,
      icon: XCircle,
      iconColor: 'bg-[#fee2e2] text-[#7f1d1d] border border-[#fca5a5]/60 dark:bg-red-950/50 dark:text-[#fca5a5] dark:border-red-700/40',
      warning: null,
    },
    {
      title: 'Avg Hours Approved',
      value: (summary?.avg_hours_approved ?? 0).toFixed(1),
      icon: BarChart3,
      iconColor: 'bg-[#e0f2fe] text-[#0c4a6e] border border-[#7dd3fc]/60 dark:bg-sky-950/50 dark:text-[#7dd3fc] dark:border-sky-700/40',
      warning: null,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, idx) => {
        const IconComponent = card.icon;
        return (
          <div
            key={idx}
            className="bg-brand-surface border border-brand-border rounded-xl p-4 shadow-md flex flex-col justify-between transition-all hover:border-brand-border/80"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-brand-text-muted uppercase tracking-wider">
                {card.title}
              </span>
              <div className={`p-2 rounded-lg ${card.iconColor}`}>
                <IconComponent size={18} />
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-brand-text font-mono">
                {card.value}
              </span>
            </div>

            {card.warning && (
              <div className="mt-2 text-xs font-semibold bg-[#fef3c7] text-[#78350f] border border-[#fcd34d] dark:bg-amber-950/50 dark:text-[#fde68a] dark:border-amber-700/40 px-2.5 py-1 rounded-md flex items-center gap-1.5">
                <AlertTriangle size={13} className="shrink-0 text-[#92400e] dark:text-[#fde68a]" />
                <span>{card.warning}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ApprovalQueueSummaryCards;
