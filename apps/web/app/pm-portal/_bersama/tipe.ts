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
 * ⚠️ KOREKSI (Task 12): kalimat di bawah semula menyatakan "tak ada
 * tabel/endpoint `contracts` terpisah di API" — itu tetap benar untuk
 * `projects.contract_value` (nilai kontrak yang BERLAKU, jalur uang: dibaca
 * 104 tempat — invoice/PPN/retensi/EVM/kurva S/dsb). TAPI ada ENTITAS KEDUA
 * yang ditemukan belakangan: tabel `kontrak` (migrasi 344,
 * `apps/api/src/routes/v1/kontrak.ts`) — dokumen kontrak induk+addendum
 * sebagai peristiwa tersendiri (apa yang DITANDATANGANI), DIBANDINGKAN
 * (bukan menimpa) terhadap `projects.contract_value`. Lihat `DokumenKontrak`
 * di bawah untuk entitas kedua itu.
 *
 * `KontrakRingkas` di sini TETAP BENAR untuk perannya sendiri (ringkasan
 * nilai proyek yang BERLAKU) — field kontrak (nilai, model, pajak, tanggal,
 * retensi, denda) tetap hidup sebagai KOLOM LANGSUNG di tabel `projects`
 * (lihat `ProyekPM` di atas), bukan entitas terpisah.
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
 * Kontrak sebagai DOKUMEN (induk/addendum) — tabel `kontrak`, migrasi 344.
 * Beda dari `KontrakRingkas`/`ProyekPM`: yang itu nilai BERLAKU di
 * `projects.contract_value` (jalur uang); ini nilai yang DITANDATANGANI,
 * dibandingkan terhadapnya. Bentuk dari `SELECT_KONTRAK`, `kontrak.ts`.
 */
export interface DokumenKontrak {
  id: string
  jenis: "induk" | "addendum"
  nomor: string
  judul: string
  tanggal_tanda_tangan: string
  tanggal_mulai: string | null
  tanggal_selesai: string | null
  nilai: number | string
  retensi_pct: number | string | null
  syarat_pembayaran: string | null
  lingkup: string | null
  status: "draf" | "berlaku" | "selesai" | "dibatalkan"
  alasan_batal: string | null
  file_url: string | null
  catatan: string | null
  project_id: string
  client_id: string | null
  kontrak_induk_id: string | null
  dibuat_pada: string
  proyek?: { id: string; name: string; contract_value: number | string } | null
  klien?: { id: string; company_name: string | null; contact_person: string | null } | null
  induk?: { id: string; nomor: string; judul: string } | null
}

/**
 * Bentuk `HasilNilai` — `hitungNilaiKontrak()`, `apps/api/src/lib/kontrak.ts:254-262`.
 * `nilai` dari `GET /api/v1/kontrak/proyek/:id`. Field PERSIS diverifikasi
 * ke kode: `awal` (BUKAN `induk`), `jumlahAddendum` disertakan (jumlah
 * baris addendum yang ikut dihitung, bukan nilainya).
 */
export interface NilaiKontrakBerjalan {
  /** Nilai kontrak INDUK yang berlaku — apa yang mula-mula ditandatangani. */
  awal: number
  /** Σ addendum berlaku. Bisa negatif (pengurangan lingkup). */
  addendum: number
  /** awal + addendum — nilai kontraktual berjalan. */
  berjalan: number
  jumlahAddendum: number
}

/**
 * Bentuk `HasilBanding` — `bandingkanNilai()`, `apps/api/src/lib/kontrak.ts:306-314`.
 * `banding` dari `GET /api/v1/kontrak/proyek/:id`. ⚠️ `cocok: true` berarti
 * SESUAI (bukan "perlu perhatian") — logika kebalikan dari nama yang
 * ditulis draf breakdown pertama (`perlu_perhatian`). Field asli:
 * `menurutKontrak`, `menurutProyek`, `selisih`, `cocok`, `sebab` — TIDAK
 * ada `keterangan`.
 */
export interface BandingNilaiKontrak {
  /** Nilai menurut dokumen kontrak. */
  menurutKontrak: number
  /** Nilai yang dipakai jalur uang (`projects.contract_value`). */
  menurutProyek: number
  selisih: number
  /** true = nilai dokumen cocok dengan nilai penagihan. false = ADA selisih yang perlu dilihat. */
  cocok: boolean
  sebab: string
}

export interface RespKontrakProyek {
  proyek: { id: string; name: string; contract_value: number | string } | null
  kontrak: DokumenKontrak[]
  nilai: NilaiKontrakBerjalan
  banding: BandingNilaiKontrak
  co_belum_addendum: number
}

/**
 * Polis asuransi + celah pertanggungan. Bentuk `PolisTerhitung`,
 * `apps/api/src/lib/register-asuransi.ts:73-100` — dibaca LANGSUNG dari
 * kode (bukan tebakan dari nama fungsi), dipanggil `asuransi.ts`.
 *
 * ⚠️ Field turunan bernama `status` (BUKAN `keadaan`) — dan field ini
 * MENIMPA kolom `status` mentah dari tabel `polis_asuransi` di objek yang
 * sama (lib membangun objek baru dari baris DB, kolom mentahnya tak ikut
 * terbawa ke tipe ini). `sisa_hari` (BUKAN `hari_tersisa`) — negatif
 * berarti sudah lewat, ditegaskan di komentar lib.
 */
export interface PolisAsuransi {
  id: string
  project_id: string
  project_name: string
  jenis: "car" | "tpl" | "jamsostek" | "car_tpl" | "lainnya"
  /** Nama jenis siap-tampil; dipakai bila `jenis === 'lainnya'`. */
  jenis_label: string
  nomor_polis: string
  penerbit: string
  nilai_pertanggungan: number | null
  periode_mulai: string
  periode_selesai: string
  /** Field TURUNAN (dihitung server) — bukan kolom mentah `status` dari DB. */
  status: "aktif" | "kadaluarsa" | "belum_berlaku" | "segera_berakhir" | "dibatalkan"
  /** Sisa hari sampai berakhir. Negatif = sudah lewat. */
  sisa_hari: number
  /** Hari masa proyek yang TIDAK tertanggung. null = tanggal proyek tak diketahui (BEDA dari 0). */
  celah_hari: number | null
  /** Polis mulai SESUDAH proyek jalan. */
  celah_awal: number
  /** Polis berakhir SEBELUM proyek usai. */
  celah_akhir: number
}

/** Bentuk `HasilRegister`, `apps/api/src/lib/register-asuransi.ts:102-118`. */
export interface RespAsuransi {
  polis: PolisAsuransi[]
  jumlah_aktif: number
  jumlah_kadaluarsa: number
  jumlah_segera_berakhir: number
  jumlah_belum_berlaku: number
  /** Polis yang meninggalkan hari proyek tanpa pertanggungan. */
  jumlah_ada_celah: number
  /** Proyek yang TIDAK punya satu polis pun — dinyatakan supaya "nol kadaluarsa" tak terbaca "semua aman". */
  proyek_tanpa_polis: Array<{ project_id: string; project_name: string }>
  total_nilai_pertanggungan: number
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
 * Tukang (tabel `workers`, registry global). Bentuk dari
 * `GET /api/v1/mandor/workers` (`apps/api/src/routes/v1/mandor.ts`,
 * dikonfirmasi Task 5), dicocokkan ke `(dashboard)/mandor/tukang/page.tsx`.
 *
 * ⚠️ List/tambah/riwayat TANPA gerbang permission (cuma `authenticate`).
 * PATCH/DELETE juga tanpa gerbang IZIN, tapi ada ownership check LITERAL
 * `user.role === 'mandor'` di `mandor.ts` (mandor cuma boleh ubah tukang
 * miliknya). **PM (`role !== 'mandor'`) TIDAK KENA check itu** — bisa
 * edit/hapus tukang siapa pun di tenant. Karena itu portal PM di sini
 * TIDAK menyembunyikan satu pun tombol CRUD.
 *
 * `mandor_terakhir`/`total_laporan` DIHITUNG server tiap request dari
 * `wage_items` — bukan kolom tersimpan.
 */
export interface Worker {
  id: string
  name: string
  phone: string | null
  notes: string | null
  tipe: "tukang" | "laden" | "kenek" | null
  skills: string[] | null
  is_active: boolean
  created_at: string | null
  mandor: { id: string; name: string } | null
  mandor_terakhir?: string | null
  total_laporan?: number
}

export interface ResponsWorker {
  workers: Worker[]
}

export const TIPE_WORKER_LABELS: Record<string, string> = {
  tukang: "Tukang", laden: "Laden", kenek: "Kenek",
}

/**
 * Mitra — satu identitas, dua bentuk (`orang`/`badan_usaha`). Bentuk dari
 * `GET /api/v1/mitra` (`apps/api/src/routes/v1/mitra.ts`).
 *
 * ⚠️ TIDAK ada field `status_kelayakan` enum — kelayakan DIHITUNG server
 * (`periksaKelayakan()` di `lib/gerbang-kelayakan.ts`) dari kombinasi
 * `daftar_hitam` + `aktif`, dipulangkan hanya di `GET /:id` (bukan di list).
 * Halaman list di sini menurunkan status yang sama di klien langsung dari
 * `daftar_hitam`/`aktif` — sama persis urutan prioritasnya (hitam menang
 * atas tak aktif) — supaya tak perlu N+1 fetch detail per baris.
 *
 * PM PUNYA `mitra:view` + `mitra:manage` (list, tambah, edit), TIDAK
 * PUNYA `mitra:daftar_hitam` (SoD eksplisit migrasi 462) — tombol
 * masuk/keluar daftar hitam TIDAK ADA di halaman PM.
 */
export interface Mitra {
  id: string
  bentuk: "orang" | "badan_usaha"
  nama: string
  npwp: string | null
  bentuk_badan: string | null
  telepon: string | null
  email: string | null
  alamat: string | null
  catatan: string | null
  daftar_hitam: boolean
  alasan_daftar_hitam: string | null
  daftar_hitam_sejak: string | null
  aktif: boolean
  created_at?: string | null
}

export interface RingkasanMitra {
  total: number
  orang: number
  badan_usaha: number
  daftar_hitam: number
}

export interface ResponsMitra {
  mitra: Mitra[]
  ringkasan: RingkasanMitra
}

/**
 * EOT (Extension of Time) — tabel `contract_eot` (migrasi 152). Bentuk dari
 * `GET /api/v1/projects/:id/eot` (`apps/api/src/routes/v1/rantai-kontrak.ts`),
 * kolom `select` eksplisit di route.
 */
export interface EotProyek {
  id: string;
  eot_number: string | null;
  days_requested: number;
  days_approved: number | null;
  reason: string;
  status: "diajukan" | "disetujui" | "ditolak";
  submitted_at: string;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

/**
 * Bentuk `HasilTanggalEfektif`, `apps/api/src/lib/rantai-kontrak.ts:53-62`
 * (`tanggalSelesaiEfektif()`). `meta` dari `GET .../eot`.
 */
export interface TanggalEfektifKontrak {
  /** Tanggal kontrak asli, tak pernah berubah. */
  tanggalAsli: string;
  /** Tanggal setelah seluruh EOT yang DISETUJUI. */
  tanggalEfektif: string;
  /** Total hari yang ditambahkan oleh EOT disetujui. */
  totalHariEOT: number;
  /** Berapa pengajuan yang masih menggantung — penting ditampilkan bersama LD. */
  eotMenggantung: number;
}

export interface RespEot {
  data: EotProyek[];
  meta: TanggalEfektifKontrak;
}

/**
 * Bentuk `HasilLD`, `apps/api/src/lib/rantai-kontrak.ts:161-178` (`hitungLD()`).
 * `data` dari `GET /api/v1/projects/:id/liquidated-damages` — endpoint
 * sesungguhnya memulangkan `HasilLDProyek` (superset dengan `otoritatif` +
 * `syarat`, `apps/api/src/utils/rantai-kontrak.ts:84-88`), tapi halaman ini
 * hanya memakai field dasar `HasilLD` sehingga tipe di sini cukup sebagai
 * subset yang aman.
 */
export interface HasilLD {
  /** `true` bila ada denda yang benar-benar terhitung. */
  adaDenda: boolean;
  hariTelat: number;
  dasarPerhitungan: number;
  dendaSebelumBatas: number;
  batasNominal: number;
  denda: number;
  /** `true` bila denda menyentuh batas — sinyal kontrak layak diputus. */
  kenaBatas: boolean;
  tanggal: TanggalEfektifKontrak;
  /** Kenapa dendanya nol / tak dihitung — supaya "0" tak ambigu. */
  alasan: string | null;
}

export interface RespLd {
  data: HasilLD;
  meta: { label: string; peringatan: string | null };
}

/**
 * Register jaminan — tabel `contract_bonds` (migrasi 152). Bentuk dari
 * `GET /api/v1/bonds` (`select` eksplisit route).
 */
export interface BondProyek {
  id: string;
  project_id: string | null;
  bid_id: string | null;
  bond_type: "penawaran" | "pelaksanaan" | "uang_muka" | "pemeliharaan";
  bond_number: string | null;
  issuer: string | null;
  amount: number | string;
  issued_date: string;
  expiry_date: string;
  status: "aktif" | "dikembalikan" | "dicairkan" | "kadaluarsa";
  released_at: string | null;
  notes: string | null;
}

/**
 * Bentuk `BarisBond` — bentuk INTERNAL lib (BUKAN kolom DB mentah), dipakai
 * `ringkasBond()`, `apps/api/src/lib/rantai-kontrak.ts:255-262`. Route
 * `GET /api/v1/bonds` (`rantai-kontrak.ts:252-286`) mem-map baris DB ke
 * bentuk ini (`untukLib = baris.map(...)`) SEBELUM memanggil `ringkasBond()`
 * — jadi field-nya beda nama dari `BondProyek`: `jenis` (bukan `bond_type`),
 * `nilai` (bukan `amount`), `tanggalTerbit`/`tanggalKadaluarsa` (bukan
 * `issued_date`/`expiry_date`). Objek di `RingkasBond.segeraKadaluarsa`/
 * `telatDiperbarui` di bawah berbentuk INI, bukan `BondProyek`.
 */
export interface BarisBondRingkas {
  id?: string;
  jenis: "penawaran" | "pelaksanaan" | "uang_muka" | "pemeliharaan";
  nilai: number;
  tanggalTerbit: string;
  tanggalKadaluarsa: string;
  status: "aktif" | "dikembalikan" | "dicairkan" | "kadaluarsa";
}

/** Bentuk `RingkasBond`, `apps/api/src/lib/rantai-kontrak.ts:264-271` (`ringkasBond()`). */
export interface RingkasBond {
  totalAktif: number;
  jumlahAktif: number;
  /** Jaminan yang kadaluarsa ≤ N hari — uang yang bisa hangus bila terlewat. */
  segeraKadaluarsa: Array<BarisBondRingkas & { sisaHari: number }>;
  /** Sudah lewat tanggal tapi statusnya masih 'aktif' — data yang perlu dirapikan. */
  telatDiperbarui: BarisBondRingkas[];
}

export interface RespBond {
  data: BondProyek[];
  meta: RingkasBond;
}

/**
 * Klaim kontraktual (tabel `contract_claims`, migrasi 184) — tuntutan biaya
 * kontraktor ke pemberi kerja. Bentuk dari `GET /api/v1/projects/:id/claims`
 * (`apps/api/src/routes/v1/rantai-kontrak.ts`): baris DB mentah (`select('*')`)
 * disebar bersama `batas_pemberitahuan` turunan.
 *
 * ⚠️ Nama "klaim" bentrok modul `klaim-perjalanan.ts` (penggantian biaya
 * karyawan, permission `klaim:*`) — ENTITAS LAIN SAMA SEKALI, di luar scope
 * halaman ini. Lihat `task-14-brief.md` untuk penjelasan lengkap.
 *
 * `PATCH /api/v1/claims/:id/decide` mewarisi tenancy lewat `project_id` di
 * BODY (bukan lewat id klaim sendiri) — pola sama `DokumenKontrak`/`Spk`.
 * `validasiKeputusanKlaim` (`lib/klaim-kontraktual.ts`) menolak (422) bila
 * status `disetujui` tapi `amount_approved !== amount_claimed` — nilai
 * berbeda WAJIB pakai `disetujui_sebagian`.
 */
export type KeadaanBatasPemberitahuan =
  | "tak_diatur" | "aman" | "berjalan" | "mendesak" | "terlambat" | "tak_terbaca"
export interface BatasPemberitahuan {
  keadaan: KeadaanBatasPemberitahuan
  sisaHari: number | null
  hariTerpakai: number | null
  pesan?: string
}

export interface KlaimKontraktual {
  id: string
  project_id: string
  claim_number: string
  claim_type: string
  title: string
  description: string | null
  event_date: string
  notified_at: string | null
  notice_days_limit: number | null
  amount_claimed: number | string
  amount_approved: number | string | null
  eot_id: string | null
  status: "draft" | "diberitahukan" | "diajukan" | "disetujui" | "disetujui_sebagian" | "ditolak" | "gugur"
  decision_note: string | null
  decided_at: string | null
  batas_pemberitahuan: BatasPemberitahuan
}
export interface RespKlaimKontraktual {
  data: KlaimKontraktual[]
  ringkas: { jumlah: number; total_diklaim: number; total_disetujui: number; berisiko_gugur: number; mendesak: number }
}

/**
 * Surat masuk/keluar (tabel `project_letters`, migrasi 185) — korespondensi
 * proyek, izin `documents:manage` (surat adalah korespondensi dokumen, bukan
 * permission tersendiri — lihat komentar `surat.ts`).
 *
 * Bentuk dari `GET /api/v1/letters` (LINTAS-PROYEK,
 * `apps/api/src/routes/v1/surat.ts`) — dipakai halaman ini sebagai default,
 * karena endpoint ini SENGAJA dirancang untuk pertanyaan "surat mana yang
 * wajib saya jawab hari ini" lintas semua proyek PM (beda dari pola
 * pemilih-proyek Task 12-13). `batas` (BUKAN `batas_pemberitahuan`) dihitung
 * `evaluasiBatasBalas()` (`lib/surat-korespondensi.ts`) — ARAH menentukan
 * tanggal acuan (kirim vs terima) dan siapa yang lalai (`siapaYangDitunggu`).
 *
 * `PATCH /api/v1/letters/:id` mewarisi tenancy lewat `project_id` di BODY,
 * pola sama klaim.
 */
export type KeadaanBalas = "tak_perlu" | "tak_diatur" | "berjalan" | "mendesak" | "lewat" | "tak_terbaca"
export interface BatasBalas {
  keadaan: KeadaanBalas
  sisaHari: number | null
  siapaYangDitunggu: "kita" | "lawan" | null
  pesan?: string
}

export interface SuratProyek {
  id: string
  project_id: string
  nomor: string
  arah: "masuk" | "keluar"
  jenis: string
  perihal: string
  ringkasan: string | null
  dari_pihak: string
  kepada_pihak: string
  tanggal_kirim: string | null
  tanggal_terima: string | null
  membalas_id: string | null
  butuh_balasan: boolean
  batas_balas: string | null
  status: "draft" | "terkirim" | "diterima" | "dibalas" | "selesai" | "kedaluwarsa"
  dokumen_id: string | null
  created_at: string
  batas: BatasBalas
  /** Hanya di `GET /api/v1/letters` (lintas-proyek) — ditempel server dari peta id→nama. */
  project_name?: string
}
export interface RespSuratLintasProyek {
  data: SuratProyek[]
  proyek: { id: string; name: string }[]
  ringkas: { jumlah: number; masuk: number; keluar: number; kita_belum_menjawab: number; lawan_belum_menjawab: number; mendesak: number }
}

/**
 * Baris katalog AHSP nasional. Bentuk PERSIS `GET /api/v1/cecep/assemblies`
 * (`apps/api/src/routes/v1/ahsp.ts:285-345`) — diverifikasi ULANG langsung
 * dari kode (bukan cuma dari brief) untuk Task 18. `edition`/`components`
 * BERSARANG dari PostgREST embed (`edition:ahsp_editions!…`,
 * `components:assembly_components(…, resource:resources(…))`).
 */
export interface AssemblyKatalog {
  id: string
  code: string
  name: string
  source: string
  version_number: number
  status: "draft" | "active" | "deprecated" | string
  waste_factor: number | string | null
  output_unit_code: string | null
  is_import_baseline: boolean
  edit_type: string | null
  edition: { code: string; name: string } | null
  components: Array<{
    coefficient: number | string
    sort_order: number | null
    resource: { code: string; name: string; category: string | null; unit_code: string | null } | null
  }>
}
export interface RespAssemblyKatalog {
  data: AssemblyKatalog[]
  total: number | null
  limit: number
}

/**
 * Baris price book. Bentuk PERSIS `GET /cecep/price-book`,
 * `price-book.ts:63-69` (diverifikasi ulang Task 18) — `resource`
 * BERSARANG dari PostgREST (`resource:resources(id, code, name, category,
 * unit_code)`), BUKAN field flat `resource_code`/`resource_name`. `supplier`
 * (BUKAN `source_note`) — field itu tak ada di endpoint ini sama sekali.
 * `status` di sini adalah status HARGA (draft→verified→active→expired),
 * BUKAN status assembly di atas — dua enum berbeda, jangan disatukan.
 */
export interface HargaSatuan {
  id: string
  amount: number | string
  currency: string
  version_number: number
  effective_date: string
  expired_date: string | null
  location: string | null
  supplier: string | null
  confidence_level: string | null
  status: "draft" | "verified" | "active" | "expired"
  verified_at: string | null
  created_at: string
  resource: { id: string; code: string; name: string; category: string | null; unit_code: string | null } | null
}
export interface RespHargaSatuan {
  data: HargaSatuan[]
  total: number | null
  limit: number
}

/**
 * Baris ringkasan Template WBS. Bentuk PERSIS `RingkasTemplate`,
 * `apps/api/src/lib/template-wbs.ts:203-211`, dikirim `GET /template-wbs`
 * (`template-wbs.ts:33-77`) — field TAMBAHAN dari route (bukan dari
 * `RingkasTemplate` lib) disertakan juga: `description`, `activated_at`,
 * `created_at`, dan `milik_bersama` (turunan `company_id === null` —
 * katalog `standard` lintas-tenant, tak bisa disunting tenant ini).
 * Diverifikasi ulang Task 18 langsung ke kode (baris `.select(...)` di
 * route dan `.map((t) => ({ ...t, milik_bersama: … }))`).
 *
 * Status BUKAN "draft"|"published"|"archived" — union ASLI dari
 * `lib/template-wbs.ts:36`: "draft"|"active"|"superseded". "active" berarti
 * SIAP DITERAPKAN ke proyek, "superseded" berarti sudah digantikan versi
 * lebih baru (draf tak bisa kembali jadi aktif — trigger DB menegakkan alur
 * maju saja).
 *
 * Permission list/detail: `cecep:cbs:view` (bukan `cecep:wbs:view` —
 * dikoreksi saat verifikasi ulang Task 18; nama permission tak dipakai di
 * kode klien manapun jadi tak mempengaruhi tipe/halaman, dicatat di sini
 * saja supaya tak menyesatkan pembaca berikutnya).
 */
export interface TemplateWbsRingkas {
  id: string
  code: string
  name: string
  description: string | null
  source: string
  version_number: number
  status: "draft" | "active" | "superseded"
  activated_at: string | null
  created_at: string
  jumlahNode: number
  milik_bersama: boolean
}
/** Bentuk PERSIS `reply.send({ template: [...] })`, `template-wbs.ts:52,67`
 * — kunci `template`, BUKAN `data`. Membaca `data?.data` pada respons asli
 * SELALU jadi `[]` — halaman akan SELALU menampilkan "Belum ada template"
 * walau datanya ada. */
export interface RespTemplateWbsList {
  template: TemplateWbsRingkas[]
}

/**
 * Satu baris RAB — bentuk PERSIS `GET /api/v1/estimate-versions`
 * (`apps/api/src/routes/v1/estimate-versions.ts:251-336`, diverifikasi ulang
 * Task 19 langsung ke kode, bukan cuma brief). `total_amount: null` = belum
 * dihitung, BEDA dari 0 rupiah (spec rombak §3c).
 *
 * ⚠️ `status` di sini HANYA `draft | under_review | approved` yang realistis
 * muncul dari endpoint ini — `frozen`/`superseded` termasuk union tapi jarang
 * relevan untuk dashbor PM. `rejected` SENGAJA TIDAK ADA (lihat komentar
 * `RespRabDetail` di bawah — itu bukan status yang pernah tersimpan).
 *
 * Saat `skenarioIdsTenant` kosong, endpoint memulangkan `{ data: [] }` TANPA
 * `meta` — karena itu `meta` di sini tak dibaca oleh halaman manapun,
 * hanya `data.data`.
 */
export interface BarisRabDaftar {
  id: string
  version_number: number
  status: "draft" | "under_review" | "approved" | "frozen" | "superseded" | string
  total_amount: number | null
  created_at: string
  scenario_id: string | null
  scenario_name: string | null
  project_id: string | null
  project_name: string | null
  edition_code: string | null
}
export interface RespRabDaftar {
  data: BarisRabDaftar[]
  meta?: { jumlah: number; batas: number; terpotong: boolean }
}

/** Item RAB dalam satu versi. Bentuk PERSIS `estimate-versions.ts:434-436`
 * (GET /estimate-versions/:id, `items:estimate_items(...)`) — `assembly` dan
 * `cost_code` BERSARANG dari PostgREST (FK many-to-one → objek, BUKAN array;
 * dikonfirmasi lewat pola sama di `AssemblyKatalog.edition`, Task 18). Item
 * lumpsum (`assembly: null`) memakai `notes` sebagai nama tampilnya.
 * `quantity`/`amount` numeric — datang sebagai STRING dari PostgREST di
 * endpoint ini (beda dari list yang sudah dikonversi server), jadi `fmtRupiah`
 * dan pembacanya wajib menoleransi keduanya. */
export interface ItemEstimasi {
  id: string
  quantity: number | string
  amount: number | string
  sort_order: number | null
  notes: string | null
  cost_code: { code: string; name: string } | null
  assembly: { id: string; code: string; name: string; output_unit_code: string | null; source: string; version_number: number } | null
}

/**
 * Detail satu versi RAB. Bentuk PERSIS `GET /estimate-versions/:id`
 * (`estimate-versions.ts:423-442`, `reply.send({ data: v })` — `v` adalah
 * baris Supabase MENTAH, bukan dipetakan ulang seperti daftar).
 *
 * ⚠️ **`status` TIDAK PERNAH `"rejected"`** — diverifikasi ulang Task 19 ke
 * TIGA sumber sekaligus: CHECK constraint (`110_cecep_estimate_chain.sql:72`,
 * `CHECK (status IN ('draft','under_review','approved','frozen',
 * 'superseded'))` — `rejected` tak ada di enumnya sama sekali), trigger
 * transisi (`111_cecep_estimate_approval.sql:57-62`, satu-satunya jalur
 * mundur adalah `under_review → draft`, dipetakan komentar kepala
 * `estimate-versions.ts:30-34` sebagai jalur *reject*), dan rute `PATCH
 * .../reject` sendiri (`estimate-versions.ts:1533-1534`,
 * `.update({ status: 'draft', ... })`).
 *
 * Draf awal task ini (breakdown plan) menulis union bertipe `"rejected"` di
 * sini — SALAH, dan diperbaiki di sini. Alasan yang benar-benar ditolak
 * hanya tersimpan di audit log (`newValues.reason`), TIDAK di kolom manapun
 * pada `estimate_versions` — jadi UI tak bisa menampilkan lencana "Ditolak"
 * yang bertahan; sesudah ditolak, versi kembali terlihat identik dengan versi
 * yang memang belum pernah diajukan (`draft`). Halaman detail menampilkan
 * pesan sekali-lihat (toast/banner sesaat) saat aksi tolak berhasil, bukan
 * badge permanen yang bergantung pada `status === 'rejected'` yang mustahil.
 */
export interface RespRabDetail {
  data: {
    id: string
    scenario_id: string
    version_number: number
    status: "draft" | "under_review" | "approved" | "frozen" | "superseded" | string
    total_amount: number | string | null
    approved_by: string | null
    approved_at: string | null
    frozen_at: string | null
    created_at: string
    edition: { code: string; name: string } | null
    items: ItemEstimasi[]
  }
}

/** Hasil pencarian analisa untuk picker tambah-item — subset field dari
 * `AssemblyKatalog` (Task 18), cukup untuk memilih + menghitung. */
export interface AssemblyRingkasPicker {
  id: string
  code: string
  name: string
  output_unit_code: string | null
}

/**
 * Cost code untuk picker item lumpsum. Bentuk PERSIS `GET /api/v1/cost-codes`
 * (`apps/api/src/routes/v1/cost-control.ts:209-227`), gerbang
 * `cecep:cost_code:view` — PM PUNYA (migrasi 102, `role.name IN
 * ('admin','pm')`). Endpoint SENGAJA menyertakan draft (komentar rute: "43
 * dari 44 cost code di dev masih draft, menyembunyikannya membuat halaman
 * pemetaan tampak kosong tanpa sebab") — picker di sini mengikuti alasan yang
 * sama, tidak menyaring `status`.
 *
 * Ditambahkan Task 19 untuk memperbaiki cacat yang DITANDAI EKSPLISIT di
 * breakdown plan: form lumpsum draf awal tidak mengirim `cost_code_id`, yang
 * backend WAJIBKAN untuk item lumpsum (`estimate-versions.ts:1120`,
 * `400 'cost_code_id wajib untuk item lumpsum'`).
 */
export interface CostCodeRingkas {
  id: string
  code: string
  name: string
  description: string | null
  category: string | null
  status: string
}
export interface RespCostCodeRingkas {
  data: CostCodeRingkas[]
}

/**
 * RAP (rencana anggaran pelaksanaan — pagu belanja internal). Bentuk PERSIS
 * `GET /api/v1/rap/:id`, `apps/api/src/routes/v1/rap.ts:213-236` (diverifikasi
 * langsung ke kode untuk Task 20, bukan cuma brief).
 *
 * RAB (estimate_*) = rencana JUAL ke klien (harga pasar). RAP = rencana
 * BELANJA internal (harga supplier + borongan mandor) — dua entitas terpisah,
 * selisihnya margin yang dikelola. `qty_ahsp` beku dari take-off RAB saat RAP
 * diturunkan; `qty_adjusted` bisa disunting HANYA saat `status !== 'locked'`
 * (ditegakkan backend, `rap.ts:246-250`) — sekali terkunci, TAK ADA jalur
 * buka kunci, hanya `change-log` beralasan wajib.
 */
export interface RapRingkas {
  id: string
  name: string
  status: "draft" | "locked" | string
  notes: string | null
  estimate_version_id: string
  locked_at: string | null
  created_at: string
}
/** Baris pagu material RAP. `resource_id` (rap.ts:215) ada di level atas,
 * bukan cuma di dalam `resource` bersarang — disertakan meski tak dipakai
 * halaman ini. */
export interface RapMaterialLine {
  id: string
  resource_id: string
  qty_ahsp: number
  qty_adjusted: number
  unit_code: string
  supplier_price: number
  supplier_id: string | null
  pagu: number
  notes: string | null
  resource: { code: string; name: string } | null
}
export interface RapLaborLine {
  id: string
  description: string
  borongan_value: number
  notes: string | null
  work_scope_id: string | null
}
export interface RespRapDetail {
  data: RapRingkas
  material: RapMaterialLine[]
  labor: RapLaborLine[]
  total: { material: number; labor: number; pagu: number }
}
export interface RapChangeLogEntry {
  id: string
  line_table: string
  line_id: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  reason: string
  changed_at: string
}

/**
 * Satu periode markup TERSIMPAN. Bentuk PERSIS konstanta `SELECT`,
 * `apps/api/src/routes/v1/markup.ts:34-38` — dibaca ULANG PENUH untuk Task 20
 * langsung ke kode (bukan hanya brief), sesudah draf pertama Task 17 salah
 * total (field `jenis`/`persentase`/`biaya_pokok` yang ditulis draf pertama
 * TIDAK ADA di respons ini). Empat fraksi TERPISAH (bukan satu `persentase`)
 * karena overhead, keuntungan, kontinjensi, dan BUK (biaya-umum-keuntungan,
 * dikirim ke `computeAhsp`) adalah empat keputusan bisnis berbeda yang bisa
 * disetujui terpisah. Read-only untuk PM (`cecep:markup:view` saja — PM TIDAK
 * punya `cecep:markup:manage`, diverifikasi ke `role_permissions` langsung:
 * hanya `admin`/`estimator`).
 */
export interface PeriodeMarkup {
  id: string
  /** `null` = berlaku UMUM (semua jenis pekerjaan yang tak punya baris sendiri). */
  jenis_pekerjaan: string | null
  berlaku_sejak: string
  overhead_fraksi: number | string | null
  keuntungan_fraksi: number | string | null
  kontinjensi_fraksi: number | string | null
  buk_fraksi: number | string | null
  alasan: string | null
  catatan: string | null
  ditetapkan_oleh: string | null
  created_at: string
}
/**
 * Markup yang SUDAH DIPILIH untuk satu tanggal — bentuk PERSIS `MarkupBerlaku`,
 * `apps/api/src/lib/markup.ts:39-50` (fungsi `pilihMarkup()`). Dinamai
 * `MarkupTerpilih` di sini (bukan `MarkupBerlaku`) hanya sebagai alias sisi
 * klien — field-nya identik. Angka SIAP PAKAI (bukan fraksi mentah), dan
 * `dari_umum` menandai baris umum dipakai karena jenis ini tak punya baris
 * sendiri.
 */
export interface MarkupTerpilih {
  periode_id: string
  jenis_pekerjaan: string | null
  berlaku_sejak: string
  overhead: number
  keuntungan: number
  kontinjensi: number
  buk: number
  dari_umum: boolean
}
/**
 * Bentuk PERSIS `GET /api/v1/markup`, `markup.ts:68-76` — daftar SELURUH
 * periode (`periode`), markup umum yang berlaku HARI INI (`berlaku`, bisa
 * `null` — "belum ditetapkan" harus tampak, bukan ditutupi 0%), dan markup
 * berlaku PER JENIS pekerjaan yang punya baris sendiri (`berlaku_per_jenis`).
 * Ini endpoint LIST — `GET /markup/berlaku` menjawab SATU objek untuk SATU
 * konteks tanggal+jenis (dipakai kalkulator penawaran), bukan daftar; tidak
 * dipakai halaman ini.
 */
export interface RespMarkupList {
  periode: PeriodeMarkup[]
  berlaku: MarkupTerpilih | null
  berlaku_per_jenis: Array<{ jenis_pekerjaan: string; markup: MarkupTerpilih | null }>
  pada: string
}

/**
 * Bentuk PERSIS `calculateEVM()`, `apps/api/src/lib/evm-calculation.ts`,
 * dipanggil `kurva-s.ts:483`. Diverifikasi ULANG Task 21 langsung ke kode
 * (`kurva-s.ts:1-517` dibaca penuh) — field brief Task 17 SUDAH cocok
 * persis, tidak ada koreksi.
 */
export interface TitikKurvaS {
  week: string
  weekNum: number
  date: string
  rencana: number | null
  serapan: number | null
  aktual: number | null
  progress: number | null
}
export interface MilestoneKurvaS {
  title: string | null
  date: string | null
  status: string | null
  weekIdx: number
  week: number
}
export interface RingkasEvm {
  bac: number
  bacSource: "rap_locked" | "rab" | "contract_value"
  paguRAP: number
  ac: number
  acSerapan: number
  ev: number
  pv: number
  sv: number
  cv: number
  cpi: number
  spi: number
  eac: number
  /** Estimate To Complete — sisa biaya sampai proyek selesai. */
  etc: number
  vac: number
  tcpi: number
  evPct: number
  pvPct: number
  acPct: number
}
export interface RespKurvaS {
  meta: {
    projectId: string
    startDate: string
    endDate: string
    contractValue: number
    totalWeeks: number
    hasRAB: boolean
    hasSchedule: boolean
    rencanaSource: "rab_schedule" | "gantt" | "normal_cdf"
    cakupanJadwalPct: number
    itemBerjadwal: number
    itemTotal: number
    totalRABValue: number
    latestActualPct: number
    latestSerapanPct: number
    latestRencanaPct: number
    deviasi: number
    evm: RingkasEvm
  }
  chartData: TitikKurvaS[]
  milestones: MilestoneKurvaS[]
}

/**
 * Change Order — bentuk PERSIS `CO_SELECT`, `apps/api/src/routes/v1/
 * change-orders.ts:11-40`, dibaca BARIS-PER-BARIS untuk Task 21 (brief
 * hanya menebak `type`/`value`/tiga status — SALAH TOTAL, dikoreksi di sini).
 *
 * ⚠️ Bentuk asli JAUH lebih kaya dari dugaan brief:
 *  - TIDAK ADA field `type`/`value`. CO tersusun dari `items` (tabel
 *    `change_order_items`) — tiap item punya `item_type` sendiri
 *    (`kerja_tambah|kerja_kurang|perubahan_volume|perubahan_spec`), dan
 *    `total_amount_delta` di level CO adalah Σ `amount_delta` semua item,
 *    DIHITUNG SERVER (`recalcTotalDelta()`) — bukan field yang diisi user.
 *  - Status HANYA 4: `draft|submitted|approved|rejected` (brief menebak
 *    3 tanpa `draft` eksplisit). CO **wajib** py minimal 1 item sebelum
 *    bisa `submit`.
 *  - `billing_mode` (`include_termin|separate_co|final_account`, nullable)
 *    MENENTUKAN apakah approve menaikkan `projects.contract_value` — HANYA
 *    `include_termin` yang menaikkan (`periksaPenyetujuanCo()`,
 *    `lib/penagihan-co.ts`). Approve DITOLAK (422) bila `billing_mode` null.
 *  - Approve BUKAN transisi satu langkah — lewat rantai approval berjenjang
 *    (`evaluateEntityApproval`/`canParticipateInChain`, `utils/approval.ts`),
 *    bisa multi-level; respons approve bisa `{ data: null, pending_next_level:
 *    true }` bila BUKAN langkah terakhir. Gerbang permission APPROVE/REJECT
 *    hanya `authenticate` (otoritas sesungguhnya dari config rantai, bukan
 *    `requirePermission` tetap) — sedangkan CREATE/PUT/DELETE/items pakai
 *    `projects:edit`, PM PUNYA (diverifikasi live 2026-08-21).
 */
export interface RabItemRefCo {
  id: string
  name: string
  category_code: string | null
  level: string
}
export interface ChangeOrderItem {
  id: string
  change_order_id?: string
  item_type: "kerja_tambah" | "kerja_kurang" | "perubahan_volume" | "perubahan_spec"
  rab_item_id: string | null
  description: string
  unit: string | null
  volume_delta: number | null
  unit_price: number | null
  amount_delta: number
  notes: string | null
  sort_order: number
  rab_item: RabItemRefCo | null
}
export interface ChangeOrderProyek {
  id: string
  project_id: string
  co_number: string
  title: string
  description: string | null
  status: "draft" | "submitted" | "approved" | "rejected"
  billing_mode: "include_termin" | "separate_co" | "final_account" | null
  total_amount_delta: number
  baseline_contract_value: number | null
  baseline_rab_total: number | null
  submitted_at: string | null
  submitted_by?: string | null
  approved_at: string | null
  approved_by?: string | null
  rejected_at: string | null
  rejected_by?: string | null
  rejected_reason: string | null
  created_by?: string | null
  created_at: string
  updated_at?: string
  creator: { id: string; name: string } | null
  approver: { id: string; name: string } | null
  rejecter: { id: string; name: string } | null
  items: ChangeOrderItem[]
}
export interface RespChangeOrder {
  data: ChangeOrderProyek[]
}
/** Respons approve saat BUKAN langkah terakhir rantai approval berjenjang. */
export interface RespApproveCo {
  data: ChangeOrderProyek | null
  pending_next_level?: boolean
  message?: string
}

/**
 * Proyeksi pencairan kas — bentuk PERSIS `GET /api/v1/estimate-versions/:id/
 * cashflow-forecast` (`estimate-versions.ts:208-227`) + `CashflowPeriod`,
 * `apps/api/src/lib/cashflow-forecast.ts:20-24`. Dibaca BARIS-PER-BARIS untuk
 * Task 21 — brief menebak `{ period: string; masuk; keluar; saldo }` per
 * PERIODE BERPASANGAN kas masuk/keluar; bentuk asli TOTAL BERBEDA: read-model
 * SATU ARAH (proyeksi pencairan/pengeluaran dari nilai estimasi, BUKAN kas
 * masuk vs keluar berpasangan — endpoint ini tak tahu apa-apa soal
 * penerimaan/termin masuk), didistribusikan dari `total_amount` versi
 * estimasi lewat kurva normal-CDF (pola sama kurva-S).
 *
 * Gerbang `cecep:estimate:view`, PM PUNYA (diverifikasi live 2026-08-21).
 */
export interface PeriodeCashflow {
  /** 1-based. */
  period: number
  /** Pencairan pada periode ini (bukan kumulatif). */
  disbursement: number
  /** Kumulatif s/d periode ini — berakhir PERSIS di `baseline_total`. */
  cumulative: number
}
export interface RespCashflowForecast {
  estimate_version_id: string
  status: string
  baseline_total: number
  periods: number
  forecast: PeriodeCashflow[]
}

/**
 * Varians per Cost Code — bentuk PERSIS `BarisVarians`,
 * `apps/api/src/lib/varians-cost-code.ts:20-39`, dipulangkan `GET /projects/
 * :projectId/varians` (`cost-control.ts:744-840`). Dibaca BARIS-PER-BARIS
 * untuk Task 21 — brief menebak `{ cost_code; nama; anggaran; komitmen;
 * aktual; varians }`; bentuk asli beda nama DAN makna field:
 *  - `code`/`name` (BUKAN `cost_code`/`nama`), `pagu` (BUKAN `anggaran`),
 *    `commitment` dilaporkan TOTAL PROYEK (bukan per-baris — jembatan
 *    material↔cost_code belum ada, lihat `meta.batas`), `exposure` = Σ
 *    commitment+actual, dan `variance` (BUKAN `varians`) — **`null` saat
 *    pagu tak diketahui, BUKAN 0** (RAP belum bisa memasok pagu per cost
 *    code — jembatan resource↔cost_code belum ada). Baris tanpa pemetaan
 *    kategori→cost code muncul sebagai `cost_code_id: null, code: '—'`,
 *    TIDAK dibuang.
 *  - Gerbang `cecep:cost_map:view` (BUKAN `cecep:cost_code:view` yang
 *    dipakai `CostCodeRingkas` di atas — dua permission berbeda), PM PUNYA
 *    (diverifikasi live 2026-08-21).
 */
export interface BarisVarians {
  cost_code_id: string | null
  code: string
  name: string
  status: string
  /** Pagu per cost code. 0 = benar-benar nol; lihat `variance` untuk "belum diketahui". */
  pagu: number
  /** SELALU sama untuk semua baris — commitment dilaporkan sebagai TOTAL PROYEK, lihat `meta`. */
  commitment: number
  actual: number
  exposure: number
  /** `pagu − exposure`. `null` saat pagu tak diketahui, BUKAN 0. */
  variance: number | null
  serapan_pct: number | null
  jumlah_kategori: number
}
export interface RespVarians {
  data: BarisVarians[]
  meta: {
    total_actual: number
    commitment_total: number
    exposure_total: number
    jumlah_po_mengikat: number
    kategori_total: number
    kategori_dipetakan: number
    actual_belum_dipetakan: number
    batas: { pagu_per_cost_code: string; commitment_per_cost_code: string }
  }
}

/**
 * Contingency — bentuk PERSIS `PosTerhitung`/`HasilContingency`,
 * `apps/api/src/lib/contingency.ts:68-109`, dipulangkan `GET /api/v1/
 * contingency?project_id=`. Dibaca BARIS-PER-BARIS untuk Task 21 — brief
 * menebak `{ project_id; pagu_awal; terpakai; sisa; penggunaan: [{ tanggal;
 * jumlah; alasan }] }` sebagai objek TUNGGAL per proyek; bentuk asli adalah
 * DAFTAR POS (satu proyek bisa punya BEBERAPA pos cadangan bernama, mis.
 * "Risiko cuaca", "Eskalasi harga material" — bukan satu angka gabungan),
 * dan field-nya beda nama total: `nilai` (BUKAN `pagu_awal`), status turunan
 * `aman|menipis|kritis|terlampaui|ditutup` (server MENGHITUNG status dari
 * ambang 60%/90%, bukan disimpan), `sisa` boleh NEGATIF (tak di-floor ke 0 —
 * "terlampaui" adalah keadaan nyata yang harus terlihat).
 *
 * Penggunaan (baris penarikan) BUKAN bagian objek pos — endpoint list
 * `GET /contingency` HANYA memulangkan ringkasan teragregasi per pos
 * (`jumlah_penarikan`, `penarikan_terakhir`), TIDAK daftar penggunaan
 * mentah per baris. Detail penggunaan (tanggal/alasan/CO sumber) hanya
 * tersedia lewat rakitan internal `hitungContingency()` — endpoint list
 * ini tidak mengembalikannya sebagai array terpisah, jadi halaman ini
 * hanya menampilkan ringkasan per pos (bukan riwayat penarikan baris-demi-
 * baris, yang butuh endpoint baru di luar scope Task 21).
 *
 * Gerbang: GET `projects:view`, POST pos & POST penarikan `projects:contract`
 * — PM PUNYA keduanya (diverifikasi live 2026-08-21).
 */
export type StatusContingency = "aman" | "menipis" | "kritis" | "terlampaui" | "ditutup"
export interface PosContingency {
  id: string
  project_id: string
  project_name: string
  nama: string
  nilai: number
  terpakai: number
  /** `nilai − terpakai`. NEGATIF bila terlampaui — tidak di-floor ke 0. */
  sisa: number
  terpakai_pct: number
  /** Porsi cadangan terhadap nilai kontrak (%). `null` = nilai kontrak tak diketahui — beda dari 0. */
  porsi_kontrak_pct: number | null
  status: StatusContingency
  jumlah_penarikan: number
  penarikan_terakhir: string | null
}
export interface RespContingency {
  pos: PosContingency[]
  total_cadangan: number
  total_terpakai: number
  /** `total_cadangan − total_terpakai`. Bisa negatif. */
  total_sisa: number
  jumlah_aman: number
  jumlah_menipis: number
  jumlah_kritis: number
  jumlah_terlampaui: number
  /** Proyek TANPA satu pun pos cadangan — dinyatakan, bukan hilang senyap. */
  proyek_tanpa_pos: Array<{ project_id: string; project_name: string }>
}
/** Bentuk `POST /api/v1/contingency` — `pos` (BUKAN `data`), hanya 3 field. */
export interface RespContingencyBuatPos {
  pos: { id: string; nama: string; nilai: number }
}
/** Change order yang layak jadi DASAR penarikan — `GET /contingency/co-sumber?project_id=`. */
export interface CoLayakSumber {
  id: string
  co_number: string
  status: string
  judul: string | null
  nilai: number | null
}
export interface RespCoSumberContingency {
  layak: CoLayakSumber[]
  tak_layak: number
  jumlah_co: number
}

/**
 * Procurement — Material Request, Purchase Order, Goods Receipt (Task 24).
 * Bentuk diverifikasi baris-per-baris ke `apps/api/src/routes/v1/procurement.ts`
 * (dibaca ULANG langsung dari kode untuk task ini, bukan disalin mentah dari
 * brief) — lihat komentar per-interface untuk baris rujukannya.
 */

/** Bentuk PERSIS `GET /api/v1/procurement/material-requests`, `procurement.ts:263-268`. */
export interface MrRingkas {
  id: string
  mr_number: string | null
  status: "draft" | "submitted" | "approved" | "rejected" | "partially_ordered" | "fully_ordered" | string
  request_date: string | null
  needed_date: string | null
  notes: string | null
  created_at: string
  project: { id: string; name: string } | null
  requested_by: { id: string; name: string } | null
  approved_by: { id: string; name: string } | null
  items: Array<{ id: string; qty_requested: number | string; qty_ordered: number | string | null; unit: string; material: { id: string; name: string; unit: string } | null }>
}
export interface RespMrDaftar { material_requests: MrRingkas[] }

/**
 * Bentuk PERSIS `GET /api/v1/procurement/material-requests/:id`,
 * `procurement.ts:293-297` — `select('*', ...)` jadi item TAMBAHAN
 * (`unit_price_est`, dst.) ikut lewat, tak semuanya dipakai di sini.
 */
export interface MrDetail extends MrRingkas {
  requested_by: { id: string; name: string; phone: string | null } | null
  items: Array<{
    id: string; qty_requested: number | string; qty_ordered: number | string | null
    unit: string; unit_price_est: number | string | null; notes: string | null
    material: { id: string; name: string; unit: string; unit_price: number | string | null } | null
  }>
}
export interface RespMrDetail { material_request: MrDetail }

/**
 * Bentuk PERSIS `GET /material-requests/:id/quota-check`, `procurement.ts:593-610`
 * — route memulangkan `{ mr_number, ...hasil, bisa_override }` dengan `hasil`
 * SPREAD LANGSUNG dari `periksaKuota()` (`lib/kuota-rab-material.ts:39-44,
 * 115-119`), tanpa transformasi. Field `pelanggaran` KOREKSI dari dugaan
 * sebelumnya (review Important-adjacent, 2026-08-21): bentuk asli
 * `BarisPelanggaran` (`kuota-rab-material.ts:24-37`) TIDAK punya field
 * `sisa` sama sekali — field aslinya `unit`, `rab_quantity`, `sudah_di_mr`,
 * `total`, `kelebihan`. Dugaan sebelumnya menulis `sisa: number` yang tak
 * pernah ada di backend, sehingga `p.sisa` di `mr/[id]/page.tsx` selalu
 * `undefined` di layar — diperbaiki bersamaan dengan render-nya.
 * `tanpa_kuota` juga DIKOREKSI: `string[]` (array id material MENTAH), BUKAN
 * array objek — dugaan sebelumnya menulis `Array<{material_id,
 * material_name?}>` yang tak cocok bentuk backend sama sekali.
 *
 * `bisa_override` HAMPIR SELALU `false` untuk PM — diverifikasi LIVE
 * 2026-08-21: PM tidak memegang `procurement:mr:override_quota` (query
 * `role_permissions` untuk role `pm`, nol baris). Ditampilkan tetap, bukan
 * disembunyikan: PM perlu tahu KENAPA tombol override tak muncul.
 */
export interface RespQuotaCheck {
  mr_number: string | null
  lolos: boolean
  pelanggaran: Array<{
    material_id: string
    material_name: string
    unit: string | null
    rab_quantity: number
    /** Sudah dipesan lewat MR lain yang masih hidup (draft tidak dihitung). */
    sudah_di_mr: number
    /** Diminta oleh MR yang sedang diperiksa (SETELAH dijumlahkan per material). */
    diminta: number
    /** sudah_di_mr + diminta. */
    total: number
    /** total − rab_quantity, selalu > 0 pada baris pelanggaran. */
    kelebihan: number
  }>
  /** Array id material MENTAH — material yang diminta tapi tak punya baris kuota RAB sama sekali. */
  tanpa_kuota: string[]
  bisa_override: boolean
}

/** Bentuk PERSIS `GET /api/v1/procurement/purchase-orders`, `procurement.ts:861-866`. */
export interface PoRingkas {
  id: string
  po_number: string | null
  status: "draft" | "sent" | "confirmed" | "cancelled" | string
  order_date: string | null
  expected_delivery_date: string | null
  total_amount: number | string | null
  payment_terms: string | null
  created_at: string
  project: { id: string; name: string } | null
  supplier: { id: string; name: string; phone: string | null } | null
  created_by: { id: string; name: string } | null
  items: Array<{ id: string; qty_ordered: number | string; qty_received: number | string | null; unit: string; unit_price: number | string; total_price: number | string; material: { id: string; name: string } | null }>
}
export interface RespPoDaftar { purchase_orders: PoRingkas[] }

/** Bentuk PERSIS `GET /purchase-orders/:id`, `procurement.ts:889-895`. */
export interface PoDetail extends Omit<PoRingkas, "supplier" | "project"> {
  project: { id: string; name: string; location: string | null } | null
  supplier: { id: string; name: string; phone: string | null; email: string | null; address: string | null; payment_terms: string | null } | null
  mr: { id: string; mr_number: string | null } | null
  items: Array<{ id: string; qty_ordered: number | string; qty_received: number | string | null; unit: string; unit_price: number | string; total_price: number | string; material: { id: string; name: string; unit: string } | null }>
}
export interface RespPoDetail { purchase_order: PoDetail }

/**
 * Bentuk PERSIS `GET /purchase-orders/:id/delivery-message`, `procurement.ts:409-420`.
 * `wa_url` NULL kalau nomor telepon supplier tak sah — UI WAJIB
 * menyembunyikan tombol kirim WA saat null, bukan memasang tautan ke nomor
 * ngawur (komentar backend eksplisit).
 */
export interface RespPesanPo {
  po_number: string | null
  pesan: string
  wa_url: string | null
  email_tujuan: string | null
  sudah_dikirim: { whatsapp_at: string | null; email_at: string | null }
}

/**
 * Bentuk PERSIS `GET /purchase-orders/:id/delivery-log`, `procurement.ts:496-501`
 * — kunci `data`, bukan `logs`.
 */
export interface RespDeliveryLog {
  data: Array<{ id: string; channel: "whatsapp" | "email" | "manual"; recipient: string | null; status: string | null; notes: string | null; sent_at: string; sender: { name: string } | null }>
}

/** Bentuk PERSIS `GET /api/v1/procurement/goods-receipts`, `procurement.ts:1143-1149`. */
export interface GrRingkas {
  id: string
  gr_number: string | null
  status: "draft" | "confirmed" | string
  receipt_date: string | null
  delivery_note_number: string | null
  delivery_note_url: string | null
  notes: string | null
  confirmed_at: string | null
  created_at: string
  project: { id: string; name: string } | null
  supplier: { id: string; name: string } | null
  po: { id: string; po_number: string | null } | null
  received_by: { id: string; name: string } | null
  items: Array<{ id: string; qty_received: number | string; unit: string; unit_price: number | string; material: { id: string; name: string } | null }>
}
export interface RespGrDaftar { goods_receipts: GrRingkas[] }

/**
 * Bentuk PERSIS `GET /api/v1/procurement/materials`, `procurement.ts:121` —
 * dipakai picker item MR/PO.
 */
export interface MaterialRingkas {
  id: string; code: string | null; name: string; unit: string
  unit_price: number | string | null; description: string | null; is_active: boolean
  category: { id: string; name: string } | null
}
export interface RespMaterialDaftar { materials: MaterialRingkas[] }

/** Bentuk PERSIS `GET /api/v1/procurement/suppliers`, `procurement.ts:181-185`. */
export interface SupplierRingkas {
  id: string; code: string | null; name: string
  contact_person: string | null; phone: string | null; email: string | null
  payment_terms: string | null; is_active: boolean
}
export interface RespSupplierDaftar { suppliers: SupplierRingkas[] }

/**
 * Bentuk PERSIS `GET /projects/:projectId/rab-materials`, `procurement.ts:538-548`
 * — dipakai memperingatkan kuota SEBELUM `submit` (bukan menggantikan
 * `quota-check`, keduanya dipakai: ini untuk MENYUSUN, `quota-check` untuk
 * MEMASTIKAN sebelum kirim). Tak dipakai di halaman Task 24 (dicadangkan
 * untuk halaman kuota RAB tersendiri, di luar scope), tapi tipe tetap
 * disiapkan sesuai brief karena bentuknya sudah diverifikasi ke kode.
 */
export interface KuotaRabMaterial {
  id: string; material_id: string; rab_quantity: number | string; rab_unit_cost: number | string | null
  notes: string | null
  material: { id: string; name: string; unit: string } | null
  terpakai: number; sisa: number; serapan_pct: number | null
}
export interface RespKuotaRab { data: KuotaRabMaterial[] }

/**
 * GUDANG & MATERIAL — Task 25. Bentuk PERSIS diverifikasi ke kode nyata
 * (bukan brief mentah): `gudang-ikhtisar.ts`, `gudang-kelola.ts`,
 * `transfer-stok.ts`, `procurement.ts` (stocks/movements/usage),
 * `rekonsiliasi-material.ts` + `lib/rekonsiliasi-material.ts`.
 */

/** Bentuk PERSIS `GET /api/v1/gudang/ikhtisar`, `gudang-ikhtisar.ts:190-265`. */
export interface RespGudangIkhtisar {
  kpi: {
    total_aset: number; di_gudang: number; di_lapangan: number; perlu_perhatian: number
    jenis_material_gudang: number; proyek_belum_ditarik: number
    nilai_perolehan: string; nilai_buku: string; akumulasi_susut: string
  }
  gudang: Array<{ id: string; kode: string; nama: string; alamat: string | null; jumlah_aset: number; jenis_material: number }>
  aset_per_kategori: Array<{ nama: string; jml: number }>
  aset_per_kondisi: Array<{ nama: string; jml: number }>
  isi_gudang: Array<{ id: string; kode: string; nama: string; kategori: string; kondisi: string; status: string; gudang: string | null }>
  pergerakan: Array<{
    id: string; jenis: string; tanggal: string | null; hari_lalu: number | null
    dari: string | null; ke: string | null
    kondisi_sebelum: string | null; kondisi_sesudah: string | null; memburuk: boolean
  }>
  material_gudang: Array<{ id: string; material_id: string; qty: string; asal: string | null }>
  belum_ditarik: Array<{ proyek: string; jenis: number; qty: string }>
}

/** Bentuk PERSIS `GET /api/v1/gudang`, `gudang-kelola.ts:37-75` — field
 * TAMBAHAN (`jenis_material`/`total_qty`) DIHITUNG SERVER dari
 * `gudang_stok`, bukan bagian kolom tabel `gudang` asli. */
export interface GudangLokasi {
  id: string; kode: string; nama: string; alamat: string | null; aktif: boolean
  catatan: string | null; penjaga_id: string | null; created_at: string
  penjaga: { id: string; name: string } | null
  jenis_material: number; total_qty: number
}
export interface RespGudangDaftar { gudang: GudangLokasi[] }

/**
 * Bentuk PERSIS `GET /api/v1/procurement/stocks`, `procurement.ts:1644-1661`.
 * ⚠️ Endpoint ini HANYA `authenticate` — tanpa `requirePermission` sama
 * sekali (dikonfirmasi baca kode, bukan diasumsikan dari brief).
 */
export interface StokRingkas {
  id: string; qty_on_hand: number | string; qty_reserved: number | string | null; last_updated_at: string | null
  project: { id: string; name: string } | null
  /*
    `min_stock` ditambahkan 2026-09-01 bersama rutenya.

    Nullable karena material lama bisa belum punya ambang — dan `0` BUKAN
    nilai jatuhan yang aman di sini: `qty <= 0` akan menandai setiap
    material berstok nol sebagai "di bawah ambang", termasuk yang memang
    tak pernah disetel ambangnya. Yang tak punya ambang tak boleh diberi
    peringatan sama sekali.
  */
  material: { id: string; name: string; unit: string; min_stock: number | string | null; category: { name: string } | null } | null
}
export interface RespStokDaftar { stocks: StokRingkas[] }

/** Bentuk PERSIS `GET /procurement/stocks/:project_id/movements`,
 * `procurement.ts:1664-1683`. Sama seperti di atas — hanya `authenticate`. */
export interface MutasiStok {
  id: string; movement_type: string; qty: number | string; qty_before: number | string; qty_after: number | string
  reference_type: string | null; reference_id: string | null; notes: string | null; created_at: string
  material: { id: string; name: string; unit: string } | null
  created_by: { id: string; name: string } | null
}
export interface RespMutasiDaftar { movements: MutasiStok[] }

/** Bentuk PERSIS `GET /api/v1/transfer-stok`, `transfer-stok.ts:62-89`. */
export interface TransferStok {
  id: string; qty: number | string; tanggal: string; alasan: string | null; created_at: string
  material: { id: string; name: string; unit: string } | null
  asal: { id: string; name: string } | null
  tujuan: { id: string; name: string } | null
  pembuat: { id: string; name: string } | null
}
export interface RespTransferDaftar { transfers: TransferStok[]; total: number }

/**
 * Bentuk PERSIS `GET /projects/:projectId/rekonsiliasi-material`,
 * `rekonsiliasi-material.ts` + `lib/rekonsiliasi-material.ts:120-204`.
 * `status` MENENTUKAN warna badge — LIMA status, bukan biner baik/buruk:
 * `belum_dibeli` BUKAN `wajar`, keduanya "tak ada masalah" secara visual
 * tapi beda makna (lihat komentar lib — baris RAB yang belum tersentuh vs
 * yang sudah diperiksa dan beres).
 */
export interface BarisRekonsiliasi {
  material_id: string; material_name: string; unit: string | null
  teoritis: number; dibeli: number; dipakai: number; sisa: number
  transfer_keluar: number; dari_klien: number; selisih: number
  susut_pct: number | null; lebih_beli: number
  status: "wajar" | "susut_tinggi" | "lebih_beli" | "belum_lengkap" | "belum_dibeli"
}
export interface RespRekonsiliasi {
  baris: BarisRekonsiliasi[]
  total_dibeli: number; total_dipakai: number; total_sisa: number; total_selisih: number
  total_transfer_keluar: number; total_dari_klien: number
  susut_pct_keseluruhan: number | null
  jumlah_susut_tinggi: number; jumlah_lebih_beli: number; jumlah_belum_lengkap: number; jumlah_belum_dibeli: number
  ambang: { susut_pct: number; lebih_beli_pct: number }
  gr_belum_dikonfirmasi: number
}

/**
 * Kepatuhan & Izin Kerja (Task 28). Bentuk diverifikasi baris-per-baris ke
 * `apps/api/src/lib/kepatuhan-k3.ts` (fungsi pure) DAN
 * `apps/api/src/routes/v1/kepatuhan-k3.ts` (route yang memanggilnya) —
 * bukan ditebak dari nama kolom tabel. Brief awal Task 28 menandai beberapa
 * field ini "verifikasi saat implementasi"; koreksi dari bacaan lib nyata
 * dicatat di tiap komentar di bawah (detail lengkap: task-28-report.md).
 */

/** Baris mentah tabel `dokumen_kepatuhan`, sebelum dinilai `nilaiKepatuhan()`. */
export interface DokumenKepatuhanRaw {
  id: string
  supplier_id: string | null
  pihak_nama: string | null
  jenis: string
  nomor: string | null
  penerbit: string | null
  berlaku_dari: string | null
  berlaku_sampai: string | null
  nilai_pertanggungan: number | string | null
  terverifikasi: boolean
  file_url: string | null
}

/**
 * Hasil `nilaiKepatuhan()` (`lib/kepatuhan-k3.ts:90-102`, tipe `HasilDokumen`).
 *
 * ⚠️ KOREKSI dari brief: union `status` PERSIS lima nilai (bukan `| string`
 * longgar) — `'berlaku' | 'segera_habis' | 'kedaluwarsa' | 'tanpa_masa' |
 * 'belum_diverifikasi'`. Brief menghilangkan `'tanpa_masa'` (dokumen tanpa
 * masa berlaku, mis. NPWP, yang SUDAH diverifikasi). Field `hijauTapiMati`
 * (dokumen `terverifikasi=true` TAPI sudah lewat tanggal — "centang hijau
 * atas dokumen yang tak berlaku") tidak ada sama sekali di brief, padahal
 * ini keadaan yang PALING ditekankan komentar lib (empat hal yang modul
 * menolak tampilkan sebagai kabar baik, poin 1).
 */
export interface DokumenDinilai extends DokumenKepatuhanRaw {
  status: "berlaku" | "segera_habis" | "kedaluwarsa" | "tanpa_masa" | "belum_diverifikasi"
  sisaHari: number | null
  hijauTapiMati: boolean
}

/**
 * Hasil `nilaiKepatuhan()` UTUH (`lib/kepatuhan-k3.ts:104-111`, tipe
 * `RingkasKepatuhan`) — dipulangkan APA ADANYA sebagai field `dokumen` di
 * `GET /api/v1/kepatuhan` (`kepatuhan-k3.ts:68-69,96`).
 *
 * ⚠️ KOREKSI dari brief: brief menulis `RingkasDokumen { dokumen: [...] }`
 * dengan komentar "ringkasan tambahan ikut sesuai bentuk asli, jangan
 * menebak nama field". Bentuk asli SUDAH dibaca — lib mengembalikan EMPAT
 * angka ringkasan bernama, bukan struktur longgar: `total`, `kedaluwarsa`,
 * `segeraHabis`, `belumDiverifikasi`, `hijauTapiMati`.
 */
export interface RingkasDokumen {
  dokumen: DokumenDinilai[]
  total: number
  kedaluwarsa: number
  segeraHabis: number
  belumDiverifikasi: number
  hijauTapiMati: number
}

export interface EvaluasiSubkonRaw {
  id: string
  project_id: string | null
  supplier_id: string | null
  pihak_nama: string | null
  periode: string
  skor_mutu: number | string
  skor_waktu: number | string
  skor_k3: number | string
  skor_kepatuhan: number | string
  skor_kerjasama: number | string
  jumlah_kecelakaan: number
  jumlah_pelanggaran_k3: number
  masuk_daftar_hitam: boolean
  alasan_daftar_hitam: string | null
  catatan: string | null
}

/**
 * Hasil `nilaiEvaluasiSubkon()` (`lib/kepatuhan-k3.ts:178-195`, tipe
 * `HasilEvaluasiSubkon`).
 *
 * ⚠️ KOREKSI dari brief: brief menebak "skor_gabungan / label dsb." sebagai
 * PLACEHOLDER eksplisit. Field asli sama sekali beda nama: `skor` (angka
 * berbobot 0-100, K3 25% + kepatuhan 20% seperti disebut brief, TAPI nama
 * fieldnya `skor` bukan `skor_gabungan`), `rataPolos` (rata-rata polos —
 * lib menyebut "dibawa hanya untuk dibandingkan, BUKAN dipakai" — jangan
 * jadikan angka utama di UI), `titikLemah: string[]` (label dimensi di
 * bawah ambang 60), `bolehDipakai: boolean` (false bila daftar hitam ATAU
 * ADA kecelakaan — kecelakaan MENGGUGURKAN skor, bukan mengurangi rata-rata),
 * `alasanTakBolehDipakai: string[]` (alasan siap-tampil, supaya UI tak perlu
 * menyimpulkan sendiri dari kombinasi field lain).
 */
export interface EvaluasiDinilai extends EvaluasiSubkonRaw {
  skor: number
  rataPolos: number
  titikLemah: string[]
  bolehDipakai: boolean
  alasanTakBolehDipakai: string[]
}

/**
 * Hasil `nilaiKesiapanPihak()` (`lib/kepatuhan-k3.ts:318-335`, tipe
 * `KesiapanPihak`) — dipulangkan APA ADANYA sebagai field `kesiapan` di
 * `GET /api/v1/kepatuhan` (`kepatuhan-k3.ts:75,98`), TANPA transformasi.
 *
 * ⚠️ KOREKSI PENTING dari brief: brief menulis field `pihak_nama` — field
 * SESUNGGUHNYA bernama `nama` (BUKAN `pihak_nama`). Salah salin nama ini di
 * frontend berarti kartu kesiapan tampil kosong untuk SETIAP pihak (field
 * `undefined`), cacat yang brief sendiri peringatkan lewat pola "Task 24
 * field bersarang harus diverifikasi, bukan ditebak". Field lain yang brief
 * tandai "verifikasi saat implementasi" juga hilang total dari draf brief:
 * `dokumenKedaluwarsa`, `dokumenSegeraHabis` (jumlah dokumen bermasalah
 * pihak ini), `skorTerakhir: number | null` (evaluasi TERBARU yang
 * menentukan, bukan rata-rata sepanjang masa — `null` bila belum pernah
 * dinilai, BUKAN 0), dan `alasan: string[]` (gabungan alasan dokumen +
 * evaluasi kenapa `bolehBekerja` false).
 *
 * Urutan array SUDAH ditentukan `nilaiKesiapanPihak()` sendiri (tak-boleh-
 * bekerja naik ke atas, lalu skor tertinggi lebih dulu) — JANGAN diurutkan
 * ulang di frontend, lihat komentar `kepatuhan-k3.ts:77-83` soal dua tempat
 * mengurutkan hal yang sama saling menimpa diam-diam.
 */
export interface KesiapanPihak {
  nama: string
  supplier_id: string | null
  dokumenKedaluwarsa: number
  dokumenSegeraHabis: number
  skorTerakhir: number | null
  bolehBekerja: boolean
  alasan: string[]
}

/** Bentuk PERSIS `GET /api/v1/kepatuhan`, `kepatuhan-k3.ts:94-99`. */
export interface RespKepatuhan {
  tanggal: string
  dokumen: RingkasDokumen
  evaluasi: EvaluasiDinilai[]
  kesiapan: KesiapanPihak[]
}

/** Baris mentah `izin_kerja`, dipilih `kepatuhan-k3.ts:111`. */
export interface IzinKerjaRaw {
  id: string
  project_id: string
  nomor: string
  jenis: string
  uraian_pekerjaan: string
  lokasi: string | null
  berlaku_dari: string
  berlaku_sampai: string
  pengendalian_risiko: string | null
  apd_wajib: string | null
  status: "draft" | "diajukan" | "disetujui" | "ditolak"
  diajukan_oleh: string | null
  diajukan_pada: string | null
  diputuskan_oleh: string | null
  diputuskan_pada: string | null
  alasan_tolak: string | null
}

/**
 * Hasil `nilaiIzinKerja()` (`lib/kepatuhan-k3.ts:282-314`, tipe `HasilIzin`).
 *
 * ⚠️ KOREKSI dari brief: `statusNyata` bukan sembarang string — union PERSIS
 * lima nilai: `'aktif' | 'belum_mulai' | 'kedaluwarsa' | 'menunggu' |
 * 'tak_berlaku'`. Brief hanya menyebut tiga (`menunggu | aktif |
 * kedaluwarsa`) dan melewatkan `'belum_mulai'` (disetujui, tapi jendelanya
 * belum mulai) dan `'tak_berlaku'` (ditolak/ditutup/draft). Field `sisaJam`
 * (BUKAN `sisaHari` — izin kerja dihitung per JAM, beda dari dokumen
 * kepatuhan yang per hari) juga tak disebut brief sama sekali.
 */
export interface IzinKerjaDinilai extends IzinKerjaRaw {
  statusNyata: "aktif" | "belum_mulai" | "kedaluwarsa" | "menunggu" | "tak_berlaku"
  sisaJam: number | null
  disetujuiTapiLewat: boolean
}

/** Bentuk hasil `nilaiIzinKerja()`, `GET /api/v1/kepatuhan/izin-kerja`. */
export interface RespIzinKerja {
  izin: IzinKerjaDinilai[]
}

/** Bentuk PERSIS `GET /api/v1/mutu/ikhtisar`, `mutu-ikhtisar.ts:143-192` —
 * dipakai kartu ringkas puncak halaman kepatuhan (Task 27 Temuan #5).
 * Diverifikasi ulang saat Task 28: cocok persis draf brief, tak ada koreksi. */
export interface RespIkhtisarMutu {
  ncr: {
    total: number; terbuka: number; berat: number
    daftar: Array<{ nomor: string; judul: string; severity: string; status: string; sisa_hari: number | null }>
  }
  inspeksi: { total: number; menunggu: number }
  punch: { total: number; terbuka: number }
  dokumen: {
    total: number; belum_terverifikasi: number; kedaluwarsa: number; segera_habis: number
    daftar: Array<{ pihak: string; jenis: string; sisa_hari: number | null }>
  }
  izin_kerja: { total: number; aktif: number; menunggu: number }
  k3: { kecelakaan: number; daftar_hitam: number; skor_k3_terendah: number | null }
}

/**
 * NCR (Non-Conformance Report) — tabel `ncr_items` (migrasi 189). Bentuk
 * PERSIS `NCR_SELECT`, `apps/api/src/routes/v1/ncr.ts:25-59` — dipakai
 * IDENTIK untuk list, detail (tak ada endpoint detail terpisah — lihat
 * `RespNcrDaftar` di bawah), create, update, disposisi, dan status. Satu
 * bentuk untuk semua operasi, diverifikasi baris-per-baris ke kode nyata
 * (Task 29), bukan disalin dari brief tanpa dicek.
 */
export interface NcrItem {
  id: string
  project_id: string
  nomor: string
  judul: string
  deskripsi: string | null
  lokasi: string | null
  acuan: string | null
  severity: "minor" | "major" | "kritis" | string
  status: "terbuka" | "disposisi" | "perbaikan" | "verifikasi" | "ditutup" | "dibatalkan" | string
  rab_item_id: string | null
  work_scope_id: string | null
  inspection_request_id: string | null
  dilaporkan_oleh: string | null
  ditugaskan_ke: string | null
  diverifikasi_oleh: string | null
  diverifikasi_pada: string | null
  disposisi: "perbaiki" | "terima" | "bongkar" | "ubah_spek" | null
  disposisi_oleh: string | null
  disposisi_pada: string | null
  disposisi_catatan: string | null
  tindakan_perbaikan: string | null
  akar_masalah: string | null
  biaya_dampak: number | string | null
  target_selesai: string | null
  ditutup_pada: string | null
  created_at: string
  updated_at: string
  pelapor: { id: string; name: string } | null
  petugas: { id: string; name: string } | null
  verifikator: { id: string; name: string } | null
  pemutus: { id: string; name: string } | null
  rab_item: { id: string; name: string; category_code: string | null; level: number | null } | null
  work_scope: { id: string; scope_name: string } | null
}

/**
 * Bentuk PERSIS `GET /api/v1/projects/:projectId/ncr`, `ncr.ts:233-249`.
 * Tak ada `GET /ncr/:id` berdiri sendiri (diverifikasi: hanya list, POST,
 * dan tiga PATCH terdaftar di `ncr.ts`) — halaman detail mencari `id` dari
 * hasil list ini, sama pola `SubmittalDetailInbox`/`KasbonDetailInbox` di
 * atas.
 */
export interface RespNcrDaftar {
  data: NcrItem[]
  meta: {
    per_status: Record<string, number>
    per_severity: Record<string, number>
    total: number
    belum_selesai: number
    kritis_terbuka: number
    biaya_dampak_total: number
    rekap_lengkap: boolean
  }
}

/**
 * Bentuk `RingkasanKandidat` + `jumlah_inspeksi`, `GET
 * /api/v1/projects/:projectId/ncr/kandidat` (`ncr.ts:128-183`, membungkus
 * `ringkasKandidatNcr()` di `apps/api/src/lib/inspeksi-ke-ncr.ts:177-195`).
 * Diverifikasi ke kode nyata (Task 29): fungsi lib memulangkan
 * `{ kandidat, sudah_ber_ncr, jumlah_diperiksa }`, dan rute menambah
 * `jumlah_inspeksi` di lapis atasnya — BUKAN field longgar seperti dugaan
 * awal brief.
 *
 * TIDAK DIPAKAI di Step 2/3 (lihat catatan lingkup di komponen) — alur
 * "usul dari inspeksi gagal" ditunda, tipe ini disediakan supaya
 * perluasannya tak perlu riset ulang.
 */
export interface UsulNcr {
  inspection_request_id: string
  nomor_inspeksi: string
  judul: string
  deskripsi: string
  lokasi: string | null
  rab_item_id: string | null
  work_scope_id: string | null
  /** SELALU null — severity tak boleh ditebak mesin (komentar lib). */
  severity: null
  diperiksa_pada: string | null
}
export interface RespKandidatNcr {
  kandidat: UsulNcr[]
  /** Sudah punya NCR — dihitung supaya daftarnya tak terlihat menyusut. */
  sudah_ber_ncr: number
  /** Berapa inspeksi yang diperiksa seluruhnya (penyebut BAGIAN dari kandidat). */
  jumlah_diperiksa: number
  /** Penyebut TOTAL — ditambahkan lapis rute, di luar `jumlah_diperiksa`. */
  jumlah_inspeksi: number
}

export interface RespNcrSatu { data: NcrItem }

/**
 * Rencana Mutu Proyek (RMP) + Inspection & Test Plan (ITP) — Task 30.
 * Bentuk diverifikasi baris-per-baris ke `apps/api/src/routes/v1/rencana-mutu.ts`
 * (`RMP_SELECT`/`ITP_SELECT`, handler GET satu-dokumen) DAN
 * `apps/api/src/lib/rencana-mutu.ts` (`ringkasItp`/`cacatRencanaMutu`/
 * `bolehDisetujui`) — bukan ditebak dari nama fungsi.
 *
 * ⚠️ KOREKSI dari brief: brief menulis `RingkasanItp` sebagai bentuk longgar
 * `{ total, lolos, gagal, belum, pct_lolos, pct_selesai, boleh_lanjut, [k:
 * string]: unknown }`. Bentuk ASLI `ringkasItp()` (`lib/rencana-mutu.ts:66-94,
 * 109-139`) juga membawa dua ARRAY OBJEK TitikItp: `menahan` (titik HOLD
 * yang belum lolos — INILAH yang menahan pekerjaan, `null` DAN `false`
 * sama-sama masuk sini) dan `menunggu_saksi` (titik WITNESS yang belum
 * lolos, wajib diberitahukan TAPI TIDAK menahan). Keduanya dipakai halaman
 * detail untuk menyebut SECARA EKSPLISIT titik mana yang menahan, bukan
 * cuma angka `ringkasan.gagal`.
 */
export interface RencanaMutu {
  id: string
  project_id: string
  nomor: string
  judul: string
  revisi: number
  status: "draf" | "diajukan" | "disetujui" | "kedaluwarsa" | string
  standar_acuan: string | null
  sasaran_mutu: string | null
  catatan: string | null
  penanggung_jawab: string | null
  disetujui_oleh: string | null
  disetujui_pada: string | null
  created_at: string
  updated_at: string
  pj: { id: string; name: string } | null
  penyetuju: { id: string; name: string } | null
}

/** Bentuk PERSIS `ITP_SELECT`, `rencana-mutu.ts:42-47`. */
export interface TitikItp {
  id: string
  rencana_mutu_id: string
  urutan: number
  kode: string | null
  tahap_pekerjaan: string
  uraian: string
  jenis_titik: "hold" | "witness" | "review"
  kriteria: string | null
  acuan: string | null
  metode_verifikasi: string | null
  pihak_verifikasi: string | null
  rab_item_id: string | null
  /** `null` = belum diperiksa — DIBEDAKAN dari `false` (ditolak). Jangan
   * dirender sebagai boolean langsung. */
  lolos: boolean | null
  diperiksa_oleh: string | null
  diperiksa_pada: string | null
  catatan_hasil: string | null
  pemeriksa: { id: string; name: string } | null
}

/**
 * Bentuk PERSIS `ringkasItp()`, `lib/rencana-mutu.ts:66-94`. `menahan`/
 * `menunggu_saksi` DIPULANGKAN sebagai array `TitikItp` (yang dilihat rute
 * `GET /rencana-mutu/:id` — bentuk ITP_SELECT tanpa `inspection_id`, field
 * itu opsional di lib dan tak pernah diisi rute), BUKAN cuma jumlah.
 */
export interface RingkasanItp {
  total: number
  lolos: number
  gagal: number
  belum: number
  /** Titik HOLD yang belum lolos (null ATAU false) — yang MENAHAN pekerjaan. */
  menahan: TitikItp[]
  /** Titik WITNESS yang belum lolos — wajib diberitahukan, TIDAK menahan. */
  menunggu_saksi: TitikItp[]
  pct_lolos: number | null
  pct_selesai: number
  /** `null` = ITP kosong (belum menyatakan apa pun) — BUKAN "boleh lanjut". */
  boleh_lanjut: boolean | null
}
export interface CacatRmp {
  kode: "tanpa-acuan" | "tanpa-sasaran" | "tanpa-titik" | "tanpa-hold" | "titik-tanpa-kriteria"
  pesan: string
  /** Titik yang bermasalah — hanya terisi untuk `titik-tanpa-kriteria`. */
  titik?: TitikItp[]
}
export interface RespRencanaMutuSatu {
  rencana: RencanaMutu
  titik: TitikItp[]
  ringkasan: RingkasanItp
  cacat: CacatRmp[]
  persetujuan: { boleh: boolean; penghalang: CacatRmp[] }
}
export interface RespRencanaMutuDaftar { rencana: RencanaMutu[] }

/**
 * Hasil Uji Material — Task 30. Bentuk diverifikasi baris-per-baris ke
 * `apps/api/src/routes/v1/mutu.ts` (`UJI_SELECT`, handler GET) DAN
 * `apps/api/src/lib/mutu-checklist.ts` (`nilaiUji`/`ringkasUji`).
 *
 * ⚠️ KOREKSI PENTING dari brief: brief menulis respons list sebagai
 * `{ data: UjiMaterial[], jumlah_uji, [k: string]: unknown }`. Bentuk ASLI
 * (`mutu.ts:212-218`) adalah `{ ...ringkasUji(baris), jumlah_uji }` — field
 * array bernama **`baris`**, BUKAN `data`, dan tiap elemennya bukan
 * `UjiMaterial` polos melainkan `HasilNilaiUji` (extends `UjiMaterial`
 * dengan `selisih`/`angka_memadai`/`bertentangan`/`perlu_kesimpulan` DAN
 * sudah diurutkan server: yang BERTENTANGAN naik ke atas dulu, lalu
 * tidak_memenuhi/perlu_uji_ulang/belum/memenuhi). `kesimpulan` juga BUKAN
 * teks bebas — union PERSIS tiga nilai (`memenuhi | tidak_memenuhi |
 * perlu_uji_ulang`), form create WAJIB dropdown tiga opsi ini, bukan input
 * teks (`lib/mutu-checklist.ts:99` `KesimpulanUji`; backend TIDAK
 * memvalidasi enum-nya di route, tapi field ini dipakai `nilaiUji()` untuk
 * menentukan `bertentangan` — nilai lain akan lolos simpan tapi tak pernah
 * ditandai bertentangan).
 */
export type KesimpulanUji = "memenuhi" | "tidak_memenuhi" | "perlu_uji_ulang"

/** Bentuk PERSIS `UJI_SELECT`, `mutu.ts:36-42` — baris MENTAH sebelum `nilaiUji()`. */
export interface UjiMaterial {
  id: string
  project_id: string
  nomor: string
  objek: string
  jenis_uji: string
  lembaga_uji: string | null
  nomor_sertifikat: string | null
  tanggal_uji: string
  /** `numeric` Postgres tiba sebagai string — dan bisa NaN (lib `angka()` menyaringnya). */
  nilai_hasil: number | string | null
  nilai_syarat: number | string | null
  satuan: string | null
  kesimpulan: KesimpulanUji | null
  catatan: string | null
  material_id: string | null
  ncr_id: string | null
  dicatat_oleh: string | null
  created_at: string
  material: { id: string; name: string; unit: string } | null
  ncr: { id: string; nomor: string; judul: string } | null
}

/**
 * Bentuk `nilaiUji()`, `lib/mutu-checklist.ts:115-130,155-178` — baris
 * SESUDAH dibandingkan dengan syaratnya. Ini yang SUNGGUH dipulangkan array
 * `baris` di `GET /projects/:id/uji-material`, bukan `UjiMaterial` polos.
 */
export interface HasilNilaiUji extends UjiMaterial {
  /** `nilai_hasil − nilai_syarat`. `null` bila salah satu tak terbaca. */
  selisih: number | null
  /** Apakah ANGKANYA memadai (`hasil >= syarat`). `null` bila tak bisa dibandingkan. */
  angka_memadai: boolean | null
  /** Angka dan kesimpulan manusia TIDAK SEJALAN — BUKAN berarti salah (uji
   * terbalik/toleransi/penilaian ahli semuanya sah), tapi selisih pendapat
   * yang layak ditanyakan. `perlu_uji_ulang` tak pernah ikut dihitung ini. */
  bertentangan: boolean
  /** Ada angka hasil tapi belum disimpulkan manusia. */
  perlu_kesimpulan: boolean
}

/** Bentuk PERSIS `GET /projects/:projectId/uji-material`, `mutu.ts:212-218`
 * (`{ ...ringkasUji(baris), jumlah_uji }`). */
export interface RespUjiMaterial {
  baris: HasilNilaiUji[]
  memenuhi: number
  tidak_memenuhi: number
  perlu_uji_ulang: number
  belum_disimpulkan: number
  /** Berapa baris yang angkanya tak sejalan dengan kesimpulan manusia. */
  bertentangan: number
  /** Penyebut TOTAL, ditambahkan lapis rute di luar `ringkasUji()`. */
  jumlah_uji: number
}

/**
 * Bentuk PERSIS `GET /api/v1/keuangan/ikhtisar`, `keuangan-ikhtisar.ts:296-313`.
 * SEMUA nominal string (`.toFixed(2)`), bukan number — jangan render langsung.
 * Diverifikasi Task 32 langsung ke kode (bukan disalin mentah dari brief).
 */
export interface RespKeuanganIkhtisar {
  kpi: {
    nilai_kontrak: string; tertagih: string; terbayar: string; piutang: string
    kasbon_beredar: string; invoice_lewat_tempo: number; proyek_aktif: number
  }
  bulanan: { bulan: string; tagih: string; bayar: string }[]
  komposisi_kasbon: { kunci: string; nama: string; nilai: string; jumlah: number }[]
  umur_piutang: { nama: string; nilai: string; jumlah: number }[]
  per_proyek: {
    id: string; nama: string; status: string
    kontrak: string; tertagih: string; terbayar: string; piutang: string
    pct_tertagih: number; progres: number
  }[]
  invoice_tertunggak: {
    id: string; nomor: string; proyek: string | null
    jatuh_tempo: string; hari_lewat: number; sisa: string
  }[]
}

/** Bentuk PERSIS baris `ar-aging`, `finance.ts:262-296`. Semua nominal NUMBER
 * (bukan string) — beda dari `RespKeuanganIkhtisar` di atas, endpoint berbeda. */
export interface BarisArAging {
  id: string
  invoice_number: string
  invoice_type: string
  issued_date: string
  due_date: string
  total_amount: number
  amount_due: number
  status: string
  days_past_due: number
  bucket: string
  project: { id: string; name: string } | null
  client: { id: string; name: string } | null
}
export interface RespArAging {
  as_of: string
  buckets: Record<string, unknown>
  total_outstanding: number
  invoice_count: number
  truncated: boolean
  rows: BarisArAging[]
}

/** Bentuk PERSIS baris `retention-register`, `finance.ts:345-376`. */
export interface BarisRetensi {
  project: { id: string; name: string; status: string; end_date: string | null }
  client: { id: string; name: string } | null
  retention_pct: number | null
  contract_retention_amount: number | null
  withheld: number
  released: number
  outstanding: number
  on_retention_termins: { id: string; label: string; amount: number; pct_of_contract: number; status: string; due_days: number | null }[]
  estimated_release_due: string | null
  is_due_estimate: boolean
}
export interface RespRetensi {
  as_of: string
  total_outstanding: number
  rows: BarisRetensi[]
}

/** Bentuk PERSIS baris `dp-register`, `finance.ts:419-432`. */
export interface BarisDp {
  project: { id: string; name: string; status: string; contract_value: number }
  client: { id: string; name: string } | null
  dp_billed: number
  dp_paid: number
  recouped: number
  remaining_to_recoup: number
}
export interface RespDp {
  total_remaining_to_recoup: number
  rows: BarisDp[]
}

/** Bentuk PERSIS `HasilIpc`, `lib/sertifikat-ipc.ts:74-96` — dihitung
 * ulang tiap baca, TIDAK disimpan (lihat komentar kepala `sertifikat-ipc.ts`). */
export interface HasilIpc {
  nilai_prestasi: number
  nilai_periode: number
  retensi: number
  potongan_dp: number
  potongan_lain: number
  nilai_bersih: number
  retensi_kumulatif_estimasi: number
  peringatan: Array<"periode_negatif" | "potongan_melebihi_hak" | "prestasi_penuh" | "tak_ada_yang_ditagih">
  layak_diajukan: boolean
}
/** Bentuk PERSIS `SELECT` sertifikat_ipc, `sertifikat-ipc.ts:52-58`. */
export interface SertifikatIpc {
  id: string
  nomor: string
  tanggal: string
  status: "draft" | "disetujui" | string
  progres_diakui_pct: number | string
  nilai_kontrak: number | string
  retensi_pct: number | string | null
  kumulatif_sebelumnya: number | string | null
  potongan_dp: number | string | null
  potongan_lain: number | string | null
  potongan_lain_alasan: string | null
  catatan: string | null
  disetujui_pada: string | null
  invoice_id: string | null
  created_at: string
  proyek: { id: string; name: string } | null
  termin: { id: string; termin_number: number; label: string; amount: number | string } | null
  penyetuju: { id: string; name: string } | null
  hitung: HasilIpc
}
export interface RespSertifikatDaftar { sertifikat: SertifikatIpc[]; total: number }

/**
 * Cash Management — Task 33. Bentuk diverifikasi baris-per-baris ke
 * `apps/api/src/routes/v1/cash.ts` (bukan disalin dari dugaan brief mentah):
 * `GET /cash/summary` (`cash.ts:801-852`), `GET /cash/accounts`
 * (`cash.ts:20-42`), `GET /cash/accounts/:id` (`cash.ts:45-106`),
 * `GET /cash/transfers` (`cash.ts:184-212`), `GET /cash/expenses`
 * (`cash.ts:386-409`), `GET /cash/categories` (`cash.ts:857-` dst).
 */

/** Bentuk PERSIS `GET /api/v1/cash/summary`, `cash.ts:841-851`. SEMUA number. */
export interface RespCashSummary {
  totalBalance: number
  mainBalance: number
  collectorBalance: number
  pettyBalance: number
  pendingTransferCount: number
  pendingTransferAmount: number
  pendingExpenseCount: number
  pendingExpenseAmount: number
  expensesThisMonth: number
}

/** Bentuk PERSIS `SELECT` akun kas, `cash.ts:27-31`. */
export interface CashAccount {
  id: string
  name: string
  type: "main" | "collector" | "petty_cash"
  balance: number | string
  currency: string
  notes: string | null
  is_active: boolean
  created_at: string
  owner: { id: string; name: string } | null
  projects: { id: string; name: string } | null
}
export interface RespCashAccounts { accounts: CashAccount[] }

/** Bentuk PERSIS `SELECT` transfer, `cash.ts:66-71`/`193-200`. */
export interface CashTransfer {
  id: string
  amount: number | string
  transfer_date: string
  status: "pending" | "confirmed" | "cancelled"
  ref_number: string | null
  notes: string | null
  proof_url: string | null
  confirmed_at?: string | null
  created_at: string
  from_account: { id: string; name: string; type: string }
  to_account: { id: string; name: string; type: string }
  creator: { id: string; name: string } | null
  confirmer?: { id: string; name: string } | null
}
export interface RespCashTransfers { transfers: CashTransfer[] }

/** Bentuk PERSIS `GET /cash/accounts/:id`, `cash.ts:101-105`. */
export interface RespCashAccountDetail {
  account: CashAccount
  transfers: CashTransfer[]
  expenses: { id: string; description: string; total_amount: number | string; expense_date: string; status: string; projects: { id: string; name: string } | null }[]
}

/** Bentuk PERSIS `SELECT` pengeluaran, `cash.ts:398-408`. */
export interface ProjectExpense {
  id: string
  description: string
  qty: number | string
  unit: string | null
  unit_price: number | string
  total_amount: number | string
  expense_date: string
  expense_source: "petty_cash" | "main_cash" | "personal"
  vendor_name: string | null
  receipt_url: string | null
  notes: string | null
  status: "submitted" | "approved" | "rejected"
  created_at: string
  projects: { id: string; name: string; location: string | null } | null
  category: { id: string; name: string; type: string } | null
  petty_cash: { id: string; name: string; type: string } | null
  main_cash: { id: string; name: string; type: string } | null
  submitter: { id: string; name: string } | null
  reviewer: { id: string; name: string } | null
}
export interface RespCashExpenses { expenses: ProjectExpense[] }

export interface KategoriPengeluaran { id: string; name: string; type: string; parent_id: string | null; sort_order: number }
export interface RespKategoriPengeluaran { categories: KategoriPengeluaran[]; source: "project" | "template" }

/**
 * General Ledger — Chart of Accounts, jurnal, buku besar, laporan. Task 34.
 * Bentuk DIVERIFIKASI baris-per-baris ke `apps/api/src/routes/v1/gl.ts` +
 * `apps/api/src/lib/laporan-keuangan.ts` (dibaca lengkap saat Task 34, bukan
 * hanya disalin dari brief).
 */

/** Bentuk PERSIS `SELECT` akun, `gl.ts:60-62`. */
export interface AkunGl {
  id: string
  code: string
  name: string
  type: "asset" | "liability" | "equity" | "revenue" | "expense"
  parent_id: string | null
  is_active: boolean
  description: string | null
}
export interface RespAkunGl { data: AkunGl[] }

/** Bentuk PERSIS kepala jurnal, `gl.ts:125`. */
export interface JurnalGl {
  id: string
  entry_number: string
  entry_date: string
  description: string
  source: string | null
  status: "draft" | "posted" | "void"
  posted_at: string | null
  notes: string | null
}
export interface RespJurnalDaftar { data: JurnalGl[] }

export interface BarisJurnalGl {
  id: string
  account_id: string
  debit: number | string
  credit: number | string
  project_id: string | null
  description: string | null
  line_order: number
  /**
   * NULLABLE — `gl.ts:157` (`GET /journal-entries/:id`) TIDAK menormalisasi
   * embed yang gagal resolve (`?? {}`), berbeda dari endpoint sibling
   * `/gl/ledger` (`gl.ts:358`) dan `/gl/trial-balance` (`gl.ts:426`) yang
   * eksplisit `(l.accounts ?? {})`. Pembacanya WAJIB pakai
   * `l.accounts?.code ?? "—"`, bukan akses langsung — akses tanpa guard akan
   * `TypeError` runtime kalau join akun gagal.
   */
  accounts: { code: string; name: string; type: string } | null
}
export interface RespJurnalDetail {
  data: JurnalGl & { ref_type?: string | null; ref_id?: string | null; lines: BarisJurnalGl[] }
}

/** Bentuk PERSIS baris buku besar, `gl.ts:347-372`. */
export interface BarisBukuBesar {
  entry_id: string
  entry_number: string
  entry_date: string
  description: string
  account_id: string
  code: string
  name: string
  debit: number
  credit: number
  project_id: string | null
}
export interface RespBukuBesar {
  data: BarisBukuBesar[]
  /**
   * ⚠️ TANPA flag `terpotong` — beda dari `/gl/laporan` di bawah. Batas 500
   * jurnal posted dibaca sekali panggil (`gl.ts:338`); kalau `jumlah_baris`
   * mendekati 500, TIDAK BISA dibedakan "memang cuma segitu" dari "terpotong
   * diam-diam". Keterbatasan backend, dicatat sebagai concern laporan
   * (task-34-report.md), bukan ditambal di klien.
   */
  meta: { total_debit: number; total_credit: number; selisih: number; jumlah_baris: number }
}

/**
 * Bentuk `GET /gl/trial-balance` — endpoint NYATA (`gl.ts:406-461`), tapi
 * TIDAK di-fetch halaman manapun di Task 34 (tab "Buku Besar" memakai
 * `/gl/ledger`, tab "Laporan" memakai `/gl/laporan` — keduanya sudah
 * mencakup kebutuhan saldo per akun). Dideklarasikan untuk KELENGKAPAN
 * referensi (endpoint-nya ada dan bisa dipakai task lanjutan), TAPI JANGAN
 * di-import di halaman manapun sampai benar-benar dipakai — import tanpa
 * pemakaian adalah dead code yang lolos `tsc` tapi ditandai linter.
 */
export interface BarisSaldoAkun { account_id: string; code: string; name: string; type: string; debit: number; credit: number; saldo: number }
export interface RespTrialBalance {
  data: BarisSaldoAkun[]
  meta: { total_debit: number; total_credit: number; selisih: number }
}

/** Bentuk PERSIS `lib/laporan-keuangan.ts:30-56`. */
export interface KelompokLaporanGl {
  label: string
  akun: { account_id: string; code: string; name: string; saldo: number }[]
  total: number
}
export interface NeracaGl {
  aset: KelompokLaporanGl
  liabilitas: KelompokLaporanGl
  ekuitas: KelompokLaporanGl
  labaBerjalan: number
  totalEkuitasDenganLaba: number
  selisih: number
  seimbang: boolean
}
export interface LabaRugiGl {
  pendapatan: KelompokLaporanGl
  beban: KelompokLaporanGl
  labaKotor: number
  labaBersih: number
  marginPct: number | null
}
export interface RespLaporanGl {
  periode: { dari: string | null; sampai: string | null }
  neraca: NeracaGl
  labaRugi: LabaRugiGl
  meta: { jumlah_akun: number; terpotong: boolean }
}

/**
 * Rekonsiliasi Bank (Task 35). Bentuk PERSIS `apps/api/src/lib/
 * rekonsiliasi-bank.ts:38-86` + rute `apps/api/src/routes/v1/
 * rekonsiliasi-bank.ts`, diverifikasi baris-per-baris — BUKAN Rekonsiliasi
 * Material (`BarisRekonsiliasi`/`RespRekonsiliasi` di atas, Task 25), yang
 * sudah punya halamannya sendiri di `gudang/rekonsiliasi/page.tsx` dan
 * TIDAK diduplikasi di sini.
 */
export interface BarisKoranRek {
  id: string; tanggal: string; keterangan: string
  debit: number | string; kredit: number | string
  sudah_cocok?: boolean
}
export interface TransaksiBukuRek {
  id: string; sumber: "payments" | "supplier_payments" | "cash_transfers"
  tanggal: string; nominal: number | string; keterangan: string
  sudah_cocok?: boolean
}
export interface UsulCocokRek {
  baris_id: string; sumber: TransaksiBukuRek["sumber"]; sumber_id: string
  keyakinan: "persis" | "dekat"; selisih_hari: number
}
export interface LaporanRekBank {
  saldo_bank: number; setoran_dalam_perjalanan: number; cek_beredar: number
  penyesuaian: number; saldo_buku_seharusnya: number; saldo_buku: number
  selisih: number; tuntas: boolean
  baris_belum_cocok: number; transaksi_belum_cocok: number
}

/**
 * `koran` di konteks DAFTAR (`GET /rekonsiliasi`) — dengan progres
 * pencocokan yang DIHITUNG lapis rute (`rekonsiliasi-bank.ts:92-108`).
 */
export interface KoranRekening {
  id: string; cash_account_id: string
  periode_dari: string; periode_sampai: string
  saldo_awal: number | string; saldo_akhir: number | string
  status: "terbuka" | "dikunci"
  dikunci_pada: string | null; nama_berkas: string | null; created_at: string
  nama_akun: string; jumlah_baris: number; jumlah_cocok: number; belum_cocok: number
}
export interface RespRekonsiliasiDaftar {
  koran: KoranRekening[]
  akun: { id: string; name: string; type: string; balance: number | string }[]
}

/**
 * `koran` di konteks DETAIL (`GET /rekonsiliasi/:id`) — BUKAN `KoranRekening`.
 * Endpoint detail (`rekonsiliasi-bank.ts:249-250`, `return { koran: { ...k,
 * nama_akun }, ... }`) menyebar baris `rekening_koran` MENTAH + `nama_akun`
 * SAJA — TIDAK menghitung `jumlah_baris`/`jumlah_cocok`/`belum_cocok` seperti
 * endpoint daftar. Menyamakan keduanya membuat kode baca field yang tak
 * pernah dikirim endpoint ini (`undefined` senyap, bukan galat).
 */
export interface KoranRekeningDetail {
  id: string; cash_account_id: string
  periode_dari: string; periode_sampai: string
  saldo_awal: number | string; saldo_akhir: number | string
  status: "terbuka" | "dikunci"
  dikunci_pada: string | null; nama_berkas: string | null; created_at: string
  nama_akun: string
}
export interface RespRekonsiliasiDetail {
  koran: KoranRekeningDetail
  baris: BarisKoranRek[]
  buku: TransaksiBukuRek[]
  pencocokan: { id: string; baris_id: string; sumber_tabel: string; sumber_id: string; jenis: string }[]
  penyesuaian: { id: string; jenis: string; keterangan: string; nominal: number | string }[]
  usul: UsulCocokRek[]
  laporan: LaporanRekBank
}

/**
 * Kontrak Payung / Expediting / Nota Kredit (Task 36). Bentuk PERSIS
 * `apps/api/src/lib/pengadaan-lanjutan.ts` + rute
 * `apps/api/src/routes/v1/pengadaan-lanjutan.ts`, diverifikasi baris-per-baris
 * (Task 31 Step 1, Temuan #1/#4) — SATU endpoint `GET /pengadaan-lanjutan`,
 * TIGA sub-modul (pola sama `kurva-s.ts`).
 *
 * ⚠️ PM boleh MEMBUAT kontrak payung/nota kredit dan mencatat expediting
 * (`procurement:po:manage`, PM punya) TAPI TIDAK BERWENANG memutuskan/
 * menerapkan nota kredit (`procurement:payment:manage`, PM TIDAK punya —
 * diverifikasi langsung ke `pengadaan-lanjutan.ts` baris 561/637). Tombol
 * putuskan/terapkan SENGAJA TIDAK ADA di halaman PM, bukan cuma disabled.
 */
export interface ItemPayungPM {
  id: string; uraian: string; satuan: string
  harga_satuan: number | string; kuota: number | string; terpakai?: number | string | null
  sisa: number; persenTerpakai: number; habis: boolean; hampirHabis: boolean; nilaiTerpakai: number
}
export type StatusPayungPM =
  | "aktif" | "kuota_habis" | "segera_berakhir" | "kedaluwarsa" | "belum_mulai" | "tak_aktif"
export interface HasilPayungPM {
  id: string; nomor: string; judul?: string | null; supplier_id?: string | null; pemasok_nama?: string | null
  berlaku_dari: string; berlaku_sampai: string; pagu_nilai?: number | string | null; status: string
  statusNyata: StatusPayungPM; sisaHari: number | null
  itemDinilai: ItemPayungPM[]; nilaiTerpakai: number; sisaPagu: number | null
  aktifTapiTakBisaDipakai: boolean
}
export interface RespKontrakPayungPM {
  kontrak: HasilPayungPM[]; aktif: number; kuotaHabis: number; segeraBerakhir: number
  aktifTapiTakBisaDipakai: number
}

export interface HasilExpeditingPM {
  id: string; po_id: string; po_number?: string | null; pemasok_nama?: string | null
  status: string; butuh_tanggal?: string | null; janji_vendor?: string | null
  perkiraan_tiba?: string | null; tiba_aktual?: string | null; lokasi_terkini?: string | null
  sebab_tertahan?: string | null
  telatHari: number | null; telatDariJanji: number | null; janjiSudahTelat: boolean
  kritis: boolean; sudahTiba: boolean
}
export interface RespExpeditingPM {
  kiriman: HasilExpeditingPM[]; telat: number; kritis: number; tertahan: number
  janjiSudahTelat: number; telatTerparah: number | null
}

export interface HasilNotaKreditPM {
  id: string; nomor: string; tanggal?: string | null; jenis: string; jumlah: number | string
  status: "draft" | "diajukan" | "disetujui" | "ditolak" | "diterapkan"
  supplier_id?: string | null; pemasok_nama?: string | null; supplier_invoice_id?: string | null
  diputuskan_pada?: string | null; diterapkan_pada?: string | null
  jumlahAngka: number; umurSetujuHari: number | null; menggantung: boolean
}
export interface RespNotaKreditPM {
  nota: HasilNotaKreditPM[]; totalDisetujui: number; totalDiterapkan: number
  nilaiMenggantung: number; menggantung: number
}

export interface RespPengadaanLanjutan {
  tanggal: string
  kontrakPayung: RespKontrakPayungPM
  expediting: RespExpeditingPM
  notaKredit: RespNotaKreditPM
}

// Dropdown pemilih supplier di form kontrak payung/nota kredit memakai
// `SupplierRingkas`/`RespSupplierDaftar` YANG SUDAH ADA di atas (Task 24,
// `GET /api/v1/procurement/suppliers`) — TIDAK diduplikasi di sini.

/**
 * SDM — Timesheet, Kompetensi & Rekrutmen, Cuti (Task 39, Tahap 7).
 *
 * ⚠️ Permission diverifikasi LANGSUNG ke DB (`role_permissions` tenant nyata,
 * bukan cuma katalog `permissions`): PM punya `sdm:timesheet:view` +
 * `sdm:timesheet:manage` (timesheet penuh), `sdm:sertifikat:view` TANPA
 * `:manage` (kompetensi READ-ONLY), `sdm:rekrutmen:view` TANPA `:manage`
 * (rekrutmen READ-ONLY), `sdm:cuti:view` + `sdm:cuti:manage` TANPA
 * `:approve`/`:hak` (cuti ajukan+batalkan SENDIRI, TANPA setujui/tolak
 * TANPA koreksi jatah). Tak ada permission `sdm:kinerja:view` terpisah —
 * tab Kinerja ikut terbuka lewat `sdm:sertifikat:view` karena satu endpoint
 * `GET /sdm/pegawai/:id/kompetensi` memulangkan ketiganya (sertifikat,
 * penilaian, kinerja) sekaligus.
 */

/** Bentuk PERSIS `GET /sdm/pegawai`, `PEGAWAI_SELECT`, `timesheet-staf.ts:30-34`. */
export interface PegawaiSdm {
  id: string
  user_id: string | null
  nomor_induk: string | null
  jabatan: string | null
  departemen: string | null
  tanggal_masuk: string | null
  tanggal_keluar: string | null
  jam_standar: number | string | null
  status_ptkp: string | null
  kategori_ter: string | null
  created_at: string
  orang: { id: string; name: string; email: string | null } | null
}
export interface RespDaftarPegawai { pegawai: PegawaiSdm[] }

/**
 * Bentuk pegawai SUBSET yang dipulangkan `GET /sdm/pegawai/:id/kompetensi`
 * (`kompetensi-sdm.ts:74`) dan `GET /sdm/pegawai/:id/cuti`
 * (`cuti-karyawan.ts:60`) — KEDUANYA `select('id, nomor_induk, jabatan,
 * orang:users ( id, name )')`, BUKAN `PEGAWAI_SELECT` penuh dipakai
 * `/timesheet`. Field lain (`user_id`, `departemen`, `jam_standar`, dst)
 * TAK ADA di respons ini — memakai `PegawaiSdm` penuh di sini akan
 * menyatakan field yang sebenarnya `undefined`.
 */
export interface PegawaiSdmRingkas {
  id: string
  nomor_induk: string | null
  jabatan: string | null
  orang: { id: string; name: string } | null
}

/** Bentuk PERSIS `BarisDinilai`, `lib/timesheet-staf.ts:44-54,67-81`. */
export type StatusTimesheetPM = "draf" | "diajukan" | "disetujui" | "ditolak"
export interface BarisTimesheetPM {
  id: string
  tanggal: string
  jam_kerja: number | string
  jam_lembur: number | string
  project_id: string | null
  kegiatan: string | null
  status: StatusTimesheetPM
  alasan_tolak: string | null
  jam_kerja_n: number
  jam_lembur_n: number
  total: number
  melebihi_standar: boolean
  di_bawah_standar: boolean
}
/** Bentuk PERSIS `RingkasanTimesheet`, `lib/timesheet-staf.ts:83-102`. */
export interface RingkasanTimesheetPM {
  baris: BarisTimesheetPM[]
  total_jam_kerja: number
  total_jam_lembur: number
  hari_terisi: number
  hari_kosong: string[]
  per_status: Record<StatusTimesheetPM, number>
  per_proyek: Array<{ project_id: string | null; jam: number; lembur: number }>
  perlu_ditanya: BarisTimesheetPM[]
}
export interface PenghalangAjukanPM {
  kode: "kosong" | "sudah-diajukan" | "ada-hari-kosong"
  pesan: string
  tanggal?: string[]
}
/** `GET /sdm/pegawai/:id/timesheet?bulan=YYYY-MM` — `pegawai` PENUH (`PEGAWAI_SELECT`). */
export interface RespTimesheetPegawai {
  pegawai: PegawaiSdm
  bulan: string
  rentang: { awal: string; akhir: string }
  ringkasan: RingkasanTimesheetPM
  pengajuan: { boleh: boolean; penghalang: PenghalangAjukanPM[]; peringatan: PenghalangAjukanPM[] }
}

/** Bentuk PERSIS `SertifikatDinilai`, `lib/kompetensi-sdm.ts:37-56,60-64`. */
export type StatusSertifikatPM = "berlaku" | "akan_habis" | "kedaluwarsa"
export interface SertifikatPM {
  id: string
  jenis: string
  nama: string
  nomor: string | null
  penerbit: string | null
  klasifikasi: string | null
  kualifikasi: string | null
  tanggal_terbit: string | null
  berlaku_sampai: string | null
  berjangka: boolean
  status: StatusSertifikatPM
  sisa_hari: number | null
}
export interface RingkasanSertifikatPM {
  baris: SertifikatPM[]
  berlaku: number
  akan_habis: number
  kedaluwarsa: number
  perlu_tindakan: SertifikatPM[]
}
/** Bentuk PERSIS `Penilaian`, `lib/kompetensi-sdm.ts:224-230`. */
export interface PenilaianKinerjaPM {
  id: string
  periode: string
  skala_maks: number | string
  skor: number | string | null
  status: "draf" | "final"
}
/** Bentuk PERSIS `RingkasanKinerja`, `lib/kompetensi-sdm.ts:243-250` — `persen` SUDAH dinormalkan 0-100. */
export interface RingkasanKinerjaPM {
  tren: Array<{ periode: string; persen: number | null; status: "draf" | "final" }>
  rata_final: number | null
  jumlah_final: number
  jumlah_draf: number
}
/** `GET /sdm/pegawai/:id/kompetensi?pada=&ambang=` — `pegawai` SUBSET (lihat `PegawaiSdmRingkas`). */
export interface RespKompetensiPegawai {
  pegawai: PegawaiSdmRingkas
  pada: string
  sertifikat: RingkasanSertifikatPM
  penilaian: PenilaianKinerjaPM[]
  kinerja: RingkasanKinerjaPM
}

/** Bentuk PERSIS `Lamaran`, `LAMARAN_SELECT`, `kompetensi-sdm.ts:47-50`. */
export type TahapLamaranPM = "masuk" | "seleksi_berkas" | "wawancara" | "tawaran" | "diterima" | "ditolak"
export interface LamaranKerjaPM {
  id: string
  nama: string
  email: string | null
  telepon: string | null
  posisi: string
  sumber: string | null
  tahap: TahapLamaranPM
  catatan_tahap: string | null
  path_cv: string | null
  catatan: string | null
  pegawai_id: string | null
  created_at: string
  updated_at: string
}
export interface RespDaftarLamaran { lamaran: LamaranKerjaPM[] }

/** Bentuk PERSIS `lib/cuti-karyawan.ts:38-40`. */
export type JenisCutiPM = "tahunan" | "sakit" | "melahirkan" | "penting" | "besar" | "tanpa_gaji"
export type StatusCutiPM = "diajukan" | "disetujui" | "ditolak" | "dibatalkan"
/** Bentuk PERSIS `BarisHak`, `lib/cuti-karyawan.ts:45-52`. */
export interface BarisHakPM {
  id: string
  tahun: number
  jumlah_hari: number | string
  alasan: string
  berlaku_sampai: string | null
}
/** Bentuk PERSIS `BarisAmbil`, `lib/cuti-karyawan.ts:54-64`. */
export interface BarisAmbilPM {
  id: string
  jenis: JenisCutiPM
  tanggal_mulai: string
  tanggal_selesai: string
  jumlah_hari: number | string
  status: StatusCutiPM
  alasan: string | null
  alasan_tolak: string | null
  hari_dilewati: string | null
}
/** Bentuk PERSIS `SaldoCuti`, `lib/cuti-karyawan.ts:158-166` — `sisa` BISA NEGATIF. */
export interface SaldoCutiPM { tahun: number; hak: number; terpakai: number; tertahan: number; sisa: number }
/** Bentuk PERSIS `PenghalangCuti`, `lib/cuti-karyawan.ts:212-217`. */
export interface PenghalangCutiPM {
  kode: "saldo-kurang" | "tumpang-tindih" | "nol-hari" | "rentang-terbalik"
  pesan: string
  bentrok?: BarisAmbilPM[]
}
/** `GET /sdm/pegawai/:id/cuti?tahun=YYYY` — `pegawai` SUBSET (lihat `PegawaiSdmRingkas`). */
export interface RespCutiPegawai {
  pegawai: PegawaiSdmRingkas
  tahun: number
  hak: BarisHakPM[]
  ambil: BarisAmbilPM[]
  saldo: SaldoCutiPM
}

/**
 * Aset & Alat — register, mutasi, sewa, operasional (Task 40, Tahap 7).
 *
 * Bentuk PERSIS `GET /assets`, `apps/api/src/routes/v1/assets.ts:74-181`
 * (turunan penyusutan `akumulasi_penyusutan`/`nilai_buku`/`sudah_disusutkan`
 * disatukan ke objek yang sama, bukan field terpisah — lihat baris 157-166
 * di route: `{ ...a, akumulasi_penyusutan, nilai_buku, sudah_disusutkan }`).
 */
export interface AsetPM {
  id: string
  asset_code: string
  name: string
  category: string
  ownership: "milik" | "sewa"
  brand: string | null
  model: string | null
  serial_number: string | null
  purchase_date: string | null
  purchase_price: number | null
  residual_value: number | null
  useful_life_months: number | null
  depreciation_method: string
  current_project_id: string | null
  status: string
  condition: string
  photo_url: string | null
  notes: string | null
  created_at: string
  akumulasi_penyusutan: number
  nilai_buku: number
  sudah_disusutkan: boolean
}
export interface RespDaftarAset {
  data: AsetPM[]
  meta: { total: number; milik: number; sewa: number; nilai_perolehan: number; nilai_buku: number; dipakai: number; perawatan: number }
}

/** Bentuk PERSIS `GET /assets/:id/movements`, `assets.ts:353-393`. */
export interface MutasiAsetPM {
  id: string
  from_project_id: string | null
  to_project_id: string | null
  movement_type: string
  moved_at: string
  condition_before: string | null
  condition_after: string | null
  return_expected_at: string | null
  returned_at: string | null
  notes: string | null
}
export interface RespMutasiAset {
  data: MutasiAsetPM[]
  meta: { utilisasi_12_bulan: { persentase: number | null; jamDipakai: number; jamTersedia: number } }
}

/** Bentuk PERSIS `GET /assets/:id/depreciation`, `assets.ts:397-460`. */
export interface LogPenyusutanPM {
  id: string
  period_year: number
  period_month: number
  depreciation_amount: number
  book_value_after: number
  depreciation_method: string
  project_id: string | null
  journal_entry_id: string | null
}
export interface RespPenyusutanAset {
  data: { tercatat: LogPenyusutanPM[]; proyeksi: Array<{ tahun: number; bulan: number; beban: number; akumulasi: number; nilaiBuku: number }> }
  meta: { dapat_disusutkan: boolean; alasan?: string; nilai_buku_kini?: number; beban_bulan_ini?: number; catatan?: string }
}

/** Bentuk PERSIS `GET /asset-rentals`, `assets.ts:539-577`. */
export interface SewaAsetPM {
  id: string
  asset_id: string | null
  item_name: string
  supplier_id: string | null
  project_id: string | null
  rate: number
  rate_unit: "hari" | "minggu" | "bulan"
  start_date: string
  end_date: string | null
  status: string
  notes: string | null
  created_at: string
  biaya_sampai_kini: number
}
export interface RespDaftarSewa {
  data: SewaAsetPM[]
  meta: { total: number; berjalan: number; biaya_berjalan: number; biaya_total: number }
}

/**
 * Bentuk PERSIS `lib/alat-operasional.ts:31-247` + response
 * `GET /alat-operasional` (`apps/api/src/routes/v1/alat-operasional.ts:45-188`).
 *
 * ⚠️ `penyusutan` di `AlatOpsPM` punya bentuk BEDA dari `LogPenyusutanPM` di
 * atas: field mentahnya `asset_id, periode, nilai, akumulasi,
 * journal_entry_id` (tabel `penyusutan_alat`, BUKAN `asset_depreciation_logs`
 * yang dipakai `GET /assets/:id/depreciation`) — dua tabel penyusutan
 * berbeda untuk dua modul berbeda (register aset vs operasional alat), server
 * TIDAK menyatukannya. Ditambah `jurnal_status`/`jurnal_nomor` turunan
 * (baris 179-183 route) dari `journal_entries` yang ditunjuk
 * `journal_entry_id`.
 */
export type StatusPerawatanPM = "aman" | "segera" | "jatuh_tempo" | "belum_ada_acuan"
export interface HasilJatuhTempoPM {
  status: StatusPerawatanPM
  sisaJam: number | null
  sisaHari: number | null
  pemicu: "jam" | "hari" | null
}
export interface JadwalPerawatanPM {
  id: string
  nama: string
  jenis: string | null
  setiap_jam: number | string | null
  setiap_hari: number | string | null
  jam_terakhir: number | string | null
  tanggal_terakhir: string | null
  aktif: boolean | null
  jatuhTempo: HasilJatuhTempoPM
}
export interface HasilBiayaAlatPM {
  total: number
  perJenis: Record<string, number>
  perJam: number | null
  bbmPerJam: number | null
}
export interface HasilKesehatanAlatPM {
  servisTerjadwal: number
  servisMendadak: number
  rasioMendadak: number | null
  preventifGagal: boolean
}
export interface RiwayatPerawatanPM {
  id: string
  tanggal: string
  biaya: number | string
  bengkel: string | null
  uraian: string | null
  tak_terjadwal: boolean | null
}
export interface PenyusutanAlatOpsPM {
  asset_id: string
  periode: string
  nilai: number | string
  akumulasi: number | string
  journal_entry_id: string | null
  jurnal_status: string | null
  jurnal_nomor: string | null
}
export interface AlatOpsPM extends AsetPM {
  meter: number | null
  jamOperasi: number
  hariDipakai: number
  perawatan: JadwalPerawatanPM[]
  palingMendesak: JadwalPerawatanPM | null
  biaya: HasilBiayaAlatPM
  kesehatan: HasilKesehatanAlatPM
  riwayat: RiwayatPerawatanPM[]
  penyusutan: PenyusutanAlatOpsPM[]
}
export interface RespAlatOperasional { alat: AlatOpsPM[]; total: number; tanggal: string }

/**
 * Register Risiko + Mitigasi + Perizinan Proyek (Task 41, Tahap 7).
 *
 * Bentuk PERSIS `lib/risiko-proyek.ts:61-114,226-241,275-375` dan endpoint
 * `routes/v1/risiko-proyek.ts` — dicek baris-per-baris terhadap kode nyata,
 * bukan ditebak dari nama (Task 38 Step 1).
 *
 * ⚠️ Modul `sengketa` (`GET/POST /proyek/:id/sengketa`, `PATCH
 * /sengketa/:id/tahap`) SENGAJA TIDAK punya tipe di sini dan TIDAK dibangun
 * halamannya di portal PM. Dikonfirmasi LANGSUNG lewat query live
 * `role_permissions`: KEDUA baris role `pm` (global + tenant) NOL baris untuk
 * `sengketa:view` maupun `sengketa:manage` — bukan `allowed=false`, baris
 * grant-nya memang tidak ada. PM genuinely tak punya izin modul ini sama
 * sekali; halaman yang menampilkannya akan selalu gagal dengan 403.
 */
export type KategoriRisikoPM =
  | "teknis" | "keuangan" | "jadwal" | "k3"
  | "lingkungan" | "hukum" | "pengadaan" | "eksternal"
export type StatusRisikoPM = "terpantau" | "terjadi" | "tertutup"
export type StrategiRisikoPM = "hindari" | "kurangi" | "alihkan" | "terima"
export type StatusTindakanPM = "rencana" | "berjalan" | "selesai" | "batal"
export type TingkatRisikoPM = "rendah" | "sedang" | "tinggi" | "ekstrem"

export interface TindakanMitigasiPM {
  id: string
  tindakan: string
  status: StatusTindakanPM
  tenggat: string | null
  selesai_pada: string | null
  penanggung_id: string | null
  penanggung?: { id: string; name: string } | null
}

export interface RisikoDinilaiPM {
  id: string
  kode: string | null
  judul: string
  kategori: KategoriRisikoPM
  dampak: number
  kemungkinan: number
  /** Kolom TERHITUNG di DB (`dampak * kemungkinan`). */
  skor: number
  strategi: StrategiRisikoPM
  dampak_sisa: number | null
  kemungkinan_sisa: number | null
  status: StatusRisikoPM
  tenggat_tinjau: string | null
  pemilik_id: string | null
  pemilik?: { id: string; name: string } | null
  tindakan: TindakanMitigasiPM[]
  tingkat: TingkatRisikoPM
  /** Skor sesudah mitigasi. `null` bila belum dinilai ulang. */
  skor_sisa: number | null
  tingkat_sisa: TingkatRisikoPM | null
  /** Berapa turun berkat mitigasi. `null` (BUKAN 0) bila belum dinilai ulang. */
  penurunan: number | null
  mendesak: boolean
  alasan_mendesak: string[]
}

export interface RingkasRegisterPM {
  total: number
  terpantau: number
  terjadi: number
  tertutup: number
  /** Hanya yang BELUM tertutup. */
  per_tingkat: Record<TingkatRisikoPM, number>
  mendesak: number
  /** `null` bila belum ada satu pun yang dinilai ulang — bukan 0. */
  penurunan_rata: number | null
  dinilai_ulang: number
}

export interface RespRisikoProyek {
  proyek: { id: string; name: string; end_date: string | null }
  pada: string
  risiko: RisikoDinilaiPM[]
  ringkas: RingkasRegisterPM
}

export type StatusIzinProyekPM = "rencana" | "diajukan" | "terbit" | "ditolak" | "dicabut"
export type StatusMasaIzinPM =
  | "belum_terbit" | "berlaku" | "akan_habis" | "kedaluwarsa" | "ditolak" | "dicabut"

export interface IzinDinilaiPM {
  id: string
  jenis: string
  nomor: string | null
  status: StatusIzinProyekPM
  berlaku_dari: string | null
  berlaku_sampai: string | null
  /** Izin yang tanpanya pekerjaan tak boleh dimulai (PBG, bukan izin reklame). */
  menghalangi_mulai: boolean
  masa: StatusMasaIzinPM
  /** Negatif = sudah lewat. `null` bila tanpa batas waktu / belum terbit. */
  sisa_hari: number | null
  memblokir: boolean
}

export interface KesiapanIzinPM {
  /** `null` berarti NOL izin tercatat — BUKAN "boleh jalan". */
  boleh_jalan: boolean | null
  memblokir: IzinDinilaiPM[]
  perlu_diurus: IzinDinilaiPM[]
  total: number
}

export interface RespIzinProyek {
  proyek: { id: string; name: string; start_date: string | null; end_date: string | null; status: string }
  pada: string
  izin: IzinDinilaiPM[]
  kesiapan: KesiapanIzinPM
}

/**
 * Klien (Task 41, Tahap 7) — bentuk PERSIS `CLIENT_SELECT`,
 * `apps/api/src/routes/v1/clients.ts:5-8`.
 *
 * ⚠️ `GET /clients` dan `GET /clients/:id` HANYA bergerbang `authenticate`
 * (nol `requirePermission`) — dikonfirmasi baca langsung kode route. PM PUNYA
 * `clients:view` (query live `role_permissions`) tapi TIDAK `clients:manage`
 * (POST/PATCH/toggle-active, ketiganya bergerbang `clients:manage`) — halaman
 * PM di sini karena itu READ-ONLY, tanpa tombol tambah/edit/nonaktifkan.
 */
export interface KlienPM {
  id: string
  company_name: string | null
  contact_person: string
  phone: string
  email: string | null
  address: string | null
  npwp: string | null
  id_number: string | null
  client_type: "perorangan" | "perusahaan"
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface RespDaftarKlien { clients: KlienPM[] }

/** Proyek ringkas milik satu klien — subset kolom `projects`, `clients.ts:50`. */
export interface ProyekKlienPM {
  id: string
  name: string
  status: string
  contract_value: number | string | null
  start_date: string | null
  end_date: string | null
  progress_pct: number | null
}

export interface RespDetailKlien {
  client: KlienPM
  projects: ProyekKlienPM[]
  summary: {
    total_projects: number
    total_contract_value: number
    invoice_total: number
    invoice_outstanding: number
    invoice_overdue: number
    invoice_paid: number
  }
}

/**
 * Kendali Dokumen — transmittal, register gambar, notulen rapat, distribusi,
 * tanda tangan elektronik. Bentuk PERSIS `apps/api/src/lib/kendali-dokumen.ts:42-284`
 * dan `apps/api/src/routes/v1/kendali-dokumen.ts` (Task 42, Tahap 7).
 *
 * ⚠️ Modul TERPISAH dari `DokumenProyek`/`pm-portal/dokumen/page.tsx` (Register
 * Dokumen, `dk-register`) yang sudah ada sebelumnya — itu hanya memanggil
 * `GET /projects/:id/documents`, sama sekali tak menyentuh `kendali-dokumen.ts`.
 *
 * ⚠️ KETERBATASAN BACKEND (ditemukan review 2026-08-21, bukan cacat tipe ini):
 * `tindakan` dan `tandaTangan` di `RespKendaliDokumen` TIDAK disaring
 * `project_id` di endpoint — keduanya selalu berisi data SELURUH tenant, tak
 * peduli `project_id` mana yang dipilih di query. `notulen_tindakan` tak
 * punya kolom `project_id` sendiri (relasinya lewat `notulen_id`, joinnya tak
 * dilakukan di endpoint), dan `tanda_tangan_elektronik` sama sekali tak
 * disaring. Field `project_id` tak dikirim di kedua bentuk baris ini, jadi
 * tak bisa disaring ulang di klien. Dicatat sebagai utang Task 45.
 */
export interface HasilGambarPM {
  id: string
  nomor: string
  judul: string | null
  revisi: number | string
  status: string
  disiplin: string | null
  tahap: string | null
  digantikan_oleh: string | null
  tanggal_terbit: string | null
  revisiTertinggi: number
  usang: boolean
}
export interface RingkasGambarPM {
  gambar: HasilGambarPM[]
  total: number
  jumlahJudul: number
  usang: number
  gantungTanpaPengganti: number
}
export interface HasilTransmittalPM {
  id: string
  nomor: string
  status: string
  dikirim_pada: string | null
  diterima_pada: string | null
  diterima_oleh?: string | null
  tujuan_nama?: string
  tujuan_organisasi?: string | null
  perihal?: string
  umurHari: number | null
  menggantung: boolean
}
export interface RingkasTransmittalPM {
  transmittal: HasilTransmittalPM[]
  terkirim: number
  diterima: number
  menggantung: number
  rasioDiterima: number | null
}
export interface NotulenRapatPM {
  id: string
  project_id: string | null
  nomor: string
  judul: string
  tanggal: string
  jenis: string
  status: string
  tempat: string | null
  disahkan_pada: string | null
}
/** ⚠️ TIDAK ADA `project_id` di bentuk ini — lihat catatan keterbatasan di atas. */
export interface HasilTindakanPM {
  id: string
  notulen_id?: string
  uraian: string | null
  status: string
  tenggat: string | null
  selesai_pada: string | null
  pj_nama: string | null
  sisaHari: number | null
  lewatTenggat: boolean
}
export interface RingkasTindakanPM {
  tindakan: HasilTindakanPM[]
  terbuka: number
  selesai: number
  lewatTenggat: number
  tanpaTenggat: number
  persenSelesai: number | null
}
export interface MatriksDistribusiPM {
  id: string
  project_id: string | null
  jenis_dokumen: string
  penerima_nama: string
  penerima_email: string | null
  organisasi: string | null
  peran: string | null
  aktif: boolean
}
export interface HasilJadwalLaporanPM {
  id: string
  nama: string
  irama: string
  hari_ke: number | string | null
  aktif: boolean
  terakhir_dikirim: string | null
  gagal_berturut: number | string | null
  umurKirimHari: number | null
  macet: boolean
}
/** ⚠️ TIDAK ADA `project_id` di bentuk ini — lihat catatan keterbatasan di atas. */
export interface TandaTanganPM {
  id: string
  jenis_objek: string
  objek_id: string
  penanda_tangan: string
  peran_penanda: string | null
  ditandatangani_pada: string
}
export interface RespKendaliDokumen {
  tanggal: string
  gambar: RingkasGambarPM
  transmittal: RingkasTransmittalPM
  notulen: NotulenRapatPM[]
  tindakan: RingkasTindakanPM
  distribusi: MatriksDistribusiPM[]
  jadwalLaporan: { jadwal: HasilJadwalLaporanPM[]; aktif: number; macet: number }
  tandaTangan: TandaTanganPM[]
}
/** Bentuk `POST /api/v1/kendali-dokumen/tanda-tangan/verifikasi`. */
export interface RespVerifikasiTtd {
  keadaan: "belum_ditandatangani" | "utuh" | "berubah"
  sidik_sekarang: string
  tanda_tangan: Array<{ id: string; penanda_tangan: string; peran_penanda: string | null; ditandatangani_pada: string; alasan: string | null; cocok: boolean }>
  pesan: string
}

/**
 * Laporan & BI (Task 43, Tahap 7) — KPI Perusahaan, Arus Kas, Susun Laporan.
 *
 * `KpiProyekPM`/`StatusKpiPM` — bentuk PERSIS `lib/kpi-perusahaan.ts:43-50,140-145`
 * (interface `KpiProyek`/`StatusKpi` di sana, disalin dengan akhiran `PM`
 * mengikuti pola isolasi struktural berkas ini).
 */
export interface KpiProyekPM { id: string; name: string; cpi: number | null; spi: number | null; bac: number; ac: number }
export interface StatusKpiPM { keadaan: "baik" | "perhatian" | "buruk" | "tak_ada_data"; arti: string }

/** Bentuk PERSIS `lib/ar-register.ts:49-62` (interface `AgingRow`/`AgingSummary`). */
export interface AgingRowPM {
  id: string
  due_date: string
  amount_due: number
  days_past_due: number
}
export interface AgingSummaryPM {
  buckets: Record<"current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus", number>
  total: number
  count: number
  rows: AgingRowPM[]
}

/**
 * Bentuk PERSIS `lib/bid-backlog.ts:24-48` (interface `RingkasanBid`).
 *
 * ⚠️ Task 38 Step 1 menandai ini TEBAKAN belum diverifikasi — diverifikasi
 * saat implementasi Task 43: bentuk dugaan brief (4 field) HILANG empat field
 * yang benar-benar dipulangkan `hitungBacklog()` dan dikirim APA ADANYA oleh
 * `GET /reports/kpi-perusahaan` (`reports.ts:1656`, `backlog,` tanpa
 * penyaringan field). `winRatePct`/`selisihHargaRataPct` bisa `null` — lihat
 * komentar lib: "belum ada tender yang diputuskan" (win rate) atau "kalah
 * tanpa nilai pemenang diketahui" (selisih harga), BUKAN 0.
 */
export interface RingkasanBidPM {
  backlogNilai: number
  backlogJumlah: number
  pipelineNilai: number
  pipelineJumlah: number
  menang: number
  kalah: number
  winRatePct: number | null
  selisihHargaRataPct: number | null
  kalahDenganPembanding: number
}

/** Bentuk PERSIS `GET /api/v1/reports/kpi-perusahaan` (`reports.ts:1505-1658`). */
export interface RespKpiPerusahaan {
  tanggal: string
  evm: {
    cpi: number | null
    spi: number | null
    proyekDihitung: number
    proyekTotal: number
    cpiTerendah: KpiProyekPM | null
    spiTerendah: KpiProyekPM | null
    totalBac: number
    totalAc: number
    perProyek: KpiProyekPM[]
    statusCpi: StatusKpiPM
    statusSpi: StatusKpiPM
    dasar_bac: string
    dasar_pv: string
  }
  piutang: AgingSummaryPM
  backlog: RingkasanBidPM
}

/** Bentuk PERSIS `GET /reports/cashflow`, `reports.ts:466-475` (`summary`+`byMonth` saja — `payments`/`expenses`/`wages`/`kasbons` TIDAK ditipekan, tak dipakai halaman ringkas ini). */
export interface RespCashflowLaporan {
  period: { dateFrom: string; dateTo: string }
  summary: { totalIn: number; totalExpense: number; totalWage: number; totalKasbon: number; totalOut: number; netFlow: number }
  byMonth: Array<{ period: string; label: string; masuk: number; keluar: number; net: number }>
}

/**
 * Bentuk PERSIS `laporan-susun.ts` (`GET /laporan/sumber`, `POST /laporan/susun`)
 * dan `lib/laporan-susun.ts` (`SumberData`/`Kolom`).
 */
export interface SumberLaporanPM {
  kunci: string
  label: string
  keterangan: string
  kolom: Array<{ kunci: string; label: string; jenis: string }>
}
export interface RespSumberLaporan { sumber: SumberLaporanPM[]; operator: string[]; batas_maks: number }
export interface RespHasilLaporanSusun {
  sumber: { kunci: string; label: string }
  kolom: Array<{ kunci: string; label: string; jenis: string }>
  baris: Array<Record<string, unknown>>
  jumlah: number
  terpotong: boolean
  batas: number
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
