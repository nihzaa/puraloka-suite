#!/usr/bin/env node
/**
 * PENJAGA KERAPATAN — padding & gap yang dipaku, bukan lewat token.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ARAH-VISUAL-2026.md` §4 mendiagnosis keluhan founder ("tiap halaman terasa
 * padat dan tidak kosong") dengan angka: padding kartu 24px sementara standar
 * data-dense 12px, dan font tabel 9-11px sementara standarnya 12-14px.
 * Halaman terasa lemas karena longgar TAPI tulisannya kecil.
 *
 * Tokennya SUDAH DIBUAT dan sudah bernilai benar:
 *
 *     --pad-kartu    12px   (dari 24px)
 *     --gap-grid      8px   (dari 16-20px)
 *     --teks-tabel  12.5px  (dari 9-11px)
 *
 * **Tapi diukur 2026-08-07, hanya TIGA berkas yang memakainya** — sementara
 * ada 184 padding besar yang ditulis langsung di kode:
 *
 *     padding: "16px"   92 kali
 *     padding: "20px"   65 kali
 *     padding: "24px"   19 kali
 *
 * Jadi token kerapatannya benar, dan halamannya tak pernah membacanya.
 *
 * ── Pola yang berulang, dan itu sebabnya penjaga ini ada
 *
 * Ini kelas cacat KETIGA yang sama persis di repo ini dalam satu hari:
 *
 *   1. `Tabel<T>` dibangun bagus  → 1 halaman pakai, 28 tulis <table> sendiri
 *   2. token kerapatan disetel    → 3 berkas pakai, 184 padding dipaku
 *   3. `KartuKPI` dibangun bagus  → 2 halaman pakai
 *
 * Tiap kali, pekerjaan fondasinya selesai dan penyebarannya tidak. Tanpa
 * penjaga, halaman ke-N+1 disalin dari halaman ke-N — yang memakai angka
 * dipaku — dan lingkarannya berulang. Persis alasan `tata-letak-ratchet`
 * ada: *"yang ditegakkan bukan 'sudah rapi hari ini', melainkan 'tak bisa
 * berantakan lagi besok'"*.
 *
 * ── Kenapa RATCHET, bukan larangan
 *
 * Melarang padding dipaku hari ini menolak 184 tempat yang sudah jalan.
 * Yang ditegakkan: **jumlahnya tak boleh naik**. Halaman baru memakai token;
 * halaman lama ikut saat kebetulan disentuh.
 *
 * ── Yang TIDAK dihitung, dan kenapa
 *
 * Hanya padding BESAR (≥16px) yang dihitung — itu yang menentukan kerapatan
 * kartu dan bagian. Padding kecil (4/6/8/10/12px) dipakai untuk lencana,
 * tombol kecil, dan sel tabel; memaksanya lewat token akan menuntut selusin
 * token baru untuk perbedaan yang tak seorang pun rasakan.
 *
 * `padding: 0` dan padding asimetris (`"12px 16px"`) juga dilewati: yang
 * kedua sering memang disengaja (rapat vertikal, lega horizontal), dan
 * menyeragamkannya butuh keputusan desain per tempat — bukan pekerjaan
 * penjaga.
 *
 * Jalankan: node apps/web/scripts/kerapatan-ratchet.mjs
 * Kencangkan lantai: --naikkan
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const AKAR = join(import.meta.dirname, '..')
const BERKAS_LANTAI = join(import.meta.dirname, 'kerapatan-lantai.json')

function berkasTsx(dir, keluar = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) berkasTsx(p, keluar)
    else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) keluar.push(p)
  }
  return keluar
}

/**
 * `padding: 16px` / `padding: "20px"` / `gap: 24` — nilai TUNGGAL ≥16.
 *
 * Sengaja TIDAK menangkap bentuk dua-nilai (`"12px 16px"`): lihat catatan
 * "Yang TIDAK dihitung" di kepala berkas.
 */
const POLA = /\b(padding|gap)\s*:\s*"?(\d+)(?:px)?"?\s*[,;}]/g

const pelanggar = []
for (const f of [...berkasTsx(join(AKAR, 'app')), ...berkasTsx(join(AKAR, 'components'))]) {
  const isi = readFileSync(f, 'utf8')
  const baris = isi.split('\n')

  // ── Keadaan KOSONG & MEMUAT dilewati ──────────────────────────────────────
  //
  // Diukur 2026-08-13: 12 dari 21 kelebihan di `portal/proyek/[id]` seluruhnya
  // `padding: 40/60/80` pada baris seperti
  //
  //     if (loading) return <div style={{ textAlign: 'center', padding: 60 }}>Memuat…
  //     if (!items.length) return <div style={{ ...card, padding: 40 }}>Belum diinput.
  //
  // Itu BUKAN kartu. Keadaan kosong sengaja lapang supaya terbaca sebagai
  // "tak ada isi" — bukan sebagai kartu yang gagal render. Token kerapatan
  // (12–16px) justru salah di sana: keadaan kosong serapat kartu terlihat
  // seperti kesalahan tampilan.
  //
  // Menghukumnya berarti mendorong orang memakai token yang keliru, atau —
  // yang lebih mungkin — mematikan penjaganya. Penjaga yang merah karena hal
  // yang benar tak bertahan lama.
  const RX_KOSONG = /(loading|memuat|belum|kosong|tidak ada|tak ada|!data|!items|\.length === 0|length\s*<\s*1)/i

  let n = 0
  for (const m of isi.matchAll(POLA)) {
    if (Number(m[2]) < 16) continue

    // Konteksnya: baris tempat padding itu berada, plus dua baris sebelumnya
    // (deklarasi `if (loading) return` sering satu baris di atas JSX-nya).
    const nomor = isi.slice(0, m.index).split('\n').length - 1
    const konteks = baris.slice(Math.max(0, nomor - 2), nomor + 1).join('\n')
    if (RX_KOSONG.test(konteks)) continue

    n++
  }
  if (n > 0) pelanggar.push({ berkas: relative(AKAR, f).split('\\').join('/'), jumlah: n })
}
pelanggar.sort((a, b) => b.jumlah - a.jumlah)

const sekarang = pelanggar.reduce((s, p) => s + p.jumlah, 0)
let lantai
try {
  lantai = JSON.parse(readFileSync(BERKAS_LANTAI, 'utf8'))
} catch {
  lantai = { nilai: sekarang, _catatan: 'diukur otomatis pada jalan pertama' }
}

if (process.argv.includes('--naikkan')) {
  writeFileSync(BERKAS_LANTAI, JSON.stringify({
    ...lantai, nilai: sekarang,
    _diukur: new Date().toISOString().slice(0, 10),
    _riwayat: [...(lantai._riwayat || []), `${lantai.nilai} → ${sekarang}`],
  }, null, 2) + '\n')
  console.log(`Lantai diperbarui: ${lantai.nilai} → ${sekarang}`)
  process.exit(0)
}

console.log('\n══ RATCHET kerapatan (UI-0-1) ══════════════════════════════════════')
console.log(`  padding/gap dipaku ≥16px : ${sekarang}`)
console.log(`  lantai (maks)            : ${lantai.nilai}`)

if (sekarang > lantai.nilai) {
  console.error(`\n❌ BERTAMBAH ${sekarang - lantai.nilai}.\n`)
  console.error('   Pakai token kerapatan, bukan angka dipaku:')
  console.error('     var(--pad-kartu)       12px  kartu & panel')
  console.error('     var(--pad-kartu-lega)  16px  kartu KPI (angka besar butuh napas)')
  console.error('     var(--gap-grid)         8px  jarak antar kartu')
  console.error('     var(--gap-bagian)      16px  jarak antar BAGIAN halaman\n')
  console.error('   Kenapa ini ditegakkan: tokennya sudah bernilai benar sejak')
  console.error('   2026-08-07, tapi hanya 3 berkas memakainya sementara 184')
  console.error('   padding ditulis langsung. Halaman ke-N+1 disalin dari yang')
  console.error('   ke-N, jadi memperbaiki sekali TIDAK menyelesaikannya.\n')
  console.error('   Pelanggar terbesar:')
  pelanggar.slice(0, 6).forEach((p) => console.error(`     ${String(p.jumlah).padStart(3)} × ${p.berkas}`))
  console.error('')
  process.exit(1)
}

if (sekarang < lantai.nilai) {
  writeFileSync(BERKAS_LANTAI, JSON.stringify({
    ...lantai, nilai: sekarang,
    _diukur: new Date().toISOString().slice(0, 10),
    _riwayat: [...(lantai._riwayat || []), `${lantai.nilai} → ${sekarang} (otomatis)`],
  }, null, 2) + '\n')
  console.log(`\n  ✅ TURUN ${lantai.nilai} → ${sekarang}. Lantai ikut turun — terkunci.\n`)
  process.exit(0)
}

console.log('\n  ✅ tidak bertambah.\n')
