import { create } from 'zustand';
import { getProjectSettings, updateProjectSettings, archiveProject, type ProjectSettingsUpdate, type ProjectSettingsResponse } from '../services/projectSettingsApi';
import { useBoardStore } from './boardStore';
import toast from 'react-hot-toast';

export type ViewMode = 'board' | 'list' | 'calendar';

interface ProjectSettingsState {
  currentSettings: ProjectSettingsResponse | null;
  isLoading: boolean;
  isSaving: boolean;
  isArchiving: boolean;
  viewModes: Record<number, ViewMode>;
  getViewMode: (boardId: number) => ViewMode;
  setViewMode: (boardId: number, mode: ViewMode) => void;
  fetchSettings: (boardId: number) => Promise<void>;
  updateSettings: (boardId: number, updates: ProjectSettingsUpdate) => Promise<void>;
  archiveProject: (boardId: number) => Promise<void>;
}

export const useProjectSettingsStore = create<ProjectSettingsState>((set, get) => ({
  currentSettings: null,
  isLoading: false,
  isSaving: false,
  isArchiving: false,
  viewModes: {},

  getViewMode: (boardId: number) => {
    const current = get().viewModes[boardId];
    if (current) return current;
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(`kanban_view_mode_${boardId}`);
      if (saved === 'list' || saved === 'calendar' || saved === 'board') {
        return saved;
      }
    }
    return 'board';
  },

  setViewMode: (boardId: number, mode: ViewMode) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`kanban_view_mode_${boardId}`, mode);
    }
    set((state) => ({
      viewModes: { ...state.viewModes, [boardId]: mode },
    }));
  },

  fetchSettings: async (boardId: number) => {
    set({ isLoading: true });
    try {
      const data = await getProjectSettings(boardId);
      set({ currentSettings: data });
    } catch (error: any) {
      console.error('Failed to fetch project settings:', error);
      toast.error('Failed to load project settings');
    } finally {
      set({ isLoading: false });
    }
  },

  updateSettings: async (boardId: number, updates: ProjectSettingsUpdate) => {
    set({ isSaving: true });
    try {
      // Optimistic update to global board store so UI changes instantly
      const globalBoards = useBoardStore.getState().boards;
      const boardIndex = globalBoards.findIndex(b => b.id === boardId);
      if (boardIndex !== -1) {
        const updatedBoard = { ...globalBoards[boardIndex], ...updates };
        const newBoards = [...globalBoards];
        newBoards[boardIndex] = updatedBoard;
        useBoardStore.setState({ boards: newBoards });
      }

      const data = await updateProjectSettings(boardId, updates);
      set({ currentSettings: data });
      
      // Update global store with canonical response
      const updatedGlobalBoards = useBoardStore.getState().boards;
      const updatedBoardIndex = updatedGlobalBoards.findIndex(b => b.id === boardId);
      if (updatedBoardIndex !== -1) {
         const newBoards = [...updatedGlobalBoards];
         newBoards[updatedBoardIndex] = data.settings;
         useBoardStore.setState({ boards: newBoards });
      }
      toast.success('Project settings saved');
    } catch (error: any) {
      console.error('Failed to update project settings:', error);
      toast.error(error.message || 'Failed to update settings');
    } finally {
      set({ isSaving: false });
    }
  },

  archiveProject: async (boardId: number) => {
    set({ isArchiving: true });
    try {
      const data = await archiveProject(boardId);
      
      // Update from global board store so it moves to Archived section
      const globalBoards = useBoardStore.getState().boards;
      const boardIndex = globalBoards.findIndex(b => b.id === boardId);
      if (boardIndex !== -1) {
         const newBoards = [...globalBoards];
         newBoards[boardIndex] = data.settings;
         useBoardStore.setState({ boards: newBoards });
      }
      
      // Clear project-specific state
      set({ currentSettings: null });
      
      toast.success('Project archived successfully.');
    } catch (error: any) {
      console.error('Failed to archive project:', error);
      toast.error(error.message || 'Failed to archive project');
    } finally {
      set({ isArchiving: false });
    }
  }
}));
