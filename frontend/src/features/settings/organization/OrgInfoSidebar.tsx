import React from 'react';
import { Hash, Calendar, Users, ExternalLink } from 'lucide-react';
import WorkspaceLogo from '../../../components/common/WorkspaceLogo';

interface OrgInfoSidebarProps {
  profile: any;
  displayName: string;
  displayLogoUrl: string;
}

export const OrgInfoSidebar: React.FC<OrgInfoSidebarProps> = ({ profile, displayName, displayLogoUrl }) => {
  return (
    <div className="space-y-6">
      {/* Read-only Stats */}
      {profile && (
        <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-semibold text-brand-text uppercase tracking-wider mb-4">Workspace Information</h3>

          <div className="flex items-center gap-3">
            <Hash size={16} className="text-brand-text-muted" />
            <div className="flex flex-col">
              <span className="text-xs text-brand-text-muted">Organization ID</span>
              <span className="text-sm font-medium text-brand-text font-mono">ORG-{profile.id}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Calendar size={16} className="text-brand-text-muted" />
            <div className="flex flex-col">
              <span className="text-xs text-brand-text-muted">Created On</span>
              <span className="text-sm font-medium text-brand-text">
                {new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Users size={16} className="text-brand-text-muted" />
            <div className="flex flex-col">
              <span className="text-xs text-brand-text-muted">Owner</span>
              <span className="text-sm font-medium text-brand-text">{profile.owner_name || profile.owner_email}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-brand-border">
            <div className="text-center p-3 bg-brand-surface-low rounded-lg">
              <span className="block text-2xl font-bold text-brand-text">{profile.members_count}</span>
              <span className="block text-xs font-medium text-brand-text-muted uppercase tracking-wider mt-1">Members</span>
            </div>
            <div className="text-center p-3 bg-brand-surface-low rounded-lg">
              <span className="block text-2xl font-bold text-brand-text">{profile.projects_count}</span>
              <span className="block text-xs font-medium text-brand-text-muted uppercase tracking-wider mt-1">Projects</span>
            </div>
          </div>
        </div>
      )}

      {/* Live Preview */}
      <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm overflow-hidden sticky top-24">
        <div className="px-6 py-4 border-b border-brand-border bg-brand-surface-low">
          <h3 className="text-sm font-semibold text-brand-text flex items-center gap-2">
            <ExternalLink size={16} /> Live Preview
          </h3>
        </div>
        <div className="p-6 space-y-8 bg-brand-bg">
          <div>
            <p className="text-xs font-medium text-brand-text-muted uppercase tracking-wider mb-3">Sidebar Appearance</p>
            <div className="p-4 border border-brand-border bg-brand-surface rounded-lg shadow-sm w-full max-w-[240px]">
              <div className="flex items-center gap-3">
                <WorkspaceLogo name={displayName} logoUrl={displayLogoUrl} size="md" />
                <div className="flex flex-col truncate">
                  <span className="text-sm font-bold text-brand-text truncate">{displayName}</span>
                  <span className="text-[10px] text-brand-text-muted uppercase tracking-wide">KAIO Workspace</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-brand-text-muted uppercase tracking-wider mb-3">Browser Title</p>
            <div className="px-4 py-2 border border-brand-border bg-brand-surface rounded-t-lg shadow-sm text-sm text-brand-text truncate border-b-0 w-full max-w-[280px]">
              Settings • {displayName} | KAIO
            </div>
            <div className="h-6 w-full max-w-[280px] bg-brand-surface-low border border-brand-border rounded-b-lg border-t-0 shadow-sm" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrgInfoSidebar;
