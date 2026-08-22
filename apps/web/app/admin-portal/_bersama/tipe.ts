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
 * (`apps/api/src/routes/v1/approval-inbox.ts`, interface `BarisInbox` di
 * sana). Identik salinan pm-portal (`pm-portal/_bersama/tipe.ts:17-33`) —
 * portal ini memakai endpoint yang SAMA PERSIS, company-wide (bukan
 * disaring `pm_id` karena admin/direktur bukan role `pm`).
 */
export interface BarisInbox {
  jenis: string;
  label: string;
  id: string;
  judul: string | null;
  nomor: string | null;
  nominal: number | null;
  pengaju_id: string | null;
  dibuat_pada: string | null;
  /** `null` untuk sumber ber-tenancy `C-scenario` (tak berproyek tunggal). */
  project_id: string | null;
  /** Level yang SUDAH disetujui — 0 berarti belum tersentuh siapa pun. */
  level_selesai: number;
  jalur_ui: string;
  /** Pengaju tak boleh menyetujui pengajuannya sendiri (SoD). */
  saya_pengajunya: boolean;
}

/**
 * Bentuk LENGKAP `GET /api/v1/approval/inbox` — diperluas dari Task 3
 * (yang hanya memakai `total` untuk badge beranda). Task 4 (halaman inbox
 * penuh) butuh `data` (daftar baris) dan `dilewati` (jenis yang gagal
 * dimuat, ditampilkan sebagai peringatan, bukan disembunyikan).
 */
export interface ResponsInbox {
  data: BarisInbox[];
  total: number;
  ringkas: Record<string, number>;
  /** Non-kosong berarti sebagian antrean TIDAK terbaca — jangan dibaca sebagai "tak ada pekerjaan". */
  dilewati: Array<{ jenis: string; sebab: string }>;
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

// ============================================================================
// Detail-fetch untuk approval inbox (Task 4) — SEMUA disalin dari
// `pm-portal/_bersama/tipe.ts`, bentuknya identik karena endpoint yang
// dipanggil sama persis (backend tak beda per role pemanggil).
// ============================================================================

/**
 * Bentuk `GET /api/v1/kasbons` (`apps/api/src/routes/v1/kasbons.ts`).
 * Dipakai approval inbox untuk mengambil DETAIL kasbon (nama pemohon, nama
 * proyek) — `BarisInbox` sendiri tak membawanya. Tak ada `GET /:id` untuk
 * kasbon, jadi detail diambil dari LIST (`?status=pending`) lalu dicocokkan
 * `id` di klien.
 */
export interface KasbonDetailInbox {
  id: string;
  amount: number;
  fund_source: string | null;
  purpose: string | null;
  kasbon_date: string | null;
  status: string;
  notes: string | null;
  created_at: string | null;
  approved_at: string | null;
  project: { id: string; name: string } | null;
  work_scopes: { id: string; scope_name: string | null } | null;
  requester: { id: string; name: string } | null;
  approver: { id: string; name: string } | null;
  cash_account: { id: string; name: string; type: string | null } | null;
}

export interface ResponsKasbonDetailInbox {
  kasbons: KasbonDetailInbox[];
}

/**
 * Satu baris dari `GET /api/v1/projects/:projectId/submittals`
 * (`apps/api/src/routes/v1/submittal.ts`, `SUBMITTAL_SELECT`). Tak ada
 * `GET /submittals/:id` berdiri sendiri — detail diambil dari LIST
 * per-proyek (`project_id` sudah ada di `BarisInbox`), lalu dicocokkan `id`
 * di klien. Sama seperti kasbon di atas.
 */
export interface SubmittalDetailInbox {
  id: string;
  project_id: string;
  nomor: string;
  judul: string;
  jenis: string;
  spesifikasi: string | null;
  referensi_spek: string | null;
  status: string;
  revisi: number;
  induk_id: string | null;
  ditujukan_ke: string | null;
  diajukan_pada: string | null;
  keputusan_diharapkan: string | null;
  diputuskan_pada: string | null;
  catatan_reviewer: string | null;
  diputuskan_oleh: string | null;
  menghentikan_pekerjaan: boolean;
  diajukan_oleh: string;
  created_at: string | null;
  pengaju: { id: string; name: string } | null;
  hari_menunggu: number | null;
}

export interface ResponsSubmittalDetailInbox {
  data: SubmittalDetailInbox[];
}

/** Bentuk PERSIS `GET /api/v1/procurement/material-requests`, `procurement.ts:263-268`. */
export interface MrRingkas {
  id: string;
  mr_number: string | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "partially_ordered" | "fully_ordered" | string;
  request_date: string | null;
  needed_date: string | null;
  notes: string | null;
  created_at: string;
  project: { id: string; name: string } | null;
  requested_by: { id: string; name: string } | null;
  approved_by: { id: string; name: string } | null;
  items: Array<{ id: string; qty_requested: number | string; qty_ordered: number | string | null; unit: string; material: { id: string; name: string; unit: string } | null }>;
}

/**
 * Bentuk PERSIS `GET /api/v1/procurement/material-requests/:id`,
 * `procurement.ts:293-297` — `select('*', ...)` jadi item TAMBAHAN
 * ikut lewat, tak semuanya dipakai di sini.
 */
export interface MrDetail extends MrRingkas {
  requested_by: { id: string; name: string; phone: string | null } | null;
  items: Array<{
    id: string; qty_requested: number | string; qty_ordered: number | string | null;
    unit: string; unit_price_est: number | string | null; notes: string | null;
    material: { id: string; name: string; unit: string; unit_price: number | string | null } | null;
  }>;
}
export interface RespMrDetail { material_request: MrDetail }

/** Bentuk PERSIS `GET /api/v1/procurement/purchase-orders`, `procurement.ts:861-866`. */
export interface PoRingkas {
  id: string;
  po_number: string | null;
  status: "draft" | "sent" | "confirmed" | "cancelled" | string;
  order_date: string | null;
  expected_delivery_date: string | null;
  total_amount: number | string | null;
  payment_terms: string | null;
  created_at: string;
  project: { id: string; name: string } | null;
  supplier: { id: string; name: string; phone: string | null } | null;
  created_by: { id: string; name: string } | null;
  items: Array<{ id: string; qty_ordered: number | string; qty_received: number | string | null; unit: string; unit_price: number | string; total_price: number | string; material: { id: string; name: string } | null }>;
}

/** Bentuk PERSIS `GET /purchase-orders/:id`, `procurement.ts:889-895`. */
export interface PoDetail extends Omit<PoRingkas, "supplier" | "project"> {
  project: { id: string; name: string; location: string | null } | null;
  supplier: { id: string; name: string; phone: string | null; email: string | null; address: string | null; payment_terms: string | null } | null;
  mr: { id: string; mr_number: string | null } | null;
  items: Array<{ id: string; qty_ordered: number | string; qty_received: number | string | null; unit: string; unit_price: number | string; total_price: number | string; material: { id: string; name: string; unit: string } | null }>;
}
export interface RespPoDetail { purchase_order: PoDetail }

/** Bentuk PERSIS `ITP_SELECT`, `rencana-mutu.ts:42-47`. */
export interface TitikItp {
  id: string;
  rencana_mutu_id: string;
  urutan: number;
  kode: string | null;
  tahap_pekerjaan: string;
  uraian: string;
  jenis_titik: "hold" | "witness" | "review";
  kriteria: string | null;
  acuan: string | null;
  metode_verifikasi: string | null;
  pihak_verifikasi: string | null;
  rab_item_id: string | null;
  /** `null` = belum diperiksa — DIBEDAKAN dari `false` (ditolak). Jangan
   * dirender sebagai boolean langsung. */
  lolos: boolean | null;
  diperiksa_oleh: string | null;
  diperiksa_pada: string | null;
  catatan_hasil: string | null;
  pemeriksa: { id: string; name: string } | null;
}

export interface RencanaMutu {
  id: string;
  project_id: string;
  nomor: string;
  judul: string;
  revisi: number;
  status: "draf" | "diajukan" | "disetujui" | "kedaluwarsa" | string;
  standar_acuan: string | null;
  sasaran_mutu: string | null;
  catatan: string | null;
  penanggung_jawab: string | null;
  disetujui_oleh: string | null;
  disetujui_pada: string | null;
  created_at: string;
  updated_at: string;
  pj: { id: string; name: string } | null;
  penyetuju: { id: string; name: string } | null;
}

export interface RingkasanItp {
  total: number;
  lolos: number;
  gagal: number;
  belum: number;
  /** Titik HOLD yang belum lolos (null ATAU false) — yang MENAHAN pekerjaan. */
  menahan: TitikItp[];
  /** Titik WITNESS yang belum lolos — wajib diberitahukan, TIDAK menahan. */
  menunggu_saksi: TitikItp[];
  pct_lolos: number | null;
  pct_selesai: number;
  /** `null` = ITP kosong (belum menyatakan apa pun) — BUKAN "boleh lanjut". */
  boleh_lanjut: boolean | null;
}

export interface CacatRmp {
  kode: "tanpa-acuan" | "tanpa-sasaran" | "tanpa-titik" | "tanpa-hold" | "titik-tanpa-kriteria";
  pesan: string;
  /** Titik yang bermasalah — hanya terisi untuk `titik-tanpa-kriteria`. */
  titik?: TitikItp[];
}

export interface RespRencanaMutuSatu {
  rencana: RencanaMutu;
  titik: TitikItp[];
  ringkasan: RingkasanItp;
  cacat: CacatRmp[];
  persetujuan: { boleh: boolean; penghalang: CacatRmp[] };
}

// ============================================================================
// Proyek (Task 7, Tahap 2) — disalin PERSIS dari `pm-portal/_bersama/tipe.ts:58-84`.
// ============================================================================

/**
 * Proyek company-wide. Bentuk dari `GET /api/v1/projects`
 * (`apps/api/src/routes/v1/projects.ts`).
 *
 * ⚠️ Beda dari dugaan awal task ini: brief menebak field minimal
 * (`id, name, location?, pm_id?, status?, progress_pct?`). API sungguhan
 * memulangkan jauh lebih banyak, dan halaman `pm-portal/proyek/page.tsx`
 * yang SUDAH ADA (sebelum task ini) memakai `contract_value`, `start_date`,
 * `end_date`, dan `client.name` — field yang hilang dari dugaan brief.
 *
 * Embed klien bernama `clients` (JAMAK, sesuai nama tabel) di response API,
 * TAPI halaman existing membaca `p.client?.name` (TUNGGAL) — itu bug lama
 * di halaman itu (selalu `undefined`), bukan bentuk field yang benar. Tipe
 * di sini mengikuti API, bukan bug pembacanya: field bernama `clients`.
 */
export interface ProyekPM {
  id: string
  name: string
  description?: string | null
  location?: string | null
  contract_model?: string | null
  tax_scheme?: string | null
  contract_value?: number | string | null
  commission_pct?: number | string | null
  retention_pct?: number | string | null
  retention_amount?: number | string | null
  penalty_enabled?: boolean | null
  penalty_basis?: string | null
  penalty_rate_per_day?: number | string | null
  penalty_cap_pct?: number | string | null
  penalty_grace_days?: number | null
  start_date?: string | null
  end_date?: string | null
  actual_end_date?: string | null
  status?: string | null
  progress_pct?: number | null
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
  clients?: { id: string; contact_person: string | null; phone: string | null; client_type: string | null; user_id: string | null } | null
  pm?: { id: string; name: string; email: string | null; phone: string | null } | null
}
