import { inflateSync } from 'node:zlib'

/**
 * Teks yang benar-benar tercetak di sebuah PDF pdfkit.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI ADA — DAN KENAPA DIPINDAH KE SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Memeriksa PDF lewat status 200 tak membuktikan apa pun: 200 tetap keluar
 * meski kop, klausul, maupun lampiran tak pernah digambar. Itu bentuk
 * kegagalan yang paling mudah lolos — layar menampilkan data, kertas tidak,
 * dan tak ada satu pun galat.
 *
 * DUA lapis penyandian harus dibuka, dan keduanya ditemukan dengan MENGUKUR:
 *
 *  1. Stream halaman dikompresi FlateDecode, jadi tak ada teks apa pun yang
 *     muncul apa adanya di buffer.
 *  2. Sesudah diurai, teksnya tersimpan sebagai string HEKSADESIMAL di dalam
 *     operator TJ — `[<505420554a49> 30 <4b4f50>] TJ` adalah "PT UJI" + "KOP".
 *     Angka di antaranya kerning, dan harus dibuang.
 *
 * Asumsi pertama penulisnya ("pdfkit tak mengompresi teks sederhana") keliru
 * di KEDUA lapis. Yang dibetulkan cara memeriksanya, bukan harapannya.
 *
 * Dipindah ke `test-utils` pada 2026-08-17 saat pemeriksa kedua muncul
 * (RK3K). Menyalinnya berarti dua salinan yang salah dengan cara berbeda —
 * dan pemeriksa PDF yang salah TIDAK gagal: ia memulangkan string kosong,
 * lalu `toContain` gagal sambil menuduh dokumennya, padahal yang rusak
 * pembacanya.
 *
 * ⚠ Karena teks dirakit ulang dari pecahan per-operator TJ, KALIMAT PANJANG
 * BISA TERPOTONG di tengah kata. Periksalah frasa pendek (judul, nama, label)
 * — bukan satu kalimat utuh. Satu assertion sudah pernah merah karena ini,
 * dan dokumennya baik-baik saja.
 */
export function teksPdf(buf: Buffer): string {
  const mentah = buf.toString('latin1')
  const TANDA = 'stream'
  let terurai = ''
  let i = mentah.indexOf(TANDA)
  while (i >= 0) {
    // Lewati 'stream' beserta akhir barisnya (CR opsional, lalu LF).
    let mulai = i + TANDA.length
    if (mentah.charCodeAt(mulai) === 13) mulai++
    if (mentah.charCodeAt(mulai) === 10) mulai++
    const akhir = mentah.indexOf('endstream', mulai)
    if (akhir > mulai) {
      try {
        terurai += inflateSync(Buffer.from(mentah.slice(mulai, akhir), 'latin1')).toString('latin1')
      } catch { /* bukan stream terkompresi (font, gambar) — dilewati */ }
    }
    i = mentah.indexOf(TANDA, mulai)
  }

  // Tiap `<...>` di dalam stream diterjemahkan dari hex. Yang bukan hex sah
  // dilewati, bukan membuat seluruh pemeriksaan gagal.
  let hurufnya = ''
  let j = terurai.indexOf('<')
  while (j >= 0) {
    const tutup = terurai.indexOf('>', j)
    if (tutup < 0) break
    const hex = terurai.slice(j + 1, tutup)
    if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      for (let k = 0; k < hex.length; k += 2) {
        hurufnya += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16))
      }
    }
    j = terurai.indexOf('<', tutup + 1)
  }

  return `${hurufnya}\n${terurai}\n${mentah}`
}
