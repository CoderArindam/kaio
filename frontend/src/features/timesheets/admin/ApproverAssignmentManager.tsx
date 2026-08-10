import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldCheck, UserCheck, UserX, CheckCircle2, Loader2, Crown, Shield } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { isSuperAdmin } from '../../../lib/rbac';
import {
  getApproverAssignments,
  getAllManagersWithApproverStatus,
  assignApprover,
  removeApprover,
  type ApproverAssignment,
  type EligibleApprover,
} from '../../../services/timesheetAdminService';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';

const getRoleIcon = (role: string) => {
  if (role === 'SUPER_ADMIN') return <Crown size={12} className="text-amber-400" />;
  return <Shield size={12} className="text-brand-primary" />;
};

const getRoleBadgeClass = (role: string) => {
  if (role === 'SUPER_ADMIN')
    return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
  return 'bg-brand-primary/10 text-brand-primary border-brand-primary/25';
};

const getInitials = (name: string) =>
  name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

/** Find assignment for a manager by UUID or email (handles curly-brace UUID formats from DB) */
const findAssignment = (
  assignments: ApproverAssignment[],
  manager: EligibleApprover
): ApproverAssignment | undefined => {
  const normalizeId = (id: string) =>
    id.toLowerCase().replace(/[{}]/g, '').trim();

  return assignments.find((a) => {
    const sameId = normalizeId(a.approver_user_id) === normalizeId(manager.user_id);
    const sameEmail = a.approver_email?.toLowerCase() === manager.email?.toLowerCase();
    return sameId || sameEmail;
  });
};

export const ApproverAssignmentManager: React.FC = () => {
  const { user } = useAuthStore();
  const canEdit = isSuperAdmin(user);

  const [assignments, setAssignments] = useState<ApproverAssignment[]>([]);
  const [managers, setManagers] = useState<EligibleApprover[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [assignmentsRes, managersRes] = await Promise.all([
        getApproverAssignments(),
        canEdit ? getAllManagersWithApproverStatus() : Promise.resolve([]),
      ]);
      setAssignments(assignmentsRes);
      setManagers(managersRes);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load approver configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [canEdit]);

  const handleDesignate = async (manager: EligibleApprover) => {
    if (!canEdit || manager.is_approver) return; // guard duplicate designation
    setActionUserId(manager.user_id);
    try {
      await assignApprover({ approver_user_id: manager.user_id });
      toast.success(`${manager.display_name} designated as an approver`);
      await loadData();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail?.toLowerCase().includes('already') || detail?.toLowerCase().includes('duplicate')) {
        toast.error('This user is already an approver.');
      } else {
        toast.error(detail || err.message || 'Failed to designate approver');
      }
    } finally {
      setActionUserId(null);
    }
  };

  const handleRevoke = async (manager: EligibleApprover) => {
    if (!canEdit || !manager.is_approver) return;
    setActionUserId(manager.user_id);
    try {
      // Re-fetch fresh assignments to avoid stale state
      const freshAssignments = await getApproverAssignments();
      const assignment = findAssignment(freshAssignments, manager);

      if (!assignment) {
        toast.error(`Could not find assignment record for ${manager.display_name}. Please refresh.`);
        return;
      }

      await removeApprover(assignment.id);
      toast.success(`${manager.display_name} removed from approvers`);
      await loadData();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      toast.error(detail || err.message || 'Failed to revoke approver');
    } finally {
      setActionUserId(null);
    }
  };

  if (loading) {
    return (
      <Card variant="glass" className="w-full shadow-lg border-brand-border/60">
        <CardHeader>
          <Skeleton variant="text" width="50%" height={24} />
          <Skeleton variant="text" width="70%" height={16} />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={72} className="w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="glass" className="w-full shadow-xl border-brand-border/70 backdrop-blur-xl">
      <CardHeader className="pb-4 border-b border-brand-border/40">
        <CardTitle className="text-lg font-semibold text-brand-text flex items-center gap-2">
          <ShieldCheck size={20} className="text-brand-primary" />
          Global Organization Approvers
        </CardTitle>
        <CardDescription className="text-xs text-brand-text-muted mt-1">
          Superadmins can designate Managers as valid approvers across the organization. Designated
          approvers can review and approve any timesheet assigned to them upon submission.
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-5">
        {managers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-brand-text-muted">
            <ShieldCheck size={32} className="opacity-30" />
            <p className="text-sm">No managers found in the organization.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {managers.map((m) => {
              const isPending = actionUserId === m.user_id;
              const assignment = findAssignment(assignments, m);
              // Derive is_approver from both API flag and local assignments list
              const isApprover = m.is_approver || !!assignment;

              return (
                <div
                  key={m.user_id}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                    isApprover
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : 'bg-brand-surface-low border-brand-border/50 hover:border-brand-border'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isApprover
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-brand-primary/10 text-brand-primary'
                    }`}
                  >
                    {getInitials(m.display_name)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-brand-text truncate">
                        {m.display_name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border uppercase tracking-wide ${getRoleBadgeClass(m.role)}`}
                      >
                        {getRoleIcon(m.role)}
                        {m.role.replace('_', ' ')}
                      </span>
                      {isApprover && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 size={10} />
                          Active Approver
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-brand-text-muted truncate block">{m.email}</span>
                  </div>

                  {/* Action */}
                  {canEdit && (
                    <div className="shrink-0">
                      {m.role === 'SUPER_ADMIN' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-text-muted opacity-70">
                          <Crown size={13} />
                          Default Access
                        </span>
                      ) : isPending ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-brand-text-muted">
                          <Loader2 size={13} className="animate-spin" />
                          Working…
                        </span>
                      ) : isApprover ? (
                        <button
                          onClick={() => handleRevoke({ ...m, is_approver: true })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500/40 text-red-400 hover:bg-red-500/10 bg-red-500/5 transition-all whitespace-nowrap"
                        >
                          <UserX size={13} />
                          Revoke
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDesignate(m)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-primary text-white hover:bg-brand-primary-hover shadow-sm transition-all whitespace-nowrap"
                        >
                          <UserCheck size={13} />
                          Designate
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ApproverAssignmentManager;
