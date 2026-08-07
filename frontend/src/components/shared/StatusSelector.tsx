import React, { useState, useEffect, useRef } from 'react';
import { Columns, ChevronDown, Check } from 'lucide-react';
import { type Column } from '../../services/tasksApi';

interface StatusSelectorProps {
  columnId: number | undefined;
  columns: Column[];
  onChange: (newColumnId: number) => void;
  disabled?: boolean;
}

const StatusSelector: React.FC<StatusSelectorProps> = ({ columnId, columns, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedColumn = columns.find((c) => c.id === columnId);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (id: number) => {
    onChange(id);
    setIsOpen(false);
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '148, 163, 184'; // Default to slate-400
  };

  const getCustomColorStyles = (hexColor?: string, isOption = false, isSelected = false) => {
    if (!hexColor) return {};
    
    const rgb = hexToRgb(hexColor);
    
    if (isOption) {
      if (isSelected) {
        return {
          backgroundColor: `rgba(${rgb}, 0.1)`,
          color: hexColor,
          borderColor: `rgba(${rgb}, 0.3)`,
        };
      }
      return {}; // Hover handled by Tailwind
    }

    // Trigger button styles
    return {
      backgroundColor: `rgba(${rgb}, 0.1)`,
      color: hexColor,
      borderColor: `rgba(${rgb}, 0.3)`,
    };
  };

  const getFallbackTypeStyles = (type?: string, isOption = false, isSelected = false) => {
    if (isOption) {
      if (isSelected) {
        switch (type) {
          case 'DONE': return 'bg-emerald-500/10 text-emerald-600 font-medium border border-emerald-500/30';
          case 'IN_PROGRESS': return 'bg-blue-500/10 text-blue-600 font-medium border border-blue-500/30';
          case 'TODO': return 'bg-slate-500/10 text-slate-700 font-medium border border-slate-500/30 dark:text-slate-300';
          default: return 'bg-brand-primary/10 text-brand-text font-medium border border-brand-primary/30';
        }
      }
      return 'hover:bg-brand-surface-highlight text-brand-text';
    }

    switch (type) {
      case 'DONE': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20';
      case 'IN_PROGRESS': return 'bg-blue-500/10 text-blue-600 border-blue-500/30 hover:bg-blue-500/20';
      case 'TODO': return 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700';
      default: return 'bg-brand-surface border-brand-border text-brand-text hover:border-brand-border-highlight';
    }
  };

  const getIconColor = (hexColor?: string, type?: string) => {
    if (hexColor) return '';
    switch (type) {
      case 'DONE': return 'text-emerald-500';
      case 'IN_PROGRESS': return 'text-blue-500';
      case 'TODO': return 'text-slate-500 dark:text-slate-400';
      default: return 'text-brand-text-muted';
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center justify-between w-full px-3 py-2 text-sm border rounded-lg ${
          isOpen ? 'ring-2 ring-brand-primary/20' : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${!selectedColumn?.color ? getFallbackTypeStyles(selectedColumn?.column_type) : ''}`}
        style={getCustomColorStyles(selectedColumn?.color)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Columns size={16} className={`${!selectedColumn?.color ? getIconColor(selectedColumn?.color, selectedColumn?.column_type) : ''} shrink-0`} style={selectedColumn?.color ? { color: selectedColumn.color } : {}} />
          <span className="truncate text-sm font-medium">
            {selectedColumn ? selectedColumn.name : 'Select status'}
          </span>
        </div>

        <ChevronDown size={14} className={`${!selectedColumn?.color ? getIconColor(selectedColumn?.color, selectedColumn?.column_type) : ''} shrink-0 ${isOpen ? 'rotate-180' : ''}`} style={selectedColumn?.color ? { color: selectedColumn.color } : {}} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 left-0 mt-1 w-full min-w-[200px] max-h-72 overflow-y-auto rounded-lg border border-brand-border bg-brand-surface text-brand-text shadow-2xl p-1.5 flex flex-col gap-1 opacity-100">
          {columns.map((c) => {
            const isSelected = c.id === columnId;
            return (
              <div
                key={c.id}
                onClick={() => handleSelect(c.id)}
                className={`flex items-center justify-between p-2 rounded-md cursor-pointer text-xs ${!c.color ? getFallbackTypeStyles(c.column_type, true, isSelected) : (isSelected ? 'border font-medium' : 'hover:bg-brand-surface-highlight text-brand-text')}`}
                style={getCustomColorStyles(c.color, true, isSelected)}
              >
                <div className="flex items-center gap-2 truncate">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${!c.color && c.column_type === 'DONE' ? 'bg-emerald-500' : !c.color && c.column_type === 'IN_PROGRESS' ? 'bg-blue-500' : !c.color ? 'bg-slate-400' : ''}`} style={c.color ? { backgroundColor: c.color } : {}} />
                  <span className="truncate">{c.name}</span>
                </div>
                {isSelected && <Check size={14} className={!c.color ? getIconColor(c.color, c.column_type) : ''} style={c.color ? { color: c.color } : {}} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StatusSelector;
