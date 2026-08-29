/**
 * Menonaktifkan akun sisa uji isolasi yang terlanjur permanen.
 *
 * ── Kenapa ini bukan sekadar kerapian
 *
 * `anti-lockout-wiring.test.ts` menuntut prasyarat: izin kritikal
 * `users:roles:manage` dipegang TEPAT SATU role yang punya user aktif — itu
 * skenario "pemegang terakhir", satu-satunya keadaan yang membuat uji lockout
 * bermakna.
 *
 * Diukur 2026-08-29: DUA pemegang. Yang kedua `admin @ PT Cek RPC D1b`,
 * berisi satu akun `[UJI-ISOLASI] Admin B` — sisa uji isolasi yang tak pernah
 * dibersihkan. Akibatnya seluruh berkas itu SKIP, dan vitest melaporkannya
 * sebagai "failed" karena nol test lulus.
 *
 * Gejalanya menyesatkan persis seperti yang ditulis di test itu sendiri:
 * berkasnya terlihat "skipped", bukan "prasyarat tak terpenuhi".
 *
 * Akun DINONAKTIFKAN, bukan dihapus: ia mungkin masih dirujuk audit log, dan
 * yang dibutuhkan prasyarat cuma `is_active = false`.
 *
 * Idempoten. Uji-kering secara bawaan; pakai --terapkan untuk menulis.
 */
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const KERING = !process.argv.includes('--terapkan')
const c = buatClient(); await c.connect()

const { rows } = await c.query(
  `SELECT u.id, u.name, u.email FROM users u
    WHERE u.is_active AND (u.email LIKE '%@ujicoba.test' OR u.name LIKE '[UJI-ISOLASI]%')`)

console.log(`akun sisa uji isolasi yang masih AKTIF: ${rows.length}\n`)
for (const r of rows) {
  console.log(`  ${r.email}  ${r.name}`)
  if (KERING) { console.log('     (uji kering — pakai --terapkan)'); continue }
  await c.query(`UPDATE users SET is_active = false WHERE id = $1`, [r.id])
  console.log('     ✅ dinonaktifkan')
}

const { rows: cek } = await c.query(
  `SELECT count(DISTINCT r.id)::int n
     FROM roles r JOIN role_permissions rp ON rp.role_id=r.id
     JOIN permissions p ON p.id=rp.permission_id
    WHERE p.key='users:roles:manage'
      AND EXISTS (SELECT 1 FROM users u WHERE u.role_id=r.id AND u.is_active)`)
console.log(`\npemegang 'users:roles:manage' ber-user aktif: ${cek[0].n} (prasyarat menuntut 1)`)
await c.end()
