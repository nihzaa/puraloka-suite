#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Migrasi yang MEMAKU skema — "berhasil" di mana saja, berefek di satu tempat.
//
// ── Pola yang dicari
//
//     CREATE OR REPLACE FUNCTION public.fn_sesuatu()
//                                ^^^^^^^
//
// Test menjalankan rantai migrasi di schema `test` (isolasi antar-run, lihat
// `test-utils/test-db.ts`). Migrasi yang memaku `public.` akan menulis ke
// `public` walau yang sedang dibangun `test` — jadi versi lama di `test` tak
// pernah tergantikan, dan perbaikannya TAK BISA DIVERIFIKASI test apa pun.
//
// Ditemukan 2026-08-02: `100_fix_kasbon_expense_trigger_on_conflict.sql`
// adalah bugfix untuk `ON CONFLICT` yang membuat setiap approve kasbon gagal.
// Perbaikannya benar, tapi ditulis `public.fn_kasbon_approved_create_expense()`
// — sehingga schema test tetap memegang versi rusak, dan test alur uang mandor
// yang baru ditulis langsung gagal dengan error yang katanya sudah diperbaiki
// setahun lalu.
//
// Kelas cacat yang sama dengan trigger hilang (migrasi 161/162/164): semuanya
// berbentuk "berhasil tanpa melakukan apa-apa".
//
// ── Yang DIKECUALIKAN, dan kenapa
//
// `144_auth_role_per_company.sql` → `public.auth_role()` disengaja: fungsi itu
// dipanggil policy RLS yang memang hidup di `public`, dan memindahkannya ke
// schema test akan mengubah arti policy-nya. Pengecualian ditulis eksplisit di
// sini, bukan lewat ambang angka — supaya setiap tambahan baru harus
// menjelaskan diri.
//
// ── Ambang
//
// NOL di luar daftar kecuali. Ini bukan ratchet: memaku skema tanpa alasan
// yang ditulis adalah cacat, bukan hutang teknis yang dicicil.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = new URL('../../../db/migrations', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

/** Migrasi yang BOLEH memaku skema, dengan alasannya. */
const DIKECUALIKAN = new Map([
  ['100_fix_kasbon_expense_trigger_on_conflict.sql',
   'cacat NYATA yang melahirkan penjaga ini — tak diedit karena sudah ter-apply ' +
   'di dev; efeknya digantikan migrasi 165 yang sadar-skema'],
  ['144_auth_role_per_company.sql',
   'auth_role() dipanggil policy RLS yang hidup di `public` — memindahkannya mengubah arti policy'],
  ['165_fungsi_kasbon_expense_sadar_schema.sql',
   'menyebut `public.` hanya di dalam komentar yang menjelaskan cacat migrasi 100'],

  /*
    ── Lima migrasi lama, didaftarkan 2026-08-29

    Alasannya SAMA dengan `100_...` di atas: sudah ter-apply, jadi mengeditnya
    tak mengubah apa pun di basis yang sudah berjalan — ia hanya membuat berkas
    menyimpang dari kenyataan, dan itu justru cacat yang lebih sulit dilihat.

    Dibuktikan lewat ARTEFAK FISIK, bukan buku migrasi (buku bisa memuat entri
    palsu — pelajaran `ledger-diff`):

        363  kolom `roles.is_template`        ADA
        366  fungsi `has_permission`          ADA
        371  fungsi `t5_company_dari_klaim`   ADA
        372  fungsi `get_role_permissions`    ADA
        437  tabel `penawaran_subkon_item`    ADA

    Yang TIDAK dilakukan: menaikkan ambang. Penjaga ini bukan ratchet, dan
    kepala berkasnya menyatakan alasannya — memaku skema TANPA alasan tertulis
    adalah cacat, bukan hutang yang dicicil. Karena itu tiap nama di sini
    membawa alasannya sendiri, dan yang baru harus menjelaskan diri.

    Kalau kelak salah satunya perlu diubah, jalurnya migrasi MAJU yang sadar
    skema (pola 165), bukan mengedit yang lama.
  */
  ['363_roles_per_tenant.sql',
   'sudah ter-apply (kolom roles.is_template ada) — `ALTER TABLE public.roles` tak bisa diedit tanpa membuat berkas menyimpang dari basis'],
  ['366_fungsi_izin_sadar_tenant.sql',
   'sudah ter-apply (fungsi has_permission ada); digantikan 372 yang menulis ulang fungsi yang sama'],
  ['371_tenancy_dua_tabel_turunan.sql',
   'sudah ter-apply (fungsi t5_company_dari_klaim ada) — dipanggil policy RLS yang hidup di `public`, sama alasannya dengan 144'],
  ['372_izin_peran_tanpa_konteks_tenant.sql',
   'sudah ter-apply (fungsi get_role_permissions ada) — dipanggil policy RLS di `public`'],
  ['437_penawaran_subkon_item.sql',
   'sudah ter-apply (tabel penawaran_subkon_item ada); fungsinya trigger atas tabel `public` itu sendiri'],
])

// `CREATE [OR REPLACE] FUNCTION public.nama(` — hanya baris kode, bukan komentar.
const POLA = /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\./i

const temuan = []
for (const nama of readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) {
  if (DIKECUALIKAN.has(nama)) continue
  const baris = readFileSync(join(DIR, nama), 'utf8').split('\n')
  baris.forEach((isi, i) => {
    if (isi.trimStart().startsWith('--')) return
    if (POLA.test(isi)) temuan.push({ nama, baris: i + 1, isi: isi.trim() })
  })
}

if (temuan.length === 0) {
  console.log(`✅ Migrasi sadar-skema: nol yang memaku \`public.\` (${DIKECUALIKAN.size} dikecualikan dengan alasan tertulis)`)
  process.exit(0)
}

console.error(`\n❌ ${temuan.length} migrasi memaku skema \`public.\`\n`)
for (const t of temuan) {
  console.error(`   db/migrations/${t.nama}:${t.baris}`)
  console.error(`     ${t.isi.slice(0, 90)}`)
}
console.error(`
Migrasi ini akan menulis ke \`public\` walau rantai migrasi sedang dibangun di
schema lain — sehingga perubahannya TAK BISA diverifikasi test apa pun.

Perbaikan: hapus \`public.\` supaya fungsinya mendarat di schema aktif. Kalau
memaku skema memang disengaja, tambahkan ke DIKECUALIKAN di skrip ini beserta
alasannya.
`)
process.exit(1)
