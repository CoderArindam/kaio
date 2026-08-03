import api from '../lib/axios';

export const registerOrganization = async (org_name: string, email: string, password: string, first_name: string, last_name: string) => {
  const response = await api.post('/auth/register', { org_name, email, password, first_name, last_name });
  return response.data;
};

export const verifyRegistrationOtp = async (registration_token: string, otp_code: string) => {
  const response = await api.post('/auth/register/verify-otp', { registration_token, otp_code });
  return response.data;
};

export const loginUser = async (email: string, password: string) => {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
};

export const verifyLoginOtp = async (mfa_token: string, otp_code: string) => {
  const response = await api.post('/auth/login/verify-otp', { mfa_token, otp_code });
  return response.data;
};

export const resendOtp = async (mfa_token: string) => {
  const response = await api.post('/auth/otp/resend', { mfa_token });
  return response.data;
};

export const requestEnable2FA = async (password?: string) => {
  const response = await api.post('/auth/2fa/enable', { password });
  return response.data;
};

export const confirmEnable2FA = async (mfa_token: string, otp_code: string) => {
  const response = await api.post('/auth/2fa/confirm-enable', { mfa_token, otp_code });
  return response.data;
};

export const disable2FA = async (password: string) => {
  const response = await api.post('/auth/2fa/disable', { password });
  return response.data;
};

export const logoutUser = async () => {
  const response = await api.post('/auth/logout');
  return response.data;
};

export const getMe = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

export const getSessions = async () => {
  const response = await api.get('/auth/sessions');
  return response.data;
};

export const signOutOtherSessions = async () => {
  const response = await api.delete('/auth/sessions/other');
  return response.data;
};

export const getSecurityEvents = async () => {
  const response = await api.get('/auth/security-events');
  return response.data;
};

export const getPasswordPolicy = async () => {
  const response = await api.get('/auth/password-policy');
  return response.data;
};

export const forgotPassword = async (email: string) => {
  await api.post('/auth/forgot-password', { email });
};

export const resetPassword = async (token: string, newPassword: string) => {
  await api.post('/auth/reset-password', { token, new_password: newPassword });
};

export const sendVerificationEmail = async () => {
  await api.post('/auth/send-verification-email');
};

export const verifyEmail = async (token: string) => {
  await api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`);
};
