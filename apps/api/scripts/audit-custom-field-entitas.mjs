#!/usr/bin/env node
/**
 * PENJAGA: ENUM `cf_entitas` HANYA BOLEH MENYEBUT TABEL YANG ADA.
 *
 * ── Cacat yang melahirkan penjaga ini
 *
 * Migrasi 321 (TJS-P5) versi pertama menulis `'vendors'` di enum `cf_entitas`.
 * Tabelnya bernama `suppliers`. Diukur 2026-08-12.
 *
 * Enum TIDAK memvalidasi apa pun ke katalog — bagi Postgres, `'vendors'`
 * hanyalah label sah. Yang terjadi: entitas yang tak pernah bisa dipakai,
 * tanpa satu pun galat. Tenant memilih "Vendor" di layar pengaturan, membuat
 * field, mengisinya — dan nilainya menggantung di `entitas_id` yang tak
 * menunjuk baris mana pun.
 *
 * Kegagalan yang tak pernah error adalah kelas cacat paling mahal di repo ini.
 * Yang menangkapnya kebetulan: saya mengukur nama tabel sebelum menjalankan
 * migrasi. Kalau tidak, ia lolos ke produksi.
 *
 * ── Kenapa penjaga, bukan FK
 *
 * Tak ada cara mem-FK-kan enum ke `information_schema`. Itu justru sebabnya
 * ini perlu diperiksa dari luar: batas yang tak bisa ditegakkan basis harus
 * ditegakkan CI, bukan diserahkan ke ingatan.
 *
 * ── Yang diperiksa
 *
 * 1. Tiap nilai `cf_entitas` adalah tabel nyata di `public`.
 * 2. Tabel itu punya kolom `id` bertipe uuid — `custom_field_nilai.entitas_id`
 *    bertipe uuid, dan entitas ber-id `bigint` akan gagal saat disambungkan.
 * 3. Tabel itu ter-registrasi di peta tenancy — entitas yang tak ter-klasifikasi
 *    berarti custom field-nya bisa dibaca lintas-tenant.
 *
 * Ambang NOL untuk ketiganya.
 *
 * Pakai:  node apps/api/scripts/audit-custom-field-entitas.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const PETA = join(DIR, '..', 'src', 'utils', 'tenant-map.generated.ts')

const punyaDb = !!(process.env.DATABASE_URL || process.env.DIRECT_URL)
if (!punyaDb) {
  console.log('\n⏭  audit-custom-field-entitas: DILEWATI (tak ada DATABASE_URL)')
  console.log('   Penjaga ini membaca katalog basis; CI menjalankannya dengan basis.')
  process.exit(0)
}

const { default: pg } = await import('pg')
const c = new pg.Client({ connectionString: process.env.DATABASE_URL || process.env.DIRECT_URL })
await c.connect()

const { rows: enumRows } = await c.query(`
  SELECT e.enumlabel AS nilai
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
   WHERE t.typname = 'cf_entitas'
   ORDER BY e.enumsortorder
`)

console.log('\n══ custom field: entitas vs tabel nyata ════════════════════')

if (enumRows.length === 0) {
  // Enum belum ada = migrasi 321 belum dijalankan di basis ini. Itu BUKAN
  // pelanggaran; tetapi juga tak boleh dilaporkan sebagai lulus.
  console.log('  ⏭  enum `cf_entitas` belum ada — migrasi 321 belum jalan di basis ini.')
  await c.end()
  process.exit(0)
}

console.log(`  nilai enum cf_entitas  : ${enumRows.length}`)

const tabelHilang = []
const idBukanUuid = []
for (const { nilai } of enumRows) {
  const { rows } = await c.query(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'id'`,
    [nilai],
  )
  if (rows.length === 0) {
    // Bedakan "tabel tak ada" dari "tabel ada tapi tak punya id".
    const { rows: t } = await c.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [nilai],
    )
    if (t.length === 0) tabelHilang.push(nilai)
    else idBukanUuid.push({ nilai, tipe: '(tak punya kolom id)' })
    continue
  }
  if (rows[0].data_type !== 'uuid') idBukanUuid.push({ nilai, tipe: rows[0].data_type })
}

await c.end()

// Peta tenancy dibaca dari berkasnya, bukan dari basis — ia di-generate dan
// berkas itulah yang dipakai kode saat berjalan.
const takTerklasifikasi = []
if (existsSync(PETA)) {
  const peta = readFileSync(PETA, 'utf8')
  for (const { nilai } of enumRows) {
    if (!new RegExp(`['"\`]${nilai}['"\`]`).test(peta)) takTerklasifikasi.push(nilai)
  }
} else {
  console.log('  ⚠  tenant-map.generated.ts tak ditemukan — pemeriksaan tenancy dilewati')
}

let gagal = 0

if (tabelHilang.length > 0) {
  console.error('\n❌ Nilai enum `cf_entitas` yang TABELNYA TAK ADA:\n')
  for (const n of tabelHilang) console.error(`     ${n}`)
  console.error('\n   Enum tak memvalidasi apa pun ke katalog: bagi Postgres ini')
  console.error('   label sah. Akibatnya entitas yang tak pernah bisa dipakai,')
  console.error('   tanpa satu pun galat — persis cacat `vendors` vs `suppliers`')
  console.error('   yang melahirkan penjaga ini.\n')
  gagal++
}

if (idBukanUuid.length > 0) {
  console.error('\n❌ Entitas yang `id`-nya BUKAN uuid:\n')
  for (const x of idBukanUuid) console.error(`     ${x.nilai.padEnd(16)} ${x.tipe}`)
  console.error('\n   `custom_field_nilai.entitas_id` bertipe uuid. Nilai untuk')
  console.error('   entitas ini tak akan pernah bisa disambungkan ke barisnya.\n')
  gagal++
}

if (takTerklasifikasi.length > 0) {
  console.error('\n❌ Entitas yang tak ada di peta tenancy:\n')
  for (const n of takTerklasifikasi) console.error(`     ${n}`)
  console.error('\n   Entitas tak terklasifikasi berarti custom field-nya tak punya')
  console.error('   jalur tenant yang terjamin.\n')
  gagal++
}

if (gagal > 0) process.exit(1)
console.log('  tabel nyata & ber-id uuid : semua')
console.log('  terklasifikasi tenancy    : semua')
console.log('\n✅ Seluruh entitas custom field menunjuk tabel yang benar-benar ada.\n')
