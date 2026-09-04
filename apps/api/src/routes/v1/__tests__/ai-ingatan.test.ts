/**
 * RUTE INGATAN — dua jalan masuk, dan keduanya berpagar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBUKTIKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder memilih DUA jalan masuk (2026-08-15): asisten mengusulkan lalu
 * manusia menekan tombol, DAN halaman untuk mengisi sendiri. Test ini menjaga
 * keduanya tak saling melonggarkan.
 *
 *   1. `usul` TIDAK menulis apa pun — hanya menerbitkan token
 *   2. token hanya bisa dipakai SEKALI, dan hanya oleh pemiliknya
 *   3. ingatan BERSAMA butuh `ai:ingatan:kelola`, PRIBADI cukup `lihat`
 *   4. ingatan pribadi orang lain tak muncul di daftar
 *   5. bentuk yang salah ditolak SERVER, bukan cuma UI
 *
 * Poin 1 yang paling menentukan: kalau `usul` menulis langsung, seluruh
 * pertahanan prompt-injection runtuh — kalimat di dalam dokumen bisa membujuk
 * model memanggilnya, dan tak ada manusia di antaranya.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import aiIngatanRoutes from '../ai-ingatan.js'

let db: Client
let app: FastifyInstance
let companyId: string
let adminAuth: string

const KUNCI = 'ujirute'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: a } }, error: null } as never,
  )

const kirim = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({
    method,
    url,
    headers: { authorization: 'Bearer t' },
    ...(payload ? { payload } : {}),
  })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  // Gagal keras: test yang jalan tanpa identitas akan hijau karena 401,
  // bukan karena gerbangnya bekerja.
  if (!auth) throw new Error('tak ada pengguna ber-role admin untuk test ini')
  adminAuth = auth

  /*
    ⚠ Company DEFAULT milik admin yang login — BUKAN `LIMIT 1` sembarang.

    Rute memakai `request.companyId`, yang datang dari keanggotaan DEFAULT
    user yang login. `LIMIT 1` tanpa `ORDER BY` memilih company LAIN (diukur
    2026-09-04: test menyiapkan f7ff1870, rute membaca 0d7743dc), sehingga
    data yang disiapkan test tak pernah dibaca rute.

    Pola yang sama diperbaiki di `ai-chat.test.ts` — 5 gagal menjadi 13 lulus.
    Ditiru dari `gudang-kelola.test.ts:56`.
  */
  const { rows } = await db.query(
    `SELECT m.company_id AS id
       FROM company_members m
       JOIN users u ON u.id = m.user_id
      WHERE u.auth_id = $1 AND m.is_default AND m.is_active
      LIMIT 1`,
    [adminAuth],
  )
  if (!rows.length) throw new Error('admin uji tak punya keanggotaan default')
  companyId = rows[0].id

  app = Fastify()
  await app.register(aiIngatanRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await db.query(`DELETE FROM ai_ingatan WHERE company_id = $1 AND kunci LIKE $2`, [
    companyId, `${KUNCI}%`,
  ])
  await db.query(`DELETE FROM ai_token_tulis WHERE company_id = $1 AND jenis = 'ingatan'`, [
    companyId,
  ])
  await app.close()
  await db.end()
})

async function jumlahIngatan(): Promise<number> {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM ai_ingatan WHERE company_id = $1 AND kunci LIKE $2`,
    [companyId, `${KUNCI}%`],
  )
  return rows[0].n
}

describe('usul TIDAK menulis — hanya menerbitkan token', () => {
  it('usulan menghasilkan token tanpa menambah satu baris pun', async () => {
    actAs(adminAuth)
    const sebelum = await jumlahIngatan()

    const r = await kirim('POST', '/api/v1/ai/ingatan/usul', {
      kunci: `${KUNCI}-usul`, nilai: 'catatan uji', lapis: 'bersama',
    })

    expect(r.statusCode).toBe(200)
    expect(r.json().token).toBeTruthy()
    // Inilah barisnya. Kalau usul menulis langsung, seluruh pertahanan
    // prompt-injection runtuh.
    expect(await jumlahIngatan()).toBe(sebelum)
  })

  it('token bisa DIPAKAI — dan barulah ingatannya tersimpan', async () => {
    actAs(adminAuth)
    const usul = await kirim('POST', '/api/v1/ai/ingatan/usul', {
      kunci: `${KUNCI}-pakai`, nilai: 'lewat token', lapis: 'bersama',
    })
    const token = usul.json().token as string

    const r = await kirim('POST', '/api/v1/ai/ingatan', { token })
    expect(r.statusCode).toBe(200)
    expect(r.json().data.kunci).toBe(`${KUNCI}-pakai`)
  })

  it('token yang SAMA ditolak saat dipakai kedua kali', async () => {
    actAs(adminAuth)
    const usul = await kirim('POST', '/api/v1/ai/ingatan/usul', {
      kunci: `${KUNCI}-sekali`, nilai: 'x', lapis: 'bersama',
    })
    const token = usul.json().token as string

    expect((await kirim('POST', '/api/v1/ai/ingatan', { token })).statusCode).toBe(200)
    // Token yang bisa diklaim dua kali berarti ingatan yang sudah disetujui
    // bisa ditimpa tanpa persetujuan kedua.
    expect((await kirim('POST', '/api/v1/ai/ingatan', { token })).statusCode).toBe(409)
  })

  it('token tak dikenal → 410, bukan 500', async () => {
    actAs(adminAuth)
    const r = await kirim('POST', '/api/v1/ai/ingatan', { token: 'tak-pernah-ada' })
    expect(r.statusCode).toBe(410)
  })
})

describe('bentuk divalidasi SERVER, bukan cuma UI', () => {
  it('kunci kosong ditolak 422', async () => {
    actAs(adminAuth)
    const r = await kirim('POST', '/api/v1/ai/ingatan', {
      kunci: '   ', nilai: 'x', lapis: 'bersama',
    })
    expect(r.statusCode).toBe(422)
  })

  it('nilai 600 karakter ditolak — ingatan dikirim ulang TIAP ronde', async () => {
    actAs(adminAuth)
    const r = await kirim('POST', '/api/v1/ai/ingatan', {
      kunci: `${KUNCI}-panjang`, nilai: 'x'.repeat(600), lapis: 'bersama',
    })
    expect(r.statusCode).toBe(422)
  })

  it('lapis ngawur ditolak 422', async () => {
    actAs(adminAuth)
    const r = await kirim('POST', '/api/v1/ai/ingatan', {
      kunci: `${KUNCI}-lapis`, nilai: 'x', lapis: 'entah',
    })
    expect(r.statusCode).toBe(422)
  })

  it('ingatan PRIBADI ber-izin ditolak — ia sudah hanya milik pemiliknya', async () => {
    // Izin di atas ingatan pribadi hanya bisa mengunci satu-satunya pihak
    // yang berhak membacanya.
    actAs(adminAuth)
    const r = await kirim('POST', '/api/v1/ai/ingatan', {
      kunci: `${KUNCI}-pribadi-izin`, nilai: 'x', lapis: 'pribadi',
      izin_minimum: 'finance:view',
    })
    expect(r.statusCode).toBe(422)
  })

  it('proyek tenant lain ditolak 404', async () => {
    actAs(adminAuth)
    const r = await kirim('POST', '/api/v1/ai/ingatan/usul', {
      kunci: `${KUNCI}-proyekasing`, nilai: 'x', lapis: 'bersama',
      project_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(r.statusCode).toBe(404)
  })
})

describe('daftar & hapus', () => {
  it('daftar memuat ingatan yang baru disimpan', async () => {
    actAs(adminAuth)
    await kirim('POST', '/api/v1/ai/ingatan', {
      kunci: `${KUNCI}-daftar`, nilai: 'terlihat', lapis: 'bersama',
    })
    const r = await kirim('GET', '/api/v1/ai/ingatan')
    expect(r.statusCode).toBe(200)
    const kunci = (r.json().data as Array<{ kunci: string }>).map((x) => x.kunci)
    expect(kunci).toContain(`${KUNCI}-daftar`)
  })

  it('menyimpan kunci yang SAMA menimpa, bukan menumpuk', async () => {
    // Tanpa ini, "klien minta laporan Jumat" dan "…Kamis" jadi dua ingatan
    // yang saling membantah, dan model membaca keduanya.
    actAs(adminAuth)
    await kirim('POST', '/api/v1/ai/ingatan', {
      kunci: `${KUNCI}-timpa`, nilai: 'versi lama', lapis: 'bersama',
    })
    await kirim('POST', '/api/v1/ai/ingatan', {
      kunci: `${KUNCI}-timpa`, nilai: 'versi baru', lapis: 'bersama',
    })
    const { rows } = await db.query(
      `SELECT nilai FROM ai_ingatan WHERE company_id = $1 AND kunci = $2`,
      [companyId, `${KUNCI}-timpa`],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].nilai).toBe('versi baru')
  })

  it('hapus benar-benar menghapus; hapus ulang → 404', async () => {
    actAs(adminAuth)
    const simpan = await kirim('POST', '/api/v1/ai/ingatan', {
      kunci: `${KUNCI}-hapus`, nilai: 'x', lapis: 'bersama',
    })
    const id = simpan.json().data.id as string

    expect((await kirim('DELETE', `/api/v1/ai/ingatan/${id}`)).statusCode).toBe(200)
    // Penghapusan yang gagal senyap membuat orang mengira asistennya sudah
    // lupa, padahal ia masih mengingat.
    expect((await kirim('DELETE', `/api/v1/ai/ingatan/${id}`)).statusCode).toBe(404)
  })
})

describe('katalog izin dikirim SERVER, bukan dipaku di UI', () => {
  it('izin-tersedia mengembalikan daftar', async () => {
    actAs(adminAuth)
    const r = await kirim('GET', '/api/v1/ai/ingatan/izin-tersedia')
    expect(r.statusCode).toBe(200)
    expect((r.json().data as unknown[]).length).toBeGreaterThan(0)
  })
})
