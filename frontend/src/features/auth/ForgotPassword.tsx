import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../../services/authApi';
import { LayoutGrid, Loader2, Mail, ArrowLeft } from 'lucide-react';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await forgotPassword(email);
      setIsSuccess(true);
    } catch {
      // Always show success to prevent email enumeration
      setIsSuccess(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-[440px] px-4 mx-auto flex items-center justify-center min-h-screen">
      <div className="w-full bg-brand-surface border border-brand-border rounded-xl shadow-md overflow-hidden flex flex-col p-6 md:p-8 transition-all duration-300">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-12 h-12 mb-4 bg-brand-surface-low rounded-lg flex items-center justify-center border border-brand-outline-variant text-brand-primary">
            <LayoutGrid size={24} className="stroke-[2]" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-brand-text mb-2">
            Forgot your password?
          </h1>

          <p className="text-sm text-brand-text-muted max-w-[300px]">
            Enter your email and we'll send you a reset link if an account exists.
          </p>
        </div>

        {isSuccess ? (
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center mb-4">
              <Mail size={32} />
            </div>
            <h2 className="text-lg font-semibold text-brand-text mb-2">Check your inbox</h2>
            <p className="text-sm text-brand-text-muted mb-6">
              If that email is registered, a reset link is on its way.
            </p>
            <Link
              to="/login"
              className="text-brand-primary hover:text-brand-primary-hover font-semibold text-sm transition-colors flex items-center gap-1"
            >
              <ArrowLeft size={14} />
              Back to login
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-brand-text-muted">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="alex@company.com"
                  className="w-full bg-brand-surface border border-brand-outline-variant text-brand-text text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors placeholder:text-brand-outline"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-3 w-full bg-brand-primary hover:bg-brand-primary-hover text-white font-medium text-sm rounded-lg py-2.5 px-4 flex items-center justify-center gap-2 transition-colors duration-300 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                {isSubmitting ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="text-brand-primary hover:text-brand-primary-hover font-semibold text-xs transition-colors flex items-center justify-center gap-1"
              >
                <ArrowLeft size={14} />
                Back to login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
