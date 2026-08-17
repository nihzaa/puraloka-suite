import { buatClient } from './scripts/db/_koneksi.mjs'
const c = buatClient()
await c.connect()
const cols = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='menu_items' ORDER BY ordinal_position`)
console.log('=== KOLOM menu_items ==='); console.table(cols.rows)
const r = await c.query(`SELECT * FROM menu_items WHERE key IN ('aset-perawatan','kontrak-subkon','kontrak-surat','k3-insiden') ORDER BY key`)
console.log('=== BARIS ==='); console.log(JSON.stringify(r.rows, null, 2))
await c.end()
