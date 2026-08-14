#!/usr/bin/env node
/**
 * PENJAGA: PAGAR FAKTA IKUT DI SETIAP KOMBINASI SIFAT BICARA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG DICEGAH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai 2026-08-14 satu konstanta memuat dua larangan yang sifatnya berbeda:
 * "jangan mengarang angka" (mutlak) dan "jangan berpendapat" (gaya). Founder
 * meminta yang kedua dilonggarkan — dan cara termudah memenuhinya adalah
 * menghapus blok itu seluruhnya, yang sekaligus mencabut yang pertama.
 *
 * Migrasi 382 memisahkannya: `PAGAR_FAKTA` tetap, `GAYA_BICARA` bervariasi.
 * Penjaga ini memastikan pemisahan itu tak pelan-pelan bocor kembali.
 *
 * Kenapa butuh penjaga padahal sudah ada test: menambah mode keempat adalah
 * satu baris, dan LUPA menyambungkan pagarnya juga satu baris. Test hanya
 * memeriksa mode yang sudah ia kenal — `MODE_BICARA` yang bertambah tak
 * otomatis menambah kasus uji. Penjaga ini membaca sumbernya, jadi mode baru
 * yang tak berpagar terlihat tanpa ada yang perlu ingat menuliskan testnya.
 *
 * ── Yang diperiksa
 *
 *   P-1  `PAGAR_FAKTA` ada dan memuat kalimat-kalimat yang menahan halusinasi
 *   P-2  tiap kunci `SIFAT_GAYA` punya entri di `SIFAT_BICARA` dan sebaliknya
 *   P-3  `susunPromptSistem` menyambung `PAGAR_FAKTA` TANPA cabang kondisional
 *   P-4  jalur yang memberi izin berpendapat SELALU melewati penanda opini
 *
 * P-3 yang paling penting dan paling halus: `PAGAR_FAKTA` yang disebut di
 * dalam ternary (`mode === 'x' ? '' : PAGAR_FAKTA`) tetap "menyebut" pagar,
 * tetapi tidak selalu memakainya. Penjaga yang hanya mencari namanya akan
 * HIJAU-KARENA-BUTA persis pada cacat yang ia dibuat untuk mencegah.
 *
 * Ambang NOL.
 *
 * Pakai:  node apps/api/scripts/audit-pagar-fakta-utuh.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SUMBER = resolve(__dirname, '..', 'src', 'lib', 'ai-jalankan.ts')
const KONFIG = resolve(__dirname, '..', 'src', 'lib', 'ai-config.ts')

/**
 * Kalimat yang HARUS ada di pagar.
 *
 * Bukan seluruh isi pagar — hanya bagian yang kalau hilang membuat asisten
 * tetap terdengar meyakinkan sambil menyebut angka yang tak ada. Daftar
 * pendek disengaja: penjaga yang menuntut teks persis akan merah tiap kali
 * ada yang memperbaiki satu kata, dan penjaga yang sering merah tanpa sebab
 * nyata adalah penjaga yang akhirnya dimatikan.
 */
const KALIMAT_WAJIB = [
  'Jangan pernah mengarang angka',
  'SEBUTKAN SUMBER',
  'hanya bisa MEMBACA',
  '<data>',
]


const pelanggaran = []

const src = readFileSync(SUMBER, 'utf8')
const cfg = readFileSync(KONFIG, 'utf8')

// ── P-1: pagar ada dan isinya utuh ─────────────────────────────────────────
const mPagar = src.match(/export const PAGAR_FAKTA = \[([\s\S]*?)\]\.join/)
if (!mPagar) {
  pelanggaran.push('P-1: `PAGAR_FAKTA` tidak ditemukan di ai-jalankan.ts')
} else {
  for (const kalimat of KALIMAT_WAJIB) {
    if (!mPagar[1].includes(kalimat)) {
      pelanggaran.push(`P-1: pagar kehilangan kalimat penahan: "${kalimat}"`)
    }
  }
}

// ── P-2: SIFAT_BICARA dan SIFAT_GAYA sepakat ───────────────────────────────
const mEnum = cfg.match(/export const SIFAT_BICARA = \[([\s\S]*?)\] as const/)
if (!mEnum) {
  pelanggaran.push('P-2: `SIFAT_BICARA` tidak ditemukan di ai-config.ts')
}
const mGaya = src.match(/export const SIFAT_GAYA[^=]*= \{([\s\S]*?)\n\}/)
if (!mGaya) {
  pelanggaran.push('P-2: `SIFAT_GAYA` tidak ditemukan di ai-jalankan.ts')
}

let modeEnum = []
let modeGaya = []
if (mEnum && mGaya) {
  modeEnum = [...mEnum[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
  // Kunci objek di kolom nol-indentasi dua spasi — `pelapor: [`
  modeGaya = [...mGaya[1].matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1])

  for (const m of modeEnum) {
    if (!modeGaya.includes(m)) {
      pelanggaran.push(`P-2: sifat '${m}' ada di SIFAT_BICARA tetapi tak punya SIFAT_GAYA`)
    }
  }
  for (const m of modeGaya) {
    if (!modeEnum.includes(m)) {
      pelanggaran.push(`P-2: gaya '${m}' ditulis tetapi tak terdaftar di SIFAT_BICARA`)
    }
  }
}

// ── P-3: pagar disambung TANPA cabang ──────────────────────────────────────
//
// Yang dicari bukan "apakah PAGAR_FAKTA disebut" melainkan bentuk barisnya.
// Penyambungan yang sah tak punya `?`/`:`/`&&`/`||` sebelum nama pagarnya.
const mSusun = src.match(/export function susunPromptSistem\([\s\S]*?\n\}/)
if (!mSusun) {
  pelanggaran.push('P-3: `susunPromptSistem` tidak ditemukan')
} else {
  const badan = mSusun[0]
  const barisDasar = badan
    .split('\n')
    .find((b) => /const\s+dasar\s*=/.test(b))

  if (!barisDasar) {
    pelanggaran.push('P-3: baris `const dasar =` tidak ditemukan di susunPromptSistem')
  } else if (!barisDasar.includes('PAGAR_FAKTA')) {
    pelanggaran.push('P-3: `dasar` disusun TANPA PAGAR_FAKTA')
  } else {
    const sesudahSamaDengan = barisDasar.slice(barisDasar.indexOf('=') + 1)
    const sebelumPagar = sesudahSamaDengan.slice(0, sesudahSamaDengan.indexOf('PAGAR_FAKTA'))
    if (/[?:]|&&|\|\|/.test(sebelumPagar)) {
      pelanggaran.push(
        'P-3: PAGAR_FAKTA disambung di balik cabang kondisional — ' +
          'ada mode yang bisa berjalan tanpa pagar. Baris: ' +
          barisDasar.trim(),
      )
    }
  }
}

// ── P-4: begitu ada sifat, penanda opini WAJIB ikut ────────────────────────
//
// Sejak sifat bisa digabung (383), penanda opini tak lagi disalin ke tiap
// sifat melainkan disambung sekali di `susunGaya`. Yang diperiksa berubah
// mengikutinya: bukan "tiap mode memuat kalimatnya", melainkan "jalur yang
// memberi izin berpendapat SELALU melewati penandanya".
const mSusunGaya = src.match(/export function susunGaya\([\s\S]*?\n\}/)
if (!mSusunGaya) {
  pelanggaran.push('P-4: `susunGaya` tidak ditemukan')
} else {
  const badan = mSusunGaya[0]
  if (!badan.includes('PENANDA_OPINI')) {
    pelanggaran.push(
      'P-4: `susunGaya` tak menyambung PENANDA_OPINI — saran yang tak bisa ' +
        'dibedakan dari data akan dibaca sebagai data',
    )
  }
  // Penanda harus disambung SESUDAH cabang himpunan-kosong keluar lebih dulu,
  // yaitu di jalur yang benar-benar punya sifat. Kalau ia ikut di jalur kosong,
  // asisten pelapor diberi tahu cara menandai opini yang tak boleh ia punya.
  const iKosong = badan.indexOf('punya.size === 0')
  const iPenanda = badan.indexOf('PENANDA_OPINI')
  if (iKosong >= 0 && iPenanda >= 0 && iPenanda < iKosong) {
    pelanggaran.push(
      'P-4: PENANDA_OPINI disambung sebelum cabang himpunan-kosong — ' +
        'asisten pelapor ikut diberi izin menandai pendapat',
    )
  }
}

if (!src.includes('export const PENANDA_OPINI')) {
  pelanggaran.push('P-4: `PENANDA_OPINI` tidak ditemukan di ai-jalankan.ts')
}

// ── Laporan ────────────────────────────────────────────────────────────────
if (pelanggaran.length > 0) {
  console.error('\n✗ PAGAR FAKTA BOCOR\n')
  for (const p of pelanggaran) console.error(`  • ${p}`)
  console.error(`\n  ${pelanggaran.length} pelanggaran. Ambang NOL.\n`)
  process.exit(1)
}

console.log(
  `✓ Pagar fakta utuh — ${modeEnum.length} sifat bicara, ` +
    `${KALIMAT_WAJIB.length} kalimat penahan, disambung tanpa cabang.`,
)
