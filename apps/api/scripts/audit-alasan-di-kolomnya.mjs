#!/usr/bin/env node
/**
 * PENJAGA: alasan keputusan ditulis ke KOLOM `reason`, bukan dikubur di JSON.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `audit_logs` punya kolom `reason` khusus, dan F6-1 mensyaratkan "alasan
 * approval/override/variance tersimpan". Diukur 2026-08-07 di basis nyata:
 *
 *     estimate.rejected          0 dari 636 punya reason
 *     estimate.approved          0 dari 624
 *     approval.step.create       0 dari 368
 *     change_order_approved    358 dari 359   <- yang benar
 *
 * Sebabnya bukan alasannya tak dicatat — melainkan dicatat di TEMPAT YANG
 * SALAH: `newValues: { reason: ... }`, di dalam JSON.
 *
 * Bedanya menentukan. Kolom `reason` ada supaya pertanyaan "keputusan mana
 * yang tak beralasan" bisa dijawab satu kueri. Dengan alasan terkubur di JSON,
 * jawabannya SELALU "semuanya" — dan laporan kepatuhan yang membacanya akan
 * melaporkan nol kepatuhan pada sistem yang sebenarnya patuh.
 *
 * ── Kenapa `newValues` boleh tetap memuatnya
 *
 * Boleh, dan memang dipertahankan: bentuk riwayat lama tak berubah. Yang
 * dilarang adalah HANYA di sana.
 *
 * Pakai (dari apps/api): node scripts/audit-alasan-di-kolomnya.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const API = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RUTE = join(API, 'src', 'routes')

/**
 * Blok `logAuditEvent(...)` yang memuat `reason` di dalam `newValues`.
 *
 * Dicari per-PANGGILAN, bukan per-baris: `newValues` dan `reason:` tingkat
 * atas bisa berjarak beberapa baris, dan mencocokkan baris demi baris akan
 * melewatkan bentuk multi-baris — yang justru bentuk paling umum.
 */
const PANGGILAN = /logAuditEvent\(\s*request\s*,\s*\{([\s\S]*?)\n\s*\}\s*\)/g

const temuan = []

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
      const adaDiJson = /newValues:\s*\{[^}]*\breason\s*:/.test(badan)
      if (!adaDiJson) continue
      // `reason:` tingkat atas — tak didahului `newValues: {` di baris yang sama,
      // dan berada di awal properti (indentasi, bukan di dalam objek bersarang).
      const adaDiKolom = /\n\s*reason\s*:/.test(badan.replace(/newValues:\s*\{[^}]*\}/g, ''))
      if (adaDiKolom) continue
      const barisKe = isi.slice(0, m.index).split('\n').length
      temuan.push({ berkas: relative(API, p).split(sep).join('/'), baris: barisKe })
    }
  }
}
telusuri(RUTE)

console.log('')
console.log('══ Alasan keputusan: kolom `reason` vs JSON ══════════════════')
console.log('')

if (temuan.length === 0) {
  console.log('✅ Tiap `logAuditEvent` yang mencatat alasan mengisi kolom `reason`.')
  console.log('')
  process.exit(0)
}

console.error(`❌ ${temuan.length} panggilan menaruh alasan HANYA di dalam \`newValues\`:`)
for (const t of temuan) console.error(`     ${t.berkas}:${t.baris}`)
console.error('')
console.error('   Tambahkan `reason` sebagai properti TINGKAT ATAS:')
console.error('')
console.error('     void logAuditEvent(request, {')
console.error("       action: 'sesuatu.rejected',")
console.error('       newValues: { status: ..., reason: alasan },')
console.error('       reason: alasan,          // <- kolomnya sendiri')
console.error('     })')
console.error('')
console.error('   Kenapa ini ditegakkan: kolom `reason` ada supaya "keputusan')
console.error('   mana yang tak beralasan" bisa dijawab satu kueri. Alasan yang')
console.error('   terkubur di JSON membuat jawabannya selalu "semuanya" —')
console.error('   diukur 2026-08-07: 636 penolakan estimasi, nol terbaca.')
console.error('')
process.exit(1)
