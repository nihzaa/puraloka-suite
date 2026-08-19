#!/usr/bin/env node
// ============================================================================
// CAKUPAN UJI STRUKTUR — pondasi sampai atap, diukur bukan diingat.
// ============================================================================
//
// ── Kenapa berkas ini ada, dan kenapa SKRIP bukan dokumen
//
// Pertanyaan "uji strukturnya sudah komplit dari pondasi sampai atap?" dijawab
// 2026-08-19 dengan menghitung tangan, dan jawabannya **53%** — 18 dari 34
// elemen. Angka itu akan basi begitu satu jenis ditambahkan.
//
// CLAUDE.md sendiri mencabut seluruh angkanya karena alasan yang sama:
// "kalau sebuah fakta bisa basi, jangan tulis faktanya — tulis cara
// mengukurnya". Berkas ini adalah cara mengukurnya.
//
// ── Yang TIDAK dilakukan di sini
//
// Ini BUKAN penjaga: ia tak pernah exit 1 dan tak menahan apa pun. Cakupan
// yang belum lengkap bukan cacat — modul ini memang dibangun bertahap, dan
// memerahkan CI karena tangga belum ada hanya membuat orang mematikannya.
//
// Yang dijaga penjaga lain adalah KONSISTENSI (jenis di kode = jenis di basis,
// tiap modul punya terjemahan awam, tiap sektor punya cabang). Yang dilaporkan
// di sini adalah KELENGKAPAN — dan itu keputusan urutan kerja, bukan cacat.
//
// ── Cara membaca hasilnya
//
// Kolom "dipakai" = berapa baris RAB nyata di basis ini menyebut elemen itu.
// Elemen yang sering dipakai tetapi belum ada pengujinya adalah yang paling
// mahal ketiadaannya — bukan yang paling rumit teorinya.
//
//   node -r dotenv/config scripts/lapor-cakupan-struktur.mjs
// ============================================================================

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

const BERKAS_RUTE = join(process.cwd(), 'src', 'routes', 'v1', 'struktur.ts')

/** Jenis yang BENAR-BENAR terdaftar — dibaca dari kode, bukan didaftar ulang. */
function jenisTerdaftar() {
  const isi = readFileSync(BERKAS_RUTE, 'utf8')
  const m = isi.match(/const JENIS = \[([\s\S]*?)\] as const/)
  if (!m) throw new Error('Konstanta JENIS tak ditemukan')
  return new Set([...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]))
}

/**
 * Rantai bangunan gedung bertingkat rendah–menengah, bawah ke atas.
 *
 * `jenis` = kunci di konstanta JENIS bila sudah ada; `null` bila belum.
 * `cari`  = pola nama untuk menghitung pemakaiannya di RAB nyata.
 */
const RANTAI = [
  ['TANAH',     'daya dukung tanah',              'tanah*',            null],
  ['PONDASI',   'footplat / telapak',             'footplat',          '%footplat%'],
  ['PONDASI',   'pile cap',                       'pilecap',           '%pile cap%'],
  ['PONDASI',   'tiang pancang / bor',            'tiang',             '%tiang pancang%'],
  ['PONDASI',   'sloof / tie beam',               null,                '%sloof%'],
  ['PONDASI',   'pondasi menerus batu kali',      null,                '%pondasi batu%'],
  ['PONDASI',   'raft / pelat pondasi',           null,                '%raft%'],
  ['BAWAH',     'dinding penahan tanah',          null,                '%penahan tanah%'],
  ['KOLOM',     'kolom persegi beton',            'kolom',             '%kolom%'],
  ['KOLOM',     'kolom bulat beton',              'kolom_bulat',       '%kolom bulat%'],
  ['KOLOM',     'kolom baja',                     'baja_kolom',        null],
  ['KOLOM',     'kolom komposit',                 null,                '%komposit%'],
  ['BALOK',     'balok beton',                    'balok',             '%balok%'],
  ['BALOK',     'balok baja',                     'baja_balok',        null],
  ['BALOK',     'balok anak / balok T',           null,                '%balok anak%'],
  ['PELAT',     'pelat lantai beton',             'plat',              '%pelat lantai%'],
  ['PELAT',     'pelat komposit / bondek',        null,                '%bondek%'],
  ['TANGGA',    'tangga beton',                   null,                '%tangga%'],
  ['DINDING',   'dinding geser (shear wall)',     null,                '%dinding geser%'],
  ['SAMBUNGAN', 'sambungan baut',                 'baja_sambungan_baut', null],
  ['SAMBUNGAN', 'sambungan las',                  'baja_sambungan_las',  null],
  ['SAMBUNGAN', 'base plate',                     'baja_base_plate',   null],
  ['SAMBUNGAN', 'angkur',                         'baja_angkur',       '%angkur%'],
  ['SAMBUNGAN', 'gusset / pelat buhul',           null,                null],
  ['SAMBUNGAN', 'sambungan momen (rigid)',        null,                null],
  ['ATAP',      'kuda-kuda / rangka baja',        'baja_rangka',       '%kuda%kuda%'],
  ['ATAP',      'gording',                        'baja_gording',      '%gording%'],
  ['ATAP',      'bracing / ikatan angin',         'baja_bracing',      null],
  ['ATAP',      'kuda-kuda kayu',                 null,                '%kuda%kayu%'],
  ['ATAP',      'rangka atap baja ringan',        null,                '%baja ringan%'],
  ['GLOBAL',    'interaksi P-M baja',             'baja_interaksi',    null],
  ['GLOBAL',    'beban gempa statik ekuivalen',   null,                null],
  ['GLOBAL',    'beban angin',                    null,                null],
  ['GLOBAL',    'drift antar tingkat',            null,                null],
]

const terdaftar = jenisTerdaftar()
const DB = process.env.DATABASE_URL || process.env.DIRECT_URL

/** Berapa baris RAB nyata menyebut elemen ini? Nol bila basis tak terjangkau. */
const pakai = new Map()
if (DB) {
  const c = new Client({ connectionString: DB })
  await c.connect()
  try {
    for (const [, , , pola] of RANTAI) {
      if (!pola || pakai.has(pola)) continue
      const { rows } = await c.query(
        'SELECT count(*)::int n FROM rab_items WHERE name ILIKE $1', [pola])
      pakai.set(pola, rows[0].n)
    }
  } finally { await c.end() }
}

console.log('══ Cakupan uji struktur — pondasi sampai atap ══════════════')
if (!DB) console.log('  ⚠ tanpa DATABASE_URL: kolom "dipakai" tak terisi')
console.log('')

let ada = 0
let sektorLalu = ''
const belum = []

for (const [sektor, nama, jenis, pola] of RANTAI) {
  if (sektor !== sektorLalu) { console.log(''); sektorLalu = sektor }
  /*
    `tanah*` menandai modul yang ADA tetapi bukan jenis elemen — daya dukung
    tanah dipakai di dalam analisa pondasi, bukan sebagai elemen tersendiri.
  */
  const punya = jenis === 'tanah*' || (jenis !== null && terdaftar.has(jenis))
  if (punya) ada++
  else belum.push({ sektor, nama, dipakai: pola ? (pakai.get(pola) ?? 0) : 0 })

  const n = pola ? (pakai.get(pola) ?? 0) : null
  const kolomPakai = n === null ? '     ' : String(n).padStart(4) + 'x'
  console.log(`  ${punya ? '✓' : '·'} ${sektor.padEnd(10)} ${nama.padEnd(30)} ${kolomPakai}  ${jenis ?? ''}`)
}

const total = RANTAI.length
console.log('')
console.log(`  ADA ${ada} / ${total}  (${Math.round(ada / total * 100)}%)`)

/*
  Yang BELUM ADA diurut berdasarkan pemakaian nyata, bukan abjad maupun urutan
  bangunan. Elemen yang sering muncul di RAB tetapi tak punya penguji adalah
  yang paling mahal ketiadaannya — dan itu tak selalu yang paling rumit.
*/
const mendesak = belum.filter((b) => b.dipakai > 0).sort((a, b) => b.dipakai - a.dipakai)
if (mendesak.length) {
  console.log('')
  console.log('  BELUM ADA, tetapi DIPAKAI di RAB nyata — urut paling sering:')
  for (const b of mendesak) {
    console.log(`     ${String(b.dipakai).padStart(4)}x  ${b.sektor.padEnd(10)} ${b.nama}`)
  }
}

const sepi = belum.filter((b) => b.dipakai === 0)
if (sepi.length) {
  console.log('')
  console.log(`  BELUM ADA dan belum dipakai (${sepi.length}): `
    + sepi.map((b) => b.nama).join(' · '))
}

console.log('')
console.log('  Ini LAPORAN, bukan penjaga — tak pernah exit 1. Cakupan yang')
console.log('  belum lengkap adalah urutan kerja, bukan cacat.')
