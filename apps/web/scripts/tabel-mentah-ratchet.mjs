#!/usr/bin/env node
/**
 * PENJAGA TABEL MENTAH — halaman yang menulis `<table>` sendiri, bukan `<Tabel>`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-04: *"kurang dapet wah-nya, kurang punya taste desain"*.
 * `ARAH-VISUAL-2026.md` menjawabnya dengan UI-0-4: *"bangun komponen bersama —
 * ini yang menghapus kesan buatan sendiri"*.
 *
 * **Premis itu salah, dan pengukurannya membalik seluruh item.** Diukur
 * 2026-08-07, komponennya SUDAH ADA dan berkualitas tinggi:
 *
 *     KartuKPI        components/ui-dasar.tsx:123
 *     Panel + grafik  components/ui-dasar.tsx:260, 382, 448
 *     Tabel<T>        components/dasar.tsx:320
 *     KepalaHalaman   components/dasar.tsx:82
 *
 * Yang tidak ada adalah PEMAKAIANNYA:
 *
 *     halaman total              75
 *     memakai komponen bersama   19  (25%)
 *     memakai <Tabel>             1  ← satu
 *     menulis <table> mentah     28  ← dua puluh delapan
 *
 * Satu halaman memakai tabel bersama; dua puluh delapan menulisnya dari nol.
 * Itu sebabnya tiap halaman terasa sedikit berbeda — bukan karena warnanya,
 * dan bukan karena komponennya belum dibangun.
 *
 * ── Kenapa ini bukan sekadar soal rupa
 *
 * `Tabel<T>` menjaga empat hal yang pemakainya tak perlu ingat lagi:
 *
 *   · `<caption>` tersembunyi     — pembaca layar tahu tabel ini tentang apa
 *   · kolom pertama `scope="row"` — barisnya punya nama
 *   · `tabular-nums` + rata kanan — digit sejajar, besaran bisa dibandingkan
 *   · pembungkus `overflow-x`     — tabel lebar tak menggeser halaman
 *
 * Tiap `<table>` mentah adalah empat kesempatan melupakan salah satunya. Itu
 * bukan hipotesis: commit `16164e9` memperbaiki **24 tabel tanpa caption**,
 * `ed3a55d` + `0adb5b9` menurunkan `scope="row"` yang hilang dari 55 → 14.
 * Tiga commit, ratusan baris, untuk cacat yang komponennya sudah cegah sejak
 * awal. Ratchet ini memastikan pekerjaan itu tak perlu diulang keempat kali.
 *
 * ── Kenapa ratchet, bukan larangan
 *
 * Melarang `<table>` hari ini berarti menolak 28 halaman yang sudah jalan.
 * Yang ditegakkan: **jumlahnya tak boleh naik**. Halaman baru wajib memakai
 * `<Tabel>`; halaman lama dipindahkan saat kebetulan disentuh.
 *
 * Lantai turun otomatis saat ada yang dipindahkan (pola `coverage-lantai.json`)
 * — jadi kemajuan langsung terkunci dan tak bisa mundur diam-diam.
 *
 * ── Yang TIDAK dijaga (jujur soal batasnya)
 *
 * Skrip ini memeriksa TEKS SUMBER, bukan hasil render. Ia tahu sebuah berkas
 * menulis `<table>`; ia tak tahu apakah tabel itu punya caption yang benar.
 * Yang kedua sudah dijaga penjaga lain (`a11y-ratchet`, audit axe runtime).
 *
 * Portal (`/portal`, `/pm-portal`, `/mandor-portal`) IKUT dihitung — beda
 * dengan `tata-letak-ratchet` yang mengecualikannya. Alasannya: lebar halaman
 * memang berbeda konteks di ponsel, tapi caption dan `scope="row"` sama
 * wajibnya bagi pembaca layar di perangkat mana pun.
 *
 * Jalankan: node apps/web/scripts/tabel-mentah-ratchet.mjs
 * Naikkan lantai (hanya bila memang disengaja): --naikkan
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const AKAR = join(import.meta.dirname, '..')
const BERKAS_LANTAI = join(import.meta.dirname, 'tabel-mentah-lantai.json')

/** Semua .tsx di app/, kecuali test dan berkas build. */
function berkasTsx(dir, keluar = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) berkasTsx(p, keluar)
    else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) keluar.push(p)
  }
  return keluar
}

const pelanggar = []
for (const f of berkasTsx(join(AKAR, 'app'))) {
  const isi = readFileSync(f, 'utf8')
  // `<table` dengan batas kata: menangkap `<table>` dan `<table style=...>`,
  // tapi bukan `<tablePicker`. Komponen bersama sendiri tak ada di app/.
  if (!/<table[\s>]/.test(isi)) continue
  const jumlah = (isi.match(/<table[\s>]/g) || []).length
  pelanggar.push({ berkas: relative(AKAR, f).split('\\').join('/'), jumlah })
}
pelanggar.sort((a, b) => b.jumlah - a.jumlah)

const sekarang = pelanggar.length
let lantai
try {
  lantai = JSON.parse(readFileSync(BERKAS_LANTAI, 'utf8'))
} catch {
  lantai = { halaman: sekarang, _catatan: 'diukur otomatis pada jalan pertama' }
}

if (process.argv.includes('--naikkan')) {
  const baru = {
    ...lantai,
    halaman: sekarang,
    _diukur: new Date().toISOString().slice(0, 10),
    _riwayat: [...(lantai._riwayat || []), `${lantai.halaman} → ${sekarang}`],
  }
  writeFileSync(BERKAS_LANTAI, JSON.stringify(baru, null, 2) + '\n')
  console.log(`Lantai diperbarui: ${lantai.halaman} → ${sekarang}`)
  process.exit(0)
}

console.log('\n══ RATCHET tabel mentah (UI-0-4) ═══════════════════════════════════')
console.log(`  halaman ber-<table> : ${sekarang}`)
console.log(`  lantai (maks)       : ${lantai.halaman}`)
console.log(`  total tabel mentah  : ${pelanggar.reduce((n, p) => n + p.jumlah, 0)}`)

if (sekarang > lantai.halaman) {
  console.error(`\n❌ BERTAMBAH ${sekarang - lantai.halaman} halaman.\n`)
  console.error('   Halaman baru wajib memakai <Tabel> dari @/components/dasar —')
  console.error('   ia sudah menjaga caption, scope="row", tabular-nums, dan')
  console.error('   overflow-x. Menulis <table> sendiri berarti empat hal itu')
  console.error('   harus diingat ulang, dan riwayat repo ini menunjukkan bahwa')
  console.error('   ia TIDAK diingat (commit 16164e9, ed3a55d, 0adb5b9).\n')
  console.error('   Pelanggar terbesar:')
  pelanggar.slice(0, 5).forEach((p) => console.error(`     ${String(p.jumlah).padStart(3)} × ${p.berkas}`))
  console.error('')
  process.exit(1)
}

if (sekarang < lantai.halaman) {
  const baru = {
    ...lantai,
    halaman: sekarang,
    _diukur: new Date().toISOString().slice(0, 10),
    _riwayat: [...(lantai._riwayat || []), `${lantai.halaman} → ${sekarang} (otomatis)`],
  }
  writeFileSync(BERKAS_LANTAI, JSON.stringify(baru, null, 2) + '\n')
  console.log(`\n  ✅ TURUN ${lantai.halaman} → ${sekarang}. Lantai ikut turun — terkunci.\n`)
  process.exit(0)
}

console.log('\n  ✅ tidak bertambah.\n')
