import React, { createContext, useContext, useEffect, useState } from 'react';
import { type AuthUser, getStoredUser, logout as authLogout } from '@/lib/auth';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  setUser: (u: AuthUser | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  setUser: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStoredUser().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const logout = async () => {
    await authLogout();
    setUser(null);
  };

  return React.createElement(
    AuthContext.Provider,
    { value: { user, loading, setUser, logout } },
    children
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
