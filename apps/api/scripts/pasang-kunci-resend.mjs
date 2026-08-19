#!/usr/bin/env node
/**
 * PEMASANG KUNCI RESEND — supaya kunci tak pernah lewat percakapan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SKRIP INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 2026-08-19 founder menempelkan kunci Resend langsung ke percakapan, lalu
 * bertanya kenapa belum dipasang. Jawabannya: kunci yang sudah masuk riwayat
 * percakapan sudah bocor, dan memasangnya berarti menanam kredensial bocor ke
 * dalam sistem.
 *
 * Skrip ini menutup PENYEBABNYA, bukan cuma gejalanya: kuncinya diminta
 * langsung dari terminal, tak pernah jadi argumen perintah, tak pernah masuk
 * riwayat shell, dan tak pernah ditampilkan ulang.
 *
 * ── Kenapa BUKAN argumen perintah
 *
 * `node pasang-kunci-resend.mjs re_xxx` akan tersimpan di riwayat shell
 * (`~/.bash_history`) dan terlihat di daftar proses (`ps aux`) selama ia
 * berjalan. Keduanya tempat yang tak seorang pun periksa saat mencari
 * kebocoran.
 *
 * Pakai:
 *   node apps/api/scripts/pasang-kunci-resend.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENV = join(AKAR, '.env')

/*
  Pembaca baris manual, BUKAN `readline`.

  Dua bentuk sebelumnya memakai `readline` dengan `_writeToOutput` ditimpa
  supaya ketikan tak tergema. Keduanya MENGGANTUNG pada pertanyaan KEDUA
  dengan "unsettled top-level await" — dan itu baru ketahuan dari MENJALANKAN
  skripnya, bukan dari membacanya.

  `_writeToOutput` adalah API internal Node yang tak dijanjikan stabil, dan
  perilakunya berbeda antara stdin yang TTY dan yang bukan. Membaca `stdin`
  langsung menghindari seluruh persoalan itu.

  Ketikan tetap tak tergema di terminal sungguhan lewat `setRawMode`. Kalau
  stdin bukan TTY (mis. sedang diuji lewat pipa), ia jatuh ke pembacaan biasa
  alih-alih gagal.
*/

/*
  Sisa masukan yang sudah terbaca tapi belum dipakai.

  Saat masukan datang dari PIPA, satu peristiwa `data` bisa membawa SELURUH
  baris sekaligus. Bentuk sebelumnya berhenti di baris-baru pertama lalu
  MEMBUANG sisanya — jadi jawaban KEDUA hilang, dan skripnya diam-diam
  memakai nilai bawaan.

  Gejalanya menipu: skrip melaporkan "berhasil", berkasnya tersimpan, dan cuma
  alamat pengirimnya yang bukan yang diketik. Ditemukan dari MENGUJI jalur
  pipa, bukan dari membacanya.
*/
let sisaMasukan = ''

function bacaBaris(pertanyaan, sembunyikan = false) {
  process.stdout.write(pertanyaan)

  // Kalau baris berikutnya sudah ada di sisa, pakai itu tanpa menunggu.
  const batas = sisaMasukan.indexOf('\n')
  if (batas >= 0) {
    const baris = sisaMasukan.slice(0, batas).replace(/\r$/, '')
    sisaMasukan = sisaMasukan.slice(batas + 1)
    process.stdout.write('\n')
    return Promise.resolve(baris.trim())
  }

  return new Promise((selesai) => {
    const bisaSembunyi = sembunyikan && process.stdin.isTTY === true
    let buf = ''

    if (bisaSembunyi) process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    const tutup = (nilai) => {
      process.stdin.removeListener('data', onData)
      process.stdin.removeListener('end', onEnd)
      if (bisaSembunyi) process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdout.write('\n')
      selesai(nilai)
    }

    // EOF tanpa baris baru — terjadi saat masukan dari pipa habis. Tanpa
    // penanganan ini, promise-nya menggantung selamanya.
    const onEnd = () => tutup(buf.trim())

    const onData = (potongan) => {
      for (let i = 0; i < potongan.length; i++) {
        const ch = potongan[i]

        if (ch === '\n' || ch === '\r') {
          // Sisa potongan DISIMPAN, bukan dibuang — di situlah jawaban
          // berikutnya berada saat masukan datang dari pipa.
          let sisa = potongan.slice(i + 1)
          if (ch === '\r' && sisa.startsWith('\n')) sisa = sisa.slice(1)
          sisaMasukan += sisa
          return tutup(buf.trim())
        }

        // Ctrl-C: saat raw mode aktif, shell tak lagi menanganinya.
        if (ch === '') {
          if (bisaSembunyi) process.stdin.setRawMode(false)
          process.stdout.write('\n')
          process.exit(130)
        }

        if (ch === '' || ch === '\b') {
          buf = buf.slice(0, -1)
          if (bisaSembunyi) process.stdout.write('\b \b')
          continue
        }

        buf += ch
        if (bisaSembunyi) process.stdout.write('*')
      }
    }

    process.stdin.on('data', onData)
    process.stdin.on('end', onEnd)
  })
}

function setel(teks, nama, nilai, akhiran) {
  const pola = new RegExp(`^${nama}=.*$`, 'm')
  if (pola.test(teks)) return teks.replace(pola, `${nama}=${nilai}`)
  const pisah = teks === '' || teks.endsWith(akhiran) ? '' : akhiran
  return `${teks}${pisah}${nama}=${nilai}${akhiran}`
}

console.log('══ Memasang kunci Resend ═══════════════════════════════════════')
console.log()
console.log('  Ambil kuncinya di: https://resend.com/api-keys')
console.log('  Bentuknya: re_xxxxxxxxxxxxxxxxxxxxxx')
console.log()
console.log('  ⚠ Ketikannya TIDAK ditampilkan. Tempel lalu tekan Enter.')
console.log()

const kunci = await bacaBaris('  Kunci Resend: ', true)

if (!kunci) {
  console.error('❌ Kosong — tak ada yang dipasang.')
  process.exit(1)
}

if (!/^re_[A-Za-z0-9_-]{10,}$/.test(kunci)) {
  console.error('❌ Bentuknya tak seperti kunci Resend (harus diawali `re_`).')
  console.error('   Tak dipasang — kunci yang salah bentuk membuat surel gagal')
  console.error('   DIAM-DIAM, dan itu justru yang paling sulit dilacak.')
  process.exit(1)
}

console.log('  Alamat pengirim. Kosongkan untuk memakai alamat gratis Resend')
console.log('  (onboarding@resend.dev) — tak perlu punya domain sendiri.')
console.log()

const dari = await bacaBaris('  Alamat pengirim [onboarding@resend.dev]: ')
const alamat = dari || 'Puraloka Suite <onboarding@resend.dev>'

let isi = existsSync(ENV) ? readFileSync(ENV, 'utf8') : ''
const akhiran = isi.includes('\r\n') ? '\r\n' : '\n'

isi = setel(isi, 'RESEND_API_KEY', kunci, akhiran)
isi = setel(isi, 'EMAIL_FROM', alamat, akhiran)
writeFileSync(ENV, isi)

console.log('✅ Tersimpan di apps/api/.env')
console.log(`   RESEND_API_KEY = re_…${kunci.slice(-4)}   (hanya 4 huruf terakhir)`)
console.log(`   EMAIL_FROM     = ${alamat}`)
console.log()
console.log('   ⚠ .env TER-GITIGNORE — kunci ini tak pernah masuk git.')
console.log()
console.log('   Langkah berikutnya:')
console.log('     1. nyalakan ulang API kalau sedang berjalan')
console.log('     2. uji ke surel ANDA SENDIRI dulu, jangan ke klien —')
console.log('        APP_URL masih localhost:3000, dan ada 8 tombol di badan')
console.log('        surel yang memakainya')
process.exit(0)
