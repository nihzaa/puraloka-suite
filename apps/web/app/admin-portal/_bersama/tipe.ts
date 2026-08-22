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

// ============================================================================
// Kontrak & Asuransi (Task 8, Tahap 2) — disalin PERSIS dari
// `pm-portal/_bersama/tipe.ts:208-323`.
// ============================================================================

/**
 * Kontrak sebagai DOKUMEN (induk/addendum) — tabel `kontrak`, migrasi 344.
 * Beda dari `ProyekPM`: yang itu nilai BERLAKU di `projects.contract_value`
 * (jalur uang); ini nilai yang DITANDATANGANI, dibandingkan terhadapnya.
 * Bentuk dari `SELECT_KONTRAK`, `kontrak.ts`.
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

// ============================================================================
// EOT + Denda Keterlambatan + Register Jaminan + Klaim Kontraktual
// (Task 9, Tahap 2) — disalin PERSIS dari `pm-portal/_bersama/tipe.ts:1038-1198`.
// ============================================================================

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
 * halaman ini.
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
