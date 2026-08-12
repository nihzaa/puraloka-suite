#!/usr/bin/env node
/**
 * PENJAGA: byte kontrol tersembunyi di kode sumber.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG MELAHIRKANNYA — dan berapa lama ia bertahan
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 2026-08-12. Dedup automation kasbon TIDAK BEKERJA: tiap denyut penjadwal
 * mengirim ulang notifikasi yang sama. Sebabnya satu byte:
 *
 *     terkirim.add(`${n.type}\u0000${rid}`)     ← ditulis: NUL
 *     terkirim.has(`${type} ${recordId}`)       ← dicari: SPASI
 *
 * Panjang string SAMA (55 karakter). Di editor, di `git diff`, di
 * `console.log`, dan di seluruh keluaran test — keduanya terlihat IDENTIK.
 * TypeScript menerimanya (keduanya `string`), lint tak mengeluh, dan test
 * unit lolos karena barisnya masih sedikit.
 *
 * Biayanya nyata: LIMA putaran diagnosis salah sebelum ketemu (paging
 * PostgREST, ORDER BY, zona waktu, urutan test, isolasi fixture). Tiap
 * hipotesis masuk akal, tiap perbaikan sah secara teknis, dan tak satu pun
 * menyentuh sebabnya. Yang akhirnya menemukannya: mencetak `JSON.stringify`
 * di TITIK perbandingan — satu-satunya tempat yang memunculkan `\u0000`.
 *
 * Asalnya bukan diketik manusia: skrip `node -e` yang menulis berkas ini
 * memakai template literal, dan shell memangsa spasinya jadi NUL. Kelas
 * cacat yang lahir dari ALAT, bukan dari kelalaian — dan itu justru
 * membuatnya berulang.
 *
 * ── Yang dijaga
 *
 * Byte < 0x20 di berkas sumber, KECUALI tab (9), LF (10), CR (13).
 * Ambang NOL: tak ada alasan sah menaruh NUL/BEL/ESC di dalam kode. Kalau
 * suatu saat memang perlu (mis. konstanta protokol biner), tulis sebagai
 * escape yang TERLIHAT — `'\u0000'` — bukan byte mentah yang tak kasat mata.
 *
 * Jalankan: node apps/api/scripts/audit-byte-kontrol.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const AKAR_REPO = join(import.meta.dirname, '..', '..', '..')

/** Direktori sumber yang dipindai. */
const WILAYAH = [
  join(AKAR_REPO, 'apps', 'api', 'src'),
  join(AKAR_REPO, 'apps', 'api', 'scripts'),
  join(AKAR_REPO, 'apps', 'web', 'app'),
  join(AKAR_REPO, 'apps', 'web', 'components'),
  join(AKAR_REPO, 'apps', 'web', 'lib'),
  join(AKAR_REPO, 'apps', 'web', 'scripts'),
]

const EKSTENSI = ['.ts', '.tsx', '.mjs', '.js', '.jsx']
const LEWATI = new Set(['node_modules', '.next', 'dist', 'build', '.turbo'])

/** Tab, LF, CR — satu-satunya kontrol yang sah di berkas teks. */
const SAH = new Set([9, 10, 13])

function berkasSumber(dir) {
  let hasil = []
  let isi
  try {
    isi = readdirSync(dir, { withFileTypes: true })
  } catch {
    return hasil // direktori tak ada — bukan galat
  }
  for (const e of isi) {
    if (e.isDirectory()) {
      if (LEWATI.has(e.name)) continue
      hasil = hasil.concat(berkasSumber(join(dir, e.name)))
      continue
    }
    if (EKSTENSI.some(x => e.name.endsWith(x))) hasil.push(join(dir, e.name))
  }
  return hasil
}

const temuan = []
let diperiksa = 0

for (const wilayah of WILAYAH) {
  for (const f of berkasSumber(wilayah)) {
    diperiksa++
    const isi = readFileSync(f, 'utf8')
    for (let i = 0; i < isi.length; i++) {
      const kode = isi.charCodeAt(i)
      if (kode < 32 && !SAH.has(kode)) {
        // Nomor baris supaya bisa langsung dibuka, bukan dicari sendiri.
        const baris = isi.slice(0, i).split('\n').length
        temuan.push({
          berkas: f.slice(AKAR_REPO.length + 1).replace(/\\/g, '/'),
          baris,
          kode,
          sekitar: JSON.stringify(isi.slice(Math.max(0, i - 40), i + 12)),
        })
        break // satu temuan per berkas sudah cukup untuk merahkan
      }
    }
  }
}

console.log(`Berkas sumber diperiksa: ${diperiksa}`)
console.log(`  byte kontrol    : ${temuan.length}`)
console.log('  ambang          : 0 (bukan ratchet)')

if (temuan.length > 0) {
  console.error(`\n❌ ${temuan.length} berkas memuat byte kontrol TAK KASAT MATA\n`)
  console.error('   Byte ini terlihat identik dengan spasi di editor, diff, dan log —')
  console.error('   dan membuat perbandingan string gagal tanpa satu pun gejala.\n')
  for (const t of temuan) {
    console.error(`     ${t.berkas}:${t.baris}  kode ${t.kode}`)
    console.error(`        ${t.sekitar}`)
  }
  console.error('\n   Perbaikan: ganti byte mentahnya dengan karakter yang dimaksud')
  console.error('   (biasanya spasi), atau tulis sebagai escape terlihat \\u0000.\n')
  process.exit(1)
}

console.log('\n✓ Nol byte kontrol tersembunyi di kode sumber.')
