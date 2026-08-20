/**
 * Tipe bersama portal PM.
 *
 * Mengikuti pola `mandor-portal/_bersama/tipe.ts`: bentuk disalin dari
 * response API ASLI (dibaca dari kode, bukan ditebak dari nama file), field
 * opsional hanya bila API memang bisa tak mengirimnya. `GalatApi` +
 * `pesanGalat` sengaja DIDUPLIKASI di sini (juga di mandor-portal dan
 * portal) — mengikuti struktur route Next.js yang sudah ada per-portal,
 * bukan kelalaian DRY.
 */

/**
 * Satu baris di approval inbox — bentuk dari `GET /api/v1/approval/inbox`
 * (`apps/api/src/routes/v1/approval-inbox.ts`, interface `BarisInbox` di
 * sana). Dicek: field-field brief SUDAH cocok persis dengan kode nyata.
 */
export interface BarisInbox {
  jenis: string
  label: string
  id: string
  judul: string | null
  nomor: string | null
  nominal: number | null
  pengaju_id: string | null
  dibuat_pada: string | null
  /** `null` untuk sumber ber-tenancy `C-scenario` (tak berproyek tunggal). */
  project_id: string | null
  /** Level yang SUDAH disetujui — 0 berarti belum tersentuh siapa pun. */
  level_selesai: number
  jalur_ui: string
  /** Pengaju tak boleh menyetujui pengajuannya sendiri (SoD). */
  saya_pengajunya: boolean
}

export interface ResponsInbox {
  data: BarisInbox[]
  total: number
  ringkas: Record<string, number>
  /** Non-kosong berarti sebagian antrean TIDAK terbaca — jangan dibaca sebagai "tak ada pekerjaan". */
  dilewati: Array<{ jenis: string; sebab: string }>
}

/**
 * Proyek yang di-PM-i user. Bentuk dari `GET /api/v1/projects`
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

/**
 * Kasbon mandor lintas proyek (tabel `kasbons`, BUKAN `worker_kasbons`).
 * Bentuk dari `GET /api/v1/finance/kasbons` (`apps/api/src/routes/v1/finance.ts`).
 *
 * ⚠️ Brief tidak menuliskan tipe ini secara eksplisit di Step 3 (hanya
 * disebut namanya di daftar "Produces") — jadi ditulis dari kode nyata
 * langsung, tanpa versi dugaan untuk dibandingkan. Halaman existing
 * `pm-portal/keuangan/page.tsx` (SUDAH ADA sebelum task ini, masih
 * `useState<any>`) membaca `k.work_scopes?.mandor_assignments?.mandor?.name`
 * dan `k.work_scopes?.mandor_assignments?.projects?.name` — dicocokkan
 * dengan bentuk embed berjenjang di bawah.
 */
export interface KasbonPM {
  id: string
  amount: number | string
  fund_source?: string | null
  purpose?: string | null
  kasbon_date?: string | null
  work_scope_id?: string | null
  status?: string | null
  notes?: string | null
  created_at?: string | null
  approved_at?: string | null
  work_scopes?: {
    id: string
    scope_name: string | null
    assignment?: {
      mandor?: { id: string; name: string; phone: string | null } | null
      projects?: { id: string; name: string } | null
    } | null
  } | null
  requester?: { id: string; name: string } | null
  approver?: { id: string; name: string } | null
  cash_account?: { id: string; name: string; type: string | null } | null
}

/**
 * Dokumen proyek (kontrak/SPK/gambar kerja/dst). Bentuk dari
 * `GET /api/v1/projects/:projectId/documents` (`apps/api/src/routes/v1/documents.ts`,
 * konstanta `SELECT_FIELDS`).
 *
 * ⚠️ Nama field TOTAL BERBEDA dari dugaan awal brief (`nama_file`, `jenis`,
 * `url`, `diunggah_pada`) — tabel `documents` (migration 008) memakai nama
 * Inggris: `title`, `doc_type`, `file_url`, `uploaded_at`. Dugaan brief tak
 * cocok satu pun nama kolom dengan API sungguhan.
 */
export interface DokumenProyek {
  id: string
  project_id?: string | null
  title?: string | null
  doc_type?: string | null
  file_url?: string | null
  file_size_kb?: number | null
  file_extension?: string | null
  version?: number | null
  is_visible_to_client?: boolean | null
  /** Nomor revisi dokumen INI (kolom). Beda dari `revisi_hitung` (turunan). */
  revisi?: number | null
  menggantikan_id?: string | null
  uploaded_by?: string | null
  uploaded_at?: string | null
  created_at?: string | null
  uploader?: { id: string; name: string } | null
  /**
   * Empat field turunan berikut TIDAK ADA di tabel — dihitung server tiap
   * request lewat `nilaiRevisiDokumen()`, bukan kolom. Jangan menganggapnya
   * bisa di-PATCH.
   */
  digantikan?: boolean
  digantikan_oleh?: string | null
  revisi_hitung?: number
  revisi_terkini?: number
}

/**
 * Ringkasan kontrak proyek.
 *
 * ⚠️ Tak ada tabel/endpoint `contracts` terpisah di API — diukur lewat
 * pencarian `contract_number`/`nomor_kontrak`/tabel `contracts` di seluruh
 * `apps/api/src/routes/v1`: NIHIL. Field kontrak (nilai, model, pajak,
 * tanggal, retensi, denda) hidup sebagai KOLOM LANGSUNG di tabel `projects`
 * (lihat `ProyekPM` di atas) — bukan entitas terpisah.
 *
 * Tipe ini karena itu adalah SUBSET `ProyekPM`, bukan bentuk dari endpoint
 * lain. Ditulis terpisah supaya halaman ringkasan kontrak tak perlu
 * mengimpor seluruh `ProyekPM` (mis. `notes`, `actual_end_date`) hanya untuk
 * menampilkan nilai dan skema kontrak. `nomor_kontrak` DIHAPUS dari dugaan
 * brief — kolom itu tak ada di `projects` ataupun tabel lain manapun yang
 * ditemukan.
 */
export interface KontrakRingkas {
  id: string
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
}

/**
 * Respons `GET /api/v1/kasbons` (`apps/api/src/routes/v1/kasbons.ts`).
 *
 * Dipakai approval inbox untuk mengambil DETAIL kasbon (nama pemohon, nama
 * proyek) — `BarisInbox` sendiri tak membawanya. Tak ada `GET /:id` untuk
 * kasbon (diverifikasi: hanya `GET /api/v1/kasbons`, `POST`, dan
 * `PATCH /:id/status` yang terdaftar), jadi detail diambil dari LIST
 * (`?status=pending`) lalu dicocokkan `id` di klien.
 */
export interface KasbonDetailInbox {
  id: string
  amount: number
  fund_source: string | null
  purpose: string | null
  kasbon_date: string | null
  status: string
  notes: string | null
  created_at: string | null
  approved_at: string | null
  project: { id: string; name: string } | null
  work_scopes: { id: string; scope_name: string | null } | null
  requester: { id: string; name: string } | null
  approver: { id: string; name: string } | null
  cash_account: { id: string; name: string; type: string | null } | null
}

export interface ResponsKasbonDetailInbox {
  kasbons: KasbonDetailInbox[]
}

/**
 * Satu baris dari `GET /api/v1/projects/:projectId/submittals`
 * (`apps/api/src/routes/v1/submittal.ts`, `SUBMITTAL_SELECT`).
 *
 * Tak ada `GET /submittals/:id` berdiri sendiri (diverifikasi: 404) — detail
 * diambil dari LIST per-proyek (`project_id` sudah ada di `BarisInbox`), lalu
 * dicocokkan `id` di klien. Sama seperti kasbon di atas.
 */
export interface SubmittalDetailInbox {
  id: string
  project_id: string
  nomor: string
  judul: string
  jenis: string
  spesifikasi: string | null
  referensi_spek: string | null
  status: string
  revisi: number
  induk_id: string | null
  ditujukan_ke: string | null
  diajukan_pada: string | null
  keputusan_diharapkan: string | null
  diputuskan_pada: string | null
  catatan_reviewer: string | null
  diputuskan_oleh: string | null
  menghentikan_pekerjaan: boolean
  diajukan_oleh: string
  created_at: string | null
  pengaju: { id: string; name: string } | null
  hari_menunggu: number | null
}

export interface ResponsSubmittalDetailInbox {
  data: SubmittalDetailInbox[]
}

/**
 * Bentuk galat dari `api` (axios) — sama dengan mandor-portal.
 */
export interface GalatApi {
  response?: { data?: { error?: string; message?: string }; status?: number }
  message?: string
}

export function pesanGalat(e: unknown, bawaan: string): string {
  const g = e as GalatApi
  return g?.response?.data?.error ?? g?.response?.data?.message ?? g?.message ?? bawaan
}
