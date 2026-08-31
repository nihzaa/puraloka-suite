#!/usr/bin/env node
/**
 * Kunci fitur paket WAJIB sama antara ERP dan konsol vendor.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dua sistem menyebut hal yang sama:
 *
 *   konsol vendor  admin-saas/db/seeds/007_fitur_bawaan.sql  → tabel `fitur`
 *                  Founder MENJANJIKAN di sini: paket X dapat 3 proyek.
 *
 *   ERP            db/migrations/538_katalog_fitur_paket.sql → `plan_features`
 *                  Kode MENEGAKKAN di sini: `masihMuat(batas, 'kuota.…', n)`.
 *
 * Keduanya bertemu HANYA lewat string kuncinya. Tak ada foreign key — dua
 * basis berbeda di mesin berbeda.
 *
 * Kalau kuncinya menyimpang — konsol menjanjikan `kuota.proyek`, ERP
 * menegakkan `kuota.proyek_aktif` — maka:
 *
 *   · konsol tetap menyimpan angkanya, tanpa galat
 *   · ERP tetap mencari kuncinya, tak menemukan, dan pulang "TAK DIBATASI"
 *   · pelanggan paket 3-proyek bisa membuat 300
 *
 * Tak ada satu pun galat di jalur itu. Yang bergejala cuma tagihan yang tak
 * naik-naik, dan itu baru terasa berbulan-bulan kemudian.
 *
 * ⚠ Ambang NOL. Satu kunci yang menyimpang sudah cukup membuat satu batas
 * berhenti berlaku diam-diam.
 *
 * ── Kenapa membaca BERKAS, bukan basis
 *
 * Kedua basis tak bisa dijangkau bersamaan dari CI (vendor ada di VPS, di
 * balik terowongan SSH). Yang bisa dibandingkan di CI adalah SUMBER-nya — dan
 * itu justru lebih tepat: yang dijaga adalah niat yang tertulis, bukan
 * keadaan satu basis pada satu saat.
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AKAR = resolve(__dirname, '..', '..', '..')

const BERKAS_ERP = join(AKAR, 'db', 'migrations', '538_katalog_fitur_paket.sql')

/**
 * Repo konsol vendor ada DI LUAR repo ini (repo terpisah, sengaja — konsol
 * vendor melayani beberapa produk).
 *
 * Kalau tak ketemu, penjaga ini MELEWATI dengan pesan yang jelas, bukan
 * gagal: CI repo ini tak boleh menuntut checkout repo lain. Tapi ia juga tak
 * boleh diam — "0 kunci diperiksa" harus terbaca sebagai TAK DIPERIKSA, bukan
 * sebagai lulus.
 */
const KANDIDAT_VENDOR = [
  process.env.REPO_ADMIN_SAAS,
  resolve(AKAR, '..', 'admin-saas'),
  'E:/Project/admin-saas',
].filter(Boolean)

function kunciDari(isi, pola) {
  return new Set([...isi.matchAll(pola)].map((m) => m[1]))
}

const isiErp = readFileSync(BERKAS_ERP, 'utf8')
// Hanya baris INSERT — komentar di berkas itu MENYEBUT kunci sebagai contoh,
// dan menghitungnya akan membuat penjaga ini lulus atas kunci yang tak pernah
// benar-benar disisipkan.
const isiErpTanpaKomentar = isiErp
  .split('\n')
  .filter((b) => !b.trim().startsWith('--'))
  .join('\n')

const erp = kunciDari(isiErpTanpaKomentar, /\('((?:modul|kuota|sifat)\.[a-z0-9_]+)'/g)

if (erp.size === 0) {
  console.error('✗ Nol kunci terbaca dari 538 — polanya berubah? Penjaga ini buta.')
  process.exit(1)
}

let dirVendor = null
for (const d of KANDIDAT_VENDOR) {
  if (d && existsSync(join(d, 'db', 'seeds', '007_fitur_bawaan.sql'))) {
    dirVendor = d
    break
  }
}

console.log('══ Kunci fitur: ERP ↔ konsol vendor ═══════════════════════════')
console.log(`  kunci di ERP (538) : ${erp.size}`)

if (!dirVendor) {
  console.log('\n⊘ Repo konsol vendor tak ditemukan — perbandingan DILEWATI.')
  console.log('  Dicari di: ' + KANDIDAT_VENDOR.join(', '))
  console.log('  Setel REPO_ADMIN_SAAS untuk memeriksanya.')
  console.log('\n  ⚠ Ini BUKAN lulus. Tak ada yang dibandingkan.')
  process.exit(0)
}

const isiVendor = readFileSync(join(dirVendor, 'db', 'seeds', '007_fitur_bawaan.sql'), 'utf8')
const isiVendorTanpaKomentar = isiVendor
  .split('\n')
  .filter((b) => !b.trim().startsWith('--'))
  .join('\n')

const vendor = kunciDari(isiVendorTanpaKomentar, /\('((?:modul|kuota|sifat)\.[a-z0-9_]+)'/g)

if (vendor.size === 0) {
  console.error('✗ Nol kunci terbaca dari seed 007 vendor — polanya berubah?')
  process.exit(1)
}

console.log(`  kunci di vendor    : ${vendor.size}`)

// `sifat.*` SENGAJA tak dituntut ada di ERP: jenis itu "ada/tidak" yang tak
// ditegakkan kode mana pun (dukungan prioritas, pendampingan). Menuntutnya
// akan memaksa ERP mendaftarkan hal yang tak bisa ia periksa.
const vendorWajib = new Set([...vendor].filter((k) => !k.startsWith('sifat.')))

const kurangDiErp = [...vendorWajib].filter((k) => !erp.has(k)).sort()
const asingDiErp = [...erp].filter((k) => !vendor.has(k)).sort()

console.log(`  dijanjikan vendor tapi TAK ditegakkan ERP : ${kurangDiErp.length}`)
console.log(`  ada di ERP tapi TAK dikenal vendor        : ${asingDiErp.length}`)

if (kurangDiErp.length) {
  console.error('\n— dijanjikan vendor, tak ada di ERP:')
  for (const k of kurangDiErp) console.error(`     ${k}`)
  console.error('  Konsol menawarkan batas ini, ERP tak pernah menegakkannya.')
}

if (asingDiErp.length) {
  console.error('\n— ada di ERP, tak dikenal vendor:')
  for (const k of asingDiErp) console.error(`     ${k}`)
  console.error('  ERP menegakkan batas yang tak pernah bisa dijanjikan siapa pun.')
}

if (kurangDiErp.length || asingDiErp.length) {
  console.error('\n❌ MERAH: kunci fitur menyimpang.')
  console.error('  Keduanya bertemu HANYA lewat string kunci — tak ada FK yang menahan.')
  console.error('  Kunci yang tak ketemu membuat batasnya pulang "TAK DIBATASI",')
  console.error('  tanpa satu pun galat.')
  process.exit(1)
}

console.log('\n✅ Sepakat: seluruh kunci yang dijanjikan vendor ditegakkan ERP.')
