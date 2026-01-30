import { api } from './api';

export interface LoginResponse {
  access: string;
  refresh: string;
  user: {
    id: number;
    username: string;
    email: string;
    role: { id: number; name: string } | null;
  };
}

export const authService = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const response = await api.post('/auth/login/', { username, password });
    return response.data;
  },

  logout: async (refreshToken: string): Promise<void> => {
    await api.post('/auth/logout/', { refresh_token: refreshToken });
  },

  getCurrentUser: async () => {
    const response = await api.get('/auth/users/me/');
    return response.data;
  },

  changePassword: async (oldPassword: string, newPassword: string, newPasswordConfirm: string) => {
    const response = await api.post('/auth/users/change_password/', {
      old_password: oldPassword,
      new_password: newPassword,
      new_password_confirm: newPasswordConfirm,
    });
    return response.data;
  },
};

