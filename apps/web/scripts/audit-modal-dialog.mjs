#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// PENJAGA: modal dibangun dengan `<dialog>`, bukan `<div position:fixed>`.
// ════════════════════════════════════════════════════════════════════════════
//
// ── Cacat yang melahirkannya
//
// Diukur 2026-08-08: ENAM modal di `components/` dibangun sebagai
// `<div style={{ position: 'fixed', inset: 0 }}>`. Nol `role="dialog"`, nol
// penanganan Esc, nol fokus terkunci:
//
//     contract-generator-modal · milestone-modal · progress-log-modal
//     project-modal · rab-schedule-modal · termin-payment-modal
//
// Akibatnya, di SETIAP modal dashboard:
//
//   • Tab dari dalam modal berpindah ke elemen halaman DI BELAKANGNYA — yang
//     tak terlihat dan tak bisa ditunjuk. Pengguna keyboard kehilangan tempat.
//   • Esc tak menutup. Satu-satunya jalan keluar adalah menemukan tombol X
//     dengan mouse — jalur yang tak tersedia bagi pemakai keyboard penuh.
//   • Pembaca layar tak diberi tahu ini dialog: ia membacanya sebagai bagian
//     biasa halaman, tanpa batas dan tanpa pengumuman.
//
// ── Kenapa ini tak pernah berbunyi di CI
//
// `audit-a11y-runtime.mjs` memindai HALAMAN. Modal baru ada di DOM SESUDAH
// dibuka, dan penjaga itu tak pernah mengkliknya. Enam modal lolos bukan
// karena bersih, melainkan karena tak pernah dilihat.
//
// Itulah bentuk kegagalan yang paling mahal: penjaga hijau yang membuat orang
// yakin sesuatu sudah diperiksa.
//
// ── Kenapa RATCHET, bukan larangan mutlak
//
// Enam modal itu berjumlah 2.500+ baris. Memindahkan semuanya sekaligus
// adalah perubahan yang tak bisa ditinjau dengan sungguh-sungguh, dan modal
// pembangkit kontrak (664 baris) punya alur berlangkah yang perlu diuji
// tersendiri. Yang dijaga: **jumlahnya tak boleh naik.** Yang baru memakai
// `DialogBersama`; yang lama pindah saat berkasnya disentuh.
//
// Jalankan: node apps/web/scripts/audit-modal-dialog.mjs
//           node apps/web/scripts/audit-modal-dialog.mjs --naikkan
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const LANTAI = join(AKAR, 'scripts/modal-lantai.json')

/** Berkas .tsx di seluruh app/ dan components/. */
function berkas(dir) {
  if (!existsSync(dir)) return []
  const hasil = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) hasil.push(...berkas(p))
    else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) hasil.push(p)
  }
  return hasil
}

/**
 * Overlay layar penuh yang BUKAN `<dialog>`.
 *
 * Tandanya `position: fixed` + `inset: 0` dalam satu aturan — bentuk yang
 * hanya dipakai untuk menutupi seluruh layar. Panel melayang biasa memakai
 * `absolute`, dan bilah lengket memakai `sticky`; keduanya tak tertangkap.
 */
function overlayTanpaDialog(isi) {
  if (/<dialog/.test(isi)) return false
  // `position: "fixed"` dan `inset: 0` boleh terpisah beberapa properti,
  // tapi harus dalam satu objek style — dibatasi 160 karakter.
  return /position:\s*["']fixed["'][^}]{0,160}inset:\s*0/.test(isi)
    || /inset:\s*0[^}]{0,160}position:\s*["']fixed["']/.test(isi)
}

const temuan = []
for (const f of [...berkas(join(AKAR, 'app')), ...berkas(join(AKAR, 'components'))]) {
  const isi = readFileSync(f, 'utf8')
  if (overlayTanpaDialog(isi)) {
    // Pemisah dinormalkan LEBIH DULU. `AKAR` di Windows memakai backslash,
    // jadi memotongnya dari path bergaya URL tak pernah cocok dan seluruh
    // path absolut ikut tercetak.
    const rel = f.split(/[\\/]/).join('/')
    const akar = AKAR.split(/[\\/]/).join('/').replace(/\/+$/, '')
    temuan.push('apps/web' + rel.replace(akar, ''))
  }
}

console.log('\n══ Modal: <dialog> vs div overlay ═════════════════════════════')
console.log(`  overlay tanpa <dialog> : ${temuan.length}`)

const naikkan = process.argv.includes('--naikkan')
const lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))

if (naikkan) {
  writeFileSync(LANTAI, JSON.stringify({ ...lantai, overlay: temuan.length }, null, 2) + '\n')
  console.log(`\nLantai diperbarui: overlay=${temuan.length}\n`)
  process.exit(0)
}

if (temuan.length > lantai.overlay) {
  console.error(`\n❌ MERAH — overlay non-dialog BERTAMBAH: ${temuan.length} > ambang ${lantai.overlay}\n`)
  for (const t of temuan) console.error(`     ${t}`)
  console.error('')
  console.error('   Pakai `DialogBersama` dari `@/components/dialog-bersama`.')
  console.error('   `<dialog>` bawaan memberi tiga hal yang paling sering salah')
  console.error('   kalau ditulis tangan, dan salahnya TAK TERLIHAT sampai')
  console.error('   seseorang memakai keyboard:')
  console.error('     • fokus terkunci di dalam dialog')
  console.error('     • lapisan teratas, tanpa perang z-index')
  console.error('     • Esc menutup')
  console.error('')
  process.exit(1)
}

console.log(`\n✅ Tidak bertambah (ambang ${lantai.overlay}).`)
if (temuan.length) {
  console.log('   Sisa yang belum pindah — turunkan saat berkasnya disentuh:')
  for (const t of temuan) console.log(`     ${t}`)
}
console.log('')
process.exit(0)
