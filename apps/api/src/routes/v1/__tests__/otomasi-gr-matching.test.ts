/**
 * 4.10 — KECOCOKAN PO & PENERIMAAN.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIJAGA DI SINI ADALAH ARAH YANG TAK DIJAGA SIAPA PUN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * OVER-receipt sudah ditolak di dua tempat (`procurement.ts` saat GR dibuat
 * DAN saat dikonfirmasi), dan UI sudah mengisi baris GR otomatis dari PO.
 * Yang TIDAK dijaga apa pun adalah arah sebaliknya — dan semuanya berupa
 * KETIADAAN, yang tak pernah memicu galat:
 *
 *   STATUS BOHONG   PO ber-status `fully_received` padahal qty diterimanya
 *                   belum lengkap. Diukur nyata di basis dev: PO-2026-001
 *                   tertulis "diterima penuh" dengan 0 dari 430 unit.
 *                   Status inilah yang dibaca laporan dan pembayaran
 *                   supplier — bukan qty-nya.
 *
 *   MENGGANTUNG     diterima sebagian lalu dilupakan.
 *
 *   LEWAT TENGGAT   tenggat kirim lewat, nol barang datang.
 *
 * Ketiganya soal uang: barang dibayar tapi tak diterima, atau dianggap
 * diterima padahal tidak.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, companyBerisi } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'
import { KATALOG_TUGAS } from '../jadwal.js'

const PENANDA = '[TEST-4.10]'

let app: FastifyInstance
let db: Client
let projectId: string
let supplierId: string
let userId: string
let materialId: string

const panggil = (q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/gr-matching${q}`,
    headers: { authorization: 'Bearer t' },
  })

async function bersihkan() {
  await db.query(
    `DELETE FROM notifications WHERE type = 'gr_tak_cocok'
       AND action_data->>'record_id' IN
         (SELECT id::text FROM purchase_orders WHERE notes = $1)`, [PENANDA])
  await db.query(
    `DELETE FROM purchase_order_items WHERE po_id IN
       (SELECT id FROM purchase_orders WHERE notes = $1)`, [PENANDA])
  await db.query(`DELETE FROM purchase_orders WHERE notes = $1`, [PENANDA])
}

/** Buat PO uji + satu itemnya. Kembalikan id PO-nya. */
async function buatPo(
  nomor: string, status: string, tenggatHariLalu: number,
  qtyPesan: number, qtyTerima: number,
): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO purchase_orders
       (po_number, project_id, supplier_id, created_by, status,
        order_date, expected_delivery_date, total_amount, notes)
     VALUES ($1,$2,$3,$4,$5, CURRENT_DATE - 30,
             CURRENT_DATE - $6::int, 1000000, $7)
     RETURNING id`,
    [nomor, projectId, supplierId, userId, status, tenggatHariLalu, PENANDA],
  )
  const poId = rows[0].id
  await db.query(
    `INSERT INTO purchase_order_items
       (po_id, material_id, qty_ordered, qty_received, unit, unit_price)
     VALUES ($1,$2,$3,$4,'unit',1000)`,
    [poId, materialId, qtyPesan, qtyTerima],
  )
  return poId
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  /*
    ══════════════════════════════════════════════════════════════════════════
    SEMUA BAHAN DARI SATU COMPANY — company milik akun uji
    ══════════════════════════════════════════════════════════════════════════

    Versi sebelumnya memakai empat `LIMIT 1` TANPA `ORDER BY` dan TANPA
    saringan company. Basis ini punya 1.328 company (diukur 2026-08-27; hanya
    satu yang nyata, sisanya sisa test), jadi proyek, pemasok, material, dan
    pengguna bisa datang dari EMPAT company berbeda sekaligus.

    Akibatnya bukan galat FK — ketiga tabel itu memang tak saling menuntut —
    melainkan rute yang menyaring per-company tak pernah melihat baris yang
    baru dibuat, lalu memulangkan nol tanpa satu pun galat. Test merah dengan
    pesan yang menuduh LOGIKA deteksinya.

    `companyBerisi()` (harness, 2026-08-16) memilih company yang benar-benar
    dimiliki akun uji DAN punya bahannya, dengan urutan stabil.
  */
  const companyId = await companyBerisi(db, auth, ['projects', 'suppliers', 'materials'])

  const p = await db.query(
    `SELECT id FROM projects
      WHERE is_deleted = false AND company_id = $1
      ORDER BY created_at, id LIMIT 1`, [companyId])
  if (!p.rows[0]) throw new Error('company akun uji tak punya proyek')
  projectId = p.rows[0].id

  const s = await db.query(
    `SELECT id FROM suppliers WHERE company_id = $1 ORDER BY created_at, id LIMIT 1`,
    [companyId])
  if (!s.rows[0]) throw new Error('company akun uji tak punya supplier')
  supplierId = s.rows[0].id

  const m = await db.query(
    `SELECT id FROM materials WHERE company_id = $1 ORDER BY created_at, id LIMIT 1`,
    [companyId])
  if (!m.rows[0]) throw new Error('company akun uji tak punya material')
  materialId = m.rows[0].id

  /*
    Pengguna diambil dari KEANGGOTAAN company itu, bukan `users` mentah —
    `users` tak punya `company_id`, keanggotaannya ada di `company_members`.
  */
  const u = await db.query(
    `SELECT u.id FROM users u
       JOIN company_members cm ON cm.user_id = u.id
      WHERE cm.company_id = $1 AND cm.is_active = true
      ORDER BY u.created_at, u.id LIMIT 1`, [companyId])
  if (!u.rows[0]) throw new Error('company akun uji tak punya anggota aktif')
  userId = u.rows[0].id

  await bersihkan()

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  await app.close()
  await db.end()
})

describe('STATUS BOHONG — paling gawat', () => {
  it('fully_received dengan qty belum lengkap TERDETEKSI', async () => {
    // Status inilah yang dibaca laporan dan pembayaran supplier. Kalau ia
    // berbohong, uang keluar untuk barang yang tak pernah datang.
    const poId = await buatPo(`${PENANDA}-A`, 'fully_received', 1, 100, 0)

    const r = await panggil()
    expect(r.statusCode).toBe(200)
    expect(r.json().checked.status_bohong).toBeGreaterThanOrEqual(1)

    const n = await db.query(
      `SELECT priority, action_data->>'jenis' AS jenis FROM notifications
        WHERE type = 'gr_tak_cocok' AND action_data->>'record_id' = $1`, [poId])
    expect(n.rows.length).toBeGreaterThanOrEqual(1)
    expect(n.rows[0].jenis).toBe('status_bohong')
    // `urgent`, bukan `high`: ia sudah masuk laporan.
    expect(n.rows[0].priority).toBe('urgent')
  }, 120_000)

  it('fully_received yang qty-nya MEMANG lengkap tidak diganggu', async () => {
    const poId = await buatPo(`${PENANDA}-B`, 'fully_received', 1, 50, 50)
    await panggil()
    const n = await db.query(
      `SELECT count(*)::int AS n FROM notifications
        WHERE type = 'gr_tak_cocok' AND action_data->>'record_id' = $1`, [poId])
    expect(n.rows[0].n).toBe(0)
  }, 120_000)
})

describe('MENGGANTUNG & LEWAT TENGGAT', () => {
  it('diterima sebagian + tenggat lewat: terdeteksi', async () => {
    const poId = await buatPo(`${PENANDA}-C`, 'confirmed', 30, 100, 40)
    const r = await panggil('?hari=7')
    expect(r.json().checked.menggantung).toBeGreaterThanOrEqual(1)

    const n = await db.query(
      `SELECT action_data->>'jenis' AS jenis FROM notifications
        WHERE type = 'gr_tak_cocok' AND action_data->>'record_id' = $1`, [poId])
    expect(n.rows[0]?.jenis).toBe('menggantung')
  }, 120_000)

  it('nol diterima + tenggat lewat: terdeteksi sebagai lewat_tenggat', async () => {
    const poId = await buatPo(`${PENANDA}-D`, 'sent', 30, 20, 0)
    await panggil('?hari=7')
    const n = await db.query(
      `SELECT action_data->>'jenis' AS jenis FROM notifications
        WHERE type = 'gr_tak_cocok' AND action_data->>'record_id' = $1`, [poId])
    expect(n.rows[0]?.jenis).toBe('lewat_tenggat')
  }, 120_000)

  it('tenggat BELUM lewat tidak diganggu — bukan kebisingan', async () => {
    // Tenggatnya baru kemarin, ambang 7 hari. PO yang wajar sedang berjalan
    // tak boleh diperingatkan; kalau ia ikut, tiap PO baru jadi kebisingan.
    const poId = await buatPo(`${PENANDA}-E`, 'sent', 1, 20, 0)
    await panggil('?hari=7')
    const n = await db.query(
      `SELECT count(*)::int AS n FROM notifications
        WHERE type = 'gr_tak_cocok' AND action_data->>'record_id' = $1`, [poId])
    expect(n.rows[0].n).toBe(0)
  }, 120_000)
})

describe('dedup & bentuk', () => {
  it('panggilan kedua tak menambah notifikasi', async () => {
    await panggil()
    const sebelum = await db.query(
      `SELECT count(*)::int AS n FROM notifications WHERE type = 'gr_tak_cocok'`)
    await panggil()
    const sesudah = await db.query(
      `SELECT count(*)::int AS n FROM notifications WHERE type = 'gr_tak_cocok'`)
    expect(sesudah.rows[0].n).toBe(sebelum.rows[0].n)
  }, 120_000)

  it('SATU PO menghasilkan SATU peringatan, bukan tiga', async () => {
    // PO bisa memenuhi lebih dari satu kelas sekaligus. Mengirim tiga
    // notifikasi untuk satu PO membuat orang berhenti membaca ketiganya.
    const poId = await buatPo(`${PENANDA}-F`, 'fully_received', 30, 100, 10)
    await panggil('?hari=7')
    const n = await db.query(
      `SELECT count(DISTINCT action_data->>'jenis')::int AS jenis FROM notifications
        WHERE type = 'gr_tak_cocok' AND action_data->>'record_id' = $1`, [poId])
    expect(n.rows[0].jenis).toBeLessThanOrEqual(1)
  }, 120_000)

  it('terdaftar di KATALOG_TUGAS & bentuk jawabannya utuh', async () => {
    expect(KATALOG_TUGAS['gr-matching']).toBeDefined()
    expect(KATALOG_TUGAS['gr-matching'].jalur)
      .toBe('/api/v1/otomasi/jalankan/gr-matching')

    const j = (await panggil()).json()
    expect(j.success).toBe(true)
    expect(typeof j.checked.po_diperiksa).toBe('number')
    expect(typeof j.checked.status_bohong).toBe('number')
    expect(typeof j.checked.menggantung).toBe('number')
    expect(typeof j.checked.lewat_tenggat).toBe('number')
  }, 120_000)

  it('tanpa token ditolak', async () => {
    const r = await app.inject({
      method: 'GET', url: '/api/v1/otomasi/jalankan/gr-matching' })
    expect(r.statusCode).toBeGreaterThanOrEqual(400)
  })
})
