import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { updateProfile, uploadAvatar, deleteAvatar } from '../../services/usersApi';
import { deleteAccount } from '../../services/authApi';
import { UserAvatar } from '../../components/common/UserAvatar';
import { formatUserName } from '../../utils/userHelpers';
import toast from 'react-hot-toast';
import { Camera, Save, Loader2, Trash2, AlertTriangle, Eye, EyeOff, X } from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle';

export const MyAccount: React.FC = () => {
  usePageTitle("My Account");
  const { user, updateUserLocally, logout } = useAuthStore();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile Form State
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Avatar Upload State
  const [isUploading, setIsUploading] = useState(false);

  // Danger Zone State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Unsaved changes detection
  const hasProfileChanges = firstName !== (user?.first_name || '') || lastName !== (user?.last_name || '');

  // Reset form when user changes (edge case if rehydrated)
  useEffect(() => {
    setFirstName(user?.first_name || '');
    setLastName(user?.last_name || '');
  }, [user]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasProfileChanges) return;

    try {
      setIsSavingProfile(true);
      const updatedUser = await updateProfile({
        first_name: firstName,
        last_name: lastName
      });
      
      updateUserLocally({
        first_name: updatedUser.first_name || undefined,
        last_name: updatedUser.last_name || undefined
      });
      
      toast.success('Profile updated successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE' || !deletePassword || isDeleting) return;

    try {
      setIsDeleting(true);
      await deleteAccount(deletePassword);
      toast.success('Your account has been permanently deleted.');
      // Clear local auth state without calling logout API (cookies already cleared by server)
      await logout(true);
      navigate('/login', { replace: true });
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || 'Failed to delete account';
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCloseModal = () => {
    if (isDeleting) return;
    setShowDeleteModal(false);
    setDeleteConfirmText('');
    setDeletePassword('');
    setShowDeletePassword(false);
  };

  const canConfirmDelete = deleteConfirmText === 'DELETE' && deletePassword.length > 0;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a valid image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    try {
      setIsUploading(true);
      const avatar_url = await uploadAvatar(file);
      updateUserLocally({ avatar_url });
      toast.success('Avatar updated successfully');
    } catch (error: any) {
      toast.error('Failed to upload avatar');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      setIsUploading(true);
      await deleteAvatar();
      updateUserLocally({ avatar_url: undefined });
      toast.success('Avatar removed successfully');
    } catch (error: any) {
      toast.error('Failed to remove avatar');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-2xl animate-in fade-in duration-300">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-brand-text mb-2">My Account</h1>
        <p className="text-sm text-brand-text-muted">Manage your personal profile and security preferences.</p>
      </div>

      {/* Profile Section */}
      <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm overflow-hidden mb-8">
        <div className="p-6 border-b border-brand-border">
          <h2 className="text-lg font-semibold text-brand-text mb-1">Profile Information</h2>
          <p className="text-sm text-brand-text-muted">Update your photo and personal details here.</p>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-8 mb-8">
            <div className="relative group">
              <UserAvatar user={user} size="xl" className="shadow-sm" />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute -bottom-2 -right-2 w-8 h-8 bg-brand-surface border border-brand-border rounded-full flex items-center justify-center text-brand-text-muted hover:text-brand-text shadow-sm transition-colors"
                title="Change Avatar"
              >
                {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              </button>
              <input 
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/png, image/jpeg, image/gif, image/webp"
                onChange={handleAvatarUpload}
              />
            </div>
            
            <div className="pt-2">
              <p className="text-sm font-medium text-brand-text mb-1">Display Name Preview</p>
              <div className="text-xl font-bold text-brand-text">
                {formatUserName({ first_name: firstName, last_name: lastName, email: user?.email })}
              </div>
              {user?.avatar_url && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={isUploading}
                  className="mt-3 flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  Remove profile picture
                </button>
              )}
            </div>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">First Name</label>
                <input 
                  type="text" 
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-brand-surface-low border border-brand-border rounded-md px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary transition-colors"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1">Last Name</label>
                <input 
                  type="text" 
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-brand-surface-low border border-brand-border rounded-md px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary transition-colors"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-text mb-1">Email</label>
              <input 
                type="text" 
                value={user?.email || ''}
                readOnly
                disabled
                className="w-full bg-brand-surface-low border border-brand-border rounded-md px-3 py-2 text-sm text-brand-text-muted opacity-70 cursor-not-allowed"
              />
              <p className="text-xs text-brand-text-muted mt-1">Your email address cannot be changed right now.</p>
            </div>

            <div className="pt-4 flex items-center justify-end border-t border-brand-border mt-6 gap-3">
              {hasProfileChanges && (
                <button
                  type="button"
                  onClick={() => {
                    setFirstName(user?.first_name || '');
                    setLastName(user?.last_name || '');
                  }}
                  className="px-4 py-2 text-sm font-medium text-brand-text-muted hover:text-brand-text transition-colors"
                >
                  Discard
                </button>
              )}
              <button
                type="submit"
                disabled={!hasProfileChanges || isSavingProfile}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  hasProfileChanges 
                    ? 'bg-brand-primary text-white hover:bg-brand-primary/90 shadow-sm' 
                    : 'bg-brand-surface-low text-brand-text-muted border border-brand-border cursor-not-allowed'
                }`}
              >
                {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-500/30 bg-red-500/5 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-red-500/20 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-red-500">Danger Zone</h2>
            <p className="text-sm text-brand-text-muted">Irreversible and destructive actions.</p>
          </div>
        </div>
        <div className="p-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-text">Delete this account</p>
            <p className="text-xs text-brand-text-muted mt-0.5">
              Permanently removes your account, sessions, preferences, and all personal data. This cannot be undone.
            </p>
          </div>
          <button
            id="open-delete-account-modal"
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="shrink-0 px-4 py-2 text-sm font-medium rounded-md border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-200"
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          aria-modal="true"
          role="dialog"
          aria-labelledby="delete-modal-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleCloseModal}
          />

          {/* Modal */}
          <div className="relative z-10 w-full max-w-md bg-brand-surface border border-brand-border rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-brand-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} className="text-red-500" />
                </div>
                <div>
                  <h3 id="delete-modal-title" className="text-base font-semibold text-brand-text">Delete Account</h3>
                  <p className="text-xs text-brand-text-muted">This action is permanent and cannot be undone.</p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                disabled={isDeleting}
                className="text-brand-text-muted hover:text-brand-text transition-colors disabled:opacity-50"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              <div className="bg-red-500/8 border border-red-500/20 rounded-lg p-4 text-sm text-brand-text-muted space-y-1">
                <p className="font-medium text-red-400">The following will be permanently deleted:</p>
                <ul className="list-disc list-inside space-y-0.5 mt-2">
                  <li>Your profile, preferences, and avatar</li>
                  <li>All active login sessions</li>
                  <li>Board memberships and personal data</li>
                  <li>Timesheet records and notification history</li>
                </ul>
              </div>

              {/* Type DELETE */}
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1.5">
                  Type <span className="font-mono font-bold text-red-500">DELETE</span> to confirm
                </label>
                <input
                  id="delete-confirm-text"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  disabled={isDeleting}
                  autoComplete="off"
                  placeholder="DELETE"
                  className="w-full bg-brand-surface-low border border-brand-border rounded-md px-3 py-2 text-sm text-brand-text font-mono focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors disabled:opacity-60"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-brand-text mb-1.5">Confirm your password</label>
                <div className="relative">
                  <input
                    id="delete-account-password"
                    type={showDeletePassword ? 'text' : 'password'}
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    disabled={isDeleting}
                    autoComplete="current-password"
                    placeholder="Enter your current password"
                    className="w-full bg-brand-surface-low border border-brand-border rounded-md px-3 py-2 pr-10 text-sm text-brand-text focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword(p => !p)}
                    disabled={isDeleting}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-text transition-colors"
                    tabIndex={-1}
                    aria-label={showDeletePassword ? 'Hide password' : 'Show password'}
                  >
                    {showDeletePassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-6 pt-0">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-md border border-brand-border text-brand-text-muted hover:text-brand-text hover:border-brand-border/80 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                id="confirm-delete-account"
                type="button"
                onClick={handleDeleteAccount}
                disabled={!canConfirmDelete || isDeleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <><Loader2 size={15} className="animate-spin" /> Deleting...</>
                ) : (
                  <><Trash2 size={15} /> Permanently Delete</>  
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyAccount;
