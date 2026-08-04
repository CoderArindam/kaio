import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { updateOrganizationProfile } from '../../services/organizationApi';
import { PlanCard } from './components/PlanCard';
import { CheckCircle2, Zap, Building2, Loader2, Rocket } from 'lucide-react';
import toast from 'react-hot-toast';

const PlansPage: React.FC = () => {
  const { user, updateUserLocally } = useAuthStore();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<'FREE' | 'PRO' | 'ENTERPRISE'>('FREE');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePlanSelect = (planId: 'FREE' | 'PRO' | 'ENTERPRISE') => {
    if (planId === 'FREE') {
      setSelectedPlan(planId);
    } else {
      toast.success(`${planId === 'PRO' ? 'Pro' : 'Enterprise'} tier integration coming soon! Free plan selected for now.`, {
        icon: '🚀'
      });
      setSelectedPlan('FREE'); // Force back to free for now
    }
  };

  const handleContinue = async () => {
    setIsSubmitting(true);
    try {
      if (user?.role === 'SUPER_ADMIN') {
        // Call API to complete onboarding
        await updateOrganizationProfile({
          subscription_plan: 'FREE', // Enforce FREE on backend for now
          onboarding_completed: true
        });

        // Update local state
        updateUserLocally({
          org_subscription_plan: 'FREE',
          org_onboarding_completed: true
        });
      }

      toast.success("Welcome to KAIO!");
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.message || "Failed to complete onboarding");
    } finally {
      setIsSubmitting(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden">
      
      {/* Background gradients for modern look */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand-primary/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none" />

      <div className="max-w-6xl w-full z-10 flex flex-col items-center">
        
        <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="w-16 h-16 mx-auto bg-brand-surface-low rounded-2xl flex items-center justify-center border border-brand-outline-variant shadow-lg mb-6">
            <Rocket className="w-8 h-8 text-brand-primary" />
          </div>
          <h1 className="text-4xl font-bold text-brand-text tracking-tight mb-4">
            Choose your plan
          </h1>
          <p className="text-brand-text-muted max-w-xl mx-auto text-lg">
            Start for free and upgrade as your team grows. No credit card required for the free plan.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 w-full max-w-5xl mb-12">
          {plans.map((plan, index) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isSelected={selectedPlan === plan.id}
              onSelect={() => handlePlanSelect(plan.id)}
              delayMs={index * 150}
            />
          ))}
        </div>

        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500">
          <button
            onClick={handleContinue}
            disabled={isSubmitting}
            className="w-full h-14 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-xl font-semibold text-lg shadow-lg shadow-brand-primary/25 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
          >
            {isSubmitting ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              'Continue to Dashboard'
            )}
          </button>
          <p className="text-center text-sm text-brand-text-muted mt-4">
            You can change your plan later in Settings.
          </p>
        </div>

      </div>
    </div>
  );
};

export default PlansPage;
