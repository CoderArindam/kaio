import React, { useEffect, useState } from "react";
import { useAdminStore } from "../../store/adminStore";
import { useAuthStore } from "../../store/authStore";
import {
  Trash2,
  Loader2,
  Users,
  Mail,
  UserX,
  Search,
  ShieldCheck,
  UserCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  Copy,
  Check,
  Shield,
} from "lucide-react";
import { UserAvatar } from "../../components/common/UserAvatar";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useOrganizationStore } from "../../store/organizationStore";
import { InviteUserModal } from "./modals/InviteUserModal";
import { RevokeInvitationModal } from "./modals/RevokeInvitationModal";
import { DeleteUserModal } from "./modals/DeleteUserModal";
import toast from "react-hot-toast";

const UsersManagement: React.FC = () => {
  const {
    users,
    invitations,
    fetchUsers,
    fetchInvitations,
    isFetchingUsers,
    isFetchingInvitations,
    inviteUser,
    revokeInvitation,
    isInvitingUser,
    isRevokingInvitation,
    updateUserRole,
    deleteUser,
  } = useAdminStore();

  const { user: currentUser } = useAuthStore();
  const { profile } = useOrganizationStore();

  usePageTitle("Users & Invitations");

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("MEMBER");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [userToDelete, setUserToDelete] = useState<number | null>(null);
  const [invitationToRevoke, setInvitationToRevoke] = useState<{
    id: number;
    email: string;
  } | null>(null);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<"all" | "users" | "invitations">(
    "all",
  );
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
    fetchInvitations();
  }, [fetchUsers, fetchInvitations]);

  const handleRefresh = () => {
    fetchUsers();
    fetchInvitations();
    toast.success("Refreshed user data");
  };

  const closeInviteModal = () => {
    setIsInviteModalOpen(false);
    setInviteError(null);
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;
    setInviteError(null);

    if (newEmail.trim().toLowerCase() === currentUser?.email?.toLowerCase()) {
      setInviteError("You cannot invite yourself.");
      return;
    }

    try {
      await inviteUser(newEmail, newRole);
      closeInviteModal();
      setNewEmail("");
      setNewRole("MEMBER");
    } catch (error: any) {
      setInviteError(error?.message || "Failed to invite user");
    }
  };

  const handleResendInvite = async (email: string, role: string) => {
    setResendingEmail(email);
    try {
      await inviteUser(email, role, true);
    } catch (error) {
      // Toast error handled in adminStore
    } finally {
      setResendingEmail(null);
    }
  };

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    toast.success("Email copied to clipboard");
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const handleRoleChange = async (userId: number, newRole: string) => {
    await updateUserRole(userId, newRole);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    await deleteUser(userToDelete);
    setUserToDelete(null);
  };

  const confirmRevokeInvitation = async () => {
    if (!invitationToRevoke) return;
    await revokeInvitation(invitationToRevoke.id);
    setInvitationToRevoke(null);
  };

  const formatDisplayName = (u: any) => {
    const isSelf = u.id === currentUser?.id;
    const firstName = u.first_name || (isSelf ? currentUser?.first_name : null);
    const lastName = u.last_name || (isSelf ? currentUser?.last_name : null);

    if (firstName && lastName) {
      return `${firstName} ${lastName}`.trim();
    }
    if (firstName) {
      return firstName;
    }
    if (lastName) {
      return lastName;
    }
    if (u.email) {
      const handle = u.email.split("@")[0];
      const cleanHandle = handle.split("+")[0].replace(/[._-]/g, " ");
      return cleanHandle
        .split(" ")
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
    return "User";
  };

  // Metrics calculation
  const totalUsersCount = users.length;
  const superAdminCount = users.filter((u) => u.role === "SUPER_ADMIN").length;
  const managerCount = users.filter((u) => u.role === "MANAGER").length;
  const pendingInvitesCount = invitations.filter(
    (inv) =>
      inv.is_pending ??
      (!inv.accepted_at && new Date(inv.expires_at) > new Date()),
  ).length;

  // Filtered lists
  const filteredUsers = users.filter((u) => {
    const name = formatDisplayName(u).toLowerCase();
    const email = u.email.toLowerCase();
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      query === "" || name.includes(query) || email.includes(query);
    const matchesRole =
      selectedRoleFilter === "ALL" || u.role === selectedRoleFilter;
    return matchesSearch && matchesRole;
  });

  const filteredInvitations = invitations.filter((inv) => {
    const email = inv.email.toLowerCase();
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch = query === "" || email.includes(query);
    const matchesRole =
      selectedRoleFilter === "ALL" || inv.role === selectedRoleFilter;
    return matchesSearch && matchesRole;
  });

  const isLoading = isFetchingUsers || isFetchingInvitations;

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto pb-8 pr-1">
      {/* Header section */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-brand-text">
              Users & Invitations
            </h1>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-1.5 text-brand-text-muted hover:text-brand-text bg-brand-surface border border-brand-border rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh users and invitations"
            >
              <RefreshCw
                size={15}
                className={isLoading ? "animate-spin" : ""}
              />
            </button>
          </div>
          <p className="text-brand-text-muted text-sm mt-1">
            Manage organization team members, roles, and pending email
            invitations.
          </p>
        </div>
        <button
          onClick={() => setIsInviteModalOpen(true)}
          className="bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-brand-primary/20 shrink-0"
        >
          <Mail size={16} />
          Invite User
        </button>
      </header>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-brand-surface/60 border border-brand-border/70 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <div className="p-3 bg-brand-primary/10 text-brand-primary rounded-xl shrink-0">
            <Users size={20} />
          </div>
          <div>
            <p className="text-xs font-medium text-brand-text-muted uppercase tracking-wider">
              Active Users
            </p>
            <p className="text-xl font-bold text-brand-text mt-0.5">
              {totalUsersCount}
            </p>
          </div>
        </div>

        <div className="bg-brand-surface/60 border border-brand-border/70 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div>
            <p className="text-xs font-medium text-brand-text-muted uppercase tracking-wider">
              Super Admins
            </p>
            <p className="text-xl font-bold text-brand-text mt-0.5">
              {superAdminCount}
            </p>
          </div>
        </div>

        <div className="bg-brand-surface/60 border border-brand-border/70 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl shrink-0">
            <Shield size={20} />
          </div>
          <div>
            <p className="text-xs font-medium text-brand-text-muted uppercase tracking-wider">
              Managers
            </p>
            <p className="text-xl font-bold text-brand-text mt-0.5">
              {managerCount}
            </p>
          </div>
        </div>

        <div className="bg-brand-surface/60 border border-brand-border/70 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <p className="text-xs font-medium text-brand-text-muted uppercase tracking-wider">
              Pending Invites
            </p>
            <p className="text-xl font-bold text-brand-text mt-0.5">
              {pendingInvitesCount}
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Filters, and View Switcher */}
      <div className="bg-brand-surface/40 border border-brand-border rounded-2xl p-3 flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Search box */}
          <div className="relative flex-1 md:w-72">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full bg-brand-bg border border-brand-border rounded-xl pl-9 pr-3 py-2 text-sm text-brand-text outline-none focus:border-brand-primary transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-brand-text-muted hover:text-brand-text"
              >
                Clear
              </button>
            )}
          </div>

          {/* Role Filter */}
          <div className="relative shrink-0">
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="bg-brand-bg border border-brand-border text-brand-text text-sm rounded-xl px-3 py-2 outline-none focus:border-brand-primary transition-all cursor-pointer"
            >
              <option value="ALL">All Roles</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="MEMBER">Member</option>
            </select>
          </div>
        </div>

        {/* Tab View Filter */}
        <div className="flex items-center bg-brand-bg p-1 rounded-xl border border-brand-border/60 self-stretch md:self-auto justify-stretch">
          <button
            onClick={() => setActiveTab("all")}
            className={`flex-1 md:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "all"
                ? "bg-brand-surface text-brand-text shadow-sm"
                : "text-brand-text-muted hover:text-brand-text"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`flex-1 md:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "users"
                ? "bg-brand-surface text-brand-text shadow-sm"
                : "text-brand-text-muted hover:text-brand-text"
            }`}
          >
            Users ({filteredUsers.length})
          </button>
          <button
            onClick={() => setActiveTab("invitations")}
            className={`flex-1 md:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "invitations"
                ? "bg-brand-surface text-brand-text shadow-sm"
                : "text-brand-text-muted hover:text-brand-text"
            }`}
          >
            Invitations ({filteredInvitations.length})
          </button>
        </div>
      </div>

      {/* Active Users Table */}
      {(activeTab === "all" || activeTab === "users") && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-brand-text flex items-center gap-2">
              <UserCheck size={18} className="text-brand-primary" />
              Active Users
              <span className="text-xs font-normal text-brand-text-muted bg-brand-surface px-2 py-0.5 rounded-full border border-brand-border">
                {filteredUsers.length}
              </span>
            </h2>
          </div>

          <div className="bg-brand-bg border border-brand-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-surface/70 text-brand-text-muted text-xs uppercase tracking-wider font-semibold">
                    <th className="px-6 py-4 whitespace-nowrap">
                      User Details
                    </th>
                    <th className="px-6 py-4 whitespace-nowrap">Role</th>
                    <th className="px-6 py-4 whitespace-nowrap">Joined Date</th>
                    <th className="px-6 py-4 text-center whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {isFetchingUsers ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="p-12 text-center text-brand-text-muted"
                      >
                        <Loader2
                          className="animate-spin mx-auto mb-2 text-brand-primary"
                          size={24}
                        />
                        <p className="text-sm font-medium">
                          Loading active users...
                        </p>
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="p-12 text-center text-brand-text-muted"
                      >
                        <Users className="mx-auto mb-3 opacity-30" size={44} />
                        <p className="text-sm font-medium text-brand-text">
                          No users found
                        </p>
                        <p className="text-xs text-brand-text-muted mt-1">
                          {searchQuery || selectedRoleFilter !== "ALL"
                            ? "Try matching a different search term or role filter."
                            : "No active platform users available."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelf = u.id === currentUser?.id;
                      const firstName =
                        u.first_name ||
                        (isSelf ? currentUser?.first_name : null);
                      const lastName =
                        u.last_name || (isSelf ? currentUser?.last_name : null);
                      const avatarUser = {
                        ...u,
                        first_name: firstName,
                        last_name: lastName,
                      };
                      const displayName = formatDisplayName(u);

                      return (
                        <tr
                          key={u.id}
                          className="hover:bg-brand-surface/50 transition-colors group"
                        >
                          {/* Name with Email Column */}
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
                                  <Mail
                                    size={12}
                                    className="shrink-0 opacity-65"
                                  />
                                  <span className="truncate">{u.email}</span>
                                  <button
                                    onClick={() => handleCopyEmail(u.email)}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-brand-text-muted hover:text-brand-text transition-opacity ml-1 cursor-pointer"
                                    title="Copy email address"
                                  >
                                    {copiedEmail === u.email ? (
                                      <Check
                                        size={12}
                                        className="text-green-500"
                                      />
                                    ) : (
                                      <Copy size={12} />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Role Column */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="relative inline-block">
                              <select
                                value={u.role}
                                onChange={(e) =>
                                  handleRoleChange(u.id, e.target.value)
                                }
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

                          {/* Joined Column */}
                          <td className="px-6 py-4 text-brand-text-muted text-sm whitespace-nowrap">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <Clock
                                size={14}
                                className="opacity-60 shrink-0"
                              />
                              <span>
                                {new Date(u.created_at).toLocaleDateString(
                                  undefined,
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  },
                                )}
                              </span>
                            </div>
                          </td>

                          {/* Actions Column */}
                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            <div className="flex justify-center items-center gap-2">
                              <button
                                onClick={() => setUserToDelete(u.id)}
                                disabled={isSelf}
                                className="p-2 text-brand-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-brand-text-muted cursor-pointer"
                                title={
                                  isSelf
                                    ? "Cannot delete your own account"
                                    : "Delete user"
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Invitations Table */}
      {(activeTab === "all" || activeTab === "invitations") && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-brand-text flex items-center gap-2">
              <Mail size={18} className="text-amber-400" />
              Pending Invitations
              <span className="text-xs font-normal text-brand-text-muted bg-brand-surface px-2 py-0.5 rounded-full border border-brand-border">
                {filteredInvitations.length}
              </span>
            </h2>
          </div>

          <div className="bg-brand-bg border border-brand-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-surface/70 text-brand-text-muted text-xs uppercase tracking-wider font-semibold">
                    <th className="px-6 py-4 whitespace-nowrap">
                      Recipient Email
                    </th>
                    <th className="px-6 py-4 whitespace-nowrap">Role</th>
                    <th className="px-6 py-4 whitespace-nowrap">Status</th>
                    <th className="px-6 py-4 whitespace-nowrap">Sent Date</th>
                    <th className="px-6 py-4 text-center whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {isFetchingInvitations ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-12 text-center text-brand-text-muted"
                      >
                        <Loader2
                          className="animate-spin mx-auto mb-2 text-amber-400"
                          size={24}
                        />
                        <p className="text-sm font-medium">
                          Loading invitations...
                        </p>
                      </td>
                    </tr>
                  ) : filteredInvitations.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-12 text-center text-brand-text-muted"
                      >
                        <Mail className="mx-auto mb-3 opacity-30" size={44} />
                        <p className="text-sm font-medium text-brand-text">
                          No invitations found
                        </p>
                        <p className="text-xs text-brand-text-muted mt-1">
                          {searchQuery || selectedRoleFilter !== "ALL"
                            ? "No invitations match your search filter."
                            : "No pending or historical invitations."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredInvitations.map((inv) => {
                      const isPending =
                        inv.is_pending ??
                        (!inv.accepted_at &&
                          new Date(inv.expires_at) > new Date());
                      const isResendingThis = resendingEmail === inv.email;

                      return (
                        <tr
                          key={inv.id}
                          className="hover:bg-brand-surface/50 transition-colors group"
                        >
                          {/* Recipient Email Column */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-brand-surface border border-brand-border flex items-center justify-center text-brand-primary shrink-0 font-semibold text-xs">
                                {inv.email.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-semibold text-brand-text text-sm truncate">
                                  {inv.email}
                                </span>
                                <span className="text-xs text-brand-text-muted mt-0.5">
                                  Invited workspace member
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Role Column */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-xs font-semibold px-3 py-1 rounded-full border bg-brand-surface text-brand-text-muted border-brand-border">
                              {inv.role}
                            </span>
                          </td>

                          {/* Status Column */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            {isPending ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/30 whitespace-nowrap">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                Pending
                              </span>
                            ) : inv.accepted_at ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 whitespace-nowrap">
                                <CheckCircle2 size={13} />
                                Accepted
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border bg-rose-500/10 text-rose-400 border-rose-500/30 whitespace-nowrap">
                                <AlertCircle size={13} />
                                Expired / Revoked
                              </span>
                            )}
                          </td>

                          {/* Sent Date Column */}
                          <td className="px-6 py-4 text-brand-text-muted text-sm whitespace-nowrap">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <Clock
                                size={14}
                                className="opacity-60 shrink-0"
                              />
                              <span>
                                {new Date(inv.created_at).toLocaleDateString(
                                  undefined,
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  },
                                )}
                              </span>
                            </div>
                          </td>

                          {/* Actions Column */}
                          <td className="px-6 py-4 text-center whitespace-nowrap">
                            {isPending ? (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() =>
                                    handleResendInvite(inv.email, inv.role)
                                  }
                                  disabled={isResendingThis}
                                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-brand-surface hover:bg-brand-border text-brand-text border border-brand-border transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                  title="Resend invitation email"
                                >
                                  {isResendingThis ? (
                                    <Loader2
                                      size={13}
                                      className="animate-spin text-brand-primary"
                                    />
                                  ) : (
                                    <Send size={13} />
                                  )}
                                  Resend
                                </button>
                                <button
                                  onClick={() =>
                                    setInvitationToRevoke({
                                      id: inv.id,
                                      email: inv.email,
                                    })
                                  }
                                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition-colors cursor-pointer flex items-center gap-1.5"
                                  title="Revoke invitation link"
                                >
                                  <UserX size={13} /> Revoke
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-brand-text-muted italic">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <InviteUserModal
        isOpen={isInviteModalOpen}
        onClose={closeInviteModal}
        onSubmit={handleInviteUser}
        email={newEmail}
        onEmailChange={setNewEmail}
        role={newRole}
        onRoleChange={setNewRole}
        inviteError={inviteError}
        isInvitingUser={isInvitingUser}
        profileName={profile?.name}
        profileLogoUrl={profile?.logo_url}
      />

      <RevokeInvitationModal
        invitation={invitationToRevoke}
        onClose={() => setInvitationToRevoke(null)}
        onConfirm={confirmRevokeInvitation}
        isRevoking={isRevokingInvitation}
      />

      <DeleteUserModal
        userToDelete={userToDelete}
        onClose={() => setUserToDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default UsersManagement;
