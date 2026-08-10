import React from 'react';
import { X, StickyNote } from 'lucide-react';
import { useNotesStore } from '../../../store/notesStore';
import { NotesList } from './NotesList';
import { NoteEditor } from './NoteEditor';

export const QuickNotesSidebar: React.FC = () => {
  const { isOpen, setOpen, activeNoteId, getActiveNote } = useNotesStore();
  const activeNote = getActiveNote();

  return (
    <>
      {/* Backdrop — covers full viewport including main sidebar */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[200] animate-fade-in"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full md:w-[480px] bg-brand-surface shadow-2xl z-[201] flex flex-col border-l border-brand-border transform transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border bg-brand-surface shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
              <StickyNote className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-brand-text tracking-tight">Quick Notes</h2>
              {activeNoteId === null && (
                <p className="text-[10px] text-brand-text-muted/60 -mt-0.5">Personal • Private to you</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content: list or editor */}
        <div className="flex-1 overflow-hidden">
          {activeNote ? (
            <NoteEditor note={activeNote} />
          ) : (
            <NotesList />
          )}
        </div>
      </div>
    </>
  );
};
