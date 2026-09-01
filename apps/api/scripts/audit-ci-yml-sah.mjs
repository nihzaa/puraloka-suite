#!/usr/bin/env node
/**
 * `ci.yml` wajib YAML yang SAH — dan langkahnya wajib terbaca.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-01: `ci.yml` RUSAK sejak commit 31349bb1, dan
 * **41 commit berturut-turut tak pernah diperiksa CI sama sekali**.
 *
 * Satu baris:
 *
 *     - name: "Lainnya" di dasar sidebar portal
 *
 * Kutip di AWAL nilai membuat YAML mengurainya sebagai string berkutip
 * (`Lainnya`), lalu tersisa teks yang tak punya tempat:
 *
 *     bad indentation of a mapping entry (3075:25)
 *
 * ── Kenapa ini nyaris tak mungkin terlihat
 *
 * GitHub tidak menjalankan satu pun langkah — ia gagal SEBELUM itu, dengan
 * pesan "This run likely failed because of a workflow file issue". Tak ada
 * job merah, tak ada langkah merah, tak ada log yang bisa dibuka
 * (`gh run view --log-failed` → "log not found").
 *
 * Yang terlihat di daftar hanya "failure" — bentuk yang sama dengan
 * kegagalan biasa. Dan karena penjaga LOKAL (`jalankan-semua-penjaga.mjs`)
 * membaca `ci.yml` sebagai TEKS untuk mencari perintah, ia tetap melapor
 * "216 hijau · 0 MERAH" atas berkas yang GitHub sendiri tak bisa urai.
 *
 * Dua alat, dua jawaban, dan yang menentukan justru yang tak dilihat
 * siapa pun.
 *
 * ── Yang DIJAGA
 *
 *   1. YAML terurai — kalau tidak, seluruh CI mati diam-diam
 *   2. Ada job, dan tiap job punya langkah — YAML sah tetapi kosong
 *      tetap berarti nol pemeriksaan
 *   3. Jumlah langkah tidak ANJLOK — struktur yang salah bisa membuat
 *      sebagian langkah "hilang" ke dalam nilai lain tanpa galat
 *
 * Yang ketiga ratchet: langkah boleh bertambah bebas, dan boleh berkurang
 * sedikit (penjaga digabung/dipensiunkan), tetapi penurunan tajam berarti
 * ada yang tertelan.
 *
 * ── Ambang
 *
 * (1) dan (2) ambang NOL. (3) ratchet dengan toleransi 10%.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const CI = join(AKAR, '.github', 'workflows', 'ci.yml')
const LANTAI = join(dirname(fileURLToPath(import.meta.url)), 'ci-langkah-lantai.json')

if (!existsSync(CI)) {
  console.error(`❌ ci.yml tak ada di ${CI} — jalurnya meleset.`)
  console.error('   Nol temuan dari korpus kosong bukan bukti apa pun.')
  process.exit(1)
}

/*
  ── Kenapa `js-yaml` dicari di STORE, bukan di-require biasa ──────────────

  `js-yaml` BUKAN dependensi langsung siapa pun di repo ini — ia hadir
  hanya secara transitif. `createRequire(...)('js-yaml')` dari apps/api
  GAGAL, dan versi pertama penjaga ini menjawabnya dengan `exit 0` +
  "DILEWATI".

  Itu salah ke arah yang paling berbahaya untuk penjaga INI: yang
  dijaganya adalah berkas yang kerusakannya membuat CI diam. Penjaga yang
  diam-diam melewatkan diri, atas cacat yang gejalanya juga diam,
  menghasilkan dua lapis kesunyian.

  Jadi ia dicari di store pnpm, dan kalau tetap tak ada — MELEMPAR, bukan
  melewat.
*/
function muatYaml() {
  try {
    return createRequire(join(AKAR, 'apps', 'api', 'package.json'))('js-yaml')
  } catch { /* transitif — cari di store */ }

  const pnpmDir = join(AKAR, 'node_modules', '.pnpm')
  if (existsSync(pnpmDir)) {
    const { readdirSync } = createRequire(import.meta.url)('node:fs')
    const cocok = readdirSync(pnpmDir).filter((d) => d.startsWith('js-yaml@')).sort()
    for (const d of cocok.reverse()) {
      const p = join(pnpmDir, d, 'node_modules', 'js-yaml')
      if (existsSync(p)) {
        try { return createRequire(import.meta.url)(p) } catch { /* coba berikutnya */ }
      }
    }
  }
  return null
}

const yaml = muatYaml()
if (!yaml) {
  console.error('❌ `js-yaml` tak ditemukan — ci.yml TAK BISA divalidasi.')
  console.error('')
  console.error('   Ini MERAH, bukan dilewati. Yang dijaga penjaga ini adalah')
  console.error('   berkas yang kerusakannya membuat CI diam total; penjaga yang')
  console.error('   ikut diam atasnya menghasilkan dua lapis kesunyian.')
  console.error('')
  console.error('   Jalankan `pnpm install` lebih dulu.')
  process.exit(1)
}

console.log('══ ci.yml sah dan langkahnya terbaca ══════════════════════════')

let dok
try {
  dok = yaml.load(readFileSync(CI, 'utf8'))
} catch (e) {
  console.error('')
  console.error('❌ ci.yml BUKAN YAML yang sah:')
  console.error('   ' + String(e.message).split('\n')[0])
  console.error('')
  console.error('   GitHub tak menjalankan SATU PUN langkah saat ini terjadi —')
  console.error('   ia gagal sebelum itu, dengan pesan "workflow file issue".')
  console.error('   Tak ada job merah, tak ada log yang bisa dibuka, dan')
  console.error('   penjaga lokal tetap melapor hijau karena ia membaca')
  console.error('   berkas ini sebagai TEKS.')
  console.error('')
  console.error('   Diukur 2026-09-01: cacat seperti ini membuat 41 commit')
  console.error('   berturut-turut lolos tanpa satu pun pemeriksaan.')
  console.error('')
  process.exit(1)
}

const jobs = Object.entries(dok?.jobs ?? {})
if (jobs.length === 0) {
  console.error('❌ Nol job di ci.yml — YAML sah tetapi tak memeriksa apa pun.')
  process.exit(1)
}

let langkah = 0
const kosong = []
for (const [nama, j] of jobs) {
  const n = (j?.steps ?? []).length
  langkah += n
  if (n === 0) kosong.push(nama)
}

console.log(`  job            : ${jobs.length}`)
console.log(`  langkah        : ${langkah}`)

if (kosong.length > 0) {
  console.error('')
  console.error(`❌ ${kosong.length} job tanpa langkah: ${kosong.join(', ')}`)
  console.error('   Job kosong lulus tanpa memeriksa apa pun.')
  process.exit(1)
}

const lantai = existsSync(LANTAI)
  ? JSON.parse(readFileSync(LANTAI, 'utf8')).langkah
  : null

if (process.argv.includes('--turunkan')) {
  writeFileSync(LANTAI, JSON.stringify({ langkah }, null, 2) + '\n')
  console.log(`\n✅ lantai langkah disetel ke ${langkah}`)
  process.exit(0)
}

if (lantai == null) {
  console.error(`\n❌ ${LANTAI} belum ada. Tetapkan lantai:`)
  console.error('   node scripts/audit-ci-yml-sah.mjs --turunkan\n')
  process.exit(1)
}

/*
  Toleransi 10%: penjaga kadang digabung atau dipensiunkan, dan menuntut
  angka yang hanya boleh naik akan membuat penjaga ini dimatikan pada
  perapian pertama. Yang dijaga penurunan TAJAM — tanda langkah tertelan
  ke dalam nilai lain tanpa galat.
*/
const batas = Math.floor(lantai * 0.9)
console.log(`  lantai         : ${lantai} (batas bawah ${batas})`)

if (langkah < batas) {
  console.error('')
  console.error(`❌ Langkah CI ANJLOK: ${langkah}, dari lantai ${lantai}.`)
  console.error('   Struktur yang salah bisa membuat langkah "hilang" ke dalam')
  console.error('   nilai lain tanpa satu pun galat YAML.')
  console.error('')
  process.exit(1)
}

if (langkah > lantai) {
  console.log(`  (naik ${langkah - lantai} — jalankan --turunkan untuk mengunci)`)
}

console.log('')
console.log('✅ ci.yml sah, semua job punya langkah, jumlahnya tidak anjlok.')
console.log('   Batas: ini menjaga BERKASNYA bisa dijalankan GitHub, bukan')
console.log('   bahwa langkah-langkahnya lulus.')
