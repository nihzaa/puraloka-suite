"use client";

// ============================================================================
// Layout Portal Klien — dipindah ke PortalShell (Task 11), sama seperti
// mandor-portal/pm-portal. Hanya 3 nav item (di bawah ambang 4 PortalShell)
// — tidak butuh halaman "Lainnya"; modul tambahan (Punch List, Inspeksi,
// Submittal) masuk sebagai TAB di proyek/[id] (Task 12), bukan menu
// terpisah, sesuai spec §7.3 — struktur klien sengaja ramping.
// ============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, logout, type PuralokaUser } from "@/lib/api";
import PortalShell, { type NavItem } from "@/components/portal/PortalShell";
import { LayoutDashboard, Bell, User } from "lucide-react";

export default function PortalKlienLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<PuralokaUser | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.replace("/login"); return; }
    if (u.role !== "client") { router.replace("/dashboard"); return; }
    /*
      Hidrasi dari penyimpanan SINKRON — bukan cascading render.

      `getStoredUser()` membaca localStorage, yang tak ada saat render pertama.
      Nilainya karena itu tak bisa jadi nilai awal `useState`, dan satu setState
      sesudah mount adalah cara yang dimaksudkan React untuk hidrasi seperti ini.

      Aturan `set-state-in-effect` (baru di eslint-plugin-react-hooks v7, yang
      membuat angka ratchet melompat 39 → 48 tanpa satu baris kode buruk pun
      ditulis) menandai SEMUA setState sinkron dalam effect. Yang ia cegah —
      render berjenjang — tak terjadi di sini: dependensinya kosong, jadi effect
      ini berjalan tepat sekali.

      Menulisnya ulang dengan `useSyncExternalStore` benar secara teori dan
      mengubah perilaku ALUR MASUK pada sistem yang baru dipakai orang. Yang
      dikerjakan di sini menandai, bukan menulis ulang otentikasi.
    */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(u);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const navItems: NavItem[] = [
    { href: "/portal", label: "Beranda", icon: LayoutDashboard, exact: true },
    { href: "/portal/notifikasi", label: "Notifikasi", icon: Bell },
    { href: "/portal/profil", label: "Profil", icon: User },
  ];

  return (
    <PortalShell user={user} portalLabel="Portal Klien" navItems={navItems} onLogout={handleLogout}>
      {children}
    </PortalShell>
  );
}
