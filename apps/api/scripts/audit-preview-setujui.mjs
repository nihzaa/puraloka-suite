#!/usr/bin/env node
/**
 * PENJAGA — jalur preview→setujui, ambang NOL (TJS-E1 / P-7).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA JALUR INI PANTAS PUNYA PENJAGA SENDIRI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Ini satu-satunya jalur di mana sebuah pesan berujung pada uang berpindah.
 * Empat cacat TJS yang dirujuk kriteria E1 semuanya SENYAP — tak satu pun
 * menimbulkan galat saat terjadi:
 *
 *   C-1/C-10  nominal ditebak dari nama field → jenis baru = null = lolos
 *   C-2       batas melekat pada nomor → daftarkan nomor kedua = plafon ganda
 *   (P-3)     token diperiksa lalu dipakai → dua klaim bersamaan = dua kali
 *   (P-1)     approve memanggil `recordApproval` → saldo & rantai terlewat
 *
 * Yang dijaga:
 *
 *   E-1  approve HANYA lewat dispatch rute (`server.inject`), tak pernah
 *        memanggil `recordApproval` langsung
 *   E-2  nominal dibaca dari `kolomNominal` katalog, tak pernah dari daftar
 *        nama yang ditebak
 *   E-3  nominal tak diketahui = Infinity, tak pernah 0 dan tak pernah null
 *   E-4  klaim token ATOMIK — `dipakai_pada` ikut di WHERE, bukan diperiksa
 *        lebih dulu lalu di-update
 *   E-5  batas dicek DUA KALI (preview DAN klaim)
 *   E-6  kedua rute bergerbang `requirePermission('ai:setujui')`
 *
 * Terbukti bisa MERAH: `bash scripts/bukti-mutasi-setujui.sh`.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const LIB = join(AKAR, 'lib', 'ai-setujui.ts')
const RUTE = join(AKAR, 'routes', 'v1', 'ai-setujui.ts')

const lib = readFileSync(LIB, 'utf8')
const rute = readFileSync(RUTE, 'utf8')

/** Komentar dibuang — penjaga yang membaca komentar menghukum penjelasan. */
function tanpaKomentar(src) {
  let blok = false
  return src
    .split('\n')
    .map((b) => {
      const t = b.trim()
      if (blok) {
        if (t.includes('*/')) blok = false
        return ''
      }
      if (t.startsWith('/*')) {
        if (!t.includes('*/')) blok = true
        return ''
      }
      if (t.startsWith('//') || t.startsWith('*')) return ''
      return b
    })
    .join('\n')
}

const libKode = tanpaKomentar(lib)
const ruteKode = tanpaKomentar(rute)

let gagal = 0
const lapor = (kode, pesan) => {
  console.error(`  ❌ ${kode}: ${pesan}`)
  gagal++
}

console.log('── audit: jalur preview→setujui ──')

// ── E-1: approve lewat dispatch, bukan recordApproval ──────────────────────
if (!/server\.inject\s*\(/.test(libKode)) {
  lapor('E-1', 'tak ada dispatch rute — approve tak boleh menyalin logika approval')
}
for (const langsung of ['recordApproval', 'clearApprovalProgress', 'evaluateEntityApproval']) {
  if (libKode.includes(langsung) || ruteKode.includes(langsung)) {
    lapor(
      'E-1',
      `memanggil \`${langsung}\` langsung — melewati saldo, batas kasbon, dan\n` +
        '        rantai bertingkat yang semuanya tinggal DI RUTE (diukur 2026-08-10)',
    )
  }
}

// ── E-2: nominal dari katalog, bukan tebakan nama ──────────────────────────
if (!libKode.includes('sumber.kolomNominal')) {
  lapor('E-2', 'nominal tak dibaca dari `kolomNominal` katalog (C-10)')
}
// Tebakan berantai — bentuk persis yang membuat TJS bocor.
if (/\b(amount|total_amount|nominal)\b\s*\?\?\s*\w+\s*\?\?\s*\w+/.test(libKode)) {
  lapor('E-2', 'nominal ditebak dari rantai nama field — persis cacat C-10')
}

// ── E-3: tak diketahui = Infinity ──────────────────────────────────────────
const nInfinity = (libKode.match(/Number\.POSITIVE_INFINITY/g) ?? []).length
if (nInfinity < 3) {
  lapor(
    'E-3',
    `hanya ${nInfinity} pemakaian POSITIVE_INFINITY — tiga cabang "tak diketahui"\n` +
      '        (tanpa kolom, baris tak terbaca, nilai NULL) semuanya wajib Infinity',
  )
}
// Fungsi nominal TIDAK boleh punya jalan keluar bernilai 0 atau null.
const iNominal = libKode.indexOf('export async function nominalEntitas')
if (iNominal === -1) {
  lapor('E-3', 'fungsi `nominalEntitas` tak ditemukan')
} else {
  const badan = libKode.slice(iNominal, libKode.indexOf('\n}', iNominal))
  if (/return\s+0\b/.test(badan) || /return\s+null\b/.test(badan)) {
    lapor(
      'E-3',
      '`nominalEntitas` punya cabang yang mengembalikan 0/null — keduanya LOLOS\n' +
        '        perbandingan batas, dan itulah bentuk fail-open C-10',
    )
  }
}

// ── E-4: klaim ATOMIK ──────────────────────────────────────────────────────
const iKlaim = libKode.indexOf('export async function klaimToken')
if (iKlaim === -1) {
  lapor('E-4', 'fungsi `klaimToken` tak ditemukan')
} else {
  const badan = libKode.slice(iKlaim)
  // `dipakai_pada` WAJIB ikut sebagai syarat UPDATE, bukan hanya dibaca.
  if (!/\.is\(\s*'dipakai_pada'\s*,\s*null\s*\)/.test(badan)) {
    lapor(
      'E-4',
      'klaim token tak menyertakan `dipakai_pada IS NULL` di WHERE — dua klaim\n' +
        '        bersamaan akan sama-sama menang, dan uang keluar dua kali tanpa galat',
    )
  }
  if (!/\.update\(/.test(badan)) {
    lapor('E-4', 'klaim token tak melakukan UPDATE — token jadi bisa dipakai berulang')
  }
}

// ── E-5: batas dicek DUA KALI ──────────────────────────────────────────────
const nBatas = (libKode.match(/batasPengguna\s*\(/g) ?? []).length
// 1 definisi + 2 pemanggilan (preview & klaim) = 3.
if (nBatas < 3) {
  lapor(
    'E-5',
    `\`batasPengguna\` hanya muncul ${nBatas}× — batas wajib dicek di preview DAN\n` +
      '        di klaim (P-6). Plafon bisa diturunkan di antara keduanya.',
  )
}

/*
 * ── E-6: SETIAP rute bergerbang permission ────────────────────────────────
 *
 * Diperiksa PER RUTE, bukan dengan menghitung kemunculan.
 *
 * Versi pertama menuntut `requirePermission('ai:setujui')` muncul minimal 2×.
 * Berkas ini punya TIGA rute, jadi mencabut gerbang dari salah satunya
 * menyisakan dua — dan penjaga tetap hijau. `bukti-mutasi-setujui.sh` yang
 * menemukannya; membaca ulang tidak.
 *
 * Pelajaran yang sama dengan G-5 di `audit-webhook-bergerbang.mjs` beberapa
 * jam sebelumnya: penghitungan agregat tak bisa membuktikan pernyataan
 * "setiap". Yang menjawab "setiap" hanyalah memeriksa satu per satu.
 */
const rutePost = [...ruteKode.matchAll(/app\.(post|get|patch)<?[^(]*\(\s*\n?\s*'([^']+)'/g)]
if (rutePost.length === 0) {
  lapor('E-6', 'tak ada rute terdeteksi di berkas — pemeriksaan gerbang tak bisa dilakukan')
}
/*
 * Permission yang SAH untuk berkas ini, dan kenapa ada dua:
 *
 *   ai:setujui         memakai jalur preview→setujui
 *   settings:ai:batas  MENENTUKAN plafonnya
 *
 * Sengaja dipisah. Kalau keduanya sama, siapa pun yang boleh menyetujui bisa
 * menaikkan plafonnya sendiri lebih dulu — dan gerbang nominal jadi hiasan.
 *
 * Yang dijaga: SETIAP rute bergerbang salah satunya. Bukan "bergerbang
 * `ai:setujui`" — versi itu akan memaksa halaman plafon memakai permission
 * yang justru salah demi menghijaukan penjaga.
 */
const IZIN_SAH = ["requirePermission('ai:setujui')", "requirePermission('settings:ai:batas')"]
for (const m of rutePost) {
  const jalur = m[2]
  // Potongan sesudah deklarasi rute, sampai handler-nya mulai.
  const mulai = m.index ?? 0
  const kepala = ruteKode.slice(mulai, mulai + 400)
  if (!IZIN_SAH.some((izin) => kepala.includes(izin))) {
    lapor(
      'E-6',
      `rute ${jalur} TIDAK bergerbang permission apa pun yang sah untuk jalur ini\n` +
        `        (ai:setujui atau settings:ai:batas) — ADR-004`,
    )
  }
}

if (gagal > 0) {
  console.error(`\n❌ ${gagal} pelanggaran. Ambang penjaga ini NOL — lihat kepala berkas.`)
  process.exit(1)
}
console.log('  ✅ E-1..E-6 lulus (ambang NOL)')
