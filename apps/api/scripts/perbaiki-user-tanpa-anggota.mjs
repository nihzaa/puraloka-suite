/**
 * Memberi keanggotaan kepada pengguna aktif yang TAK PUNYA satu pun.
 *
 * Mereka ada di basis tapi tak terlihat siapa pun (auth_company_id() NULL →
 * tenant_isolation menyaring habis), sementara emailnya tetap memblokir
 * pendaftaran ulang.
 *
 * Sumbernya sudah ditutup di rute register; ini membersihkan yang telanjur.
 * Idempoten: menjalankan dua kali tak menambah baris.
 */
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const KERING = !process.argv.includes('--terapkan')
const c = buatClient(); await c.connect()

const { rows } = await c.query(
  `SELECT u.id, u.name, u.email, u.role_id, r.name AS role, r.company_id AS role_company
     FROM users u LEFT JOIN roles r ON r.id = u.role_id
    WHERE u.is_active
      AND NOT EXISTS (SELECT 1 FROM company_members m WHERE m.user_id = u.id)
    ORDER BY u.created_at`)

console.log(`pengguna aktif tanpa keanggotaan: ${rows.length}\n`)
for (const r of rows) {
  const tujuan = r.role_company
  console.log(`  ${r.email}`)
  console.log(`     role=${r.role ?? '(tak ada)'} company dari role=${tujuan ?? '(template/global)'}`)
  if (!tujuan) { console.log('     ⏭  DILEWATI: rolenya template global, perusahaannya tak bisa disimpulkan'); continue }
  if (!r.role_id) { console.log('     ⏭  DILEWATI: tak punya role_id'); continue }
  if (KERING) { console.log('     (uji kering — pakai --terapkan untuk menulis)'); continue }
  const { rowCount } = await c.query(
    `INSERT INTO company_members (company_id, user_id, role_id, is_default, is_active)
     VALUES ($1,$2,$3,true,true)
     ON CONFLICT DO NOTHING`, [tujuan, r.id, r.role_id])
  console.log(`     ${rowCount ? '✅ keanggotaan dibuat' : '(sudah ada)'}`)
}
await c.end()
