import React from 'react';
import { StickyNote } from 'lucide-react';
import { useNotesStore } from '../../../store/notesStore';

export const NotesButton: React.FC = () => {
  const { toggleOpen, isOpen } = useNotesStore();

  return (
    <button
      id="quick-notes-button"
      onClick={toggleOpen}
      title="Quick Notes (Ctrl+Shift+N)"
      className={`relative p-2 rounded-lg transition-all duration-200 
        ${isOpen
          ? 'bg-amber-500/15 text-amber-500'
          : 'text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low'
        }`}
    >
      <StickyNote className="w-5 h-5" />
    </button>
  );
};
