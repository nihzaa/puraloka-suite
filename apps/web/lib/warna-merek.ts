/**
 * WARNA MEREK — nilai hex sungguhan, untuk tempat yang TAK BISA memakai
 * `var(--token)`.
 *
 * ── Kenapa berkas ini ada, padahal repo ini melarang hex mati
 *
 * Larangan itu benar dan tetap berlaku untuk komponen: warna yang ditulis
 * langsung di .tsx membuat white-label per tenant mustahil, dan tak ikut
 * berbalik di mode gelap. 581 hex baru saja disapu karena itu.
 *
 * Tapi ada tiga tempat yang secara teknis tak bisa memakai custom property:
 *
 *   • `metadata.themeColor` — dibaca peramban dari <meta>, sebelum CSS mana
 *     pun dimuat. `var(--aksen)` di sana adalah teks mati.
 *   • `app/icon.svg` — berkas statis, tak punya akses ke :root.
 *   • Kanvas/PDF yang digambar di sisi server.
 *
 * Jalan keluarnya bukan "kecualikan berkas dari penjaga" — pengecualian
 * cenderung melebar. Yang dilakukan: SATU tempat yang boleh menyimpan hex,
 * diberi nama, dijelaskan, dan dijaga tetap sinkron dengan globals.css oleh
 * `uji-token-merek.mjs`.
 *
 * ⚠️ Kalau nilai di sini berubah, `app/globals.css` HARUS ikut berubah —
 * dan sebaliknya. Keduanya menggambarkan warna perusahaan yang sama.
 */

/** Navy merek — hsl(210, 100%, 20%). Sama dengan `--navy` / `--aksen` terang. */
export const NAVY = '#003366'

/** Kanvas mode gelap — sama dengan `--bg` di blok `.dark`. */
export const GELAP = '#0F1117'

/** Putih di atas navy. Sama dengan `--on-aksen` terang. */
export const DI_ATAS_NAVY = '#FFFFFF'
