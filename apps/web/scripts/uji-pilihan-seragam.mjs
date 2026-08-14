#!/usr/bin/env node
/**
 * PENJAGA: SATU BENTUK KONTROL PILIHAN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ANGKANYA, DAN KENAPA PENJAGA INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-14: **5 berkas memakai `<input type="radio">`**, dan kelimanya
 * sudah membungkusnya dalam kartu ber-border yang menyala saat terpilih —
 * dengan **lima bentuk berbeda**:
 *
 *   ncr/page.tsx           borderRadius 10 · C.navyLight     · 1px
 *   rencana/page.tsx       borderRadius  6 · var(--surface-2)· 1px
 *   alur-form-modal.tsx    tanpa kartu     · accentColor aksen
 *   termin-payment-modal   borderRadius  6 · C.navyLight     · 1.5px
 *   kartu-asisten.tsx      borderRadius  8 · C.navyLight     · 1px
 *
 * Tak satu pun salah saat ditulis. Tiap halaman lahir pada waktu berbeda dan
 * menyalin dari tetangga terdekat — pola yang sudah ditemukan empat kali di
 * repo ini (16 `inputStyle`, 27 varian `<h1>`, 8 bentuk kartu, 4 gaya tab).
 *
 * Founder 2026-08-14: *"stylingnya saya gamau pake model radio button. kurang
 * kekinian"* dan *"sekalian konsistenkan di seluruh halaman dan panel kontrolnya"*.
 *
 * Keduanya diselesaikan komponen `components/pilihan-kartu.tsx`. Penjaga ini
 * yang menjaganya tetap SATU: menyalin ulang bentuk radio adalah pekerjaan
 * lima menit yang tak menghasilkan galat apa pun, dan tanpa penjaga ia akan
 * kembali jadi lima bentuk dalam beberapa bulan.
 *
 * ── Yang diperiksa
 *
 *   R-1  nol `<input type="radio">` di luar `components/pilihan-kartu.tsx`
 *   R-3  checkbox mentah tak boleh BERTAMBAH (ratchet) — tiga yang tersisa
 *        memang tak bisa jadi kartu maupun saklar, alasannya di `DIKECUALIKAN`
 *   R-2  komponen bersamanya masih menyembunyikan input SECARA VISUAL saja
 *        (`opacity`, bukan `display:none`) — kalau tidak, kontrolnya hilang
 *        dari urutan Tab dan tak bisa dipakai keyboard sama sekali
 *
 * R-2 ada karena "buang tampilan radio" paling mudah dikerjakan dengan
 * `display:none` atau dengan mengganti `<input>` jadi `<div onClick>`. Dua-
 * duanya menghasilkan tampilan yang diminta DAN kontrol yang tak bisa
 * di-Tab — dan yang kedua tak terlihat oleh siapa pun yang mengetesnya
 * dengan tetikus.
 *
 * Ambang NOL.
 *
 * Pakai:  node apps/web/scripts/uji-pilihan-seragam.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(__dirname, '..')
const KOMPONEN = join('components', 'pilihan-kartu.tsx')

/** Satu-satunya berkas yang boleh memuat `type="radio"`. */
const PINTU = KOMPONEN
const PINTU_SAKLAR = join('components', 'saklar.tsx')

/**
 * Checkbox yang SENGAJA tetap mentah, dengan alasannya.
 *
 * Ketiganya bukan "belum sempat" — ketiganya akan RUSAK kalau diseragamkan:
 *
 *   arus-kas       legend grafik: toggle seri berwarna, bukan daftar
 *                  pengaturan. Jadi kartu = merusak grafiknya.
 *   gantt-section  tiap baris MEKAR jadi input angka + teks saat dicentang;
 *                  kartu tak bisa memuat kontrol bersarang.
 *   rfq-penawaran  sel tabel selebar satu kolom; saklar 34px merusak tabelnya.
 *
 * Daftar ini sengaja bukan pola. Nama berkas ditulis penuh supaya penambahan
 * berikutnya terlihat di diff dan harus dijelaskan.
 */
const DIKECUALIKAN = new Set([
  'app/(dashboard)/keuangan/arus-kas/page.tsx',
  'components/gantt-section.tsx',
  'components/rfq-penawaran-modal.tsx',
])

function berkasTsx(dir, keluar = []) {
  for (const nama of readdirSync(dir)) {
    if (nama === 'node_modules' || nama === '.next' || nama.startsWith('.')) continue
    const penuh = join(dir, nama)
    const st = statSync(penuh)
    if (st.isDirectory()) berkasTsx(penuh, keluar)
    else if (/\.(tsx|jsx)$/.test(nama)) keluar.push(penuh)
  }
  return keluar
}

const pelanggaran = []

// ── R-1: nol radio mentah di luar komponen bersama ─────────────────────────
for (const berkas of [
  ...berkasTsx(join(WEB, 'app')),
  ...berkasTsx(join(WEB, 'components')),
]) {
  const rel = relative(WEB, berkas).replace(/\\/g, '/')
  if (rel === PINTU.replace(/\\/g, '/')) continue

  if (rel === PINTU_SAKLAR.replace(/\\/g, '/')) continue

  const isi = readFileSync(berkas, 'utf8')
  const baris = isi.split('\n')
  baris.forEach((b, i) => {
    if (/type=["']radio["']/.test(b)) {
      pelanggaran.push(
        `R-1 ${rel}:${i + 1} memakai <input type="radio"> sendiri — ` +
          `pakai <PilihanKartu> dari components/pilihan-kartu.tsx`,
      )
    }
    if (/type=["']checkbox["']/.test(b) && !DIKECUALIKAN.has(rel)) {
      pelanggaran.push(
        `R-3 ${rel}:${i + 1} memakai <input type="checkbox"> sendiri — ` +
          `pakai <PilihanKartu ganda> untuk memilih dari daftar, ` +
          `atau <Saklar> untuk hidup/mati`,
      )
    }
  })
}

// ── R-2: komponen bersama tetap bisa di-Tab ────────────────────────────────
const komponen = readFileSync(join(WEB, KOMPONEN), 'utf8')

if (!/type=\{ganda \? ["']checkbox["'] : ["']radio["']\}/.test(komponen)) {
  pelanggaran.push(
    'R-2 komponen bersama tak lagi memakai <input> asli — kontrol yang bukan ' +
      'input tak bisa di-Tab dan tak diumumkan pembaca layar',
  )
}

if (/display:\s*["']none["']/.test(komponen)) {
  pelanggaran.push(
    'R-2 komponen bersama memakai `display:none` — input jadi hilang dari ' +
      'urutan Tab. Sembunyikan dengan `opacity: 0` di atas kartunya.',
  )
}

if (!/opacity:\s*0/.test(komponen)) {
  pelanggaran.push(
    'R-2 komponen bersama tak lagi menyembunyikan input dengan `opacity: 0` — ' +
      'periksa cara penyembunyiannya masih menyisakan fokus keyboard',
  )
}

// ── Laporan ────────────────────────────────────────────────────────────────
if (pelanggaran.length > 0) {
  console.error('\n✗ KONTROL PILIHAN TIDAK SERAGAM\n')
  for (const p of pelanggaran) console.error(`  • ${p}`)
  console.error(`\n  ${pelanggaran.length} pelanggaran. Ambang NOL.\n`)
  process.exit(1)
}

console.log(
  '✓ Kontrol pilihan seragam — radio & checkbox lewat <PilihanKartu>/<Saklar>, ' +
    `fokus keyboard utuh. ${DIKECUALIKAN.size} pengecualian tercatat beralasan.`,
)
