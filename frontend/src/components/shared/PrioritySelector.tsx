import React, { useState, useEffect, useRef } from 'react';
import { Flag, ChevronDown, Check } from 'lucide-react';

interface PrioritySelectorProps {
  priority: string;
  onChange: (newPriority: string) => void;
  disabled?: boolean;
}

const PrioritySelector: React.FC<PrioritySelectorProps> = ({ priority, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const priorities = ["Low", "Medium", "High"];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (p: string) => {
    onChange(p);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center justify-between w-full px-3 py-2 text-sm bg-brand-surface border border-brand-border rounded-lg text-brand-text ${
          isOpen ? 'border-brand-primary ring-2 ring-brand-primary/20' : 'hover:border-brand-border-highlight'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Flag size={16} className="text-brand-text-muted shrink-0" />
          <span className="truncate text-sm font-medium text-brand-text">
            {priority || 'Select priority'}
          </span>
        </div>

        <ChevronDown size={14} className={`text-brand-text-muted shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 left-0 mt-1 w-full min-w-[200px] max-h-72 overflow-y-auto rounded-lg border border-brand-border bg-brand-surface text-brand-text shadow-2xl p-1.5 flex flex-col gap-1 opacity-100">
          {priorities.map((p) => {
            const isSelected = p === priority;
            return (
              <div
                key={p}
                onClick={() => handleSelect(p)}
                className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-xs ${
                  isSelected
                    ? 'bg-brand-primary/10 text-brand-text font-medium border border-brand-primary/30'
                    : 'hover:bg-brand-surface-highlight text-brand-text'
                }`}
              >
                <span className="truncate font-medium text-brand-text">{p}</span>
                {isSelected && <Check size={14} className="text-brand-primary shrink-0 ml-2" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PrioritySelector;
