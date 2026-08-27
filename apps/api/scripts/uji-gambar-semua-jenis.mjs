#!/usr/bin/env node
// ============================================================================
// SETIAP jenis elemen wajib menghasilkan gambar — dibuktikan lewat rute HIDUP.
// ============================================================================
//
// ── Kenapa ini ada, padahal sudah ada `lapor-cakupan-gambar.mjs`
//
// Laporan itu membaca KODE: ia mencari cabang yang menyebut tiap jenis di
// dalam `gambarUntuk()`. Dalam satu sesi ia SALAH TIGA KALI, dan ketiganya
// dengan cara yang sama — cabang baru ditulis dengan bentuk yang belum
// dikenalinya:
//
//   1. penampang baja dipilih dari `input.profil`, bukan `el.jenis === …`
//      → melapor 7/32 padahal sudah 17/32
//   2. empat sambungan memakai TABEL berkunci jenis
//      → melapor 26/32 padahal sudah 29/32
//   3. satu entri tabel berbadan blok `() => { … }`, bukan `() => ({ … })`
//      → melapor 31/32 padahal sudah 32/32
//
// Tiap kali angkanya TERLIHAT masuk akal. Itulah yang membuat laporan
// berbasis pembacaan kode berbahaya: ia salah dengan percaya diri.
//
// Penguji ini tidak membaca kode sama sekali. Ia MEMBUAT elemen sungguhan
// untuk tiap jenis, meminta gambarnya lewat rute, lalu membuka SVG-nya.
//
// ── Contoh input datang dari UI, bukan ditulis ulang di sini
//
// `apps/web/app/(dashboard)/estimasi/struktur/page.tsx` sudah memuat `CONTOH`
// lengkap untuk 32 jenis — itulah yang dilihat pengguna saat menekan "isi
// contoh". Menulis ulang contohnya di sini berarti dua daftar yang bisa
// menyimpang, dan yang menyimpang tak akan ketahuan: penguji tetap hijau
// sementara contoh di layar sudah rusak.
//
// Karena itu penguji ini MEMBACA contoh dari berkas UI. Efek sampingnya
// berharga: kalau contoh di UI rusak, penguji ini yang merah.
//
// Pakai: UJI_EMAIL=… UJI_SANDI=… UJI_BASIS=http://127.0.0.1:3017 \
//          node scripts/uji-gambar-semua-jenis.mjs
// ============================================================================

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASIS = process.env.UJI_BASIS ?? 'http://127.0.0.1:3017'
const EMAIL = process.env.UJI_EMAIL ?? process.env.LAYAR_EMAIL
const SANDI = process.env.UJI_SANDI ?? process.env.LAYAR_SANDI

if (!EMAIL || !SANDI) {
  console.error('\n❌ UJI_EMAIL/UJI_SANDI (atau LAYAR_EMAIL/LAYAR_SANDI) wajib diisi.\n')
  process.exit(1)
}

// ── Jenis: dibaca dari rute ─────────────────────────────────────────────────
const RUTE = join(process.cwd(), 'src', 'routes', 'v1', 'struktur.ts')
const isiRute = readFileSync(RUTE, 'utf8')
const mJenis = isiRute.match(/const JENIS = \[([\s\S]*?)\] as const/)
if (!mJenis) { console.error('❌ Konstanta JENIS tak ditemukan'); process.exit(1) }
const SEMUA_JENIS = [...mJenis[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])

// ── Contoh: dibaca dari UI ──────────────────────────────────────────────────
const HAL = join(
  process.cwd(), '..', 'web', 'app', '(dashboard)', 'estimasi', 'struktur', 'page.tsx',
)
const isiHal = readFileSync(HAL, 'utf8')

/*
  `CONTOH` adalah objek TypeScript, bukan JSON: kuncinya tanpa tanda kutip dan
  ada komentar di dalamnya. Diurai dengan mengambil badan objeknya lalu
  menjalankannya sebagai ekspresi JS — sah di sini karena berkasnya milik repo
  ini sendiri, bukan masukan dari luar.
*/
const iAwal = isiHal.indexOf('const CONTOH')
if (iAwal < 0) { console.error('❌ CONTOH tak ditemukan di halaman UI'); process.exit(1) }
const iKurung = isiHal.indexOf('{', iAwal)
let kedalaman = 0
let iAkhir = -1
for (let k = iKurung; k < isiHal.length; k++) {
  if (isiHal[k] === '{') kedalaman++
  else if (isiHal[k] === '}') { kedalaman--; if (kedalaman === 0) { iAkhir = k; break } }
}
if (iAkhir < 0) { console.error('❌ Badan CONTOH tak tertutup'); process.exit(1) }

/*
  `CONTOH` merujuk konstanta lain di berkas yang sama (`PROFIL_WF200`,
  `MUTU_BAUT_A325`). Keduanya ikut diambil dari berkasnya, bukan disalin ke
  sini — konstanta yang disalin akan menyimpang diam-diam, dan penguji yang
  memakai profil berbeda dari yang dipakai UI tak menguji apa yang dilihat
  pengguna.

  Nama konstantanya TIDAK didaftar di sini. Versi pertama mendaftarnya
  (`PROFIL_WF200`, `MUTU_BAUT_A325`) dan langsung merah pada yang ketiga
  (`MUTU_BJ37`) — daftar yang ditulis tangan selalu tertinggal dari berkas
  yang didaftarnya. Yang dirujuk diambil dari badan `CONTOH` itu sendiri.
*/
const badanContoh = isiHal.slice(iKurung, iAkhir + 1)

/*
  Isi STRING dibuang lebih dulu. Banyak nilai contoh kebetulan berbentuk
  huruf-besar-bergaris-bawah — `"C75_100"` (profil baja ringan), `"BJ37"`,
  `"CIB_STD"` — dan tanpa pembuangan ini penguji menuntut adanya konstanta
  bernama `C75_100` yang memang tak pernah ada, lalu berhenti.
*/
const tanpaString = badanContoh.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""')
const dirujuk = new Set(
  [...tanpaString.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)].map((m) => m[1]),
)

/*
  Hanya token yang BENAR-BENAR dideklarasikan di berkas itu yang diambil.

  Membalik urutannya (menuntut tiap token huruf-besar punya deklarasi) membuat
  penguji berhenti pada kata biasa yang kebetulan huruf besar — `BAJA` di
  dalam komentar, misalnya. Yang tak dideklarasikan bukan urusan penguji ini;
  kalau ia memang identifier yang hilang, `new Function` di bawah yang akan
  mengeluh, dengan pesan yang menyebut namanya.
*/
const konstanta = []
for (const nama of dirujuk) {
  const m = isiHal.match(new RegExp(`^const ${nama} = ([\\s\\S]*?);$`, 'm'))
  if (m) konstanta.push(`const ${nama} = ${m[1]};`)
}

let CONTOH
try {
  // eslint-disable-next-line no-new-func
  CONTOH = new Function(
    `${konstanta.join('\n')}\nreturn (${isiHal.slice(iKurung, iAkhir + 1)})`,
  )()
} catch (e) {
  console.error(`❌ Tak bisa mengurai CONTOH dari UI: ${e.message}`)
  process.exit(1)
}

// ── Masuk ───────────────────────────────────────────────────────────────────
const masuk = await fetch(`${BASIS}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: SANDI }),
}).catch((e) => ({ ok: false, status: 0, _err: e }))

if (!masuk.ok) {
  console.error(`\n❌ Gagal masuk (${masuk.status || 'tak terhubung'}) ke ${BASIS}.`)
  if (masuk._err) console.error(`   ${masuk._err.message}`)
  console.error('   UKUR portnya — CLAUDE.md §7.\n')
  process.exit(1)
}
const cookie = (masuk.headers.getSetCookie?.() ?? [])
  .map((c) => c.split(';')[0])
  .filter((c) => /^puraloka_(token|refresh)=/.test(c))
  .join('; ')
if (!cookie) { console.error('\n❌ Tak ada cookie `puraloka_token`.\n'); process.exit(1) }

const H = { 'content-type': 'application/json', cookie }
const H_HAPUS = { cookie }
const JALAN = (process.hrtime.bigint() % 100000n).toString(36)

const dp = await fetch(`${BASIS}/api/v1/projects?limit=1`, { headers: H })
const jp = await dp.json()
const proyek = (jp.data ?? jp.projects ?? jp)[0]
if (!proyek?.id) { console.error('\n❌ Tak ada proyek untuk elemen uji.\n'); process.exit(1) }

console.log('══ SETIAP jenis wajib bergambar — lewat rute hidup ═════════')
console.log(`   ${BASIS} · proyek ${proyek.name ?? proyek.nama ?? proyek.id}`)
console.log(`   ${SEMUA_JENIS.length} jenis, contoh dibaca dari halaman UI\n`)

let gagal = 0
let bergambar = 0
const dibuat = []
const tanpaGambar = []

for (const [idx, jenis] of SEMUA_JENIS.entries()) {
  const contoh = CONTOH[jenis]
  if (!contoh) {
    console.error(`❌ ${jenis}: tak punya CONTOH di halaman UI`)
    console.error('   Pengguna yang menekan "isi contoh" mendapat form kosong.')
    gagal++
    continue
  }

  const buat = await fetch(`${BASIS}/api/v1/projects/${proyek.id}/struktur`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      kode: `UJI-ALL-${idx + 1}-${JALAN}`,
      nama: `uji gambar ${jenis}`,
      jenis, jumlah: 1, input: contoh,
      catatan: 'uji-gambar-semua-jenis.mjs — dihapus otomatis',
    }),
  })
  if (!buat.ok) {
    console.error(`❌ ${jenis}: BUAT gagal HTTP ${buat.status}`)
    console.error(`   ${(await buat.text()).slice(0, 220)}`)
    gagal++
    continue
  }
  const jb = await buat.json()
  const id = (jb.data ?? jb)?.id
  if (!id) { console.error(`❌ ${jenis}: balasan BUAT tak memuat id`); gagal++; continue }
  dibuat.push(id)

  const baca = await fetch(`${BASIS}/api/v1/struktur/${id}?gambar=1`, { headers: H })
  if (!baca.ok) {
    console.error(`❌ ${jenis}: BACA gagal HTTP ${baca.status}`)
    console.error(`   ${(await baca.text()).slice(0, 220)}`)
    gagal++
    continue
  }
  const h = await baca.json()
  const gambar = h.gambar ?? {}

  /* Medan `…Gagal` = gambar dicoba dan GAGAL. Itu selalu masalah. */
  const medanGagal = Object.entries(gambar).filter(([k]) => /Gagal$/.test(k))
  for (const [k, v] of medanGagal) {
    console.error(`❌ ${jenis}: ${k} — ${v}`)
    gagal++
  }

  /*
    Yang dihitung "bergambar" hanya SVG yang benar-benar bisa ditampilkan.
    Meteran kekuatan DIKECUALIKAN: ia ada untuk semua jenis, dan
    menghitungnya membuat tiap jenis terlihat bergambar padahal tak satu pun
    memperlihatkan BENDANYA.
  */
  const svgNyata = Object.entries(gambar).filter(([k, v]) =>
    k !== 'meteran' && typeof v === 'string' && v.includes('<svg'))

  if (!svgNyata.length) {
    tanpaGambar.push(jenis)
    console.log(`  ·  ${jenis.padEnd(24)} hanya meteran`)
    continue
  }

  let cacat = 0
  const rincian = []
  for (const [nama, svg] of svgNyata) {
    const vb = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/)
    if (!vb) {
      console.error(`❌ ${jenis}: "${nama}" tak punya viewBox`)
      cacat++; gagal++
      continue
    }
    const w = Number(vb[3]), t = Number(vb[4])
    if (!(w > 0) || !(t > 0)) {
      console.error(`❌ ${jenis}: "${nama}" viewBox ${w}×${t} — gambar KOSONG`)
      cacat++; gagal++
      continue
    }
    /* SVG tanpa aria-label adalah gambar tanpa nama bagi pembaca layar. */
    if (!/aria-label="[^"]+"/.test(svg)) {
      console.error(`❌ ${jenis}: "${nama}" tanpa aria-label`)
      cacat++; gagal++
    }
    rincian.push(`${nama} ${w.toFixed(0)}×${t.toFixed(0)}`)
  }

  if (!cacat) {
    bergambar++
    console.log(`  ✓  ${jenis.padEnd(24)} ${rincian.join(' · ')}`)
  }
}

// ── Bersihkan ───────────────────────────────────────────────────────────────
for (const id of dibuat) {
  const d = await fetch(`${BASIS}/api/v1/struktur/${id}`, { method: 'DELETE', headers: H_HAPUS })
  if (!d.ok) { console.error(`⚠ elemen uji ${id} TAK terhapus (HTTP ${d.status})`); gagal++ }
}

console.log('')
console.log(`  BERGAMBAR ${bergambar} / ${SEMUA_JENIS.length}`)
console.log(`  (${dibuat.length} elemen uji dibuat dan dihapus kembali)`)

if (tanpaGambar.length) {
  console.log('')
  console.log(`  Hanya meteran: ${tanpaGambar.join(', ')}`)
  console.log('  Itu urutan kerja, bukan cacat — penguji ini tak menggagalkannya.')
}

if (gagal) {
  console.error(`\n❌ ${gagal} masalah pada gambar kerja`)
  process.exit(1)
}
console.log(`\n✅ ${SEMUA_JENIS.length} jenis diperiksa lewat rute sungguhan`)
