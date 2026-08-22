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
import { LayoutGrid, Inbox, FolderKanban, FileSignature, MoreHorizontal } from "lucide-react";

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
// (`primaryItems = navItems.slice(0, 4)`).
//
// Tahap 2 (Task 7): "Proyek" ditambahkan — halaman `/admin-portal/proyek`
// dibangun tapi TIDAK ditautkan dari mana pun (brief Task 7 salah menyatakan
// "sudah ada di NAV_ITEMS Task 1 Step 2" — diverifikasi TIDAK BENAR, layout
// ini sebelum Task 7 hanya berisi Beranda/Approval/Lainnya).
// `audit-nav-yatim.mjs` menangkapnya sebagai YATIM sebelum entri ini
// ditambahkan — kelas cacat yang sama dengan orphan "Approval" di Task 4.
// Slot ke-3, TEPAT SESUDAH Approval, meniru urutan pm-portal persis.
//
// Tahap 2 (Task 8): "Kontrak" ditambahkan (menunjuk /kontrak/register) —
// sama pola dengan "Proyek" di atas. Brief Task 8 mengaitkan
// `/admin-portal/kontrak/*` ke kategori `g-kontrak` yang akan "diaktifkan
// Task 12", tapi `KATEGORI_AKTIF` di `lib/admin-portal-kategori.ts` HANYA
// berisi `["g-laporan", "g-sistem"]` — menunggu Task 12 berarti dua halaman
// ini YATIM sampai tahap itu tiba, pola cacat identik "Proyek" di atas.
// Diperbaiki cara yang sama: entri NAV_ITEMS langsung, BUKAN lewat aktivasi
// kategori. Ditaruh slot ke-5 (SESUDAH "Lainnya") — `PortalShell` hanya
// menampilkan 4 item PERTAMA di bottom nav (`primaryItems =
// navItems.slice(0, 4)`), jadi urutan bottom nav yang sudah ada
// (Beranda/Approval/Proyek/Lainnya) TIDAK berubah; "Kontrak" hanya menambah
// satu tujuan terdaftar & dijangkau lewat `audit-nav-yatim.mjs` (yang
// memindai literal atribut tujuan di SELURUH berkas layout, bukan hanya 4
// slot pertama).
//
// ⚠️ Penulisan komentar di sekitar sini SENGAJA menghindari pola literal
// "kata-tujuan diikuti tanda kutip" — `audit-nav-yatim.mjs` memindai SELURUH
// berkas ini dengan regex yang tak tahu bedanya kode dari komentar, dan
// komentar versi sebelumnya (menyebut pola itu apa adanya) sempat tertangkap
// sebagai "link mati" palsu bernama "di SELURUH berkas" — diperbaiki di sini
// dengan mengganti kutipnya jadi prosa biasa.
//
// `/admin-portal/kontrak/asuransi` TIDAK dapat entri NAV_ITEMS sendiri —
// dijangkau lewat tautan di badan halaman Register Kontrak (dan
// sebaliknya), pola sama dengan `mandor-portal/progress`/`laporan` yang
// didaftarkan WAJAR di `audit-nav-yatim.mjs` sebagai "subhalaman portal,
// dicapai dari badan halaman". Halaman ini juga akan terlihat langsung di
// bottom nav begitu urutan array diprioritaskan ulang di tahap berikutnya
// (Task 12 mengaktifkan `g-kontrak`), tanpa perlu menyentuh dua halaman
// kontrak itu sendiri.
const NAV_ITEMS: NavItem[] = [
  { href: "/admin-portal", label: "Beranda", icon: LayoutGrid, exact: true },
  { href: "/admin-portal/inbox", label: "Approval", icon: Inbox },
  { href: "/admin-portal/proyek", label: "Proyek", icon: FolderKanban },
  { href: "/admin-portal/kategori", label: "Lainnya", icon: MoreHorizontal },
  { href: "/admin-portal/kontrak/register", label: "Kontrak", icon: FileSignature },
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
