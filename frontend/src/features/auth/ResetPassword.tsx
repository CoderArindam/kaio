import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { resetPassword } from '../../services/authApi';
import { LayoutGrid, Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      navigate('/forgot-password', { replace: true });
    }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (newPassword.length < 8) {
      setValidationError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setValidationError('Passwords do not match.');
      return;
    }
    if (!token) return;

    setIsSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      toast.success('Password reset successfully.');
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (error: any) {
      const errorCode = error?.response?.data?.error_code;
      if (errorCode === 'TOKEN_INVALID' || errorCode === 'TOKEN_EXPIRED') {
        setTokenError(error?.response?.data?.detail || 'This link is invalid or has expired.');
      } else {
        setTokenError(error.message || 'An error occurred.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) return null;

  return (
    <div className="w-full max-w-[440px] px-4 mx-auto flex items-center justify-center min-h-screen">
      <div className="w-full bg-brand-surface border border-brand-border rounded-xl shadow-md overflow-hidden flex flex-col p-6 md:p-8 transition-all duration-300">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-12 h-12 mb-4 bg-brand-surface-low rounded-lg flex items-center justify-center border border-brand-outline-variant text-brand-primary">
            <LayoutGrid size={24} className="stroke-[2]" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-brand-text mb-2">
            Set a new password
          </h1>
        </div>

        {tokenError ? (
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
              <AlertTriangle size={32} />
            </div>
            <p className="text-sm text-brand-text-muted mb-4">{tokenError}</p>
            <Link
              to="/forgot-password"
              className="text-brand-primary hover:text-brand-primary-hover font-semibold text-sm transition-colors"
            >
              Request a new one →
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {validationError && (
              <div className="p-3 text-xs font-medium text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg">
                {validationError}
              </div>
            )}

            <div className="flex flex-col gap-1.5 relative">
              <label className="text-xs font-semibold text-brand-text-muted">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-brand-surface border border-brand-outline-variant text-brand-text text-sm rounded px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors placeholder:text-brand-outline"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-primary transition"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-brand-text-muted">
                Confirm Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full bg-brand-surface border border-brand-outline-variant text-brand-text text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors placeholder:text-brand-outline"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !newPassword || !confirmPassword}
              className="mt-3 w-full bg-brand-primary hover:bg-brand-primary-hover text-white font-medium text-sm rounded-lg py-2.5 px-4 flex items-center justify-center gap-2 transition-colors duration-300 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
