// A1 — Inventaris READ-ONLY project Supabase CI (puraloka-suite-ci).
// Project ini BEKAS project lama yang di-rename. WAJIB dipastikan kosong sebelum
// apply migration. HANYA SELECT — tak menyentuh apa pun. Dijalankan via workflow
// ci-isolation.yml (action=inventory) karena CI_DIRECT_URL hidup di GitHub Secrets.
import pg from 'pg'

const url = process.env.CI_DIRECT_URL
if (!url) { console.error('FATAL: CI_DIRECT_URL kosong'); process.exit(1) }
// Jangan bocorkan kredensial; tampilkan host saja.
try { console.log('Target host:', new URL(url.replace('postgresql://', 'http://')).host) } catch {}

const c = new pg.Client({ connectionString: url })
await c.connect()
try {
  const { rows: sch } = await c.query(
    `SELECT schema_name FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
      ORDER BY 1`)
  console.log('SCHEMAS:', sch.map(r => r.schema_name).join(', '))

  const { rows: tbls } = await c.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`)
  console.log(`\nPUBLIC base tables: ${tbls.length}`)
  let totalRows = 0
  for (const t of tbls) {
    const { rows } = await c.query(`SELECT count(*)::int n FROM public."${t.table_name}"`)
    totalRows += rows[0].n
    if (rows[0].n > 0) console.log(`  ${t.table_name}: ${rows[0].n} rows`)
  }

  const scalar = async (q) => { try { return (await c.query(q)).rows[0].n } catch { return 'n/a' } }
  const authUsers = await scalar(`SELECT count(*)::int n FROM auth.users`)
  const migs = await scalar(`SELECT count(*)::int n FROM supabase_migrations.schema_migrations`)

  console.log(`\nSUMMARY: public_tables=${tbls.length} public_rows=${totalRows} auth.users=${authUsers} migrations=${migs}`)
  // Fresh Supabase: public KOSONG (0 base table). Sisa project lama = ada tabel di public.
  if (tbls.length === 0 && (authUsers === 0 || authUsers === 'n/a')) {
    console.log('VERDICT: EMPTY — aman lanjut setup (migration + seed).')
  } else {
    console.log('VERDICT: NOT-EMPTY — ADA sisa. BERHENTI, lapor founder, JANGAN reset/timpa.')
    process.exitCode = 2 // nonzero → job merah → sinyal jelas "tidak kosong"
  }
} finally {
  await c.end()
}
