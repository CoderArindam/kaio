import { create } from 'zustand';
import { loginUser, verifyLoginOtp, logoutUser, getMe } from '../services/authApi';
import toast from 'react-hot-toast';
import { useOrganizationStore } from './organizationStore';
import { usePreferencesStore } from './preferencesStore';

export interface User {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  role: string;
  organization_id: number;
  is_email_verified: boolean;
  is_2fa_enabled?: boolean;
  two_factor_type?: string;
  org_subscription_plan?: string;
  org_onboarding_completed?: boolean;
}

interface AuthState {
  isAuthenticated: boolean;
  isInitializing: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<{ otp_required?: boolean; mfa_token?: string; email?: string }>;
  completeOtpLogin: (mfa_token: string, otp_code: string) => Promise<void>;
  logout: (forced?: boolean) => Promise<void>;
  initAuth: () => Promise<void>;
  updateUserLocally: (data: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isInitializing: true,
  user: null,

  updateUserLocally: (data) => set((state) => ({
    user: state.user ? { ...state.user, ...data } : null
  })),

  initAuth: async () => {
    try {
      const userData = await getMe();
      set({ 
        isAuthenticated: true, 
        user: {
          id: userData.id,
          email: userData.email,
          first_name: userData.first_name,
          last_name: userData.last_name,
          avatar_url: userData.avatar_url,
          role: userData.role || 'MEMBER',
          organization_id: userData.organization_id,
          is_email_verified: userData.is_email_verified ?? true,
          is_2fa_enabled: userData.is_2fa_enabled ?? false,
          two_factor_type: userData.two_factor_type || 'email',
          org_subscription_plan: userData.org_subscription_plan,
          org_onboarding_completed: userData.org_onboarding_completed
        },
        isInitializing: false 
      });
    } catch (error) {
      set({ isAuthenticated: false, user: null, isInitializing: false });
    }
  },

  login: async (email, password) => {
    try {
      const res = await loginUser(email, password);
      if (res.otp_required) {
        return {
          otp_required: true,
          mfa_token: res.mfa_token,
          email: res.email
        };
      }

      // Standard login success without 2FA
      const userData = await getMe();
      set({ 
        isAuthenticated: true,
        user: {
          id: userData.id,
          email: userData.email,
          first_name: userData.first_name,
          last_name: userData.last_name,
          avatar_url: userData.avatar_url,
          role: userData.role || 'MEMBER',
          organization_id: userData.organization_id,
          is_email_verified: userData.is_email_verified ?? true,
          is_2fa_enabled: userData.is_2fa_enabled ?? false,
          two_factor_type: userData.two_factor_type || 'email',
          org_subscription_plan: userData.org_subscription_plan,
          org_onboarding_completed: userData.org_onboarding_completed
        }
      });
      return { otp_required: false };
    } catch (error) {
      console.error('Login failed', error);
      throw error;
    }
  },

  completeOtpLogin: async (mfa_token: string, otp_code: string) => {
    try {
      await verifyLoginOtp(mfa_token, otp_code);
      const userData = await getMe();
      set({
        isAuthenticated: true,
        user: {
          id: userData.id,
          email: userData.email,
          first_name: userData.first_name,
          last_name: userData.last_name,
          avatar_url: userData.avatar_url,
          role: userData.role || 'MEMBER',
          organization_id: userData.organization_id,
          is_email_verified: userData.is_email_verified ?? true,
          is_2fa_enabled: userData.is_2fa_enabled ?? false,
          two_factor_type: userData.two_factor_type || 'email',
          org_subscription_plan: userData.org_subscription_plan,
          org_onboarding_completed: userData.org_onboarding_completed
        }
      });
    } catch (error) {
      console.error('OTP login failed', error);
      throw error;
    }
  },

  logout: async (forced?: boolean) => {
    try {
      if (!forced) {
        await logoutUser();
      }
    } catch (error) {
      console.error('Logout API failed, clearing local state anyway', error);
    } finally {
      set({ isAuthenticated: false, user: null });
      useOrganizationStore.setState({ profile: null, deletionStatus: null, isLoading: false, error: null });
      usePreferencesStore.setState({ preferences: null, isLoading: false, error: null });
      if (!forced) {
        toast.success('Logged out successfully');
      } else {
        toast.error('Session expired. Please log in again.');
      }
    }
  }
}));
