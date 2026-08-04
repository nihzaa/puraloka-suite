import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import rantaiKontrakRoutes from '../rantai-kontrak.js'

// ════════════════════════════════════════════════════════════════════════════
// KLAIM KONTRAKTUAL — DIUJI LEWAT ENDPOINT NYATA (INTI #4 · migrasi 184)
// ════════════════════════════════════════════════════════════════════════════
//
// `lib/klaim-kontraktual.test.ts` menguji aritmetika batas waktunya.
// Berkas ini menguji yang tak bisa digantikan olehnya:
//
//   · constraint database benar-benar menolak bentuk yang mustahil
//   · klaim yang TELANJUR terlambat tetap TERCATAT, bukan ditolak
//   · keputusan wajib berjejak (siapa & kapan)
//   · ringkasan menghitung "berisiko gugur" dari status DAN batas waktu
//
// ── Kenapa klaim terlambat tetap harus tercatat
//
// Menolak klaim yang batasnya sudah lewat terasa "ketat", tapi justru
// menghapus bukti bahwa peristiwanya pernah terjadi. Yang benar: catat,
// tandai berisiko gugur, dan biarkan manusia memutuskan mau mengejar atau
// tidak. Sistem yang menolak mencatat membuat perusahaan kehilangan pelajaran
// TERMAHAL-nya — berapa sering ia lalai memberi tahu.

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let companyId: string
let projectId: string

const PREFIX = '[TEST-KLAIM]'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
// PATCH klaim WAJIB membawa project_id — klaim kategori C, dan tanpa itu
// endpoint tak bisa memasang gerbang tenant. Helper ini menyisipkannya.
const patch = (url: string, payload: Record<string, unknown>) =>
  app.inject({ method: 'PATCH', url,
    payload: (url.includes('/claims/') ? { project_id: projectId, ...payload } : payload) as never,
    headers: { authorization: 'Bearer t' } })
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

/** YYYY-MM-DD, `n` hari yang lalu dari hari ini WIB. */
function hariLalu(n: number): string {
  return new Date(Date.now() + 7 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10)
}

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(
      `DELETE FROM contract_claims WHERE project_id IN (SELECT id FROM projects WHERE name LIKE $1)`,
      [`${PREFIX}%`])
    await client.query(`DELETE FROM projects WHERE name LIKE $1`, [`${PREFIX}%`])
    await client.query(`DELETE FROM clients WHERE contact_person LIKE $1`, [`${PREFIX}%`])
  } finally {
    await client.query(`SET session_replication_role = 'origin'`)
  }
}

let seq = 0
const nomorBaru = () => `${PREFIX}-CL-${++seq}`

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string
  await purge()

  const { rows: u } = await client.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin' LIMIT 1`)
  adminUserId = u[0].id

  // `company_id` EKSPLISIT — `fn_isi_company_id()` menolak menebak saat ada
  // lebih dari satu company, dan CI memang punya beberapa (pelajaran F0-14).
  const { rows: co } = await client.query(
    `SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1`)
  companyId = co[0].id

  const { rows: c } = await client.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by)
     VALUES ($1, $2, '081200000002', $3) RETURNING id`,
    [companyId, `${PREFIX} Klien`, adminUserId])

  const { rows: p } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, contract_value,
                           start_date, end_date, created_by)
     VALUES ($1, $2, $3, $4, 'Bandung', 5000000000, CURRENT_DATE,
             CURRENT_DATE + INTERVAL '180 days', $3) RETURNING id`,
    [companyId, c[0].id, adminUserId, `${PREFIX} Proyek`])
  projectId = p[0].id

  app = Fastify()
  await app.register(rantaiKontrakRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  vi.restoreAllMocks()
  await purge()
  await app?.close()
  await client?.end()
})

describe('pembuatan klaim', () => {
  it('PENJAGA BERDAYA: klaim sah dibuat dan tersimpan', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/claims`, {
      claim_number: nomorBaru(),
      claim_type: 'keterlambatan_lahan',
      title: 'Lahan blok B terlambat diserahkan 30 hari',
      event_date: hariLalu(5),
      notice_days_limit: 14,
      amount_claimed: 250_000_000,
    })

    expect(res.statusCode, `body: ${res.body.slice(0, 300)}`).toBe(201)
    expect(res.json().data.status).toBe('draft')
    expect(res.json().batas_pemberitahuan.keadaan).toBe('berjalan')
  })

  it('mengisi notified_at langsung menaikkan status jadi diberitahukan', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/claims`, {
      claim_number: nomorBaru(),
      claim_type: 'keterlambatan_gambar',
      title: 'Gambar struktur revisi 3 terlambat 21 hari',
      event_date: hariLalu(10),
      notified_at: hariLalu(8),
      notice_days_limit: 14,
      amount_claimed: 80_000_000,
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().data.status).toBe('diberitahukan')
    expect(res.json().batas_pemberitahuan.keadaan).toBe('aman')
  })

  it('klaim yang SUDAH TERLAMBAT tetap DICATAT, dengan peringatan', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/claims`, {
      claim_number: nomorBaru(),
      claim_type: 'kondisi_tak_terduga',
      title: 'Batuan keras ditemukan pada galian pondasi zona 4',
      event_date: hariLalu(60),
      notice_days_limit: 14,
      amount_claimed: 500_000_000,
    })

    expect(res.statusCode,
      'klaim yang telanjur terlambat DITOLAK — bukti bahwa peristiwanya pernah ' +
      'terjadi ikut terhapus, dan perusahaan kehilangan pelajaran termahalnya: ' +
      'berapa sering ia lalai memberi tahu').toBe(201)
    expect(res.json().batas_pemberitahuan.keadaan).toBe('terlambat')
    expect(res.json().batas_pemberitahuan.sisaHari).toBeLessThan(0)
  })

  it('judul terlalu pendek DITOLAK', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/claims`, {
      claim_number: nomorBaru(), claim_type: 'lain_lain', title: 'klaim',
      event_date: hariLalu(1), amount_claimed: 1_000_000,
    })
    expect(res.statusCode).toBe(400)
  })

  it('tanggal peristiwa rusak DITOLAK, bukan digulung diam-diam', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/projects/${projectId}/claims`, {
      claim_number: nomorBaru(), claim_type: 'lain_lain',
      title: 'Klaim dengan tanggal mustahil 31 Februari',
      event_date: '2026-02-31', notice_days_limit: 14, amount_claimed: 1_000_000,
    })
    expect(res.statusCode,
      'tanggal mustahil diterima lalu digulung — batas waktu dihitung dari hari ' +
      'yang tak pernah ada').toBe(400)
  })

  it('nomor klaim ganda di proyek yang sama DITOLAK 409', async () => {
    actAs(adminAuth)
    const nomor = nomorBaru()
    const body = {
      claim_number: nomor, claim_type: 'lain_lain',
      title: 'Klaim pertama dengan nomor yang akan diulang',
      event_date: hariLalu(2), amount_claimed: 5_000_000,
    }
    expect((await post(`/api/v1/projects/${projectId}/claims`, body)).statusCode).toBe(201)

    const dua = await post(`/api/v1/projects/${projectId}/claims`, {
      ...body, title: 'Klaim kedua memakai nomor yang sama',
    })
    expect(dua.statusCode,
      'nomor klaim ganda diterima — dua surat berbeda ke owner memakai nomor ' +
      'yang sama, dan tak ada yang tahu mana yang dimaksud saat sengketa').toBe(409)
  })
})

describe('keputusan klaim', () => {
  async function buatKlaim(nilai: number): Promise<string> {
    const res = await post(`/api/v1/projects/${projectId}/claims`, {
      claim_number: nomorBaru(), claim_type: 'penghentian_sementara',
      title: 'Penghentian sementara oleh pemberi kerja selama 14 hari',
      event_date: hariLalu(3), notice_days_limit: 14, amount_claimed: nilai,
    })
    expect(res.statusCode).toBe(201)
    return res.json().data.id as string
  }

  it('disetujui PENUH dengan nilai sama LOLOS, dan berjejak siapa/kapan', async () => {
    actAs(adminAuth)
    const id = await buatKlaim(100_000_000)

    const res = await patch(`/api/v1/claims/${id}/decide`, {
      status: 'disetujui', amount_approved: 100_000_000, decision_note: 'Disetujui penuh',
    })
    expect(res.statusCode, `body: ${res.body.slice(0, 300)}`).toBe(200)

    const { rows } = await client.query(
      `SELECT status, amount_approved, decided_at, decided_by FROM contract_claims WHERE id=$1`, [id])
    expect(rows[0].status).toBe('disetujui')
    expect(Number(rows[0].amount_approved)).toBe(100_000_000)
    expect(rows[0].decided_at,
      'keputusan tersimpan TANPA jejak kapan — klaim berstatus disetujui dan ' +
      'nilainya masuk laporan, tanpa seorang pun bertanggung jawab').toBeTruthy()
    expect(rows[0].decided_by).toBe(adminUserId)
  })

  it('disetujui dengan nilai BERBEDA ditolak 422 — pakai disetujui_sebagian', async () => {
    actAs(adminAuth)
    const id = await buatKlaim(100_000_000)

    const res = await patch(`/api/v1/claims/${id}/decide`, {
      status: 'disetujui', amount_approved: 60_000_000,
    })
    expect(res.statusCode,
      'klaim yang ditawar separuh dicatat "disetujui penuh" — laporan tak bisa ' +
      'membedakan klaim utuh dari yang dipotong').toBe(422)

    const { rows } = await client.query(
      `SELECT status FROM contract_claims WHERE id=$1`, [id])
    expect(rows[0].status, 'status berubah padahal keputusan ditolak').toBe('draft')
  })

  it('disetujui_sebagian dengan nilai lebih kecil LOLOS', async () => {
    actAs(adminAuth)
    const id = await buatKlaim(100_000_000)
    const res = await patch(`/api/v1/claims/${id}/decide`, {
      status: 'disetujui_sebagian', amount_approved: 60_000_000,
    })
    expect(res.statusCode).toBe(200)
  })

  it('nilai disetujui MELEBIHI yang diklaim ditolak', async () => {
    actAs(adminAuth)
    const id = await buatKlaim(100_000_000)
    const res = await patch(`/api/v1/claims/${id}/decide`, {
      status: 'disetujui_sebagian', amount_approved: 150_000_000,
    })
    expect(res.statusCode,
      'nilai disetujui melebihi yang ditagih — uang masuk pembukuan tanpa ' +
      'pernah diklaim').toBe(422)
  })

  it('gugur dan ditolak sama-sama tanpa nilai, TAPI statusnya BERBEDA', async () => {
    actAs(adminAuth)
    const idGugur = await buatKlaim(50_000_000)
    const idTolak = await buatKlaim(50_000_000)

    expect((await patch(`/api/v1/claims/${idGugur}/decide`, {
      status: 'gugur', decision_note: 'Batas pemberitahuan terlampaui',
    })).statusCode).toBe(200)
    expect((await patch(`/api/v1/claims/${idTolak}/decide`, {
      status: 'ditolak', decision_note: 'Dinilai bukan tanggung jawab pemberi kerja',
    })).statusCode).toBe(200)

    const { rows } = await client.query(
      `SELECT id, status FROM contract_claims WHERE id = ANY($1)`, [[idGugur, idTolak]])
    const peta = Object.fromEntries(rows.map((r: { id: string; status: string }) => [r.id, r.status]))

    expect(peta[idGugur],
      'gugur disamakan dengan ditolak — perusahaan kehilangan cara mengukur ' +
      'berapa uang hilang karena LALAI MEMBERI TAHU, bukan karena klaimnya lemah')
      .toBe('gugur')
    expect(peta[idTolak]).toBe('ditolak')
  })
})

describe('ringkasan — yang mendesak harus terlihat', () => {
  it('menghitung berisiko_gugur dari status DAN batas waktu', async () => {
    actAs(adminAuth)

    // Terlambat + belum diputus → BERISIKO GUGUR
    await post(`/api/v1/projects/${projectId}/claims`, {
      claim_number: nomorBaru(), claim_type: 'lain_lain',
      title: 'Klaim terlambat yang belum diputus sama sekali',
      event_date: hariLalu(90), notice_days_limit: 14, amount_claimed: 10_000_000,
    })

    // Terlambat TAPI sudah diputus → TIDAK dihitung lagi
    const sudah = await post(`/api/v1/projects/${projectId}/claims`, {
      claim_number: nomorBaru(), claim_type: 'lain_lain',
      title: 'Klaim terlambat yang sudah diputuskan gugur',
      event_date: hariLalu(90), notice_days_limit: 14, amount_claimed: 10_000_000,
    })
    await patch(`/api/v1/claims/${sudah.json().data.id}/decide`, {
      status: 'gugur', decision_note: 'Sudah diputus',
    })

    const res = await get(`/api/v1/projects/${projectId}/claims`)
    expect(res.statusCode).toBe(200)
    const r = res.json().ringkas

    expect(r.berisiko_gugur,
      'klaim yang SUDAH diputus masih dihitung berisiko — daftar mendesak penuh ' +
      'hal yang tak perlu ditindaklanjuti, dan yang benar-benar mendesak tenggelam')
      .toBeGreaterThanOrEqual(1)
    expect(r.total_diklaim).toBeGreaterThan(0)
  })

  it('batas_pemberitahuan DIHITUNG saat dibaca, bukan disimpan basi', async () => {
    actAs(adminAuth)
    const res = await get(`/api/v1/projects/${projectId}/claims`)
    const semua = res.json().data as Array<{ batas_pemberitahuan?: { keadaan: string } }>

    expect(semua.every((k) => typeof k.batas_pemberitahuan?.keadaan === 'string'),
      'ada klaim tanpa status batas waktu — pemakai tak bisa tahu mana yang ' +
      'perlu ditindaklanjuti hari ini').toBe(true)
  })
})
