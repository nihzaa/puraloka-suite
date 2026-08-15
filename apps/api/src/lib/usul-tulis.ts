/**
 * USULAN TULIS YANG MENUNGGU KONFIRMASI — dibaca dari blok tool.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * JALUR YANG LENGKAP TAPI TAK PERNAH BISA DIPAKAI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16: asisten SUDAH bisa menyiapkan lima jenis catatan
 * (`catatan_progres`, `kasbon`, `pengeluaran`, `permintaan_material`,
 * `temuan_punch`). Tool `siapkan_tulis` terdaftar di katalog, rute
 * `POST /api/v1/ai/siapkan-tulis` menerbitkan token, dan `POST /api/v1/ai/tulis`
 * menyimpannya.
 *
 * Yang hilang satu hal: **`grep` atas seluruh `apps/web` menemukan NOL
 * pemanggilan `/api/v1/ai/tulis`.**
 *
 * Jadi asisten bisa berkata "saya siapkan catatan kasbon Rp 500rb, tekan
 * konfirmasi ya" — dan tak ada tombol konfirmasi di mana pun. Tokennya
 * kedaluwarsa 15 menit kemudian tanpa mengubah apa pun, dan pengguna
 * menunggu tombol yang tak pernah ada.
 *
 * Pola yang sama dengan `riwayat` yang tak pernah diisi dan empat sub-menu
 * yang tak pernah dinyalakan: setengah rantai yang bekerja sempurna, dan
 * setengah lagi yang tak pernah tersambung. Tak satu pun menghasilkan galat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DIBACA DARI BLOK, BUKAN DENGAN MENGUBAH BENTUK HASIL TOOL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ai-loop.ts` sudah menyimpan `panggilanTool` (nama + argumen) di tiap blok
 * ronde — untuk C-5, supaya ronde berikutnya sah di mata Anthropic. Argumen
 * itulah yang dibutuhkan UI untuk membangun tombolnya.
 *
 * Menambah field baru ke `HasilTool` akan menyentuh seluruh tool yang ada
 * demi satu tool yang butuh. Membacanya dari blok tak menyentuh apa pun.
 */

/** Jenis yang benar-benar bisa dicatat — cermin `ENTITAS_TULIS`. */
export const JENIS_USUL = [
  'catatan_progres',
  'temuan_punch',
  'kasbon',
  'pengeluaran',
  'permintaan_material',
] as const

export type JenisUsul = (typeof JENIS_USUL)[number]

export interface UsulTulis {
  jenis: JenisUsul
  /** Argumen apa adanya dari model — UI meneruskannya ke `siapkan-tulis`. */
  argumen: Record<string, unknown>
}

interface BlokRonde {
  panggilanTool?: Array<{ nama?: string; argumen?: unknown }>
}

/**
 * Mengambil usulan `siapkan_tulis` dari blok satu giliran.
 *
 * Mengembalikan array kosong kalau tak ada — dan itu keadaan normalnya, bukan
 * kegagalan. Sebagian besar giliran memang cuma bertanya.
 *
 * ── Kenapa hanya yang TERAKHIR yang dipakai kalau ada beberapa
 *
 * Model bisa memanggil `siapkan_tulis` dua kali dalam satu giliran (mis.
 * memperbaiki angka sesudah membaca proyeknya). Menampilkan dua tombol
 * membuat pengguna memilih antara dua hal yang ia kira sama; yang terakhir
 * adalah yang model maksud, karena itulah yang ia susun sesudah tahu segalanya.
 */
export function usulDariBlok(blok: unknown): UsulTulis[] {
  if (!Array.isArray(blok)) return []

  const semua: UsulTulis[] = []

  for (const b of blok as BlokRonde[]) {
    if (!b || !Array.isArray(b.panggilanTool)) continue

    for (const p of b.panggilanTool) {
      if (p?.nama !== 'siapkan_tulis') continue

      const arg = (p.argumen ?? {}) as Record<string, unknown>
      const jenis = String(arg.jenis ?? '')

      // Jenis asing DIBUANG, bukan diteruskan: tombol yang menjanjikan
      // menyimpan sesuatu yang rutenya tolak 422 lebih buruk daripada tak
      // ada tombol sama sekali.
      if (!(JENIS_USUL as readonly string[]).includes(jenis)) continue

      semua.push({ jenis: jenis as JenisUsul, argumen: arg })
    }
  }

  // Hanya yang terakhir — lihat catatan di atas.
  return semua.length > 0 ? [semua[semua.length - 1]] : []
}
