import React from "react";
import { Mail, Clock, Trash2, Copy, Check } from "lucide-react";
import { UserAvatar } from "../../components/common/UserAvatar";

interface UserTableRowProps {
  user: any;
  currentUserId: number | undefined;
  currentUserFirstName?: string | null;
  currentUserLastName?: string | null;
  copiedEmail: string | null;
  onRoleChange: (userId: number, role: string) => void;
  onDelete: (userId: number) => void;
  onCopyEmail: (email: string) => void;
  formatDisplayName: (u: any) => string;
}

export const UserTableRow: React.FC<UserTableRowProps> = ({
  user: u,
  currentUserId,
  currentUserFirstName,
  currentUserLastName,
  copiedEmail,
  onRoleChange,
  onDelete,
  onCopyEmail,
  formatDisplayName,
}) => {
  const isSelf = u.id === currentUserId;
  const firstName = u.first_name || (isSelf ? currentUserFirstName : null);
  const lastName = u.last_name || (isSelf ? currentUserLastName : null);
  const avatarUser = { ...u, first_name: firstName, last_name: lastName };
  const displayName = formatDisplayName(u);

  return (
    <tr className="hover:bg-brand-surface/50 transition-colors group">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3.5">
          <UserAvatar
            user={avatarUser}
            size="lg"
            className="ring-1 ring-brand-border"
          />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-brand-text text-sm truncate">
                {displayName}
              </span>
              {isSelf && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-brand-primary/15 text-brand-primary border border-brand-primary/30 shrink-0">
                  You
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-brand-text-muted mt-0.5">
              <Mail size={12} className="shrink-0 opacity-65" />
              <span className="truncate">{u.email}</span>
              <button
                onClick={() => onCopyEmail(u.email)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-brand-text-muted hover:text-brand-text transition-opacity ml-1 cursor-pointer"
                title="Copy email address"
              >
                {copiedEmail === u.email ? (
                  <Check size={12} className="text-green-500" />
                ) : (
                  <Copy size={12} />
                )}
              </button>
            </div>
          </div>
        </div>
      </td>

      <td className="px-6 py-4 whitespace-nowrap">
        <div className="relative inline-block">
          <select
            value={u.role}
            onChange={(e) => onRoleChange(u.id, e.target.value)}
            disabled={isSelf}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all appearance-none pr-7 ${
              u.role === "SUPER_ADMIN"
                ? "bg-purple-500/10 text-purple-400 border-purple-500/30 hover:border-purple-500/60"
                : u.role === "MANAGER"
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/30 hover:border-blue-500/60"
                  : "bg-slate-500/10 text-slate-300 border-slate-500/30 hover:border-slate-500/60"
            }`}
          >
            <option
              value="MEMBER"
              className="bg-brand-surface text-brand-text font-normal"
            >
              MEMBER
            </option>
            <option
              value="MANAGER"
              className="bg-brand-surface text-brand-text font-normal"
            >
              MANAGER
            </option>
            <option
              value="SUPER_ADMIN"
              className="bg-brand-surface text-brand-text font-normal"
            >
              SUPER_ADMIN
            </option>
          </select>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] opacity-60">
            ▼
          </span>
        </div>
      </td>

      <td className="px-6 py-4 text-brand-text-muted text-sm whitespace-nowrap">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <Clock size={14} className="opacity-60 shrink-0" />
          <span>
            {new Date(u.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </td>

      <td className="px-6 py-4 text-center whitespace-nowrap">
        <div className="flex justify-center items-center gap-2">
          <button
            onClick={() => onDelete(u.id)}
            disabled={isSelf}
            className="p-2 text-brand-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-brand-text-muted cursor-pointer"
            title={isSelf ? "Cannot delete your own account" : "Delete user"}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </td>
    </tr>
  );
};

export default UserTableRow;
