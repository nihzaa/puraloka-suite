#!/usr/bin/env node
/**
 * PENJAGA: impor relatif WAJIB berakhiran `.js` — ESM tak menebak ekstensi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG MELAHIRKANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Proyek ini `"type": "module"` dan dikompilasi ke ESM asli. Di ESM, Node
 * TIDAK menebak ekstensi: `./struktur-beton` harus ditulis
 * `./struktur-beton.js`.
 *
 * Yang membuatnya berbahaya: `tsx` (dipakai saat pengembangan) MENEBAKNYA
 * dengan senang hati, dan `tsc --noEmit` juga LULUS. Jadi impor tanpa
 * ekstensi lolos seluruh pemeriksaan lokal — lalu container produksi mati
 * saat start:
 *
 *     Error [ERR_MODULE_NOT_FOUND]
 *     url: 'file:///app/apps/api/dist/lib/struktur-beton'
 *
 * Diukur 2026-08-30 saat deploy VPS pertama: 26 impor di 15 berkas, seluruhnya
 * di modul struktur baja. Tak satu pun terdeteksi lint, tsc, atau 7.098 test —
 * karena test pun berjalan lewat tsx.
 *
 * Ini kelas cacat "hanya muncul di produksi", dan penjaga ini memindahkannya
 * ke waktu commit.
 *
 * ── Yang TIDAK diperiksa
 *
 * `__tests__/` dilewati: berkas test tak pernah dikompilasi ke dist, dan
 * vitest me-resolve-nya sendiri.
 *
 * Jalankan: node apps/api/scripts/audit-impor-berekstensi.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = fileURLToPath(new URL('../../..', import.meta.url))
const SUMBER = join(AKAR, 'apps', 'api', 'src')

function berkasTs(dir, hasil = []) {
  for (const nama of readdirSync(dir)) {
    if (nama === '__tests__' || nama === 'node_modules') continue
    const jalur = join(dir, nama)
    if (statSync(jalur).isDirectory()) berkasTs(jalur, hasil)
    else if (nama.endsWith('.ts') && !nama.endsWith('.d.ts')) hasil.push(jalur)
  }
  return hasil
}

// Menangkap `from './x'` dan `from '../x'` — termasuk yang multi-baris,
// karena yang dicocokkan kata kunci `from` dan specifier-nya, bukan barisnya.
const POLA = /from\s+'(\.\.?\/[A-Za-z0-9_./-]+)'/g

const pelanggaran = []
const berkas = berkasTs(SUMBER)

for (const jalur of berkas) {
  const isi = readFileSync(jalur, 'utf8')
  const baris = isi.split('\n')
  for (const m of isi.matchAll(POLA)) {
    const spec = m[1]
    if (spec.endsWith('.js') || spec.endsWith('.json')) continue
    const nomor = isi.slice(0, m.index).split('\n').length
    pelanggaran.push({
      berkas: relative(AKAR, jalur),
      baris: nomor,
      spec,
      teks: (baris[nomor - 1] ?? '').trim().slice(0, 90),
    })
  }
}

console.log('== PENJAGA: impor relatif berekstensi ' + '='.repeat(30))
console.log('  berkas dipindai : ' + berkas.length)
console.log('  tanpa ekstensi  : ' + pelanggaran.length + ' (ambang 0)')

if (berkas.length < 50) {
  console.error('\nNOL/terlalu sedikit berkas dipindai — penjaga ini tak menjaga apa pun.')
  process.exit(1)
}

if (pelanggaran.length === 0) {
  console.log('\nSemua impor relatif berekstensi .js.')
  process.exit(0)
}

console.error('\nImpor relatif TANPA `.js`:\n')
for (const p of pelanggaran.slice(0, 20)) {
  console.error('   ' + p.berkas + ':' + p.baris)
  console.error('      ' + p.teks)
}
console.error(
  '\n   ESM tak menebak ekstensi. `tsx` dan `tsc --noEmit` MELULUSKANNYA,\n' +
  '   jadi cacat ini hanya muncul saat container produksi start:\n' +
  '     Error [ERR_MODULE_NOT_FOUND] url: file:///app/.../dist/lib/x\n' +
  '   Tambahkan `.js` — nama berkas sumbernya tetap `.ts`.'
)
process.exit(1)
