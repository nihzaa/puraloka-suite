import { buatClient } from './scripts/db/_koneksi.mjs'
const c = buatClient()
await c.connect()
const r = await c.query(`SELECT key FROM permissions WHERE key IN
 ('assets:view','assets:manage','documents:manage','mandor:scope:manage','mandor:assign','mandor:scope:item','k3:insiden:view','k3:insiden:manage') ORDER BY key`)
console.log('ADA:', r.rows.map(x=>x.key))
await c.end()
