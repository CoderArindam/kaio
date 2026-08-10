import React, { useEffect, useState } from 'react';
import { useAdminStore } from '../../store/adminStore';
import { useAuthStore } from '../../store/authStore';
import {
  Loader2, Users, Mail, Search, ShieldCheck, UserCheck,
  Clock, RefreshCw, Shield,
} from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useOrganizationStore } from '../../store/organizationStore';
import { InviteUserModal } from './modals/InviteUserModal';
import { RevokeInvitationModal } from './modals/RevokeInvitationModal';
import { DeleteUserModal } from './modals/DeleteUserModal';
import { UserTableRow } from './UserTableRow';
import { InvitationTableRow } from './InvitationTableRow';
import toast from 'react-hot-toast';

const UsersManagement: React.FC = () => {
  const {
    users, invitations, fetchUsers, fetchInvitations,
    isFetchingUsers, isFetchingInvitations,
    inviteUser, revokeInvitation, isInvitingUser, isRevokingInvitation,
    updateUserRole, deleteUser,
  } = useAdminStore();

  const { user: currentUser } = useAuthStore();
  const { profile } = useOrganizationStore();

  usePageTitle('Users & Invitations');

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('MEMBER');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<number | null>(null);
  const [invitationToRevoke, setInvitationToRevoke] = useState<{ id: number; email: string } | null>(null);
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'all' | 'users' | 'invitations'>('all');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
    fetchInvitations();
  }, [fetchUsers, fetchInvitations]);

  const handleRefresh = () => {
    fetchUsers();
    fetchInvitations();
    toast.success('Refreshed user data');
  };

  const closeInviteModal = () => { setIsInviteModalOpen(false); setInviteError(null); };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;
    setInviteError(null);
    if (newEmail.trim().toLowerCase() === currentUser?.email?.toLowerCase()) {
      setInviteError('You cannot invite yourself.');
      return;
    }
    try {
      await inviteUser(newEmail, newRole);
      closeInviteModal();
      setNewEmail('');
      setNewRole('MEMBER');
    } catch (error: any) {
      setInviteError(error?.message || 'Failed to invite user');
    }
  };

  const handleResendInvite = async (email: string, role: string) => {
    setResendingEmail(email);
    try {
      await inviteUser(email, role, true);
    } catch {
      // Toast handled in adminStore
    } finally {
      setResendingEmail(null);
    }
  };

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    toast.success('Email copied to clipboard');
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
    if (firstName && lastName) return `${firstName} ${lastName}`.trim();
    if (firstName) return firstName;
    if (lastName) return lastName;
    if (u.email) {
      const handle = u.email.split('@')[0];
      const cleanHandle = handle.split('+')[0].replace(/[._-]/g, ' ');
      return cleanHandle.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return 'User';
  };

  const totalUsersCount = users.length;
  const superAdminCount = users.filter((u) => u.role === 'SUPER_ADMIN').length;
  const managerCount = users.filter((u) => u.role === 'MANAGER').length;
  const pendingInvitesCount = invitations.filter(
    (inv) => inv.is_pending ?? (!inv.accepted_at && new Date(inv.expires_at) > new Date())
  ).length;

  const filteredUsers = users.filter((u) => {
    const name = formatDisplayName(u).toLowerCase();
    const email = u.email.toLowerCase();
    const query = searchQuery.toLowerCase().trim();
    return (query === '' || name.includes(query) || email.includes(query)) &&
      (selectedRoleFilter === 'ALL' || u.role === selectedRoleFilter);
  });

  const filteredInvitations = invitations.filter((inv) => {
    const email = inv.email.toLowerCase();
    const query = searchQuery.toLowerCase().trim();
    return (query === '' || email.includes(query)) &&
      (selectedRoleFilter === 'ALL' || inv.role === selectedRoleFilter);
  });

  const isLoading = isFetchingUsers || isFetchingInvitations;

  const tabButtonClass = (tab: string) =>
    `flex-1 md:flex-initial px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
      activeTab === tab ? 'bg-brand-surface text-brand-text shadow-sm' : 'text-brand-text-muted hover:text-brand-text'
    }`;

  const statCards = [
    { label: 'Active Users', value: totalUsersCount, icon: <Users size={20} />, color: 'bg-brand-primary/10 text-brand-primary' },
    { label: 'Super Admins', value: superAdminCount, icon: <ShieldCheck size={20} />, color: 'bg-purple-500/10 text-purple-400' },
    { label: 'Managers', value: managerCount, icon: <Shield size={20} />, color: 'bg-blue-500/10 text-blue-400' },
    { label: 'Pending Invites', value: pendingInvitesCount, icon: <Clock size={20} />, color: 'bg-amber-500/10 text-amber-400' },
  ];

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto pb-8 pr-1">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-brand-text">Users & Invitations</h1>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-1.5 text-brand-text-muted hover:text-brand-text bg-brand-surface border border-brand-border rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh users and invitations"
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          <p className="text-brand-text-muted text-sm mt-1">Manage organization team members, roles, and pending email invitations.</p>
        </div>
        <button
          onClick={() => setIsInviteModalOpen(true)}
          className="bg-brand-primary hover:bg-brand-primary-hover text-white px-4 py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-brand-primary/20 shrink-0"
        >
          <Mail size={16} /> Invite User
        </button>
      </header>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon, color }) => (
          <div key={label} className="bg-brand-surface/60 border border-brand-border/70 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className={`p-3 ${color} rounded-xl shrink-0`}>{icon}</div>
            <div>
              <p className="text-xs font-medium text-brand-text-muted uppercase tracking-wider">{label}</p>
              <p className="text-xl font-bold text-brand-text mt-0.5">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-brand-surface/40 border border-brand-border rounded-2xl p-3 flex flex-col md:flex-row items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full bg-brand-bg border border-brand-border rounded-xl pl-9 pr-3 py-2 text-sm text-brand-text outline-none focus:border-brand-primary transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-brand-text-muted hover:text-brand-text">
                Clear
              </button>
            )}
          </div>
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            className="bg-brand-bg border border-brand-border text-brand-text text-sm rounded-xl px-3 py-2 outline-none focus:border-brand-primary transition-all cursor-pointer shrink-0"
          >
            <option value="ALL">All Roles</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="MEMBER">Member</option>
          </select>
        </div>
        <div className="flex items-center bg-brand-bg p-1 rounded-xl border border-brand-border/60 self-stretch md:self-auto justify-stretch">
          <button onClick={() => setActiveTab('all')} className={tabButtonClass('all')}>All</button>
          <button onClick={() => setActiveTab('users')} className={tabButtonClass('users')}>Users ({filteredUsers.length})</button>
          <button onClick={() => setActiveTab('invitations')} className={tabButtonClass('invitations')}>Invitations ({filteredInvitations.length})</button>
        </div>
      </div>

      {/* Active Users Table */}
      {(activeTab === 'all' || activeTab === 'users') && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-brand-text flex items-center gap-2">
            <UserCheck size={18} className="text-brand-primary" />
            Active Users
            <span className="text-xs font-normal text-brand-text-muted bg-brand-surface px-2 py-0.5 rounded-full border border-brand-border">{filteredUsers.length}</span>
          </h2>
          <div className="bg-brand-bg border border-brand-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-surface/70 text-brand-text-muted text-xs uppercase tracking-wider font-semibold">
                    <th className="px-6 py-4 whitespace-nowrap">User Details</th>
                    <th className="px-6 py-4 whitespace-nowrap">Role</th>
                    <th className="px-6 py-4 whitespace-nowrap">Joined Date</th>
                    <th className="px-6 py-4 text-center whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {isFetchingUsers ? (
                    <tr><td colSpan={4} className="p-12 text-center text-brand-text-muted">
                      <Loader2 className="animate-spin mx-auto mb-2 text-brand-primary" size={24} />
                      <p className="text-sm font-medium">Loading active users...</p>
                    </td></tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr><td colSpan={4} className="p-12 text-center text-brand-text-muted">
                      <Users className="mx-auto mb-3 opacity-30" size={44} />
                      <p className="text-sm font-medium text-brand-text">No users found</p>
                      <p className="text-xs text-brand-text-muted mt-1">
                        {searchQuery || selectedRoleFilter !== 'ALL' ? 'Try matching a different search term or role filter.' : 'No active platform users available.'}
                      </p>
                    </td></tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <UserTableRow
                        key={u.id}
                        user={u}
                        currentUserId={currentUser?.id}
                        currentUserFirstName={currentUser?.first_name}
                        currentUserLastName={currentUser?.last_name}
                        copiedEmail={copiedEmail}
                        onRoleChange={handleRoleChange}
                        onDelete={setUserToDelete}
                        onCopyEmail={handleCopyEmail}
                        formatDisplayName={formatDisplayName}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Invitations Table */}
      {(activeTab === 'all' || activeTab === 'invitations') && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-brand-text flex items-center gap-2">
            <Mail size={18} className="text-amber-400" />
            Pending Invitations
            <span className="text-xs font-normal text-brand-text-muted bg-brand-surface px-2 py-0.5 rounded-full border border-brand-border">{filteredInvitations.length}</span>
          </h2>
          <div className="bg-brand-bg border border-brand-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-surface/70 text-brand-text-muted text-xs uppercase tracking-wider font-semibold">
                    <th className="px-6 py-4 whitespace-nowrap">Recipient Email</th>
                    <th className="px-6 py-4 whitespace-nowrap">Role</th>
                    <th className="px-6 py-4 whitespace-nowrap">Status</th>
                    <th className="px-6 py-4 whitespace-nowrap">Sent Date</th>
                    <th className="px-6 py-4 text-center whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {isFetchingInvitations ? (
                    <tr><td colSpan={5} className="p-12 text-center text-brand-text-muted">
                      <Loader2 className="animate-spin mx-auto mb-2 text-amber-400" size={24} />
                      <p className="text-sm font-medium">Loading invitations...</p>
                    </td></tr>
                  ) : filteredInvitations.length === 0 ? (
                    <tr><td colSpan={5} className="p-12 text-center text-brand-text-muted">
                      <Mail className="mx-auto mb-3 opacity-30" size={44} />
                      <p className="text-sm font-medium text-brand-text">No invitations found</p>
                      <p className="text-xs text-brand-text-muted mt-1">
                        {searchQuery || selectedRoleFilter !== 'ALL' ? 'No invitations match your search filter.' : 'No pending or historical invitations.'}
                      </p>
                    </td></tr>
                  ) : (
                    filteredInvitations.map((inv) => (
                      <InvitationTableRow
                        key={inv.id}
                        invitation={inv}
                        resendingEmail={resendingEmail}
                        onResend={handleResendInvite}
                        onRevoke={(id, email) => setInvitationToRevoke({ id, email })}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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
