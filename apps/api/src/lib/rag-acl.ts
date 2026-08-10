/**
 * ACL RAG — jenis dokumen mana yang boleh MASUK ke jawaban asisten.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * T-4: RAG MEREPRODUKSI SELURUH ACL DOKUMEN, BUKAN HANYA company_id
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `routes/v1/documents.ts` menyaring tiga lapis (diukur 2026-08-10):
 *
 *   1. tenancy      `viaProject('documents', projectId)`
 *   2. jenis        `ROLE_ALLOWED_TYPES[role]` — mandor 4 jenis, client 5
 *   3. visibilitas  client wajib `is_visible_to_client = true`
 *
 * Indeks RAG tak tahu apa pun tentang lapisan 2 dan 3. Tanpa berkas ini,
 * seorang mandor bisa bertanya "berapa nilai kontraknya?" dan asisten
 * menjawabnya dari isi kontrak — dokumen yang di halaman Dokumen TIDAK PERNAH
 * ia lihat. Tak ada galat; ia hanya mendapat lebih dari haknya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PERMISSION, BUKAN NAMA PERAN (ADR-004)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `documents.ts:31-37` memakai literal `admin`/`pm`/`mandor`/`client` sebagai
 * kunci. Itu pelanggaran ADR-004 yang sudah tercatat (QUEUE F3-1) dan
 * TIDAK DIREPRODUKSI di sini.
 *
 * Bukan kemurnian: peran adalah data konfigurasi per-tenant. Tenant yang
 * membuat peran `pengawas` mendapat NOL dokumen dari tabel literal — bukan
 * ditolak dengan jelas, melainkan diam-diam tak menemukan apa pun, dan
 * gejalanya "asistennya bodoh", bukan "izinnya kurang".
 *
 * Diukur dari basis 2026-08-10, `documents:manage` memetakan PERSIS ke
 * "melihat semua jenis":
 *
 *   admin ✓   pm ✓   direktur ✓        ← punya, dan memang lihat semua
 *   mandor ✗  client ✗                  ← tak punya, dan memang dibatasi
 *
 * `direktur` peran KUSTOM, dan ia ikut benar tanpa disebut namanya di mana
 * pun. Itulah bedanya dengan tabel literal.
 */

/**
 * Jenis yang boleh dibaca oleh yang TIDAK punya `documents:manage`.
 *
 * Gabungan mandor ∪ client dari `documents.ts` — dan penyaringan sisanya
 * (client tak boleh SPK) dilakukan lewat `visible_klien`, bukan daftar kedua.
 *
 * Kenapa gabungan, bukan dua daftar terpisah: memisahkannya menuntut RAG tahu
 * "orang ini mandor atau client", dan itu membawa kembali nama peran yang
 * baru saja dihindari. Yang membedakan keduanya sudah ada sebagai DATA —
 * `is_visible_to_client` di dokumennya sendiri.
 */
export const JENIS_TERBATAS = [
  'gambar_kerja',
  'spk',
  'berita_acara',
  'foto_progress',
  'kontrak',
  'lainnya',
] as const

/**
 * Jenis yang TAK PERNAH masuk RAG untuk siapa pun tanpa `documents:manage`.
 *
 * `invoice` sengaja di luar `JENIS_TERBATAS`: ia memuat nominal, syarat
 * pembayaran, dan identitas klien. Di `documents.ts` ia memang tak ada di
 * daftar mandor maupun client.
 */
export const JENIS_HANYA_PENGELOLA = ['invoice'] as const

export interface SaringanRag {
  /** `null` = semua jenis (punya `documents:manage`). */
  jenis: readonly string[] | null
  /**
   * `true` = hanya potongan dari dokumen ber-`is_visible_to_client`.
   *
   * Diterapkan untuk SEMUA yang tak punya `documents:manage`, termasuk mandor.
   * Itu LEBIH KETAT dari `documents.ts`, yang hanya menerapkannya pada client.
   *
   * Disengaja, dan alasannya khusus RAG: di halaman Dokumen orang melihat
   * JUDUL dan memutuskan membukanya. Di RAG isinya masuk ke jawaban tanpa
   * pernah diminta — dokumen internal yang sengaja tak dibagikan ke klien
   * paling mungkin juga tak dimaksudkan dikutip mesin kepada mandor.
   *
   * Kalau kelak terbukti terlalu ketat, pelonggarannya keputusan founder
   * (RATIFIKASI), bukan default yang dipilih diam-diam.
   */
  hanyaVisibelKlien: boolean
}

/**
 * Saringan RAG dari PERMISSION efektif seseorang.
 *
 * Fail-closed: set izin kosong menghasilkan saringan paling ketat, bukan
 * paling longgar. Kalau `_permissionCache` gagal terisi karena alasan tak
 * terduga, asisten menjawab "saya tak menemukan dokumennya" — dan itu jauh
 * lebih baik daripada mengutip kontrak kepada orang yang tak berhak.
 */
export function saringanUntuk(izin: ReadonlySet<string>): SaringanRag {
  if (izin.has('documents:manage')) {
    return { jenis: null, hanyaVisibelKlien: false }
  }
  return { jenis: JENIS_TERBATAS, hanyaVisibelKlien: true }
}
