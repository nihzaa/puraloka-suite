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
