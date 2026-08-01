#!/usr/bin/env node
/**
 * PENJAGA KOLOM `.select()` — kolom yang tak ada di skema.
 *
 * ── Kenapa ada
 *
 * 2026-08-01, satu hari, ENAM bug dari kelas yang sama persis:
 *
 *   kurva-s.ts   `project_expenses.amount`      → `total_amount`   Rp 631,7 jt
 *   kurva-s.ts   `daily_wage_logs.total_wage`   → `total_amount`
 *   kurva-s.ts   `progress_payments.amount`     → `net_payment`
 *   kurva-s.ts   `borongan_settlements.…`       → `remaining_balance`
 *   search.ts    `clients.name`                 → `company_name`
 *   projects.ts  `expense_category_templates.description` — tak ada sama sekali
 *
 * Totalnya **Rp 755,7 juta tak pernah masuk AC**, pencarian klien selalu nol
 * hasil, dan `project_expense_categories` berisi NOL baris karena auto-clone
 * tak pernah berhasil. Tak satu pun berbunyi.
 *
 * Mekanismenya selalu sama: PostgREST membalas `column … does not exist` di
 * field `error`, `data` jadi `null`, lalu `?? []` mengubahnya jadi daftar
 * kosong yang terlihat sah. TypeScript tak bisa menangkapnya — nama kolom
 * adalah STRING.
 *
 * ── Hubungannya dengan `audit-kegagalan-senyap.mjs`
 *
 * Yang itu menjaga GEJALA (`error` tak diperiksa). Yang ini menjaga PENYEBAB
 * (nama kolomnya memang salah). Keduanya perlu: memeriksa `error` tak membuat
 * kolomnya benar, dan kolom yang benar hari ini bisa di-rename besok.
 *
 * ── Kenapa butuh DB
 *
 * Skema adalah wasitnya. Tanpa koneksi, penjaga ini melewati diri sendiri
 * (exit 0) alih-alih menebak — CI punya `CI_DIRECT_URL`, lokal punya
 * `DIRECT_URL`, dan di tempat yang tak punya keduanya lebih baik diam daripada
 * memberi laporan palsu.
 *
 * Jalankan: node apps/api/scripts/audit-kolom-select.mjs
 */
import 'dotenv/config'
import pg from 'pg'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const url = process.env.CI_DIRECT_URL || process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) {
  console.log('⏭️  Nol koneksi DB — penjaga kolom dilewati (skema adalah wasitnya).')
  process.exit(0)
}

/**
 * Ambang. HANYA BOLEH TURUN.
 *
 * Sisanya adalah FALSE POSITIVE yang sudah ditelusuri satu per satu: pola
 * `.from('a') … .from('b').select(...)` dalam satu `Promise.all` membuat regex
 * memasangkan `select` ke `from` yang salah. Memperbaiki regexnya butuh parser
 * TS penuh; sementara itu ambang menahan agar yang NYATA tak bertambah.
 */
const AMBANG = 6

const AKAR = join(import.meta.dirname, '..', 'src', 'routes', 'v1')

function berkasRute(dir) {
  const h = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== '__tests__') h.push(...berkasRute(join(dir, e.name))) }
    else if (e.name.endsWith('.ts')) h.push(join(dir, e.name))
  }
  return h
}

const c = new pg.Client({ connectionString: url })
await c.connect()
const kol = new Map()
for (const r of (await c.query(
  `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`
)).rows) {
  if (!kol.has(r.table_name)) kol.set(r.table_name, new Set())
  kol.get(r.table_name).add(r.column_name)
}
await c.end()

const temuan = []
for (const f of berkasRute(AKAR)) {
  const isi = readFileSync(f, 'utf8')
  for (const m of isi.matchAll(/\.from\('(\w+)'\)[\s\S]{0,220}?\.select\('([^']+)'/g)) {
    const [, tabel, daftar] = m
    const set = kol.get(tabel)
    if (!set) continue   // tabel tak dikenal (view/rpc) — bukan urusan penjaga ini
    // Buang embed `rel(...)` dan alias `x:y` — keduanya bukan nama kolom polos.
    const bersih = daftar.replace(/\w+\s*\([^)]*\)/g, '').replace(/\*/g, '')
    for (const raw of bersih.split(',')) {
      const nama = raw.trim().split(':').pop().trim()
      if (!nama || !/^\w+$/.test(nama)) continue
      if (!set.has(nama)) {
        temuan.push({
          berkas: f.split(/[\\/]/).pop(),
          baris: isi.slice(0, m.index).split('\n').length,
          ref: `${tabel}.${nama}`,
        })
      }
    }
  }
}

console.log(`Kolom .select() yang tak ada di skema: ${temuan.length} (ambang ${AMBANG})`)
for (const t of temuan) console.log(`   ${t.berkas}:${t.baris}  ${t.ref}`)

if (temuan.length > AMBANG) {
  console.error(`\n❌ RATCHET GAGAL: ${temuan.length} > ambang ${AMBANG}\n`)
  console.error(
    '   Query dengan kolom yang tak ada SELALU gagal, dan `?? []` mengubah\n' +
    '   kegagalan itu jadi daftar kosong yang terlihat sah. Enam bug dari kelas\n' +
    '   ini ditemukan dalam satu hari (2026-08-01) — salah satunya menyembunyikan\n' +
    '   Rp 755,7 juta dari AC kurva-S selama berbulan-bulan.\n\n' +
    '   Perbaiki nama kolomnya (cek `information_schema`), JANGAN naikkan ambang.\n',
  )
  process.exit(1)
}

console.log(`\n✅ Kolom .select(): ${temuan.length}/${AMBANG} — tidak bertambah.`)
