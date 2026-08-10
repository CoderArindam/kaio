import React, { useState, useEffect, useRef } from 'react';
import { Building2, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useOrganizationStore } from '../../store/organizationStore';
import { uploadOrganizationLogo, deleteOrganization, cancelOrganizationDeletion } from '../../services/organizationApi';
import { usePageTitle } from '../../hooks/usePageTitle';
import { OrgProfileForm, type OrgFormData } from './organization/OrgProfileForm';
import { OrgDangerZone } from './organization/OrgDangerZone';
import { OrgInfoSidebar } from './organization/OrgInfoSidebar';
import { DeleteOrgModal } from './organization/DeleteOrgModal';
import toast from 'react-hot-toast';

export const Organization: React.FC = () => {
  const { user } = useAuthStore();
  const { profile, deletionStatus, updateProfile, setDeletionStatus } = useOrganizationStore();

  usePageTitle('Workspace Settings');

  const [formData, setFormData] = useState<OrgFormData>({
    name: '', logo_url: '', website: '', industry: '', company_size: '', description: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteOrgName, setDeleteOrgName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        logo_url: profile.logo_url || '',
        website: profile.website || '',
        industry: profile.industry || '',
        company_size: profile.company_size || '',
        description: profile.description || '',
      });
    }
  }, [profile]);

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-xl font-bold text-brand-text mb-2">Access Denied</h2>
          <p className="text-brand-text-muted">Only Super Admins can manage Workspace settings.</p>
        </div>
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('File size must be less than 2MB'); return; }
    setIsUploading(true);
    try {
      const { logo_url } = await uploadOrganizationLogo(file);
      setFormData((prev) => ({ ...prev, logo_url }));
      toast.success("Logo uploaded successfully. Don't forget to save changes.");
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload logo');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!formData.name || formData.name.length < 3 || formData.name.length > 60) {
      toast.error('Workspace Name must be between 3 and 60 characters'); return;
    }
    if (formData.website && !formData.website.startsWith('http://') && !formData.website.startsWith('https://')) {
      toast.error('Website must be a valid HTTPS URL'); return;
    }
    if (formData.description && formData.description.length > 500) {
      toast.error('Description must be 500 characters or less'); return;
    }
    setIsSaving(true);
    try {
      await updateProfile({
        name: formData.name,
        logo_url: formData.logo_url || null,
        website: formData.website || null,
        industry: formData.industry || null,
        company_size: formData.company_size || null,
        description: formData.description || null,
      });
      toast.success('Workspace settings updated successfully');
    } catch {
      // Error handled by store
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteOrgName !== profile?.name) { toast.error('Organization name does not match'); return; }
    setIsDeleting(true);
    try {
      const res = await deleteOrganization(deletePassword, deleteOrgName, false);
      toast.success(`Deletion scheduled. Grace period: ${res.grace_period_hours} hours.`);
      setDeletionStatus({ status: res.status, deletion_scheduled_purge_at: null });
      setIsDeleteDialogOpen(false);
      setDeletePassword('');
      setDeleteOrgName('');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || error.message || 'Failed to initiate deletion');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelDeletion = async () => {
    setIsCancelling(true);
    try {
      await cancelOrganizationDeletion();
      toast.success('Organization deletion cancelled successfully');
      setDeletionStatus(null);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || error.message || 'Failed to cancel deletion');
    } finally {
      setIsCancelling(false);
    }
  };

  const hasChanges = profile
    ? formData.name !== (profile.name || '') ||
      formData.logo_url !== (profile.logo_url || '') ||
      formData.website !== (profile.website || '') ||
      formData.industry !== (profile.industry || '') ||
      formData.company_size !== (profile.company_size || '') ||
      formData.description !== (profile.description || '')
    : false;

  const displayLogoUrl = formData.logo_url;
  const displayName = formData.name || 'Your Workspace';

  return (
    <div className="max-w-5xl animate-in fade-in duration-300 relative">
      {/* Deletion banner */}
      {deletionStatus?.status === 'DELETING' && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 rounded-xl flex items-center justify-between">
          <div className="flex items-start gap-3">
            <ShieldAlert className="text-red-600 dark:text-red-400 mt-0.5" size={20} />
            <div>
              <h3 className="text-sm font-bold text-red-800 dark:text-red-300">Workspace Deletion Scheduled</h3>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                This workspace is scheduled for permanent deletion. All data will be irreversibly purged.
              </p>
            </div>
          </div>
          <button
            onClick={handleCancelDeletion}
            disabled={isCancelling}
            className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-800 dark:text-red-100 dark:hover:bg-red-700 rounded-md text-sm font-medium transition-colors"
          >
            {isCancelling ? 'Cancelling...' : 'Cancel Deletion'}
          </button>
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-text flex items-center gap-2">
            <Building2 className="text-brand-primary" size={24} /> Workspace Settings
          </h1>
          <p className="mt-2 text-sm text-brand-text-muted">Manage your workspace identity, branding, and fundamental settings.</p>
        </div>
        {profile?.subscription_plan && (
          <div className="flex items-center gap-2 px-4 py-2 bg-brand-surface-low border border-brand-border rounded-lg shadow-sm">
            <span className="text-xs font-semibold text-brand-text-muted uppercase tracking-wider">Plan</span>
            <span className="text-sm font-bold text-brand-primary">{profile.subscription_plan}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-8">
          <OrgProfileForm
            formData={formData}
            hasChanges={hasChanges}
            isSaving={isSaving}
            isUploading={isUploading}
            fileInputRef={fileInputRef}
            onChange={handleChange}
            onFileChange={handleFileChange}
            onSave={handleSave}
          />
          <OrgDangerZone
            isDeletionScheduled={deletionStatus?.status === 'DELETING'}
            onDeleteClick={() => setIsDeleteDialogOpen(true)}
          />
        </div>
        <OrgInfoSidebar profile={profile} displayName={displayName} displayLogoUrl={displayLogoUrl} />
      </div>

      <DeleteOrgModal
        isOpen={isDeleteDialogOpen}
        profileName={profile?.name}
        deleteOrgName={deleteOrgName}
        deletePassword={deletePassword}
        isDeleting={isDeleting}
        onOrgNameChange={setDeleteOrgName}
        onPasswordChange={setDeletePassword}
        onSubmit={handleDeleteSubmit}
        onClose={() => { setIsDeleteDialogOpen(false); setDeleteOrgName(''); setDeletePassword(''); }}
      />
    </div>
  );
};

export default Organization;
