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
 * K3/Punch/Inspeksi/RFI/Submittal — bentuk IDENTIK dengan
 * `mandor-portal/_bersama/tipe.ts` (sama-sama dari API yang sama), disalin
 * (bukan diimpor lintas-portal) mengikuti pola isolasi struktural per-portal
 * yang sudah dipakai `GalatApi`/`pesanGalat` di berkas ini.
 */
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
  created_at?: string | null
}

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
 * inspeksi terpisah).
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
 * Permintaan inspeksi (izin cor/izin tutup). Bentuk dari `INSPEKSI_SELECT`
 * di `inspeksi.ts`. Beda modul dari `InspeksiK3` di atas — ini tabel
 * `inspection_requests`, ber-workflow.
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
  terlambat?: boolean
}

/** Request for Information ke konsultan/pemberi kerja. Bentuk dari `RFI_SELECT` di `rfi.ts`. */
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
}

/** Submittal versi lengkap (list per-proyek untuk kelola PM). Bentuk dari `SUBMITTAL_SELECT`. */
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
  hari_menunggu?: number | null
}

/**
 * Penugasan mandor ke proyek (tabel `mandor_assignments`). Bentuk dari
 * `GET /api/v1/mandor/assignments` (`apps/api/src/routes/v1/mandor.ts`,
 * dicocokkan ke `(dashboard)/mandor/penugasan/page.tsx`).
 *
 * ⚠️ Endpoint list ini TANPA gerbang permission (cuma `authenticate`) —
 * dikonfirmasi Task 5. `POST`/`PATCH` butuh `mandor:assign`, yang PM
 * PUNYA (migrasi 050: semua permission kecuali 10 key denylist, `mandor:*`
 * tak masuk situ).
 *
 * `work_scopes` di sini SUDAH diperkaya server dengan field turunan
 * (`contract_value`, `total_kasbon`, `total_progress_paid`, `financial_pct`,
 * `paid_pct`, `settlement`) — lihat baris pengayaan di `mandor.ts` GET
 * assignments. Field itu BUKAN kolom tabel.
 */
export interface PenugasanMandor {
  id: string
  status: string | null
  notes: string | null
  assigned_at: string | null
  created_at: string | null
  project: { id: string; name: string; location: string | null } | null
  mandor: { id: string; name: string; phone: string | null } | null
  assigner: { id: string; name: string } | null
  work_scopes: Array<{
    id: string
    scope_name: string
    payment_system: string
    status: string
    borongan_value: number | string | null
    borongan_value_override?: number | string | null
    progress_pct_done: number
    contract_value?: number | string | null
    total_kasbon?: number
    total_progress_paid?: number
    financial_pct?: number
    paid_pct?: number
    settlement?: { id: string; net_payment: number; borongan_value: number; total_kasbon: number } | null
  }>
}

export interface ResponsPenugasanMandor {
  assignments: PenugasanMandor[]
}

/**
 * Kasbon TUKANG (tabel `worker_kasbons`, BUKAN `kasbons` — beda entitas
 * dari `KasbonPM` di atas). Uang muka yang diteruskan MANDOR ke tukangnya
 * sendiri; TAK PUNYA status approval — hanya dicicil sampai lunas.
 * Bentuk dari `GET /api/v1/mandor/worker-kasbons`
 * (`apps/api/src/routes/v1/mandor.ts`), dicocokkan ke
 * `(dashboard)/mandor/kasbon/page.tsx`.
 *
 * ⚠️ TIDAK duplikat `pm-portal/keuangan/page.tsx` (yang membaca tabel
 * `kasbons` lewat `/api/v1/finance/kasbons`, ber-approve/reject). Modul
 * ini entitas berbeda: piutang mandor→tukang, dipotong dari upah, bukan
 * biaya proyek yang perlu persetujuan PM.
 */
export interface KasbonTukang {
  id: string
  amount: number
  purpose: string | null
  kasbon_date: string | null
  notes: string | null
  amount_settled: number
  is_settled: boolean
  created_at: string | null
  worker: { id: string; name: string; phone: string | null } | null
  mandor: { id: string; name: string } | null
  project: { id: string; name: string } | null
  scope: { id: string; scope_name: string } | null
}

export interface ResponsKasbonTukang {
  kasbons: KasbonTukang[]
}

/**
 * Berita acara opname bersama (tabel `opname_bersama`). Bentuk dari
 * `GET /api/v1/opname` (`apps/api/src/routes/v1/opname-bersama.ts`),
 * dicocokkan ke `(dashboard)/mandor/opname/page.tsx`.
 *
 * ⚠️ PM PUNYA `mandor:view` + `opname:kelola` (list, kesiapan, ajukan)
 * TAPI TIDAK PUNYA `opname:verifikasi` (SoD eksplisit: PM mengukur di
 * lapangan, tidak memverifikasi). Halaman portal PM TAK BOLEH merender
 * tombol Verifikasi/Sengketakan sama sekali.
 *
 * `pct_selesai`/`dasar_pct` DIHITUNG server tiap request (`pctOpname()`),
 * bukan kolom tersimpan.
 */
export interface OpnameBersama {
  id: string
  nomor: string
  tanggal_opname: string
  status: "diajukan" | "diverifikasi" | "disengketakan"
  catatan: string | null
  alasan_sengketa: string | null
  foto_url: string[]
  project_id: string
  work_scope_id: string
  diukur_oleh: string
  diverifikasi_oleh: string | null
  diverifikasi_pada: string | null
  dibuat_pada?: string | null
  pengukur: { id: string; name: string } | null
  penyetuju: { id: string; name: string } | null
  opname_bersama_item: Array<{
    id: string
    uraian: string
    satuan: string
    volume_rencana: number | string | null
    volume_terukur: number | string
    pct_selesai: number | string
    catatan: string | null
    urutan: number
  }>
  pct_selesai: number | null
  dasar_pct: "nilai" | "volume" | "rata"
}

export interface ResponsOpnameBersama {
  opname: OpnameBersama[]
}

/**
 * Kesiapan tagih per lingkup kerja. Bentuk dari `GET /api/v1/opname/kesiapan`
 * (`apps/api/src/routes/v1/opname-bersama.ts`).
 */
export interface KesiapanOpname {
  work_scope_id: string
  scope_name: string
  payment_system: string
  wajib_opname: boolean
  opname_terverifikasi: number
  opname_menunggu: number
  opname_disengketakan: number
  pct_opname: number | null
  pct_sudah_ditagih: number
  pct_sisa: number | null
  sebab: string
}

export interface ResponsKesiapanOpname {
  kesiapan: KesiapanOpname[]
}

/**
 * Surat Perintah Kerja (tabel `surat_perintah_kerja`). Bentuk dari
 * `GET /api/v1/spk` (`apps/api/src/routes/v1/spk.ts`), dicocokkan ke
 * `(dashboard)/mandor/spk/page.tsx`.
 *
 * ⚠️ PM PUNYA `mandor:view` (list/pdf/addendum) + `spk:kelola`
 * (terbitkan/transisi status/addendum), TAPI TIDAK PUNYA `spk:tandatangan` —
 * SoD eksplisit (`db/migrations/328_surat_perintah_kerja.sql` L219-227):
 * hanya admin/direktur boleh membubuhkan TANDA TANGAN PIHAK PENERBIT
 * (`PATCH /spk/:id/status` dengan body `{ ttd_url, pihak: 'penerbit' }`,
 * dicek in-handler `spk.ts` L286, khusus cabang itu — BUKAN preHandler).
 * Tanda tangan `pihak === 'pelaksana'` tidak butuh izin khusus.
 *
 * `denda` DIHITUNG server tiap request (`hitungDendaKeterlambatan()`),
 * bukan kolom tersimpan — `null` kalau status bukan `ditandatangani`.
 */
export interface DendaSpk {
  hariTerlambat: number
  dendaKotor: number
  dendaTerbatas: number
  terkenaBatas: boolean
}

export interface Spk {
  id: string
  nomor: string
  tanggal_terbit: string
  lingkup_kerja: string
  nilai_kontrak: number | string
  tanggal_mulai: string
  tanggal_selesai: string
  denda_per_hari: number | string | null
  denda_maks_pct: number | string | null
  syarat_khusus: string | null
  status: "draf" | "diterbitkan" | "ditandatangani" | "dibatalkan"
  alasan_batal: string | null
  pdf_url?: string | null
  ttd_penerbit_url: string | null
  ttd_penerbit_pada?: string | null
  ttd_pelaksana_url: string | null
  ttd_pelaksana_pada?: string | null
  project_id?: string | null
  work_scope_id: string
  tender_id?: string | null
  penawaran_id?: string | null
  dibuat_pada?: string | null
  penerbit?: { id: string; name: string } | null
  scope?: { id: string; scope_name: string; payment_system: string } | null
  /** Dihitung server saat baca — bukan kolom. */
  denda: DendaSpk | null
}

export interface ResponsSpk {
  spk: Spk[]
}

/**
 * Addendum SPK (tabel `spk_addendum`). Bentuk dari
 * `GET /api/v1/spk/:id/addendum` (`apps/api/src/routes/v1/spk.ts`).
 *
 * Nilai/tanggal EFEKTIF dihitung server (delta dari seluruh addendum
 * `berlaku`, yaitu bukan `dibatalkan`) — bukan kolom tersimpan di SPK induk.
 */
export interface SpkAddendum {
  id: string
  urutan: number
  nomor: string
  tanggal: string
  alasan: string
  lingkup_tambahan: string | null
  nilai_delta: number | string
  hari_delta: number
  status: "draf" | "diterbitkan" | "ditandatangani" | "dibatalkan"
  ttd_penerbit_pada?: string | null
  ttd_pelaksana_pada?: string | null
}

export interface ResponsSpkAddendum {
  spk: { id: string; nomor: string; status: string; nilai_induk: number; tanggal_selesai_induk: string }
  addendum: SpkAddendum[]
  efektif: {
    nilai: number
    delta_nilai: number
    tanggal_selesai: string
    delta_hari: number
    jumlah_berlaku: number
  }
}

/**
 * Tender subkontraktor (tabel `tender_subkon`). Bentuk dari
 * `GET /api/v1/tender-subkon` (`apps/api/src/routes/v1/tender-subkon.ts`),
 * dicocokkan ke `(dashboard)/mandor/tender/page.tsx`.
 *
 * ⚠️ BEDA dari dugaan awal brief: modul ini TIDAK memakai permission
 * `mandor:*` sama sekali — endpoint tender memakai `projects:view` (baca)
 * dan `projects:contract` (tulis: buat tender, ajukan penawaran, tetapkan
 * pemenang, tutup tender). Diverifikasi langsung dari kode
 * (`requirePermission('projects:view'|'projects:contract')` di kelima
 * endpoint), BUKAN riset Task 5 (modul ini tak termasuk cakupannya).
 * Keduanya TIDAK ada di denylist migrasi 050 → PM punya penuh, tanpa SoD.
 *
 * `penawaran_subkon` di list adalah bentuk PostgREST `[{ count }]` — dipakai
 * lewat helper `jumlahPenawaran()` di halaman.
 */
export interface TenderSubkon {
  id: string
  nomor: string
  judul: string
  lingkup_kerja: string | null
  nilai_perkiraan: number | string | null
  tanggal: string | null
  batas_masuk: string | null
  status: "draft" | "terkirim" | "selesai" | "batal"
  alasan_pilih: string | null
  catatan?: string | null
  project_id?: string | null
  work_scope_id?: string | null
  created_at?: string | null
  proyek: { id: string; name: string } | null
  pembuat?: { id: string; name: string } | null
  penawaran_subkon?: Array<{ count: number }>
}

export interface ResponsTenderSubkon {
  tender: TenderSubkon[]
  total: number
}

/** Satu baris penawaran dalam perbandingan tender — bentuk dari
 * `susunTender()`, dipulangkan `GET /api/v1/tender-subkon/:id`. */
export interface PenawaranTenderBanding {
  id: string
  worker_id: string
  worker_name: string | null
  /** `null` bila `tidak_menawar` — BUKAN 0. */
  nilai: number | null
  waktu_kerja_hari: number | null
  status: "diajukan" | "menang" | "kalah" | "gugur"
  selisih_termurah_pct: number | null
  selisih_perkiraan_pct: number | null
  penilaian: "termurah" | "wajar" | "terlalu_rendah" | "terlalu_tinggi" | "tidak_menawar"
  menang: boolean
  catatan: string | null
}

export interface PerbandinganTender {
  penawaran: PenawaranTenderBanding[]
  nilai_termurah: number | null
  nilai_tertinggi: number | null
  rentang_pct: number | null
  jumlah_menawar: number
  jumlah_tidak_menawar: number
  jumlah_terlalu_rendah: number
  pemenang: PenawaranTenderBanding | null
  pemenang_bukan_termurah: boolean
  selisih_pemenang_termurah: number
}

export interface ResponsTenderDetail {
  tender: TenderSubkon & { lingkup_kerja: string | null }
  perbandingan: PerbandinganTender
  /** `null` = dibandingkan per-total saja, bukan "ada rincian tapi kosong". */
  perbandingan_item: unknown | null
}

/**
 * Register retensi subkontraktor per lingkup kerja. Bentuk dari
 * `GET /api/v1/mandor/retensi-register` (`apps/api/src/routes/v1/mandor.ts`,
 * dikonfirmasi Task 5 §Temuan angka L2643), dicocokkan ke
 * `(dashboard)/mandor/retensi/page.tsx`.
 *
 * ⚠️ List endpoint HANYA `authenticate` (tanpa gerbang permission granular
 * sama sekali — bukan `mandor:view`). Pencairan (`POST .../retensi-releases`)
 * butuh `mandor:kasbon:approve`, PM PUNYA (Task 5, modul `mandor`).
 *
 * `ditahan`/`dicairkan`/`outstanding` DIHITUNG server tiap request dari
 * `progress_payments` (status `approved` saja) dan
 * `subcontract_retention_releases` — bukan kolom tersimpan.
 */
export interface RetensiScope {
  work_scope_id: string
  scope_name: string | null
  status: string | null
  retensi_pct: number | string | null
  mandor: { id: string; name: string } | null
  project: { id: string; name: string } | null
  ditahan: number
  dicairkan: number
  outstanding: number
}

export interface ResponsRetensiRegister {
  scopes: RetensiScope[]
  total_ditahan: number
  total_dicairkan: number
  total_outstanding: number
}

/**
 * Potongan back-charge subkontraktor (tabel `back_charge`). Bentuk dari
 * `GET /api/v1/back-charge` (`apps/api/src/routes/v1/back-charge.ts`,
 * dikonfirmasi Task 5).
 *
 * ⚠️ List butuh `mandor:view` (BUKAN `backcharge:view` — key itu tak ada di
 * katalog). PM PUNYA `mandor:view` + `backcharge:kelola` (ajukan), TAPI
 * TIDAK PUNYA `backcharge:setujui` — SoD eksplisit (komentar `back-charge.ts`
 * L27-31): "PM mengajukan dari lapangan, TIDAK menyetujui." Tombol putuskan
 * (setuju/batal) TIDAK BOLEH ADA di portal PM.
 *
 * `ringkasan` dihitung server (`ringkasBackCharge()`) — bentuknya longgar
 * (`Record<string, number>`) karena tak dipakai halaman ini (kartu per-baris
 * sudah cukup untuk versi mobile disederhanakan).
 */
export interface BackCharge {
  id: string
  nomor: string
  tanggal: string
  uraian: string
  kategori: string
  nilai: number | string
  status: "diajukan" | "disetujui" | "dibatalkan"
  bukti_url: string[]
  project_id?: string | null
  work_scope_id: string
  punch_item_id?: string | null
  diajukan_oleh?: string | null
  disetujui_oleh?: string | null
  disetujui_pada?: string | null
  alasan_batal?: string | null
  progress_payment_id?: string | null
  dipotong_pada?: string | null
  dibuat_pada?: string | null
  pengaju: { id: string; name: string } | null
  penyetuju: { id: string; name: string } | null
  scope: { id: string; scope_name: string } | null
}

export interface ResponsBackCharge {
  back_charge: BackCharge[]
  ringkasan: Record<string, number>
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
