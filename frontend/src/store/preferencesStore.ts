import { create } from 'zustand';
import { useUiStore } from './uiStore';
import { getPreferences, updatePreferences } from '../services/preferencesApi';
import type { UserPreferences, UserPreferencesUpdate, ThemeType } from '../services/preferencesApi';

interface PreferencesState {
  preferences: UserPreferences | null;
  isLoading: boolean;
  error: string | null;
  
  fetchPreferences: () => Promise<void>;
  updatePreferences: (updates: UserPreferencesUpdate) => Promise<void>;
}

export const applyThemeToDocument = (theme: ThemeType) => {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  
  // Cache optimistically for next load
  localStorage.setItem('kanban-theme-cache', theme);
};

export const applyAccentColorToDocument = (color: string) => {
  document.documentElement.setAttribute('data-accent', color);
  localStorage.setItem('kanban-accent-cache', color);
};

export const applySidebarThemeToDocument = (theme: string) => {
  document.documentElement.setAttribute('data-sidebar', theme);
  localStorage.setItem('kanban-sidebar-cache', theme);
};

export const applyAllPreferences = (prefs: UserPreferences) => {
  applyThemeToDocument(prefs.theme);
  applyAccentColorToDocument(prefs.accent_color);
  applySidebarThemeToDocument(prefs.sidebar_theme);
  if (prefs.sidebar_collapsed !== undefined) {
    useUiStore.getState().setSidebarCollapsed(prefs.sidebar_collapsed);
  }
};

// Hydrate cached preferences on store import
if (typeof window !== 'undefined') {
  const cachedTheme = localStorage.getItem('kanban-theme-cache');
  if (cachedTheme) applyThemeToDocument(cachedTheme as ThemeType);

  const cachedAccent = localStorage.getItem('kanban-accent-cache');
  if (cachedAccent) applyAccentColorToDocument(cachedAccent);

  const cachedSidebar = localStorage.getItem('kanban-sidebar-cache');
  if (cachedSidebar) applySidebarThemeToDocument(cachedSidebar);
}


export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: null,
  isLoading: false,
  error: null,

  fetchPreferences: async () => {
    set({ isLoading: true, error: null });
    try {
      const preferences = await getPreferences();
      set({ preferences, isLoading: false });
      
      applyAllPreferences(preferences);
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch preferences', isLoading: false });
    }
  },

  updatePreferences: async (updates: UserPreferencesUpdate) => {
    const currentPrefs = get().preferences;
    
    // Optimistic update
    if (currentPrefs) {
      const newPrefs = { ...currentPrefs, ...updates };
      set({ preferences: newPrefs });
      applyAllPreferences(newPrefs);
    }

    try {
      const preferences = await updatePreferences(updates);
      set({ preferences });
      applyAllPreferences(preferences);
    } catch (error: any) {
      // Revert optimistic update on failure
      if (currentPrefs) {
        set({ preferences: currentPrefs, error: error.message || 'Failed to update preferences' });
        applyAllPreferences(currentPrefs);
      } else {
        set({ error: error.message || 'Failed to update preferences' });
      }
    }
  },
}));

// Listen to system theme changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const theme = usePreferencesStore.getState().preferences?.theme;
    if (theme === 'system') {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  });
}
