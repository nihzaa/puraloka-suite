#!/usr/bin/env node
// ============================================================================
// PENJAGA — RLS policy tak boleh mengotorisasi dari LITERAL NAMA PERAN.
//
// ══════════════════════════════════════════════════════════════════════════
// ADR-004 RULE #2, YANG SELAMA INI TAK DIJAGA APA PUN
// ══════════════════════════════════════════════════════════════════════════
//
// ADR-004 punya DUA aturan wajib tentang literal peran:
//
//   Rule #1 — kode aplikasi. Dijaga `audit-literal-peran.mjs`, kini lantai 0.
//   Rule #2 — RLS policy.    TIDAK DIJAGA SIAPA PUN sampai hari ini.
//
// Rule #2 berbunyi: *"RLS policy MUST NOT mengotorisasi berdasarkan literal
// nama role. Dilarang `auth_role() = 'admin'`, `role IN ('admin','pm')`.
// Policy MUST memanggil fungsi permission."*
//
// Diukur 2026-08-04: **68 dari 381 policy** melanggarnya, tersebar di 27
// tabel. 146 policy lain sudah memakai `has_permission()` — jadi jalannya
// sudah ada dan terbukti, tinggal sisanya.
//
// ── Kenapa RATCHET, bukan tuntutan nol sekarang
//
// ADR-004 sendiri menempatkan migrasi ini di **Epic 4**, bukan Epic 3:
// mengubah 68 policy sekaligus berarti 68 kesempatan mematikan tabel
// (T1-F3, migrasi 131), dan tiap policy butuh permission key yang mungkin
// belum ada.
//
// Yang MENDESAK adalah menghentikan pertumbuhannya. Tanpa penjaga, tiap
// migrasi baru bebas menambah `auth_role() = 'admin'` — dan utangnya tumbuh
// lebih cepat daripada pelunasannya.
//
// ⚠️ Kenapa bentuk regex-nya berliku
//
// Postgres menormalkan `auth_role() = 'admin'` jadi
// `( SELECT auth_role() AS auth_role) = 'admin'::text`. Percobaan pertama
// saya mencari bentuk mentahnya dan melaporkan **0 pelanggaran** — hijau
// palsu, padahal ada 68. Pola di bawah menerima bentuk ternormalkan.
//
// ⚠️ `auth.role()` (dengan titik) BUKAN pelanggaran: itu peran Postgres
// (`anon`/`authenticated`/`service_role`), bukan peran bisnis. Menyamakan
// keduanya akan menuduh 100+ policy yang justru benar.
// ============================================================================

import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(API_ROOT, '..', '..')
const LANTAI = resolve(API_ROOT, 'scripts', 'rls-literal-peran-lantai.json')

const req = createRequire(resolve(API_ROOT, 'package.json'))
let pg
try { pg = req('pg') } catch {
  console.log('⏭  DILEWATI — paket pg tak terpasang.'); process.exit(0)
}

let url = process.env.DIRECT_URL || process.env.DATABASE_URL
const envPath = resolve(API_ROOT, '.env')
if (!url && existsSync(envPath)) {
  for (const b of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = b.replace(/^﻿/, '').match(/^\s*(DIRECT_URL|DATABASE_URL)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if (/^["'].*["']$/.test(v)) v = v.slice(1, -1)
    if (m[1] === 'DIRECT_URL' || !url) url = v
  }
}
if (!url) {
  console.log('⏭  DILEWATI — DIRECT_URL tak ditemukan.')
  console.log('   Penjaga ini butuh DB; ia TIDAK menyatakan hijau tanpa memeriksa.')
  process.exit(0)
}

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
try { await c.connect() } catch (e) {
  console.log('⏭  DILEWATI — DB tak terjangkau: ' + String(e.message).slice(0, 60))
  process.exit(0)
}

const { rows } = await c.query(`
  SELECT tablename, policyname, COALESCE(qual, '') || ' ' || COALESCE(with_check, '') AS ekspr
    FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname`)
await c.end()

// `auth_role()` (peran BISNIS) dibandingkan dengan literal nama peran.
// Menerima bentuk ternormalkan Postgres: ( SELECT auth_role() AS auth_role).
const PELANGGARAN = /auth_role\(\)[\s\S]{0,40}?(=|ANY)[\s\S]{0,20}?'(admin|pm|mandor|client)'/

const temuan = rows.filter((r) => PELANGGARAN.test(r.ekspr))
const berpermission = rows.filter((r) => /has_permission/.test(r.ekspr)).length

if (process.argv.includes('--daftar')) {
  const per = {}
  for (const t of temuan) (per[t.tablename] ??= []).push(t.policyname)
  for (const [t, p] of Object.entries(per).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${String(p.length).padStart(3)}  ${t}`)
    for (const x of p) console.log(`       ${x}`)
  }
  console.log(`\n  ${temuan.length} policy di ${Object.keys(per).length} tabel`)
  process.exit(0)
}

console.log('══ PENJAGA RLS literal peran (ADR-004 Rule #2) ' + '═'.repeat(22))
console.log(`  policy total            : ${rows.length}`)
console.log(`  memakai literal peran   : ${temuan.length}`)
console.log(`  sudah has_permission()  : ${berpermission}`)

if (!existsSync(LANTAI)) {
  writeFileSync(LANTAI, JSON.stringify({
    _catatan: 'Lantai RLS literal peran (ADR-004 Rule #2). Boleh TURUN, tak boleh NAIK.',
    _utang: 'Migrasi ke has_permission() dijadwalkan Epic 4 (ADR-004). F3-1 memasang penjaganya supaya utang berhenti tumbuh.',
    maks: temuan.length,
  }, null, 2) + '\n')
  console.log(`  lantai awal ditulis     : ${temuan.length}`)
  process.exit(0)
}

const lantai = JSON.parse(readFileSync(LANTAI, 'utf8'))
console.log(`  lantai (maks)           : ${lantai.maks}`)

if (temuan.length > lantai.maks) {
  console.error(`
❌ RLS literal peran BERTAMBAH: ${lantai.maks} → ${temuan.length}

   ADR-004 Rule #2: policy WAJIB memanggil fungsi permission, bukan
   membandingkan nama peran. Peran adalah data konfigurasi per-tenant —
   pelanggan yang membuat peran "Direktur Keuangan" tak akan pernah cocok
   dengan policy yang mencari 'admin'.

   Jalannya sudah ada dan terbukti: ${berpermission} policy lain sudah memakai
   has_permission(). Ikuti pola itu.

   Lihat daftarnya: node scripts/audit-rls-literal-peran.mjs --daftar`)
  process.exit(1)
}

if (temuan.length < lantai.maks) {
  console.log(`\n  ⬇️  TURUN ${lantai.maks - temuan.length} — kencangkan lantai:`)
  console.log('     node scripts/audit-rls-literal-peran.mjs --naikkan')
  if (process.argv.includes('--naikkan')) {
    lantai.maks = temuan.length
    writeFileSync(LANTAI, JSON.stringify(lantai, null, 2) + '\n')
    console.log(`     lantai DISETEL ke ${temuan.length}.`)
  }
  process.exit(0)
}

console.log('\n  ✅ tidak bertambah.')
