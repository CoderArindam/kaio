import api from '../lib/axios';

export interface OrganizationProfile {
  id: number;
  name: string;
  logo_url: string | null;
  website: string | null;
  description: string | null;
  industry: string | null;
  company_size: string | null;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
  members_count: number;
  projects_count: number;
  subscription_plan?: string;
  onboarding_completed?: boolean;
}

export interface OrganizationProfileUpdate {
  name?: string;
  logo_url?: string | null;
  website?: string | null;
  description?: string | null;
  industry?: string | null;
  company_size?: string | null;
  subscription_plan?: string;
  onboarding_completed?: boolean;
}

export const getOrganizationProfile = async (): Promise<OrganizationProfile> => {
  const response = await api.get('/organization/profile');
  return response.data;
};

export const uploadOrganizationLogo = async (file: File): Promise<{ logo_url: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/organization/logo', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const updateOrganizationProfile = async (updates: OrganizationProfileUpdate): Promise<OrganizationProfile> => {
  const response = await api.patch('/organization/profile', updates);
  return response.data;
};

export interface DeletionStatus {
  status: string;
  deletion_scheduled_purge_at: string | null;
}

export const deleteOrganization = async (password: string, organizationName: string, skipGracePeriod: boolean = false): Promise<any> => {
  const response = await api.post('/organization/delete', {
    password,
    organization_name: organizationName,
    skip_grace_period: skipGracePeriod,
  });
  return response.data;
};

export const cancelOrganizationDeletion = async (): Promise<any> => {
  const response = await api.post('/organization/delete/cancel');
  return response.data;
};

export const getOrganizationDeletionStatus = async (): Promise<DeletionStatus> => {
  const response = await api.get('/organization/delete/status');
  return response.data;
};
