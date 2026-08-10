#!/usr/bin/env node
/**
 * PENJAGA ESC — overlay layar-penuh wajib punya jalan keluar papan tik.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * WCAG 2.1.2 "No Keyboard Trap", Level A — bukan penyempurnaan. Modal yang
 * hanya bisa ditutup dengan mengklik latarnya membuat pemakai papan tik
 * TERJEBAK: modal terbuka, Tab berputar di dalamnya, dan satu-satunya jalan
 * keluar adalah mengambil tetikus.
 *
 * Diukur 2026-08-11: dari berkas yang merender overlay `position: fixed;
 * inset: 0`, **32 sudah memakai `useTutupEsc`** dan **3 tidak** —
 * `pengaturan/keuangan` (dua modal), `portal/proyek/[id]` (lightbox foto, di
 * portal KLIEN), dan `milestone-section` (konfirmasi hapus).
 *
 * Tiga, bukan tiga puluh. Yang dijaga di sini justru supaya angka itu tetap
 * kecil: pola overlay disalin antar-halaman, dan yang disalin berikutnya akan
 * menyalin versi tanpa Esc kalau tak ada yang menghentikannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BUKAN MENGANDALKAN `jsx-a11y/click-events-have-key-events`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Aturan itu melaporkan 63 titik, dan **50 di antaranya modal** — termasuk
 * `components/dialog-bersama.tsx` yang justru SUDAH BENAR (memakai `<dialog>`
 * asli, Esc ditangani peramban). `jsx-a11y` menganggap `<dialog>`
 * non-interaktif; itu batas alatnya, bukan cacat kodenya.
 *
 * Lebih buruk lagi, saran harfiahnya — beri `role="button"` + `onKeyDown` pada
 * latar — adalah jawaban yang SALAH, dan `lib/use-tutup-esc.ts` sudah
 * menyatakannya: latar modal bukan tombol. Menandainya begitu membuat pembaca
 * layar mengumumkan "tombol" untuk area kosong dan menambah satu perhentian
 * Tab yang tak berarti.
 *
 * Menurunkan angka lint dengan cara itu MERUSAK a11y sambil terlihat
 * memperbaikinya. Penjaga ini menanyakan hal yang benar-benar penting:
 * **adakah jalan keluar papan tik.**
 *
 * ── Apa yang dihitung sebagai jalan keluar
 *
 *   useTutupEsc(...)     hook bersama — cara yang dianjurkan
 *   <dialog>             Esc ditangani peramban, tak perlu apa pun
 *   'Escape'             penanganan tangan (mis. di dalam palet perintah)
 *
 * ── Kenapa RATCHET, bukan larangan
 *
 * Sisa yang belum tertangani ada di berkas besar yang overlay-nya bukan modal
 * (mis. tirai gulir). Melarang hari ini menolak kode yang benar. Yang
 * ditegakkan: **angka hari ini adalah lantai.**
 *
 * Pakai:            node apps/web/scripts/esc-ratchet.mjs
 * Kencangkan lantai: node apps/web/scripts/esc-ratchet.mjs --naikkan
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const BERKAS_LANTAI = join(AKAR, 'scripts', 'esc-lantai.json')

/**
 * Komentar dibuang lebih dulu. Repo ini berkomentar padat, dan beberapa berkas
 * MENJELASKAN pola overlay di dalam komentarnya — termasuk penjaga ini sendiri.
 * Cacat yang sama sudah memakan `judul-ratchet` dan `a11y-ratchet`.
 */
function tanpaKomentar(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
}

function tsx(dir, keluar = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) tsx(p, keluar)
    else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) keluar.push(p)
  }
  return keluar
}

const pelanggar = []
for (const f of [...tsx(join(AKAR, 'app')), ...tsx(join(AKAR, 'components'))]) {
  const s = tanpaKomentar(readFileSync(f, 'utf8'))

  // Overlay layar-penuh: `position: "fixed"` berpasangan dengan `inset: 0`.
  // Spasi bervariasi antar-berkas, jadi dinormalkan lebih dulu.
  const rapat = s.replace(/\s+/g, '')
  const jumlahOverlay = (rapat.match(/position:"fixed",inset:0/g) ?? []).length
  if (jumlahOverlay === 0) continue

  const adaJalanKeluar =
    /useTutupEsc\s*\(/.test(s) || /<dialog[\s>]/.test(s) || /['"]Escape['"]/.test(s)

  if (!adaJalanKeluar) {
    pelanggar.push({
      berkas: relative(AKAR, f).split(sep).join('/'),
      jumlah: jumlahOverlay,
    })
  }
}

pelanggar.sort((a, b) => b.jumlah - a.jumlah)
const sekarang = pelanggar.length

let lantai
try {
  lantai = JSON.parse(readFileSync(BERKAS_LANTAI, 'utf8'))
} catch {
  // Berkas lantai WAJIB ditulis pada jalan pertama.
  //
  // Pola yang disalin dari `judul-ratchet` hanya menyetel `lantai = sekarang`
  // di dalam `catch` TANPA menyimpannya — akibatnya lantai selalu sama dengan
  // angka saat ini dan penjaga tak akan pernah bisa merah. Itu bukan teori:
  // bukti mutasi K-6 memergokinya pada `isian-ratchet`, dan `judul-ratchet`
  // lolos semata-mata karena berkas lantainya kebetulan sudah ada.
  lantai = { nilai: sekarang, _catatan: 'diukur otomatis pada jalan pertama' }
  writeFileSync(BERKAS_LANTAI, JSON.stringify({ ...lantai, _riwayat: [] }, null, 2) + '\n')
  console.log(`(berkas lantai dibuat: ${sekarang})`)
}

const simpan = (nilai, tanda) =>
  writeFileSync(
    BERKAS_LANTAI,
    JSON.stringify(
      {
        ...lantai,
        nilai,
        _diukur: new Date().toISOString().slice(0, 10),
        _riwayat: [...(lantai._riwayat || []), `${lantai.nilai} → ${nilai}${tanda}`],
      },
      null,
      2,
    ) + '\n',
  )

if (process.argv.includes('--naikkan')) {
  simpan(sekarang, '')
  console.log(`Lantai diperbarui: ${lantai.nilai} → ${sekarang}`)
  process.exit(0)
}

console.log('══ RATCHET Esc — jalan keluar papan tik ════════════════════════════')
console.log(`  overlay tanpa jalan keluar : ${sekarang} berkas`)
console.log(`  lantai (maks)              : ${lantai.nilai}`)

if (sekarang > lantai.nilai) {
  console.error(`\n❌ BERTAMBAH ${sekarang - lantai.nilai}.\n`)
  console.error('   Overlay layar-penuh WAJIB bisa ditutup dari papan tik:')
  console.error('     import { useTutupEsc } from "@/lib/use-tutup-esc"')
  console.error('     useTutupEsc(terbuka && !menyimpan ? () => tutup() : null)\n')
  console.error('   JANGAN memberi `role="button"` pada latarnya — itu saran')
  console.error('   harfiah `jsx-a11y` dan ia SALAH: latar modal bukan tombol.')
  console.error('   Pembaca layar akan mengumumkan "tombol" untuk area kosong,')
  console.error('   dan Tab bertambah satu perhentian yang tak berarti.\n')
  console.error('   WCAG 2.1.2 "No Keyboard Trap" Level A: tanpa Esc, pemakai')
  console.error('   papan tik TERJEBAK — Tab berputar di dalam modal dan satu-')
  console.error('   satunya jalan keluar adalah mengambil tetikus.\n')
  console.error('   Pelanggar:')
  for (const p of pelanggar.slice(0, 8)) {
    console.error(`     ${String(p.jumlah).padStart(2)} overlay × ${p.berkas}`)
  }
  process.exit(1)
}

if (sekarang < lantai.nilai) {
  simpan(sekarang, ' (otomatis)')
  console.log(`\n  ✅ TURUN ${lantai.nilai} → ${sekarang}. Lantai ikut turun — terkunci.\n`)
  process.exit(0)
}

console.log('\n  ✅ tidak bertambah.\n')
