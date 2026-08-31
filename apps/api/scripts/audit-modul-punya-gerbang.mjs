#!/usr/bin/env node
/**
 * Rute modul BERBAYAR wajib punya `requireModul`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-31: 21 kunci `modul.*` terdaftar di katalog sejak migrasi
 * 538, dan `bolehPakaiFitur()` punya NOL pemanggil. Modul yang dijual tak
 * ditegakkan di satu tempat pun — paket Kecil dan Enterprise membuka modul
 * yang sama persis.
 *
 * Sesudah gerbangnya ada, bahaya berikutnya bukan gerbang yang salah
 * melainkan gerbang yang LUPA DIPASANG. Bentuk kegagalannya:
 *
 *   · menu disembunyikan di web, tapi `POST /api/v1/gl/journals` menerima
 *   · tenant paket Kecil memakai modul akuntansi penuh lewat curl
 *   · tak ada satu pun galat; yang bergejala cuma tagihan yang tak naik-naik,
 *     dan itu baru terasa berbulan-bulan kemudian
 *
 * Ini bentuk yang sama persis dengan yang sudah dijaga
 * `audit-gerbang-tenancy.mjs` — dan alasannya sama: yang bocor diam-diam
 * tak akan ditemukan siapa pun dengan membaca kode.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA HAL YANG DIPERIKSA
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. tiap berkas BERBAYAR punya `requireModul('<kunci yang benar>')`
 *   2. gerbang modul DIDAHULUKAN atas `requirePermission` pada rute yang sama
 *   3. JALUR_PEMULIHAN tak pernah digerbang — pelanggan yang ingin membayar
 *      harus selalu bisa membayar
 *
 * Yang (3) menjaga anti-pattern yang tak bernama di literatur tapi nyata:
 * Azure mengunci pembayaran swalayan saat invoice terkunci, sehingga
 * pelanggan yang ingin membayar harus menelepon dukungan. Jalur pemulihan
 * tak boleh berada di belakang gerbang yang ia pulihkan.
 *
 * ⚠ Ambang NOL untuk ketiganya.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const AKAR_API = join(DIR, '..')
const RUTE = join(AKAR_API, 'src', 'routes', 'v1')
const PETA = join(AKAR_API, 'src', 'utils', 'peta-modul-rute.ts')

if (!existsSync(PETA)) {
  console.error('✗ peta-modul-rute.ts tak ditemukan. Penjaga ini buta tanpa peta.')
  process.exit(1)
}

const sumberPeta = readFileSync(PETA, 'utf8')

/**
 * Peta dibaca dari SUMBERNYA, bukan di-import.
 *
 * Meng-import berkas TS dari skrip .mjs menuntut transpile; dan yang lebih
 * penting, penjaga yang mengeksekusi berkas yang ia jaga bisa dijatuhkan oleh
 * berkas itu sendiri. Membaca teks membuat penjaga tetap hidup meski petanya
 * rusak — dan "petanya rusak" justru salah satu hal yang perlu dilaporkan.
 */
/**
 * ⚠ `as const` TIDAK boleh ikut jadi jangkar penutup.
 *
 * Versi pertama fungsi ini menuntutnya, dan `BERBAGI` — satu-satunya blok
 * yang ditulis tanpa `as const` — terbaca sebagai KOSONG. Penjaga lalu
 * melapor `dikecualikan(bagi): 0` dan menuntut gerbang pada `inspeksi.ts`,
 * berkas yang justru sengaja dikecualikan karena dipakai dua modul.
 *
 * Hijaunya tetap hijau, jadi tak ada yang menunjuk kesalahannya — yang
 * berubah cuma satu angka di ringkasan. Ditemukan karena angka itu dibaca,
 * bukan karena ada yang merah.
 */
function bacaBlok(nama) {
  const m = sumberPeta.match(
    new RegExp(`export const ${nama}[^=]*=\\s*[{[]([\\s\\S]*?)\\n[}\\]]`)
  )
  return m ? m[1] : null
}

// ── BERBAYAR: kunci → daftar berkas ────────────────────────────────────────
const blokBerbayar = sumberPeta.match(
  /export const MODUL_BERBAYAR[^=]*=\s*\{([\s\S]*?)\n\} as const/
)
if (!blokBerbayar) {
  console.error('✗ MODUL_BERBAYAR tak terbaca — polanya berubah? Penjaga ini buta.')
  process.exit(1)
}

const berbayar = new Map()
for (const m of blokBerbayar[1].matchAll(
  /'(modul\.[a-z0-9_]+)':\s*\[([\s\S]*?)\]/g
)) {
  const berkas = [...m[2].matchAll(/'([a-z0-9-]+\.ts)'/g)].map((x) => x[1])
  berbayar.set(m[1], berkas)
}

if (berbayar.size === 0) {
  console.error('✗ Nol modul terbaca dari MODUL_BERBAYAR — penjaga ini buta.')
  process.exit(1)
}

const blokBerbagi = bacaBlok('BERBAGI') ?? ''
const berbagi = new Set([...blokBerbagi.matchAll(/'([a-z0-9-]+\.ts)'/g)].map((m) => m[1]))

const blokPemulihan = bacaBlok('JALUR_PEMULIHAN') ?? ''
const pemulihan = [...blokPemulihan.matchAll(/'([a-z0-9-]+\.ts)'/g)].map((m) => m[1])

console.log('\n══ Gerbang modul: rute berbayar ═══════════════════════════════\n')

const adaBerkas = new Set(readdirSync(RUTE).filter((f) => f.endsWith('.ts')))
const pelanggaran = []

// ── Nama hantu ─────────────────────────────────────────────────────────────
//
// Peta yang menyebut berkas tak ada akan pelan-pelan jadi daftar HARAPAN,
// bukan daftar kenyataan — dan penjaga yang berdiri di atasnya ikut jadi
// hiasan. Terjadi saat peta ini pertama ditulis: `billing.ts` dan
// `langganan.ts` didaftarkan dari ingatan, keduanya tak pernah ada
// (langganan diurus konsol vendor, bukan produk).
for (const [kunci, daftar] of berbayar) {
  for (const f of daftar) {
    if (!adaBerkas.has(f)) {
      pelanggaran.push({ jenis: 'HANTU', berkas: f, pesan: `disebut ${kunci}, tak ada di routes/v1` })
    }
  }
}
for (const f of pemulihan) {
  if (!adaBerkas.has(f)) {
    pelanggaran.push({ jenis: 'HANTU', berkas: f, pesan: 'disebut JALUR_PEMULIHAN, tak ada di routes/v1' })
  }
}

// ── 1 & 2: berkas berbayar wajib bergerbang, dan gerbang mendahului izin ────
let diperiksa = 0
let bergerbang = 0

for (const [kunci, daftar] of berbayar) {
  for (const f of daftar) {
    if (!adaBerkas.has(f)) continue
    if (berbagi.has(f)) continue // sengaja tak digerbang — lihat BERBAGI
    diperiksa++

    const isi = readFileSync(join(RUTE, f), 'utf8')

    // Komentar dilucuti: penjaga yang puas oleh komentar pernah terjadi DUA
    // KALI di repo ini (jual-tak-bocor, pendaftaran-publik). Sebuah baris
    // `// requireModul('modul.x')` bukan gerbang.
    const kode = isi
      .split('\n')
      .filter((b) => !b.trim().startsWith('//') && !b.trim().startsWith('*'))
      .join('\n')

    if (!kode.includes(`requireModul('${kunci}')`)) {
      const punyaLain = /requireModul\('(modul\.[a-z0-9_]+)'\)/.exec(kode)
      pelanggaran.push({
        jenis: 'TAK BERGERBANG',
        berkas: f,
        pesan: punyaLain
          ? `bergerbang ${punyaLain[1]}, seharusnya ${kunci}`
          : `tak punya requireModul('${kunci}')`,
      })
      continue
    }
    bergerbang++

    // Gerbang modul HARUS mendahului izin pada preHandler yang sama.
    // Urutan terbalik tak membocorkan data, tapi memberi pesan yang salah:
    // staf yang paketnya tak mencakup modul diberi tahu "minta izin ke admin"
    // — dan adminnya pun tak bisa memberikannya.
    for (const baris of kode.split('\n')) {
      if (!baris.includes('requireModul(') || !baris.includes('requirePermission(')) continue
      if (baris.indexOf('requireModul(') > baris.indexOf('requirePermission(')) {
        pelanggaran.push({
          jenis: 'URUTAN',
          berkas: f,
          pesan: 'requirePermission mendahului requireModul — pesan penolakan jadi salah',
        })
        break
      }
    }
  }
}

// ── 3: jalur pemulihan tak boleh digerbang ─────────────────────────────────
for (const f of pemulihan) {
  if (!adaBerkas.has(f)) continue
  const isi = readFileSync(join(RUTE, f), 'utf8')
  const kode = isi
    .split('\n')
    .filter((b) => !b.trim().startsWith('//') && !b.trim().startsWith('*'))
    .join('\n')
  if (/requireModul\(/.test(kode)) {
    pelanggaran.push({
      jenis: 'PEMULIHAN TERGERBANG',
      berkas: f,
      pesan: 'jalur pemulihan digerbang — pelanggan tak bisa memperbaiki keadaannya, termasuk tak bisa membayar',
    })
  }
}

console.log(`  modul berbayar     : ${berbayar.size}`)
console.log(`  berkas diperiksa   : ${diperiksa}`)
console.log(`  bergerbang         : ${bergerbang}`)
console.log(`  dikecualikan(bagi) : ${berbagi.size}`)
console.log(`  jalur pemulihan    : ${pemulihan.length}`)

if (pelanggaran.length) {
  console.error(`\n❌ MERAH: ${pelanggaran.length} pelanggaran gerbang modul.\n`)
  for (const p of pelanggaran) {
    console.error(`   [${p.jenis}] ${p.berkas}`)
    console.error(`      ${p.pesan}`)
  }
  console.error(
    '\n  Rute modul berbayar tanpa gerbang TIDAK mengeluarkan galat. Menu\n' +
      '  disembunyikan di web, tapi API-nya tetap menerima — dan yang tahu\n' +
      '  caranya memakai modul yang tak ia bayar lewat curl.\n' +
      '  Yang bergejala cuma tagihan yang tak naik-naik, berbulan kemudian.\n'
  )
  process.exit(1)
}

console.log('\n✅ Seluruh rute modul berbayar bergerbang, dan jalur pemulihan bebas gerbang.\n')
