import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { usePageTitle } from '../../hooks/usePageTitle';
import { getPasswordPolicy } from '../../services/authApi';
import { SecurityOverview } from './security/SecurityOverview';
import { TwoFactorSection } from './security/TwoFactorSection';
import { EmailVerificationSection } from './security/EmailVerificationSection';
import { PasswordSection } from './security/PasswordSection';
import { ActiveSessions } from './security/ActiveSessions';
import { SecurityEvents } from './security/SecurityEvents';

export const Security: React.FC = () => {
  const { user } = useAuthStore();
  const [policy, setPolicy] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  usePageTitle('Security');

  useEffect(() => {
    getPasswordPolicy().then(setPolicy).catch(console.error);
  }, []);

  const handleRefreshEvents = () => setRefreshKey((prev) => prev + 1);

  return (
    <div className="max-w-4xl animate-fade-in pb-12">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-text mb-2">Security Settings</h1>
        <p className="text-brand-text-muted">Manage your account security, two-factor authentication, active sessions, and security log.</p>
      </div>

      <EmailVerificationSection user={user} />
      <TwoFactorSection user={user} onStatusChange={handleRefreshEvents} />
      <SecurityOverview user={user} />
      <PasswordSection policy={policy} onPasswordChanged={handleRefreshEvents} />
      <ActiveSessions onSessionsRevoked={handleRefreshEvents} />
      <SecurityEvents refreshKey={refreshKey} />
    </div>
  );
};

export default Security;
