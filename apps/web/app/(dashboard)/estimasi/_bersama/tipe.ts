/**
 * TIPE & HELPER BERSAMA — modul Estimasi (CECEP).
 *
 * Diekstrak saat modul dipecah dari satu berkas 4.070 baris jadi rute-rute
 * terpisah. Kalau tipe-tipe ini disalin ke tiap halaman, mereka akan
 * menyimpang: satu halaman menambah kolom, halaman lain tidak, dan galatnya
 * baru muncul saat data dari API tak cocok dengan apa yang dirender.
 *
 * Awalan garis-bawah pada nama folder membuat Next.js MENGABAIKANNYA sebagai
 * rute — /estimasi/_bersama tak akan pernah jadi halaman.
 */

// ── Proyek ────────────────────────────────────────────────────────────────
export interface ProyekRingkas {
  id: string;
  name: string;
  status?: string;
}

// ── Skenario & versi ──────────────────────────────────────────────────────
//
// Dua entitas ini TETAP ADA di data — yang berubah cuma cara UI menyebutnya.
// Spec §4b: pengguna tak pernah membaca kata "skenario"/"versi"; ia membaca
// "pilihan" dan "revisi". Nama tipe di sini sengaja tetap memakai istilah
// aslinya supaya cocok dengan payload API dan mudah ditelusuri ke rutenya.
export interface Skenario {
  id: string;
  project_id: string;
  name: string;
  purpose?: string | null;
  created_at?: string;
}

export type StatusVersi = "draft" | "submitted" | "approved" | "rejected";

export interface VersiEstimasi {
  id: string;
  scenario_id: string;
  version_number: number;
  status: StatusVersi;
  ahsp_edition_id?: string | null;
  edition_code?: string | null;
  total?: number | null;
  created_at?: string;
}

// ── Item RAB ──────────────────────────────────────────────────────────────
export interface ItemEstimasi {
  id: string;
  code?: string | null;
  description: string;
  unit_code?: string | null;
  quantity: number;
  unit_price?: number | null;
  amount?: number | null;
  assembly_id?: string | null;
  cost_code_id?: string | null;
}

// ── Rekap uang ────────────────────────────────────────────────────────────
export interface RekapRab {
  biayaLangsung: number;
  overhead: number;
  sebelumPpn: number;
  ppn: number;
  total: number;
  jumlahItem: number;
  editionCode?: string | null;
  cakupanHarga?: number | null; // 0..1 — berapa bagian item yang harganya ketemu
}

// ── Format uang ───────────────────────────────────────────────────────────
//
// SATU sumber format untuk seluruh modul. Sebelumnya tiap tab memformat
// sendiri, dan tiga di antaranya memakai pembulatan berbeda — angka yang sama
// tampil beda di dua layar, yang membuat orang ragu mana yang benar.

export const rp = (n: number | null | undefined): string => {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
};

/** Versi ringkas untuk KPI — "Rp 1,2 M" alih-alih "Rp 1.234.567.890". */
export const rpRingkas = (n: number | null | undefined): string => {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`;
  if (abs >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)} jt`;
  if (abs >= 1_000) return `Rp ${(n / 1_000).toFixed(0)} rb`;
  return rp(n);
};

/** Angka polos ber-pemisah ribuan — untuk kolom volume & HSP di tabel. */
export const angka = (n: number | null | undefined, desimal = 0): string => {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: desimal,
    maximumFractionDigits: desimal,
  }).format(n);
};

// ── Label status versi ────────────────────────────────────────────────────
//
// Bahasa lapangan, bukan istilah basis data (spec §4b). "submitted" tak
// berarti apa pun bagi estimator; "terkunci — sudah dikirim" berarti.
export const LABEL_STATUS: Record<StatusVersi, string> = {
  draft: "Masih disusun",
  submitted: "Terkunci — sudah dikirim",
  approved: "Disetujui",
  rejected: "Ditolak",
};
