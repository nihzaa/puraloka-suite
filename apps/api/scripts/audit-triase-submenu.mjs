#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// TRIASE SUB-MENU (F5-1) — penjaga bahwa dokumennya HIDUP, bukan foto lama.
//
// ── Kenapa penjaga ini ada
//
// F5-1 menjawab risiko C-7: *"yang paling mungkin membunuh proyek"* — bukan
// salah memilih fitur, melainkan mengerjakannya dalam urutan yang salah sampai
// kehabisan tenaga sebelum produknya bisa dijual.
//
// Dokumen triase menjawab itu HANYA selama ia cocok dengan kenyataan. Begitu
// taksonomi berubah — sub-menu selesai, sub-menu baru muncul — triase yang tak
// ikut berubah berhenti jadi peta dan berubah jadi kenangan. Repo ini sudah
// membuktikan pola itu berkali-kali (CLAUDE.md: "angka di dokumen konteks
// membusuk, dan agent yang membacanya berhalusinasi dengan percaya diri").
//
// ── Apa yang diperiksa
//
// Tiap sub-menu berstatus 🔴 di taksonomi WAJIB muncul TEPAT SATU KALI di
// salah satu golongan `F5-1-TRIASE-SUBMENU.md`:
//
//   §2a JANGAN DIBANGUN · §3 INTI · §4 PEMBEDA · §5 TUNDA
//
//   HILANG → sub-menu baru muncul di taksonomi tanpa diputuskan urutannya.
//   GANDA  → satu item ada di dua golongan; urutannya jadi ambigu.
//
// ── ⚠️ Kolom Status, BUKAN `baris.includes('🔴')`
//
// Versi pertama dokumen triase memakai `includes()` dan mendapat 64, bukan 54:
// sembilan baris 🟡 memuat 🔴 di kolom *Catatan* sebagai keterangan "sebagian
// sudah hidup" (mis. `Laporan keuangan` — arus kas ✅, neraca & L/R 🔴).
// Selisih 19% — cukup untuk salah memprioritaskan. Taksonomi sendiri sudah
// memperingatkan ini; peringatannya tetap terlewat. Karena itu penjaga ini
// memeriksa sel Status, dan komentar ini ada supaya kesalahannya tak terulang.
//
// ── Cara memakai
//
//   node apps/api/scripts/audit-triase-submenu.mjs
//
// Kalau merah: masukkan sub-menunya ke salah satu golongan di dokumen triase
// (dengan alasan), bukan hapus penjaganya.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const TAKSONOMI = join(AKAR, 'docs', 'ERP-KONTRAKTOR-TAKSONOMI-MENU.md')
const TRIASE = join(AKAR, 'docs', 'execution', 'F5-1-TRIASE-SUBMENU.md')

const baca = (p) => readFileSync(p, 'utf8').replace(/\r/g, '')

/** Sub-menu 🔴 dari KOLOM STATUS — lihat peringatan di header. */
function submenuMerah(teks) {
  // Bagian "KEPUTUSAN ATAS…" ke bawah adalah ringkasan keputusan, bukan tabel
  // status. Memindainya akan menghitung item yang sama dua kali.
  const atas = teks.split('## KEPUTUSAN ATAS')[0]
  const hasil = []
  for (const baris of atas.split('\n')) {
    if (!baris.startsWith('|')) continue
    const sel = baris.split('|').map((s) => s.trim())
    if (sel[2] === '🔴') hasil.push(sel[1].replace(/\*\*/g, ''))
  }
  return hasil
}

function potong(teks, dari, sampai) {
  const a = teks.split(dari)
  if (a.length < 2) return null
  return a[1].split(sampai)[0]
}

const taksonomi = baca(TAKSONOMI)
const triase = baca(TRIASE)

const GOLONGAN = {
  'JANGAN DIBANGUN (§2a)': potong(triase, '### 2a.', '###'),
  'INTI (§3)': potong(triase, '## 3. INTI', '## 4.'),
  'PEMBEDA (§4)': potong(triase, '## 4. PEMBEDA', '## 5.'),
  'TUNDA (§5)': potong(triase, '## 5. TUNDA', '## 6.'),
}

const rusak = Object.entries(GOLONGAN).filter(([, v]) => v === null)
if (rusak.length) {
  console.error('❌ Bagian dokumen triase tak ditemukan — judulnya berubah?\n')
  for (const [n] of rusak) console.error(`   · ${n}`)
  console.error('\n   Penjaga ini memotong dokumen berdasarkan judul bagian.')
  console.error('   Kalau judulnya sengaja diubah, sesuaikan GOLONGAN di skrip ini.')
  process.exit(1)
}

const merah = submenuMerah(taksonomi)
const hilang = []
const ganda = []
const sebaran = {}

for (const nama of merah) {
  const ada = Object.entries(GOLONGAN).filter(([, isi]) => isi.includes(nama))
  if (ada.length === 0) hilang.push(nama)
  else if (ada.length > 1) ganda.push({ nama, di: ada.map(([n]) => n) })
  else sebaran[ada[0][0]] = (sebaran[ada[0][0]] || 0) + 1
}

console.log(`Sub-menu 🔴 di taksonomi (kolom Status) : ${merah.length}`)
for (const [n, j] of Object.entries(sebaran)) {
  console.log(`  ↳ ${n.padEnd(22)} : ${j}`)
}

if (hilang.length) {
  console.error(`\n❌ ${hilang.length} sub-menu 🔴 BELUM ditriase:\n`)
  for (const n of hilang) console.error(`   · ${n}`)
  console.error('\n   Tiap sub-menu yang belum dikerjakan harus punya keputusan')
  console.error('   urutannya: INTI (tak bisa dijual tanpanya) / PEMBEDA (alasan')
  console.error('   memilih kita) / TUNDA (berguna, tapi tak ada yang menunggu)')
  console.error('   / JANGAN DIBANGUN. Tambahkan ke docs/execution/F5-1-TRIASE-SUBMENU.md.')
}

if (ganda.length) {
  console.error(`\n❌ ${ganda.length} sub-menu ada di LEBIH DARI SATU golongan:\n`)
  for (const g of ganda) console.error(`   · ${g.nama} → ${g.di.join(' + ')}`)
  console.error('\n   Urutannya jadi ambigu. Pilih satu golongan.')
}

if (hilang.length || ganda.length) process.exit(1)

console.log('\n✅ Triase F5-1 selaras taksonomi: nol hilang, nol ganda.')
