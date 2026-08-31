#!/usr/bin/env node
/**
 * Penegakan BACA-SAJA wajib berada di tempat `companyId` sudah terisi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA — sebuah kegagalan yang test TIDAK bisa tangkap
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Percobaan pertama memasang penegakan sebagai hook global:
 *
 *     app.addHook('preHandler', …)   // di index.ts
 *
 * Itu SALAH, dan salahnya senyap. Hook instance-level berjalan SEBELUM
 * preHandler rute, sehingga `request.companyId` — yang diisi `authenticate` —
 * masih `undefined` saat hook jalan. Hook pulang lebih awal pada SETIAP
 * permintaan: tak pernah menahan siapa pun, nol galat, nol jejak.
 *
 * Yang membuatnya berbahaya: seluruh test tingkat-fungsi tetap HIJAU.
 * `bacaKeadaanBacaSaja()` bekerja sempurna — yang rusak cuma tempat ia
 * dipanggil. Diukur lewat rute sungguhan: POST /api/v1/clients tetap **201**
 * saat tenant ditandai baca-saja.
 *
 * Kalau penegakan ini "diperiksa" dengan membaca kode alih-alih memanggil
 * rutenya, ia lolos ke produksi sebagai perlindungan yang tak pernah ada.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIPERIKSA
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. penegakan ada di `authenticate()` (plugins/auth.ts), SESUDAH baris
 *      yang mengisi `request.companyId`
 *   2. ia TIDAK dipasang sebagai hook global di index.ts — bentuk yang sudah
 *      terbukti diam
 *   3. metode baca (GET/HEAD/OPTIONS) tak ikut ditahan — "baca-saja" yang
 *      menahan baca membatalkan seluruh maksudnya
 *
 * ⚠ Ambang NOL.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const SRC = join(DIR, '..', 'src')
const AUTH = join(SRC, 'plugins', 'auth.ts')
const INDEX = join(SRC, 'index.ts')
const MODUL = join(SRC, 'plugins', 'baca-saja.ts')

console.log('\n══ Baca-saja terpasang di tempat yang benar ═══════════════════\n')

for (const [nama, p] of [['plugins/auth.ts', AUTH], ['index.ts', INDEX], ['plugins/baca-saja.ts', MODUL]]) {
  if (!existsSync(p)) {
    console.error(`❌ ${nama} tak ditemukan — penjaga ini buta.`)
    process.exit(1)
  }
}

// Komentar dilucuti. Penjaga yang puas oleh komentar sudah terjadi DUA KALI
// di repo ini (jual-tak-bocor, pendaftaran-publik): sebuah baris
// `// bacaKeadaanBacaSaja(...)` bukan penegakan.
const kode = (p) =>
  readFileSync(p, 'utf8')
    .split('\n')
    .filter((b) => {
      const t = b.trim()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')

const auth = kode(AUTH)
const index = kode(INDEX)
const modul = kode(MODUL)

const pelanggaran = []

// ── 1. penegakan ada di authenticate, SESUDAH companyId terisi ─────────────
const iPanggil = auth.indexOf('bacaKeadaanBacaSaja(')
if (iPanggil === -1) {
  pelanggaran.push({
    jenis: 'TAK DITEGAKKAN',
    pesan: 'authenticate() tak memanggil bacaKeadaanBacaSaja — tenant menunggak bisa menulis apa pun',
  })
} else {
  const iCompany = auth.indexOf('request.companyId =')
  if (iCompany === -1) {
    pelanggaran.push({
      jenis: 'ANCHOR HILANG',
      pesan: 'baris `request.companyId =` tak ketemu di auth.ts — penjaga ini tak bisa memastikan urutannya',
    })
  } else if (iPanggil < iCompany) {
    pelanggaran.push({
      jenis: 'URUTAN',
      pesan: 'penegakan berjalan SEBELUM request.companyId terisi — ia akan diam pada setiap permintaan, tanpa galat',
    })
  }
}

// ── 2. TIDAK dipasang sebagai hook global ──────────────────────────────────
if (/addHook\(\s*['"]preHandler['"]/.test(index)) {
  pelanggaran.push({
    jenis: 'HOOK GLOBAL',
    pesan: 'index.ts memasang hook preHandler global — bentuk itu berjalan sebelum companyId terisi dan TERBUKTI tak menahan apa pun (POST /clients tetap 201)',
  })
}
if (/export function pasangBacaSaja/.test(modul)) {
  pelanggaran.push({
    jenis: 'KODE MATI',
    pesan: 'pasangBacaSaja() masih ada — bentuk hook global yang sudah terbukti diam; menyimpannya mengundang pemakaian ulang',
  })
}

// ── 3. metode baca tak ikut ditahan ────────────────────────────────────────
const mMetode = modul.match(/METODE_TULIS\s*=\s*new Set\(\[([^\]]*)\]/)
if (!mMetode) {
  pelanggaran.push({ jenis: 'ANCHOR HILANG', pesan: 'METODE_TULIS tak terbaca — penjaga ini buta' })
} else {
  const daftar = [...mMetode[1].matchAll(/'([A-Z]+)'/g)].map((m) => m[1])
  for (const baca of ['GET', 'HEAD', 'OPTIONS']) {
    if (daftar.includes(baca)) {
      pelanggaran.push({
        jenis: 'BACA IKUT DITAHAN',
        pesan: `${baca} masuk METODE_TULIS — "baca-saja" yang menahan baca membatalkan seluruh maksudnya`,
      })
    }
  }
  if (!daftar.includes('POST')) {
    pelanggaran.push({ jenis: 'TULIS LOLOS', pesan: 'POST tak ada di METODE_TULIS — penambahan data tak tertahan' })
  }
}

console.log(`  penegakan di authenticate : ${iPanggil !== -1 ? 'ada' : 'TIDAK ADA'}`)
console.log(`  hook global di index.ts   : ${/addHook\(\s*['"]preHandler['"]/.test(index) ? 'ADA (salah)' : 'tidak ada'}`)

if (pelanggaran.length) {
  console.error(`\n❌ MERAH: ${pelanggaran.length} pelanggaran.\n`)
  for (const p of pelanggaran) console.error(`   [${p.jenis}] ${p.pesan}`)
  console.error(
    '\n  Penegakan yang dipasang di tempat salah TIDAK mengeluarkan galat, dan\n' +
      '  seluruh test tingkat-fungsi tetap hijau — yang rusak cuma tempat ia\n' +
      '  dipanggil. Ia lolos sebagai perlindungan yang tak pernah ada.\n'
  )
  process.exit(1)
}

console.log('\n✅ Baca-saja ditegakkan sesudah companyId terisi, dan baca tetap lolos.\n')
