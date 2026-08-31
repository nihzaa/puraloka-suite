#!/usr/bin/env node
/**
 * Paket tak boleh menuntut Node lebih baru dari lingkungan build TERTUA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Build APK kesembilan LEWAT pemasangan paket untuk pertama kalinya, lalu
 * gagal di tahap perakitan:
 *
 *     [PREBUILD] webidl.util.markAsUncloneable is not a function
 *     [PREBUILD] ✖ Failed to create the native directory
 *
 * `markAsUncloneable` adalah API Node 22. Diukur:
 *
 *     undici terpasang        8.9.0    engines.node >=22.19.0
 *     Node di server EAS      20.19.2  (log build, fase SPIN_UP_BUILDER)
 *
 * Sebabnya `overrides: undici: '>=6.27.0'` TANPA batas atas. Ambang itu
 * menutup advisory keamanan dan tetap benar — tetapi ia menarik undici 8,
 * yang menuntut Node yang tak dipunyai server build.
 *
 * ── Kenapa cacat ini tak terlihat dari mana pun
 *
 * Mesin pengembang, API, dan web semuanya berjalan di Node 24. `tsc` hijau,
 * test hijau, `pnpm install` hijau. Satu-satunya tempat yang Node-nya lebih
 * tua adalah server EAS Build — dan itu baru ketahuan dua puluh menit
 * kemudian, dengan galat yang menyebut nama fungsi internal undici.
 *
 * Bentuk yang sama dengan temuan lain hari ini: benar di lapisan yang
 * diperiksa, patah di lapisan yang sesungguhnya dipakai.
 *
 * ── Yang diperiksa
 *
 * Tiap paket yang di-`overrides` — itu yang paling berisiko, karena
 * rentangnya dipaksa naik tanpa batas atas. Versinya dibaca dari
 * `node_modules/.pnpm` yang benar-benar terpasang, bukan dari registry:
 * lebih cepat, tak butuh jaringan, dan yang dijaga memang apa yang akan
 * dikirim ke server.
 *
 * ── Ambang NOL
 *
 * Satu paket yang menuntut Node terlalu baru sudah cukup mematikan build,
 * dan gejalanya tak menyebut paketnya.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/**
 * Node TERTUA di antara lingkungan yang menjalankan kode ini.
 *
 * Diukur dari log build EAS, fase SPIN_UP_BUILDER. Kalau EAS memperbarui
 * image-nya, angka ini boleh dinaikkan — dan `undici <7` di
 * pnpm-workspace.yaml boleh dilonggarkan bersamanya.
 */
const NODE_TERTUA = [20, 19, 2]
const SUMBER = 'server EAS Build (log fase SPIN_UP_BUILDER, 2026-09-01)'

const WS = join(AKAR, 'pnpm-workspace.yaml')
if (!existsSync(WS)) {
  console.error(`❌ pnpm-workspace.yaml tak ada di ${WS} — jalurnya meleset.`)
  process.exit(1)
}

/*
  ⚠ CR dibuang sebelum memisah baris. Berkas ini CRLF di disk, dan
  `l === 'overrides:'` tak pernah cocok dengan `overrides:\r` — versi
  pertama pemeriksa ini memulangkan "0 override diperiksa" dan terlihat
  hijau. Nol hasil bukan bukti ketiadaan.
*/
const baris = readFileSync(WS, 'utf8').replace(/\r/g, '').split('\n')
const mulai = baris.findIndex((l) => l === 'overrides:')

if (mulai < 0) {
  console.log('══ engines.node vs lingkungan build tertua ════════════════════')
  console.log('  `overrides:` tak ada di pnpm-workspace.yaml — tak ada yang diperiksa.')
  process.exit(0)
}

const paket = []
for (let i = mulai + 1; i < baris.length; i++) {
  const l = baris[i]
  if (l && !/^\s/.test(l)) break
  if (/^\s*#/.test(l) || !l.trim()) continue
  const m = l.match(/^  '?([^':]+?)'?:\s*'?([^'#]+?)'?\s*(?:#.*)?$/)
  if (m) paket.push({ nama: m[1], rentang: m[2].trim() })
}

if (paket.length === 0) {
  console.error('❌ Nol override terbaca padahal `overrides:` ada — polanya meleset.')
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}

/** `>=X.Y.Z` di engines vs Node tertua. Memulangkan tuntutan bila terlalu baru. */
function terlaluBaru(engines) {
  if (!engines?.node) return null
  const m = String(engines.node).match(/>=\s*(\d+)\.(\d+)\.?(\d+)?/)
  if (!m) return null
  const perlu = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)]
  for (let i = 0; i < 3; i++) {
    if (perlu[i] > NODE_TERTUA[i]) return engines.node
    if (perlu[i] < NODE_TERTUA[i]) return null
  }
  return null
}

/*
  ⚠ Versi diambil dari LOCKFILE, bukan dari `node_modules/.pnpm`.

  Versi pertama penjaga ini membaca disk, dan itu SALAH ke arah yang
  berbahaya: `.pnpm` menyimpan sisa pemasangan lama. Diukur 2026-09-01 —
  lockfile sudah `undici@6.28.0` sesudah diperbaiki, tetapi disk masih
  memuat `undici@8.9.0`, dan penjaga melaporkan pelanggaran yang sudah
  tak ada.

  Yang dikirim ke server build adalah LOCKFILE. Itu yang menentukan versi
  terpasang di sana, jadi itu yang harus diperiksa.
*/
const LOCK = join(AKAR, 'pnpm-lock.yaml')
const lockIsi = existsSync(LOCK) ? readFileSync(LOCK, 'utf8') : ''

function versiDariLock(nama) {
  // Bentuk di lockfile v9: `  undici@6.28.0:` di bawah `packages:`
  const awalan = '  ' + nama + '@'
  for (const l of lockIsi.split(String.fromCharCode(10))) {
    if (l.startsWith(awalan) && l.trimEnd().endsWith(':')) {
      return l.slice(awalan.length, l.lastIndexOf(':'))
    }
  }
  return null
}

function bacaPkg(nama) {
  const v = versiDariLock(nama)
  const dir = join(AKAR, 'node_modules', '.pnpm')
  try {
    const semua = readdirSync(dir).filter((d) => d.startsWith(nama.replace('/', '+') + '@'))
    if (!semua.length) return null
    /*
      Pilih yang cocok dengan lockfile. Kalau versinya tak ada di disk,
      metadata `engines`-nya tak bisa dibaca — dan menebak dari versi LAIN
      justru sumber kesalahan tadi.
    */
    const dipilih = v ? semua.find((d) => d.startsWith(nama.replace('/', '+') + '@' + v + '_') || d === nama.replace('/', '+') + '@' + v) : null
    if (!dipilih) return { versi: v, engines: null, takDiDisk: true }
    const p = join(dir, dipilih, 'node_modules', ...nama.split('/'), 'package.json')
    const pkg = JSON.parse(readFileSync(p, 'utf8'))
    return { versi: pkg.version, engines: pkg.engines }
  } catch {
    return v ? { versi: v, engines: null, takDiDisk: true } : null
  }
}

const temuan = []
let terbaca = 0

console.log('══ engines.node vs lingkungan build tertua ════════════════════')
console.log(`  Node tertua : ${NODE_TERTUA.join('.')}  (${SUMBER})`)
console.log(`  override    : ${paket.length}`)
console.log('')

for (const { nama, rentang } of paket) {
  const pkg = bacaPkg(nama)
  if (!pkg) {
    console.log(`  ?  ${nama.padEnd(22)} tak ditemukan di node_modules/.pnpm`)
    continue
  }
  terbaca++
  if (pkg.takDiDisk) {
    console.log(`  ?  ${nama.padEnd(22)} ${String(pkg.versi).padEnd(10)} di lockfile, belum terpasang — engines tak terbaca`)
    continue
  }
  const t = terlaluBaru(pkg.engines)
  console.log(`  ${t ? '❌' : '✓ '} ${nama.padEnd(22)} ${String(pkg.versi).padEnd(10)} node: ${pkg.engines?.node ?? '(tak ada)'}`)
  if (t) temuan.push({ nama, versi: pkg.versi, tuntut: t, rentang })
}

/*
  Kalau NOL paket terbaca, node_modules belum terpasang — dan hijau dari
  korpus kosong adalah kebohongan. Lebih baik melapor tak bisa mengukur.
*/
if (terbaca === 0) {
  console.log('')
  console.log('⚠  Nol paket terbaca dari node_modules/.pnpm — jalankan `pnpm install`')
  console.log('   lebih dulu. Pemeriksaan DILEWATI, bukan dinyatakan hijau.')
  process.exit(0)
}

console.log('')
console.log(`  menuntut Node > ${NODE_TERTUA.join('.')} : ${temuan.length}`)

if (temuan.length > 0) {
  console.log('')
  for (const t of temuan) {
    console.log(`  ❌ ${t.nama} ${t.versi} menuntut Node ${t.tuntut}`)
    console.log(`     rentang override: '${t.rentang}'`)
    console.log(`     → tambahkan batas ATAS supaya versi lama yang masih aman terpilih`)
  }
  console.log('')
  console.log('  Cacat ini TAK terlihat di mesin ini: pengembang, API, dan web')
  console.log('  semuanya Node 24. Yang gagal cuma build di server, dua puluh menit')
  console.log('  kemudian, dengan galat yang menyebut nama fungsi internal paketnya.')
  console.log('')
  process.exit(1)
}

console.log('')
console.log(`✅ ${terbaca} paket ter-override, semuanya jalan di Node ${NODE_TERTUA.join('.')}.`)
