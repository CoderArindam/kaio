import React, { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { verifyEmail, sendVerificationEmail } from '../../services/authApi';
import { useAuthStore } from '../../store/authStore';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

export const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { isAuthenticated, updateUserLocally } = useAuthStore();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isSendingVerification, setIsSendingVerification] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Invalid verification link.');
      return;
    }

    const verify = async () => {
      try {
        await verifyEmail(token);
        setStatus('success');
        updateUserLocally({ is_email_verified: true });
      } catch (error: any) {
        setStatus('error');
        const code = error?.response?.data?.error_code;
        setErrorCode(code);
        if (code === 'TOKEN_EXPIRED') {
          setErrorMessage('This verification link has expired.');
        } else {
          setErrorMessage('This verification link is invalid.');
        }
      }
    };

    verify();
  }, [token, updateUserLocally]);

  const handleResendVerification = async () => {
    setIsSendingVerification(true);
    try {
      await sendVerificationEmail();
      setErrorMessage('Verification email sent! Check your inbox.');
      setErrorCode(null);
    } catch {
      setErrorMessage('Failed to send verification email.');
    } finally {
      setIsSendingVerification(false);
    }
  };

  return (
    <div className="w-full max-w-[440px] px-4 mx-auto flex items-center justify-center min-h-screen">
      <div className="w-full bg-brand-surface border border-brand-border rounded-xl shadow-md overflow-hidden flex flex-col p-6 md:p-8 transition-all duration-300">
        {status === 'loading' && (
          <div className="flex flex-col items-center text-center py-8">
            <Loader2 size={48} className="animate-spin text-brand-primary mb-4" />
            <p className="text-sm text-brand-text-muted">Verifying your email...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center mb-4">
              <CheckCircle2 size={32} />
            </div>
            <h2 className="text-xl font-bold text-brand-text mb-2">Email verified!</h2>
            <p className="text-sm text-brand-text-muted mb-6">
              Your account is active.
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-brand-primary hover:bg-brand-primary-hover text-white font-medium text-sm rounded-lg py-2.5 px-4 transition-colors duration-300 shadow-sm"
            >
              Go to dashboard
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-4">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold text-brand-text mb-2">Verification failed</h2>
            <p className="text-sm text-brand-text-muted mb-6">{errorMessage}</p>

            {(errorCode === 'TOKEN_INVALID' || errorCode === 'TOKEN_EXPIRED') && (
              <>
                {isAuthenticated ? (
                  <button
                    onClick={handleResendVerification}
                    disabled={isSendingVerification}
                    className="w-full bg-brand-primary hover:bg-brand-primary-hover text-white font-medium text-sm rounded-lg py-2.5 px-4 flex items-center justify-center gap-2 transition-colors duration-300 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSendingVerification && <Loader2 size={16} className="animate-spin" />}
                    Request a new verification email
                  </button>
                ) : (
                  <div className="text-sm text-brand-text-muted">
                    <Link
                      to="/login"
                      className="text-brand-primary hover:text-brand-primary-hover font-semibold transition-colors"
                    >
                      Please log in
                    </Link>
                    {' '}to request a new verification email.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
