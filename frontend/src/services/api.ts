import axios, { AxiosInstance } from 'axios';

// Naudojame relative URL - automatiškai veiks su nginx proxy, nepriklausomai nuo to, ar HTTP ar HTTPS
// Jei reikia localhost development, galima nustatyti REACT_APP_API_URL=http://localhost:8000/api
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 sekundžių timeout
});

export const downloadFile = (url: string) =>
  api.get(url, {
    responseType: 'blob',
  });

// Request interceptor - prideda tokeną
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - tvarko 401 klaidas su refresh token logika
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          // Bandom atnaujinti access token'ą
          const response = await axios.post('/auth/token/refresh/', {
            refresh: refreshToken
          });

          const newToken = response.data.access;
          localStorage.setItem('token', newToken);

          // Pakartojam originalią užklausą su nauju token'u
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh nepavyko - nukreipiam į login
          localStorage.removeItem('token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
        }
      } else {
        // Nėra refresh token'o - nukreipiam į login
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// Partnerių API
export const partnersApi = {
  // Gauti partnerių sąrašą
  getPartners: (params?: { search?: string; page?: number; page_size?: number }) =>
    api.get('/partners/partners/', { params }),

  // Gauti konkretų partnerį
  getPartner: (id: number) => api.get(`/partners/partners/${id}/`),

  // Sukurti partnerį
  createPartner: (data: any) => api.post('/partners/partners/', data),

  // Atnaujinti partnerį
  updatePartner: (id: number, data: any) => api.put(`/partners/partners/${id}/`, data),

  // Ištrinti partnerį
  deletePartner: (id: number) => api.delete(`/partners/partners/${id}/`),
};

// Kontaktų API
export const contactsApi = {
  // Gauti kontaktų sąrašą
  getContacts: (params?: { search?: string; partner?: number; page?: number; page_size?: number }) =>
    api.get('/partners/contacts/', { params }),

  // Gauti konkretų kontaktą
  getContact: (id: number) => api.get(`/partners/contacts/${id}/`),

  // Sukurti kontaktą
  createContact: (data: any) => api.post('/partners/contacts/', data),

  // Atnaujinti kontaktą
  updateContact: (id: number, data: any) => api.put(`/partners/contacts/${id}/`, data),

  // Ištrinti kontaktą
  deleteContact: (id: number) => api.delete(`/partners/contacts/${id}/`),
};

