import React, { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { changePassword } from "../../../services/usersApi";
import toast from "react-hot-toast";

interface PasswordSectionProps {
  policy: any;
  onPasswordChanged?: () => void;
}

export const PasswordSection: React.FC<PasswordSectionProps> = ({
  policy,
  onPasswordChanged,
}) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const calculateStrength = () => {
    let score = 0;
    if (!newPassword)
      return { score: 0, text: "", color: "bg-brand-surface-low" };
    if (newPassword.length >= (policy?.min_length || 8)) score++;
    if (policy?.require_uppercase && /[A-Z]/.test(newPassword)) score++;
    if (policy?.require_lowercase && /[a-z]/.test(newPassword)) score++;
    if (policy?.require_number && /[0-9]/.test(newPassword)) score++;
    if (policy?.require_special && /[^A-Za-z0-9]/.test(newPassword)) score++;
    if (score <= 2) return { score, text: "Weak", color: "bg-red-500" };
    if (score <= 4) return { score, text: "Good", color: "bg-yellow-500" };
    return { score, text: "Strong", color: "bg-green-500" };
  };

  const strength = calculateStrength();

  const meetsPolicy = () => {
    if (newPassword.length < (policy?.min_length || 8)) return false;
    if (policy?.require_uppercase && !/[A-Z]/.test(newPassword)) return false;
    if (policy?.require_lowercase && !/[a-z]/.test(newPassword)) return false;
    if (policy?.require_number && !/[0-9]/.test(newPassword)) return false;
    if (policy?.require_special && !/[^A-Za-z0-9]/.test(newPassword))
      return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (!meetsPolicy()) {
      toast.error("Password does not meet the security policy");
      return;
    }
    try {
      setIsSaving(true);
      await changePassword(currentPassword, newPassword);
      toast.success("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      onPasswordChanged?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setIsSaving(false);
    }
  };

  const canSubmit =
    currentPassword &&
    newPassword &&
    confirmPassword &&
    meetsPolicy() &&
    newPassword === confirmPassword;

  return (
    <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm overflow-hidden mb-8">
      <div className="p-6 border-b border-brand-border">
        <h2 className="text-lg font-semibold text-brand-text mb-1">
          Change Password
        </h2>
        <p className="text-sm text-brand-text-muted">
          Ensure your account is using a long, random password to stay secure.
        </p>
      </div>
      <div className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1">
              Current Password
            </label>
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
              <label className="block text-sm font-medium text-brand-text mb-1">
                New Password
              </label>
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
                    <span className="text-brand-text-muted">
                      Password Strength
                    </span>
                    <span
                      className={`font-medium ${
                        strength.text === "Strong"
                          ? "text-green-500"
                          : strength.text === "Good"
                            ? "text-yellow-500"
                            : "text-red-500"
                      }`}
                    >
                      {strength.text}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-brand-surface-low rounded-full overflow-hidden flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-full w-1/5 ${strength.score >= i ? strength.color : "bg-transparent"}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text mb-1">
                Confirm New Password
              </label>
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
              disabled={!canSubmit || isSaving}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                canSubmit
                  ? "bg-brand-surface-low border border-brand-border hover:bg-brand-surface text-brand-text shadow-sm"
                  : "bg-brand-surface-low text-brand-text-muted border border-brand-border opacity-50 cursor-not-allowed"
              }`}
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Update Password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PasswordSection;
