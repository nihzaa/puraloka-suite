"use client";

// ============================================================================
// Layout Portal Admin/Direktur — Tahap 0 (Task 1).
//
// Pola gerbang KEBALIKAN dari pm-portal (yang blacklist role lain via
// exclusion list) — di sini WHITELIST eksplisit admin+direktur. Role lain
// (pm, mandor, client) TIDAK dikenal portal ini dan dipulangkan ke
// /dashboard, membiarkan middleware/role masing-masing menentukan tujuan
// akhir mereka (persis pola pm-portal/layout.tsx baris 26-27).
//
// PWA (manifest, service worker, ikon dinamis) SUDAH otomatis terwarisi dari
// infrastruktur bersama yang dibangun Portal PM — TIDAK dibangun ulang di sini.
// ============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, logout, type PuralokaUser } from "@/lib/api";
import PortalShell, { type NavItem } from "@/components/portal/PortalShell";
import { LayoutGrid, Inbox, MoreHorizontal } from "lucide-react";

// Tahap 1 (Task 4): "Approval" ditambahkan — halaman `/admin-portal/inbox`
// sudah dibangun (review Task 4: sempat YATIM di `audit-nav-yatim.mjs`
// karena entri ini belum ditambahkan meski brief Task 1 sudah
// menspesifikasikannya; satu-satunya jalur sebelumnya adalah banner
// kondisional di Beranda yang hanya muncul saat ada antrean, jadi admin/
// direktur tak punya cara membuka halaman ini saat inbox kosong).
//
// Pola PERSIS pm-portal/layout.tsx (`Beranda, Approval, Proyek, Keuangan,
// Lainnya`): "Approval" masuk slot ke-2, TEPAT SESUDAH Beranda — array
// `navItems` berisi SEMUA entri termasuk "Lainnya" di posisi TERAKHIR
// (bukan hanya lewat prop PortalShell terpisah) — `audit-nav-yatim.mjs`
// memindai bentuk objek literal di berkas layout untuk tahu tujuan mana
// yang terjangkau, dan tujuan yang cuma disebut lewat nama prop lain tak
// ikut terbaca. `PortalShell` menampilkan 4 item PERTAMA di bottom nav
// (`primaryItems = navItems.slice(0, 4)`) — 3 entri di sini semuanya masuk
// slot itu, jadi "Lainnya" tetap terlihat di bottom nav juga.
const NAV_ITEMS: NavItem[] = [
  { href: "/admin-portal", label: "Beranda", icon: LayoutGrid, exact: true },
  { href: "/admin-portal/inbox", label: "Approval", icon: Inbox },
  { href: "/admin-portal/kategori", label: "Lainnya", icon: MoreHorizontal },
];

export default function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<PuralokaUser | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace("/login");
      return;
    }
    if (u.role !== "admin" && u.role !== "direktur") {
      // Role lain (pm, mandor, client) TIDAK dikenal portal ini — pulangkan
      // ke dashboard umum, biarkan middleware/role masing-masing yang
      // menentukan tujuan akhir mereka.
      router.replace("/dashboard");
      return;
    }
    setUser(u);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  function handleLogout() {
    // `logout()` (lib/api.ts) — bukan removeItem manual — supaya cookie
    // `puraloka_role` (dibaca middleware) dan cache menu/SW ikut terhapus.
    // Pola persis pm-portal/layout.tsx.
    logout();
    router.push("/login");
  }

  return (
    <PortalShell
      user={user}
      portalLabel="Portal Admin"
      navItems={NAV_ITEMS}
      onLogout={handleLogout}
      lainnyaHref="/admin-portal/kategori"
    >
      {children}
    </PortalShell>
  );
}
