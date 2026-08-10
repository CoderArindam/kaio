import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { sendVerificationEmail } from '../../../services/authApi';
import toast from 'react-hot-toast';

interface EmailVerificationSectionProps {
  user: any;
}

export const EmailVerificationSection: React.FC<EmailVerificationSectionProps> = ({ user }) => {
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

export default EmailVerificationSection;
