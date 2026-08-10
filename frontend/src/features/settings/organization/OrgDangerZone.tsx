import React from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';

interface OrgDangerZoneProps {
  isDeletionScheduled: boolean;
  onDeleteClick: () => void;
}

export const OrgDangerZone: React.FC<OrgDangerZoneProps> = ({ isDeletionScheduled, onDeleteClick }) => {
  return (
    <div className="bg-brand-surface border border-red-200 dark:border-red-900/50 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-red-200 dark:border-red-900/50">
        <h3 className="text-lg font-semibold text-red-600 dark:text-red-500">Danger Zone</h3>
        <p className="text-sm text-brand-text-muted mt-1">Irreversible and destructive actions.</p>
      </div>

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-brand-text">Transfer Workspace Ownership</h4>
            <p className="text-sm text-brand-text-muted mt-1">Transfer this workspace to another member.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 bg-brand-surface-low text-xs font-semibold uppercase tracking-wider text-brand-text-muted rounded">
              Coming Soon
            </span>
            <button
              disabled
              className="px-4 py-2 border border-brand-border text-brand-text-muted rounded-md text-sm font-medium cursor-not-allowed flex items-center gap-2"
            >
              <ArrowRight size={16} /> Transfer
            </button>
          </div>
        </div>

        <div className="w-full h-px bg-brand-border" />

        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-brand-text">Delete Workspace</h4>
            <p className="text-sm text-brand-text-muted mt-1">Permanently delete all data, projects, and users.</p>
          </div>
          <button
            onClick={onDeleteClick}
            disabled={isDeletionScheduled}
            className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20 rounded-md text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 size={16} />
            {isDeletionScheduled ? 'Deletion Scheduled' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrgDangerZone;
