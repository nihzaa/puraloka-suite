#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// MODUL INTI TANPA UI — endpoint yang tak pernah dipanggil dari mana pun.
//
// ── Kenapa penjaga ini ada
//
// Commit db463d9: "Endpoint `retensi-register` yang saya banggakan tak pernah
// dipanggil dari mana pun. Tiap PR saya laporkan 'INTI #N selesai' — itu tidak
// akurat. Yang selesai fondasinya; produknya belum ada."
//
// Lima modul berturut-turut dibangun sampai endpoint lalu dilaporkan selesai.
// CLAUDE.md §8 sudah melarangnya ("Kolom DB sudah ada BUKAN selesai"), tapi
// larangan tanpa penjaga hanya konvensi.
//
// ── Kenapa PETA ditulis tangan
//
// Pola `/api/v1/<modul>` GAGAL menemukan Klaim/Surat/Instruksi — endpoint-nya
// bersarang di `/api/v1/projects/{id}/claims`. Penjaga berpola naif akan merah
// palsu di empat modul sehat, dan penjaga yang merah palsu akan dimatikan orang.
// Preseden sama tercatat di header audit-taksonomi-vs-kode.mjs.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const LANTAI = join(AKAR, 'apps/api/scripts/ui-lantai.json')

/** INTI → potongan path endpoint yang harus muncul di apps/web. Ditulis tangan. */
const INTI = {
  '#1 Laporan keuangan': ['/api/v1/gl/'],
  '#2 IPC': ['/api/v1/termin', '/api/v1/ipc'],
  '#3 Retensi subkontrak': ['/mandor/retensi'],
  '#4 Klaim': ['/claims'],
  '#5 Surat': ['/letters'],
  '#6 Instruksi lapangan': ['/field-instructions'],
  '#7 NCR': ['/api/v1/ncr'],
  // `lintang`/`bujur`, BUKAN `latitude`/`longitude`: apps/web/components/penanda-lokasi.tsx
  // menamai field-nya dalam Bahasa Indonesia. Pola Inggris di sini semula
  // membuat guard ini sendiri merah palsu — persis kelas cacat yang dijaganya.
  '#8 Geotag foto': ['lintang', 'bujur'],
  '#9 Absensi lapangan': ['/api/v1/absensi'],
}

function sumberWeb() {
  const out = []
  const walk = (d) => {
    if (!existsSync(d)) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.next' || e.name === 'node_modules') continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        out.push(readFileSync(p, 'utf8'))
      }
    }
  }
  walk(join(AKAR, 'apps/web/app'))
  walk(join(AKAR, 'apps/web/components'))
  return out.join('\n')
}

const web = sumberWeb()
const tanpaUi = []
for (const [nama, pola] of Object.entries(INTI)) {
  if (!pola.some((p) => web.includes(p))) tanpaUi.push(nama)
}

console.log(`INTI diperiksa : ${Object.keys(INTI).length}`)
console.log(`tanpa UI       : ${tanpaUi.length}`)
for (const n of tanpaUi) console.log(`   ${n}`)

const naikkan = process.argv.includes('--naikkan')
const lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))
if (naikkan) {
  writeFileSync(LANTAI, JSON.stringify({ ...lantai, tanpaUi: tanpaUi.length }, null, 2) + '\n')
  console.log(`Lantai diperbarui: ${tanpaUi.length}`)
  process.exit(0)
}
if (tanpaUi.length > lantai.tanpaUi) {
  console.error(`\nMERAH: modul tanpa UI naik ${lantai.tanpaUi} -> ${tanpaUi.length}`)
  process.exit(1)
}
if (tanpaUi.length < lantai.tanpaUi) {
  console.log(`\nTurun ${lantai.tanpaUi} -> ${tanpaUi.length}. Kunci: --naikkan`)
}
process.exit(0)
