#!/usr/bin/env node
/**
 * PENJAGA ADR-004 — UI memutuskan lewat PERMISSION, bukan nama jabatan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ADR-004 menetapkan: kode hanya boleh memeriksa CAPABILITY (`punch:manage`),
 * tak boleh nama role (`admin`). Alasannya bukan kerapian — role adalah **data
 * konfigurasi** yang founder ubah lewat UI, sementara permission adalah
 * kontrak.
 *
 * Sisi API sudah patuh (`requirePermission` di mana-mana). Sisi WEB tidak:
 * ditemukan 29 pemakaian `user?.role === "admin"` di 14 berkas (2026-08-01).
 *
 * ── Bukan pelanggaran teoretis: sudah menggigit hari ini
 *
 * Role kustom `direktur` punya **7 permission procurement** — tapi UI
 * menyembunyikan tombolnya karena mengecek `role === "admin" || role === "pm"`.
 * Orang dengan wewenang penuh melihat halaman tanpa tombol, dan tak ada pesan
 * apa pun yang menjelaskan kenapa. Sepenuhnya senyap.
 *
 * Dampaknya "hanya kosmetik" karena API tetap menolak — tapi itu justru
 * membuatnya lebih buruk: tombol yang muncul lalu ditolak 403 setidaknya
 * memberi tahu; tombol yang tak pernah muncul tak memberi apa pun.
 *
 * ── Kenapa RATCHET, bukan larangan total
 *
 * 29 pelanggaran tersebar di 14 berkas, dan tiap satu butuh pemetaan
 * permission yang TEPAT — bukan penggantian mekanis. Memaksa nol sekarang
 * berarti menebak, dan permission yang salah lebih berbahaya daripada role
 * yang usang: ia MEMBUKA akses, bukan menutup.
 *
 * Yang ditegakkan: jangan bertambah. Turunkan angkanya tiap kali sekelompok
 * diperbaiki, seperti pola ratchet lain di repo ini.
 *
 * Jalankan: node apps/web/scripts/adr004-ratchet.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const AKAR = join(import.meta.dirname, '..')

/**
 * AMBANG — pemakaian `role === "..."` untuk memutuskan tampilan.
 *
 * ⚠️ HANYA BOLEH TURUN. Kalau gagal karena NAIK, pakai `hasPermission("...")`
 * di kode baru Anda — jangan naikkan angkanya.
 *
 * 27 adalah hasil ukur 2026-08-01 SESUDAH `procurement/page.tsx` diperbaiki
 * (32 → 27; angka awalnya lebih tinggi karena dua pemakaian bisa ada di satu
 * baris yang sama). Yang diperbaiki di sana dipetakan ke permission yang API
 * benar-benar tuntut, diverifikasi satu per satu:
 *   · approve MR   → `procurement:mr:manage` (level 1 rantai approval)
 *   · PO & GR      → `procurement:po:manage`
 *   · stok & opname→ `procurement:view`
 */
const AMBANG = 27

/**
 * Dikecualikan DENGAN ALASAN — bukan disembunyikan.
 *
 * Halaman yang memang bicara TENTANG role (bukan memutuskan berdasarkan role)
 * sah memakai nama role: itu datanya, bukan gerbangnya.
 */
const DIKECUALIKAN = new Map(Object.entries({
  'app/(dashboard)/pengaturan/roles/page.tsx':
    'halaman pengelolaan role — menampilkan & membandingkan nama role adalah isinya',
  'app/(dashboard)/users/page.tsx':
    'halaman kelola user — dropdown pilih role, bukan gerbang akses',
}))

function berkasTsx(dir) {
  const h = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'ds-bundle') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) h.push(...berkasTsx(p))
    else if (e.name.endsWith('.tsx')) h.push(p)
  }
  return h
}

// `role === "x"` pada objek user YANG SEDANG LOGIN.
//
// ⚠️ `u.role` SENGAJA TIDAK ditangkap. Versi pertama menangkapnya dan menuduh
// palsu `kas/page.tsx:959` — `users.filter(u => u.role === "pm")` adalah
// PENYARINGAN DAFTAR untuk dropdown, bukan gerbang akses. Menyaring daftar
// menurut role itu sah; yang dilarang ADR-004 adalah memutuskan APA YANG BOLEH
// DILAKUKAN pemakai berdasarkan jabatannya.
//
// `role === "x"` pada objek user YANG SEDANG LOGIN.
// ⚠️ `u.role` SENGAJA TIDAK ditangkap: `users.filter(u => u.role === "pm")`
// adalah PENYARINGAN DAFTAR untuk dropdown, bukan gerbang akses. Versi
// pertama menangkapnya dan menuduh palsu `kas/page.tsx:959`. Menyaring
// daftar menurut role itu sah; yang dilarang ADR-004 adalah memutuskan APA
// YANG BOLEH DILAKUKAN pemakai berdasarkan jabatannya.
const POLA = /\b(currentUser|user|me)\s*\??\.\s*role\s*===\s*["'][a-z_]+["']/g

const temuan = []
for (const f of [...berkasTsx(join(AKAR, 'app')), ...berkasTsx(join(AKAR, 'components'))]) {
  const rel = relative(AKAR, f).replace(/\\/g, '/')
  if (DIKECUALIKAN.has(rel)) continue
  const baris = readFileSync(f, 'utf8').split('\n')
  for (let i = 0; i < baris.length; i++) {
    const t = baris[i].trim()
    // Komentar bukan kode — berkas di repo ini menjelaskan dirinya panjang
    // lebar, dan kalimat "sebelumnya mengecek role === admin" ikut terhitung.
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue
    const n = (baris[i].match(POLA) || []).length
    for (let k = 0; k < n; k++) temuan.push(`${rel}:${i + 1}`)
  }
}

console.log(`ADR-004: ${temuan.length} pemakaian \`role === "..."\` untuk memutuskan tampilan`)

if (temuan.length > AMBANG) {
  console.error(`\n❌ PENJAGA ADR-004 GAGAL: ${temuan.length} > ambang ${AMBANG}\n`)
  console.error('   ADR-004: kode memeriksa CAPABILITY, bukan nama jabatan. Role adalah')
  console.error('   data konfigurasi yang bisa diubah founder lewat UI; permission adalah')
  console.error('   kontrak.')
  console.error('\n   Sudah menggigit: role `direktur` punya 7 permission procurement tapi')
  console.error('   UI menyembunyikan tombolnya karena mengecek `role === "admin"`.')
  console.error('   Orang berwenang melihat halaman tanpa tombol, tanpa pesan apa pun.')
  console.error('\n   Perbaikan: `hasPermission("modul:aksi")` dari @/lib/api — dan pilih')
  console.error('   permission yang API BENAR-BENAR tuntut, jangan menebak.')
  console.error('\n   Baru:')
  temuan.slice(0, 12).forEach((t) => console.error(`     ${t}`))
  console.error('')
  process.exit(1)
}

if (temuan.length < AMBANG) {
  console.log(`\n📉 Turun dari ambang (${temuan.length} < ${AMBANG}) — kencangkan angkanya`)
  console.log('   di scripts/adr004-ratchet.mjs.')
}
