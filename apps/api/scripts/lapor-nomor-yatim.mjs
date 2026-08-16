#!/usr/bin/env node
/**
 * LAPORAN — otomasi tanpa nomor katalog, disandingkan dengan nomor yang
 * belum diklaim siapa pun.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ALAT INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dua entri di `katalog-otomasi.ts` pernah menyatakan "tak punya padanan di
 * katalog", dan KEDUANYA salah:
 *
 *   `catatan_progres`   menyatakan seluruh 1.x sudah diperiksa dan tak ada
 *                       yang cocok. Benar — tetapi padanannya 3.1, dan 3.x
 *                       tak pernah dilihat.
 *   `kirim-pengingat`   menyatakan "ini kemampuan asisten, bukan salah satu
 *                       dari 140 otomasi bernomor". Padanannya 1.11.
 *
 * Ditulis dua orang berbeda, dengan bentuk kesalahan yang sama persis:
 * mencari di SATU keluarga nomor, tak menemukan, lalu menyimpulkan tak ada
 * padanan sama sekali. Pencarian yang berhenti di tempat yang nyaman.
 *
 * Dua kali dengan bentuk identik bukan kelalaian — itu tanda penelusurannya
 * perlu dibantu alat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * INI LAPORAN, BUKAN PENJAGA — DAN ITU DISENGAJA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kecocokan kata bukan bukti. Ada otomasi yang memang TIDAK punya nomor
 * (`kontrak-payung-habis` — kontrak pemasok, sementara 7.10 kontrak klien;
 * `opname-menggantung` — volume kerja, sementara 4.8 stok gudang), dan
 * memaksanya punya nomor justru membuat katalog mengklaim yang tak dikerjakan.
 *
 * Penjaga yang menuntut tiap entri bernomor akan mendorong orang menempelkan
 * nomor terdekat supaya CI hijau — persis kebalikan dari yang diinginkan.
 * Jadi alat ini MENYODORKAN kandidat; manusia yang memutuskan.
 *
 *     node scripts/lapor-nomor-yatim.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const KATALOG_KODE = join(AKAR, 'apps/api/src/lib/katalog-otomasi.ts')
const KATALOG_DOK = join(
  AKAR,
  'docs/superpowers/specs/2026-07-18-enterprise-architecture',
  '06-agentic-ai-and-automation-architecture.md')

/* Kata yang muncul di hampir semua baris; membandingkannya tak memisahkan
   apa pun dan hanya menaikkan skor semua kandidat secara merata. */
const TAK_BERMAKNA = new Set([
  'dan', 'yang', 'untuk', 'dari', 'ke', 'di', 'atau', 'dengan', 'pada',
  'otomatis', 'auto', 'via', 'per', 'the', 'a', 'to', 'of', 'by', 'for',
  'otomasi', 'sistem', 'data', 'proyek', 'project',
])

const kata = (t) => new Set(
  String(t).toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !TAK_BERMAKNA.has(w)))

const irisan = (a, b) => [...a].filter((w) => b.has(w)).length

// ── Nomor yang SUDAH diklaim entri kode
const isiKode = readFileSync(KATALOG_KODE, 'utf8')
const diklaim = new Set(
  [...isiKode.matchAll(/nomor: '([^']+)'/g)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim())))

// ── Entri kode TANPA nomor
const entri = []
for (const m of isiKode.matchAll(/^ {2}\{\n([\s\S]*?)^ {2}\},$/gm)) {
  const blok = m[1]
  const kunci = (blok.match(/kunci: '([^']+)'/) ?? [])[1]
  if (!kunci) continue
  if (/^\s{4}nomor:/m.test(blok)) continue
  const nama = (blok.match(/nama: '([^']+)'/) ?? [])[1] ?? ''
  const jelas = [...blok.matchAll(/penjelasan:\s*\n?\s*'([^']*)'/g)].map((x) => x[1]).join(' ')
  entri.push({ kunci, nama, teks: `${nama} ${jelas}` })
}

// ── Baris dokumen yang BELUM diklaim
const baris = readFileSync(KATALOG_DOK, 'utf8')
  .split('\n')
  .filter((l) => /^\| *\d+\.\d+ \|/.test(l))
  .map((l) => {
    const c = l.split('|').map((s) => s.trim())
    return { nomor: c[1], nama: c[2], ket: c[3] }
  })
  .filter((r) => !diklaim.has(r.nomor))

if (entri.length === 0) {
  console.log('✅ lapor-nomor-yatim: tiap entri katalog kode sudah bernomor')
  process.exit(0)
}

console.log(
  `\n📋 ${entri.length} otomasi tanpa nomor · ${baris.length} nomor belum diklaim\n`)
console.log('   Ini LAPORAN, bukan penjaga. Sebagian memang tak punya padanan,')
console.log('   dan memaksanya bernomor membuat katalog mengklaim yang tak')
console.log('   dikerjakan. Yang disodorkan kandidat; Anda yang memutuskan.\n')

for (const e of entri) {
  const k = kata(e.teks)
  const calon = baris
    .map((r) => ({ ...r, skor: irisan(k, kata(`${r.nama} ${r.ket}`)) }))
    .filter((r) => r.skor >= 2)
    .sort((a, b) => b.skor - a.skor)
    .slice(0, 3)

  console.log(`   ── ${e.kunci}  «${e.nama}»`)
  if (calon.length === 0) {
    console.log('      tak ada kandidat berkata-sama ≥2 — kemungkinan memang tanpa nomor\n')
    continue
  }
  for (const c of calon) {
    console.log(`      ${String(c.skor).padStart(2)} kata sama  →  ${c.nomor.padEnd(5)} ${c.nama}`)
  }
  console.log('')
}

console.log('   Sesudah memutuskan, tulis alasannya di `catatan` entri itu —')
console.log('   termasuk kalau keputusannya TETAP tanpa nomor. Dua kali entri')
console.log('   di berkas ini salah karena alasannya tak pernah diperiksa ulang.\n')
