#!/usr/bin/env node
/**
 * PENJAGA: tiap rute dinamis punya contoh id di `audit-a11y-runtime.mjs`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `audit-a11y-runtime.mjs` memindai halaman yang benar-benar dirender. Rute
 * dinamis (`/proyek/[id]`) butuh contoh id; tanpa itu ia DILEWATI.
 *
 * Skrip itu sudah jujur — ia mencetak "rute dinamis TERLEWAT" beserta
 * daftarnya. Tapi kejujuran di baris keenam output tak menghentikan siapa pun:
 * diukur 2026-08-07, audit melaporkan **"0 pelanggaran"** sambil melewati
 * **enam halaman**, dan itu terbaca sebagai cakupan penuh.
 *
 * Sesudah keenamnya diberi contoh id, dua di antaranya ternyata memang bersih
 * — tapi itu baru diketahui SESUDAH dipindai. Sebelumnya tak ada yang tahu,
 * dan tak ada yang bisa tahu.
 *
 * ── Kenapa statis, bukan bagian dari audit runtime-nya
 *
 * Audit runtime butuh server web berjalan dan peramban; CI belum punya
 * keduanya. Penjaga ini hanya membaca berkas, jadi ia bisa jalan di CI hari
 * ini — dan yang dijaganya adalah bagian yang paling mudah lolos: halaman
 * dinamis BARU yang ditambahkan tanpa contoh id, lalu tak pernah dipindai
 * siapa pun.
 *
 * ── Yang TIDAK dijaga di sini
 *
 * Apakah id-nya masih sah di basis, dan apakah halamannya benar-benar bersih.
 * Keduanya hanya bisa dijawab dengan menjalankan audit runtime-nya:
 *
 *   LAYAR_EMAIL=... LAYAR_SANDI=... LAYAR_ID_PROYEK=... \
 *     node apps/web/scripts/audit-a11y-runtime.mjs [--gelap]
 *
 * Pakai (dari akar repo): node apps/web/scripts/uji-rute-dinamis-teraudit.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const AUDIT = join(WEB, 'scripts', 'audit-a11y-runtime.mjs')

// ── Rute dinamis yang ada di berkas ───────────────────────────────────────
//
// Aturan penelusurannya SENGAJA disamakan dengan `halamanDariBerkas()` di
// audit-a11y-runtime: folder `_*` dilewati, folder `(grup)` tak menambah
// segmen. Kalau keduanya menyimpang, penjaga ini akan menjaga daftar yang
// berbeda dari yang benar-benar dipindai — dan itu lebih buruk daripada tak
// ada penjaga sama sekali.
const rute = []
const telusuri = (dir, jalur) => {
  for (const isi of readdirSync(dir, { withFileTypes: true })) {
    if (isi.isDirectory()) {
      if (isi.name.startsWith('_')) continue
      telusuri(join(dir, isi.name), jalur + (isi.name.startsWith('(') ? '' : `/${isi.name}`))
    } else if (isi.name === 'page.tsx' && jalur.includes('[')) {
      rute.push(jalur)
    }
  }
}
telusuri(join(WEB, 'app'), '')

const dinamis = [...new Set(rute)].sort()

// ── Rute yang punya entri di CONTOH_ID ────────────────────────────────────
const isi = readFileSync(AUDIT, 'utf8')
const blok = isi.match(/const CONTOH_ID = \{([\s\S]*?)\n\}/)
if (!blok) {
  console.error('❌ Blok `CONTOH_ID` tak ditemukan di audit-a11y-runtime.mjs.')
  console.error('   Kalau namanya diubah, perbarui penjaga ini — jangan dihapus.')
  process.exit(2)
}
const terdaftar = new Set(
  [...blok[1].matchAll(/'([^']+)'\s*:/g)].map((m) => m[1]),
)

const kurang = dinamis.filter((r) => !terdaftar.has(r))

console.log('')
console.log('══ Rute dinamis vs contoh id audit a11y ══════════════════════')
console.log(`  rute dinamis     : ${dinamis.length}`)
console.log(`  punya contoh id  : ${dinamis.length - kurang.length}`)
console.log('')

if (kurang.length === 0) {
  console.log('✅ Tiap rute dinamis bisa dipindai audit a11y runtime.')
  console.log('')
  process.exit(0)
}

console.error(`❌ ${kurang.length} rute dinamis TAK BISA dipindai:`)
for (const r of kurang) console.error(`     ${r}`)
console.error('')
console.error('   Tambahkan entri di `CONTOH_ID` pada')
console.error('   apps/web/scripts/audit-a11y-runtime.mjs, mis:')
console.error("     '/anu/[id]': process.env.LAYAR_ID_ANU,")
console.error('')
console.error('   Kenapa ini ditegakkan: audit yang melewati halaman tetap')
console.error('   melaporkan "0 pelanggaran", dan itu terbaca sebagai cakupan')
console.error('   penuh. Diukur 2026-08-07: enam halaman terlewat selama ini.')
console.error('')
process.exit(1)
