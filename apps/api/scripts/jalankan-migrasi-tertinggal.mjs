/**
 * JALANKAN SEMUA MIGRASI YANG BELUM TERCATAT, BERURUTAN.
 *
 * ── Kenapa ada
 *
 * Diukur 2026-09-01: 528 berkas migrasi, 376 tercatat, **163 belum**.
 * `apply-migrasi.mjs` hanya menjalankan SATU per panggilan — menjalankan
 * 163 dengan tangan berarti 163 peluang salah urut atau terlewat.
 *
 * ── Yang dijaga
 *
 *   1. URUTAN NOMOR. Migrasi 546 mengandalkan 545 sudah jalan; menjalankan
 *      di luar urutan menghasilkan kegagalan yang menuduh migrasi yang salah.
 *   2. BERHENTI DI KEGAGALAN PERTAMA. Meneruskan sesudah satu gagal
 *      menghasilkan basis setengah-jadi yang lebih sulit dipulihkan daripada
 *      basis yang berhenti bersih.
 *   3. BUKU TAK DITULIS BILA GAGAL — diwarisi dari `apply-migrasi.mjs`.
 *      Mencatat migrasi yang gagal persis cacat 043.
 *   4. `--periksa` menjalankan NOL migrasi, hanya melaporkan rencananya.
 *
 * ── Pemakaian
 *
 *     node -r dotenv/config scripts/jalankan-migrasi-tertinggal.mjs --periksa
 *     node -r dotenv/config scripts/jalankan-migrasi-tertinggal.mjs
 *     node -r dotenv/config scripts/jalankan-migrasi-tertinggal.mjs --batas 10
 */
import { readdirSync, readFileSync } from 'node:fs'
import { buatClient, MIGRATIONS_DIR } from '../../../scripts/db/_koneksi.mjs'

const argv = process.argv.slice(2)
const PERIKSA = argv.includes('--periksa')
const iBatas = argv.indexOf('--batas')
const BATAS = iBatas >= 0 ? Number(argv[iBatas + 1]) : Infinity

const c = buatClient()
await c.connect()

const { rows } = await c.query(`SELECT version FROM supabase_migrations.schema_migrations`)
const tercatat = new Set(rows.map((r) => r.version))

const berkas = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => Number(a.split('_')[0]) - Number(b.split('_')[0]))

const sisa = berkas.filter((f) => !tercatat.has(f.split('_')[0]))

console.log('══ Migrasi tertinggal ═══════════════════════════════════════')
console.log(`  berkas migrasi : ${berkas.length}`)
console.log(`  tercatat       : ${tercatat.size}`)
console.log(`  BELUM tercatat : ${sisa.length}`)
if (BATAS !== Infinity) console.log(`  batas jalan    : ${BATAS}`)

if (sisa.length === 0) {
  console.log('\n✅ Nol migrasi tertinggal.')
  await c.end()
  process.exit(0)
}

if (PERIKSA) {
  console.log('\n── rencana (NOL dijalankan, --periksa):')
  for (const f of sisa.slice(0, 40)) console.log(`   ${f}`)
  if (sisa.length > 40) console.log(`   … dan ${sisa.length - 40} lagi`)
  await c.end()
  process.exit(0)
}

let jalan = 0
let gagal = null

for (const f of sisa) {
  if (jalan >= BATAS) break
  const versi = f.split('_')[0]
  const nama = f.replace(/\.sql$/, '')
  const sql = readFileSync(`${MIGRATIONS_DIR}/${f}`, 'utf8')

  const pendengar = (n) => { if (/OK|gagal/i.test(n.message)) console.log(`     [db] ${n.message.slice(0, 100)}`) }
  c.on('notice', pendengar)

  try {
    await c.query(sql)
    await c.query(
      `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
       VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING`,
      [versi, nama, [sql]])
    jalan++
    console.log(`  ✅ ${versi}  ${nama.slice(0, 60)}`)
  } catch (e) {
    gagal = { versi, nama, pesan: e.message }
    console.error(`  ❌ ${versi}  ${nama.slice(0, 60)}`)
    console.error(`     ${String(e.message).slice(0, 200)}`)
    break
  } finally {
    c.off('notice', pendengar)
  }
}

await c.end()

console.log(`\n  dijalankan : ${jalan}`)
console.log(`  sisa       : ${sisa.length - jalan}`)

if (gagal) {
  console.error(`\n❌ BERHENTI di ${gagal.versi} — buku TIDAK ditulis untuk migrasi ini.`)
  console.error('   Basis berhenti di keadaan bersih; perbaiki migrasinya lalu jalankan lagi.')
  process.exit(1)
}
console.log('\n✅ Selesai tanpa kegagalan.')
