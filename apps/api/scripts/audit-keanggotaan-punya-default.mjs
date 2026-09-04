#!/usr/bin/env node
// ============================================================================
// TIAP PENGGUNA AKTIF WAJIB PUNYA KEANGGOTAAN DEFAULT
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA PENJAGA INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Cacat yang SAMA diperbaiki DUA KALI dalam dua hari:
//
//     migrasi 379 (2026-08-14 pagi)  3 pengguna tanpa default → dipulihkan,
//                                    verifikasi lulus: nol tersisa
//     migrasi 394 (2026-08-14 malam) 13 pengguna tanpa default → lagi
//
// Keduanya membersihkan gejala. Yang membuatnya lahir kembali adalah celah di
// `PATCH /my/companies/:id/default`: ia menurunkan SEMUA default lebih dulu,
// baru menaikkan yang dipilih. Kegagalan penurunan sudah diperiksa; kegagalan
// KENAIKAN tidak — dan di situ pengguna tertinggal dengan nol default.
//
// Urutannya sudah dibalik (naikkan dulu, baru turunkan sisanya), jadi kelas
// kerusakannya hilang. Penjaga ini yang memastikan ia tak kembali lewat jalan
// lain — seed, skrip, atau rute yang belum ada.
//
// ── Kenapa nol default lebih merusak daripada terlihat
//
// `auth_company_id()` jatuh ke keanggotaan default. Tanpa satu pun, ia NULL —
// lalu `tenant_isolation` RESTRICTIVE (migrasi 373) menyaring HABIS.
//
// Pengguna melihat NOL data. Tak ada galat, tak ada layar merah, tak ada baris
// log. Gejalanya identik dengan kebocoran dari sisi berlawanan, dan keduanya
// sama-sama diam.
//
// Sekali ini menjatuhkan `t5b-kill-switch` dengan pesan yang menunjuk ke arah
// SALAH: "auth_client_id() memulangkan baris klien dari company lain —
// kebocoran lintas-tenant". Sepuluh langkah dari sebabnya.
//
// ── Yang dijaga
//
// Pengguna aktif yang punya keanggotaan aktif TAPI nol `is_default`.
//
// Ambang NOL untuk yang berkeanggotaan TUNGGAL — di situ tak ada yang perlu
// ditebak, dan tak ada alasan sah untuk kosong.
//
// Yang berkeanggotaan GANDA dilaporkan tanpa memerahkan: memilih company mana
// yang terbuka saat login adalah preferensi pemiliknya, dan sistem yang
// menebaknya membuka perusahaan yang salah tanpa pernah diminta. Yang benar:
// pengguna memilihnya sendiri di UI.
//
// Butuh basis. Dilewati bila DATABASE_URL tak ada (pola `audit-sod-gerbang`).
// ============================================================================

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const AKAR_API = join(dirname(fileURLToPath(import.meta.url)), '..')

/*
  ⚠ Kredensial dibaca dari `.env` JUGA, bukan `process.env` saja.

  Diukur 2026-09-04: SEBELAS penjaga di direktori ini melewati DIRINYA SENDIRI
  di mesin yang jelas punya basis — mereka menanyakan `process.env`, sementara
  kredensial repo ini tinggal di `apps/api/.env`.

  Akibatnya "223 penjaga hijau" memuat sebelas yang tak pernah memeriksa apa
  pun. Penjaga berambang NOL yang selalu dilewati memberi rasa aman yang
  salah — lebih buruk daripada tak ada penjaga.

  `bacaEnv()` membaca sumber yang SAMA dengan `buatClient()`.
*/
const { bacaEnv: _bacaEnv } = await import('../../../scripts/db/_koneksi.mjs')
const _envBerkas = _bacaEnv()
const DB =
  process.env.DATABASE_URL || process.env.DIRECT_URL
  || _envBerkas.DATABASE_URL || _envBerkas.DIRECT_URL
if (!DB) {
  console.log('  ⏭  keanggotaan default: DILEWATI (tak ada DATABASE_URL)')
  process.exit(0)
}

const requireDari = createRequire(join(AKAR_API, 'package.json'))
let pg = null
try { pg = requireDari('pg') } catch { /* dilaporkan di bawah */ }
if (!pg) {
  console.log('  ⏭  keanggotaan default: DILEWATI (pg tak ter-resolve)')
  process.exit(0)
}

const c = new pg.Client({ connectionString: DB })
await c.connect()

const { rows: [hasil] } = await c.query(`
  WITH tanpa_default AS (
    SELECT u.id,
           u.name,
           (SELECT count(*) FROM company_members m
             WHERE m.user_id = u.id AND m.is_active) AS n_anggota
      FROM users u
     WHERE u.is_active
       AND EXISTS (SELECT 1 FROM company_members m
                    WHERE m.user_id = u.id AND m.is_active)
       AND NOT EXISTS (SELECT 1 FROM company_members m
                        WHERE m.user_id = u.id AND m.is_default AND m.is_active)
  )
  SELECT
    count(*) FILTER (WHERE n_anggota = 1)::int AS tunggal,
    count(*) FILTER (WHERE n_anggota > 1)::int AS ganda,
    coalesce(
      string_agg(name, ', ') FILTER (WHERE n_anggota = 1),
      ''
    ) AS nama_tunggal
    FROM tanpa_default
`)

// Dua default sekaligus — gangguan, bukan kelumpuhan. Dilaporkan saja.
const { rows: [dobel] } = await c.query(`
  SELECT count(*)::int n FROM (
    SELECT user_id FROM company_members
     WHERE is_active AND is_default
     GROUP BY user_id HAVING count(*) > 1) x
`)

await c.end()

if (hasil.ganda > 0) {
  console.log(`  ℹ  ${hasil.ganda} pengguna berkeanggotaan GANDA tanpa default.`)
  console.log('     Tidak memerahkan — memilih company mana yang terbuka saat login')
  console.log('     adalah preferensi pemiliknya, bukan tebakan sistem.')
}

if (dobel.n > 0) {
  console.log(`  ℹ  ${dobel.n} pengguna punya DUA default sekaligus.`)
  console.log('     `auth_company_id()` memulangkan salah satunya sembarang — tetapi')
  console.log('     keduanya company yang SAH bagi pengguna itu, jadi ia melihat data.')
}

if (hasil.tunggal > 0) {
  console.error('\n❌ Pengguna aktif berkeanggotaan TUNGGAL tanpa keanggotaan default:\n')
  console.error(`   ${hasil.tunggal} pengguna — ${hasil.nama_tunggal}\n`)
  console.error('   `auth_company_id()` NULL untuk mereka, lalu `tenant_isolation`')
  console.error('   RESTRICTIVE (migrasi 373) menyaring HABIS: mereka melihat NOL data')
  console.error('   tanpa satu pun galat, layar merah, atau baris log.\n')
  console.error('   Cacat ini sudah dibersihkan DUA KALI (migrasi 379 lalu 394) karena')
  console.error('   sumbernya tak ikut ditutup. Kalau ia muncul lagi, jangan bersihkan')
  console.error('   gejalanya — cari jalur yang menghapus `is_default` tanpa menggantinya.\n')
  console.error('   Perbaikan cepat:')
  console.error('     UPDATE company_members m SET is_default = true')
  console.error('      FROM (SELECT user_id FROM company_members WHERE is_active')
  console.error('             GROUP BY user_id HAVING count(*) = 1')
  console.error('                AND count(*) FILTER (WHERE is_default) = 0) t')
  console.error('      WHERE m.user_id = t.user_id AND m.is_active;\n')
  process.exit(1)
}

console.log('✅ Keanggotaan default: nol pengguna tunggal tanpa default')
