/**
 * IDEMPOTENSI UNTUK ANTREAN OFFLINE MOBILE — terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * APA YANG DIBUKTIKAN DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Antrean offline (`apps/mobile/lib/antrean.ts`) mengirim ULANG kiriman yang
 * timeout — dan HTTP tak menjanjikan apakah yang timeout itu sudah sampai.
 * Tanpa gerbang idempotensi, satu kiriman yang putus di tengah menjadi DUA
 * log progres, dan angka itu masuk ke bubble-up rab_items → kategori →
 * proyek → kurva-S → EVM. Proyek terlihat lebih maju daripada kenyataannya,
 * tanpa satu pun galat.
 *
 * ── Dan satu hal lagi yang sama pentingnya
 *
 * Permintaan TANPA kunci harus tetap bekerja seperti biasa. Bentuk gerbang
 * yang lama, `if (kunciIdem === null) return`, menghentikan handler untuk
 * keadaan itu juga — dibalas 200 tanpa menulis apa pun.
 *
 * Cacat itu NYATA dan sudah ada di `cash.ts` sejak gerbangnya dipasang; ia
 * tak pernah terlihat karena web app selalu mengirim kunci. Ketahuan
 * 2026-08-27 ketika pola yang sama disalin ke `progress-logs` dan enam test
 * geotag langsung merah. Uji terakhir di berkas ini menahannya kembali.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import progressRoutes from '../progress.js'

const TANDA = '[TEST-IDEM-MOBILE]'

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const kirim = (payload: Record<string, unknown>, kunci?: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/progress-logs`,
    payload,
    headers: {
      authorization: 'Bearer t',
      ...(kunci ? { 'idempotency-key': kunci } : {}),
    },
  })

const hitung = async (catatan: string) => {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM progress_logs WHERE notes = $1`, [catatan])
  return rows[0].n as number
}

async function purge() {
  await client.query(
    `DELETE FROM project_photos
      WHERE progress_log_id IN (SELECT id FROM progress_logs WHERE notes LIKE '${TANDA}%')`)
  await client.query(`DELETE FROM progress_logs WHERE notes LIKE '${TANDA}%'`)
  await client.query(`DELETE FROM idempotency_keys WHERE kunci LIKE '${TANDA}%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT p.id FROM projects p
      WHERE p.company_id IS NOT NULL
      ORDER BY p.created_at LIMIT 1`)
  if (!p[0]) throw new Error('tak ada proyek untuk diuji')
  projectId = p[0].id

  await purge()

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(progressRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('Idempotensi — kiriman ulang dari antrean offline mobile', () => {
  it('kunci SAMA dua kali → hanya SATU log tersimpan', async () => {
    const catatan = `${TANDA} sama`
    const kunci = `${TANDA}-a`

    const r1 = await kirim({ pct_overall: 42, notes: catatan }, kunci)
    expect(r1.statusCode).toBe(201)

    // Kiriman KEDUA — persis seperti antrean yang mengirim ulang sesudah
    // timeout, membawa kunci yang SAMA karena dibuat sekali saat mengantre.
    const r2 = await kirim({ pct_overall: 42, notes: catatan }, kunci)
    expect(r2.statusCode).toBe(201)
    expect(r2.headers['idempotent-replay']).toBe('true')

    expect(await hitung(catatan)).toBe(1)
  })

  it('kunci BERBEDA → dua baris, karena memang dua kiriman berbeda', async () => {
    const catatan = `${TANDA} beda`

    for (const k of ['b1', 'b2']) {
      const r = await kirim({ pct_overall: 43, notes: catatan }, `${TANDA}-${k}`)
      expect(r.statusCode).toBe(201)
    }

    expect(await hitung(catatan)).toBe(2)
  })

  it('TANPA kunci → tetap tersimpan (menahan gerbang yang menelan permintaan)', async () => {
    const catatan = `${TANDA} tanpa-kunci`

    const r = await kirim({ pct_overall: 44, notes: catatan })
    expect(r.statusCode).toBe(201)
    // Bukan sekadar 201: bentuk gerbang yang lama juga membalas sukses —
    // yang membedakannya adalah ADA TIDAKNYA baris di basis.
    expect(await hitung(catatan)).toBe(1)
  })
})
