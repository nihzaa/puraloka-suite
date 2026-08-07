/**
 * Tipe bersama portal mandor.
 *
 * ── Kenapa satu berkas, bukan didefinisikan per-halaman
 *
 * Diukur 2026-08-07: **43 dari 99** `any` yang tersisa di `apps/web` ada di
 * `mandor-portal`, dan hampir seluruhnya turunan dari dua akar —
 * `useState<any[]>` untuk `assignments` dan `logs`. Sekali akarnya bertipe,
 * `.map((a: any) => …)` di belasan tempat ikut hilang dengan sendirinya.
 *
 * Mendefinisikannya per-halaman akan melahirkan tiga versi `Assignment` yang
 * berbeda-beda, dan yang paling berbahaya bukan ketidakcocokannya melainkan
 * kemiripannya: tiga tipe yang 90% sama membuat pembacanya berhenti
 * memeriksa perbedaan yang 10%.
 *
 * ── Sumbernya kode API, bukan tebakan
 *
 * Bentuk di bawah disalin dari `GET /api/v1/mandor/assignments`
 * (`apps/api/src/routes/v1/mandor.ts`), termasuk field turunan yang dihitung
 * di sana (`total_kasbon`, `total_progress_paid`).
 *
 * Field ditandai opsional bila API memang bisa tak mengirimnya — bukan
 * "supaya lolos compiler". Yang kedua mengubah tipe jadi dokumentasi palsu.
 */

/** Proyek dalam bentuk ringkas — yang ikut di setiap embed. */
export interface ProyekRingkas {
  id: string
  name: string
  location?: string | null
}

/** Kasbon tukang, sebagaimana ikut di dalam scope. */
export interface KasbonRingkas {
  id: string
  amount: number | string
  status: string
}

/**
 * Lingkup kerja beserta angka turunannya.
 *
 * `total_kasbon` dan `total_progress_paid` DIHITUNG di API, bukan kolom.
 * Menaruhnya di sini membuat halaman berhenti menghitung ulang — dan
 * perhitungan yang diulang di dua tempat adalah dua angka yang bisa berbeda.
 */
export interface LingkupKerja {
  id: string
  scope_name: string
  status: string
  payment_system?: string | null
  borongan_value?: number | string | null
  progress_pct_done?: number | null
  start_date?: string | null
  end_date?: string | null
  total_kasbon?: number
  total_progress_paid?: number
  kasbons?: KasbonRingkas[]
  contract_value?: number | string | null
  project?: ProyekRingkas | null
}

/** Penugasan mandor ke satu proyek. */
export interface Penugasan {
  id: string
  assigned_at?: string | null
  mandor?: { id: string; name: string } | null
  project?: ProyekRingkas | null
  work_scopes?: LingkupKerja[]
}

/** Foto yang menyertai satu laporan progres. */
export interface FotoProgres {
  id: string
  photo_url?: string | null
  url?: string | null
  caption?: string | null
}

/** Satu catatan progres lapangan. */
export interface LogProgres {
  id: string
  log_date?: string | null
  logged_at?: string | null
  progress_pct?: number | null
  pct_overall?: number | null
  notes?: string | null
  project_id?: string | null
  work_scope_id?: string | null
  /** Cuaca saat pencatatan. Nama kolom API: `weather`. */
  weather?: string | null
  /**
   * Jumlah pekerja. Nama kolom API: `worker_count` — BUKAN `workers_count`.
   *
   * Halaman progres sempat memakai `workers_count` (dengan `s`), yang berarti
   * nilainya SELALU `undefined` dan jumlah pekerja tak pernah tampil. Tak ada
   * galat: `any` membuat salah ketik itu tak terlihat compiler, dan
   * `{log.workers_count && …}` diam-diam merender nol apa pun.
   *
   * Ketahuan 2026-08-07 justru ketika `any` dihapus.
   */
  worker_count?: number | null
  project_photos?: FotoProgres[]
}

/** Pembayaran progres borongan atas satu lingkup kerja. */
export interface PembayaranProgres {
  id: string
  scope_id?: string | null
  work_scope_id?: string | null
  pct_progress?: number | null
  gross_payment?: number | string | null
  net_payment?: number | string | null
  status?: string | null
  paid_at?: string | null
  created_at?: string | null
  notes?: string | null
  /** Persentase progres pada pembayaran ini. Nama kolom API: `pct_done`. */
  pct_done?: number | null
}

/** Laporan upah mingguan. */
export interface LaporanUpah {
  id: string
  week_start?: string | null
  week_end?: string | null
  status?: string | null
  net_amount?: number | string | null
  payment_method?: string | null
  paid_at?: string | null
  scope?: { id: string; scope_name: string; payment_system?: string | null } | null
  assignment?: { project?: ProyekRingkas | null } | null
  subtotal?: number | string | null
  total_deduction?: number | string | null
  review_notes?: string | null
}

/** Kasbon — dipakai untuk kasbon mandor maupun kasbon tukang. */
export interface Kasbon {
  id: string
  amount: number | string
  amount_settled?: number | string | null
  is_settled?: boolean | null
  status?: string | null
  purpose?: string | null
  kasbon_date?: string | null
  notes?: string | null
  worker?: { id: string; name: string } | null
  project?: ProyekRingkas | null
  /**
   * Lingkup kerja. Nama embed API: `work_scopes` (JAMAK) — bukan `work_scope`.
   *
   * Halaman ringkasan portal sempat membaca `k.work_scope?.scope_name`, yang
   * berarti nama lingkup kerja di kartu kasbon SELALU jatuh ke "—". Tak ada
   * galat: `any` membuat nama yang tak pernah ada itu lolos compiler.
   *
   * Ketahuan 2026-08-07, sama seperti `workers_count` di LogProgres.
   */
  work_scopes?: { id: string; scope_name: string } | null
}

/** Tukang di bawah seorang mandor. */
export interface Tukang {
  id: string
  name: string
  tipe?: string | null
  phone?: string | null
  is_active?: boolean | null
  skills?: string[] | null
  mandor?: { id: string; name: string } | null
}

/**
 * Bentuk galat dari `api` (axios).
 *
 * Dipakai menggantikan `catch (err: any)`. Seluruh field opsional: galat
 * jaringan tak punya `response` sama sekali, dan `catch` yang mengandaikan
 * sebaliknya akan melempar galat KEDUA di dalam penanganan galat pertama —
 * menyembunyikan sebab aslinya.
 */
export interface GalatApi {
  response?: { data?: { error?: string; message?: string }; status?: number }
  message?: string
}

/** Ambil pesan yang bisa dibaca dari galat apa pun, tanpa `any`. */
export function pesanGalat(e: unknown, bawaan: string): string {
  const g = e as GalatApi
  return g?.response?.data?.error ?? g?.response?.data?.message ?? g?.message ?? bawaan
}
