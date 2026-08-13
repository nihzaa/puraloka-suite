"use client";

// ============================================================================
// IKON MENU — nama ikon (string di DB) → komponen lucide. SATU tabel.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA BERKAS INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Founder, 2026-08-14, menyapu enam grup sekaligus:
//
//   "semua halaman di grup pengadaan, masih belum ada iconnya juga
//    semua halaman di grup akuntansi, lalu keuangan juga, masih belum ada
//    semua halaman di grup mandor & subkon juga ini iconnya belum konsisten"
//
// Diukur: 51 halaman dashboard tak memakai `KepalaHalaman` sama sekali.
// Sebagian besar BUKAN karena lupa — mereka memang tak menggambar judul
// sendiri. Judulnya datang dari `layout.tsx` modulnya lewat `JudulBagian`,
// dan komponen itu tak pernah punya ikon. Empat modul terbesar (`procurement`,
// `keuangan`, `kas`, `mandor` — 34 halaman) berbagi nasib yang sama dari
// satu sumber.
//
// Jadi memasang ikon satu per satu di 51 berkas adalah cara yang salah: ia
// memperbaiki gejala di tempat yang bukan penyebabnya, dan halaman ke-52 yang
// dibuat besok akan lahir tanpa ikon lagi.
//
// ── Kenapa tabelnya dipindah ke sini, bukan disalin
//
// `sidebar.tsx` sudah punya tabel ini dan `iconFor`. Menyalinnya ke
// `JudulBagian` akan bekerja HARI INI dan menyimpang diam-diam nanti: satu
// ikon ditambahkan di satu salinan, dan sidebar menampilkan Truck sementara
// judul halamannya menampilkan FolderKanban. Tepat "iconnya belum konsisten"
// yang sedang diperbaiki — dibuat ulang dalam bentuk yang lebih sulit
// dilihat, karena tak ada galat dan kedua sisi tampak benar sendiri-sendiri.
//
// Maka tabelnya PINDAH ke sini dan sidebar mengimpornya. Satu tabel, dua
// pembaca — dan ikon di sidebar dijamin sama dengan ikon di judul halaman
// karena keduanya membaca baris yang sama dari `menu_items`.
//
// ⚠️ Mengembalikan REFERENSI dari tabel, tak pernah membuat komponen baru.
// Bila fungsi ini sampai mengembalikan `() => <X/>` — bahkan sebagai
// pembungkus kecil — React menganggapnya komponen berbeda tiap render,
// meng-unmount lalu mount ulang seluruh ikon tiap kali menu berubah.
// Gejalanya halus: ikon berkedip, dan pada daftar panjang terasa seperti lag.
// Dijaga `react-hooks/static-components`.
// ============================================================================

import { createElement } from "react";
import {
  LayoutDashboard, FolderKanban, Wallet, PiggyBank, Receipt, HardHat,
  BarChart3, Settings, Users, Contact, ShoppingCart, Building2,
  ShieldCheck, CalendarDays, Landmark, Ruler, Layers, Coins, GitBranch, BellRing,
  Database, Gavel, FileSignature, CalendarRange, Calculator, Package,
  ClipboardList, BadgeCheck, ShieldAlert, Truck, FolderOpen, AlertTriangle,
  Smartphone, Dot, Bot,
} from "lucide-react";

export const IKON_MENU: Record<string, React.ElementType> = {
  LayoutDashboard, FolderKanban, Wallet, PiggyBank, Receipt, HardHat,
  BarChart3, Settings, Users, Contact, ShoppingCart, Building2,
  ShieldCheck, CalendarDays, Landmark, Ruler, Layers, Coins, GitBranch, BellRing,
  // 19 ikon grup peta menu (migrasi 153) + `Dot` untuk seluruh sub-menu.
  // Sub-menu SENGAJA seragam: 202 ikon berbeda justru menghapus fungsi ikon
  // sebagai penanda — saat semuanya bergambar, tak ada yang menonjol.
  Database, Gavel, FileSignature, CalendarRange, Calculator, Package,
  ClipboardList, BadgeCheck, ShieldAlert, Truck, FolderOpen, AlertTriangle,
  Smartphone, Dot,
  // `Bot` untuk menu Asisten (migrasi 253). Tanpa entri di sini, `ikonMenu`
  // jatuh ke `FolderKanban` — dan asisten AI tampil bergambar folder,
  // penanda yang keliru dan tak menimbulkan galat apa pun.
  Bot,
};

/** Nama ikon (string dari DB) → komponen lucide. Referensi, bukan komponen baru. */
export function ikonMenu(nama: string): React.ElementType {
  return IKON_MENU[nama] ?? FolderKanban;
}

/**
 * Merender ikon menu langsung — `createElement`, BUKAN `const X = ikonMenu(..)`
 * lalu `<X/>`.
 *
 * Bedanya bukan gaya. Menugaskan hasil pencarian ke variabel berhuruf besar di
 * dalam badan komponen adalah "membuat komponen saat render" bagi
 * `react-hooks/static-components`: React memperlakukan tiap render sebagai
 * TIPE komponen baru, meng-unmount lalu mount ulang ikonnya. Gejalanya halus —
 * ikon berkedip, dan pada sidebar 20 grup terasa seperti lag.
 *
 * `createElement(ikonMenu(nama), props)` memberi React tipe yang SAMA
 * (referensi dari tabel) tanpa pernah melewati variabel komponen, jadi node
 * DOM-nya dipertahankan.
 */
export function IkonMenu(
  { nama, ...sisa }: { nama: string } & Record<string, unknown>,
) {
  return createElement(ikonMenu(nama), sisa);
}
