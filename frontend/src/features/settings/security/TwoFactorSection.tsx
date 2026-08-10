import React, { useState } from 'react';
import { Shield, ShieldCheck, Loader2, X, Lock } from 'lucide-react';
import { requestEnable2FA, confirmEnable2FA, disable2FA, resendOtp } from '../../../services/authApi';
import { useAuthStore } from '../../../store/authStore';
import { OTPInput } from '../../../components/shared/OTPInput';
import toast from 'react-hot-toast';

interface TwoFactorSectionProps {
  user: any;
  onStatusChange?: () => void;
}

export const TwoFactorSection: React.FC<TwoFactorSectionProps> = ({ user, onStatusChange }) => {
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
          user?.is_2fa_enabled ? 'bg-green-500/5 border-green-500/20' : 'bg-brand-surface-low border-brand-border'
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
            <button onClick={() => setModalState('CLOSED')} className="absolute right-4 top-4 text-brand-text-muted hover:text-brand-text">
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
            <OTPInput length={6} onComplete={handleConfirmEnable} onResend={handleResendEnableOtp} isSubmitting={isSubmitting} error={otpError} />
          </div>
        </div>
      )}

      {/* Disable 2FA Modal */}
      {modalState === 'DISABLE_PASSWORD' && (
        <div className="fixed inset-0 bg-brand-surface/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-brand-surface border border-brand-border p-6 rounded-xl shadow-xl max-w-md w-full relative">
            <button onClick={() => setModalState('CLOSED')} className="absolute right-4 top-4 text-brand-text-muted hover:text-brand-text">
              <X size={18} />
            </button>
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-12 h-12 mb-3 bg-red-500/10 rounded-lg flex items-center justify-center text-red-500 border border-red-500/20">
                <Lock size={24} />
              </div>
              <h3 className="text-lg font-semibold text-brand-text mb-1">Disable 2FA</h3>
              <p className="text-xs text-brand-text-muted">Please enter your password to confirm disabling Two-Factor Authentication.</p>
            </div>
            <form onSubmit={handleConfirmDisable} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-brand-text-muted mb-1">Current Password</label>
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
                <button type="button" onClick={() => setModalState('CLOSED')} className="px-4 py-2 text-sm text-brand-text-muted hover:text-brand-text">
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

export default TwoFactorSection;
