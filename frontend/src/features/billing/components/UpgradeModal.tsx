import React, { useState } from 'react';
import { CheckCircle2, Zap, Building2, Loader2, X } from 'lucide-react';
import { PlanCard } from './PlanCard';
import toast from 'react-hot-toast';

interface UpgradeModalProps {
  currentPlan: string;
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: (planId: 'FREE' | 'PRO' | 'ENTERPRISE') => Promise<void>;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ currentPlan, isOpen, onClose, onUpgrade }) => {
  const [selectedPlan, setSelectedPlan] = useState<'FREE' | 'PRO' | 'ENTERPRISE'>(currentPlan as any || 'FREE');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const plans = [
    {
      id: 'FREE' as const,
      name: 'Free',
      price: '$0',
      description: 'Perfect for small teams getting started.',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
      features: [
        'Up to 5 team members',
        '3 Projects (Boards)',
        'Basic Task Management',
        'Community Support'
      ],
      isPopular: false
    },
    {
      id: 'PRO' as const,
      name: 'Pro',
      price: '$12',
      period: '/mo',
      description: 'Advanced features for growing teams.',
      icon: <Zap className="w-5 h-5 text-brand-primary" />,
      features: [
        'Unlimited team members',
        'Unlimited Projects',
        'AI Task Proposals',
        'Advanced Reporting',
        'Priority Support'
      ],
      isPopular: true
    },
    {
      id: 'ENTERPRISE' as const,
      name: 'Enterprise',
      price: 'Custom',
      description: 'Dedicated support and infrastructure.',
      icon: <Building2 className="w-5 h-5 text-indigo-500" />,
      features: [
        'Everything in Pro',
        'Custom SSO (SAML)',
        'Dedicated Success Manager',
        'On-premise Deployment',
        '99.9% Uptime SLA'
      ],
      isPopular: false
    }
  ];

  const handleContinue = async () => {
    if (selectedPlan !== 'FREE') {
      toast.success(`${selectedPlan === 'PRO' ? 'Pro' : 'Enterprise'} tier integration coming soon!`, {
        icon: '🚀'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onUpgrade(selectedPlan);
      toast.success(`Successfully switched to ${selectedPlan} plan!`);
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to update plan");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-brand-surface w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden border border-brand-border/50 relative max-h-[95vh] flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-6 sm:px-10 sm:py-8 border-b border-brand-border/50 relative shrink-0">
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full hover:bg-brand-surface-low transition-colors text-brand-text-muted hover:text-brand-text"
          >
            <X size={24} />
          </button>
          
          <h2 className="text-3xl font-bold text-brand-text mb-2">Upgrade your workspace</h2>
          <p className="text-brand-text-muted text-lg">
            Choose the plan that best fits your team's needs.
          </p>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 sm:p-10 overflow-y-auto flex-1 bg-brand-bg">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {plans.map((plan, index) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isSelected={selectedPlan === plan.id}
                onSelect={() => setSelectedPlan(plan.id)}
                delayMs={index * 100}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-6 sm:px-10 border-t border-brand-border/50 bg-brand-surface-low shrink-0 flex items-center justify-between">
          <p className="text-sm text-brand-text-muted hidden sm:block">
            {selectedPlan === currentPlan ? 'You are currently on this plan.' : 'You will be billed immediately upon upgrading.'}
          </p>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-6 py-3 font-semibold text-brand-text hover:bg-brand-surface-high rounded-xl transition-colors flex-1 sm:flex-none"
            >
              Cancel
            </button>
            <button
              onClick={handleContinue}
              disabled={isSubmitting || selectedPlan === currentPlan}
              className="px-8 py-3 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-semibold shadow-lg shadow-brand-primary/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed flex-1 sm:flex-none min-w-[160px]"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : selectedPlan === currentPlan ? (
                'Current Plan'
              ) : (
                'Confirm Upgrade'
              )}
            </button>
          </div>
        </div>
        
      </div>
    </div>
  );
};
