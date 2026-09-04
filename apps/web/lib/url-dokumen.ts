/*
  ══════════════════════════════════════════════════════════════════════════
  URL PUBLIK UNTUK DOKUMEN — satu sumber, tak pernah dipaku
  ══════════════════════════════════════════════════════════════════════════

  Dilaporkan founder 2026-09-04: footer invoice PDF berbunyi

      Verifikasi keabsahan dokumen: puraloka.app/verify/invoice/<id>

  `puraloka.app` TAK PERNAH ADA. Domain sungguhannya
  `app.puraloka-suite.duckdns.org`, dan QR code di dokumen yang sama juga
  menunjuk ke sana — jadi klien yang memindainya untuk memastikan invoice itu
  asli mendapat halaman mati.

  ── Kenapa ini lebih buruk daripada tautan rusak biasa

  Yang dijanjikan footer itu adalah BUKTI KEASLIAN. Tautan yang tak bisa
  dibuka pada dokumen tagihan justru membuat penerimanya curiga dokumennya
  palsu — kebalikan persis dari gunanya. Dan tak ada satu pun galat: PDF-nya
  terbentuk sempurna, QR-nya terbaca rapi, isinya saja yang menunjuk
  ke mana-mana.

  ── Kenapa `window.location.origin`, bukan variabel env

  Founder memintanya "ikut domain yang saya pakai, jangan hardcode, kalau
  domainnya ganti ikut ganti". Env var TETAP perlu diperbarui saat domain
  berubah — ia cuma memindahkan pakuan dari kode ke berkas konfigurasi, dan
  berkas itu punya kebiasaan tertinggal (lihat `NEXT_PUBLIC_API_URL` yang
  menunjuk port 3007 sementara API di 3001, CLAUDE.md §7 — empat jam hilang).

  `window.location.origin` adalah domain yang BENAR-BENAR sedang dipakai
  orang yang menekan tombol unduh. Ganti domain, pindah server, tambah
  subdomain untuk tenant lain — semuanya ikut sendiri, tanpa ada yang perlu
  diingat.

  ── Kalau dipanggil di server (SSR)

  `window` tak ada di sana. Jatuhannya `NEXT_PUBLIC_APP_URL` bila diisi, lalu
  string kosong — dan string kosong menghasilkan URL RELATIF (`/verify/...`),
  yang tetap benar bila dibuka dari peramban yang sama. Yang TIDAK boleh:
  menjatuhkannya ke sebuah domain tebakan. Domain tebakan itulah cacat yang
  berkas ini ada untuk mencegah.
*/

/** Asal (scheme + host) aplikasi ini, dibaca dari peramban yang sedang memakainya. */
export function asalAplikasi(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  // SSR: env bila diisi, kalau tidak biarkan relatif. JANGAN menebak domain.
  return process.env.NEXT_PUBLIC_APP_URL ?? ''
}

/**
 * URL verifikasi publik untuk sebuah dokumen.
 *
 * Dipakai DUA kali per dokumen — teks footer dan isi QR code — dan keduanya
 * WAJIB dari fungsi ini. Sampai 2026-09-04 keduanya ditulis terpisah, dan
 * memperbaiki salah satunya saja meninggalkan QR yang menunjuk domain mati
 * tanpa satu pun gejala di layar.
 *
 * @param jenis  jenis dokumen — `invoice`, dan yang menyusul kelak
 * @param id     id dokumen
 */
export function urlVerifikasi(jenis: string, id: string): string {
  return `${asalAplikasi()}/verify/${jenis}/${id}`
}

/**
 * Bentuk yang enak dibaca manusia di atas kertas — tanpa `https://`.
 *
 * Dicetak di footer PDF, tempat skema `https://` hanya menambah panjang
 * baris tanpa menolong siapa pun: yang membacanya mengetiknya ulang di
 * peramban, dan peramban menambahkan skemanya sendiri.
 */
export function urlVerifikasiTampil(jenis: string, id: string): string {
  return urlVerifikasi(jenis, id).replace(/^https?:\/\//, '')
}
