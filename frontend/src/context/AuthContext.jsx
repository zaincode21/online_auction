import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('gp_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      api
        .get('/auth/me')
        .then((res) => setUser(res.data))
        .catch(() => {
          localStorage.removeItem('gp_token');
          setToken(null);
          delete api.defaults.headers.common['Authorization'];
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  function login(newToken, userData) {
    localStorage.setItem('gp_token', newToken);
    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem('gp_token');
    delete api.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  }

  async function refreshUser() {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
    } catch {
      // token may have expired — do nothing
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
