import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { usePageTitle } from '../../hooks/usePageTitle';
import { 
  getSessions, 
  signOutOtherSessions, 
  getSecurityEvents, 
  getPasswordPolicy,
  sendVerificationEmail,
  requestEnable2FA,
  confirmEnable2FA,
  disable2FA,
  resendOtp,
} from '../../services/authApi';
import { changePassword } from '../../services/usersApi';
import toast from 'react-hot-toast';
import { 
  Shield, 
  ShieldCheck,
  ShieldAlert,
  Key, 
  Smartphone, 
  CheckCircle2, 
  AlertCircle,
  Laptop,
  Globe,
  LogOut,
  Loader2,
  RefreshCw,
  X,
  Lock
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { OTPInput } from '../../components/shared/OTPInput';

const SecurityOverview = ({ user }: { user: any }) => {
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
              <Globe className={user?.is_email_verified ? "text-green-500" : "text-yellow-500"} size={20} />
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
              <Shield className={user?.is_2fa_enabled ? "text-green-500" : "text-amber-500"} size={20} />
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

const TwoFactorSection = ({ user, onStatusChange }: { user: any, onStatusChange?: () => void }) => {
  const [modalState, setModalState] = useState<'CLOSED' | 'ENABLE_OTP' | 'DISABLE_PASSWORD'>('CLOSED');
  const [mfaToken, setMfaToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { updateUserLocally } = useAuthStore();

  const handleStartEnable = async () => {
    setIsSubmitting(true);
    setOtpError(null);
    try {
      const res = await requestEnable2FA();
      setMfaToken(res.mfa_token);
      setMaskedEmail(res.email || user?.email);
      setModalState('ENABLE_OTP');
      toast.success('Verification OTP code sent to your email.');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to start 2FA setup');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmEnable = async (otpCode: string) => {
    setIsSubmitting(true);
    setOtpError(null);
    try {
      await confirmEnable2FA(mfaToken, otpCode);
      updateUserLocally({ is_2fa_enabled: true });
      toast.success('Two-factor authentication (2FA) enabled!');
      setModalState('CLOSED');
      onStatusChange?.();
    } catch (error: any) {
      const detail = error.response?.data?.detail || 'Failed to confirm 2FA code';
      setOtpError(detail);
      toast.error(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendEnableOtp = async () => {
    try {
      const res = await resendOtp(mfaToken);
      if (res.new_mfa_token) setMfaToken(res.new_mfa_token);
      toast.success('A new 2FA setup verification code has been sent!');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to resend code');
    }
  };

  const handleConfirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword) return;

    setIsSubmitting(true);
    try {
      await disable2FA(disablePassword);
      updateUserLocally({ is_2fa_enabled: false });
      toast.success('Two-factor authentication disabled.');
      setModalState('CLOSED');
      setDisablePassword('');
      onStatusChange?.();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Incorrect password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm overflow-hidden mb-8">
      <div className="p-6 border-b border-brand-border flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-brand-text mb-1">Two-Factor Authentication (2FA)</h2>
          <p className="text-sm text-brand-text-muted">Add an extra layer of security to your account using Email OTP verification.</p>
        </div>
        <div>
          {user?.is_2fa_enabled ? (
            <button
              onClick={() => setModalState('DISABLE_PASSWORD')}
              className="px-4 py-2 text-sm bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 rounded-md font-medium transition-colors"
            >
              Disable 2FA
            </button>
          ) : (
            <button
              onClick={handleStartEnable}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm bg-brand-primary hover:bg-brand-primary-hover text-white rounded-md font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              Enable 2FA (Email OTP)
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        <div className={`p-4 rounded-lg border flex items-start gap-4 ${
          user?.is_2fa_enabled 
            ? 'bg-green-500/5 border-green-500/20' 
            : 'bg-brand-surface-low border-brand-border'
        }`}>
          <div className="mt-0.5">
            {user?.is_2fa_enabled ? (
              <ShieldCheck className="text-green-500" size={24} />
            ) : (
              <Shield className="text-brand-text-muted" size={24} />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-brand-text">
                {user?.is_2fa_enabled ? 'Two-Factor Authentication is Active' : 'Two-Factor Authentication is Disabled'}
              </h3>
              <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                user?.is_2fa_enabled ? 'bg-green-500/10 text-green-500' : 'bg-brand-border text-brand-text-muted'
              }`}>
                {user?.is_2fa_enabled ? 'Protected' : 'Off'}
              </span>
            </div>
            <p className="text-xs text-brand-text-muted leading-relaxed">
              {user?.is_2fa_enabled 
                ? 'When signing in, KAIO will require both your password and a 6-digit verification code sent to your registered email.'
                : 'Protect your account from unauthorized access by requiring a 6-digit verification code whenever you log in.'}
            </p>
          </div>
        </div>
      </div>

      {/* Enable 2FA Modal */}
      {modalState === 'ENABLE_OTP' && (
        <div className="fixed inset-0 bg-brand-surface/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-brand-surface border border-brand-border p-6 rounded-xl shadow-xl max-w-md w-full relative">
            <button
              onClick={() => setModalState('CLOSED')}
              className="absolute right-4 top-4 text-brand-text-muted hover:text-brand-text"
            >
              <X size={18} />
            </button>
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-12 h-12 mb-3 bg-brand-primary/10 rounded-lg flex items-center justify-center text-brand-primary border border-brand-primary/20">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-lg font-semibold text-brand-text mb-1">Verify 2FA Activation Code</h3>
              <p className="text-xs text-brand-text-muted">
                Enter the 6-digit code sent to <span className="font-semibold text-brand-text">{maskedEmail}</span> to complete setup.
              </p>
            </div>

            <OTPInput
              length={6}
              onComplete={handleConfirmEnable}
              onResend={handleResendEnableOtp}
              isSubmitting={isSubmitting}
              error={otpError}
            />
          </div>
        </div>
      )}

      {/* Disable 2FA Modal */}
      {modalState === 'DISABLE_PASSWORD' && (
        <div className="fixed inset-0 bg-brand-surface/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-brand-surface border border-brand-border p-6 rounded-xl shadow-xl max-w-md w-full relative">
            <button
              onClick={() => setModalState('CLOSED')}
              className="absolute right-4 top-4 text-brand-text-muted hover:text-brand-text"
            >
              <X size={18} />
            </button>
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-12 h-12 mb-3 bg-red-500/10 rounded-lg flex items-center justify-center text-red-500 border border-red-500/20">
                <Lock size={24} />
              </div>
              <h3 className="text-lg font-semibold text-brand-text mb-1">Disable 2FA</h3>
              <p className="text-xs text-brand-text-muted">
                Please enter your password to confirm disabling Two-Factor Authentication.
              </p>
            </div>

            <form onSubmit={handleConfirmDisable} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-brand-text-muted mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-brand-surface-low border border-brand-border rounded-md px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalState('CLOSED')}
                  className="px-4 py-2 text-sm text-brand-text-muted hover:text-brand-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !disablePassword}
                  className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  Disable 2FA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const EmailVerificationSection = ({ user }: { user: any }) => {
  const [isSending, setIsSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSendVerification = async () => {
    setIsSending(true);
    try {
      await sendVerificationEmail();
      toast.success('Verification email sent. Check your inbox.');
      setCooldown(60);
    } catch {
      toast.error('Failed to send verification email.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm overflow-hidden mb-8">
      <div className="p-6 border-b border-brand-border">
        <h2 className="text-lg font-semibold text-brand-text mb-1">Email Verification</h2>
        <p className="text-sm text-brand-text-muted">Verify your email address to secure your account.</p>
      </div>
      <div className="p-6">
        {user?.is_email_verified ? (
          <div className="flex items-center justify-between p-4 bg-green-500/5 rounded-lg border border-green-500/20">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-green-500" size={20} />
              <div>
                <p className="text-sm font-medium text-brand-text">Email verified</p>
                <p className="text-xs text-brand-text-muted">{user?.email}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 bg-amber-500/5 rounded-lg border border-amber-500/20">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-amber-500" size={20} />
              <div>
                <p className="text-sm font-medium text-brand-text">Email not verified</p>
                <p className="text-xs text-brand-text-muted">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleSendVerification}
              disabled={isSending || cooldown > 0}
              className="px-3 py-1.5 text-sm bg-brand-primary hover:bg-brand-primary-hover text-white rounded-md flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending && <Loader2 size={14} className="animate-spin" />}
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send verification email'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const PasswordSection = ({ policy, onPasswordChanged }: { policy: any, onPasswordChanged?: () => void }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const calculateStrength = () => {
    let score = 0;
    if (!newPassword) return { score: 0, text: '', color: 'bg-brand-surface-low' };
    if (newPassword.length >= (policy?.min_length || 8)) score++;
    if (policy?.require_uppercase && /[A-Z]/.test(newPassword)) score++;
    if (policy?.require_lowercase && /[a-z]/.test(newPassword)) score++;
    if (policy?.require_number && /[0-9]/.test(newPassword)) score++;
    if (policy?.require_special && /[^A-Za-z0-9]/.test(newPassword)) score++;

    if (score <= 2) return { score, text: 'Weak', color: 'bg-red-500' };
    if (score <= 4) return { score, text: 'Good', color: 'bg-yellow-500' };
    return { score, text: 'Strong', color: 'bg-green-500' };
  };

  const strength = calculateStrength();
  
  const meetsPolicy = () => {
    if (newPassword.length < (policy?.min_length || 8)) return false;
    if (policy?.require_uppercase && !/[A-Z]/.test(newPassword)) return false;
    if (policy?.require_lowercase && !/[a-z]/.test(newPassword)) return false;
    if (policy?.require_number && !/[0-9]/.test(newPassword)) return false;
    if (policy?.require_special && !/[^A-Za-z0-9]/.test(newPassword)) return false;
    return true;
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (!meetsPolicy()) {
      toast.error('Password does not meet the security policy');
      return;
    }

    try {
      setIsSaving(true);
      await changePassword(currentPassword, newPassword);
      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onPasswordChanged?.();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update password');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm overflow-hidden mb-8">
      <div className="p-6 border-b border-brand-border">
        <h2 className="text-lg font-semibold text-brand-text mb-1">Change Password</h2>
        <p className="text-sm text-brand-text-muted">Ensure your account is using a long, random password to stay secure.</p>
      </div>

      <div className="p-6">
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1">Current Password</label>
            <input 
              type="password" 
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-brand-surface-low border border-brand-border rounded-md px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary transition-colors"
              required
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1">New Password</label>
              <input 
                type="password" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-brand-surface-low border border-brand-border rounded-md px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary transition-colors"
                required
              />
              
              {newPassword && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-brand-text-muted">Password Strength</span>
                    <span className={`font-medium ${
                      strength.text === 'Strong' ? 'text-green-500' : 
                      strength.text === 'Good' ? 'text-yellow-500' : 'text-red-500'
                    }`}>{strength.text}</span>
                  </div>

                  <div className="h-1.5 w-full bg-brand-surface-low rounded-full overflow-hidden flex gap-1">
                    <div className={`h-full w-1/5 ${strength.score >= 1 ? strength.color : 'bg-transparent'}`}></div>
                    <div className={`h-full w-1/5 ${strength.score >= 2 ? strength.color : 'bg-transparent'}`}></div>
                    <div className={`h-full w-1/5 ${strength.score >= 3 ? strength.color : 'bg-transparent'}`}></div>
                    <div className={`h-full w-1/5 ${strength.score >= 4 ? strength.color : 'bg-transparent'}`}></div>
                    <div className={`h-full w-1/5 ${strength.score >= 5 ? strength.color : 'bg-transparent'}`}></div>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1">Confirm New Password</label>
              <input 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-brand-surface-low border border-brand-border rounded-md px-3 py-2 text-sm text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary transition-colors"
                required
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-end border-t border-brand-border mt-6">
            <button
              type="submit"
              disabled={!currentPassword || !newPassword || !confirmPassword || isSaving || !meetsPolicy() || newPassword !== confirmPassword}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                (currentPassword && newPassword && confirmPassword && meetsPolicy() && newPassword === confirmPassword)
                  ? 'bg-brand-surface-low border border-brand-border hover:bg-brand-surface text-brand-text shadow-sm' 
                  : 'bg-brand-surface-low text-brand-text-muted border border-brand-border opacity-50 cursor-not-allowed'
              }`}
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Update Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ActiveSessions = ({ onSessionsRevoked }: { onSessionsRevoked?: () => void }) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const fetchSessions = async () => {
    try {
      const data = await getSessions();
      setSessions(data);
    } catch (error) {
      toast.error('Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleSignOutOther = async () => {
    try {
      setIsSigningOut(true);
      await signOutOtherSessions();
      toast.success('Successfully signed out of other sessions');
      fetchSessions();
      onSessionsRevoked?.();
    } catch (error) {
      toast.error('Failed to sign out of other sessions');
    } finally {
      setIsSigningOut(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm mb-8 relative">
      <div className="p-6 border-b border-brand-border flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-brand-text mb-1">Active Sessions</h2>
          <p className="text-sm text-brand-text-muted">Devices that are currently logged into your account.</p>
        </div>
        {sessions.length > 1 && (
          <button 
            onClick={() => setShowConfirm(true)}
            className="px-3 py-1.5 text-sm bg-brand-surface-low border border-brand-border rounded hover:bg-brand-surface text-brand-text transition-colors"
          >
            Sign out of other sessions
          </button>
        )}
      </div>
      
      {showConfirm && (
        <div className="absolute inset-0 bg-brand-surface/90 backdrop-blur-sm flex items-center justify-center z-10 p-6 rounded-xl">
          <div className="bg-brand-surface-low border border-brand-border p-6 rounded-xl shadow-lg max-w-sm w-full">
            <h3 className="text-lg font-semibold text-brand-text mb-2">Sign out everywhere else?</h3>
            <p className="text-sm text-brand-text-muted mb-6">This will sign you out of all other devices except this one. You will need to log back in on those devices.</p>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm text-brand-text-muted hover:text-brand-text"
                disabled={isSigningOut}
              >
                Cancel
              </button>
              <button 
                onClick={handleSignOutOther}
                disabled={isSigningOut}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded flex items-center gap-2"
              >
                {isSigningOut ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-brand-text-muted" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sessions.map((session) => (
              <div key={session.id} className="bg-brand-surface-low border border-brand-border rounded-lg p-4 flex gap-4">
                <div className="mt-1 text-brand-text-muted">
                  {session.platform?.includes('iOS') || session.platform?.includes('Android') ? (
                    <Smartphone size={24} />
                  ) : (
                    <Laptop size={24} />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-brand-text text-sm">
                      {session.browser || 'Unknown Browser'} on {session.platform || 'Unknown Platform'}
                    </h3>
                    {session.is_current && (
                      <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[10px] uppercase font-bold rounded">
                        Current Device
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-brand-text-muted space-y-1">
                    <p>{session.ip_address || 'Unknown IP'}</p>
                    <p>
                      {session.is_current ? (
                        <span className="text-green-500">Active Now</span>
                      ) : (
                        `Last active ${session.last_active_at ? formatDistanceToNow(new Date(session.last_active_at), { addSuffix: true }) : 'unknown'}`
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const getEventMeta = (event: any) => {
  const browser = event.details?.browser;
  const platform = event.details?.platform;
  const deviceStr = browser && platform 
    ? `${browser} on ${platform}` 
    : (browser || platform || 'Unknown Device');

  switch (event.action) {
    case 'LOGIN':
      return {
        title: 'Successful Login',
        icon: <ShieldCheck size={16} className="text-emerald-500" />,
        deviceStr
      };
    case 'LOGIN_2FA_SUCCESS':
      return {
        title: '2FA Verification Successful',
        icon: <ShieldCheck size={16} className="text-emerald-500" />,
        deviceStr
      };
    case 'FAILED_LOGIN':
      return {
        title: 'Failed Login Attempt',
        icon: <ShieldAlert size={16} className="text-rose-500" />,
        deviceStr
      };
    case 'NEW_DEVICE_LOGIN':
      return {
        title: 'Login from New Device',
        icon: <Laptop size={16} className="text-amber-500" />,
        deviceStr
      };
    case '2FA_ENABLED':
      return {
        title: '2FA Enabled',
        icon: <ShieldCheck size={16} className="text-emerald-500" />,
        deviceStr
      };
    case '2FA_DISABLED':
      return {
        title: '2FA Disabled',
        icon: <ShieldAlert size={16} className="text-amber-500" />,
        deviceStr
      };
    case 'ORG_REGISTERED':
      return {
        title: 'Organization Registered & Verified',
        icon: <ShieldCheck size={16} className="text-blue-500" />,
        deviceStr
      };
    case 'REVOKED_OTHER_SESSIONS':
      return {
        title: 'Signed Out Other Devices',
        icon: <LogOut size={16} className="text-brand-text-muted" />,
        deviceStr
      };
    case 'PASSWORD_CHANGED':
      return {
        title: 'Password Changed',
        icon: <Key size={16} className="text-blue-500" />,
        deviceStr
      };
    default:
      return {
        title: event.action ? event.action.replace(/_/g, ' ') : 'Security Event',
        icon: <Shield size={16} className="text-brand-text-muted" />,
        deviceStr
      };
  }
};

const SecurityEvents = ({ refreshKey }: { refreshKey?: number }) => {
  const [events, setEvents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const data = await getSecurityEvents();
        setEvents(data);
      } catch (error) {
        toast.error('Failed to load security events');
      } finally {
        setIsLoading(false);
      }
    };
    fetchEvents();
  }, [refreshKey]);

  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm overflow-hidden mb-8">
      <div className="p-6 border-b border-brand-border">
        <h2 className="text-lg font-semibold text-brand-text mb-1">Recent Security Activity</h2>
        <p className="text-sm text-brand-text-muted">Review your recent login and security audit log events.</p>
      </div>
      <div className="divide-y divide-brand-border">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-brand-text-muted" />
          </div>
        ) : events.length === 0 ? (
          <div className="p-6 text-center text-brand-text-muted text-sm">
            No recent activity found.
          </div>
        ) : (
          events.map((event) => {
            const meta = getEventMeta(event);
            return (
              <div key={event.id} className="p-4 flex items-center justify-between hover:bg-brand-surface-low transition-colors">
                <div className="flex items-center gap-3">
                  <div className="bg-brand-surface-low p-2 rounded border border-brand-border flex items-center justify-center">
                    {meta.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-text">
                      {meta.title}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-brand-text-muted mt-0.5">
                      <span>{meta.deviceStr}</span>
                      {event.ip_address && (
                        <>
                          <span>•</span>
                          <span>{event.ip_address}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-brand-text-muted whitespace-nowrap">
                  {format(new Date(event.created_at), 'MMM d, yyyy h:mm a')}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export const Security: React.FC = () => {
  const { user } = useAuthStore();
  const [policy, setPolicy] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefreshEvents = () => {
    setRefreshKey((prev) => prev + 1);
  };

  usePageTitle("Security");

  useEffect(() => {
    getPasswordPolicy().then(setPolicy).catch(console.error);
  }, []);

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
