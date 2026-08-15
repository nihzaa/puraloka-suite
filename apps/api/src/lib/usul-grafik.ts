/**
 * PERMINTAAN GRAFIK — dibaca dari hasil tool, sama seperti usulan tulis.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DARI HASIL TOOL, BUKAN DARI ARGUMEN MODEL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Model memanggil `grafik_kurva_s` dengan NAMA proyek. Yang dibutuhkan
 * perender adalah ID — dan id itu lahir di dalam tool, sesudah namanya
 * diresolusi lewat `db` milik tenant.
 *
 * Membacanya dari argumen model berarti menerima nama yang belum diverifikasi,
 * lalu meresolusinya untuk KEDUA KALINYA di tempat lain. Dua resolusi untuk
 * satu nama pasti berselisih suatu saat — dan selisihnya menghasilkan grafik
 * proyek yang salah, yang terlihat sama resminya dengan yang benar.
 *
 * Karena itu tool menuliskan `PROYEK_ID=<uuid>` di hasilnya, dan berkas ini
 * memungutnya. Id yang sampai sini SUDAH terbukti milik tenant penanya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HANYA YANG TERAKHIR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Model bisa memanggil tool ini dua kali dalam satu giliran (mis. sesudah
 * pengguna mengoreksi proyeknya). Mengirim dua gambar membuat orang menebak
 * mana yang dimaksud; yang terakhir adalah yang ia susun sesudah tahu
 * segalanya — pola yang sama dengan `usul-tulis.ts`.
 */

/** UUID v4 apa adanya — id proyek tak pernah berbentuk lain di basis ini. */
const POLA_ID = /PROYEK_ID=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

interface BlokRonde {
  hasilTool?: Array<{ isi?: unknown; isError?: unknown }>
}

/**
 * Mengambil id proyek yang grafiknya diminta.
 *
 * Mengembalikan `null` kalau tak ada — dan itu keadaan normalnya, bukan
 * kegagalan. Sebagian besar giliran memang tak meminta grafik.
 */
export function grafikDariBlok(blok: unknown): string | null {
  if (!Array.isArray(blok)) return null

  let terakhir: string | null = null

  for (const b of blok as BlokRonde[]) {
    if (!b || !Array.isArray(b.hasilTool)) continue

    for (const h of b.hasilTool) {
      // Hasil BERGALAT dilewati: "proyek tak ditemukan" tak boleh menghasilkan
      // gambar, dan `isError` adalah satu-satunya penanda yang tool berikan.
      if (h?.isError === true) continue
      if (typeof h?.isi !== 'string') continue

      const cocok = POLA_ID.exec(h.isi)
      if (cocok) terakhir = cocok[1]
    }
  }

  return terakhir
}
