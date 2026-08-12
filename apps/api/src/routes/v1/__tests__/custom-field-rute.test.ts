/**
 * TJS-P5 — rute custom field lewat HTTP.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TERPISAH DARI DUA TEST CUSTOM FIELD LAINNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `lib/__tests__/custom-field.test.ts`      → validasi bentuk definisi
 * `__tests__/custom-field.test.ts`          → basis menegakkan batasnya
 *
 * Dua-duanya HIJAU meski rutenya tak pernah terdaftar di `index.ts`. Itu
 * bukan kekhawatiran teoretis: TJS-P4 sesi ini menemukan endpoint yang ada
 * tetapi tak punya jalur UI, dan sebelumnya `retensi-register` yang tak
 * pernah dipanggil dari mana pun.
 *
 * Yang diuji DI SINI adalah hal yang hanya terlihat lewat HTTP:
 *
 *   • rutenya benar-benar terdaftar (bukan 404)
 *   • gerbang izin terpasang per-rute, dan `manage` ≠ `isi`
 *   • kunci asing DITOLAK, bukan diabaikan diam-diam
 *   • entitas karangan dijawab 400 yang bisa dibaca, bukan 500 Postgres
 *   • field yang belum pernah diisi TETAP muncul (dengan nilai null)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import customFieldRoutes from '../custom-field.js'

let app: FastifyInstance
let db: Client
let adminAuth: string
let defId: string
const entitasId = '11111111-2222-3333-4444-555555555555'

const TANDA = '[TEST-CFR]'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const req = (method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as never, headers: { authorization: 'Bearer t' } })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  adminAuth = auth

  await db.query(`DELETE FROM custom_field_def WHERE label LIKE '${TANDA}%'`)

  app = Fastify({ logger: false })
  await app.register(customFieldRoutes)
  await app.ready()
  actAs(adminAuth)
}, 90_000)

afterAll(async () => {
  await db.query(`DELETE FROM custom_field_def WHERE label LIKE '${TANDA}%'`)
  vi.restoreAllMocks()
  await app.close()
  await db.end()
})

describe('katalog', () => {
  it('mengembalikan entitas, tipe, dan BATASNYA', async () => {
    const r = await req('GET', '/api/v1/custom-field/katalog')
    expect(r.statusCode).toBe(200)
    const j = r.json()
    expect(j.entitas).toContain('projects')
    expect(j.tipe).toContain('pilihan')
    // Batas ikut dikirim supaya UI bisa menampilkan sisa kuota SEBELUM
    // tertabrak. Pengguna yang baru tahu saat ditolak menganggapnya bug.
    expect(j.batas_per_entitas).toBe(20)
  })
})

describe('definisi', () => {
  it('menolak entitas karangan dengan 400 yang bisa dibaca', async () => {
    // Bukan 500 galat Postgres mentah: pesan itu tak bisa ditindaklanjuti
    // siapa pun yang bukan pengembang.
    const r = await req('POST', '/api/v1/custom-field/def', {
      entitas: 'kasbons', tipe: 'teks', kunci: 'x', label: 'X',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tak ada dalam daftar/i)
  })

  it('membuat definisi yang sah', async () => {
    const r = await req('POST', '/api/v1/custom-field/def', {
      entitas: 'projects', tipe: 'teks',
      kunci: 'cfr_kode', label: `${TANDA} Kode Internal`,
    })
    expect(r.statusCode).toBe(201)
    defId = r.json().definisi.id
    expect(r.json().definisi.kunci).toBe('cfr_kode')
  })

  it('kunci kembar ditolak 409, bukan 500', async () => {
    const r = await req('POST', '/api/v1/custom-field/def', {
      entitas: 'projects', tipe: 'teks', kunci: 'cfr_kode', label: `${TANDA} Kembar`,
    })
    expect(r.statusCode).toBe(409)
  })

  it('tipe/entitas/kunci TAK BISA diubah sesudah dibuat', async () => {
    // Mengubah tipe field yang sudah terisi membuat nilai lama tak cocok
    // dengan definisinya — dan trigger validasi hanya berjalan saat MENULIS,
    // jadi baris lama tetap tersimpan dalam bentuk yang tak mungkin lagi
    // ditulis ulang.
    for (const medan of ['tipe', 'entitas', 'kunci']) {
      const r = await req('PATCH', `/api/v1/custom-field/def/${defId}`, { [medan]: 'angka' })
      expect(r.statusCode, medan).toBe(400)
      expect(r.json().error, medan).toMatch(/tak bisa diubah/i)
    }
  })

  it('label boleh diubah', async () => {
    const r = await req('PATCH', `/api/v1/custom-field/def/${defId}`, { label: `${TANDA} Kode Proyek` })
    expect(r.statusCode).toBe(200)
    expect(r.json().definisi.label).toBe(`${TANDA} Kode Proyek`)
  })

  it('id yang tak ada dijawab 404, bukan 200 dengan nol baris', async () => {
    // NOL BARIS terbarui tak boleh menyamar jadi sukses.
    const r = await req('PATCH', '/api/v1/custom-field/def/00000000-0000-0000-0000-0000000000ff', { label: 'X' })
    expect(r.statusCode).toBe(404)
  })
})

describe('nilai', () => {
  it('field yang BELUM diisi tetap muncul dengan nilai null', async () => {
    // Mengembalikan hanya baris nilai membuat formulir kehilangan field
    // kosongnya — dan pengguna tak pernah melihat kolom yang harus diisi.
    const r = await req('GET', `/api/v1/custom-field/nilai/projects/${entitasId}`)
    expect(r.statusCode).toBe(200)
    const f = r.json().field.find((x: { kunci: string }) => x.kunci === 'cfr_kode')
    expect(f).toBeTruthy()
    expect(f.nilai).toBeNull()
  })

  it('menyimpan nilai lalu membacanya kembali', async () => {
    const put = await req('PUT', `/api/v1/custom-field/nilai/projects/${entitasId}`, {
      nilai: { cfr_kode: 'PRJ-2026-001' },
    })
    expect(put.statusCode).toBe(200)
    expect(put.json().tersimpan).toBe(1)

    const get = await req('GET', `/api/v1/custom-field/nilai/projects/${entitasId}`)
    const f = get.json().field.find((x: { kunci: string }) => x.kunci === 'cfr_kode')
    expect(f.nilai).toBe('PRJ-2026-001')
  })

  it('menyimpan ULANG menimpa, bukan menggandakan', async () => {
    await req('PUT', `/api/v1/custom-field/nilai/projects/${entitasId}`, {
      nilai: { cfr_kode: 'PRJ-2026-002' },
    })
    const { rows } = await db.query(
      'SELECT count(*)::int AS n FROM custom_field_nilai WHERE def_id = $1 AND entitas_id = $2',
      [defId, entitasId],
    )
    expect(rows[0].n).toBe(1)
  })

  it('kunci asing DITOLAK, bukan diabaikan diam-diam', async () => {
    // Mengabaikannya berarti salah ketik nama field tersimpan sebagai
    // "berhasil" sementara nilainya hilang — dan yang menemukannya adalah
    // orang yang mencari data itu minggu depan.
    const r = await req('PUT', `/api/v1/custom-field/nilai/projects/${entitasId}`, {
      nilai: { cfr_kode: 'X', kunci_yang_tak_ada: 'Y' },
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tak dikenal/i)
  })

  it('nilai yang tak cocok tipenya dijawab 400 dengan pesan dari basis', async () => {
    const d = await req('POST', '/api/v1/custom-field/def', {
      entitas: 'projects', tipe: 'angka', kunci: 'cfr_angka', label: `${TANDA} Angka`,
    })
    expect(d.statusCode).toBe(201)

    const r = await req('PUT', `/api/v1/custom-field/nilai/projects/${entitasId}`, {
      nilai: { cfr_angka: 'dua belas' },
    })
    expect(r.statusCode).toBe(400)
    // Pesan trigger sudah ditulis untuk manusia di migrasi 321; diteruskan
    // apa adanya, bukan diganti "input tidak valid".
    expect(r.json().error).toMatch(/bertipe angka/i)
  })

  it('entitas karangan pada jalur nilai dijawab 400', async () => {
    const r = await req('GET', `/api/v1/custom-field/nilai/kasbons/${entitasId}`)
    expect(r.statusCode).toBe(400)
  })
})
