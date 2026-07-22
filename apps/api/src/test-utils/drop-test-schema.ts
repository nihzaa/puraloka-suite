// Cleanup: drop schema test per-run (dipanggil CI dengan if: always()) agar
// schema unik test_<run_id> tidak menumpuk di Supabase dev. Aman: hanya drop
// schema yang cocok pola test-schema (bukan public), divalidasi ketat.
import { Client } from 'pg'

const raw = process.env.TEST_SCHEMA ?? 'test'
if (!/^[a-z][a-z0-9_]*$/.test(raw) || raw === 'public') {
  throw new Error(`TEST_SCHEMA tidak valid untuk drop: "${raw}"`)
}

const url = process.env.DIRECT_URL
if (!url) {
  console.error('DIRECT_URL tidak ada — skip drop schema')
  process.exit(0)
}

const client = new Client({ connectionString: url })
await client.connect()
try {
  await client.query(`DROP SCHEMA IF EXISTS ${raw} CASCADE`)
  console.log(`Dropped test schema: ${raw}`)
} finally {
  await client.end()
}
