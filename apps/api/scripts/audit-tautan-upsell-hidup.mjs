#!/usr/bin/env node
/**
 * Halaman modul-terkunci wajib menunjuk halaman yang BENAR-BENAR ADA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Halaman `/modul-terkunci/[modul]` dibangun untuk satu tujuan: memandu orang
 * KELUAR dari jalan buntu. Ia muncul tepat saat pengguna terhalang, dan satu-
 * satunya nilainya ada pada tautan yang ia tawarkan.
 *
 * Tautan mati DI HALAMAN ITU adalah kegagalan yang paling menyakitkan
 * bentuknya: orang yang sudah terhalang sekali, mengklik jalan keluar yang
 * ditawarkan sendiri oleh aplikasi, lalu menemui 404.
 *
 * Ini bukan bahaya teoretis. Saat halaman itu ditulis (2026-08-31) tautannya
 * menunjuk `/pengaturan/langganan` — rute yang saya tulis dari INGATAN dan
 * tak pernah ada. Tak ada galat: Next.js dengan senang hati me-render `<Link>`
 * ke rute apa pun, dan 404-nya baru muncul saat diklik.
 *
 * Bentuk yang sama sudah dijaga di tempat lain repo ini
 * (`audit-inbox-jalur-nyata.mjs`, `audit-modul-mobile-nyata.mjs`) — dan
 * keduanya lahir karena kesalahan yang sama pernah terjadi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIPERIKSA
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. tiap `href` di halaman modul-terkunci menunjuk `page.tsx` yang ada
 *   2. tiap kunci di `ISI_MODUL` dikenal katalog (`plan_features`) — kunci
 *      hantu menampilkan halaman kosong tanpa daftar isi, dan diamnya
 *      terbaca sebagai "modul ini memang tak punya apa-apa"
 *   3. halaman modul-terkunci itu sendiri ADA — sidebar mengarah ke sana
 *
 * ⚠ Ambang NOL untuk ketiganya.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const AKAR = join(DIR, '..', '..', '..')
const WEB = join(AKAR, 'apps', 'web')
const APP = join(WEB, 'app', '(dashboard)')
const HALAMAN = join(APP, 'modul-terkunci', '[modul]', 'page.tsx')

console.log('\n══ Tautan upsell hidup ════════════════════════════════════════\n')

if (!existsSync(HALAMAN)) {
  console.error('❌ MERAH: halaman /modul-terkunci/[modul] tak ada.')
  console.error('   Sidebar mengarahkan menu bergembok ke sana; tanpa halamannya,')
  console.error('   tiap menu terkunci berujung 404.')
  process.exit(1)
}

const isi = readFileSync(HALAMAN, 'utf8')
const pelanggaran = []

// ── 1. href wajib menunjuk halaman nyata ───────────────────────────────────
//
// Hanya href internal yang diperiksa. Yang eksternal (http…) bukan urusan
// penjaga ini — ia tak bisa tahu apakah situs orang lain hidup.
const href = [...isi.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1])

function rutePunyaHalaman(rute) {
  const segmen = rute.split('/').filter(Boolean)
  let dir = APP
  for (const s of segmen) {
    if (!existsSync(dir)) return false
    const isiDir = readdirSync(dir)
    // Cocokkan persis dulu; kalau tak ada, terima segmen dinamis `[x]`.
    if (isiDir.includes(s)) {
      dir = join(dir, s)
      continue
    }
    const dinamis = isiDir.find((d) => d.startsWith('[') && d.endsWith(']'))
    if (!dinamis) return false
    dir = join(dir, dinamis)
  }
  return existsSync(join(dir, 'page.tsx'))
}

for (const h of new Set(href)) {
  if (!rutePunyaHalaman(h)) {
    pelanggaran.push({ jenis: 'TAUTAN MATI', nilai: h, pesan: 'tak ada page.tsx untuk rute ini' })
  }
}

// ── 2. kunci ISI_MODUL wajib dikenal katalog ───────────────────────────────
const kunciHalaman = [...isi.matchAll(/"(modul\.[a-z0-9_]+)":\s*\{/g)].map((m) => m[1])

// Katalog dibaca dari migrasi 538 dikurangi yang dicabut migrasi maju — cara
// yang sama dengan `audit-kunci-fitur-sepakat.mjs`, supaya keduanya tak bisa
// berbeda pendapat soal kunci mana yang masih berlaku.
const MIGRASI = join(AKAR, 'db', 'migrations')
const tanpaKomentar = (t) =>
  t.split('\n').filter((b) => !b.trim().startsWith('--')).join('\n')

const katalog = new Set(
  [
    ...tanpaKomentar(
      readFileSync(join(MIGRASI, '538_katalog_fitur_paket.sql'), 'utf8')
    ).matchAll(/\('(modul\.[a-z0-9_]+)'/g),
  ].map((m) => m[1])
)

for (const berkas of readdirSync(MIGRASI).filter((f) => /^\d+_.*\.sql$/.test(f) && !f.startsWith('538_'))) {
  const teks = tanpaKomentar(readFileSync(join(MIGRASI, berkas), 'utf8'))
  for (const m of teks.matchAll(
    /DELETE\s+FROM\s+plan_features\s+WHERE\s+key\s*=\s*'(modul\.[a-z0-9_]+)'/gi
  )) {
    katalog.delete(m[1])
  }
}

if (katalog.size === 0) {
  console.error('✗ Nol kunci terbaca dari katalog — penjaga ini buta.')
  process.exit(1)
}

for (const k of kunciHalaman) {
  if (!katalog.has(k)) {
    pelanggaran.push({
      jenis: 'KUNCI HANTU',
      nilai: k,
      pesan: 'tak dikenal katalog — halaman akan tampil tanpa daftar isi, dan diamnya terbaca sebagai "modul ini memang kosong"',
    })
  }
}

console.log(`  href diperiksa      : ${new Set(href).size}`)
console.log(`  kunci modul di isi  : ${kunciHalaman.length}`)
console.log(`  kunci katalog       : ${katalog.size}`)

if (pelanggaran.length) {
  console.error(`\n❌ MERAH: ${pelanggaran.length} pelanggaran.\n`)
  for (const p of pelanggaran) {
    console.error(`   [${p.jenis}] ${p.nilai}`)
    console.error(`      ${p.pesan}`)
  }
  console.error(
    '\n  Halaman ini ada untuk memandu orang KELUAR dari jalan buntu. Tautan\n' +
      '  mati di sana berarti orang yang sudah terhalang sekali, mengklik jalan\n' +
      '  keluar yang ditawarkan aplikasi sendiri, lalu menemui 404.\n'
  )
  process.exit(1)
}

console.log('\n✅ Seluruh tautan upsell hidup, dan tiap kunci dikenal katalog.\n')
