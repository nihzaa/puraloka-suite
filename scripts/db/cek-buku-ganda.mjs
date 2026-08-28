import { buatClient } from './_koneksi.mjs'
const c = buatClient()
await c.connect()
const { rows } = await c.query(
  `SELECT version, name FROM supabase_migrations.schema_migrations
    WHERE version IN ('427','431','461','462','463','464','465','466','467','468','469','470')
    ORDER BY version`
)
for (const r of rows) console.log(`${r.version}  ${r.name}`)
console.log(`\n${rows.length} dari 12 nomor ganda tercatat di buku`)
await c.end()
