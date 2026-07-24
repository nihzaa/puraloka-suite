import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import notificationRuleRoutes from '../notification-rules.js'

// Kelola aturan routing notifikasi dari UI (2B).
// Otorisasi: baca = authenticated, tulis = notifications:rules:manage.
//
// SAFETY yang diuji: aturan AKTIF tidak boleh kehilangan penerima terakhirnya —
// itu keadaan senyap (notifikasi menguap tanpa jejak), persis bug #47. Menonaktifkan
// aturan tetap boleh; niatnya eksplisit dan terekam audit.
//
// ISOLASI: semua mutasi memakai aturan khusus test, BUKAN aturan event nyata,
// supaya tak pernah mengubah siapa yang dinotifikasi di dev.

const TEST_EVENT = '__test_event__'

let app: FastifyInstance
let client: Client
let adminAuth: string
let pmAuth: string

const actAs = (a: string) => {
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
}
const req = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as never, headers: { authorization: 'Bearer t' } })

const testRule = async () => {
  const body = JSON.parse((await req('GET', '/api/v1/notification-rules')).body)
  return body.rules.find((r: { event_type: string }) => r.event_type === TEST_EVENT)
}

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(notificationRuleRoutes)
  await app.ready()

  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) ?? ''
  pmAuth = (await authIdForRole(client, 'pm')) ?? ''

  await client.query(`DELETE FROM notification_rules WHERE event_type = $1`, [TEST_EVENT])
  const { rows } = await client.query(
    `INSERT INTO notification_rules (event_type, label) VALUES ($1, 'Aturan Uji') RETURNING id`, [TEST_EVENT])
  await client.query(
    `INSERT INTO notification_rule_targets (rule_id, target_type, role_name) VALUES ($1, 'role', 'admin')`,
    [rows[0].id])
}, 60_000)

afterEach(() => { vi.restoreAllMocks() })
afterAll(async () => {
  await client.query(`DELETE FROM notification_rules WHERE event_type = $1`, [TEST_EVENT])
  await app.close(); await client.end()
})

describe('Kelola aturan notifikasi — otorisasi', () => {
  it('baca: authenticated boleh melihat aturan + penerimanya', async () => {
    actAs(pmAuth)
    const r = await req('GET', '/api/v1/notification-rules')
    expect(r.statusCode).toBe(200)
    const rules = JSON.parse(r.body).rules
    expect(Array.isArray(rules)).toBe(true)
    expect(rules.length).toBeGreaterThan(0)
  }, 30_000)

  it('NEGATIF: tanpa notifications:rules:manage TIDAK boleh menambah penerima (403)', async () => {
    actAs(pmAuth)
    const r = await req('POST', `/api/v1/notification-rules/${TEST_EVENT}/targets`, {
      target_type: 'role', role_name: 'pm',
    })
    expect(r.statusCode).toBe(403)
  }, 30_000)

  it('NEGATIF: tanpa izin TIDAK boleh menonaktifkan aturan (403)', async () => {
    actAs(pmAuth)
    const r = await req('PATCH', `/api/v1/notification-rules/${TEST_EVENT}`, { is_active: false })
    expect(r.statusCode).toBe(403)
  }, 30_000)
})

describe('Kelola aturan notifikasi — validasi & SAFETY', () => {
  it('SAFETY: penerima TERAKHIR tak boleh dihapus selagi aturan AKTIF', async () => {
    actAs(adminAuth)
    const rule = await testRule()
    expect(rule.notification_rule_targets.length, 'prasyarat: tepat 1 penerima').toBe(1)

    actAs(adminAuth)
    const r = await req('DELETE', `/api/v1/notification-rule-targets/${rule.notification_rule_targets[0].id}`)
    expect(r.statusCode).toBe(400)
    expect(JSON.parse(r.body).error).toMatch(/penerima terakhir/i)
  }, 30_000)

  it('role/permission tak dikenal ditolak (FK), bukan tersimpan diam-diam', async () => {
    actAs(adminAuth)
    const r = await req('POST', `/api/v1/notification-rules/${TEST_EVENT}/targets`, {
      target_type: 'role', role_name: '__bukan_role__',
    })
    expect(r.statusCode).toBe(400)
    expect(JSON.parse(r.body).error).toMatch(/tidak dikenal/i)
  }, 30_000)

  it('target_type tak valid ditolak', async () => {
    actAs(adminAuth)
    const r = await req('POST', `/api/v1/notification-rules/${TEST_EVENT}/targets`, { target_type: 'siapa_saja' })
    expect(r.statusCode).toBe(400)
  }, 30_000)

  it('aturan tak dikenal → 404', async () => {
    actAs(adminAuth)
    const r = await req('PATCH', '/api/v1/notification-rules/__bukan_event__', { is_active: true })
    expect(r.statusCode).toBe(404)
  }, 30_000)
})

describe('Siklus penuh: tambah penerima → hapus (bersih)', () => {
  it('admin bisa menambah penerima kontekstual lalu menghapusnya', async () => {
    actAs(adminAuth)
    const add = await req('POST', `/api/v1/notification-rules/${TEST_EVENT}/targets`, { target_type: 'project_pm' })
    expect(add.statusCode, add.body).toBe(201)
    const target = JSON.parse(add.body).target
    expect(target.target_type).toBe('project_pm')

    // penerima kembar ditolak
    actAs(adminAuth)
    const dup = await req('POST', `/api/v1/notification-rules/${TEST_EVENT}/targets`, { target_type: 'project_pm' })
    expect(dup.statusCode).toBe(409)

    // bukan penerima terakhir → boleh dihapus
    actAs(adminAuth)
    const del = await req('DELETE', `/api/v1/notification-rule-targets/${target.id}`)
    expect(del.statusCode).toBe(200)

    actAs(adminAuth)
    expect((await testRule()).notification_rule_targets.length).toBe(1)
  }, 60_000)
})
