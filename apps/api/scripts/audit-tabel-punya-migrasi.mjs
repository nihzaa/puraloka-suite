/**
 * PENJAGA: TIAP TABEL DI BASIS WAJIB DIBUAT OLEH SEBUAH MIGRASI.
 *
 * ── Kenapa penjaga ini ada
 *
 * Tabel yang lahir di luar jalur migrasi hidup nyaman di dev dan HILANG di
 * tiap basis baru — VPS termasuk. Tiga kali terjadi pada 2026-08-31, dan tiap
 * kali gejalanya menunjuk ke tempat lain:
 *
 *   `template_rab`        terbaca LINTAS TENANT di basis baru (migrasi 541).
 *                         518 memagarinya tapi MELEWATINYA — tabelnya belum
 *                         ada saat 518 jalan; 532 membuatnya belakangan.
 *
 *   `template_penerapan`  tak dibuat migrasi mana pun (migrasi 542), padahal
 *                         `tenant-map.generated.ts` mendaftarkannya kategori
 *                         C — kode menganggapnya ada, di VPS ia tidak ada.
 *
 *   dua sektor take-off   CHECK di basis punya 11 sektor, migrasi 477 menulis
 *                         9. Tercatat di RATIFIKASI, menunggu founder.
 *
 * Ketiganya tak mengeluarkan satu pun galat di dev.
 *
 * ── Yang diperiksa
 *
 * Tiap tabel `relkind='r'` di schema `public` wajib punya `CREATE TABLE`
 * (atau `RENAME TO`) yang menyebut namanya di db/migrations.
 *
 * ⚠ `relkind='r'` BUKAN kelengkapan — ia menutup temuan palsu yang nyata.
 * VIEW tak pernah punya `CREATE TABLE`, jadi pemindai yang tak menyaring
 * relkind akan menuduh tiap view sebagai yatim. Diukur di basis ini:
 * 291 tabel (`r`) + 3 view (`v`); `v_situs_publik` (migrasi 209) adalah
 * salah satunya, dan ia sempat muncul sebagai yatim palsu di pengukuran
 * sesi lain. Menyaring relkind membuang ketiganya dari pemeriksaan.
 *
 * ── Ambang NOL, dan ia HARUS bisa merah
 *
 * Dibuktikan lewat mutasi: `CREATE TABLE` untuk `template_penerapan`
 * dikomentari → penjaga melapor `YATIM: 1` dan menyebut namanya; dipulihkan
 * → `YATIM: 0`.
 *
 * ⚠ Mutasi PERTAMA gagal disuntik (pola sed dengan titik tak di-escape), dan
 * penjaganya tetap hijau. Saya nyaris menerima hijau itu sebagai bukti.
 * Nol hasil bukan bukti ketiadaan — jebakan yang sama dengan `grep` di
 * CLAUDE.md §7. Mutasi apa pun terhadap penjaga ini wajib MEMBUKTIKAN
 * suntikannya berlaku sebelum menilai hasilnya.
 *
 * Butuh koneksi basis. Dijalankan dari akar repo atau apps/api.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { buatClient, REPO_ROOT } from '../../../scripts/db/_koneksi.mjs'

const DIR = `${REPO_ROOT}/db/migrations`
if (!existsSync(DIR)) {
  console.error(`FATAL: ${DIR} tak ada`)
  process.exit(1)
}

const berkas = readdirSync(DIR).filter((f) => f.endsWith('.sql'))
const semua = berkas.map((f) => readFileSync(`${DIR}/${f}`, 'utf8')).join('\n')

/*
  Nama tabel yang dibuat migrasi mana pun. `RENAME TO` ikut dihitung: tabel
  yang lahir dengan nama lain lalu diganti tetap PUNYA migrasi pembuatnya.
*/
const dibuat = new Set()
for (const m of semua.matchAll(
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?["']?(\w+)/gi))
  dibuat.add(m[1].toLowerCase())
for (const m of semua.matchAll(/RENAME\s+TO\s+(?:public\.)?["']?(\w+)/gi))
  dibuat.add(m[1].toLowerCase())

const c = buatClient()
await c.connect()

const { rows } = await c.query(`
  SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1`)

const yatim = rows.map((r) => r.relname).filter((t) => !dibuat.has(t.toLowerCase()))

console.log('══ PENJAGA tabel punya migrasi ══════════════════════════════')
console.log(`  tabel di basis     : ${rows.length}`)
console.log(`  dibuat migrasi     : ${dibuat.size}`)
console.log(`  YATIM              : ${yatim.length}`)
console.log('  ambang             : 0 (bukan ratchet)')

for (const t of yatim) {
  const n = (await c.query(`SELECT count(*)::int n FROM public."${t}"`)).rows[0].n
  console.log(`     ${t.padEnd(34)} ${String(n).padStart(6)} baris`)
}
await c.end()

if (yatim.length > 0) {
  console.error(`\n❌ ${yatim.length} tabel TANPA migrasi yang membuatnya.`)
  console.error('   Di basis baru (VPS) tabel-tabel ini TIDAK AKAN ADA, dan')
  console.error('   kode yang menganggapnya ada gagal tanpa menyebut sebabnya.')
  console.error('   Perbaikan: migrasi maju `CREATE TABLE IF NOT EXISTS`,')
  console.error('   bentuknya DISALIN dari information_schema — pola migrasi 542.')
  process.exit(1)
}
console.log('\n✅ Nol tabel yatim — tiap tabel punya migrasi yang membuatnya.')
