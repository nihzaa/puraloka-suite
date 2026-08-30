#!/usr/bin/env node
/**
 * uji-dashboard-per-peran.mjs — bukti lewat RUTE HTTP SUNGGUHAN
 *
 * ── Kenapa ini ada, padahal sudah ada test
 *
 * `dashboard-saring-peran.test.ts` memanggil rute lewat `app.inject()` — cepat,
 * dan cukup untuk menjaga bentuk respons. Yang TIDAK dibuktikannya: bahwa
 * rantai lengkapnya bekerja saat aplikasi benar-benar berjalan — plugin auth
 * terpasang, token sungguhan diverifikasi Supabase, `request.db` dirakit dari
 * klien ber-token, RLS ikut menyaring.
 *
 * Bentuk kegagalan yang dijaga di sini punya ciri khas: **halaman kosong tanpa
 * pesan galat**. Query berhasil, `error` null, `data` kosong. Test yang hanya
 * memeriksa "kunci tak ada" akan HIJAU untuk respons yang seluruhnya kosong —
 * dan itu persis keadaan aplikasi yang rusak.
 *
 * Karena itu skrip ini memeriksa DUA arah pada tiap peran:
 *   1. yang tak berhak TIDAK menerima angka perusahaan
 *   2. yang berhak TETAP menerimanya, dan yang tak berhak TETAP menerima
 *      blok non-uang — kalau nomor 2 gagal, aplikasinya mati, bukan aman
 *
 * Butuh API hidup. Ukur portnya (CLAUDE.md §7) — jangan percaya angka tetap.
 *
 *   cd apps/api && UJI_BASIS=http://127.0.0.1:3021 \
 *     node scripts/uji-dashboard-per-peran.mjs
 */
import 'dotenv/config'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const BASIS = process.env.UJI_BASIS || 'http://127.0.0.1:3007'
const url = process.env.SUPABASE_URL
const publik = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY

if (!publik) {
  console.error('❌ SUPABASE_PUBLISHABLE_KEY kosong — tak bisa login, tak ada yang teruji.')
  process.exit(2)
}

/* Angka tingkat PERUSAHAAN — hanya untuk `finance:view:all`. */
const UANG_PERUSAHAAN = ['total_contract_value', 'invoice_outstanding', 'income_this_month', 'net_cash_estimate']
/* Blok yang HARUS tetap ada untuk semua orang — penjaga arah sebaliknya. */
const WAJIB_ADA = ['active_projects']

const c = new pg.Client({ connectionString: process.env.DIRECT_URL })
await c.connect()

/*
  Akun uji berpola tetap `uji.<peran>@puraloka.test`, dibuat
  `siapkan-akun-uji-peran.mjs`.

  Versi pertama skrip ini mengambil pengguna SUNGGUHAN dari basis, lalu hanya
  bisa login sebagai satu di antaranya — sandi yang lain memang tak kita punya.
  Hasilnya: 1 dari 4 peran teruji, tiga sisanya TERLEWAT, dan ringkasannya
  tetap mencetak ✅.

  Yang terlewat justru peran yang penyaringannya perlu dibuktikan. Uji yang
  melewatkan kasus penting lalu melapor lulus lebih berbahaya daripada uji
  yang merah.
*/
const { rows: kandidat } = await c.query(`
  SELECT r.name AS peran, u.email
    FROM users u
    JOIN roles r ON r.id = u.role_id
   WHERE u.is_active AND u.auth_id IS NOT NULL
     AND u.email LIKE 'uji.%@puraloka.test'
     AND r.name IN ('admin', 'pm', 'direktur', 'mandor', 'client')
   ORDER BY r.name`)

const perPeran = new Map()
for (const k of kandidat) if (!perPeran.has(k.peran)) perPeran.set(k.peran, k.email)

/* Izin tiap peran menurut fungsi yang DIPAKAI GERBANG API. */
const izinPeran = new Map()
for (const peran of perPeran.keys()) {
  const { rows } = await c.query(`SELECT * FROM get_role_permissions($1)`, [peran])
  izinPeran.set(peran, new Set(rows.map((r) => String(Object.values(r)[0]))))
}
await c.end()

console.log('══ Dashboard per-peran, lewat HTTP sungguhan ══════════════════')
console.log('  basis :', BASIS)
console.log('  peran :', [...perPeran.keys()].join(', '), '\n')

if (perPeran.size === 0) {
  console.error('❌ NOL pengguna uji ditemukan — tak ada yang teruji.')
  console.error('   Nol pelanggaran tanpa pengguna BUKAN bukti apa pun.')
  process.exit(2)
}

const sb = createClient(url, publik, { auth: { persistSession: false } })
const masalah = []
let diuji = 0

const SANDI = process.env.UJI_SANDI_PERAN
if (!SANDI) {
  console.error('❌ UJI_SANDI_PERAN kosong — tak ada peran yang bisa diuji.')
  console.error('   Jalankan `siapkan-akun-uji-peran.mjs` lebih dulu.')
  process.exit(2)
}

const terlewat = []

for (const [peran, email] of perPeran) {
  const { data: sesi, error: eLogin } = await sb.auth.signInWithPassword({ email, password: SANDI })
  if (eLogin) {
    masalah.push(`${peran}: login gagal — ${eLogin.message.slice(0, 50)}`)
    continue
  }

  const r = await fetch(`${BASIS}/api/v1/dashboard`, {
    headers: { Authorization: `Bearer ${sesi.session.access_token}` },
  }).catch((e) => ({ ok: false, status: 0, _err: e.message }))

  if (!r.ok) {
    masalah.push(`${peran}: HTTP ${r.status}${r._err ? ' — ' + r._err.slice(0, 40) : ''}`)
    continue
  }
  diuji++

  const b = await r.json()
  const izin = izinPeran.get(peran) ?? new Set()
  const bolehSemua = izin.has('finance:view:all')

  const bocor = UANG_PERUSAHAAN.filter((k) => Object.hasOwn(b.kpis ?? {}, k))
  const hilang = WAJIB_ADA.filter((k) => !Object.hasOwn(b.kpis ?? {}, k))

  if (bolehSemua && bocor.length !== UANG_PERUSAHAAN.length) {
    masalah.push(`${peran} berhak tapi KEHILANGAN ${UANG_PERUSAHAAN.filter((k) => !bocor.includes(k)).join(', ')}`)
  }
  if (!bolehSemua && bocor.length > 0) {
    masalah.push(`${peran} TIDAK berhak tapi menerima ${bocor.join(', ')}`)
  }
  if (hilang.length > 0) {
    masalah.push(`${peran} kehilangan blok non-uang ${hilang.join(', ')} — aplikasi MATI, bukan aman`)
  }

  console.log(
    `  ${bocor.length === (bolehSemua ? UANG_PERUSAHAAN.length : 0) && !hilang.length ? '✓' : '✗'} ` +
      `${peran.padEnd(10)} finance:view:all=${bolehSemua ? 'ya ' : 'tdk'} · ` +
      `uang perusahaan diterima: ${bocor.length}/${UANG_PERUSAHAAN.length}`
  )
}

const DIHARAP = ['admin', 'pm', 'direktur', 'mandor', 'client']
for (const p of DIHARAP) if (!perPeran.has(p)) terlewat.push(p)

console.log('\n  peran benar-benar diuji :', diuji, 'dari', DIHARAP.length)

/*
  Peran yang TERLEWAT membuat hasil ini tak sah — bukan sekadar kurang
  lengkap. Yang tak teruji adalah yang penyaringannya justru perlu
  dibuktikan, dan melaporkan ✅ atas cakupan yang bolong persis kesalahan
  yang melahirkan `siapkan-akun-uji-peran.mjs`.
*/
if (terlewat.length) {
  console.error(`\n❌ ${terlewat.length} peran TAK punya akun uji: ${terlewat.join(', ')}`)
  console.error('   Jalankan: UJI_SANDI_PERAN=… node scripts/siapkan-akun-uji-peran.mjs')
  console.error('   Hasil dengan peran terlewat BUKAN kelulusan.')
  process.exit(2)
}

if (diuji === 0) {
  console.error('\n❌ NOL peran diuji lewat HTTP.')
  process.exit(2)
}

if (masalah.length) {
  console.error(`\n❌ ${masalah.length} masalah:`)
  for (const m of masalah) console.error('     ·', m)
  process.exit(1)
}

console.log('\n✅ Penyaringan bekerja lewat jalur aplikasi sungguhan.')
