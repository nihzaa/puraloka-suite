// Keep-alive project Supabase CI — cegah auto-pause (free project pause ~7 hari nganggur).
// SELECT 1 saja; selalu exit 0 (tak boleh kirim email gagal harian).
import pg from 'pg'
const url = process.env.CI_DIRECT_URL
if (!url) { console.error('CI_DIRECT_URL kosong'); process.exit(0) }
try {
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  await c.query('SELECT 1')
  await c.end()
  console.log('CI project alive (ping OK)')
} catch (e) {
  console.warn('keep-alive ping gagal (tak fatal):', e.message)
}
process.exit(0)
