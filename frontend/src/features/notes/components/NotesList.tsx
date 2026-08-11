import React from 'react';
import { Search, FileText, Pencil, ImageIcon, Loader2 } from 'lucide-react';
import { useNotesStore } from '../../../store/notesStore';
import type { ContentType } from '../../../store/notesStore';

import { NoteCard } from './NoteCard';

export const NotesList: React.FC = () => {
  const {
    filteredNotes,
    activeNoteId,
    isLoading,
    searchQuery,
    createNote,
    openNote,
    setSearchQuery,
    togglePin,
    deleteNote,
  } = useNotesStore();

  const newNoteOptions: { type: ContentType; label: string; icon: React.ReactNode; color: string }[] = [
    { type: 'richtext', label: 'Text', icon: <FileText className="w-4 h-4" />, color: 'text-brand-primary hover:bg-brand-primary/10' },
    { type: 'drawing', label: 'Draw', icon: <Pencil className="w-4 h-4" />, color: 'text-emerald-500 hover:bg-emerald-500/10' },
    { type: 'image', label: 'Image', icon: <ImageIcon className="w-4 h-4" />, color: 'text-violet-500 hover:bg-violet-500/10' },
  ];

  const sortedNotes = React.useMemo(() => {
    return [...filteredNotes].sort((a, b) => {
      // Pinned notes first
      if (a.is_pinned !== b.is_pinned) {
        return a.is_pinned ? -1 : 1;
      }
      // Then by updated_at descending
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [filteredNotes]);

  return (
    <div className="flex flex-col h-full">
      {/* New Note Buttons */}
      <div className="px-3 pt-3 pb-2 flex gap-2">
        {newNoteOptions.map(({ type, label, icon, color }) => (
          <button
            key={type}
            onClick={() => createNote(type)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium border border-brand-border/50 transition-all duration-150 ${color}`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-text-muted/60 pointer-events-none" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-brand-surface-low border border-brand-border/60 rounded-lg text-brand-text placeholder:text-brand-text-muted/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-brand-text-muted animate-spin" />
          </div>
        ) : sortedNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <FileText className="w-6 h-6 text-amber-500" />
            </div>
            <p className="text-[13px] text-brand-text-muted">
              {searchQuery ? 'No notes match your search' : 'No notes yet. Create one above!'}
            </p>
          </div>
        ) : (
          sortedNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              isActive={note.id === activeNoteId}
              onClick={() => openNote(note.id)}
              onTogglePin={(e) => {
                e.stopPropagation();
                togglePin(note.id);
              }}
              onDelete={(e) => {
                e.stopPropagation();
                deleteNote(note.id);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
};
