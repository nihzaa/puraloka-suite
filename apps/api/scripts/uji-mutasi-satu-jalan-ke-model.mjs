#!/usr/bin/env node
/**
 * UJI MUTASI untuk `audit-satu-jalan-ke-model.mjs` (L-6).
 *
 * Sebagai BERKAS, dengan verifikasi suntikan mendarat sebelum menilai —
 * alasannya di header `uji-mutasi-gerbang-biaya-ai.mjs`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AKAR = resolve(__dirname, '..', '..', '..')
const PENJAGA = resolve(__dirname, 'audit-satu-jalan-ke-model.mjs')
const SASARAN = resolve(__dirname, '..', 'src', 'routes', 'v1', 'ai.ts')

function jalankanPenjaga() {
  try {
    execFileSync(process.execPath, [PENJAGA], { cwd: AKAR, stdio: 'pipe' })
    return 0
  } catch (e) {
    return e.status ?? 1
  }
}

const MUTASI = [
  {
    nama: 'M1 impor SDK Anthropic di rute',
    ubah: (s) => `import Anthropic from '@anthropic-ai/sdk'\n${s}`,
    bukti: (s) => s.includes("from '@anthropic-ai/sdk'"),
  },
  {
    nama: 'M2 impor SDK OpenAI di rute      ',
    ubah: (s) => `import OpenAI from 'openai'\n${s}`,
    bukti: (s) => s.includes("from 'openai'"),
  },
  {
    nama: 'M3 messages.create langsung      ',
    ubah: (s) => `${s}\nasync function bocor(k: any) { return k.messages.create({ model: 'x' }) }\n`,
    bukti: (s) => s.includes('async function bocor'),
  },
  {
    nama: 'M4 fetch mentah ke endpoint pesan',
    ubah: (s) => `${s}\nasync function bocor2() { return fetch('https://api.anthropic.com/v1/messages') }\n`,
    bukti: (s) => s.includes('api.anthropic.com/v1/messages'),
  },
  {
    nama: 'M5 impor dinamis SDK             ',
    ubah: (s) => `${s}\nasync function bocor3() { return import('@anthropic-ai/sdk') }\n`,
    bukti: (s) => s.includes("import('@anthropic-ai/sdk')"),
  },
  {
    // Kebalikannya: yang BUKAN inferensi harus tetap HIJAU. Penjaga yang
    // memerahkan uji-koneksi kredensial akan dimatikan orang, dan matinya
    // membawa serta tuduhan yang benar.
    nama: 'N1 uji-koneksi /v1/models tetap sah',
    harapMerah: false,
    ubah: (s) => `${s}\nasync function ujiKunci() { return fetch('https://api.anthropic.com/v1/models') }\n`,
    bukti: (s) => s.includes('api.anthropic.com/v1/models'),
  },
]

console.log('══ Uji mutasi: audit-satu-jalan-ke-model (L-6) ═════════════\n')

const dasar = jalankanPenjaga()
console.log(`  baseline : exit ${dasar} ${dasar === 0 ? '✓ HIJAU' : '✗ MERAH (perbaiki dulu)'}\n`)
if (dasar !== 0) process.exit(1)

let salah = 0
for (const m of MUTASI) {
  const isiAsli = readFileSync(SASARAN, 'utf8')
  const diubah = m.ubah(isiAsli)

  if (diubah === isiAsli) {
    console.log(`  ${m.nama}: SUNTIKAN TAK MENGUBAH APA PUN ✗`)
    salah++
    continue
  }

  writeFileSync(SASARAN, diubah)
  const mendarat = m.bukti(readFileSync(SASARAN, 'utf8'))
  const kode = mendarat ? jalankanPenjaga() : -1
  writeFileSync(SASARAN, isiAsli)

  const harapMerah = m.harapMerah !== false
  if (!mendarat) {
    console.log(`  ${m.nama}: BUKTI GAGAL — suntikan tak mendarat ✗`)
    salah++
  } else if (harapMerah && kode === 0) {
    console.log(`  ${m.nama}: exit 0 ✗ PENJAGA BUTA`)
    salah++
  } else if (!harapMerah && kode !== 0) {
    console.log(`  ${m.nama}: exit ${kode} ✗ POSITIF PALSU`)
    salah++
  } else {
    console.log(`  ${m.nama}: exit ${kode} ✓ ${harapMerah ? 'MERAH' : 'HIJAU (benar)'}`)
  }
}

const pulih = jalankanPenjaga()
console.log(`\n  pulih    : exit ${pulih} ${pulih === 0 ? '✓ HIJAU' : '✗ berkas tak kembali!'}`)

if (salah > 0 || pulih !== 0) {
  console.error(`\n✗ ${salah} mutasi meleset. Penjaga yang tak pernah merah adalah hiasan;`)
  console.error('  penjaga yang menuduh kode benar akan dimatikan orang.')
  process.exit(1)
}
console.log(`\n✓ ${MUTASI.length}/${MUTASI.length} mutasi sesuai harapan.`)
