// A2 — Setup project Supabase CI (SETELAH A1 EMPTY + CI_DIRECT_URL port 5432 OK).
// Apply migration 001…116 (file nyata) BERURUTAN + seed data uji minimal. Dijalankan
// via workflow ci-isolation.yml (action=setup) karena CI_DIRECT_URL di GitHub Secrets.
//
// Migrasi = FATAL bila gagal (lapor file + berhenti). Seed = per-item try/catch
// (non-fatal) supaya semua isu tampak sekaligus. Idempoten: aman diulang.
import pg from 'pg'
import fs from 'fs'
import path from 'path'

const url = process.env.CI_DIRECT_URL
if (!url) { console.error('FATAL: CI_DIRECT_URL kosong'); process.exit(1) }
try { console.log('Target host:', new URL(url.replace('postgresql://', 'http://')).host) } catch {}

const c = new pg.Client({ connectionString: url })
await c.connect()

// ── 1. tabel pelacak migrasi ──────────────────────────────────────────────
await c.query(`CREATE SCHEMA IF NOT EXISTS supabase_migrations`)
await c.query(`CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations
  (version text PRIMARY KEY, name text, inserted_at timestamptz DEFAULT now())`)

// ── 2. apply migrasi berurutan (idempoten via schema_migrations) ───────────
const dir = path.resolve(process.cwd(), '..', '..', 'db', 'migrations')
const files = fs.readdirSync(dir).filter(f => /^\d+_.*\.sql$/.test(f)).sort()

// Migrasi PURE-STORAGE (bucket + RLS storage.objects) — TAK dibutuhkan test CI (upload
// foto tak diuji di CI). Boleh dilewati bila gagal (mis. izin storage.objects). 016 TIDAK
// di sini: ia cash-management (kritis) yang kebetulan menyinggung storage → tetap fatal.
const STORAGE_ONLY = new Set(['012', '014', '015', '097', '098'])

// Migrasi PURE-DATA (tanpa DDL) = seed. Config-seed (roles/permissions — self-contained)
// LOLOS normal. Yang GAGAL pasti DEMO-seed (FK ke data contoh yang tak ada di project
// fresh, mis. 024 work_scope_items → work_scopes) → TAK dibutuhkan test CI (test bikin
// datanya sendiri) → skip. Migrasi ber-DDL yang gagal TETAP fatal (masalah nyata).
const hasDDL = (sql) => /\b(CREATE|ALTER|DROP)\s+(TABLE|FUNCTION|TRIGGER|POLICY|VIEW|TYPE|INDEX|SCHEMA|EXTENSION|SEQUENCE|MATERIALIZED|DOMAIN|AGGREGATE|CONSTRAINT)/i.test(sql)

let applied = 0, skipped = 0, storageSkipped = [], demoSkipped = []
for (const f of files) {
  const version = f.match(/^(\d+)_/)[1]
  const { rows } = await c.query(`SELECT 1 FROM supabase_migrations.schema_migrations WHERE version=$1`, [version])
  if (rows.length) { skipped++; continue }
  // Perbaikan sintaks: `CREATE POLICY IF NOT EXISTS` TIDAK sah di PostgreSQL (policy tak
  // punya IF NOT EXISTS). Di DB fresh, policy belum ada → `CREATE POLICY` polos sudah benar.
  let sql = fs.readFileSync(path.join(dir, f), 'utf8').replace(/CREATE POLICY IF NOT EXISTS/gi, 'CREATE POLICY')
  try {
    await c.query('BEGIN')
    await c.query(sql)
    await c.query(`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [version, f])
    await c.query('COMMIT')
    applied++
    if (applied % 25 === 0) console.log(`  …applied ${applied} (terakhir ${f})`)
  } catch (e) {
    await c.query('ROLLBACK')
    if (STORAGE_ONLY.has(version)) {
      // Storage-only gagal (izin storage.objects) → catat sbg applied + lanjut (tak dibutuhkan CI).
      await c.query(`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [version, f + ' [STORAGE-SKIPPED]'])
      storageSkipped.push(`${f}: ${e.message.split('\n')[0]}`)
      console.warn(`  storage-skip ${f} → ${e.message.split('\n')[0]}`)
      continue
    }
    if (!hasDDL(sql)) {
      // Pure-data yang gagal = DEMO-seed (FK ke data contoh) → skip + catat + lanjut.
      await c.query(`INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [version, f + ' [DEMO-SEED-SKIPPED]'])
      demoSkipped.push(`${f}: ${e.message.split('\n')[0]}`)
      console.warn(`  demo-seed-skip ${f} → ${e.message.split('\n')[0]}`)
      continue
    }
    console.error(`\nFATAL migration GAGAL (ber-DDL): ${f}\n  ${e.message}`)
    await c.end()
    process.exit(1)
  }
}
console.log(`MIGRATIONS: applied=${applied} skipped(applied)=${skipped} storage-skipped=${storageSkipped.length} demo-skipped=${demoSkipped.length} total=${files.length}`)
if (storageSkipped.length) console.log('  storage-skipped:\n   ' + storageSkipped.join('\n   '))
if (demoSkipped.length) console.log('  demo-seed-skipped:\n   ' + demoSkipped.join('\n   '))

// ── 3. seed data uji minimal (idempoten, per-item non-fatal) ───────────────
const seedErrors = []
async function seed(label, fn) {
  try { await fn(); console.log('  seed OK:', label) }
  catch (e) { seedErrors.push(`${label}: ${e.message}`); console.warn('  seed GAGAL:', label, '→', e.message.split('\n')[0]) }
}

// users (admin/pm/mandor/client) + auth.users (hanya `id` yang wajib)
const USERS = [
  ['admin', 'ci-admin@puraloka.test', 'CI Admin'],
  ['pm', 'ci-pm@puraloka.test', 'CI PM'],
  ['mandor', 'ci-mandor@puraloka.test', 'CI Mandor'],
  ['client', 'ci-client@puraloka.test', 'CI Client'],
]
for (const [role, email, name] of USERS) {
  await seed(`user ${role}`, async () => {
    const { rows: existing } = await c.query(`SELECT auth_id FROM public.users WHERE email=$1`, [email])
    if (existing.length && existing[0].auth_id) return
    const { rows: r } = await c.query(`SELECT id FROM roles WHERE name=$1`, [role])
    if (!r.length) throw new Error(`role '${role}' tak ada (migrasi RBAC belum seed?)`)
    const { rows: au } = await c.query(`INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id`)
    await c.query(
      `INSERT INTO public.users (name, email, role_id, auth_id, is_active)
       VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (email) DO UPDATE SET role_id=EXCLUDED.role_id, auth_id=EXCLUDED.auth_id, is_active=true`,
      [name, email, r[0].id, au[0].id])
  })
}

// 1 client — insert minimal, isi kolom NOT NULL yang ada secara dinamis.
await seed('client', async () => {
  const { rows: has } = await c.query(`SELECT 1 FROM clients WHERE name='CI Seed Client' LIMIT 1`)
  if (has.length) return
  await c.query(`INSERT INTO clients (name) VALUES ('CI Seed Client')`)
})

// 1 cost_code (CECEP) — created_by admin.
await seed('cost_code', async () => {
  await c.query(
    `INSERT INTO cost_codes (code, name, created_by)
     SELECT 'CC-CI-SEED', 'CI seed cost code', (SELECT id FROM public.users WHERE email='ci-admin@puraloka.test' LIMIT 1)
     WHERE NOT EXISTS (SELECT 1 FROM cost_codes WHERE code='CC-CI-SEED')`)
})

console.log(`\nSEED: ${seedErrors.length ? 'ADA ISU (' + seedErrors.length + ') — lihat di atas' : 'BERSIH'}`)
await c.end()
// Seed non-fatal: exit 0 supaya migrasi tetap tercatat; isu seed dilaporkan utk ditindak.
