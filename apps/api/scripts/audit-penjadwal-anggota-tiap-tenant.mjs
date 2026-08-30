#!/usr/bin/env node
/**
 * PENJAGA — AKUN PENJADWAL WAJIB ANGGOTA TIAP TENANT AKTIF.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA — cacat nyata, diukur 2026-08-30 pada jalan pertama di produksi
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Penjadwal berjalan sungguhan untuk pertama kalinya sesudah deploy, dan
 * hasilnya:
 *
 *     diperiksa 114 · sukses 49 · GAGAL 29 · dilewati 36
 *
 * Kedua puluh sembilan bergalat sama: 403 "Anda bukan anggota perusahaan
 * tersebut". Diukur per tenant:
 *
 *     Puraloka Persada         72 tugas · sukses
 *     PT Puraloka Nusantara    18 tugas · GAGAL   (3 proyek nyata)
 *     PT Puraloka Properti     18 tugas · GAGAL   (2 proyek nyata)
 *
 * ── INI BUKAN CACAT PENJADWAL — INI DESAINNYA BEKERJA
 *
 * `lib/akun-layanan.ts` sengaja menolak bypass autentikasi: penjadwal tunduk
 * pada permission dan batas tenant yang SAMA PERSIS dengan manusia. 403 di
 * sini adalah pagar yang berfungsi.
 *
 * Yang kurang cuma pendaftarannya. Diperbaiki migrasi 523.
 *
 * ── KENAPA TAK PERNAH TERLIHAT DI LAPTOP
 *
 * Karena penjadwalnya tak pernah berjalan sama sekali — tugasnya duduk aktif
 * dengan `terakhir_jalan` NULL. Deploy tidak MENCIPTAKAN cacat ini; ia
 * menyalakan lampu di ruangan yang sudah lama begitu.
 *
 * ── KENAPA MIGRASI SAJA TIDAK CUKUP
 *
 * Migrasi 523 memperbaiki keadaan HARI ITU. Tenant baru yang dibuat besok
 * lahir tanpa keanggotaan penjadwal, dan seluruh tugasnya gagal 403 sejak
 * hari pertama — tanpa satu pun gejala di layar, karena kegagalannya cuma
 * tercatat di `terakhir_galat` yang tak dibuka siapa pun.
 *
 * Penjaga ini yang menangkapnya.
 *
 * ── AMBANG NOL, TETAPI DILEWATI TANPA BASIS
 *
 * Ia butuh koneksi basis, dan CI menjalankannya hanya di lingkungan yang
 * punya. Di mesin pengembang tanpa `DATABASE_URL` ia MELEWATI dengan pesan
 * jelas, bukan merah — penjaga yang merah karena env kurang akan diabaikan
 * orang, dan yang diabaikan tak menjaga apa pun.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Baca `.env` API — BOM dan tanda kutip dilucuti (jebakan repo ini). */
function bacaEnv() {
  const f = join(AKAR_API, '.env')
  if (!existsSync(f)) return {}
  return Object.fromEntries(
    readFileSync(f, 'utf8')
      .replace(/^﻿/, '')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      }),
  )
}

const env = { ...bacaEnv(), ...process.env }
const dsn = env.DIRECT_URL || env.DATABASE_URL
const emailPenjadwal = env.SCHEDULER_EMAIL

if (!dsn) {
  console.log('⏭  penjadwal anggota tiap tenant: DILEWATI (tak ada DATABASE_URL)')
  process.exit(0)
}
if (!emailPenjadwal) {
  console.error('✗ SCHEDULER_EMAIL tak disetel — akun penjadwal tak bisa diperiksa.')
  console.error('  Tanpa akun itu, penjadwal tak bisa masuk sama sekali; lihat .env.example.')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const { Client } = require('pg')
const c = new Client({ connectionString: dsn })

try {
  await c.connect()

  const u = await c.query('SELECT id FROM users WHERE email = $1', [emailPenjadwal])
  if (u.rowCount === 0) {
    console.error(`✗ Akun penjadwal (${emailPenjadwal}) TIDAK ADA di tabel users.`)
    console.error('  Penjadwal tak akan bisa masuk, dan SELURUH tugas terjadwal gagal.')
    process.exit(1)
  }
  const uid = u.rows[0].id

  /*
    Hanya tenant AKTIF yang dituntut.

    Diukur 2026-08-30: basis dev memuat 1.751 perusahaan nonaktif sisa test.
    Menuntut keanggotaan di semuanya berarti 1.751 baris yang tak berguna —
    dan `audit-migrasi-pertenant-aktif` ada justru karena kesalahan itu pernah
    menulis 9.164 baris untuk tenant mati.
  */
  /*
    TENANT UJI DIKECUALIKAN — dan ini bukan kelonggaran.

    Diukur 2026-08-31: penjaga ini merah menyebut `PT Uji Validate`, tenant
    yang dibuat DAN dihapus oleh test sesi lain dalam hitungan detik. Saat
    migrasi 523 dijalankan beberapa saat kemudian, tenantnya sudah tak ada.

    Tenant sementara milik test tak pernah punya tugas terjadwal dan tak pernah
    dijalankan penjadwal — mendaftarkannya tak memperbaiki apa pun. Yang
    dirusaknya nyata: penjaga yang merah-berkedip mengikuti test orang lain
    adalah penjaga yang cepat atau lambat dimatikan, dan yang dimatikan tak
    menjaga apa pun.

    Polanya mengikuti konvensi repo ini — nama tenant uji berawalan kurung
    siku (`[UJI-ISOLASI]`, `[UJI-C2]`, `[MUT-523]`) atau memuat kata "Uji".
    Tenant produksi tak pernah dinamai begitu.
  */
  const kurang = await c.query(
    `SELECT co.id, co.name
       FROM companies co
      WHERE co.is_active
        AND co.name NOT LIKE '[%'
        AND co.name !~* '\\muji\\M'
        AND NOT EXISTS (
          SELECT 1 FROM company_members m
           WHERE m.company_id = co.id AND m.user_id = $1
        )
      ORDER BY co.name`,
    [uid],
  )

  // Cacah dengan saringan yang SAMA — kalau berbeda, angkanya bertentangan
  // dengan daftarnya dan pembacanya tak tahu mana yang benar.
  const total = await c.query(
    `SELECT count(*)::int n FROM companies
      WHERE is_active AND name NOT LIKE '[%' AND name !~* '\\muji\\M'`,
  )
  const uji = await c.query(
    `SELECT count(*)::int n FROM companies
      WHERE is_active AND (name LIKE '[%' OR name ~* '\\muji\\M')`,
  )

  console.log('Penjaga: akun penjadwal anggota tiap tenant aktif')
  console.log(`  akun             : ${emailPenjadwal}`)
  console.log(`  tenant aktif     : ${total.rows[0].n}`)
  console.log(`  tenant uji (dilewati): ${uji.rows[0].n}`)
  console.log(`  tanpa keanggotaan: ${kurang.rowCount}`)

  if (kurang.rowCount > 0) {
    console.error(`\n✗ ${kurang.rowCount} tenant aktif TANPA keanggotaan akun penjadwal:\n`)
    for (const r of kurang.rows) console.error(`    ${r.name}`)
    console.error(
      '\nSeluruh tugas terjadwal untuk tenant di atas akan gagal 403 "bukan anggota'
      + '\nperusahaan tersebut" — dan kegagalannya hanya tercatat di kolom'
      + '\n`jadwal_tugas.terakhir_galat`, yang tak dibuka siapa pun.'
      + '\n\nPerbaikan: daftarkan akun penjadwal sebagai anggota, dengan peran template'
      + '\nadmin — ikuti pola migrasi 523.',
    )
    process.exit(1)
  }

  console.log('\n✓ Akun penjadwal terdaftar di seluruh tenant aktif.')
} finally {
  await c.end().catch(() => {})
}
