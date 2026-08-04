import React, { useState } from "react";
import { CreditCard, ShieldAlert } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useOrganizationStore } from "../../store/organizationStore";
import toast from "react-hot-toast";
import { usePageTitle } from "../../hooks/usePageTitle";
import { UpgradeModal } from "../billing/components/UpgradeModal";

export const BillingSettings: React.FC = () => {
  const { user, updateUserLocally } = useAuthStore();
  const { profile, updateProfile } = useOrganizationStore();

  usePageTitle("Billing & Subscription");

  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  if (user?.role !== "SUPER_ADMIN") {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-xl font-bold text-brand-text mb-2">
            Access Denied
          </h2>
          <p className="text-brand-text-muted">
            Only Super Admins can manage Billing settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl animate-in fade-in duration-300 relative">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-brand-text flex items-center gap-2">
          <CreditCard className="text-brand-primary" size={24} />
          Billing & Subscription
        </h1>
        <p className="mt-2 text-sm text-brand-text-muted">
          Manage your plan, billing cycle, and payment methods.
        </p>
      </div>

      <div className="space-y-8">
        <div className="bg-brand-surface border border-brand-border rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-brand-border flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-brand-text">
                Subscription Plan
              </h3>
              <p className="text-sm text-brand-text-muted mt-1">
                Your current active plan and feature limits.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-brand-primary/10 text-brand-primary border border-brand-primary/20 rounded-full text-xs font-bold uppercase tracking-wider">
                {profile?.subscription_plan || 'FREE'} Plan
              </span>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-medium text-brand-text">
                  Current Plan
                </h4>
                <p className="text-sm text-brand-text-muted mt-1 max-w-md">
                  {profile?.subscription_plan === 'FREE' 
                    ? 'You are currently on the Free plan. Upgrade to unlock AI features, unlimited projects, and advanced reporting.'
                    : `You are currently on the ${profile?.subscription_plan} plan, enjoying premium features.`}
                </p>
              </div>
              <button
                onClick={() => setIsUpgradeModalOpen(true)}
                className="px-4 py-2 bg-brand-primary text-white rounded-md text-sm font-medium hover:bg-brand-primary/90 transition-colors shadow-sm whitespace-nowrap"
              >
                {profile?.subscription_plan === 'FREE' ? 'Upgrade Plan' : 'Change Plan'}
              </button>
            </div>

            <div className="w-full h-px bg-brand-border" />
            
            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-medium text-brand-text">
                  Payment Method
                </h4>
                <p className="text-sm text-brand-text-muted mt-1">
                  No payment method on file.
                </p>
              </div>
              <button
                onClick={() => toast.success(profile?.subscription_plan === 'FREE' ? "Please upgrade your plan to add a payment method." : "Payment portal integration coming soon.")}
                className="px-4 py-2 border border-brand-border text-brand-text rounded-md text-sm font-medium hover:bg-brand-surface-high transition-colors whitespace-nowrap"
              >
                Add Card
              </button>
            </div>
            
            <div className="w-full h-px bg-brand-border" />

            <div className="flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-medium text-brand-text">
                  Billing History
                </h4>
                <p className="text-sm text-brand-text-muted mt-1">
                  View and download past invoices.
                </p>
              </div>
              <button
                onClick={() => toast.success(profile?.subscription_plan === 'FREE' ? "No past invoices available for Free plan." : "Billing portal coming soon.")}
                className="px-4 py-2 border border-brand-border text-brand-text rounded-md text-sm font-medium hover:bg-brand-surface-high transition-colors whitespace-nowrap"
              >
                View Invoices
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade Modal */}
      {profile && (
        <UpgradeModal 
          isOpen={isUpgradeModalOpen} 
          currentPlan={profile.subscription_plan || 'FREE'}
          onClose={() => setIsUpgradeModalOpen(false)}
          onUpgrade={async (planId) => {
            await updateProfile({ subscription_plan: planId });
            updateUserLocally({ org_subscription_plan: planId });
          }}
        />
      )}
    </div>
  );
};

export default BillingSettings;
