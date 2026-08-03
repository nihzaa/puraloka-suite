#!/usr/bin/env node
// ============================================================================
// PENJAGA: docs-freshness — dokumen konteks tak boleh memuat fakta yang membusuk.
// ============================================================================
//
// ── Kenapa penjaga ini ada
//
// `CLAUDE.md` dibaca agent AI di awal SETIAP sesi. Versi sebelumnya menyatakan
// "migration 001-058" dan "Database — 27+ Tabel" sementara kenyataannya jauh
// berbeda; bahkan tambalan koreksinya ("migration nyata s.d. 116; dev 90 tabel")
// ikut basi. Audit 2026-08-02 menyebut ini racun konteks paling produktif di repo.
//
// Memperbaiki angkanya sekali tidak menyelesaikan apa pun — ia akan basi lagi
// dalam hitungan minggu, dan tidak ada yang tahu kapan. Yang menyelesaikan adalah
// membuat repo MENOLAK angka semacam itu masuk kembali.
//
// ── Yang diperiksa
//
//   1. Dokumen konteks tidak boleh mengklaim jumlah migrasi/tabel/endpoint/policy.
//      Bukan karena angkanya salah hari ini, tapi karena angka apa pun di sana
//      akan salah suatu hari tanpa gejala.
//   2. Bila sebuah dokumen TETAP menyebut angka semacam itu, angkanya harus cocok
//      dengan kenyataan — diperiksa terhadap jumlah berkas migrasi yang nyata.
//
// Penjaga ini sengaja HANYA menjaga dokumen konteks (yang dibaca agent), bukan
// seluruh `.md`. Dokumen audit dan jurnal JUSTRU harus memuat angka — itu memang
// rekaman satu titik waktu, dan sudah bertanggal.
//
// Keluar 0 = bersih. Keluar 1 = ada klaim angka yang membusuk.
// ============================================================================

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

// Dokumen yang dibaca agent tiap sesi → wajib bebas angka yang membusuk.
const DOKUMEN_KONTEKS = ['CLAUDE.md']

// Pola klaim jumlah. Sengaja spesifik: yang dilarang adalah ANGKA + SATUAN,
// bukan penyebutan katanya. "jumlah tabel diukur lewat introspect" tetap boleh.
const POLA_TERLARANG = [
  { nama: 'jumlah migrasi', re: /\b(\d{2,4})\s*(?:total\s*)?migrasi\b|\bmigrations?\s*\(?\s*0*\d{1,3}\s*[-–]\s*0*\d{1,3}\s*\)?/gi },
  { nama: 'jumlah tabel', re: /\b(\d{1,4})\+?\s*[Tt]abel\b|\bDatabase\s*—\s*\d+/g },
  { nama: 'jumlah endpoint', re: /\b(\d{2,4})\s*endpoint\b/gi },
  { nama: 'jumlah policy', re: /\b(\d{2,4})\s*polic(?:y|ies)\b/gi },
  { nama: 'jumlah halaman', re: /\b(\d{2,4})\s*halaman\s*Next/gi },
]

// Frasa yang menandakan penyebutan angka itu SAH karena bertanggal / historis.
const PENGECUALIAN = /git show|history|dulu menyatakan|versi sebelumnya|sebelumnya menyatakan|temuan F-|audit 2026|basi/i

let pelanggaran = 0
const laporan = []

for (const berkas of DOKUMEN_KONTEKS) {
  const path = join(REPO_ROOT, berkas)
  if (!existsSync(path)) continue
  const baris = readFileSync(path, 'utf8').split('\n')

  baris.forEach((teks, i) => {
    if (PENGECUALIAN.test(teks)) return          // penyebutan historis — sah
    if (teks.trim().startsWith('#')) return      // judul
    for (const { nama, re } of POLA_TERLARANG) {
      re.lastIndex = 0
      const m = re.exec(teks)
      if (m) {
        pelanggaran++
        laporan.push(`  ${berkas}:${i + 1}  [${nama}]  ${teks.trim().slice(0, 100)}`)
      }
    }
  })
}

// Pemeriksaan silang: kalau dokumen konteks menyebut nomor migrasi tertinggi,
// angkanya harus cocok dengan berkas yang benar-benar ada.
const MIGRASI = join(REPO_ROOT, 'db', 'migrations')
if (existsSync(MIGRASI)) {
  const berkas = readdirSync(MIGRASI).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()
  const tertinggi = berkas.length ? Number(berkas[berkas.length - 1].match(/^(\d+)_/)[1]) : 0
  for (const dok of DOKUMEN_KONTEKS) {
    const p = join(REPO_ROOT, dok)
    if (!existsSync(p)) continue
    // Diperiksa PER BARIS, bukan per berkas — supaya pengecualian "penyebutan
    // historis" berlaku pada baris yang sama, persis seperti pemeriksaan utama.
    // (Versi pertama penjaga ini memindai seluruh berkas sekaligus, sehingga
    // kutipan sejarah di paragraf pembuka CLAUDE.md ikut tertangkap — penjaga
    // yang menyalahkan dokumen karena menjelaskan kesalahan lamanya sendiri.)
    readFileSync(p, 'utf8').split('\n').forEach((teks, i) => {
      if (PENGECUALIAN.test(teks)) return
      for (const m of teks.matchAll(/\b(?:s\.d\.|sampai|hingga)\s*(\d{2,4})\b/gi)) {
        const n = Number(m[1])
        if (n !== tertinggi) {
          pelanggaran++
          laporan.push(`  ${dok}:${i + 1}  menyebut migrasi "s.d. ${n}" tetapi nomor tertinggi nyata = ${tertinggi}`)
        }
      }
    })
  }
}

console.log('══ PENJAGA docs-freshness ' + '═'.repeat(43))
if (pelanggaran === 0) {
  console.log('  ✅ bersih — dokumen konteks tidak memuat angka yang bisa membusuk.')
  console.log('     (angka diukur lewat `node scripts/db/introspect.mjs`, bukan ditulis)')
  process.exit(0)
}

console.error(`  ❌ ${pelanggaran} klaim angka ditemukan di dokumen konteks:\n`)
laporan.forEach((l) => console.error(l))
console.error(`
  Kenapa ini gagal: dokumen konteks dibaca agent AI tiap sesi. Angka di sana
  membusuk tanpa gejala, dan agent memakainya sebagai fakta.

  Perbaikannya BUKAN memperbarui angkanya — melainkan menggantinya dengan
  perintah pengukurannya:

      node scripts/db/introspect.mjs tables
      node scripts/db/introspect.mjs migration-ledger

  Kalau penyebutan itu memang historis (mis. menjelaskan kesalahan lama),
  sertakan penanda seperti "versi sebelumnya menyatakan" agar dikenali sah.`)
process.exit(1)
