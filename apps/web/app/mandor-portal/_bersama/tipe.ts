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

/**
 * ── Tipe modul baru (K3, punch, inspeksi, RFI, submittal, retensi)
 *
 * Bentuk di bawah disalin dari `apps/api/src/routes/v1/k3-lapangan.ts`,
 * `punch-list.ts`, `inspeksi.ts`, `rfi.ts`, `submittal.ts`, dan bagian
 * "RETENSI SUBKONTRAK" di `mandor.ts` — dibaca ULANG dari kode nyata, bukan
 * dari dugaan nama kolom. Beberapa nama field yang tampak "wajar" ternyata
 * SALAH kalau ditebak dari nama file (didokumentasikan per-tipe di bawah).
 */

/** Insiden K3 lapangan. Bentuk dari `INSIDEN_SELECT` di `k3-lapangan.ts`. */
export interface InsidenK3 {
  id: string
  project_id?: string | null
  nomor?: string | null
  jenis?: string | null
  tanggal?: string | null
  waktu?: string | null
  lokasi?: string | null
  kronologi?: string | null
  supplier_id?: string | null
  mandor_id?: string | null
  korban_nama?: string | null
  korban_worker_id?: string | null
  melukai?: boolean | null
  hari_kerja_hilang?: number | null
  cedera_uraian?: string | null
  penyebab_langsung?: string | null
  penyebab_dasar?: string | null
  tindakan_korektif?: string | null
  jsa_id?: string | null
  izin_kerja_id?: string | null
  status?: string | null
  ditutup_pada?: string | null
  biaya_akibat?: number | string | null
  catatan?: string | null
  created_at?: string | null
  /**
   * Pelapor insiden. Nama embed API: `pelapor` — BUKAN `dilaporkan_oleh`
   * (itu nama KOLOM fk-nya, `dilaporkan_oleh_fkey`; embed-nya sendiri
   * bernama `pelapor`). Brief awal task ini menebak field `dilaporkan_oleh`
   * berisi objek `{id, name}` — salah, itu string id kolom fk mentah kalau
   * tak di-select sebagai embed.
   */
  pelapor?: { id: string; name: string } | null
  subkon?: { id: string; name: string } | null
}

/**
 * Job Safety Analysis. Bentuk dari `JSA_SELECT` di `k3-lapangan.ts`.
 *
 * Tak punya `judul`/`status`/`dibuat_pada` seperti dugaan awal — JSA
 * diidentifikasi lewat `jenis_pekerjaan` + `kode`, dan tak berstatus
 * (ia berlaku/tidak lewat kolom `berlaku`, bukan status bertingkat).
 */
export interface JsaK3 {
  id: string
  company_id?: string | null
  project_id?: string | null
  kode?: string | null
  jenis_pekerjaan?: string | null
  uraian?: string | null
  disetujui_pada?: string | null
  berlaku?: boolean | null
  catatan?: string | null
  created_at?: string | null
  penyusun?: { id: string; name: string } | null
}

/**
 * Inspeksi K3 rutin (bagian dari `GET /proyek/:id/k3`, BUKAN endpoint
 * inspeksi terpisah). Kolomnya: `id, nomor, tanggal, area, pemeriksa_nama,
 * ringkasan` — tak ada `jenis_inspeksi` atau `status` seperti dugaan awal.
 */
export interface InspeksiK3 {
  id: string
  nomor?: string | null
  tanggal?: string | null
  area?: string | null
  pemeriksa_nama?: string | null
  ringkasan?: string | null
}

/** Item punch list (temuan cacat/kekurangan pekerjaan). Bentuk dari `PUNCH_SELECT`. */
export interface PunchItem {
  id: string
  project_id?: string | null
  nomor?: string | null
  judul?: string | null
  deskripsi?: string | null
  lokasi?: string | null
  severity?: string | null
  status?: string | null
  rab_item_id?: string | null
  work_scope_id?: string | null
  ditemukan_oleh?: string | null
  /** Id user yang ditugaskan — kolom mentah, BUKAN embed. Embednya `petugas`. */
  ditugaskan_ke?: string | null
  diverifikasi_oleh?: string | null
  diverifikasi_pada?: string | null
  alasan_penolakan?: string | null
  target_selesai?: string | null
  ditutup_pada?: string | null
  created_at?: string | null
  updated_at?: string | null
  penemu?: { id: string; name: string } | null
  petugas?: { id: string; name: string } | null
  verifikator?: { id: string; name: string } | null
  rab_item?: { id: string; name: string; category_code: string | null; level: string | null } | null
  work_scope?: { id: string; scope_name: string } | null
}

/**
 * Permintaan inspeksi (izin cor/izin tutup) sebelum pekerjaan ditutup.
 * Bentuk dari `INSPEKSI_SELECT` di `inspeksi.ts`. Beda modul dari
 * `InspeksiK3` di atas — ini tabel `inspection_requests`, ber-workflow.
 */
export interface Inspeksi {
  id: string
  project_id?: string | null
  nomor?: string | null
  judul?: string | null
  lokasi?: string | null
  catatan?: string | null
  pekerjaan_lanjutan?: string | null
  status?: string | null
  rab_item_id?: string | null
  work_scope_id?: string | null
  diminta_oleh?: string | null
  /** Kapan diminta diperiksa (dijadwalkan), BUKAN "diajukan_pada". */
  diminta_untuk?: string | null
  diperiksa_oleh?: string | null
  diperiksa_pada?: string | null
  hasil_catatan?: string | null
  punch_item_id?: string | null
  created_at?: string | null
  updated_at?: string | null
  pemohon?: { id: string; name: string } | null
  pemeriksa?: { id: string; name: string } | null
  rab_item?: { id: string; name: string; category_code: string | null } | null
  temuan?: { id: string; nomor: string; judul: string; status: string } | null
  /** Dihitung API kalau relevan di sisi klien; endpoint ini tak mengirim ini sendiri. */
  terlambat?: boolean
}

/**
 * Request for Information ke konsultan/pemberi kerja. Bentuk dari
 * `RFI_SELECT` di `rfi.ts`. Field tanggal PENGIRIMAN bernama `dikirim_pada`
 * — bukan `diajukan_pada` seperti dugaan awal (itu istilah submittal).
 */
export interface Rfi {
  id: string
  project_id?: string | null
  nomor?: string | null
  perihal?: string | null
  pertanyaan?: string | null
  ditujukan_ke?: string | null
  referensi_gambar?: string | null
  status?: string | null
  dikirim_pada?: string | null
  jawaban_diharapkan?: string | null
  dijawab_pada?: string | null
  jawaban?: string | null
  dijawab_oleh?: string | null
  menghentikan_pekerjaan?: boolean | null
  pekerjaan_terdampak?: string | null
  eot_id?: string | null
  diajukan_oleh?: string | null
  created_at?: string | null
  updated_at?: string | null
  pengaju?: { id: string; name: string } | null
  eot?: {
    id: string; eot_number?: string | null
    days_requested?: number | null; days_approved?: number | null; status?: string | null
  } | null
  /** Dihitung API (`hariMenggantung`) — null kalau belum dikirim. */
  hari_menggantung?: number | null
  /** Dihitung API — sudah lewat `jawaban_diharapkan` dan belum dijawab. */
  terlambat?: boolean
}

/**
 * Submittal material/shop drawing/metode kerja. Bentuk dari
 * `SUBMITTAL_SELECT` di `submittal.ts`. Beda dari RFI: field tanggal
 * pengajuannya memang `diajukan_pada` (bukan `dikirim_pada`).
 */
export interface Submittal {
  id: string
  project_id?: string | null
  nomor?: string | null
  judul?: string | null
  jenis?: string | null
  spesifikasi?: string | null
  referensi_spek?: string | null
  status?: string | null
  revisi?: number | null
  induk_id?: string | null
  ditujukan_ke?: string | null
  diajukan_pada?: string | null
  keputusan_diharapkan?: string | null
  diputuskan_pada?: string | null
  catatan_reviewer?: string | null
  diputuskan_oleh?: string | null
  rab_item_id?: string | null
  material_id?: string | null
  menghentikan_pekerjaan?: boolean | null
  diajukan_oleh?: string | null
  created_at?: string | null
  updated_at?: string | null
  pengaju?: { id: string; name: string } | null
  rab_item?: { id: string; name: string; category_code: string | null } | null
  material?: { id: string; name: string; code: string | null; unit: string | null } | null
  /** Dihitung API (`hariMenunggu`) — null kalau belum diajukan. */
  hari_menunggu?: number | null
}

/**
 * Satu baris register retensi subkontrak — SATU SCOPE, bukan satu
 * transaksi rilis. Bentuk dari `GET /api/v1/mandor/retensi-register` di
 * `mandor.ts` (bagian "RETENSI SUBKONTRAK").
 *
 * ⚠️ Bentuk ini TOTAL BERBEDA dari dugaan awal task ini (`jumlah`,
 * `tanggal_rilis`). Endpoint sungguhan memulangkan `{ scopes: RetensiRegister[],
 * total_ditahan, total_dicairkan, total_outstanding }` — satu baris per
 * lingkup kerja, dengan `ditahan`/`dicairkan`/`outstanding` HASIL HITUNGAN
 * server (Σ retensi progress payment approved − Σ pencairan), bukan kolom.
 */
export interface RetensiRegister {
  work_scope_id: string
  scope_name?: string | null
  status?: string | null
  retensi_pct?: number | string | null
  mandor?: { id: string; name: string } | null
  project?: { id: string; name: string } | null
  ditahan: number
  dicairkan: number
  outstanding: number
}

/** Bungkus respons `GET /api/v1/mandor/retensi-register`. */
export interface ResponsRetensiRegister {
  scopes: RetensiRegister[]
  total_ditahan: number
  total_dicairkan: number
  total_outstanding: number
}

/**
 * Satu baris pencairan retensi — hasil `POST /api/v1/mandor/retensi-releases`,
 * tabel `subcontract_retention_releases`. Bentuk `select()` polos (SELECT *)
 * di endpoint itu, jadi seluruh kolom kemungkinan besar ikut; yang tercantum
 * di sini adalah yang eksplisit di-`insert()` sehingga PASTI ada.
 */
export interface RetensiRelease {
  id: string
  company_id?: string | null
  work_scope_id: string
  amount: number | string
  released_at?: string | null
  cash_account_id?: string | null
  notes?: string | null
  released_by?: string | null
  created_at?: string | null
}
