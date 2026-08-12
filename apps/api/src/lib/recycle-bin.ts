import type { TabelTerklasifikasi } from '../utils/tenant-map.generated.js'

/**
 * RECYCLE BIN — memulihkan yang terhapus, dan REGISTRY-nya (TJS-P1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG TERUKUR SEBELUM DIBANGUN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Judul item ini berbunyi *"soft delete sudah ada, restore tidak"*. Diukur
 * 2026-08-12, dan keadaannya lebih sempit dari itu:
 *
 *     tabel dengan is_deleted + deleted_at + deleted_by : 1  (`projects`)
 *     endpoint DELETE di seluruh API                    : 34
 *     endpoint restore                                  : 0
 *
 * Jadi bukan "restore-nya belum dibuat" — **33 dari 34 penghapusan bersifat
 * permanen dan tak meninggalkan apa pun untuk dipulihkan.**
 *
 * ── Yang dibangun, dan batasnya yang jujur
 *
 * Registry ini menyediakan jalur pulih untuk tabel yang MEMANG punya soft
 * delete. Ia **tidak** mengubah 33 endpoint lain jadi soft delete — itu
 * pekerjaan per-modul yang menyentuh perilaku hapus di seluruh aplikasi, dan
 * melakukannya massal berarti mengubah arti tombol "hapus" di 33 tempat tanpa
 * seorang pun memutuskannya.
 *
 * Yang disediakan di sini adalah **jalannya**: modul yang kelak dijadikan
 * soft delete cukup menambah satu entri, dan ia langsung punya recycle bin
 * beserta pemulihannya.
 *
 * ── Kenapa registry di KODE, bukan tabel konfigurasi
 *
 * Sama alasannya dengan sumber laporan (G6d): "tabel mana yang boleh
 * dipulihkan lewat UI" adalah keputusan yang tak boleh bisa diubah dengan
 * salah tekan. Nama tabel di sini bertipe `TabelTerklasifikasi`, jadi tabel
 * di luar peta tenancy ditolak **tsc**.
 */

export interface EntriRecycle {
  /** Kunci untuk URL & UI. Stabil — ia kontrak publik. */
  kunci: string
  label: string
  /** Nama tabel — dari KODE, tak pernah dari masukan pengguna. */
  tabel: TabelTerklasifikasi
  /** Kolom yang menamai barisnya di daftar recycle bin. */
  kolomNama: string
  /**
   * Bagaimana barisnya disaring ke tenant.
   * `company` — tabel punya `company_id`; `project` — lewat `project_id`.
   */
  tenancy: 'company' | 'project'
  /** Izin untuk MELIHAT isi recycle bin. */
  izinLihat: string
  /** Izin untuk MEMULIHKAN — sengaja bisa berbeda dari izin melihat. */
  izinPulih: string
}

/**
 * Daftar tabel yang punya recycle bin.
 *
 * Menambah entri di sini SATU-SATUNYA yang dibutuhkan modul baru — itulah
 * kriteria "registry: modul baru cukup mendaftar".
 *
 * Syarat yang tak bisa ditawar: tabelnya HARUS punya `is_deleted`,
 * `deleted_at`, dan `deleted_by`. Dijaga `audit-recycle-bin-nyata.mjs` yang
 * mencocokkan daftar ini dengan `information_schema` — tanpa penjaga itu,
 * entri untuk tabel tanpa kolom soft delete akan lolos seluruh pemeriksaan
 * pustaka lalu gagal di basis dengan pesan yang menunjuk query.
 */
export const REGISTRY: EntriRecycle[] = [
  {
    kunci: 'proyek',
    label: 'Proyek',
    tabel: 'projects',
    kolomNama: 'name',
    tenancy: 'company',
    izinLihat: 'projects:view',
    // Memulihkan proyek mengembalikan seluruh data yang menggantung padanya —
    // RAB, invoice, jadwal. Itu keputusan yang lebih besar daripada melihat.
    izinPulih: 'projects:delete',
  },
]

export function cariEntri(kunci: string): EntriRecycle | null {
  return REGISTRY.find((e) => e.kunci === kunci) ?? null
}

/**
 * Umur item di recycle bin, dalam hari.
 *
 * ── Kenapa `Math.max(0, …)` dan bukan `Math.floor` saja
 *
 * `deleted_at` diisi `now()` oleh basis. Kalau jam basis sedikit di depan jam
 * proses yang membacanya — beda zona, selisih NTP, atau sekadar milidetik
 * antara INSERT dan pembacaan — selisihnya jadi negatif dan `Math.floor`
 * membulatkannya ke **−1**.
 *
 * Ditemukan test: item yang baru saja dihapus melaporkan umur −1 hari, dan
 * layar akan menampilkan "dihapus −1 hari lalu". Angka yang mustahil, dan
 * pembacanya akan menyimpulkan jamnya rusak — bukan pembulatannya.
 *
 * Nol adalah jawaban yang benar untuk "baru saja": tak ada umur negatif di
 * recycle bin.
 */
export function umurHari(dihapusPada: string | null | undefined,
  sekarang: Date = new Date()): number | null {
  if (!dihapusPada) return null
  const t = new Date(dihapusPada).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((sekarang.getTime() - t) / 86_400_000))
}

/**
 * Batas usia recycle bin, dalam hari.
 *
 * TIDAK ada penghapusan otomatis di sini — angka ini hanya dipakai layar
 * untuk menandai yang sudah lama. Membuang otomatis berarti data hilang
 * permanen karena waktu berlalu, dan yang menyadarinya baru saat mencarinya.
 *
 * Kalau kelak pembersihan otomatis diputuskan, ia harus jadi keputusan
 * tersendiri dengan pemberitahuan — bukan efek samping dari konstanta ini.
 */
export const AMBANG_LAMA_HARI = 30

export type HasilPulih =
  | { bisa: true }
  | { bisa: false; alasan: string; kode: 'tak_terhapus' | 'tak_ada' }

/**
 * Apakah sebuah baris bisa dipulihkan.
 *
 * Baris yang TIDAK terhapus ditolak — dan itu bukan kerewelan. Memulihkan
 * yang tak terhapus akan menimpa `deleted_by`/`deleted_at` dengan null pada
 * baris hidup, menghapus jejak penghapusan SEBELUMNYA kalau ia pernah
 * dipulihkan. Jejak itu satu-satunya keterangan saat orang bertanya "kenapa
 * data ini sempat hilang?".
 */
export function periksaPulih(
  baris: { is_deleted?: boolean | null } | null | undefined,
): HasilPulih {
  if (!baris) {
    return { bisa: false, kode: 'tak_ada', alasan: 'Data tidak ditemukan' }
  }
  if (baris.is_deleted !== true) {
    return {
      bisa: false,
      kode: 'tak_terhapus',
      alasan: 'Data ini tidak sedang terhapus — tak ada yang perlu dipulihkan.',
    }
  }
  return { bisa: true }
}
