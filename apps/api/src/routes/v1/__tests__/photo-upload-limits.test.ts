import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import progressRoutes from '../progress.js'
import mandorRoutes from '../mandor.js'

// ─────────────────────────────────────────────────────────────────────────────
// REGRESI bodyLimit vs base64 (temuan verifikasi OPEN-4).
//
// Endpoint upload foto menerima base64 JSON dgn cap 10MB file. Base64 menambah ~33%
// → body bisa ~13.4MB. Fastify default bodyLimit = 1MB, jadi TANPA bodyLimit eksplisit
// foto valid (mis. 2MB) ditolak 413 SEBELUM validasi MIME/size custom jalan —
// "gagal senyap" bentuk baru. Terbukti empiris sebelum patch: 2MB → 413.
//
// Test ini menjaga: (a) foto wajar LOLOS body limit, (b) batas atas TETAP ada.
// Tak butuh auth: 401 sudah membuktikan body ter-parse (lolos limit) — yang diuji
// di sini murni lapisan body parser, bukan otorisasi.
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT = '00000000-0000-0000-0000-000000000000'
const b64OfMb = (mb: number) => Buffer.alloc(mb * 1024 * 1024).toString('base64')

let app: FastifyInstance

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(progressRoutes)
  await app.register(mandorRoutes)
  await app.ready()
})
afterAll(async () => { await app.close() })

const ENDPOINTS = [
  { name: 'foto progress', url: `/api/v1/projects/${PROJECT}/photos/upload` },
  { name: 'foto nota kasbon', url: '/api/v1/mandor/kasbon-photo/upload' },
]

describe('Upload foto — bodyLimit menampung overhead base64', () => {
  for (const ep of ENDPOINTS) {
    it(`${ep.name}: foto ~2MB LOLOS body limit (tidak 413)`, async () => {
      const res = await app.inject({
        method: 'POST', url: ep.url,
        payload: { file_base64: b64OfMb(2), file_name: 'a.png' },
      })
      expect(res.statusCode, 'foto 2MB tak boleh ditolak body parser').not.toBe(413)
    })

    it(`${ep.name}: foto ~8MB (mendekati cap 10MB) LOLOS body limit`, async () => {
      const res = await app.inject({
        method: 'POST', url: ep.url,
        payload: { file_base64: b64OfMb(8), file_name: 'a.png' },
      })
      expect(res.statusCode, 'foto 8MB (base64 ~10.7MB) tak boleh 413').not.toBe(413)
    })

    it(`${ep.name}: payload berlebihan (~16MB) TETAP ditolak 413`, async () => {
      const res = await app.inject({
        method: 'POST', url: ep.url,
        payload: { file_base64: b64OfMb(16), file_name: 'a.png' },
      })
      expect(res.statusCode, 'batas atas harus tetap ada').toBe(413)
    })
  }
})
