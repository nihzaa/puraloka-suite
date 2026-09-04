#!/usr/bin/env node
/**
 * audit-url-dokumen-tak-dipaku.mjs — ambang NOL
 *
 * Menjaga tiga hal yang bersama-sama membuat verifikasi dokumen berfungsi:
 *
 *   1. tak ada domain milik sendiri yang DIPAKU di kode dokumen
 *   2. teks footer dan isi QR memakai helper yang SAMA
 *   3. `/verify` terdaftar publik DAN dikecualikan dari alih-saat-login
 *
 * ── Cacat yang ditutup
 *
 * Dilaporkan founder 2026-09-04 dari PDF invoice sungguhan:
 *
 *     Verifikasi keabsahan dokumen: puraloka.app/verify/invoice/<id>
 *
 * `puraloka.app` tak pernah ada. Domainnya `app.puraloka-suite.duckdns.org`.
 * Dan QR code di dokumen yang sama menunjuk ke domain mati itu juga — dua
 * tempat terpisah, jadi memperbaiki salah satunya meninggalkan yang lain
 * tanpa gejala apa pun di layar.
 *
 * Ditelusuri, ada cacat KETIGA yang lebih dalam: `/verify` tak terdaftar di
 * `PUBLIC_ROUTES`, jadi produksi membalas
 *
 *     GET /verify/invoice/<id>  ->  307  location: /login
 *
 * Halaman pembuktian keaslian yang menuntut login. Yang membukanya KLIEN,
 * dan klien tak punya akun.
 *
 * Dan cacat KEEMPAT yang lahir dari perbaikan cacat ketiga: rute publik yang
 * dibuka saat SUDAH login dilempar ke home, jadi staf sendiri tak pernah bisa
 * membuka tautan yang mereka kirim. Karena itu `/verify` juga wajib ada di
 * pengecualian alih-saat-login.
 *
 * ── Kenapa bukan sekadar diperbaiki
 *
 * Tak satu pun dari 200+ penjaga, `tsc`, atau seluruh test menangkapnya.
 * String domain adalah string yang sah; PDF-nya terbentuk sempurna dan QR-nya
 * terbaca rapi. Satu-satunya gejala ada di atas kertas, di tangan orang luar.
 *
 * Dan taruhannya bukan kenyamanan: tautan verifikasi yang tak bisa dibuka
 * pada dokumen TAGIHAN membuat penerimanya curiga dokumennya palsu —
 * kebalikan persis dari gunanya.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const WEB = join(AKAR, 'apps', 'web')

const berkas = []
;(function jelajah(d) {
  for (const n of readdirSync(d)) {
    if (n === 'node_modules' || n === '.next' || n.startsWith('.')) continue
    const p = join(d, n)
    if (statSync(p).isDirectory()) jelajah(p)
    else if (/\.(ts|tsx)$/.test(n)) berkas.push(p)
  }
})(WEB)

const temuan = []

/*
  1 — domain milik sendiri yang dipaku.

  Yang dicari BUKAN "semua URL": tautan ke dokumentasi pihak lain
  (openai.com, resend.com) memang harus dipaku, dan `placeholder=` di form
  memang berisi contoh. Yang dicari domain yang terlihat MILIK SENDIRI —
  memuat "puraloka" — di luar konteks contoh.
*/
for (const p of berkas) {
  const isi = readFileSync(p, 'utf8')

  /*
    Komentar dibuang lebih dulu, dengan MENGOSONGKANNYA bukan menghapusnya —
    supaya nomor baris temuan tetap menunjuk baris yang sama di editor.

    Kenapa perlu: berkas `lib/url-dokumen.ts` menjelaskan cacat ini panjang
    lebar, dan penjelasannya MENYEBUT `puraloka.app`. Penjaga versi pertama
    menuduhnya — persis kelas cacat yang CLAUDE.md §8a.2 peringatkan:
    penjelasan yang BENAR dituduh sebagai keadaan yang SALAH.

    Sebuah penjaga yang memerahkan dokumentasi tentang dirinya sendiri
    mengajari orang menghapus dokumentasi itu.
  */
  const tanpaKomentar = isi
    .replace(/\/\*[\s\S]*?\*\//g, (blok) => blok.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((b) => (/^\s*\/\//.test(b) ? '' : b))
    .join('\n')

  const baris = tanpaKomentar.split('\n').map((b) => b.replace(/\r/g, ''))
  baris.forEach((b, i) => {
    /*
      Skema `https://` SENGAJA opsional. Uji mutasi 2026-09-04: footer
      dikembalikan ke bentuk aslinya — `puraloka.app/verify/...`, TANPA
      skema — dan penjaga versi pertama LOLOS. Ia menuntut `https?://`
      yang memang tak pernah ada di footer PDF, karena di atas kertas
      skema itu hanya menambah panjang baris.

      Penjaga yang tak menangkap bentuk ASLI cacatnya adalah hiasan.
    /*
      Skema `https://` opsional, dan `[a-z0-9-]+\.` BERULANG — bukan
      `[a-z0-9.-]*` seperti versi pertama.
      Versi pertama LOLOS pada cacat aslinya, dan sebabnya rakus: pada
      `puraloka.app/verify/invoice/{i`, kelas `[a-z0-9.-]*` menelan
      `.app/verify/invoice/` sampai habis, lalu `\.` tak lagi menemukan
      titik — dan mundurnya gagal karena TLD harus di ujung kecocokan.
      Uji mutasi menyatakan HIJAU atas footer yang persis seperti yang
      dilaporkan founder. Penjaga yang tak menangkap bentuk asli cacatnya
      adalah hiasan (CLAUDE.md §8a.2).
    */
    const m = b.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*puraloka[a-z0-9-]*\.(?:app|com|id|net|org)\b/i)
    if (!m) return
    // contoh di form (placeholder=) dan blok dokumentasi env: bukan pemakaian
    if (/placeholder\s*=|placeholder:/.test(b)) return
    if (/APP_URL=|_URL=https/.test(b)) return
    if (/^\s*(\*|\/\/|#)/.test(b)) return            // komentar
    temuan.push({
      berkas: relative(AKAR, p),
      baris: i + 1,
      pesan: `domain dipaku: ${m[0]}`,
    })
  })
}

// 2 — footer dan QR wajib lewat helper yang sama.
const PDF = berkas.filter((p) => /invoice-pdf\.tsx$/.test(p))
for (const p of PDF) {
  const isi = readFileSync(p, 'utf8')
  if (isi.includes('/verify/') && !isi.includes('urlVerifikasi')) {
    temuan.push({
      berkas: relative(AKAR, p),
      baris: 0,
      pesan: 'menyusun URL verifikasi sendiri — wajib lewat `urlVerifikasiTampil()` '
        + 'dari lib/url-dokumen agar sama dengan isi QR',
    })
  }
}
for (const p of berkas) {
  const isi = readFileSync(p, 'utf8')
  if (/QRCode\.toDataURL\(\s*[`'"]https?:/.test(isi)) {
    temuan.push({
      berkas: relative(AKAR, p),
      baris: 0,
      pesan: 'QR code memuat URL yang disusun sendiri — wajib `urlVerifikasi()`',
    })
  }
}

// 3 — /verify publik DAN dikecualikan dari alih-saat-login.
const mw = readFileSync(join(WEB, 'middleware.ts'), 'utf8')
const blokPublik = mw.slice(mw.indexOf('PUBLIC_ROUTES'), mw.indexOf('ROLE_HOME'))
if (!/["']\/verify["']/.test(blokPublik)) {
  temuan.push({
    berkas: 'apps/web/middleware.ts',
    baris: 0,
    pesan: '`/verify` tak terdaftar di PUBLIC_ROUTES — pemindai QR dialihkan ke /login, '
      + 'dan klien penerima invoice tak punya akun',
  })
}
/*
  Dibaca dari BARIS DEKLARASINYA, bukan dari seluruh berkas.

  Uji mutasi 2026-09-04: `TANPA_ALIH_SAAT_LOGIN = []` (dikosongkan) tetap
  LOLOS penjaga versi pertama — karena komentar penjelas di atasnya menyebut
  `TANPA_ALIH_SAAT_LOGIN` DAN `/verify`, dan regexnya cocok pada prosa itu.

  Bentuk yang sama persis dengan cacat di CLAUDE.md §8a.2: penjelasan yang
  BENAR mendampingi keadaan yang SALAH. Komentar dibuang lebih dulu.
*/
const mwKode = mw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((b) => !/^\s*\/\//.test(b))
  .join('\n')
const deklarasi = mwKode.match(/TANPA_ALIH_SAAT_LOGIN\s*=\s*\[[^\]]*\]/)
if (!deklarasi || !/["']\/verify["']/.test(deklarasi[0])) {
  temuan.push({
    berkas: 'apps/web/middleware.ts',
    baris: 0,
    pesan: '`/verify` tak dikecualikan dari alih-saat-login — pengguna yang SUDAH login '
      + 'dilempar ke home dan tak pernah melihat halaman verifikasinya',
  })
}

if (temuan.length > 0) {
  console.error(`❌ ${temuan.length} masalah pada URL verifikasi dokumen:\n`)
  for (const t of temuan) {
    console.error(`   ${t.berkas}${t.baris ? ':' + t.baris : ''}`)
    console.error(`     ${t.pesan}\n`)
  }
  console.error('   Footer PDF menjanjikan BUKTI KEASLIAN. Tautan yang tak bisa')
  console.error('   dibuka pada dokumen tagihan membuat penerimanya curiga')
  console.error('   dokumennya palsu — kebalikan dari gunanya.\n')
  console.error('   Pakai `asalAplikasi()` / `urlVerifikasi()` dari')
  console.error('   `apps/web/lib/url-dokumen.ts`: ia membaca domain yang')
  console.error('   BENAR-BENAR sedang dipakai, jadi ganti domain ikut sendiri.')
  process.exit(1)
}

console.log('✅ URL verifikasi dokumen: nol domain dipaku, helper dipakai, /verify publik')
