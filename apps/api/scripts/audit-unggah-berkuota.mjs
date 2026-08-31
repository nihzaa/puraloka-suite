#!/usr/bin/env node
/**
 * Tiap titik unggah wajib memeriksa kuota penyimpanan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `kuota.penyimpanan_gb` terdaftar di katalog sejak migrasi 538 dan dijual di
 * halaman paket — dengan NOL pembaca sampai 2026-09-01. Paket yang
 * menjanjikan "5 GB" tak membatasi apa pun, dan yang bergejala cuma tagihan
 * penyimpanan vendor yang naik tanpa ada yang tahu sebabnya.
 *
 * Sesudah kuotanya dipasang, bahaya berikutnya bukan kuota yang salah
 * melainkan titik unggah BARU yang lupa memeriksanya. Bentuk kegagalannya:
 * unggahan itu lolos tanpa dihitung, kuota tetap terlihat bekerja karena
 * titik lain menolak, dan batas "5 GB" diam-diam jadi entah berapa.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA HAL YANG DIPERIKSA
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. tiap berkas rute yang memanggil `.upload(` juga memanggil
 *      `muatPenyimpanan(`
 *   2. tiap BUCKET yang ditulis kode ikut DIHITUNG fungsi basisnya
 *
 * Yang (2) lahir dari kesalahan nyata: migrasi 555 mendaftarkan tiga bucket
 * sementara kode menulis ke ENAM. Berkas di `expense-receipts`,
 * `payment-proofs`, dan `company-assets` tak pernah terhitung — kuota
 * menolak saat "penuh" sambil melewatkan sebagian pemakaian.
 *
 * Hitungan yang meleset pelan-pelan lebih buruk daripada tak ada hitungan:
 * ia terlihat seperti bekerja.
 *
 * ⚠ Ambang NOL untuk keduanya.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const AKAR = join(DIR, '..', '..', '..')
const RUTE = join(DIR, '..', 'src', 'routes', 'v1')
const MIGRASI = join(AKAR, 'db', 'migrations')

console.log('\n══ Unggah berkuota ════════════════════════════════════════════\n')

/**
 * Komentar dilucuti sebelum apa pun diperiksa.
 *
 * Penjaga yang puas oleh komentar sudah terjadi DUA KALI di repo ini
 * (jual-tak-bocor, pendaftaran-publik): sebuah baris
 * `// muatPenyimpanan(...)` bukan pemeriksaan.
 */
const kode = (teks) =>
  teks
    .split('\n')
    .filter((b) => {
      const t = b.trim()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')

const pelanggaran = []

// ── 1. Tiap berkas ber-.upload( wajib ber-muatPenyimpanan( ─────────────────
const berkasRute = readdirSync(RUTE).filter((f) => f.endsWith('.ts'))
const bucketDipakai = new Set()
let titikUnggah = 0

for (const f of berkasRute) {
  const isi = kode(readFileSync(join(RUTE, f), 'utf8'))
  if (!isi.includes('.upload(')) continue
  titikUnggah++

  if (!isi.includes('muatPenyimpanan(')) {
    pelanggaran.push({
      jenis: 'TANPA KUOTA',
      nilai: f,
      pesan: 'memanggil .upload() tanpa muatPenyimpanan() — unggahan lolos tanpa dihitung',
    })
  }

  // Bucket yang ditulis berkas ini. Dua bentuk: literal, atau konstanta yang
  // nilainya didefinisikan di berkas yang sama.
  for (const m of isi.matchAll(/\.from\('([a-z][a-z0-9-]*)'\)\s*\n?\s*\.?upload\(/g)) {
    bucketDipakai.add(m[1])
  }
  for (const m of isi.matchAll(/\.from\(([A-Z][A-Z0-9_]*)\)\s*\n?\s*\.?upload\(/g)) {
    const konst = new RegExp(`${m[1]}\\s*=\\s*'([a-z][a-z0-9-]*)'`).exec(isi)
    if (konst) bucketDipakai.add(konst[1])
    else {
      pelanggaran.push({
        jenis: 'BUCKET TAK TERBACA',
        nilai: `${f} → ${m[1]}`,
        pesan: 'nilai konstanta bucket tak ditemukan di berkas yang sama — penjaga ini buta terhadapnya',
      })
    }
  }
}

if (titikUnggah === 0) {
  console.error('✗ Nol berkas ber-.upload() — polanya berubah? Penjaga ini buta.')
  process.exit(1)
}

// ── 2. Tiap bucket wajib DIHITUNG fungsi basisnya ──────────────────────────
//
// Sumbernya migrasi TERBARU yang mendefinisikan ulang fungsinya. Membaca
// migrasi pertama saja berarti menganggap fungsinya beku sejak hari ia
// ditulis — dan ia sudah diperbaiki sekali (555 → 556).
const migrasiFungsi = readdirSync(MIGRASI)
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .filter((f) => readFileSync(join(MIGRASI, f), 'utf8').includes('FUNCTION hitung_penyimpanan_tenant'))
  .sort()

if (migrasiFungsi.length === 0) {
  console.error('✗ Tak ada migrasi yang mendefinisikan hitung_penyimpanan_tenant.')
  process.exit(1)
}

const sumberFungsi = readFileSync(join(MIGRASI, migrasiFungsi[migrasiFungsi.length - 1]), 'utf8')

// Bucket yang SENGAJA tak dihitung, dengan alasannya. Yang tak terdaftar di
// sini dan tak dihitung fungsinya = pelanggaran.
const SENGAJA_TAK_DIHITUNG = {
  situs: 'bucket situs publik — isinya diunggah vendor, bukan tenant',
}

for (const b of bucketDipakai) {
  if (b in SENGAJA_TAK_DIHITUNG) continue
  if (!sumberFungsi.includes(`'${b}'`)) {
    pelanggaran.push({
      jenis: 'BUCKET TAK DIHITUNG',
      nilai: b,
      pesan: `ditulis kode tapi tak ada di ${migrasiFungsi[migrasiFungsi.length - 1]} — berkasnya tak pernah masuk hitungan kuota`,
    })
  }
}

console.log(`  berkas ber-unggah   : ${titikUnggah}`)
console.log(`  bucket ditulis kode : ${[...bucketDipakai].sort().join(', ')}`)
console.log(`  fungsi hitung       : ${migrasiFungsi[migrasiFungsi.length - 1]}`)

if (pelanggaran.length) {
  console.error(`\n❌ MERAH: ${pelanggaran.length} pelanggaran.\n`)
  for (const p of pelanggaran) {
    console.error(`   [${p.jenis}] ${p.nilai}`)
    console.error(`      ${p.pesan}`)
  }
  console.error(
    '\n  Unggahan yang lolos tanpa dihitung TIDAK mengeluarkan galat. Kuota\n' +
      '  tetap terlihat bekerja — ia menolak saat "penuh" — sambil melewatkan\n' +
      '  sebagian pemakaian, jadi batas 5 GB sebenarnya entah berapa.\n' +
      '  Hitungan yang meleset pelan-pelan lebih buruk daripada tak ada.\n'
  )
  process.exit(1)
}

console.log('\n✅ Tiap titik unggah berkuota, dan tiap bucket ikut dihitung.\n')
