import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, penggunaLain } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import changeOrderRoutes from '../change-orders.js'

// JANJI INTI Phase 2 (mandat founder): approval "bisa berjenjang", jumlah level dan
// siapa yang boleh menyetujui = KONFIGURASI, bukan kode.
//
// Sampai sekarang janji itu hanya dibuktikan lewat skrip E2E manual saat 2A-3 —
// TIDAK ADA yang menjaganya di CI. Test ini menutup lubang itu pada level ROUTE
// (logika murni-nya sudah ditest terpisah di lib/approval-engine.test.ts).
//
// Yang dikunci di sini — invariant paling mahal kalau rusak:
//   UANG TIDAK BERGERAK SEBELUM LEVEL TERAKHIR.
// Approve level 1 pada rantai 2 level TIDAK BOLEH mengubah status CO maupun
// nilai kontrak proyek. Kalau invariant ini jebol, satu tanda tangan bisa
// mengubah nilai kontrak yang seharusnya butuh dua.
//
// Berjalan terhadap dev `public` (bukan schema `test`) karena handler memakai
// klien service_role — sama seperti approval-chains.test.ts. Semua entitas yang
// dibuat diberi prefiks [TEST] dan dibersihkan di afterAll.

const DELTA = 100_000_000
const BASE_CONTRACT = 1_000_000_000

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let pengajuId: string
let projectId: string
let coId: string
let level2Id: string

const actAs = (a: string) => {
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
}
const approve = () =>
  app.inject({
    method: 'PATCH', url: `/api/v1/change-orders/${coId}/approve`,
    payload: {} as never, headers: { authorization: 'Bearer t' },
  })

/**
 * Hapus SEMUA artefak test berprefiks [TEST] beserta yang menahannya.
 *
 * Endpoint approve mengirim notifikasi fire-and-forget; `notifications.project_id`
 * FK-nya NO ACTION, jadi baris notif menahan penghapusan proyek. Karena insert-nya
 * asinkron, satu notif bisa mendarat SETELAH kita menghapus notif tapi SEBELUM
 * menghapus proyek — maka dicoba ulang, bukan diasumsikan sekali jalan beres.
 */
async function purgeTestProjects(): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    // ⚠️ Saringan SEMPIT, bukan '[TEST]%'.
    //
    // Versi sebelumnya menyapu SETIAP proyek berawalan '[TEST]' — dan belasan
    // berkas test lain memakai awalan yang sama di schema `public` BERSAMA.
    // Berjalan berurutan tak pernah terlihat; berjalan PARALEL (6 shard), purge
    // ini mencoba menghapus proyek milik shard lain, lalu ditolak trigger
    // penjaga milik data itu:
    //
    //     Lessons Learned berstatus under_review tidak boleh dihapus
    //
    // Gejalanya menuduh Lessons Learned, padahal sebabnya purge yang terlalu luas.
    const { rows } = await client.query(
      `SELECT id FROM projects WHERE name = '[TEST] Rantai Berjenjang'`)
    if (rows.length === 0) return
    const ids = rows.map(r => r.id)
    await client.query(
      `DELETE FROM approval_progress
        WHERE entity_type = 'change_order'
          AND entity_id IN (SELECT id FROM change_orders WHERE project_id = ANY($1))`, [ids])
    await client.query(`DELETE FROM change_orders WHERE project_id = ANY($1)`, [ids])
    await client.query(`DELETE FROM notifications WHERE project_id = ANY($1)`, [ids])
    try {
      await client.query(`DELETE FROM projects WHERE id = ANY($1)`, [ids])
      return
    } catch (err) {
      if (attempt === 3) throw err
      await new Promise(r => setTimeout(r, 1000)) // beri waktu notif telat mendarat
    }
  }
}

const readCo = async () => {
  const { rows } = await client.query(
    `SELECT co.status, p.contract_value
       FROM change_orders co JOIN projects p ON p.id = co.project_id
      WHERE co.id = $1`, [coId])
  return rows[0] as { status: string; contract_value: string }
}

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(changeOrderRoutes)
  await app.ready()

  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) ?? ''
  const { rows: au } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'admin' LIMIT 1`)
  adminUserId = au[0].id

  // Self-healing: bersihkan sisa run sebelumnya yang gagal di tengah, supaya
  // satu kegagalan tidak meracuni semua run berikutnya.
  await purgeTestProjects()

  const { rows: cl } = await client.query(`SELECT id FROM clients LIMIT 1`)
  const { rows: pr } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, start_date, end_date, created_by, contract_value)
     VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1), $1, $2, '[TEST] Rantai Berjenjang', 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, $2, $3)
     RETURNING id`, [cl[0].id, adminUserId, BASE_CONTRACT])
  projectId = pr[0].id

  // Pengajunya ORANG LAIN, bukan admin yang akan menyetujui.
  //
  // Sejak TJS-P4 (2026-08-12) ada gerbang SoD: pengaju tak boleh menyetujui
  // pengajuannya sendiri. Fixture ini dulu memakai `adminUserId` untuk kedua
  // peran, dan sesudah gerbang terpasang ketiga test di berkas ini balas 403.
  //
  // Diperbaiki di fixture, BUKAN dengan mengirim `alasan_override`: memakai
  // override akan membuat test ini menempuh jalur istimewa, dan yang diuji
  // berubah diam-diam dari "approval berjenjang bekerja" jadi "override
  // bekerja". Yang ingin dibuktikan di sini tetap mekanika berjenjangnya.
  const lain = await penggunaLain(client, adminUserId)
  if (!lain) throw new Error('butuh minimal 2 pengguna aktif — fixture approval perlu pengaju ≠ penyetuju')
  pengajuId = lain.userId

  const { rows: co } = await client.query(
    `INSERT INTO change_orders (project_id, co_number, title, status, total_amount_delta, created_by, submitted_by)
     VALUES ($1, 'CO-TEST-BERJENJANG', '[TEST] Kerja tambah', 'submitted', $2, $3, $3)
     RETURNING id`, [projectId, DELTA, pengajuId])
  coId = co[0].id

  // KONFIGURASI (bukan kode): jadikan rantai change_order 2 level.
  // Kedua permission dimiliki admin — yang diuji di sini mekanika BERJENJANG-nya
  // (penahapan & penundaan efek), bukan pemisahan orang; siapa-boleh-apa sudah
  // dikunci jaring authz 403 + unit test engine.
  // Self-healing: rantai seed 'change_order' hanya 1 level; level ≥2 = residu run
  // yang mati sebelum afterAll. Bersihkan dulu supaya INSERT tak kena duplicate key.
  await client.query(
    `DELETE FROM approval_steps WHERE level >= 2 AND chain_id IN
      (SELECT id FROM approval_chains WHERE entity_type = 'change_order')`)
  const { rows: st } = await client.query(
    // `company_id` diwariskan dari chain induknya, bukan diserahkan ke fallback
    // `fn_isi_company_id()` — fallback itu hanya mengisi bila `companies` berisi
    // TEPAT SATU baris, dan berhenti bekerja begitu ada test lain yang membuat
    // company kedua (F0-14).
    `INSERT INTO approval_steps (company_id, chain_id, level, required_permission, label)
     SELECT company_id, id, 2, 'settings:finance:manage', '[TEST] Level 2'
       FROM approval_chains WHERE entity_type = 'change_order'
     RETURNING id`)
  level2Id = st[0].id
}, 90_000)

afterEach(() => { vi.restoreAllMocks() })

afterAll(async () => {
  // Kembalikan state dev sepenuhnya. Rantai dikembalikan ke 1 level lebih dulu:
  // meninggalkan level 2 akan mengubah perilaku approval CO untuk SEMUA orang.
  if (level2Id) await client.query(`DELETE FROM approval_steps WHERE id = $1`, [level2Id])
  await purgeTestProjects()
  await app.close()
  await client.end()
})

describe('Rantai approval berjenjang — level 1 TIDAK boleh menggerakkan uang', () => {
  it('prasyarat: rantai change_order benar-benar punya 2 level', async () => {
    const { rows } = await client.query(
      `SELECT s.level FROM approval_steps s JOIN approval_chains c ON c.id = s.chain_id
        WHERE c.entity_type = 'change_order' ORDER BY s.level`)
    expect(rows.map(r => Number(r.level))).toEqual([1, 2])
  }, 30_000)

  it('approve level 1 → tercatat "menunggu level 2", status & nilai kontrak TIDAK berubah', async () => {
    const before = await readCo()
    expect(before.status).toBe('submitted')

    actAs(adminAuth)
    const r = await approve()
    expect(r.statusCode, r.body).toBe(200)
    const body = JSON.parse(r.body)
    expect(body.pending_next_level).toBe(true)
    expect(body.message).toMatch(/level 2/i)

    // INVARIANT: belum final = belum ada yang bergerak.
    const after = await readCo()
    expect(after.status, 'CO harus TETAP submitted sampai level terakhir').toBe('submitted')
    expect(Number(after.contract_value), 'nilai kontrak TIDAK boleh berubah di level 1')
      .toBe(BASE_CONTRACT)

    // jejak level 1 tercatat
    const { rows } = await client.query(
      `SELECT level FROM approval_progress WHERE entity_type = 'change_order' AND entity_id = $1`, [coId])
    expect(rows.map(r => Number(r.level))).toEqual([1])
  }, 60_000)

  it('approve level 2 (final) → CO approved dan nilai kontrak baru bertambah delta', async () => {
    actAs(adminAuth)
    const r = await approve()
    expect(r.statusCode, r.body).toBe(200)
    expect(JSON.parse(r.body).pending_next_level).toBeUndefined()

    const after = await readCo()
    expect(after.status).toBe('approved')
    expect(Number(after.contract_value)).toBe(BASE_CONTRACT + DELTA)

    const { rows } = await client.query(
      `SELECT level FROM approval_progress WHERE entity_type = 'change_order' AND entity_id = $1 ORDER BY level`, [coId])
    expect(rows.map(r => Number(r.level))).toEqual([1, 2])
  }, 60_000)

  it('approve lagi setelah rantai tuntas → ditolak, nilai kontrak TIDAK dobel', async () => {
    actAs(adminAuth)
    const r = await approve()
    // 400 (bukan 409): begitu langkah final selesai, status CO bukan 'submitted'
    // lagi, sehingga penjaga status menembak lebih dulu daripada pemeriksaan
    // "rantai sudah tuntas" milik engine. Urutan ini yang benar — jawaban paling
    // jujur untuk CO yang sudah disetujui adalah "statusnya bukan submitted",
    // bukan detail internal rantai. (Kasbon berbeda bentuk: tak ada penjaga
    // status di jalur itu, jadi di sana engine yang menjawab 409.)
    expect(r.statusCode).toBe(400)
    expect(JSON.parse(r.body).error).toMatch(/submitted/i)

    // INVARIANT yang benar-benar mahal: approve ulang TIDAK menambah nilai kontrak lagi.
    expect(Number((await readCo()).contract_value)).toBe(BASE_CONTRACT + DELTA)
  }, 30_000)
})
