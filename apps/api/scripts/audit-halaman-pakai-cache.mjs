#!/usr/bin/env node
// ============================================================================
// HALAMAN YANG MENGAMBIL DATA WAJIB LEWAT LAPIS CACHE — RATCHET
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `apps/web/lib/data-cache.ts` dibangun 2026-08-04 untuk F4-2: cache bersama,
// dedup permintaan, invalidasi terarah. Ia lengkap, ber-232 baris, dan
// **10 test-nya hijau**.
//
// Diukur 2026-08-16, dua belas hari kemudian:
//
//   halaman page.tsx                             164
//   yang memakai `useData()`                       0
//   yang mengambil data via useEffect + api      154
//
// NOL. Lapisan itu dibangun, diuji, lalu tak pernah dipakai satu halaman pun.
//
// ── Kenapa ini kelas cacat, bukan sekadar pekerjaan tertunda
//
// Infrastruktur yang ada tetapi tak terpakai LEBIH BERBAHAYA daripada yang
// belum ada, karena ia membaca sebagai "sudah beres" dari mana pun orang
// melihat: berkasnya ada, testnya hijau, QUEUE mencatat F4-2 `wip` seolah
// tinggal sedikit lagi.
//
// Repo ini sudah punya kalimatnya sendiri untuk ini (CLAUDE.md §8): "Kolom DB
// sudah ada BUKAN selesai." Hal yang sama berlaku di sini — lapis cache yang
// tak dipakai halaman bukan lapis cache, ia berkas.
//
// ── Yang dijaga
//
// Jumlah `page.tsx` yang mengambil data TANPA `useData()` tak boleh NAIK.
//
// Ratchet, bukan ambang nol: memindahkan 154 halaman sekaligus adalah
// perubahan yang tak bisa ditinjau siapa pun dengan jujur. Yang dijaga
// arahnya — tiap halaman baru wajib lahir memakai cache, dan tiap migrasi
// menurunkan lantainya.
//
// ── Yang TIDAK dihitung
//
// Halaman tanpa pengambilan data sama sekali (statis, formulir murni) tak
// masuk hitungan — ia tak punya apa pun untuk di-cache, dan menuntutnya
// memakai `useData` menghasilkan penjaga yang mustahil dipuaskan.
// ============================================================================

import { readFileSync, writeFileSync, existsSync, globSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const WEB = join(AKAR, 'apps', 'web', 'app')
const LANTAI_BERKAS = join(dirname(fileURLToPath(import.meta.url)), 'halaman-cache-lantai.json')

const bacaLantai = () => {
  if (!existsSync(LANTAI_BERKAS)) return null
  try { return JSON.parse(readFileSync(LANTAI_BERKAS, 'utf8')).lantai ?? null }
  catch { return null }
}

const halaman = globSync('**/page.tsx', { cwd: WEB })
const tanpaCache = []

for (const rel of halaman) {
  const jalur = rel.split(String.fromCharCode(92)).join('/')
  const isi = readFileSync(join(WEB, rel), 'utf8')

  /*
    Komentar dilucuti sebelum diperiksa.

    Tiga kali dalam satu sesi (2026-08-16) sebuah pemeriksaan di repo ini
    membaca komentarnya sendiri sebagai kode — termasuk penjaga `record_id`,
    yang mutasinya LOLOS karenanya. Halaman yang menyebut `useData` hanya di
    dalam komentar "TODO: pindah ke useData" tak boleh terhitung sudah pindah.
  */
  const kode = isi
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  if (/\buseData\s*[<(]/.test(kode)) continue          // sudah pindah

  // Mengambil data? Dua tanda harus ADA bersamaan: efek + pemanggil API.
  const punyaEfek = /\buseEffect\s*\(/.test(kode)
  const punyaApi = /from ["']@\/lib\/api["']/.test(kode) || /\bapi[A-Z]\w*\s*\(/.test(kode)
  if (!punyaEfek || !punyaApi) continue                 // tak mengambil data

  tanpaCache.push(jalur)
}

const lantai = bacaLantai()
const jumlah = tanpaCache.length

if (process.argv.includes('--turunkan')) {
  writeFileSync(LANTAI_BERKAS, JSON.stringify({ lantai: jumlah }, null, 2) + '\n')
  console.log(`✅ lantai halaman-tanpa-cache diturunkan ke ${jumlah}`)
  process.exit(0)
}

if (lantai == null) {
  console.error(`\n❌ ${LANTAI_BERKAS} belum ada. Tetapkan lantai:\n`
    + '   node scripts/audit-halaman-pakai-cache.mjs --turunkan\n')
  process.exit(1)
}

if (jumlah > lantai) {
  console.error(`\n❌ Halaman yang mengambil data TANPA lapis cache NAIK: ${jumlah} (lantai ${lantai}).\n`)
  for (const f of tanpaCache.slice(0, 10)) console.error(`   · ${f}`)
  if (tanpaCache.length > 10) console.error(`   … dan ${tanpaCache.length - 10} lagi`)
  console.error(`
  \`apps/web/lib/data-cache.ts\` sudah menyediakan \`useData(url)\` — cache
  bersama, dedup permintaan, dan invalidasi terarah. Halaman baru WAJIB
  memakainya; tanpa itu tiap navigasi mengambil ulang semuanya, dan dua
  komponen yang butuh data sama mengirim dua permintaan.

  Menurunkan lantai (sesudah memindahkan halaman):
     node scripts/audit-halaman-pakai-cache.mjs --turunkan
`)
  process.exit(1)
}

const dipakai = halaman.length - jumlah
if (jumlah < lantai) {
  console.log(`\n📉 Turun dari lantai (${jumlah} < ${lantai}) — kencangkan:`)
  console.log('   node scripts/audit-halaman-pakai-cache.mjs --turunkan\n')
}

console.log(
  `✅ halaman pakai cache: ${jumlah} dari ${halaman.length} halaman masih tanpa `
  + `lapis cache (lantai ${lantai}); ${dipakai} sisanya tak mengambil data atau sudah pindah`,
)
