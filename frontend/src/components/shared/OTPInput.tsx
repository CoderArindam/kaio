import React, { useState, useRef, useEffect } from 'react';
import { Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';

interface OTPInputProps {
  length?: number;
  onComplete: (code: string) => void;
  onResend?: () => Promise<void> | void;
  isSubmitting?: boolean;
  error?: string | null;
  email?: string;
  autoFocus?: boolean;
}

export const OTPInput: React.FC<OTPInputProps> = ({
  length = 6,
  onComplete,
  onResend,
  isSubmitting = false,
  error = null,
  email,
  autoFocus = true,
}) => {
  const [otp, setOtp] = useState<string[]>(Array(length).fill(''));
  const [cooldown, setCooldown] = useState<number>(60);
  const [isResending, setIsResending] = useState<boolean>(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  // Cooldown countdown timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleChange = (index: number, value: string) => {
    // Only accept numeric inputs
    const digit = value.slice(-1);
    if (digit && !/^\d$/.test(digit)) return;

    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    // Auto-advance to next input
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Trigger onComplete when all digits filled
    const fullCode = newOtp.join('');
    if (fullCode.length === length && !newOtp.includes('')) {
      onComplete(fullCode);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        // Move to previous input on backspace if current is empty
        inputRefs.current[index - 1]?.focus();
      } else {
        const newOtp = [...otp];
        newOtp[index] = '';
        setOtp(newOtp);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    if (!/^\d+$/.test(pastedData)) return;

    const digits = pastedData.slice(0, length).split('');
    const newOtp = [...otp];
    digits.forEach((d, i) => {
      newOtp[i] = d;
    });
    setOtp(newOtp);

    // Focus on input after last pasted digit
    const nextIndex = Math.min(digits.length, length - 1);
    inputRefs.current[nextIndex]?.focus();

    if (newOtp.join('').length === length && !newOtp.includes('')) {
      onComplete(newOtp.join(''));
    }
  };

  const handleResendClick = async () => {
    if (cooldown > 0 || isResending || !onResend) return;
    setIsResending(true);
    try {
      await onResend();
      setCooldown(60);
      setOtp(Array(length).fill(''));
      if (inputRefs.current[0]) {
        inputRefs.current[0].focus();
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      {/* 6 Digit Input Boxes */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 w-full">
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => (inputRefs.current[index] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={isSubmitting}
            className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-lg border transition-all duration-200 focus:outline-none focus:ring-2 disabled:opacity-50 ${
              error
                ? 'border-red-500/80 bg-red-500/5 text-red-500 focus:ring-red-500/50'
                : digit
                ? 'border-brand-primary bg-brand-primary/5 text-brand-text ring-1 ring-brand-primary/30'
                : 'border-brand-outline-variant bg-brand-surface text-brand-text focus:border-brand-primary focus:ring-brand-primary/50'
            }`}
          />
        ))}
      </div>

      {/* Error display */}
      {error && (
        <p className="text-xs text-red-500 font-medium text-center animate-pulse">
          {error}
        </p>
      )}

      {/* Submitting state or Resend Action */}
      <div className="flex flex-col items-center gap-2 text-xs">
        {isSubmitting ? (
          <div className="flex items-center gap-2 text-brand-primary font-medium">
            <Loader2 size={16} className="animate-spin" />
            <span>Verifying code...</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-brand-text-muted">
            <span>Didn't receive the code?</span>
            <button
              type="button"
              onClick={handleResendClick}
              disabled={cooldown > 0 || isResending}
              className={`font-semibold flex items-center gap-1 transition-colors ${
                cooldown > 0 || isResending
                  ? 'text-brand-outline cursor-not-allowed'
                  : 'text-brand-primary hover:text-brand-primary-hover'
              }`}
            >
              {isResending ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Sending...
                </>
              ) : cooldown > 0 ? (
                <span>Resend in {cooldown}s</span>
              ) : (
                <>
                  <RefreshCw size={12} />
                  Resend Code
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
