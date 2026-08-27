#!/usr/bin/env node
// ============================================================
// SCHEMA FINGERPRINT — bukti definitif "migrasi = dev" (4a).
//
// Menghasilkan sidik-jari KANONIK skema `public` sebuah database:
// tables, columns, constraints, indexes, functions, triggers, RLS policies.
// Semua diurutkan deterministik → dua database dengan skema identik
// menghasilkan JSON byte-identik.
//
// PEMAKAIAN:
//   node schema-fingerprint.mjs emit                 → cetak JSON sidik-jari FP_URL
//   node schema-fingerprint.mjs compare <baseline>   → diff FP_URL vs file baseline; cetak drift
//
// SUMBER KONEKSI: env FP_URL. Bila kosong, muat DIRECT_URL dari apps/api/.env.
//
// LINGKUP: HANYA schema `public`. Schema `storage`/`auth` sengaja di luar
// lingkup — migrasi storage (012/014/015/097/098) memang di-allowlist SKIP di
// CI (spesifik-environment), jadi membandingkannya = false-positive. Ledger
// `supabase_migrations.schema_migrations` (label versi) juga di luar lingkup:
// drift penomoran di sana sudah diketahui & dilaporkan terpisah.
// ============================================================
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadUrl() {
  if (process.env.FP_URL) return process.env.FP_URL
  // fallback: DIRECT_URL dari apps/api/.env
  try {
    const envPath = resolve(__dirname, '..', '.env')
    const txt = readFileSync(envPath, 'utf8')
    const m = txt.match(/^DIRECT_URL\s*=\s*(.+)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  } catch { /* ignore */ }
  throw new Error('FP_URL tidak di-set dan DIRECT_URL tak ditemukan di apps/api/.env')
}

const Q = {
  columns: `
    SELECT c.table_name, c.column_name, c.ordinal_position, c.data_type, c.udt_name,
           c.is_nullable, c.column_default,
           c.character_maximum_length, c.numeric_precision, c.numeric_scale
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position`,
  constraints: `
    SELECT rel.relname AS table_name, con.conname, con.contype,
           pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
    ORDER BY rel.relname, con.contype, pg_get_constraintdef(con.oid)`,
  indexes: `
    SELECT tablename, indexname, indexdef
    FROM pg_indexes WHERE schemaname = 'public'
    ORDER BY tablename, indexdef`,
  /*
    ⚠ `prokind = 'f'` WAJIB — dan ketiadaannya membuat penjaga ini MATI TOTAL.

    `pg_get_functiondef()` MELEMPAR untuk agregat, window function, dan
    prosedur; itu perilaku Postgres yang terdokumentasi, bukan gangguan.
    Basis ini punya empat agregat di skema `public` (`avg` dan `sum`
    masing-masing dua, untuk tipe kustom dari ekstensi), jadi query lama
    gagal seluruhnya dengan:

        FATAL: "avg" is an aggregate function

    Bukan sebagian hasil yang hilang — SATU baris agregat menggagalkan
    SELURUH query, sehingga sidik jari skema tak pernah terbentuk dan
    penjaganya merah tiap kali jalan tanpa pernah membandingkan apa pun.

    Agregat sengaja TIDAK diambil definisinya: ia ditentukan lewat
    `CREATE AGGREGATE` (fungsi state + fungsi final), bukan badan yang bisa
    dibandingkan sebagai teks. Yang dicatat cukup keberadaan & tanda
    tangannya — itulah yang berubah kalau ada agregat ditambah/dibuang.
  */
  functions: `
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.prokind = 'f'
    ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)`,
  aggregates: `
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.prokind AS def
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.prokind <> 'f'
    ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)`,
  triggers: `
    SELECT rel.relname AS table_name, t.tgname, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    JOIN pg_class rel ON rel.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public' AND NOT t.tgisinternal
    ORDER BY rel.relname, t.tgname`,
  rls_tables: `
    SELECT rel.relname AS table_name, rel.relrowsecurity, rel.relforcerowsecurity
    FROM pg_class rel
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public' AND rel.relkind = 'r'
    ORDER BY rel.relname`,
  policies: `
    SELECT rel.relname AS table_name, pol.polname,
           CASE pol.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS cmd,
           pg_get_expr(pol.polqual, pol.polrelid) AS qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS withcheck
    FROM pg_policy pol
    JOIN pg_class rel ON rel.oid = pol.polrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
    ORDER BY rel.relname, pol.polname`,
}

// Normalisasi whitespace pada definisi fungsi/trigger (beda formatting bukan drift semantik)
const norm = (s) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim())

async function introspect(url) {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    const out = {}
    const cols = (await client.query(Q.columns)).rows.map((r) => ({
      key: `${r.table_name}.${r.column_name}`,
      type: r.data_type, udt: r.udt_name, nullable: r.is_nullable,
      default: norm(r.column_default), len: r.character_maximum_length,
      prec: r.numeric_precision, scale: r.numeric_scale,
    }))
    out.tables = [...new Set(cols.map((c) => c.key.split('.')[0]))].sort()
    out.columns = cols
    out.constraints = (await client.query(Q.constraints)).rows.map((r) => ({
      key: `${r.table_name}:${r.contype}`, def: norm(r.def),
    }))
    out.indexes = (await client.query(Q.indexes)).rows.map((r) => ({
      key: r.tablename, def: norm(r.indexdef),
    }))
    out.functions = (await client.query(Q.functions)).rows.map((r) => ({
      key: `${r.proname}(${r.args})`, def: norm(r.def),
    }))
    out.triggers = (await client.query(Q.triggers)).rows.map((r) => ({
      key: `${r.table_name}.${r.tgname}`, def: norm(r.def),
    }))
    out.rls = (await client.query(Q.rls_tables)).rows.map((r) => ({
      key: r.table_name, on: r.relrowsecurity, force: r.relforcerowsecurity,
    }))
    out.policies = (await client.query(Q.policies)).rows.map((r) => ({
      key: `${r.table_name}.${r.polname}`, cmd: r.cmd,
      qual: norm(r.qual), withcheck: norm(r.withcheck),
    }))
    return out
  } finally {
    await client.end()
  }
}

function diffList(name, a, b) {
  // a=baseline(dev), b=current(ci). Bandingkan per `key` + seluruh isi objek.
  const ser = (x) => JSON.stringify(x)
  const mapA = new Map(a.map((x) => [x.key ?? ser(x), x]))
  const mapB = new Map(b.map((x) => [x.key ?? ser(x), x]))
  const onlyDev = [], onlyCi = [], changed = []
  for (const [k, v] of mapA) {
    if (!mapB.has(k)) onlyDev.push(k)
    else if (ser(v) !== ser(mapB.get(k))) changed.push({ key: k, dev: v, ci: mapB.get(k) })
  }
  for (const k of mapB.keys()) if (!mapA.has(k)) onlyCi.push(k)
  return { name, onlyDev, onlyCi, changed }
}

async function main() {
  const [mode, baselineArg] = process.argv.slice(2)
  const url = loadUrl()

  if (mode === 'emit') {
    const fp = await introspect(url)
    process.stdout.write(JSON.stringify(fp, null, 2) + '\n')
    return
  }

  if (mode === 'compare') {
    if (!baselineArg) throw new Error('compare butuh path baseline JSON')
    const baseline = JSON.parse(readFileSync(resolve(process.cwd(), baselineArg), 'utf8'))
    const current = await introspect(url)
    const cats = ['tables', 'columns', 'constraints', 'indexes', 'functions', 'triggers', 'rls', 'policies']
    let totalDrift = 0
    console.log('=== SCHEMA-DIFF: dev (baseline) vs CI-project (migrasi-applied) — schema `public` ===\n')
    for (const cat of cats) {
      const a = cat === 'tables' ? baseline[cat].map((k) => ({ key: k })) : baseline[cat]
      const b = cat === 'tables' ? current[cat].map((k) => ({ key: k })) : current[cat]
      const d = diffList(cat, a, b)
      const n = d.onlyDev.length + d.onlyCi.length + d.changed.length
      totalDrift += n
      const flag = n === 0 ? '✅' : '⚠️'
      console.log(`${flag} ${cat}: baseline=${a.length} ci=${b.length} drift=${n}`)
      if (d.onlyDev.length) console.log(`   HANYA-DI-DEV (${d.onlyDev.length}): ${d.onlyDev.slice(0, 30).join(', ')}`)
      if (d.onlyCi.length) console.log(`   HANYA-DI-CI  (${d.onlyCi.length}): ${d.onlyCi.slice(0, 30).join(', ')}`)
      for (const c of d.changed.slice(0, 20)) {
        console.log(`   BEDA ${c.key}:`)
        console.log(`      dev: ${JSON.stringify(c.dev)}`)
        console.log(`      ci : ${JSON.stringify(c.ci)}`)
      }
    }
    console.log(`\n=== TOTAL DRIFT public-schema: ${totalDrift} ===`)
    console.log(totalDrift === 0
      ? 'HASIL: skema `public` CI (dari migrasi bersih) IDENTIK dengan dev. Migrasi = dev (structural).'
      : 'HASIL: ada drift — tiap baris di atas adalah temuan yang perlu dijelaskan/diperbaiki.')
    // Informational by default; set FP_STRICT=1 untuk exit-code gating.
    if (process.env.FP_STRICT === '1' && totalDrift > 0) process.exit(3)
    return
  }

  throw new Error(`mode tak dikenal: ${mode} (pakai: emit | compare <baseline>)`)
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1) })
