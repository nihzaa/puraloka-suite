#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// ROUTE BER-COVERAGE NOL — masalahnya SEBARAN, bukan kedalaman.
//
// COVERAGE-BASELINE.md: lines 32%, branches 68%, functions 82%. Pola khas
// integration test — yang diuji, diuji dalam; tapi sebagian berkas route tak
// tersentuh sama sekali. Mengejar "70% lines global" adalah target yang salah
// dan akan mendorong test dangkal demi angka.
//
// Yang dijaga: JUMLAH berkas routes/v1/*.ts ber-coverage NOL. Boleh turun.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const RINGKASAN = join(AKAR, 'apps/api/coverage/coverage-summary.json')
const LANTAI = join(AKAR, 'apps/api/scripts/route-nol-lantai.json')

if (!existsSync(RINGKASAN)) {
  console.error(`FATAL: ${RINGKASAN} tidak ada. Jalankan vitest --coverage lebih dulu.`)
  process.exit(1)
}

const ringkasan = JSON.parse(readFileSync(RINGKASAN, 'utf8'))
const nol = []
for (const [berkas, m] of Object.entries(ringkasan)) {
  if (berkas === 'total') continue
  if (!/routes[\/\\]v1[\/\\][^\/\\]+\.ts$/.test(berkas)) continue
  if ((m.lines?.pct ?? 0) === 0) nol.push(berkas.split(/[\/\\]/).pop())
}

console.log(`Route ber-coverage NOL : ${nol.length}`)
for (const n of nol.sort()) console.log(`   ${n}`)

const naikkan = process.argv.includes('--naikkan')
const lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))
if (naikkan) {
  writeFileSync(LANTAI, JSON.stringify({ ...lantai, routeNol: nol.length }, null, 2) + '\n')
  console.log(`Lantai diperbarui: ${nol.length}`)
  process.exit(0)
}
if (nol.length > lantai.routeNol) {
  console.error(`\nMERAH: route ber-coverage nol naik ${lantai.routeNol} -> ${nol.length}`)
  process.exit(1)
}
process.exit(0)
