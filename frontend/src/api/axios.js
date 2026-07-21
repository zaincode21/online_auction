import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach the latest token before every request (handles login/logout without stale header)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('gp_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  } else {
    delete config.headers['Authorization'];
  }
  return config;
});

export default api;
