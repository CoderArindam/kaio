import React from 'react';
import { Save, Image as ImageIcon } from 'lucide-react';
import WorkspaceLogo from '../../../components/common/WorkspaceLogo';

export const INDUSTRIES = [
  'Technology', 'Education', 'Finance', 'Healthcare', 'Marketing',
  'Manufacturing', 'Agency', 'Startup', 'Non-Profit', 'Other',
];

export const COMPANY_SIZES = ['1–10', '11–50', '51–200', '201–500', '500+'];

export interface OrgFormData {
  name: string;
  logo_url: string;
  website: string;
  industry: string;
  company_size: string;
  description: string;
}

interface OrgProfileFormProps {
  formData: OrgFormData;
  hasChanges: boolean;
  isSaving: boolean;
  isUploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
}

export const OrgProfileForm: React.FC<OrgProfileFormProps> = ({
  formData, hasChanges, isSaving, isUploading, fileInputRef, onChange, onFileChange, onSave,
}) => {
  const displayLogoUrl = formData.logo_url;
  const displayName = formData.name || 'Your Workspace';

  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-brand-border">
        <h3 className="text-lg font-semibold text-brand-text">Workspace Profile</h3>
        <p className="text-sm text-brand-text-muted mt-1">Basic information about your organization.</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Logo Upload */}
        <div>
          <label className="block text-sm font-medium text-brand-text mb-2">Workspace Logo</label>
          <div className="flex items-start gap-6">
            <WorkspaceLogo name={displayName} logoUrl={displayLogoUrl} size="xl" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <input type="file" accept="image/png, image/jpeg" className="hidden" ref={fileInputRef} onChange={onFileChange} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-4 py-2 bg-brand-surface-low border border-brand-border rounded-md text-sm font-medium text-brand-text hover:bg-brand-surface-high transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ImageIcon size={16} />
                  {isUploading ? 'Uploading...' : 'Upload Image'}
                </button>
                <span className="text-xs text-brand-text-muted">PNG/JPG. Max 2MB.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label htmlFor="name" className="block text-sm font-medium text-brand-text mb-1">
              Workspace Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text" id="name" name="name" required minLength={3} maxLength={60}
              value={formData.name} onChange={onChange}
              className="w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-md text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
              placeholder="e.g. Acme Corporation"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="website" className="block text-sm font-medium text-brand-text mb-1">Website URL</label>
            <input
              type="url" id="website" name="website" value={formData.website} onChange={onChange}
              className="w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-md text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label htmlFor="industry" className="block text-sm font-medium text-brand-text mb-1">Industry</label>
            <select
              id="industry" name="industry" value={formData.industry} onChange={onChange}
              className="w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-md text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
            >
              <option value="">Select an industry...</option>
              {INDUSTRIES.map((ind) => <option key={ind} value={ind}>{ind}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="company_size" className="block text-sm font-medium text-brand-text mb-1">Company Size</label>
            <select
              id="company_size" name="company_size" value={formData.company_size} onChange={onChange}
              className="w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-md text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
            >
              <option value="">Select company size...</option>
              {COMPANY_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="description" className="block text-sm font-medium text-brand-text mb-1">Description</label>
            <textarea
              id="description" name="description" rows={3} maxLength={500}
              value={formData.description} onChange={onChange}
              className="w-full px-3 py-2 bg-brand-bg border border-brand-border rounded-md text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/50 resize-none"
              placeholder="Tell us a little bit about your workspace..."
            />
            <div className="text-right text-xs text-brand-text-muted mt-1">{formData.description.length}/500</div>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 bg-brand-surface-low border-t border-brand-border flex items-center justify-between">
        <span className="text-sm text-brand-text-muted">
          {hasChanges ? 'You have unsaved changes.' : 'All changes saved.'}
        </span>
        <button
          onClick={onSave}
          disabled={!hasChanges || isSaving || !formData.name}
          className="px-6 py-2 bg-brand-primary text-white text-sm font-medium rounded-md hover:bg-brand-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Save size={16} />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default OrgProfileForm;
