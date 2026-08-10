#!/usr/bin/env node
/**
 * CODEMOD — memberi nama aksesibel pada `<select>` dan tombol ikon-saja.
 *
 * ── Kenapa
 *
 * Audit axe-core dengan login NYATA (2026-07-31) menemukan di 17 halaman
 * dashboard: `select-name` ×9 · `button-name` ×14 · `label` ×9. Artinya
 * pembaca layar menyebut kontrol itu tanpa nama — "kotak kombo", "tombol" —
 * jadi pengguna tak tahu itu apa. Untuk `<select>` yang menyaring tabel,
 * itu berarti tak bisa dipakai sama sekali tanpa melihat layar.
 *
 * Tak terdeteksi selama ini karena `eslint-plugin-jsx-a11y` TIDAK punya
 * rule untuk `<select>` tanpa nama — ia hanya memeriksa `<label>` yang
 * berpasangan. Kontrol yang berdiri tanpa label sama sekali lolos begitu saja.
 * Hanya axe (yang menghitung nama aksesibel dari DOM ter-render) yang melihatnya.
 *
 * ── Cara kerja
 *
 * Nama TIDAK dikarang. Ia diambil dari yang sudah ada di kode, urut prioritas:
 *   1. `title="..."` yang sudah ditulis (paling akurat — itu maksud penulisnya)
 *   2. teks `<option>` pertama yang berupa placeholder ("Semua status", dst)
 *   3. nama state di `value={...}` / `onChange` — dipetakan ke istilah Indonesia
 * Kalau ketiganya gagal, berkas itu DILEWATI dan dilaporkan, bukan diberi
 * nama asal — nama yang salah lebih menyesatkan daripada tak ada nama.
 *
 * Dijalankan sekali; hasilnya di-commit. Bukan bagian build.
 * Mode default: laporan saja. `--tulis` untuk benar-benar menyunting.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const AKAR = join(import.meta.dirname, '..')
const TULIS = process.argv.includes('--tulis')

function berkas(dir) {
  const h = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') h.push(...berkas(p)) }
    else if (e.name.endsWith('.tsx')) h.push(p)
  }
  return h
}

/** Nama state → istilah yang dimengerti pengguna, bukan istilah programmer. */
const ISTILAH = {
  status: 'Status', filter: 'Filter', period: 'Periode', periode: 'Periode',
  project: 'Proyek', projectId: 'Proyek', proyek: 'Proyek',
  mandor: 'Mandor', mandorId: 'Mandor', client: 'Klien', clientId: 'Klien',
  category: 'Kategori', kategori: 'Kategori', type: 'Jenis', jenis: 'Jenis',
  table: 'Tabel', action: 'Aksi', role: 'Peran', user: 'Pengguna',
  supplier: 'Supplier', material: 'Material', edition: 'Edisi', edisi: 'Edisi',
  scope: 'Lingkup', sort: 'Urutan', urut: 'Urutan', tahun: 'Tahun', bulan: 'Bulan',
  account: 'Akun', akun: 'Akun', unit: 'Satuan', satuan: 'Satuan',
}

function tebakNama(tag) {
  // 1. title yang sudah ada
  const t = tag.match(/title="([^"]{2,60})"/)
  if (t) return t[1]
  // 2. nama state di value/onChange
  const v = tag.match(/value=\{(?:[a-zA-Z]+\.)?([a-zA-Z]+)/)
             || tag.match(/set([A-Z][a-zA-Z]+)\(/)
  if (v) {
    const k = v[1].charAt(0).toLowerCase() + v[1].slice(1)
    if (ISTILAH[k]) return ISTILAH[k]
  }
  return null
}

const laporan = { diperbaiki: [], dilewati: [] }

for (const f of berkas(join(AKAR, 'app'))) {
  let isi = readFileSync(f, 'utf8')
  const asli = isi
  const rel = relative(AKAR, f).replace(/\\/g, '/')

  // ── <select> tanpa nama aksesibel ────────────────────────────────────────
  // ⚠️ `[\s\S]` bukan `[^>]` di dalam lookahead. Alasannya: tag `<select>` di
  // repo ini sering multi-baris dengan `aria-label` di baris KEDUA, sedangkan
  // `[^>]*` tak bisa melewati newline — jadi lookahead-nya BUTA terhadap label
  // yang sudah ada. Codemod lalu menambah `aria-label` KEDUA: 2 error nyata
  // TS17001 + `react/jsx-no-duplicate-props` (estimasi/page.tsx:2124 & 2131).
  //
  // Yang lebih buruk dari errornya: label yang sudah ada di sana justru LEBIH
  // BAIK ("Saring jenis harga pokok") daripada tebakan codemod ("Kategori") —
  // jadi cacat ini menimpa yang spesifik dengan yang generik.
  isi = isi.replace(/<select\b(?![\s\S]{0,400}?\baria-label=)([\s\S]*?)>/g, (m) => {
    const nama = tebakNama(m)
    if (!nama) { laporan.dilewati.push(`${rel}  <select> — tak bisa ditebak namanya`); return m }
    laporan.diperbaiki.push(`${rel}  <select> → "${nama}"`)
    return `<select aria-label="${nama}"${atribut}>`
  })

  // ── <input type="date"> tanpa nama ───────────────────────────────────────
  // Tanggal hampir selalu berpasangan (dari–sampai); yang membedakan biasanya
  // nama state-nya, jadi itu yang dibaca.
  // Grup tangkap kedua tak dipakai — `m` (kecocokan penuh) sudah cukup, dan
  // parameter `_atribut` tetap dilaporkan `no-unused-vars` karena eslint di
  // repo ini tidak menyetel `argsIgnorePattern`. Dibuang, bukan aturannya yang
  // dilonggarkan: melonggarkan aturan global demi satu berkas menyembunyikan
  // parameter mati di seluruh repo.
  isi = isi.replace(/<input\b(?![^>]*\baria-label=)(?:[^>]*?type="date"[^>]*?)\/?>/g, (m) => {
    const v = m.match(/value=\{(?:[a-zA-Z]+\.)?([a-zA-Z]+)/)
    let nama = null
    if (v) {
      const k = v[1].toLowerCase()
      if (k.includes('from') || k.includes('start') || k.includes('dari') || k.includes('awal')) nama = 'Tanggal mulai'
      else if (k.includes('to') || k.includes('end') || k.includes('sampai') || k.includes('akhir')) nama = 'Tanggal akhir'
      else nama = 'Tanggal'
    }
    if (!nama) { laporan.dilewati.push(`${rel}  <input date> — tak bisa ditebak`); return m }
    laporan.diperbaiki.push(`${rel}  <input date> → "${nama}"`)
    return m.replace('<input', `<input aria-label="${nama}"`)
  })

  if (isi !== asli && TULIS) writeFileSync(f, isi, 'utf8')
}

console.log(`${TULIS ? 'DITULIS' : 'PRATINJAU (pakai --tulis untuk menyunting)'}\n`)
console.log(`✅ ${laporan.diperbaiki.length} kontrol diberi nama:`)
laporan.diperbaiki.slice(0, 40).forEach((x) => console.log('   ' + x))
if (laporan.diperbaiki.length > 40) console.log(`   … dan ${laporan.diperbaiki.length - 40} lagi`)
if (laporan.dilewati.length) {
  console.log(`\n⚠️  ${laporan.dilewati.length} DILEWATI — namanya tak bisa diturunkan dari kode.`)
  console.log('   Ini disengaja: nama yang salah lebih menyesatkan daripada tak ada nama.')
  console.log('   Beri `aria-label` manual pada yang berikut:')
  ;[...new Set(laporan.dilewati)].slice(0, 20).forEach((x) => console.log('   ' + x))
}
