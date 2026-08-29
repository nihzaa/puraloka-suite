import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import instruksiRoutes from '../instruksi-lapangan.js'

// ════════════════════════════════════════════════════════════════════════════
// INSTRUKSI LAPANGAN — DIUJI LEWAT ENDPOINT NYATA (INTI #6 · migrasi 186)
// ════════════════════════════════════════════════════════════════════════════
//
// `lib/instruksi-lapangan.test.ts` menguji aritmetika umur konfirmasinya.
// Berkas ini menguji yang tak bisa digantikan olehnya:
//
//   · constraint database menolak bentuk yang mustahil
//   · konfirmasi TANPA menyebut caranya DITOLAK — "sudah dikonfirmasi" yang
//     tak bisa dibuktikan persis keadaan yang modul ini hindari
//   · ringkasan memisah "masih bisa diselamatkan" dari "sudah jadi sengketa"
//
// ⚠️ CATATAN ISOLASI (R-009): harness menulis ke schema `public` dan tulisannya
// BERTAHAN. Tiap baris diberi prefiks `[TEST-INSTRUKSI]` dan dibersihkan.

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let companyId: string
let projectId: string

const PREFIX = '[TEST-INSTRUKSI]'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const patch = (url: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url, payload: { project_id: projectId, ...payload } as never,
    headers: { authorization: 'Bearer t' } })
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

/** ISO timestamp, `n` jam lalu. */
const jamLalu = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString()

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(
      `DELETE FROM field_instructions WHERE project_id IN (SELECT id FROM projects WHERE name LIKE $1)`,
      [`${PREFIX}%`])
    await client.query(`DELETE FROM projects WHERE name LIKE $1`, [`${PREFIX}%`])
    await client.query(`DELETE FROM clients WHERE contact_person LIKE $1`, [`${PREFIX}%`])
  } finally {
    await client.query(`SET session_replication_role = 'origin'`)
  }
}

let seq = 0
const nomorBaru = () => `${PREFIX}-SI-${++seq}`

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string
  await purge()

  const { rows: u } = await client.query(
    `SELECT id FROM users WHERE auth_id = $1`, [adminAuth])
  adminUserId = u[0].id

  // `company_id` EKSPLISIT — trigger menolak menebak saat ada >1 company (F0-14).
  const { rows: co } = await client.query(
    `SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1`)
  companyId = co[0].id

  const { rows: c } = await client.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by)
     VALUES ($1, $2, '081200000004', $3) RETURNING id`,
    [companyId, `${PREFIX} Klien`, adminUserId])

  const { rows: p } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, contract_value,
                           start_date, end_date, created_by)
     VALUES ($1, $2, $3, $4, 'Bandung', 5000000000, CURRENT_DATE,
             CURRENT_DATE + INTERVAL '180 days', $3) RETURNING id`,
    [companyId, c[0].id, adminUserId, `${PREFIX} Proyek`])
  projectId = p[0].id

  app = Fastify()
  await app.register(instruksiRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  vi.restoreAllMocks()
  await purge()
  await app?.close()
  await client?.end()
})

const instruksiLisan = (extra: Record<string, unknown> = {}) => ({
  nomor: nomorBaru(),
  pemberi_nama: 'Ir. Bambang', pemberi_jabatan: 'Pengawas',
  pemberi_pihak: 'PT Owner Sejahtera',
  bentuk_perintah: 'lisan',
  isi_instruksi: 'Bongkar dinding partisi lantai 2 zona B, ganti bata ringan',
  diterima_pada: jamLalu(2), ...extra,
})

describe('pencatatan instruksi', () => {
  it('PENJAGA BERDAYA: instruksi lisan tercatat + status konfirmasi disertakan', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/field-instructions`, instruksiLisan())

    expect(res.statusCode, `body: ${res.body.slice(0, 300)}`).toBe(201)
    expect(res.json().data.status).toBe('dicatat')
    expect(res.json().konfirmasi.keadaan,
      'instruksi lisan baru tak menandakan perlunya konfirmasi — pencatat tak ' +
      'tahu ada yang harus dikerjakan dalam 24 jam').toBe('mendesak')
  })

  it('instruksi TERTULIS tak menuntut konfirmasi', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/field-instructions`,
      instruksiLisan({ bentuk_perintah: 'tertulis' }))
    expect(res.statusCode).toBe(201)
    expect(res.json().konfirmasi.keadaan).toBe('tak_perlu')
  })

  it('isi instruksi terlalu pendek DITOLAK', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/field-instructions`,
      instruksiLisan({ isi_instruksi: 'bongkar' }))
    expect(res.statusCode,
      '"bongkar" diterima sebagai instruksi — setahun lagi tak seorang pun ' +
      'tahu apa yang sebenarnya diperintahkan').toBe(400)
  })

  it('pemberi perintah kosong DITOLAK', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/field-instructions`,
      instruksiLisan({ pemberi_nama: '' }))
    expect(res.statusCode,
      'instruksi tanpa nama pemberi diterima — tak ada yang bisa dikonfirmasi ' +
      'ke siapa pun, dan catatannya jadi tak berguna').toBe(400)
  })

  it('estimasi biaya TANPA berdampak_biaya DITOLAK', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/field-instructions`,
      instruksiLisan({ estimasi_biaya: 50_000_000 }))
    expect(res.statusCode,
      'angka biaya pada instruksi yang tak ditandai berdampak ikut terhitung ' +
      'sebagai potensi klaim yang tak pernah ada').toBe(422)
  })

  it('nomor ganda di proyek sama DITOLAK 409', async () => {
    actAs(adminAuth)
    const nomor = nomorBaru()
    const body = { ...instruksiLisan(), nomor }
    expect((await post(`/api/v1/projects/${projectId}/field-instructions`, body)).statusCode).toBe(201)
    const dua = await post(`/api/v1/projects/${projectId}/field-instructions`, { ...body })
    expect(dua.statusCode).toBe(409)
  })
})

describe('jalur tindak lanjut — biaya dan waktu DIPISAH', () => {
  it('berdampak keduanya → dua jalur disebut', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/field-instructions`,
      instruksiLisan({
        berdampak_biaya: true, berdampak_waktu: true,
        estimasi_biaya: 75_000_000, estimasi_hari: 7,
      }))
    expect(res.statusCode, `body: ${res.body.slice(0, 300)}`).toBe(201)

    expect(res.json().tindak_lanjut.jalur,
      'instruksi yang menuntut biaya DAN waktu hanya memicu satu jalur — ' +
      'yang lain terbuang tanpa ada yang tahu').toEqual(['klaim', 'eot'])
  })

  it('tak berdampak → nol jalur', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/field-instructions`, instruksiLisan())
    expect(res.json().tindak_lanjut.jalur).toEqual([])
  })
})

describe('konfirmasi — produk sesungguhnya modul ini', () => {
  async function buat(extra: Record<string, unknown> = {}): Promise<string> {
    const res = await post(`/api/v1/projects/${projectId}/field-instructions`,
      instruksiLisan(extra))
    expect(res.statusCode).toBe(201)
    return res.json().data.id as string
  }

  it('konfirmasi TANPA menyebut caranya DITOLAK', async () => {
    actAs(adminAuth)
    const id = await buat()
    const res = await patch(`/api/v1/field-instructions/${id}/konfirmasi`, {})

    expect(res.statusCode,
      '"sudah dikonfirmasi" diterima tanpa menyebut caranya — itu klaim tanpa ' +
      'bukti, persis keadaan yang modul ini dibuat untuk menghindarinya').toBe(422)

    const { rows } = await client.query(
      `SELECT status FROM field_instructions WHERE id=$1`, [id])
    expect(rows[0].status, 'status berubah padahal konfirmasi ditolak').toBe('dicatat')
  })

  it('konfirmasi dalam batas → tersimpan + dinilai PENUH', async () => {
    actAs(adminAuth)
    const id = await buat({ diterima_pada: jamLalu(5) })
    const res = await patch(`/api/v1/field-instructions/${id}/konfirmasi`, {
      dikonfirmasi_via: 'surat 012/PP/VIII',
    })
    expect(res.statusCode, `body: ${res.body.slice(0, 300)}`).toBe(200)
    expect(res.json().konfirmasi.keadaan).toBe('terkonfirmasi_segera')

    const { rows } = await client.query(
      `SELECT status, dikonfirmasi_pada, dikonfirmasi_via FROM field_instructions WHERE id=$1`, [id])
    expect(rows[0].status).toBe('dikonfirmasi')
    expect(rows[0].dikonfirmasi_pada,
      'konfirmasi tersimpan TANPA tanggal — "sudah dikonfirmasi" tak bisa ' +
      'dibuktikan kapan').toBeTruthy()
    expect(rows[0].dikonfirmasi_via).toBe('surat 012/PP/VIII')
  })

  it('konfirmasi LEWAT batas tetap tersimpan, tapi dinilai LAMBAT', async () => {
    actAs(adminAuth)
    const id = await buat({ diterima_pada: jamLalu(200) })   // >24 jam
    const res = await patch(`/api/v1/field-instructions/${id}/konfirmasi`, {
      dikonfirmasi_via: 'email susulan',
    })

    expect(res.statusCode,
      'konfirmasi terlambat DITOLAK — padahal mencatatnya tetap lebih baik ' +
      'daripada tak ada sama sekali; yang penting nilainya dinyatakan apa adanya').toBe(200)
    expect(res.json().konfirmasi.keadaan).toBe('terkonfirmasi_lambat')
    expect(res.json().konfirmasi.pesan).toContain('rekonstruksi')
  })

  it('konfirmasi MENDAHULUI perintah DITOLAK', async () => {
    actAs(adminAuth)
    const id = await buat({ diterima_pada: jamLalu(2) })
    const res = await patch(`/api/v1/field-instructions/${id}/konfirmasi`, {
      dikonfirmasi_via: 'surat', dikonfirmasi_pada: jamLalu(48),
    })
    expect(res.statusCode,
      'konfirmasi bertanggal SEBELUM perintahnya diterima sebagai bukti — ' +
      'padahal itu tanda datanya rusak atau dikarang').toBe(422)
  })

  it('project_id wajib — kategori C tak bisa dikonfirmasi tanpa gerbang tenant', async () => {
    actAs(adminAuth)
    const id = await buat()
    const res = await app.inject({
      method: 'PATCH', url: `/api/v1/field-instructions/${id}/konfirmasi`,
      payload: { dikonfirmasi_via: 'surat' } as never,
      headers: { authorization: 'Bearer t' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('ringkasan — yang bisa diselamatkan vs yang sudah sengketa', () => {
  it('memisah konfirmasi_mendesak, konfirmasi_lewat, dan disangkal', async () => {
    actAs(adminAuth)

    // Masih dalam batas → bisa diselamatkan HARI INI
    await post(`/api/v1/projects/${projectId}/field-instructions`,
      instruksiLisan({ diterima_pada: jamLalu(3) }))

    // Lewat batas → utang bukti
    await post(`/api/v1/projects/${projectId}/field-instructions`,
      instruksiLisan({ diterima_pada: jamLalu(100) }))

    // Disangkal → butuh bukti lain, bukan konfirmasi
    const s = await post(`/api/v1/projects/${projectId}/field-instructions`,
      instruksiLisan({ diterima_pada: jamLalu(500) }))
    await client.query(
      `UPDATE field_instructions SET status='disangkal' WHERE id=$1`, [s.json().data.id])

    const res = await get(`/api/v1/projects/${projectId}/field-instructions`)
    expect(res.statusCode).toBe(200)
    const r = res.json().ringkas

    expect(r.konfirmasi_mendesak).toBeGreaterThanOrEqual(1)
    expect(r.konfirmasi_lewat).toBeGreaterThanOrEqual(1)
    expect(r.disangkal,
      'instruksi yang DISANGKAL ikut terhitung sebagai "belum dikonfirmasi" — ' +
      'orang mengira masih bisa dikejar, padahal yang dibutuhkan bukti lain').toBeGreaterThanOrEqual(1)
  })

  it('berdampak biaya TANPA klaim terhitung — uang yang belum ditagih', async () => {
    actAs(adminAuth)
    await post(`/api/v1/projects/${projectId}/field-instructions`,
      instruksiLisan({ berdampak_biaya: true, estimasi_biaya: 30_000_000 }))

    const res = await get(`/api/v1/projects/${projectId}/field-instructions`)
    expect(res.json().ringkas.berdampak_tanpa_klaim,
      'instruksi berdampak biaya yang belum jadi klaim tak terlihat — uang ' +
      'yang berhak ditagih menguap tanpa seorang pun tahu').toBeGreaterThanOrEqual(1)
  })
})
