"use client";

// ============================================================================
// Layout portal PM — dirombak ke PortalShell (Task 9).
//
// Proteksi role DIPERTAHANKAN APA ADANYA dari file lama (exclusion list
// admin/client + verifikasi ASYNC `pm_id` untuk role mandor yang menyaru
// sebagai PM) — HANYA lapisan render yang diganti, dari header+nav manual
// ke `PortalShell` (pola yang sama dipakai mandor-portal).
// ============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getStoredUser, logout, type PuralokaUser } from "@/lib/api";
import PortalShell, { type NavItem } from "@/components/portal/PortalShell";
import { LayoutDashboard, Inbox, FolderKanban, Wallet, Users } from "lucide-react";

export default function PmPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<PuralokaUser | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.replace("/login"); return; }
    // Izinkan role "pm" DAN role "mandor" yang punya akses PM di proyek.
    if (u.role === "admin") { router.replace("/dashboard"); return; }
    if (u.role === "client") { router.replace("/portal"); return; }
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
    if (u.role === "mandor") {
      // Verifikasi mandor ini memang punya proyek sebagai PM — ASYNC, sesudah
      // render pertama, persis perilaku lama.
      api.get("/api/v1/projects").then((res) => {
        const projects: any[] = res.data?.projects ?? [];
        const asPM = projects.some((p) => p.pm_id === u.id || p.pm?.id === u.id);
        if (!asPM) router.replace("/mandor-portal");
      }).catch(() => router.replace("/mandor-portal"));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const navItems: NavItem[] = [
    { href: "/pm-portal", label: "Beranda", icon: LayoutDashboard, exact: true },
    { href: "/pm-portal/approval", label: "Approval", icon: Inbox },
    { href: "/pm-portal/proyek", label: "Proyek", icon: FolderKanban },
    { href: "/pm-portal/keuangan", label: "Keuangan", icon: Wallet },
    { href: "/pm-portal/lainnya", label: "Lainnya", icon: Users },
  ];

  return (
    <PortalShell
      user={user}
      portalLabel="Portal PM"
      navItems={navItems}
      onLogout={handleLogout}
      lainnyaHref="/pm-portal/lainnya"
    >
      {children}
    </PortalShell>
  );
}
