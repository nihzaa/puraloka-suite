#!/usr/bin/env node
/**
 * PENJAGA: event dalam rantai persetujuan wajib membawa `workflowId`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `correlation_id` mengikat event dalam SATU request. Persetujuan berjenjang
 * bukan satu request: level 1 disetujui hari ini, level 2 besok, oleh orang
 * berbeda. `workflow_id` yang mengikat antar-request itu.
 *
 * Diukur 2026-08-07 sebelum diperbaiki:
 *
 *     workflow_id terisi   0 dari 21.005 baris
 *     estimasi ber-2-langkah   3 buah — dan tiga event tiap alurnya
 *                              (submitted -> approval.level -> approved)
 *                              tak punya satu pun penanda bersama
 *
 * Merunutnya berarti menebak dari `record_id` dan waktu. Untuk pertanyaan
 * "kenapa dokumen ini bolak-balik tiga kali", tebakan tak cukup.
 *
 * ── Yang dijaga
 *
 * Tiap `logAuditEvent` dengan `action` yang termasuk rantai persetujuan
 * (`*.submitted`, `*.approved`, `*.rejected`, `*.approval.level`) wajib
 * memuat `workflowId`. Titik approval BARU yang lupa akan merah di CI, bukan
 * diam-diam menambah baris tanpa ikatan.
 *
 * ── Yang TIDAK dijaga
 *
 * Apakah nilainya benar. Itu tugas `alur-persetujuan.test.ts`, yang menguji
 * janji "langkah sama -> nilai sama" dan mutation-tested terhadap
 * `randomUUID()`.
 *
 * Pakai (dari apps/api): node scripts/audit-alur-persetujuan-terikat.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const API = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RUTE = join(API, 'src', 'routes')

/** Aksi yang merupakan langkah dalam rantai persetujuan. */
const LANGKAH = /\.(submitted|approved|rejected|approval\.level)'/

const PANGGILAN = /logAuditEvent\(\s*request\s*,\s*\{([\s\S]*?)\n\s*\}\s*\)/g

const temuan = []
let diperiksa = 0

const telusuri = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue
      telusuri(p)
      continue
    }
    if (!e.name.endsWith('.ts')) continue
    const isi = readFileSync(p, 'utf8')
    for (const m of isi.matchAll(PANGGILAN)) {
      const badan = m[1]
      const aksi = badan.match(/action:\s*'([^']+)'/)
      if (!aksi || !LANGKAH.test(`.${aksi[1].split('.').slice(1).join('.')}'`)) continue
      diperiksa++
      if (/\bworkflowId\s*:/.test(badan)) continue
      const baris = isi.slice(0, m.index).split('\n').length
      temuan.push({
        berkas: relative(API, p).split(sep).join('/'),
        baris,
        aksi: aksi[1],
      })
    }
  }
}
telusuri(RUTE)

console.log('')
console.log('══ Rantai persetujuan: workflow_id terikat ═══════════════════')
console.log(`  langkah persetujuan diperiksa : ${diperiksa}`)
console.log(`  tanpa workflowId              : ${temuan.length}`)
console.log('')

if (temuan.length === 0) {
  console.log('✅ Tiap langkah rantai persetujuan membawa `workflowId`.')
  console.log('')
  process.exit(0)
}

console.error('❌ Langkah persetujuan tanpa `workflowId`:')
for (const t of temuan) console.error(`     ${t.berkas}:${t.baris}  (${t.aksi})`)
console.error('')
console.error('   Tambahkan:')
console.error('')
console.error('     void logAuditEvent(request, {')
console.error("       action: 'sesuatu.approval.level',")
console.error('       workflowId: idAlurPersetujuan(id),   // <- dari utils/approval.js')
console.error('     })')
console.error('')
console.error('   Kenapa ini ditegakkan: `correlation_id` hanya mengikat dalam')
console.error('   SATU request. Persetujuan berjenjang terjadi di request')
console.error('   berbeda, oleh orang berbeda, di hari berbeda — tanpa')
console.error('   `workflow_id`, merunutnya berarti menebak dari record_id')
console.error('   dan waktu. Diukur 2026-08-07: 0 dari 21.005 baris terisi.')
console.error('')
process.exit(1)
