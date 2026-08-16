import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { registerOrganization, registerOrganizationDirect, verifyRegistrationOtp, skipRegistrationOtp, resendOtp } from '../../services/authApi';
import { LayoutGrid, Eye, EyeOff, Loader2, ArrowLeft, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { OTPInput } from '../../components/shared/OTPInput';

export const Signup: React.FC = () => {
  const [step, setStep] = useState<'FORM' | 'OTP'>('FORM');
  const [orgName, setOrgName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // OTP state
  const [registrationToken, setRegistrationToken] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  const handleInitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }

    setIsSubmitting(true);
    setOtpError(null);

    try {
      const response = await registerOrganization(orgName, email, password, firstName, lastName);
      if (response.otp_required) {
        setRegistrationToken(response.registration_token);
        setMaskedEmail(response.email);
        setStep('OTP');
        toast.success("Verification code sent to your email!");
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message || "Registration failed. Email might already be in use.";
      toast.error(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDirectSubmit = async () => {
    if (!orgName || !firstName || !email || !password) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await registerOrganizationDirect(orgName, email, password, firstName, lastName);
      useAuthStore.setState({
        isAuthenticated: true,
        isInitializing: false,
        user: {
          id: response.user?.id,
          email: response.user?.email ?? email,
          first_name: response.user?.first_name ?? firstName,
          last_name: response.user?.last_name ?? lastName,
          role: response.user?.role ?? 'SUPER_ADMIN',
          organization_id: response.user?.organization_id,
          is_email_verified: false
        }
      });

      toast.success("Organization created successfully!");
      navigate("/plans");
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message || "Registration failed. Email might already be in use.";
      toast.error(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (code: string) => {
    setIsSubmitting(true);
    setOtpError(null);

    try {
      const result = await verifyRegistrationOtp(registrationToken, code);

      useAuthStore.setState({
        isAuthenticated: true,
        isInitializing: false,
        user: {
          id: result.user?.id,
          email: result.user?.email ?? email,
          first_name: result.user?.first_name ?? firstName,
          last_name: result.user?.last_name ?? lastName,
          role: result.user?.role ?? 'SUPER_ADMIN',
          organization_id: result.user?.organization_id,
          is_email_verified: true
        }
      });

      toast.success("Organization created and verified successfully!");
      navigate("/plans");
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message || "Invalid verification code";
      setOtpError(detail);
      toast.error(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipOtp = async () => {
    setIsSubmitting(true);
    setOtpError(null);

    try {
      const response = await skipRegistrationOtp(registrationToken);
      useAuthStore.setState({
        isAuthenticated: true,
        isInitializing: false,
        user: {
          id: response.user?.id,
          email: response.user?.email ?? email,
          first_name: response.user?.first_name ?? firstName,
          last_name: response.user?.last_name ?? lastName,
          role: response.user?.role ?? 'SUPER_ADMIN',
          organization_id: response.user?.organization_id,
          is_email_verified: false
        }
      });

      toast.success("Account created! You can verify your email later.");
      navigate("/plans");
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message || "Failed to skip verification";
      toast.error(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    try {
      const response = await resendOtp(registrationToken);
      if (response.new_mfa_token) {
        setRegistrationToken(response.new_mfa_token);
      }
      toast.success("A new verification code has been sent!");
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message || "Failed to resend code";
      toast.error(detail);
    }
  };

  return (
    <div className="w-full max-w-[440px] px-4 mx-auto flex items-center justify-center min-h-screen my-8">
      <div className="w-full bg-brand-surface border border-brand-border rounded-xl shadow-md overflow-hidden flex flex-col p-6 md:p-8 transition-all duration-300">
        
        {step === 'FORM' ? (
          <>
            {/* Header */}
            <div className="flex flex-col items-center mb-6 text-center">
              <div className="w-12 h-12 mb-4 bg-brand-surface-low rounded-lg flex items-center justify-center border border-brand-outline-variant text-brand-primary">
                <LayoutGrid size={24} className="stroke-[2]" />
              </div>

              <h1 className="text-2xl font-semibold tracking-tight text-brand-text mb-2">
                Create your organization
              </h1>

              <p className="text-sm text-brand-text-muted max-w-[280px]">
                Start managing your projects efficiently with KAIO.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleInitSubmit} className="flex flex-col gap-4">
              {/* Org Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-brand-text-muted">
                  Organization Name
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  placeholder="Acme Inc."
                  className="w-full bg-brand-surface border border-brand-outline-variant text-brand-text text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors placeholder:text-brand-outline"
                />
              </div>

              <div className="flex gap-4">
                {/* First Name */}
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-xs font-semibold text-brand-text-muted">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    placeholder="Alex"
                    className="w-full bg-brand-surface border border-brand-outline-variant text-brand-text text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors placeholder:text-brand-outline"
                  />
                </div>

                {/* Last Name */}
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-xs font-semibold text-brand-text-muted">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    className="w-full bg-brand-surface border border-brand-outline-variant text-brand-text text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors placeholder:text-brand-outline"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-brand-text-muted">
                  Admin Email Address
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

              {/* Password */}
              <div className="flex flex-col gap-1.5 relative">
                <label className="text-xs font-semibold text-brand-text-muted">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="•••••••• (min 8 characters)"
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

              {/* Confirm Password */}
              <div className="flex flex-col gap-1.5 relative">
                <label className="text-xs font-semibold text-brand-text-muted">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full bg-brand-surface border border-brand-outline-variant text-brand-text text-sm rounded px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary transition-colors placeholder:text-brand-outline"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-primary transition"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2.5 mt-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-brand-primary hover:bg-brand-primary-hover text-white font-medium text-sm rounded-lg py-2.5 px-4 flex items-center justify-center gap-2 transition-colors duration-300 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  {isSubmitting ? "Sending OTP..." : "Continue with Email Verification"}
                </button>

                <button
                  type="button"
                  onClick={handleDirectSubmit}
                  disabled={isSubmitting}
                  className="w-full border border-brand-outline-variant hover:border-brand-primary/50 bg-brand-surface-low hover:bg-brand-surface-high text-brand-text font-medium text-xs rounded-lg py-2 px-4 flex items-center justify-center gap-2 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue without Email Verification
                </button>
              </div>
            </form>

            {/* Footer */}
            <div className="mt-6 text-center">
              <p className="text-sm text-brand-text-muted">
                Already have an account?{" "}
                <Link
                  to="/login"
                  className="text-brand-primary hover:text-brand-primary-hover font-semibold text-xs transition-colors ml-1"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </>
        ) : (
          <>
            {/* OTP Step Header */}
            <div className="flex flex-col items-center mb-6 text-center">
              <div className="w-12 h-12 mb-4 bg-brand-primary/10 rounded-lg flex items-center justify-center border border-brand-primary/20 text-brand-primary">
                <KeyRound size={24} className="stroke-[2]" />
              </div>

              <h1 className="text-2xl font-semibold tracking-tight text-brand-text mb-2">
                Check your email
              </h1>

              <p className="text-sm text-brand-text-muted max-w-[320px]">
                We sent a 6-digit verification code to <span className="font-semibold text-brand-text">{maskedEmail}</span>
              </p>
            </div>

            {/* OTP Input */}
            <div className="my-2">
              <OTPInput
                length={6}
                onComplete={handleVerifyOtp}
                onResend={handleResendCode}
                isSubmitting={isSubmitting}
                error={otpError}
              />
            </div>

            {/* Skip Option and Back button */}
            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleSkipOtp}
                disabled={isSubmitting}
                className="text-xs font-semibold text-brand-primary hover:text-brand-primary-hover transition-colors underline underline-offset-4"
              >
                Skip verification & continue for now
              </button>

              <button
                type="button"
                onClick={() => setStep('FORM')}
                disabled={isSubmitting}
                className="text-xs font-semibold text-brand-text-muted hover:text-brand-text flex items-center justify-center gap-1.5 transition-colors mt-1"
              >
                <ArrowLeft size={14} />
                <span>Back to registration form</span>
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default Signup;

