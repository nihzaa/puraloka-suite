#!/usr/bin/env node
/**
 * PENJAGA: TABEL `<table>` MENTAH TAK BOLEH MENGARANG GAYA SELNYA SENDIRI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur di peramban 2026-08-12: 61 halaman memakai `<Tabel>` bersama dan
 * merender kepala `9px 12px / 10px / 700`. Tiga tabel `<table>` mentah
 * merender tiga gaya BERBEDA — dan berbeda dari yang bersama:
 *
 *     /keuangan/invoice   sel 12px      · kepala 11px/600
 *     /mandor/absensi     sel 8px 12px  · kepala 10px/700
 *     /approval-inbox     sel 9px 12px  · kepala 12px/600
 *
 * Tak satu pun dari angka itu salah sendirian. Yang salah adalah ADANYA
 * empat jawaban untuk satu pertanyaan, dan akibatnya baru terasa saat
 * berpindah halaman — tabel yang barusan ditinggalkan terbaca sedikit lain.
 *
 * ── Kenapa tabel mentah tidak dilarang saja
 *
 * `<Tabel>` bersama mengambil `kolom` + `data` dan merendernya. Sebagian
 * tabel di sini tak berbentuk begitu: barisnya komponen tersendiri dengan
 * tombol aksi, sel bergabung, atau `<tfoot>` khusus. Memaksa semuanya lewat
 * `<Tabel>` berarti menumpuk prop sampai komponennya jadi kerangka aplikasi
 * mini — dan itu obat yang lebih buruk dari penyakitnya.
 *
 * Jadi tabel mentah tetap boleh. Yang dijaga: ANGKA gaya selnya harus datang
 * dari token, bukan dipaku.
 *
 * ── Yang diperiksa
 *
 * Di berkas yang memuat `<table`, tiap `<th`/`<td` ber-`padding` harus
 * memakai `var(--…)`, bukan literal `"8px 12px"`.
 *
 * Ini proksi, dan batasnya jelas: penjaga ini tak bisa tahu apakah tokennya
 * BENAR (`--pad-modal` di sel tabel akan lolos). Yang ditangkapnya adalah
 * kelas cacat yang benar-benar terjadi di sini — angka dipaku karena tak
 * ada yang tahu tokennya ada.
 *
 * ── RATCHET, bukan ambang NOL — dan kenapa saya berubah pikiran
 *
 * Versi pertama memakai ambang NOL, seperti penjaga judul halaman. Dijalankan:
 * 102 pelanggar. Diperiksa satu per satu, dan sebagian besar BUKAN cacat:
 *
 *     rfq-penawaran-modal   `0 6px 6px`   tabel rapat di dalam modal
 *     gantt-section         `6px 8px`     kisi jadwal, bukan tabel data
 *     estimasi              `4px 8px`     pohon RAB berjenjang
 *
 * Tabel yang sengaja rapat adalah keputusan tata letak yang sah — memaksanya
 * ke `--pad-baris` (9px 12px) akan melebarkan baris yang memang perlu padat,
 * dan itu memperburuk halaman demi menghijaukan angka.
 *
 * Ambang NOL hanya sah kalau lantainya benar-benar nol SEKARANG. Di sini
 * tidak, dan memaksanya berarti salah satu dari dua hal buruk: merusak tabel
 * yang benar, atau menumpuk daftar pengecualian sampai penjaganya tak
 * bermakna. Jadi: ratchet. Angka hari ini adalah lantai; ia boleh turun,
 * tak boleh naik.
 *
 * Pakai:       node apps/web/scripts/uji-tabel-seragam.mjs
 * Turunkan:    node apps/web/scripts/uji-tabel-seragam.mjs --turunkan
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, relative } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(__dirname, '..')
const BERKAS_LANTAI = join(WEB, 'scripts', 'uji-tabel-lantai.json')

function berkasTsx(dir, keluar = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) berkasTsx(p, keluar)
    else if (e.endsWith('.tsx') && !e.endsWith('.test.tsx')) keluar.push(p)
  }
  return keluar
}

const tanpaKomentar = (isi) =>
  isi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const pelanggar = []
for (const dir of ['app', 'components']) {
  for (const berkas of berkasTsx(join(WEB, dir))) {
    const isi = tanpaKomentar(readFileSync(berkas, 'utf8'))
    if (!isi.includes('<table')) continue

    // `padding:` di dalam gaya `<th`/`<td`. Dicari per-baris supaya nomor
    // barisnya bisa disebut — pesan tanpa lokasi memaksa orang mencari sendiri.
    const baris = isi.split(/\r?\n/)
    for (let i = 0; i < baris.length; i++) {
      const b = baris[i]
      if (!/<t[hd]\b|^\s*padding:/.test(b)) continue
      const m = b.match(/padding:\s*"([^"]+)"/)
      if (!m) continue
      if (m[1].includes('var(--')) continue

      // Konteksnya benar-benar sel tabel? Baris `padding:` telanjang bisa
      // milik `<div>` di dalam sel. Ditengok tiga baris ke atas.
      const konteks = baris.slice(Math.max(0, i - 3), i + 1).join(' ')
      if (!/<t[hd]\b/.test(konteks)) continue

      pelanggar.push(`${relative(WEB, berkas).replace(/\\/g, '/')}:${i + 1}  padding: "${m[1]}"`)
    }
  }
}

const sekarang = pelanggar.length

/**
 * Berkas lantai WAJIB ditulis pada jalan pertama.
 *
 * `isian-ratchet` pernah lahir MATI di repo ini karena polanya cuma menyetel
 * `lantai = sekarang` di dalam `catch` tanpa menyimpannya: tiap jalan
 * mengukur ulang, lantainya selalu sama dengan keadaan, dan penjaganya hijau
 * untuk pelanggaran apa pun. Ia lolos hanya karena berkas lantainya kebetulan
 * sudah ada — dan itu ketahuan HANYA lewat bukti mutasi.
 */
let lantai
try {
  lantai = JSON.parse(readFileSync(BERKAS_LANTAI, 'utf8'))
} catch {
  lantai = { nilai: sekarang, _catatan: 'diukur otomatis pada jalan pertama' }
  writeFileSync(BERKAS_LANTAI, JSON.stringify({ ...lantai, _riwayat: [] }, null, 2) + '\n')
  console.log(`(berkas lantai dibuat: ${sekarang})`)
}

if (process.argv.includes('--turunkan')) {
  if (sekarang >= lantai.nilai) {
    console.log(`lantai tetap ${lantai.nilai} — sekarang ${sekarang}, tak ada yang bisa dikencangkan`)
    process.exit(0)
  }
  const riwayat = [...(lantai._riwayat ?? []), { dari: lantai.nilai, ke: sekarang }]
  writeFileSync(
    BERKAS_LANTAI,
    JSON.stringify({ nilai: sekarang, _catatan: lantai._catatan, _riwayat: riwayat }, null, 2) + '\n',
  )
  console.log(`✅ lantai dikencangkan: ${lantai.nilai} → ${sekarang}`)
  process.exit(0)
}

if (sekarang > lantai.nilai) {
  console.error(`\n❌ sel tabel ber-padding dipaku BERTAMBAH: ${lantai.nilai} → ${sekarang}\n`)
  for (const p of pelanggar) console.error(`   ${p}`)
  console.error(
    `\nPakai \`var(--pad-baris)\` (9px 12px) — token yang sama dipakai <Tabel>` +
    `\nbersama di components/dasar.tsx, jadi menggesernya menggeser SEMUA tabel.` +
    `\n\nKalau tabelnya memang SENGAJA rapat (kisi jadwal, tabel dalam modal),` +
    `\ntambahkan token padatnya sendiri di globals.css — jangan memaku angka,` +
    `\ndan jangan menaikkan lantai di uji-tabel-lantai.json.\n`,
  )
  process.exit(1)
}

console.log(
  sekarang < lantai.nilai
    ? `✅ sel tabel ber-padding dipaku: ${sekarang} (lantai ${lantai.nilai} — jalankan --turunkan)`
    : `✅ sel tabel ber-padding dipaku: ${sekarang} (= lantai, tak bertambah)`,
)
