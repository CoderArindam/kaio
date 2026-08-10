import React from 'react';
import { Clock, Loader2, Send, UserX, CheckCircle2, AlertCircle } from 'lucide-react';

interface InvitationTableRowProps {
  invitation: any;
  resendingEmail: string | null;
  onResend: (email: string, role: string) => void;
  onRevoke: (id: number, email: string) => void;
}

export const InvitationTableRow: React.FC<InvitationTableRowProps> = ({
  invitation: inv,
  resendingEmail,
  onResend,
  onRevoke,
}) => {
  const isPending =
    inv.is_pending ?? (!inv.accepted_at && new Date(inv.expires_at) > new Date());
  const isResendingThis = resendingEmail === inv.email;

  return (
    <tr className="hover:bg-brand-surface/50 transition-colors group">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand-surface border border-brand-border flex items-center justify-center text-brand-primary shrink-0 font-semibold text-xs">
            {inv.email.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-brand-text text-sm truncate">{inv.email}</span>
            <span className="text-xs text-brand-text-muted mt-0.5">Invited workspace member</span>
          </div>
        </div>
      </td>

      <td className="px-6 py-4 whitespace-nowrap">
        <span className="text-xs font-semibold px-3 py-1 rounded-full border bg-brand-surface text-brand-text-muted border-brand-border">
          {inv.role}
        </span>
      </td>

      <td className="px-6 py-4 whitespace-nowrap">
        {isPending ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30 whitespace-nowrap">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Pending
          </span>
        ) : inv.accepted_at ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 whitespace-nowrap">
            <CheckCircle2 size={13} /> Accepted
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border bg-rose-500/10 text-rose-400 border-rose-500/30 whitespace-nowrap">
            <AlertCircle size={13} /> Expired / Revoked
          </span>
        )}
      </td>

      <td className="px-6 py-4 text-brand-text-muted text-sm whitespace-nowrap">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <Clock size={14} className="opacity-60 shrink-0" />
          <span>{new Date(inv.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </div>
      </td>

      <td className="px-6 py-4 text-center whitespace-nowrap">
        {isPending ? (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => onResend(inv.email, inv.role)}
              disabled={isResendingThis}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-brand-surface hover:bg-brand-border text-brand-text border border-brand-border transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              title="Resend invitation email"
            >
              {isResendingThis ? <Loader2 size={13} className="animate-spin text-brand-primary" /> : <Send size={13} />}
              Resend
            </button>
            <button
              onClick={() => onRevoke(inv.id, inv.email)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition-colors cursor-pointer flex items-center gap-1.5"
              title="Revoke invitation link"
            >
              <UserX size={13} /> Revoke
            </button>
          </div>
        ) : (
          <span className="text-xs text-brand-text-muted italic">—</span>
        )}
      </td>
    </tr>
  );
};

export default InvitationTableRow;
