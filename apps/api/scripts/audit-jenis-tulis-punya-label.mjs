#!/usr/bin/env node
/**
 * PENJAGA — tiap jenis tulis wajib punya LABEL di UI. Ambang NOL.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI KELAS CACAT, BUKAN KELALAIAN SEKALI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ENTITAS_TULIS` (backend) dan `LABEL_JENIS` (kartu konfirmasi di web) adalah
 * dua daftar yang HARUS sama, ditulis di dua berkas, oleh orang yang biasanya
 * sedang memikirkan salah satunya saja.
 *
 * Diukur 2026-08-16: `pembayaran_masuk` dan `absensi` hidup di backend —
 * tervalidasi, tertest, terjaga — sementara `LABEL_JENIS` masih berisi lima
 * jenis lama. Kartunya tetap tampil, tapi berjudul `pembayaran_masuk`: kunci
 * mentah, di layar tempat orang memutuskan menyimpan UANG.
 *
 * Tak ada galat. Tak ada test merah. Backend-nya sempurna dan pengalamannya
 * setengah jadi — pola yang PERSIS SAMA dengan:
 *
 *   · tombol konfirmasi yang tak pernah dibuat (usul-tulis.ts)
 *   · `riwayat` yang tak pernah diisi
 *   · empat sub-menu yang tak pernah dinyalakan
 *   · asisten `owner`/`web` yang tak pernah dipanggil
 *
 * Lima kali pola yang sama dalam satu pekan. Yang kelima ini ditangkap
 * penjaga, bukan mata.
 *
 * ── Dibuktikan bisa MERAH
 *
 * Mutasi sengaja (2026-08-16): satu label dihapus → exit 1 → dipulihkan →
 * exit 0. Penjaga yang tak pernah merah adalah hiasan.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const akar = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(akar, '..', '..')

const berkasBackend = join(akar, 'src/lib/ai-tool-siapkan.ts')
const berkasUi = join(repo, 'apps/web/components/shell/rail-asisten.tsx')

let backend, ui
try {
  backend = readFileSync(berkasBackend, 'utf8')
  ui = readFileSync(berkasUi, 'utf8')
} catch (e) {
  console.error(`✗ berkas tak terbaca: ${e.message}`)
  process.exit(1)
}

/*
 * Jenis dibaca dari `ENTITAS_TULIS`, bukan dari daftar tangan di sini.
 *
 * Daftar tangan akan tertinggal persis seperti `LABEL_JENIS` tertinggal — dan
 * penjaga yang tertinggal memberi rasa aman tanpa menjaga apa pun.
 *
 * Pola `jenis: '...'` dengan indentasi 4 spasi adalah bentuk di dalam
 * `ENTITAS_TULIS`; `toolSiapkanTulis` memakai indentasi 2, jadi tak ikut
 * terhitung.
 */
const jenisBackend = [...backend.matchAll(/^ {4}jenis: '([a-z_]+)',$/gm)].map((m) => m[1])

if (jenisBackend.length === 0) {
  console.error('✗ NOL jenis terbaca dari ENTITAS_TULIS — pola pembacaannya patah.')
  console.error('  Penjaga yang membaca nol selalu hijau. Perbaiki polanya, jangan abaikan.')
  process.exit(1)
}

// Isi objek `LABEL_JENIS` saja — bukan seluruh berkas. Menyebut nama jenis di
// komentar TIDAK boleh dihitung sebagai label yang ada.
const blok = ui.match(/const LABEL_JENIS: Record<string, string> = \{([\s\S]*?)\n\}/)
if (!blok) {
  console.error('✗ `LABEL_JENIS` tak ditemukan di rail-asisten.tsx.')
  console.error('  Kartu konfirmasi tanpa peta label menampilkan kunci mentah ke pengguna.')
  process.exit(1)
}

const berlabel = new Set([...blok[1].matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]))
const hilang = jenisBackend.filter((j) => !berlabel.has(j))

if (hilang.length > 0) {
  console.error('✗ Jenis tulis tanpa label UI — ambang NOL.\n')
  for (const j of hilang) {
    console.error(`  '${j}' ada di ENTITAS_TULIS tapi TIDAK di LABEL_JENIS`)
    console.error(`    → kartu konfirmasi akan berjudul "${j}", kunci mentah.\n`)
  }
  console.error(`  Perbaiki: apps/web/components/shell/rail-asisten.tsx → LABEL_JENIS`)
  process.exit(1)
}

/*
 * ── JENIS PERSETUJUAN juga wajib berlabel (2026-08-16) ──────────────────────
 *
 * `JENIS_DIDUKUNG` di `lib/ai-setujui.ts` dan `LABEL_SETUJUI` di UI adalah
 * pasangan yang sama persis masalahnya: jenis tanpa label tampil sebagai kunci
 * mentah (`estimate_version`) di kartu KEPUTUSAN — layar tempat orang
 * menyetujui uang.
 */
const berkasSetujui = join(akar, 'src/lib/ai-setujui.ts')
let setujui
try {
  setujui = readFileSync(berkasSetujui, 'utf8')
} catch {
  console.error(`✗ ${berkasSetujui} tak terbaca.`)
  process.exit(1)
}

const blokJenis = setujui.match(/export const JENIS_DIDUKUNG = \[([\s\S]*?)\] as const/)
if (!blokJenis) {
  console.error('✗ `JENIS_DIDUKUNG` tak ditemukan di ai-setujui.ts — pola pembacaannya patah.')
  process.exit(1)
}

const jenisSetujui = [...blokJenis[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
if (jenisSetujui.length === 0) {
  console.error('✗ NOL jenis terbaca dari JENIS_DIDUKUNG — penjaga yang membaca nol selalu hijau.')
  process.exit(1)
}

const blokLabelSetujui = ui.match(/const LABEL_SETUJUI: Record<string, string> = \{([\s\S]*?)\n\}/)
if (!blokLabelSetujui) {
  console.error('✗ `LABEL_SETUJUI` tak ditemukan di rail-asisten.tsx.')
  console.error('  Kartu persetujuan tanpa peta label menampilkan kunci mentah di layar keputusan uang.')
  process.exit(1)
}

const berlabelSetujui = new Set(
  [...blokLabelSetujui[1].matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]),
)
const hilangSetujui = jenisSetujui.filter((j) => !berlabelSetujui.has(j))

if (hilangSetujui.length > 0) {
  console.error('✗ Jenis PERSETUJUAN tanpa label UI — ambang NOL.\n')
  for (const j of hilangSetujui) {
    console.error(`  '${j}' ada di JENIS_DIDUKUNG tapi TIDAK di LABEL_SETUJUI`)
    console.error(`    → kartu keputusan akan berjudul "${j}", kunci mentah.\n`)
  }
  console.error('  Perbaiki: apps/web/components/shell/rail-asisten.tsx → LABEL_SETUJUI')
  process.exit(1)
}

console.log(
  `✓ ${jenisBackend.length} jenis tulis + ${jenisSetujui.length} jenis persetujuan, ` +
    'semuanya punya label UI.',
)
