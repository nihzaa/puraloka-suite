/**
 * KATALOG SUMBER INBOX APPROVAL.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KATALOG, BUKAN SATU QUERY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tujuh entity type memakai mesin approval yang sama, tetapi entitasnya
 * tersebar di tujuh tabel dengan bentuk yang berbeda-beda. Diukur 2026-08-09,
 * bukan diasumsikan:
 *
 *   status "menunggu"   kasbon `pending` · change_order `submitted`
 *                       estimate_version `under_review` · submittal `diajukan`
 *   nominal             `amount` · `total_amount` · `total_amount_delta` · (tak ada)
 *   nomor dokumen       `co_number` · `mr_number` · `nomor` · (tak ada)
 *   pengaju             `requested_by` · `created_by`
 *
 * Tak ada satu pun yang seragam. Query tunggal yang mencoba menyatukannya akan
 * penuh `COALESCE` dan `CASE`, dan tiap modul baru menambah cabang di query
 * yang sudah sulit dibaca.
 *
 * Katalog memindahkan ketidakseragaman itu ke DATA: satu baris per jenis, dan
 * modul baru cukup menambah baris.
 *
 * ── Kenapa `approval_progress` TIDAK cukup sendirian
 *
 * Tabel itu mencatat langkah yang SUDAH disetujui, bukan yang menunggu. Inbox
 * yang membacanya saja akan menampilkan pekerjaan yang sudah selesai dan
 * MELEWATKAN yang belum tersentuh sama sekali — kebalikan dari gunanya.
 *
 * Jadi sumbernya tabel entitasnya sendiri (yang berstatus menunggu), dan
 * `approval_progress` dipakai untuk mengetahui sudah sampai level berapa.
 */

import type { TabelTerklasifikasi } from '../utils/tenant-map.generated.js'

export interface SumberInbox {
  /** Sama dengan `approval_chains.entity_type`. */
  jenis: string
  label: string
  /**
   * Nama tabel — bertipe `TabelTerklasifikasi`, bukan `string`.
   *
   * Itu membuat salah ketik jadi galat KOMPILASI, bukan galat runtime yang
   * baru terlihat saat seseorang membuka inbox. Peta tenancy adalah daftar
   * tabel yang benar-benar ada, dan ia di-generate dari basis — jadi ia juga
   * ikut menangkap tabel yang dihapus atau diganti nama.
   */
  tabel: TabelTerklasifikasi
  /** Nilai status yang berarti "menunggu keputusan" di tabel ini. */
  statusMenunggu: string[]
  /** Kolom nominal, kalau ada. Dipakai mencocokkan `approval_steps.min_amount`. */
  kolomNominal: string | null
  /** Kolom yang menampilkan identitas dokumen ke manusia. */
  kolomJudul: string | null
  kolomNomor: string | null
  /** Kolom pengaju — dipakai menegakkan SoD di UI (pengaju tak melihat tombol setujui). */
  kolomPengaju: string | null
  /**
   * Kolom waktu dibuat. TIDAK seragam — dan itu yang membuatnya harus di sini.
   *
   * Sampai 2026-08-12 rutenya memaku `created_at`. Modul berbahasa Indonesia
   * (`opname_bersama`, `back_charge`) memakai `dibuat_pada`, jadi keduanya
   * GAGAL dibaca begitu ditambahkan — dan gagalnya masuk daftar `dilewati`,
   * bukan melempar. Penjaga `audit-inbox-lengkap` tetap hijau karena ia
   * memeriksa keberadaan ENTRI, bukan kolomnya.
   */
  kolomDibuat: string
  /**
   * Jalur tenancy:
   *   'B'          punya `company_id` langsung
   *   'C'          punya `project_id`
   *   'C-scenario' lewat `scenario_id` → `scenarios.project_id`
   *   'C-pegawai'  lewat `pegawai_id`  → `pegawai.company_id`
   *
   * Dua yang terakhir bukan kerumitan yang dikarang: `estimate_versions`
   * memang tak punya kolom proyek, dan `cuti_ambil` menuju tenant lewat
   * PEGAWAI (cuti bukan milik proyek). Peta tenancy sudah mencatat keduanya
   * jauh sebelum inbox ini ada.
   */
  tenancy: 'B' | 'C' | 'C-scenario' | 'C-pegawai'
  /** Rute UI untuk membuka dokumennya. `:id` diganti id entitas. */
  jalurUi: string
}

/**
 * Diurutkan menurut seberapa mendesak keputusannya, bukan abjad.
 *
 * Yang menyentuh uang lebih dulu: approver yang membuka inbox dengan waktu
 * terbatas harus melihat kasbon sebelum lessons learned.
 */
export const SUMBER_INBOX: SumberInbox[] = [
  {
    jenis: 'kasbon',
    label: 'Kasbon',
    tabel: 'kasbons',
    statusMenunggu: ['pending'],
    kolomNominal: 'amount',
    kolomJudul: 'purpose',
    kolomNomor: null,
    kolomPengaju: 'requested_by',
    kolomDibuat: 'created_at',
    tenancy: 'B',
    jalurUi: '/mandor/kasbon',
  },
  {
    jenis: 'project_expense',
    label: 'Pengeluaran Proyek',
    tabel: 'project_expenses',
    // Enum `expense_status` = draft|submitted|approved|rejected. Tak ada
    // `pending` — menuliskannya membuat query GAGAL, bukan mengembalikan nol
    // baris, dan itu justru yang membuat cacatnya terlihat lewat `dilewati`.
    statusMenunggu: ['submitted'],
    kolomNominal: 'total_amount',
    kolomJudul: 'description',
    kolomNomor: null,
    // `null` di sini SALAH sampai 2026-08-12: kolomnya ada
    // (`project_expenses.submitted_by`), dan akibatnya inbox tak pernah
    // menandai pengeluaran milik sendiri. Ditemukan saat membangun TJS-P4,
    // ketika kesembilan kolom pengaju diukur langsung ke information_schema.
    kolomPengaju: 'submitted_by',
    kolomDibuat: 'created_at',
    tenancy: 'C',
    jalurUi: '/kas',
  },
  {
    jenis: 'opname_bersama',
    label: 'Verifikasi Opname',
    tabel: 'opname_bersama',
    // Enum `opname_status` = diajukan|diverifikasi|disengketakan (diukur ke
    // pg_enum 2026-08-12, bukan diingat). Yang menunggu hanya `diajukan`;
    // `disengketakan` sudah diputuskan — ia menunggu PERBAIKAN pengukur,
    // bukan keputusan approver, dan menampilkannya di sini membuat inbox
    // berisi pekerjaan yang bukan milik yang membukanya.
    statusMenunggu: ['diajukan'],
    // Tak ada kolom nominal: opname mengukur PERSEN, bukan rupiah. Persennya
    // sendiri turunan dari itemnya (`pctOpname`) dan sengaja tak disimpan di
    // induk — menyimpannya berarti dua angka yang bisa berselisih.
    kolomNominal: null,
    kolomJudul: 'catatan',
    kolomNomor: 'nomor',
    // Pengukur, bukan pembuat baris. SoD-nya justru inti modul ini: yang
    // mengukur di lapangan tak boleh memverifikasi ukurannya sendiri, dan
    // basis pun menolaknya lewat CHECK.
    kolomPengaju: 'diukur_oleh',
    // `dibuat_pada`, bukan `created_at` — diukur ke information_schema.
    kolomDibuat: 'dibuat_pada',
    tenancy: 'B',
    jalurUi: '/mandor/opname',
  },
  {
    jenis: 'back_charge',
    label: 'Back-Charge',
    tabel: 'back_charge',
    // Enum `back_charge_status` = diajukan|disetujui|dipotong|dibatalkan.
    // Hanya `diajukan` yang menunggu keputusan — `disetujui` menunggu
    // pembayaran berikutnya (bukan orang), `dipotong` sudah selesai.
    statusMenunggu: ['diajukan'],
    kolomNominal: 'nilai',
    kolomJudul: 'uraian',
    kolomNomor: 'nomor',
    kolomPengaju: 'diajukan_oleh',
    // `dibuat_pada`, bukan `created_at`.
    kolomDibuat: 'dibuat_pada',
    tenancy: 'B',
    jalurUi: '/mandor/back-charge',
  },
  {
    jenis: 'klaim_perjalanan',
    label: 'Klaim Perjalanan',
    tabel: 'klaim_perjalanan',
    // Enum `klaim_status` = diajukan|disetujui|ditolak|dibayar (diukur ke
    // pg_enum). Hanya `diajukan` yang menunggu KEPUTUSAN — `disetujui`
    // menunggu pencairan, yang jalurnya sendiri dan izinnya berbeda.
    statusMenunggu: ['diajukan'],
    kolomNominal: 'total_diajukan',
    kolomJudul: 'keperluan',
    kolomNomor: 'nomor',
    // `dibuat_oleh` (user), BUKAN `pegawai_id`. Yang dibandingkan inbox
    // dengan id penggunanya adalah kolom ini; `pegawai_id` menunjuk tabel
    // lain dan akan selalu tak cocok — tombol setujui muncul untuk pengaju
    // sendiri, dan SoD-nya baru menahan di server.
    kolomPengaju: 'dibuat_oleh',
    kolomDibuat: 'dibuat_pada',
    tenancy: 'B',
    jalurUi: '/sdm/klaim-perjalanan',
  },
  {
    jenis: 'change_order',
    label: 'Change Order',
    tabel: 'change_orders',
    statusMenunggu: ['submitted'],
    kolomNominal: 'total_amount_delta',
    kolomJudul: 'title',
    kolomNomor: 'co_number',
    kolomPengaju: 'created_by',
    kolomDibuat: 'created_at',
    tenancy: 'C',
    jalurUi: '/kontrak/change-order',
  },
  {
    jenis: 'material_request',
    label: 'Permintaan Material',
    tabel: 'material_requests',
    statusMenunggu: ['submitted', 'pending'],
    kolomNominal: null,
    kolomJudul: 'notes',
    kolomNomor: 'mr_number',
    kolomPengaju: 'requested_by',
    kolomDibuat: 'created_at',
    tenancy: 'C',
    jalurUi: '/procurement/material-request',
  },
  {
    jenis: 'estimate_version',
    label: 'Versi Estimasi',
    tabel: 'estimate_versions',
    statusMenunggu: ['under_review'],
    kolomNominal: 'total_amount',
    kolomJudul: null,
    kolomNomor: null,
    kolomPengaju: 'created_by',
    kolomDibuat: 'created_at',
    // Kategori C TAPI lewat `scenario_id`, bukan `project_id` — tabel ini tak
    // punya kolom proyek sama sekali. Peta tenancy sudah mencatatnya
    // (`lewat: 'scenario_id'`), dan mengabaikannya membuat query gagal dengan
    // "column estimate_versions.project_id does not exist".
    tenancy: 'C-scenario',
    jalurUi: '/estimasi',
  },
  {
    jenis: 'submittal',
    label: 'Submittal',
    tabel: 'submittals',
    statusMenunggu: ['diajukan'],
    kolomNominal: null,
    kolomJudul: 'judul',
    kolomNomor: 'nomor',
    // Sama seperti `project_expense` di atas: `null` ini SALAH.
    // `submittals.diajukan_oleh` ada sejak tabelnya dibuat.
    kolomPengaju: 'diajukan_oleh',
    kolomDibuat: 'created_at',
    tenancy: 'C',
    jalurUi: '/kontrak/submittal',
  },
  {
    jenis: 'lessons_learned',
    label: 'Lessons Learned',
    tabel: 'lessons_learned_records',
    // `under_review`, bukan `diajukan`. Saya sempat menebak yang kedua; CHECK
    // constraint tabelnya membuktikan sebaliknya. Tebakan nama kolom/status
    // sudah dua kali menghabiskan waktu di repo ini — semua entri katalog ini
    // diverifikasi ke `information_schema`, bukan diingat.
    statusMenunggu: ['under_review'],
    kolomNominal: 'variance_amount',
    kolomJudul: 'title',
    kolomNomor: null,
    kolomPengaju: 'created_by',
    kolomDibuat: 'created_at',
    tenancy: 'C',
    jalurUi: '/lessons-learned',
  },
  {
    jenis: 'cuti_karyawan',
    label: 'Cuti Karyawan',
    tabel: 'cuti_ambil',
    // `diajukan` — diverifikasi ke enum `status_cuti` di basis
    // (diajukan|disetujui|ditolak|dibatalkan), bukan diingat.
    statusMenunggu: ['diajukan'],
    // Cuti tak bernominal rupiah; yang berjenjang adalah kewenangan atas
    // hak karyawan.
    kolomNominal: null,
    kolomJudul: 'alasan',
    kolomNomor: null,
    kolomPengaju: 'diajukan_oleh',
    kolomDibuat: 'created_at',
    // Kategori C lewat `pegawai_id` — BUKAN `project_id`.
    tenancy: 'C-pegawai',
    jalurUi: '/sdm/cuti',
  },
  {
    jenis: 'rencana_mutu',
    label: 'Rencana Mutu Proyek',
    tabel: 'rencana_mutu',
    // `diajukan` — diverifikasi ke enum `rmp_status` di basis
    // (draf|diajukan|disetujui|kedaluwarsa), bukan diingat. Peringatan di
    // entri `lessons_learned` tepat di atas menyebut kelas kesalahan ini,
    // dan RMP dibuat di sesi yang sama pun tetap saya ukur.
    statusMenunggu: ['diajukan'],
    // RMP tak menyentuh uang: yang berjenjang adalah KEWENANGAN (QA lalu
    // direktur), bukan besaran. Ambang nominal tak berlaku.
    kolomNominal: null,
    kolomJudul: 'judul',
    kolomNomor: 'nomor',
    kolomPengaju: 'dibuat_oleh',
    kolomDibuat: 'created_at',
    tenancy: 'C',
    jalurUi: '/mutu/rencana',
  },
]

export function sumberInbox(jenis: string): SumberInbox | undefined {
  return SUMBER_INBOX.find((s) => s.jenis === jenis)
}
