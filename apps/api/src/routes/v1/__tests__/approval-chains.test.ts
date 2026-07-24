import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import approvalChainRoutes from '../approval-chains.js'

// Kelola rantai approval dari UI (ADR-007 / 2A-4).
// Otorisasi: baca = authenticated, tulis = approval:chains:manage (admin).
// SAFETY yang diuji: langkah TERAKHIR tak boleh dihapus (rantai kosong = fail-closed
// = NOL orang bisa menyetujui modul itu).
//
// ISOLASI: semua test yang MEMUTASI konfigurasi memakai rantai khusus test, BUKAN
// rantai modul nyata ('kasbon'). Tanpa ini, menambah level 2 sementara bisa balapan
// dengan test approval kasbon yang jalan paralel di DB dev yang sama.
const TEST_ENTITY = '__test_chain__'

let app: FastifyInstance
let client: Client
let adminAuth: string
let pmAuth: string

interface StepRow { id: string; level: number; min_amount: string | number | null }
interface ChainRow { entity_type: string; approval_steps: StepRow[] }

const actAs = (a: string) => {
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
}
const req = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as never, headers: { authorization: 'Bearer t' } })

const testChain = async (): Promise<ChainRow> => {
  const body = JSON.parse((await req('GET', '/api/v1/approval-chains')).body)
  return (body.chains as ChainRow[]).find(c => c.entity_type === TEST_ENTITY)!
}

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(approvalChainRoutes)
  await app.ready()
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) ?? ''
  pmAuth = (await authIdForRole(client, 'pm')) ?? ''

  // Rantai khusus test (1 langkah) — semua mutasi terjadi di sini.
  await client.query(`DELETE FROM approval_chains WHERE entity_type = $1`, [TEST_ENTITY])
  const { rows } = await client.query(
    `INSERT INTO approval_chains (entity_type, label) VALUES ($1, 'Rantai Uji') RETURNING id`, [TEST_ENTITY])
  await client.query(
    `INSERT INTO approval_steps (chain_id, level, required_permission) VALUES ($1, 1, 'mandor:kasbon:approve')`,
    [rows[0].id])
}, 60_000)

afterEach(() => { vi.restoreAllMocks() })
afterAll(async () => {
  // CASCADE menghapus langkah-langkahnya sekalian.
  await client.query(`DELETE FROM approval_chains WHERE entity_type = $1`, [TEST_ENTITY])
  await app.close(); await client.end()
})

describe('Kelola rantai approval — otorisasi', () => {
  it('baca: authenticated boleh melihat rantai + langkahnya', async () => {
    actAs(pmAuth)
    const r = await req('GET', '/api/v1/approval-chains')
    expect(r.statusCode).toBe(200)
    const body = JSON.parse(r.body)
    expect(Array.isArray(body.chains)).toBe(true)
    expect(body.chains.length).toBeGreaterThan(0)
    // tiap rantai punya minimal 1 langkah (invariant anti-lockout)
    for (const c of body.chains as ChainRow[]) expect(c.approval_steps.length).toBeGreaterThanOrEqual(1)
  }, 30_000)

  it('NEGATIF: tanpa approval:chains:manage TIDAK boleh menambah level (403)', async () => {
    actAs(pmAuth)
    const r = await req('POST', `/api/v1/approval-chains/${TEST_ENTITY}/steps`, {
      required_permission: 'settings:finance:manage',
    })
    expect(r.statusCode).toBe(403)
  }, 30_000)

  it('NEGATIF: tanpa izin TIDAK boleh menonaktifkan rantai (403)', async () => {
    actAs(pmAuth)
    const r = await req('PATCH', `/api/v1/approval-chains/${TEST_ENTITY}`, { is_active: false })
    expect(r.statusCode).toBe(403)
  }, 30_000)
})

describe('Kelola rantai approval — validasi & SAFETY', () => {
  it('SAFETY: langkah TERAKHIR tidak boleh dihapus (cegah lockout approval)', async () => {
    actAs(adminAuth)
    const chain = await testChain()
    expect(chain.approval_steps.length, 'rantai uji harus punya tepat 1 langkah').toBe(1)
    actAs(adminAuth)
    const r = await req('DELETE', `/api/v1/approval-steps/${chain.approval_steps[0].id}`)
    expect(r.statusCode).toBe(400)
    expect(JSON.parse(r.body).error).toMatch(/langkah terakhir/i)
  }, 30_000)

  it('permission tak dikenal ditolak (FK permissions.key)', async () => {
    actAs(adminAuth)
    const r = await req('POST', `/api/v1/approval-chains/${TEST_ENTITY}/steps`, {
      required_permission: '__tidak_ada__',
    })
    expect([400, 500]).toContain(r.statusCode)
    if (r.statusCode === 400) expect(JSON.parse(r.body).error).toMatch(/tidak dikenal/i)
  }, 30_000)

  it('min_amount negatif ditolak', async () => {
    actAs(adminAuth)
    const r = await req('POST', `/api/v1/approval-chains/${TEST_ENTITY}/steps`, {
      required_permission: 'settings:finance:manage', min_amount: -5,
    })
    expect(r.statusCode).toBe(400)
  }, 30_000)

  it('rantai tak dikenal → 404', async () => {
    actAs(adminAuth)
    const r = await req('PATCH', '/api/v1/approval-chains/__bukan_entitas__', { is_active: true })
    expect(r.statusCode).toBe(404)
  }, 30_000)
})

describe('Siklus penuh: tambah level → ubah → hapus (bersih)', () => {
  it('admin bisa menambah, mengubah, lalu menghapus level tambahan', async () => {
    actAs(adminAuth)
    const add = await req('POST', `/api/v1/approval-chains/${TEST_ENTITY}/steps`, {
      required_permission: 'settings:finance:manage', min_amount: 50_000_000,
    })
    expect(add.statusCode, add.body).toBe(201)
    const step = JSON.parse(add.body).step
    expect(step.level).toBe(2)
    expect(Number(step.min_amount)).toBe(50_000_000)

    actAs(adminAuth)
    const upd = await req('PATCH', `/api/v1/approval-steps/${step.id}`, { min_amount: 75_000_000 })
    expect(upd.statusCode).toBe(200)
    expect(Number(JSON.parse(upd.body).step.min_amount)).toBe(75_000_000)

    // bukan langkah terakhir → boleh dihapus
    actAs(adminAuth)
    const del = await req('DELETE', `/api/v1/approval-steps/${step.id}`)
    expect(del.statusCode).toBe(200)

    // kembali ke kondisi awal (1 langkah) — jaga isolasi untuk test lain
    actAs(adminAuth)
    expect((await testChain()).approval_steps.length).toBe(1)
  }, 60_000)
})
