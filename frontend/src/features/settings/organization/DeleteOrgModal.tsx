import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface DeleteOrgModalProps {
  isOpen: boolean;
  profileName: string | undefined;
  deleteOrgName: string;
  deletePassword: string;
  isDeleting: boolean;
  onOrgNameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const DeleteOrgModal: React.FC<DeleteOrgModalProps> = ({
  isOpen, profileName, deleteOrgName, deletePassword,
  isDeleting, onOrgNameChange, onPasswordChange, onSubmit, onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-brand-surface rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-red-200 dark:border-red-900/50">
        <div className="px-6 py-4 border-b border-red-200 dark:border-red-900/50 flex items-center gap-3 bg-red-50/50 dark:bg-red-900/10">
          <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-500">
            <ShieldAlert size={20} />
          </div>
          <h2 className="text-lg font-bold text-red-600 dark:text-red-500">Delete Workspace</h2>
        </div>

        <form onSubmit={onSubmit}>
          <div className="p-6 space-y-4">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg text-sm text-red-800 dark:text-red-300">
              <p className="font-semibold mb-1">This action cannot be undone.</p>
              <p>
                This will permanently delete the <strong>{profileName}</strong> workspace, all associated tasks, projects, timesheets, and remove all user access.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-text mb-1">
                Type <strong>{profileName}</strong> to confirm
              </label>
              <input
                type="text" required
                value={deleteOrgName}
                onChange={(e) => onOrgNameChange(e.target.value)}
                className="w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-md text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder={profileName}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-text mb-1">Your Password</label>
              <input
                type="password" required
                value={deletePassword}
                onChange={(e) => onPasswordChange(e.target.value)}
                className="w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-md text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Enter your password to verify"
              />
            </div>
          </div>

          <div className="px-6 py-4 bg-brand-surface-low border-t border-brand-border flex items-center justify-end gap-3">
            <button
              type="button" onClick={onClose} disabled={isDeleting}
              className="px-4 py-2 text-sm font-medium text-brand-text-muted hover:text-brand-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isDeleting || deleteOrgName !== profileName || !deletePassword}
              className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isDeleting ? 'Initiating...' : 'Delete Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeleteOrgModal;
