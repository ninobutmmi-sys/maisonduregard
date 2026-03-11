import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('mdr_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', {
      email,
      password,
      type: 'practitioner',
    });
    const userData = data.user || data.practitioner || data;
    if (data.accessToken) {
      localStorage.setItem('mdr_access_token', data.accessToken);
    }
    localStorage.setItem('mdr_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore errors on logout
    }
    localStorage.removeItem('mdr_access_token');
    localStorage.removeItem('mdr_user');
    setUser(null);
  }, []);

  // Check if token exists on mount
  useEffect(() => {
    const token = localStorage.getItem('mdr_access_token');
    if (!token && user) {
      setUser(null);
      localStorage.removeItem('mdr_user');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
