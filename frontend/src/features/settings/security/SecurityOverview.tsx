import React from 'react';
import { Key, Globe, Smartphone, Shield, CheckCircle2, AlertCircle } from 'lucide-react';

interface SecurityOverviewProps {
  user: any;
}

export const SecurityOverview: React.FC<SecurityOverviewProps> = ({ user }) => {
  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm overflow-hidden mb-8">
      <div className="p-6 border-b border-brand-border">
        <h2 className="text-lg font-semibold text-brand-text mb-1">Account Security Overview</h2>
        <p className="text-sm text-brand-text-muted">Overview of your current account security posture.</p>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 bg-brand-surface-low rounded-lg border border-brand-border">
            <div className="flex items-center gap-3">
              <Key className="text-green-500" size={20} />
              <div>
                <p className="text-sm font-medium text-brand-text">Password</p>
                <p className="text-xs text-brand-text-muted">Protected</p>
              </div>
            </div>
            <CheckCircle2 className="text-green-500" size={18} />
          </div>

          <div className="flex items-center justify-between p-4 bg-brand-surface-low rounded-lg border border-brand-border">
            <div className="flex items-center gap-3">
              <Globe className={user?.is_email_verified ? 'text-green-500' : 'text-yellow-500'} size={20} />
              <div>
                <p className="text-sm font-medium text-brand-text">Email Verification</p>
                <p className="text-xs text-brand-text-muted">{user?.is_email_verified ? 'Verified' : 'Pending'}</p>
              </div>
            </div>
            {user?.is_email_verified ? (
              <CheckCircle2 className="text-green-500" size={18} />
            ) : (
              <AlertCircle className="text-yellow-500" size={18} />
            )}
          </div>

          <div className="flex items-center justify-between p-4 bg-brand-surface-low rounded-lg border border-brand-border">
            <div className="flex items-center gap-3">
              <Smartphone className="text-green-500" size={20} />
              <div>
                <p className="text-sm font-medium text-brand-text">Active Session</p>
                <p className="text-xs text-brand-text-muted">Currently active</p>
              </div>
            </div>
            <CheckCircle2 className="text-green-500" size={18} />
          </div>

          <div className="flex items-center justify-between p-4 bg-brand-surface-low rounded-lg border border-brand-border">
            <div className="flex items-center gap-3">
              <Shield className={user?.is_2fa_enabled ? 'text-green-500' : 'text-amber-500'} size={20} />
              <div>
                <p className="text-sm font-medium text-brand-text">Two-Factor Authentication (2FA)</p>
                <p className="text-xs text-brand-text-muted">{user?.is_2fa_enabled ? 'Enabled' : 'Disabled'}</p>
              </div>
            </div>
            {user?.is_2fa_enabled ? (
              <CheckCircle2 className="text-green-500" size={18} />
            ) : (
              <AlertCircle className="text-amber-500" size={18} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityOverview;
