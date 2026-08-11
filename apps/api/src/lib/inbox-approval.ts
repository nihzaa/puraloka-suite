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
   * Jalur tenancy:
   *   'B'          punya `company_id` langsung
   *   'C'          punya `project_id`
   *   'C-scenario' lewat `scenario_id` → `scenarios.project_id`
   *
   * Yang ketiga bukan kerumitan yang dikarang: `estimate_versions` memang tak
   * punya kolom proyek, dan peta tenancy sudah mencatatnya jauh sebelum inbox
   * ini ada.
   */
  tenancy: 'B' | 'C' | 'C-scenario'
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
    kolomPengaju: null,
    tenancy: 'C',
    jalurUi: '/kas',
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
    kolomPengaju: null,
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
    tenancy: 'C',
    jalurUi: '/lessons-learned',
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
    tenancy: 'C',
    jalurUi: '/mutu/rencana',
  },
]

export function sumberInbox(jenis: string): SumberInbox | undefined {
  return SUMBER_INBOX.find((s) => s.jenis === jenis)
}
