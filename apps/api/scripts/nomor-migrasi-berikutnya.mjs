#!/usr/bin/env node
/**
 * Nomor migrasi bebas berikutnya — DIUKUR, bukan ditebak.
 *
 * ── Kenapa alat sekecil ini perlu ada
 *
 * 2026-08-31, dalam SATU JAM, nomor migrasi bentrok TIGA KALI antar-sesi yang
 * bekerja paralel:
 *
 *     535  menu-grup-mati    ↔  535  rls-tiga-tabel
 *     526  perbaiki-format   ↔  526  peta-peran-dibenahi
 *     537  menu-grup-mati    ↔  537  pulihkan-peta-peran
 *
 * Tiap bentrok membuat SALAH SATU berkas tak pernah jalan di lingkungan baru.
 * Yang terlewat termasuk migrasi RLS (Ember [C]) dan pemulihan izin PM —
 * keduanya tanpa satu pun galat, karena di basis pengembangan efeknya sudah
 * terlanjur ada.
 *
 * `audit-replay-bersih.mjs` menangkapnya, tetapi SESUDAH berkasnya ditulis dan
 * sering sesudah di-commit. Alat ini menjawab pertanyaannya SEBELUM: satu
 * perintah, satu angka.
 *
 * ⚠ Worktree memisahkan BERKAS, bukan ruang nomor. Menjalankan ini di worktree
 * hanya melihat berkas worktree itu — dan sesi lain mungkin sudah menulis
 * nomor yang sama di checkout lain. Karena itu ia juga MEMINDAI worktree
 * saudara dan mengatakan apa yang ditemukannya.
 *
 *   node scripts/nomor-migrasi-berikutnya.mjs
 */
import { readdirSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AKAR = resolve(__dirname, '..', '..', '..')

function nomorDi(dirRepo) {
  const dir = join(dirRepo, 'db', 'migrations')
  if (!existsSync(dir)) return new Map()
  const peta = new Map()
  for (const f of readdirSync(dir)) {
    const m = /^(\d+)_.*\.sql$/.exec(f)
    if (!m) continue
    const n = Number(m[1])
    peta.set(n, [...(peta.get(n) ?? []), f])
  }
  return peta
}

/** Worktree saudara — ruang nomornya SAMA meski berkasnya terpisah. */
function daftarWorktree() {
  try {
    return execSync('git worktree list --porcelain', { cwd: AKAR, encoding: 'utf8' })
      .split('\n')
      .filter((b) => b.startsWith('worktree '))
      .map((b) => b.slice('worktree '.length).trim())
      .filter((d) => d && resolve(d) !== resolve(AKAR))
  } catch {
    return []
  }
}

const semua = new Map()
const asal = new Map()

for (const [n, f] of nomorDi(AKAR)) {
  semua.set(n, [...(semua.get(n) ?? []), ...f])
  asal.set(n, 'checkout ini')
}

const lain = daftarWorktree()
for (const d of lain) {
  for (const [n, f] of nomorDi(d)) {
    const sudah = semua.get(n) ?? []
    const baru = f.filter((x) => !sudah.includes(x))
    if (baru.length) {
      semua.set(n, [...sudah, ...baru])
      if (!asal.has(n)) asal.set(n, d)
    }
  }
}

const tertinggi = Math.max(0, ...semua.keys())
const berikutnya = tertinggi + 1

// Kembar yang BENAR-BENAR berbahaya hanya yang ada di SATU checkout — di
// sanalah replay akan melewatkan salah satunya.
//
// Kembar LINTAS-worktree adalah hal lain: dua cabang yang belum di-merge boleh
// memakai nomor yang sama, dan yang menentukan barulah saat digabungkan.
// Melaporkannya sebagai cacat membuat alat ini berteriak tiap hari tentang
// sesuatu yang belum tentu salah — dan alat yang selalu berteriak berhenti
// dibaca.
const diSini = nomorDi(AKAR)
const kembarDiSini = [...diSini.entries()]
  .filter(([, f]) => f.length > 1)
  .sort((a, b) => a[0] - b[0])

console.log('══ Nomor migrasi ══════════════════════════════════════════════')
console.log(`  berkas terbaca   : ${[...semua.values()].flat().length}`)
console.log(`  nomor tertinggi  : ${tertinggi}`)
console.log(`  worktree dipindai: ${lain.length + 1}`)
console.log()
console.log(`  ➜  PAKAI NOMOR BERIKUTNYA: ${berikutnya}`)

if (kembarDiSini.length) {
  console.log('\n⚠ Nomor KEMBAR DI CHECKOUT INI — salah satunya TAK AKAN JALAN:')
  for (const [n, f] of kembarDiSini) console.log(`     ${n}: ${f.join('  ↔  ')}`)
  console.log('\n  Periksa dengan: node scripts/audit-replay-bersih.mjs')
  process.exitCode = 1
} else {
  console.log('\n  ✓ Nol nomor kembar di checkout ini.')
}

// Nomor milik worktree LAIN tetap disebut — bukan sebagai cacat, melainkan
// supaya nomor berikutnya tak menabraknya saat cabang itu di-merge.
const dipakaiLain = [...semua.keys()].filter((n) => !diSini.has(n)).sort((a, b) => a - b)
if (dipakaiLain.length) {
  console.log(`\n  ℹ ${dipakaiLain.length} nomor dipakai worktree lain (cabang belum di-merge).`)
  console.log(`    Terakhir: ${dipakaiLain.slice(-6).join(', ')} — sudah ikut dihitung di atas.`)
}
