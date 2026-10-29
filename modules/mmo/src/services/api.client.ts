import axios from 'axios';

export const apiClient = axios.create({ baseURL: '/api/admin', timeout: 35000, headers: { 'Content-Type': 'application/json' } });
apiClient.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401) window.parent.location.assign('/admin');
  return Promise.reject(error);
});
