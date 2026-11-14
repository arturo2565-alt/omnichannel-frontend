import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  clearAuthSession,
  getStoredTaller,
  getStoredUser,
  isAuthenticated,
} from './authStorage.js';
import { SessionQueryProvider } from './SessionQueryProvider.jsx';
import { sessionScope, sessionScopeKey } from './sessionQuery.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getStoredUser());
  const [taller, setTaller] = useState(() => getStoredTaller());

  const refreshFromStorage = useCallback(() => {
    setUser(getStoredUser());
    setTaller(getStoredTaller());
  }, []);

  const logout = useCallback(() => {
    clearAuthSession();
    setUser(null);
    setTaller(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({
      user,
      taller,
      isAuthenticated: isAuthenticated(),
      refreshFromStorage,
      logout,
    }),
    [user, taller, refreshFromStorage, logout],
  );

  return (
    <AuthContext.Provider value={value}>
      <SessionQueryProvider key={sessionScopeKey(sessionScope(user, taller))}>
        {children}
      </SessionQueryProvider>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return ctx;
}
