/**
 * USULAN PERSETUJUAN — dibaca dari hasil tool, sama seperti usulan tulis.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA DARI HASIL TOOL, BUKAN DARI ARGUMEN MODEL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Model memanggil `siapkan_setujui` dengan NOMOR URUT. Yang dibutuhkan rute
 * `POST /api/v1/ai/preview-setujui` adalah `jenis` + `entity_id` — dan
 * keduanya lahir DI DALAM tool, sesudah nomor itu diresolusi lewat `db` milik
 * tenant.
 *
 * Membacanya dari argumen model berarti meresolusi nomor untuk KEDUA KALINYA
 * di tempat lain. Dua resolusi atas satu nomor pasti berselisih suatu saat —
 * daftar bisa berubah di antaranya — dan selisihnya berarti orang menyetujui
 * dokumen yang BUKAN ia baca, dengan uang sungguhan di dalamnya.
 *
 * Karena itu tool menuliskan `JENIS=… ENTITY_ID=…` di hasilnya, dan berkas ini
 * memungutnya. Yang sampai sini SUDAH terbukti milik tenant penanya.
 *
 * ── Hanya yang TERAKHIR
 *
 * Model bisa memanggil tool ini dua kali dalam satu giliran (mis. sesudah
 * pengguna mengoreksi nomornya). Dua tombol membuat orang memilih antara dua
 * hal yang ia kira sama; yang terakhir adalah yang ia maksud. Pola yang sama
 * dengan `usul-tulis.ts` dan `usul-grafik.ts`.
 */

/** `JENIS=<kata> ENTITY_ID=<uuid>` — dua-duanya wajib, dan urutannya tetap. */
const POLA = /JENIS=([a-z_]+)\s+ENTITY_ID=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

export interface UsulSetujui {
  jenis: string
  entityId: string
}

interface BlokRonde {
  hasilTool?: Array<{ isi?: unknown; isError?: unknown }>
}

/**
 * Mengambil usulan persetujuan dari blok satu giliran.
 *
 * Mengembalikan `null` kalau tak ada — keadaan normalnya, bukan kegagalan.
 * Sebagian besar giliran memang tak menyiapkan persetujuan.
 */
export function setujuiDariBlok(blok: unknown): UsulSetujui | null {
  if (!Array.isArray(blok)) return null

  let terakhir: UsulSetujui | null = null

  for (const b of blok as BlokRonde[]) {
    if (!b || !Array.isArray(b.hasilTool)) continue

    for (const h of b.hasilTool) {
      /*
       * Hasil BERGALAT dilewati.
       *
       * "Nomor 99 tak ada" tak boleh menghasilkan tombol setujui, dan
       * `isError` adalah satu-satunya penanda yang tool berikan.
       */
      if (h?.isError === true) continue
      if (typeof h?.isi !== 'string') continue

      const cocok = POLA.exec(h.isi)
      if (cocok) terakhir = { jenis: cocok[1].toLowerCase(), entityId: cocok[2] }
    }
  }

  return terakhir
}
