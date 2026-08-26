import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  type AuthUser,
  getStoredUser,
  getStoredPermissions,
  logout as authLogout,
} from '@/lib/auth';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /**
   * Kunci izin milik pengguna — sumber kebenaran untuk menampilkan menu.
   *
   * ADR-004: gerbang otorisasi memakai IZIN, bukan literal peran. Lihat
   * penjelasan lengkapnya di `lib/auth.ts`.
   */
  izin: Set<string>;
  punyaIzin: (kunci: string) => boolean;
  setUser: (u: AuthUser | null) => void;
  setIzin: (i: Set<string>) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  izin: new Set(),
  punyaIzin: () => false,
  setUser: () => {},
  setIzin: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [izin, setIzin] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /*
      Pengguna DAN izinnya dibaca bersama, lalu `loading` baru dilepas.

      Melepas `loading` sesudah user saja akan merender tab bar dengan izin
      yang masih kosong — mandor melihat tab-nya BERKEDIP muncul sesaat
      setelah layar terbuka. Menunggu keduanya membuat bingkai pertama sudah
      benar.
    */
    let hidup = true;
    Promise.all([getStoredUser(), getStoredPermissions()])
      .then(([u, i]) => {
        if (!hidup) return;
        setUser(u);
        setIzin(i);
      })
      .finally(() => {
        if (hidup) setLoading(false);
      });
    return () => { hidup = false; };
  }, []);

  const logout = async () => {
    await authLogout();
    setUser(null);
    setIzin(new Set());
  };

  const punyaIzin = (kunci: string) => izin.has(kunci);

  return React.createElement(
    AuthContext.Provider,
    { value: { user, loading, izin, punyaIzin, setUser, setIzin, logout } },
    children
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
