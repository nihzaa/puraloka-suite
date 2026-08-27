/**
 * 3.5 — STOK MENIPIS.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIUJI, DAN KENAPA BUKAN "MR OTOMATIS TERBUAT"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Katalog menulis "Draft MR otomatis saat stok menyentuh ambang". Yang
 * dibangun MEMPERINGATKAN, bukan membuat MR — alasannya di kepala
 * endpoint-nya, ringkasnya: ambang mengatakan "kurang", tak mengatakan
 * "beli berapa", dan 3.4 (prediksi kebutuhan) bergerbang Phase 6.
 *
 * Jadi yang diuji di sini adalah tiga cara peringatan itu bisa salah:
 *
 *   AMBANG NOL     `min_stock = 0` berarti BELUM DITENTUKAN, bukan "boleh
 *                  habis". Kalau dianggap batas, tiap material berstok nol
 *                  diperingatkan selamanya — dan hari ini 23 dari 24
 *                  material memang berambang nol.
 *
 *   ANGKA IKUT     peringatan tanpa angka memaksa orang membuka layar lain
 *                  untuk menghitung ulang. `action_data` wajib memuat
 *                  sisa/ambang/kurang supaya form MR bisa terisi.
 *
 *   PROYEK MATI    proyek selesai/batal tak perlu dipesankan apa pun.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, companyBerisi } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'
import { KATALOG_TUGAS } from '../jadwal.js'

const PENANDA = '[TEST-3.5]'

let app: FastifyInstance
let db: Client
let projectId: string
let materialId: string
let stokId: string | null = null

const panggil = () =>
  app.inject({
    method: 'GET',
    url: '/api/v1/otomasi/jalankan/stok-menipis',
    headers: { authorization: 'Bearer t' },
  })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  // ⚠ MEMBUAT material + stok SENDIRI, bukan meminjam baris master.
  //
  // Bentuk pertama meminjam `project_stocks` yang sudah ada lalu mengubah
  // `materials.min_stock`-nya. Itu HIJAU saat dijalankan sendiri dan MERAH
  // saat berjalan bersama berkas lain: 284 berkas test berbagi SATU basis,
  // dan mengubah baris master membuat suite lain melihat angka yang tak
  // pernah mereka setel.
  //
  // Barisnya dihapus di `afterAll`, jadi tak ada jejak yang tertinggal.
  /*
    ══════════════════════════════════════════════════════════════════════════
    PROYEK DIPILIH DARI COMPANY AKUN UJI — bukan "ambil satu, mana saja"
    ══════════════════════════════════════════════════════════════════════════

    Versi sebelumnya memakai `LIMIT 1` TANPA `ORDER BY` dan tanpa saringan
    company. Basis ini berisi **1.328 company** (diukur 2026-08-27; hanya SATU
    yang nyata, sisanya sisa test), jadi baris yang terambil sering milik
    company uji ASING.

    Akibatnya rute yang diuji — yang menyaring `.in('project_id',
    projectIds())` menurut company pemanggil — tak pernah melihat stok yang
    baru saja disiapkan di sini. Test merah dengan pesan yang menuduh LOGIKA
    rutenya, padahal rutenya benar dan yang salah pilihan proyeknya.

    `companyBerisi()` sudah ada di harness sejak 2026-08-16, dibangun untuk
    cacat yang persis sama (lihat catatan panjang di `rls-harness.ts`). Ia
    memilih company yang BENAR-BENAR punya bahan yang diminta, dengan urutan
    yang stabil.
  */
  const companyId = await companyBerisi(db, auth, ['projects'])
  const p = await db.query(`
    SELECT id, company_id FROM projects
     WHERE is_deleted = false AND status NOT IN ('cancelled','completed')
       AND company_id = $1
     ORDER BY created_at, id
     LIMIT 1
  `, [companyId])
  if (!p.rows[0]) throw new Error('company akun uji tak punya proyek aktif')
  projectId = p.rows[0].id

  const m = await db.query(
    `INSERT INTO materials (name, unit, min_stock, company_id)
     VALUES ($1, 'unit', 0, $2) RETURNING id`,
    [`${PENANDA} material uji`, p.rows[0].company_id],
  )
  materialId = m.rows[0].id

  const st = await db.query(
    `INSERT INTO project_stocks (project_id, material_id, qty_on_hand)
     VALUES ($1, $2, 0) RETURNING id`,
    [projectId, materialId],
  )
  stokId = st.rows[0].id
  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  // Buatan sendiri → dihapus sendiri. Urutannya penting: stok dulu (FK).
  if (stokId) {
    await db.query(`DELETE FROM notifications WHERE type = 'stok_menipis' AND action_data->>'record_id' = $1`, [stokId])
    await db.query(`DELETE FROM project_stocks WHERE id = $1`, [stokId])
  }
  if (materialId) await db.query(`DELETE FROM materials WHERE id = $1`, [materialId])
  await app.close()
  await db.end()
})

describe('ambang NOL berarti belum ditentukan', () => {
  it('material tanpa ambang TIDAK diperingatkan meski stoknya nol', async () => {
    // 23 dari 24 material di basis berambang nol. Kalau nol dianggap batas,
    // automation ini membanjiri pengadaan sejak denyut pertama.
    await db.query(`UPDATE materials SET min_stock = 0 WHERE id = $1`, [materialId])
    await db.query(`UPDATE project_stocks SET qty_on_hand = 0 WHERE id = $1`, [stokId])

    const r = await panggil()
    expect(r.statusCode).toBe(200)

    const n = await db.query(
      `SELECT count(*)::int AS n FROM notifications
        WHERE type = 'stok_menipis' AND action_data->>'record_id' = $1`, [stokId])
    expect(n.rows[0].n).toBe(0)
    expect(r.json().checked.tanpa_ambang).toBeGreaterThanOrEqual(1)
  }, 120_000)
})

describe('stok di bawah ambang diperingatkan, dengan ANGKANYA', () => {
  it('peringatan terbit dan memuat sisa/ambang/kurang', async () => {
    await db.query(`UPDATE materials SET min_stock = 100 WHERE id = $1`, [materialId])
    await db.query(`UPDATE project_stocks SET qty_on_hand = 30 WHERE id = $1`, [stokId])

    const r = await panggil()
    expect(r.json().checked.menipis).toBeGreaterThanOrEqual(1)

    const n = await db.query(
      `SELECT action_data, priority FROM notifications
        WHERE type = 'stok_menipis' AND action_data->>'record_id' = $1
        ORDER BY sent_at DESC LIMIT 1`, [stokId])
    expect(n.rows.length).toBe(1)

    const d = n.rows[0].action_data
    // Tanpa angka, orang harus membuka layar lain untuk menghitung ulang —
    // dan yang menuntut kerja tambahan tak pernah ditindaklanjuti.
    expect(Number(d.sisa)).toBe(30)
    expect(Number(d.ambang)).toBe(100)
    expect(Number(d.kurang)).toBe(70)
    // Menipis, belum habis → high, bukan urgent.
    expect(n.rows[0].priority).toBe('high')
  }, 120_000)

  it('stok HABIS jadi urgent, bukan sekadar high', async () => {
    await db.query(
      `DELETE FROM notifications WHERE type = 'stok_menipis' AND action_data->>'record_id' = $1`,
      [stokId])
    await db.query(`UPDATE materials SET min_stock = 100 WHERE id = $1`, [materialId])
    await db.query(`UPDATE project_stocks SET qty_on_hand = 0 WHERE id = $1`, [stokId])

    await panggil()
    const n = await db.query(
      `SELECT priority FROM notifications
        WHERE type = 'stok_menipis' AND action_data->>'record_id' = $1
        ORDER BY sent_at DESC LIMIT 1`, [stokId])
    // Stok nol = pekerjaan berhenti, bukan sekadar menipis.
    expect(n.rows[0]?.priority).toBe('urgent')
  }, 120_000)

  it('stok DI ATAS ambang tidak diperingatkan', async () => {
    await db.query(
      `DELETE FROM notifications WHERE type = 'stok_menipis' AND action_data->>'record_id' = $1`,
      [stokId])
    await db.query(`UPDATE materials SET min_stock = 10 WHERE id = $1`, [materialId])
    await db.query(`UPDATE project_stocks SET qty_on_hand = 500 WHERE id = $1`, [stokId])

    await panggil()
    const n = await db.query(
      `SELECT count(*)::int AS n FROM notifications
        WHERE type = 'stok_menipis' AND action_data->>'record_id' = $1`, [stokId])
    expect(n.rows[0].n).toBe(0)
  }, 120_000)
})

describe('dedup & bentuk', () => {
  it('denyut kedua tidak menambah peringatan', async () => {
    await db.query(`UPDATE materials SET min_stock = 100 WHERE id = $1`, [materialId])
    await db.query(`UPDATE project_stocks SET qty_on_hand = 5 WHERE id = $1`, [stokId])

    await panggil()
    const sebelum = await db.query(
      `SELECT count(*)::int AS n FROM notifications
        WHERE type = 'stok_menipis' AND action_data->>'record_id' = $1`, [stokId])
    await panggil()
    const sesudah = await db.query(
      `SELECT count(*)::int AS n FROM notifications
        WHERE type = 'stok_menipis' AND action_data->>'record_id' = $1`, [stokId])
    expect(sesudah.rows[0].n).toBe(sebelum.rows[0].n)
  }, 120_000)

  it('terdaftar di KATALOG_TUGAS & bentuk jawabannya utuh', async () => {
    expect(KATALOG_TUGAS['stok-menipis']).toBeDefined()
    expect(KATALOG_TUGAS['stok-menipis'].jalur)
      .toBe('/api/v1/otomasi/jalankan/stok-menipis')

    const j = (await panggil()).json()
    expect(j.success).toBe(true)
    expect(typeof j.checked.stok_diperiksa).toBe('number')
    expect(typeof j.checked.menipis).toBe('number')
    expect(typeof j.checked.tanpa_ambang).toBe('number')
  }, 120_000)

  it('tanpa token ditolak', async () => {
    const r = await app.inject({
      method: 'GET', url: '/api/v1/otomasi/jalankan/stok-menipis' })
    expect(r.statusCode).toBeGreaterThanOrEqual(400)
  })
})
