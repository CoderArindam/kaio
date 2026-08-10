import React, { useCallback } from 'react';
import { ArrowLeft, Pin, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { useNotesStore } from '../../../store/notesStore';
import type { Note } from '../../../store/notesStore';

import { RichTextEditor } from './RichTextEditor';
import { DrawingCanvas } from './DrawingCanvas';
import { ImageAnnotator } from './ImageAnnotator';
import type { Annotation } from './ImageAnnotator';


interface NoteEditorProps {
  note: Note;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ note }) => {
  const { updateNote, deleteNote, togglePin, isSaving, openNote } = useNotesStore();

  const handleUpdate = useCallback((patch: Partial<Note>) => {
    updateNote(note.id, patch as Parameters<typeof updateNote>[1], note.version);
  }, [note.id, note.version, updateNote]);

  const handleRichTextChange = useCallback((json: object) => {
    handleUpdate({ rich_content: json });
  }, [handleUpdate]);

  const handleCanvasChange = useCallback((dataUrl: string) => {
    handleUpdate({ canvas_data: dataUrl });
  }, [handleUpdate]);

  const handleImageChange = useCallback((url: string) => {
    handleUpdate({ image_url: url || null });
  }, [handleUpdate]);

  const handleAnnotationsChange = useCallback((annotations: Annotation[]) => {
    handleUpdate({ annotations });
  }, [handleUpdate]);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleUpdate({ title: e.target.value });
  }, [handleUpdate]);

  const handleDelete = async () => {
    if (!confirm('Delete this note permanently?')) return;
    await deleteNote(note.id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Editor Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-brand-border/50 bg-brand-surface/30 shrink-0">
        <button
          onClick={() => openNote(null)}
          className="p-1 rounded-lg text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-low transition-all shrink-0"
          title="Back to notes"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <input
          type="text"
          value={note.title || ''}
          onChange={handleTitleChange}
          placeholder="Note title..."
          className="flex-1 bg-transparent text-[14px] font-semibold text-brand-text placeholder:text-brand-text-muted/40 focus:outline-none truncate"
        />

        <div className="flex items-center gap-1 shrink-0">
          {/* Save indicator */}
          <span className="text-[10px] text-brand-text-muted/50 w-14 text-right">
            {isSaving ? (
              <span className="flex items-center gap-1 justify-end">
                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Saving
              </span>
            ) : (
              <span className="flex items-center gap-1 justify-end text-emerald-500/70">
                <CheckCircle2 className="w-2.5 h-2.5" /> Saved
              </span>
            )}
          </span>

          <button
            onClick={() => togglePin(note.id)}
            title={note.is_pinned ? 'Unpin' : 'Pin'}
            className={`p-1.5 rounded-lg transition-all ${note.is_pinned ? 'text-amber-500 bg-amber-500/10' : 'text-brand-text-muted hover:text-amber-500 hover:bg-amber-500/10'}`}
          >
            <Pin className={`w-3.5 h-3.5 ${note.is_pinned ? 'fill-amber-500' : ''}`} />
          </button>

          <button
            onClick={handleDelete}
            title="Delete note"
            className="p-1.5 rounded-lg text-brand-text-muted hover:text-red-500 hover:bg-red-500/10 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {note.content_type === 'richtext' && (
          <RichTextEditor
            content={note.rich_content}
            onChange={handleRichTextChange}
          />
        )}
        {note.content_type === 'drawing' && (
          <DrawingCanvas
            canvasData={note.canvas_data}
            onChange={handleCanvasChange}
          />
        )}
        {note.content_type === 'image' && (
          <ImageAnnotator
            noteId={note.id}
            imageUrl={note.image_url}
            annotations={(note.annotations as Annotation[]) || []}
            onImageChange={handleImageChange}
            onAnnotationsChange={handleAnnotationsChange}
          />
        )}
      </div>
    </div>
  );
};
