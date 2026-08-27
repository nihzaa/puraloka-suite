#!/usr/bin/env node
// ============================================================================
// BERAPA BANYAK SISA TEST YANG MENUMPUK DI BASIS — HANYA MELAPOR, TAK MENGHAPUS.
// ============================================================================
//
// ── Kenapa alat ini ada
//
// Ditemukan 2026-08-27 saat mengejar tiga test otomasi yang merah. Sebabnya
// bukan di kode yang diuji, melainkan di BASIS:
//
//     companies         1.328   (nyata: SATU — `puraloka-persada`)
//     roles             5.754   untuk 29 pengguna
//     role_permissions  229.612
//
// Suite test membuat tenant, peran, dan izin lalu tak membersihkannya. Setelah
// ratusan kali jalan, sisanya menenggelamkan data nyata.
//
// Kerusakannya BUKAN sekadar tempat terpakai — ia mengubah hasil:
//
//   1. `role_permissions` yang 229.612 baris membuat pencarian penerima
//      notifikasi terpotong di 1.000 baris PostgREST. Peran yang benar-benar
//      dipakai orang (`mandor`, `pm`, `admin`) berada DI LUAR potongan, jadi
//      notifikasi `stok_menipis` tak pernah punya penerima — tanpa satu pun
//      galat. (Sudah diperbaiki di `notification-routing.ts` dengan membalik
//      arah query; tetapi sebab tumpukannya masih ada.)
//
//   2. Test yang memilih baris dengan `LIMIT 1` TANPA `ORDER BY` bisa mendapat
//      proyek milik company uji asing, sehingga rute yang diuji tak pernah
//      melihat data yang baru saja disiapkan. Inilah yang membuat sebagian
//      test otomasi merah saat dijalankan hari itu.
//
// ── Kenapa MELAPOR, bukan menghapus
//
// Menghapus data yang sudah ada butuh konfirmasi founder (CLAUDE.md §8a.5),
// dan penghapusan lintas-tenant berisiko: sebagian company ber-nama "uji"
// justru DIPAKAI test yang masih berjalan (`grup-uji-properti`,
// `grup-uji-nusantara` untuk skenario multi-company).
//
// Jadi alat ini hanya mengukur, dan menyebut mana yang AMAN dibersihkan versus
// mana yang harus diputuskan orang. Ia bisa dijalankan berkali-kali tanpa efek.
// ============================================================================

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')
const requireDari = createRequire(join(AKAR_API, 'package.json'))

/*
  `.env` dimuat sendiri — pelajaran dari `audit-baca-tak-terpotong.mjs`, yang
  selama berminggu-minggu mencetak "DILEWATI (tak ada DATABASE_URL)" padahal
  nilainya ADA di `apps/api/.env`. Alat yang diam karena tak menemukan env
  terbaca seperti alat yang tak menemukan masalah.
*/
try {
  requireDari('dotenv').config({ path: join(AKAR_API, '.env') })
} catch { /* di CI env datang dari luar */ }

const { createClient } = requireDari('@supabase/supabase-js')

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY
if (!URL || !KEY) {
  console.log('  ⏭  lapor sampah uji: DILEWATI — SUPABASE_URL/SECRET_KEY tak ada')
  console.log(`     (sudah dicoba dari ${join(AKAR_API, '.env')})`)
  process.exit(0)
}

const c = createClient(URL, KEY, { auth: { persistSession: false } })

/** Hitung baris tanpa menariknya — `head: true` supaya murah. */
async function hitung(tabel, saring) {
  let q = c.from(tabel).select('*', { count: 'exact', head: true })
  if (saring) q = saring(q)
  const { count, error } = await q
  if (error) return { galat: error.message }
  return { n: count ?? 0 }
}

/**
 * Company yang JELAS milik test, dan yang harus diputuskan orang.
 *
 * `grup-uji-*` sengaja TIDAK masuk daftar aman: keduanya dipakai skenario
 * multi-company yang masih berjalan. Menghapusnya akan merahkan test yang
 * sehat — kesalahan yang sama bentuknya dengan memasang pagar profil baja di
 * modul yang memang dirancang untuk kanal.
 */
const POLA_JELAS_UJI = ['uji-%', 'retired-%']

console.log('══ Sisa test yang menumpuk di basis ═════════════════════════')
console.log('')

const tabel = [
  ['companies', null],
  ['roles', null],
  ['role_permissions', null],
  ['permissions', null],
  ['users', null],
  ['projects', null],
]

for (const [t, f] of tabel) {
  const r = await hitung(t, f)
  console.log(`  ${t.padEnd(20)} ${r.galat ? 'GAGAL ' + r.galat : String(r.n).padStart(8)}`)
}

console.log('')
console.log('  ── companies menurut polanya')

let jelasUji = 0
for (const pola of POLA_JELAS_UJI) {
  const r = await hitung('companies', (q) => q.like('code', pola))
  if (r.galat) { console.log(`  ${pola.padEnd(20)} GAGAL ${r.galat}`); continue }
  jelasUji += r.n
  console.log(`  ${pola.padEnd(20)} ${String(r.n).padStart(8)}   ← jelas sisa test`)
}

const { data: lain, error: eLain } = await c
  .from('companies').select('code, name, created_at')
  .not('code', 'like', 'uji-%').not('code', 'like', 'retired-%')
  .order('created_at', { ascending: true })

if (eLain) {
  console.log(`  (gagal membaca sisanya: ${eLain.message})`)
} else {
  console.log(`  ${'lainnya'.padEnd(20)} ${String(lain.length).padStart(8)}   ← PUTUSKAN satu per satu:`)
  for (const x of lain) {
    console.log(`       ${x.code.padEnd(26)} ${(x.name ?? '').slice(0, 30).padEnd(32)} ${x.created_at?.slice(0, 10) ?? ''}`)
  }
}

console.log('')
console.log(`  Jelas sisa test : ${jelasUji} company`)
console.log('')
console.log('  ⚠ Alat ini TIDAK menghapus apa pun. Pembersihan data yang sudah')
console.log('    ada butuh konfirmasi founder (CLAUDE.md §8a.5), dan sebagian')
console.log('    company bernama "uji" justru DIPAKAI test yang masih berjalan')
console.log('    (`grup-uji-*` untuk skenario multi-company) — menghapusnya')
console.log('    akan merahkan test yang sehat.')
console.log('')
console.log('  Kenapa ini bukan sekadar soal tempat terpakai: `role_permissions`')
console.log('  yang membengkak membuat pencarian penerima notifikasi TERPOTONG')
console.log('  di 1.000 baris PostgREST — peran yang benar-benar dipakai orang')
console.log('  berada di luar potongan, dan notifikasi tak pernah terbit tanpa')
console.log('  satu pun galat.')
