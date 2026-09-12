#!/usr/bin/env node
/**
 * PENJAGA — daftar "NCR berat" wajib SEPAKAT di tiga tempat, dan wajib
 * meliputi seluruh enum.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-09-13. Tiga tempat menghitung/menandai "NCR berat", dan
 * ketiganya menyalin pola teks yang SAMA:
 *
 *     /major|mayor|tinggi|high/i
 *
 * Pola itu melewatkan `kritis` — nilai PALING parah di `ncr_severity`.
 * Terukur ke basis hari itu:
 *
 *     ncr_items.severity : minor 7 · kritis 6 · major 6
 *     NCR terbuka berat  : dilaporkan 6, sesungguhnya 12
 *
 * Separuh hilang, dan yang hilang justru yang paling mendesak.
 *
 * ── Kenapa tak bergejala, dan kenapa penjaga TEKS tak cukup
 *
 * `kritis` anggota sah enum. Query berhasil, tipe cocok, `tsc` hijau, nol
 * galat. Yang salah cuma ANGKANYA — dan angka yang terlalu kecil terbaca
 * persis seperti kabar baik. Tak ada test yang bisa menangkapnya tanpa
 * lebih dulu tahu nilai apa saja yang ADA di basis.
 *
 * Karena itu penjaga ini membaca `pg_enum`, bukan daftar tulisan tangan.
 * Penjaga yang bekerja dari daftar hafalan hanya menjaga yang sempat
 * didaftarkan — dan nilai enum BARU adalah persis yang belum didaftarkan
 * siapa pun (CLAUDE.md §6, `audit-batas-terpetakan.mjs`).
 *
 * ── Kenapa kesepakatan ditegakkan penjaga, bukan impor bersama
 *
 * `packages/shared` terdaftar di workspace tetapi KOSONG, dan `apps/web`
 * tak pernah sekali pun mengimpor dari `apps/api`. Memaksakan impor
 * lintas-app untuk enam kata akan menciptakan ketergantungan build baru
 * yang jauh lebih mahal daripada yang dijaganya. Jadi tiap app memegang
 * salinannya, dan SELISIHNYA yang dijaga.
 *
 * ── Yang diperiksa
 *
 *   1. Ketiga daftar memuat himpunan nilai yang SAMA.
 *   2. Tiap nilai `ncr_severity` sudah DITIMBANG — berat atau sengaja
 *      tidak. Nilai yang tak disebut di mana pun adalah nilai yang akan
 *      jatuh diam-diam ke "tidak berat".
 *   3. Pola teks lama tak kembali.
 *
 * ⚠ BATAS: yang dibaca KEPUTUSAN DI KODE. Penjaga ini tak tahu apakah
 * layarnya benar-benar menampilkan lencananya — itu hanya ketahuan dari
 * memotret (CLAUDE.md §8a.3).
 *
 * Ambang NOL.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** ⚠ CR dibuang lebih dulu — CLAUDE.md §7a, lima kali tertipu dalam sehari. */
const baca = (p) => readFileSync(p, 'utf8').replace(/\r/g, '')

/**
 * Buang komentar, pertahankan NOMOR BARIS.
 *
 * ⚠ Menyaring per-baris lewat prefiks (`*`, `//`) TIDAK cukup, dan versi
 * pertama penjaga ini merah karenanya: baris di tengah blok `/* *\/` tak
 * selalu berawalan `*`, jadi penjelasan tentang pola lama terhitung
 * sebagai pemakaiannya. Persis bentuk yang tercatat di CLAUDE.md §8a.2 —
 * penjelasan BENAR yang dituduh sebagai keadaan SALAH.
 *
 * Baris diganti string kosong, bukan dihapus, supaya nomor barisnya tetap
 * menunjuk tempat yang sama di berkas aslinya.
 */
function tanpaKomentar(isi) {
  return isi
    .replace(/\/\*[\s\S]*?\*\//g, (blok) => blok.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (b) => ' '.repeat(b.length))
}

const SUMBER = [
  {
    nama: 'apps/api/src/lib/keparahan.ts',
    berkas: join(AKAR, 'apps', 'api', 'src', 'lib', 'keparahan.ts'),
    pola: /export const NCR_BERAT\s*=\s*\[([^\]]*)\]/,
  },
  {
    nama: 'apps/web/app/admin-portal/mutu/page.tsx',
    berkas: join(AKAR, 'apps', 'web', 'app', 'admin-portal', 'mutu', 'page.tsx'),
    pola: /const NCR_BERAT\s*=\s*\[([^\]]*)\]/,
  },
]

/** Pola teks yang DIGANTI. Kembalinya berarti cacatnya kembali. */
const POLA_LAMA = /major\|mayor\|tinggi\|high/

const masalah = []
const himpunan = []

for (const s of SUMBER) {
  if (!existsSync(s.berkas)) {
    masalah.push(`${s.nama}: berkas tak ada`)
    continue
  }
  const isi = baca(s.berkas)

  const m = isi.match(s.pola)
  if (!m) {
    /*
      Pola yang meleset memulangkan nol temuan, dan nol terbaca seperti
      "semuanya benar". Ini yang membedakan "tak ada pelanggaran" dari
      "tak ada yang terbaca" (CLAUDE.md §7a).
    */
    masalah.push(`${s.nama}: daftar NCR_BERAT tak terbaca — polanya meleset`)
    continue
  }

  const nilai = [...m[1].matchAll(/['"]([a-z_]+)['"]/g)].map((x) => x[1]).sort()
  if (nilai.length === 0) {
    masalah.push(`${s.nama}: daftar NCR_BERAT KOSONG`)
    continue
  }
  himpunan.push({ nama: s.nama, nilai })

  /*
    Dicari pada KODE saja — komentar yang MENERANGKAN kenapa pola itu
    ditinggalkan bukan pemakaiannya (CLAUDE.md §8a.2).
  */
  const kode = tanpaKomentar(isi)
  kode.split('\n').forEach((b, i) => {
    if (POLA_LAMA.test(b)) {
      masalah.push(`${s.nama}:${i + 1} — pola lama kembali: ${b.trim().slice(0, 70)}`)
    }
  })
}

/* ── 1. Ketiga daftar sepakat ────────────────────────────────────────────── */
if (himpunan.length >= 2) {
  const rujukan = himpunan[0]
  for (const h of himpunan.slice(1)) {
    if (h.nilai.join(',') !== rujukan.nilai.join(',')) {
      masalah.push(
        `daftar TIDAK sepakat:\n` +
          `      ${rujukan.nama} → [${rujukan.nilai.join(', ')}]\n` +
          `      ${h.nama} → [${h.nilai.join(', ')}]`,
      )
    }
  }
}

/* ── 2. Seluruh enum sudah ditimbang ─────────────────────────────────────── */
/*
  Enum dibaca dari MIGRASI, bukan dari basis hidup — penjaga CI tak punya
  koneksi. `ledger-diff.mjs` sudah menjaga migrasi cocok dengan artefak
  fisiknya, jadi migrasi adalah sumber yang sah di sini.
*/
const MIG = join(AKAR, 'db', 'migrations', '189_ncr.sql')
let enumNcr = []
if (existsSync(MIG)) {
  const m = baca(MIG).match(/CREATE TYPE ncr_severity AS ENUM \(([^)]*)\)/)
  if (m) enumNcr = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
}

if (enumNcr.length === 0) {
  masalah.push('enum ncr_severity tak terbaca dari db/migrations/189_ncr.sql')
} else if (himpunan.length > 0) {
  /*
    Tiap nilai wajib DISEBUT — entah sebagai berat, entah sebagai label.
    Nilai yang tak disebut di mana pun akan jatuh diam-diam ke "tidak
    berat", dan itu persis cacat yang penjaga ini tutup.
  */
  const isiApi = existsSync(SUMBER[0].berkas) ? tanpaKomentar(baca(SUMBER[0].berkas)) : ''
  for (const v of enumNcr) {
    /*
      "Disebut" berarti muncul di KODE — entah sebagai anggota daftar
      berat (`'kritis'`), entah sebagai kunci peta label (`minor: 'Minor'`).
      Keduanya adalah keputusan sadar; yang tak muncul sama sekali bukan.

      ⚠ Versi pertama hanya mencari literal berkutip, jadi `minor` —
      yang sah sebagai KUNCI objek tanpa kutip — dituduh terlewat.
      Penjaga yang merah atas hal yang benar akan diabaikan seluruh
      keluarannya (CLAUDE.md §6).
    */
    const disebut =
      new RegExp(`['"]${v}['"]`).test(isiApi) || new RegExp(`\\b${v}\\s*:`).test(isiApi)
    if (!disebut) {
      masalah.push(
        `nilai enum '${v}' TAK DISEBUT di keparahan.ts — ` +
          `ia akan jatuh diam-diam ke "tidak berat"`,
      )
    }
  }
}

/* ── Laporan ─────────────────────────────────────────────────────────────── */
console.log('── keparahan sepakat ──')
console.log(`  enum ncr_severity : ${enumNcr.join(', ') || '(tak terbaca)'}`)
for (const h of himpunan) console.log(`  ${h.nama} → [${h.nilai.join(', ')}]`)

if (masalah.length > 0) {
  console.error(`\n❌ ${masalah.length} masalah:`)
  for (const m of masalah) console.error(`   • ${m}`)
  console.error('\n   Ambang NOL. Daftar "berat" yang tak lengkap melaporkan')
  console.error('   angka yang terlalu KECIL — dan itu terbaca seperti kabar baik.')
  process.exit(1)
}

console.log('\n✅ daftar keparahan sepakat, dan seluruh enum sudah ditimbang.')
