/**
 * Data dummy nomor WA — supaya keadaan TERISI bisa dinilai.
 *
 * Halaman yang hanya pernah dilihat kosong tak bisa dinilai: perataan baris,
 * kepadatan lencana, dan perilaku kotak kode semuanya baru terlihat saat ada
 * isi. Tiga keadaan disemai sekaligus karena ketiganya tampil berbeda —
 * terverifikasi, menunggu, dan nonaktif.
 *
 * Dibersihkan: DELETE FROM wa_nomor_pengguna WHERE nomor LIKE '62899888%'
 */
import { buatClient } from './_koneksi.mjs'

const db = buatClient()
await db.connect()

const { rows: c } = await db.query(`
  SELECT c.id FROM companies c
  WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1
`)
const companyId = c[0].id

const { rows: u } = await db.query(
  `SELECT user_id FROM company_members WHERE company_id = $1 LIMIT 3`, [companyId])

await db.query(`DELETE FROM wa_nomor_pengguna WHERE nomor LIKE '62899888%'`)

const BARIS = [
  // terverifikasi & aktif
  { nomor: '628998881001', verif: true, aktif: true, gagal: 0 },
  // menunggu verifikasi, sudah dua kali salah — menguji tampilan peringatan
  { nomor: '628998881002', verif: false, aktif: true, gagal: 2 },
  // terverifikasi tapi dinonaktifkan
  { nomor: '628998881003', verif: true, aktif: false, gagal: 0 },
]

for (let i = 0; i < BARIS.length; i++) {
  const b = BARIS[i]
  const userId = u[i % u.length].user_id
  await db.query(
    `INSERT INTO wa_nomor_pengguna
       (company_id, user_id, nomor, terverifikasi_pada, aktif, percobaan_gagal,
        kode_verifikasi, kode_kedaluwarsa)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      companyId, userId, b.nomor,
      b.verif ? new Date().toISOString() : null,
      b.aktif, b.gagal,
      b.verif ? null : '123456',
      b.verif ? null : new Date(Date.now() + 600_000).toISOString(),
    ],
  )
}

const { rows: t } = await db.query(
  `SELECT count(*)::int n FROM wa_nomor_pengguna WHERE nomor LIKE '62899888%'`)
console.log(`✓ ${t[0].n} nomor uji (terverifikasi, menunggu, nonaktif)`)
await db.end()
