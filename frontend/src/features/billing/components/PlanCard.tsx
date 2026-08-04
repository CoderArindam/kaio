import React from 'react';
import { Check } from 'lucide-react';

interface Plan {
  id: 'FREE' | 'PRO' | 'ENTERPRISE';
  name: string;
  price: string;
  period?: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  isPopular: boolean;
}

interface PlanCardProps {
  plan: Plan;
  isSelected: boolean;
  onSelect: () => void;
  delayMs: number;
}

export const PlanCard: React.FC<PlanCardProps> = ({ plan, isSelected, onSelect, delayMs }) => {
  return (
    <div
      onClick={onSelect}
      className={`relative rounded-2xl p-6 sm:p-8 cursor-pointer transition-all duration-300 transform animate-in fade-in slide-in-from-bottom-8 fill-mode-both border-2 bg-brand-surface ${
        isSelected
          ? 'border-brand-primary shadow-xl shadow-brand-primary/10 scale-[1.02]'
          : 'border-brand-outline-variant hover:border-brand-primary/50 hover:shadow-lg scale-100 hover:scale-[1.01]'
      }`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {plan.isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-brand-primary text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm">
          Most Popular
        </div>
      )}

      {isSelected && (
        <div className="absolute top-4 right-4 bg-brand-primary text-white p-1 rounded-full animate-in zoom-in duration-300">
          <Check className="w-4 h-4 stroke-[3]" />
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-brand-surface-high border border-brand-outline-variant">
          {plan.icon}
        </div>
        <h3 className="text-xl font-bold text-brand-text">{plan.name}</h3>
      </div>

      <div className="mb-4">
        <span className="text-4xl font-extrabold text-brand-text tracking-tight">
          {plan.price}
        </span>
        {plan.period && (
          <span className="text-brand-text-muted font-medium ml-1">
            {plan.period}
          </span>
        )}
      </div>

      <p className="text-brand-text-muted text-sm mb-8 h-10 line-clamp-2">
        {plan.description}
      </p>

      <ul className="space-y-4 mb-8 flex-1">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-brand-text">
            <Check className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" />
            <span className="leading-snug">{feature}</span>
          </li>
        ))}
      </ul>

      <div
        className={`w-full py-2.5 px-4 rounded-xl font-semibold text-center text-sm transition-colors duration-200 ${
          isSelected
            ? 'bg-brand-primary text-white'
            : 'bg-brand-surface-high text-brand-text hover:bg-brand-primary/10 hover:text-brand-primary'
        }`}
      >
        {isSelected ? 'Selected' : 'Select Plan'}
      </div>
    </div>
  );
};
