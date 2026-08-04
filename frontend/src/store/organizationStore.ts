import { create } from 'zustand';
import { getOrganizationProfile, updateOrganizationProfile, getOrganizationDeletionStatus, type OrganizationProfile, type OrganizationProfileUpdate, type DeletionStatus } from '../services/organizationApi';

interface OrganizationState {
  profile: OrganizationProfile | null;
  deletionStatus: DeletionStatus | null;
  isLoading: boolean;
  error: string | null;
  
  fetchProfile: () => Promise<void>;
  updateProfile: (updates: OrganizationProfileUpdate) => Promise<void>;
  fetchDeletionStatus: () => Promise<void>;
  setDeletionStatus: (status: DeletionStatus | null) => void;
}

// Document title logic has been moved to AppLayout and usePageTitle hook.

export const useOrganizationStore = create<OrganizationState>((set, get) => ({
  profile: null,
  deletionStatus: null,
  isLoading: false,
  error: null,

  setDeletionStatus: (status) => set({ deletionStatus: status }),

  fetchDeletionStatus: async () => {
    try {
      const status = await getOrganizationDeletionStatus();
      set({ deletionStatus: status });
    } catch (error) {
      console.error('Failed to fetch deletion status:', error);
    }
  },

  fetchProfile: async () => {
    set({ isLoading: true, error: null });
    try {
      const profile = await getOrganizationProfile();
      set({ profile, isLoading: false });
      // Fetch deletion status quietly
      get().fetchDeletionStatus();
    } catch (error: any) {
      set({ error: error.message || 'Failed to fetch organization profile', isLoading: false });
    }
  },

  updateProfile: async (updates: OrganizationProfileUpdate) => {
    const currentProfile = get().profile;
    
    // Optimistic update
    if (currentProfile) {
      const newProfile = { ...currentProfile, ...updates };
      set({ profile: newProfile });
    }

    try {
      const profile = await updateOrganizationProfile(updates);
      set({ profile });
    } catch (error: any) {
      // Revert optimistic update
      if (currentProfile) {
        set({ profile: currentProfile, error: error.message || 'Failed to update organization profile' });
      } else {
        set({ error: error.message || 'Failed to update organization profile' });
      }
      throw error;
    }
  },
}));
