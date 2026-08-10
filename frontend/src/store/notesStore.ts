import { create } from 'zustand';
import toast from 'react-hot-toast';
import * as notesApi from '../services/notesApi';

export type ContentType = 'richtext' | 'drawing' | 'image';

export interface Note {
  id: number;
  user_id: number;
  organization_id: number;
  title: string | null;
  content_type: ContentType;
  rich_content: object | null;
  canvas_data: string | null;
  image_url: string | null;
  annotations: object[] | null;
  is_pinned: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

interface NotesState {
  isOpen: boolean;
  notes: Note[];
  activeNoteId: number | null;
  isSaving: boolean;
  isFetched: boolean;
  isLoading: boolean;
  searchQuery: string;
  filteredNotes: Note[];

  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  openNote: (id: number | null) => void;
  fetchNotes: () => Promise<void>;
  createNote: (type: ContentType) => Promise<void>;
  updateNote: (id: number, patch: Partial<notesApi.NoteUpdatePayload>, expectedVersion: number) => Promise<void>;
  deleteNote: (id: number) => Promise<void>;
  togglePin: (id: number) => Promise<void>;
  setSearchQuery: (q: string) => void;
  getActiveNote: () => Note | null;
}

let _saveTimers: Record<number, ReturnType<typeof setTimeout>> = {};
let _pendingPatches: Record<number, Partial<notesApi.NoteUpdatePayload>> = {};

export const useNotesStore = create<NotesState>((set, get) => ({
  isOpen: false,
  notes: [],
  activeNoteId: null,
  isSaving: false,
  isFetched: false,
  isLoading: false,
  searchQuery: '',
  filteredNotes: [],

  toggleOpen: () => {
    const willOpen = !get().isOpen;
    set({ isOpen: willOpen });
    if (willOpen && !get().isFetched) {
      get().fetchNotes();
    }
  },

  setOpen: (open) => {
    set({ isOpen: open });
    if (open && !get().isFetched) {
      get().fetchNotes();
    }
  },

  openNote: (id) => set({ activeNoteId: id }),

  fetchNotes: async () => {
    set({ isLoading: true });
    try {
      const notes = await notesApi.fetchNotes();
      set({ notes, filteredNotes: notes, isFetched: true });
    } catch {
      toast.error('Failed to load notes');
    } finally {
      set({ isLoading: false });
    }
  },

  createNote: async (type: ContentType) => {
    try {
      const note = await notesApi.createNote({ content_type: type, title: '' });
      set((state) => ({
        notes: [note, ...state.notes],
        filteredNotes: [note, ...state.filteredNotes],
        activeNoteId: note.id,
      }));
    } catch {
      toast.error('Failed to create note');
    }
  },

  updateNote: async (id, patch, expectedVersion) => {
    // Accumulate pending patches so field updates aren't lost across debounced calls
    _pendingPatches[id] = { ...(_pendingPatches[id] || {}), ...patch };

    // Debounce per note (800ms)
    if (_saveTimers[id]) clearTimeout(_saveTimers[id]);

    // Optimistic local update
    set((state) => {
      const updateInList = (list: Note[]) =>
        list.map((n) => (n.id === id ? { ...n, ...patch } : n));
      return { notes: updateInList(state.notes), filteredNotes: updateInList(state.filteredNotes) };
    });

    _saveTimers[id] = setTimeout(async () => {
      const accumulatedPatch = _pendingPatches[id] || patch;
      delete _pendingPatches[id];
      delete _saveTimers[id];

      const currentNote = get().notes.find((n) => n.id === id);
      const versionToUse = currentNote?.version ?? expectedVersion;

      set({ isSaving: true });
      try {
        const updated = await notesApi.updateNote(id, {
          ...accumulatedPatch,
          expected_version: versionToUse,
        } as notesApi.NoteUpdatePayload);

        // Update version after successful save
        set((state) => {
          const updateInList = (list: Note[]) =>
            list.map((n) => (n.id === id ? { ...n, version: updated.version, updated_at: updated.updated_at } : n));
          return { notes: updateInList(state.notes), filteredNotes: updateInList(state.filteredNotes) };
        });
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 409) {
          toast.error('Note was modified in another tab — refreshing...', { duration: 4000 });
          // Refetch to get current server state
          get().fetchNotes();
        } else {
          toast.error('Failed to save note.');
        }
      } finally {
        set({ isSaving: false });
      }
    }, 800);
  },

  deleteNote: async (id) => {
    // Optimistic remove
    const prevNotes = get().notes;
    const prevFiltered = get().filteredNotes;
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
      filteredNotes: state.filteredNotes.filter((n) => n.id !== id),
      activeNoteId: state.activeNoteId === id ? null : state.activeNoteId,
    }));

    try {
      await notesApi.deleteNote(id);
    } catch {
      // Rollback
      set({ notes: prevNotes, filteredNotes: prevFiltered });
      toast.error('Failed to delete note');
    }
  },

  togglePin: async (id) => {
    // Debounce
    if (_saveTimers[`pin_${id}` as unknown as number]) {
      clearTimeout(_saveTimers[`pin_${id}` as unknown as number]);
    }
    // Optimistic toggle
    set((state) => {
      const toggle = (list: Note[]) =>
        list.map((n) => (n.id === id ? { ...n, is_pinned: !n.is_pinned } : n));
      return { notes: toggle(state.notes), filteredNotes: toggle(state.filteredNotes) };
    });

    try {
      const result = await notesApi.togglePin(id);
      // Sync server version
      set((state) => {
        const sync = (list: Note[]) =>
          list.map((n) =>
            n.id === id ? { ...n, is_pinned: result.is_pinned, version: result.version } : n
          );
        return { notes: sync(state.notes), filteredNotes: sync(state.filteredNotes) };
      });
    } catch {
      // Rollback optimistic change
      set((state) => {
        const toggle = (list: Note[]) =>
          list.map((n) => (n.id === id ? { ...n, is_pinned: !n.is_pinned } : n));
        return { notes: toggle(state.notes), filteredNotes: toggle(state.filteredNotes) };
      });
      toast.error('Failed to toggle pin');
    }
  },

  setSearchQuery: (q) => {
    set({ searchQuery: q });
    if (!q.trim()) {
      set((state) => ({ filteredNotes: state.notes }));
      return;
    }
    const lower = q.toLowerCase();
    set((state) => ({
      filteredNotes: state.notes.filter(
        (n) =>
          (n.title || '').toLowerCase().includes(lower) ||
          (n.rich_content ? JSON.stringify(n.rich_content).toLowerCase().includes(lower) : false)
      ),
    }));
  },

  getActiveNote: () => {
    const { notes, activeNoteId } = get();
    return notes.find((n) => n.id === activeNoteId) ?? null;
  },
}));
