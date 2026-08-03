import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Users,
  Search,
  UserPlus,
  Crown,
  Shield,
  UserCheck,
  Trash2,
  Check,
  X,
  Loader2,
  Mail,
  Calendar,
  MoreVertical,
  Star,
} from 'lucide-react';
import { useProjectSettingsStore } from '../../store/projectSettingsStore';
import { getBoardMembers, getUsers, addBoardMember, removeBoardMember, type BoardMember, type User } from '../../services/usersApi';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import toast from 'react-hot-toast';

export const ProjectMembersSettings: React.FC = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const parsedBoardId = boardId ? parseInt(boardId, 10) : null;

  const { currentSettings, updateSettings, isSaving } = useProjectSettingsStore();
  const board = currentSettings?.settings;

  const [members, setMembers] = useState<BoardMember[]>([]);
  const [orgUsers, setOrgUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Member Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [selectedPermission, setSelectedPermission] = useState<'EDITOR' | 'VIEWER' | 'OWNER'>('EDITOR');
  const [isAdding, setIsAdding] = useState(false);

  // Remove Member Confirm Modal State
  const [memberToRemove, setMemberToRemove] = useState<BoardMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Action Menu Popover
  const [activeMenuMemberId, setActiveMenuMemberId] = useState<number | null>(null);

  const loadData = async () => {
    if (!parsedBoardId) return;
    setIsLoading(true);
    try {
      const [membersData, allUsersData] = await Promise.all([
        getBoardMembers(parsedBoardId),
        getUsers().catch(() => []),
      ]);
      setMembers(membersData);
      setOrgUsers(allUsersData);
    } catch (error) {
      console.error('Failed to load project members:', error);
      toast.error('Failed to load project members');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [parsedBoardId]);

  // Filter members by search query
  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return members;
    return members.filter((m) => {
      const fullName = `${m.first_name || ''} ${m.last_name || ''}`.toLowerCase();
      const email = (m.email || '').toLowerCase();
      return fullName.includes(q) || email.includes(q);
    });
  }, [members, searchQuery]);

  // Filter org users not yet in project
  const availableOrgUsers = useMemo(() => {
    const existingIds = new Set(members.map((m) => m.id));
    return orgUsers.filter((u) => !existingIds.has(u.id));
  }, [orgUsers, members]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedBoardId || !selectedUserId) return;
    setIsAdding(true);
    try {
      await addBoardMember(parsedBoardId, Number(selectedUserId), selectedPermission);
      toast.success('Member added to project');
      setIsAddModalOpen(false);
      setSelectedUserId('');
      await loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to add member');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!parsedBoardId || !memberToRemove) return;
    setIsRemoving(true);
    try {
      await removeBoardMember(parsedBoardId, memberToRemove.id);
      toast.success('Member removed from project');
      setMemberToRemove(null);
      await loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to remove member');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleSetProjectLead = async (userId: number) => {
    if (!parsedBoardId) return;
    try {
      const newLeadId = board?.project_lead_id === userId ? null : userId;
      await updateSettings(parsedBoardId, { project_lead_id: newLeadId });
      setActiveMenuMemberId(null);
    } catch (error) {
      toast.error('Failed to update project lead');
    }
  };

  const handleSetDefaultAssignee = async (userId: number) => {
    if (!parsedBoardId) return;
    try {
      const newAssigneeId = board?.default_assignee_id === userId ? null : userId;
      await updateSettings(parsedBoardId, { default_assignee_id: newAssigneeId });
      setActiveMenuMemberId(null);
    } catch (error) {
      toast.error('Failed to update default assignee');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-brand-border/40">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-primary" />
            <h1 className="text-2xl font-bold text-brand-text">Project Members</h1>
            <span className="ml-2 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-brand-primary/10 text-brand-primary">
              {members.length}
            </span>
          </div>
          <p className="text-sm text-brand-text-muted mt-1">
            Manage who has access to this project, assign leads, and configure roles.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-white font-medium text-sm rounded-lg transition-colors shadow-sm cursor-pointer"
        >
          <UserPlus size={16} />
          <span>Add Member</span>
        </button>
      </div>

      {/* Toolbar & Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-brand-surface-low border border-brand-border rounded-lg text-brand-text placeholder:text-brand-text-muted focus:outline-none focus:border-brand-primary transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-text"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-brand-text-muted gap-3">
          <Loader2 size={32} className="animate-spin text-brand-primary" />
          <p className="text-sm">Loading project members...</p>
        </div>
      ) : filteredMembers.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-16 bg-brand-surface/40 border border-dashed border-brand-border/60 rounded-xl text-center px-4">
          <Users size={48} className="text-brand-text-muted mb-3 opacity-40" />
          <h3 className="text-base font-semibold text-brand-text">
            {searchQuery ? 'No members match your search' : 'No members found'}
          </h3>
          <p className="text-sm text-brand-text-muted mt-1 max-w-md">
            {searchQuery
              ? 'Try adjusting your search terms.'
              : 'Add members from your organization to collaborate on this project.'}
          </p>
        </div>
      ) : (
        /* Members List */
        <div className="bg-brand-surface border border-brand-border/60 rounded-xl overflow-hidden shadow-sm">
          <div className="divide-y divide-brand-border/40">
            {filteredMembers.map((member) => {
              const isOwner = board?.owner_id === member.id;
              const isLead = board?.project_lead_id === member.id;
              const isDefaultAssignee = board?.default_assignee_id === member.id;
              const isSuperAdmin = (member.role || '').toUpperCase() === 'SUPER_ADMIN';

              const displayName =
                [member.first_name, member.last_name].filter(Boolean).join(' ') || member.email;

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 hover:bg-brand-surface-hover/50 transition-colors group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Avatar */}
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={displayName}
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-brand-border/40"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-brand-primary/20 text-brand-primary flex items-center justify-center font-bold text-sm ring-2 ring-brand-border/40">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}

                    {/* Info */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-brand-text text-sm truncate">
                          {displayName}
                        </span>

                        {/* Badges */}
                        {isOwner && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            <Crown size={12} />
                            Owner
                          </span>
                        )}

                        {isLead && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            <Star size={12} />
                            Project Lead
                          </span>
                        )}

                        {isDefaultAssignee && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <UserCheck size={12} />
                            Default Assignee
                          </span>
                        )}

                        {isSuperAdmin && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            <Shield size={12} />
                            Super Admin
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-brand-text-muted mt-0.5">
                        <span className="flex items-center gap-1">
                          <Mail size={12} />
                          {member.email}
                        </span>
                        {member.joined_at && (
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            Joined {new Date(member.joined_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="relative flex items-center gap-2">
                    <button
                      onClick={() =>
                        setActiveMenuMemberId(activeMenuMemberId === member.id ? null : member.id)
                      }
                      className="p-2 rounded-lg text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low transition-colors"
                      title="Member options"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {/* Popover Dropdown */}
                    {activeMenuMemberId === member.id && (
                      <div className="absolute right-0 top-10 z-20 w-56 bg-brand-surface border border-brand-border rounded-lg shadow-xl py-1 divide-y divide-brand-border/40 text-xs">
                        <div className="py-1">
                          <button
                            onClick={() => handleSetProjectLead(member.id)}
                            disabled={isSaving}
                            className="w-full px-3 py-2 text-left flex items-center gap-2 text-brand-text hover:bg-brand-surface-hover transition-colors"
                          >
                            <Star size={14} className={isLead ? 'text-indigo-400 fill-indigo-400' : ''} />
                            <span>{isLead ? 'Remove as Project Lead' : 'Set as Project Lead'}</span>
                          </button>

                          <button
                            onClick={() => handleSetDefaultAssignee(member.id)}
                            disabled={isSaving}
                            className="w-full px-3 py-2 text-left flex items-center gap-2 text-brand-text hover:bg-brand-surface-hover transition-colors"
                          >
                            <UserCheck size={14} className={isDefaultAssignee ? 'text-emerald-400' : ''} />
                            <span>
                              {isDefaultAssignee ? 'Remove Default Assignee' : 'Set as Default Assignee'}
                            </span>
                          </button>
                        </div>

                        {!isOwner && !isSuperAdmin && (
                          <div className="py-1">
                            <button
                              onClick={() => {
                                setActiveMenuMemberId(null);
                                setMemberToRemove(member);
                              }}
                              className="w-full px-3 py-2 text-left flex items-center gap-2 text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 size={14} />
                              <span>Remove from Project</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-brand-surface border border-brand-border rounded-xl shadow-2xl w-full max-w-md p-6 relative space-y-5">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute right-4 top-4 text-brand-text-muted hover:text-brand-text p-1 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>

            <div>
              <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
                <UserPlus size={20} className="text-brand-primary" />
                Add Member to Project
              </h2>
              <p className="text-xs text-brand-text-muted mt-1">
                Select an organization member to add to this project board.
              </p>
            </div>

            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-brand-text mb-1.5">
                  Select User
                </label>
                {availableOrgUsers.length === 0 ? (
                  <p className="text-xs text-brand-text-muted italic bg-brand-surface-low p-3 rounded-lg">
                    All organization users are already members of this project.
                  </p>
                ) : (
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : '')}
                    required
                    className="w-full px-3 py-2 text-sm bg-brand-surface-low border border-brand-border rounded-lg text-brand-text focus:outline-none focus:border-brand-primary"
                  >
                    <option value="">Select an organization user...</option>
                    {availableOrgUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email} ({u.email})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-text mb-1.5">
                  Project Permission
                </label>
                <select
                  value={selectedPermission}
                  onChange={(e) => setSelectedPermission(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm bg-brand-surface-low border border-brand-border rounded-lg text-brand-text focus:outline-none focus:border-brand-primary"
                >
                  <option value="EDITOR">Editor (Can view and edit tasks)</option>
                  <option value="VIEWER">Viewer (Read-only access)</option>
                  <option value="OWNER">Owner (Full project control)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-hover rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedUserId || isAdding}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-primary hover:bg-brand-primary-hover text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isAdding && <Loader2 size={14} className="animate-spin" />}
                  <span>Add Member</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Dialog */}
      {memberToRemove && (
        <ConfirmDialog
          isOpen={!!memberToRemove}
          title="Remove Member from Project"
          message={`Are you sure you want to remove ${
            [memberToRemove.first_name, memberToRemove.last_name].filter(Boolean).join(' ') ||
            memberToRemove.email
          } from this project?`}
          confirmText="Remove Member"
          confirmVariant="danger"
          isLoading={isRemoving}
          onConfirm={handleRemoveMember}
          onClose={() => setMemberToRemove(null)}
        />
      )}
    </div>
  );
};
