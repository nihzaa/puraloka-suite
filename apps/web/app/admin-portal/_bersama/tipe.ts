// Tipe bersama Portal Admin/Direktur — SATU interface per bentuk respons
// API nyata, diverifikasi ke kode backend (route handler + SELECT/interface
// aslinya) SEBELUM ditulis. Jangan menebak dari nama field.
// Diisi progresif per Tahap (lihat docs/superpowers/plans/
// 2026-08-22-portal-admin-direktur-lengkap.md).

/**
 * KPI ringkas dari `GET /api/v1/dashboard` — HANYA field yang dipakai
 * Beranda admin-portal (bentuk lengkap di
 * `apps/api/src/routes/v1/dashboard.ts:253-291` jauh lebih besar; field
 * lain seperti `active_progress`/`outstanding_invoices`/`pending_kasbons`
 * TIDAK diambil di sini — Tahap 2 (Proyek) dan Tahap 3 (Keuangan) yang
 * akan menambah tipe untuk field itu saat modulnya dibangun).
 */
export interface DashboardEksekutif {
  kpis: {
    active_projects: number;
    total_contract_value: number;
    invoice_outstanding: number;
    income_this_month: number;
    kasbon_active_total: number;
    net_cash_estimate: number;
  };
  alerts: {
    kasbon_pending: number;
    invoice_overdue: number;
    milestone_late: number;
  };
}

/** `GET /api/v1/dashboard/fokus` — ringkasan lintas-modul (dashboard.ts:417-431). */
export interface DashboardFokus {
  lewat: number;
  menunggu: number;
  tautan: string;
  rincian: {
    invoice_jatuh_tempo: number;
    klaim_lewat_batas: number;
    instruksi_belum_dikonfirmasi: number;
    kasbon_menunggu: number;
    penagihan_menunggu: number;
  };
}

/**
 * `GET /api/v1/dashboard/deret` — riwayat BULANAN per metrik untuk
 * sparkline KPI (`apps/api/src/routes/v1/dashboard.ts:546-556`). Tiap
 * array bisa LEBIH PENDEK dari `bulan` — bulan kosong di UJUNG dibuang
 * server (`rataUrut()`, dashboard.ts:495-504), jadi array `[]` berarti
 * "belum ada riwayat", BUKAN error. Jangan asumsikan panjang tetap 8.
 */
export interface DashboardDeret {
  bulan: number;
  mulai: string;
  deret: {
    proyek_aktif: number[];
    nilai_kontrak: number[];
    invoice_belum_lunas: number[];
    kas_masuk: number[];
    kasbon: number[];
  };
}

/**
 * Satu baris di approval inbox — bentuk dari `GET /api/v1/approval/inbox`
 * (`apps/api/src/routes/v1/approval-inbox.ts`). Portal ini HANYA memakai
 * `total` (badge "X pengajuan menunggu"), jadi field lain (`data`, `ringkas`,
 * `dilewati`) sengaja tak dituliskan ulang di sini — lihat pola sama yang
 * lebih lengkap di `pm-portal/_bersama/tipe.ts`.
 */
export interface ResponsInbox {
  total: number;
}

/**
 * Bentuk error dari axios/fetch wrapper — DIDUPLIKASI per portal (pola sama
 * `pm-portal/_bersama/tipe.ts`), bukan diimpor lintas portal.
 */
export interface GalatApi {
  response?: { data?: { error?: string; message?: string }; status?: number };
  message?: string;
}

export function pesanGalat(e: unknown, bawaan: string): string {
  const g = e as GalatApi;
  return g?.response?.data?.error ?? g?.response?.data?.message ?? g?.message ?? bawaan;
}
