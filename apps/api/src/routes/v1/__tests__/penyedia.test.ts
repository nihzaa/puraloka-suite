/**
 * S1 — Registry penyedia layanan, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBUKTIKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * · rahasia TAK BISA masuk registry — meski pemanggil memaksanya
 * · adaptor divalidasi terhadap yang BENAR-BENAR dikenali kode
 * · uji koneksi TAK PERNAH mengembalikan nilai kunci
 * · isolasi tenant: penyedia tenant lain tak terlihat
 *
 * ── Kenapa "rahasia tak bisa masuk" pantas punya test sendiri
 *
 * Kredensial di dua tempat berarti satu yang tak terjaga. Penjaga
 * `audit-kredensial-tak-bocor.mjs` berambang NOL, tapi ia memeriksa KODE —
 * ia tak bisa tahu apakah server benar-benar menolak muatan yang dikirim
 * pemanggil. Itu yang diuji di sini.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import penyediaRoutes from '../penyedia.js'

let app: FastifyInstance
let db: Client
let adminAuth: string
let companyId: string

const TANDA = '[UJI-S1]'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: a } }, error: null } as never,
  )

const kirim = (badan: unknown) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/penyedia',
    payload: badan as never,
    headers: { authorization: 'Bearer t' },
  })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  adminAuth = auth

  const { rows } = await db.query(`SELECT id FROM companies WHERE code = 'puraloka-persada'`)
  companyId = rows[0].id

  app = Fastify()
  await app.register(penyediaRoutes)
  await app.ready()
}, 60_000)

afterAll(async () => {
  await db.query(`DELETE FROM penyedia_layanan WHERE nama LIKE $1`, [`${TANDA}%`])
  await app.close()
  await db.end()
})

beforeEach(async () => {
  vi.restoreAllMocks()
  actAs(adminAuth)
  await db.query(`DELETE FROM penyedia_layanan WHERE nama LIKE $1`, [`${TANDA}%`])
})

describe('rahasia TIDAK BISA masuk registry', () => {
  it('field bernama api_key DITOLAK, meski dikirim pemanggil', async () => {
    const r = await kirim({
      jenis: 'wa',
      adaptor: 'evolution',
      nama: `${TANDA} Coba Rahasia`,
      konfigurasi: { baseUrl: 'http://x', api_key: 'rahasia-yang-tak-boleh-masuk' },
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/rahasia|Kredensial/i)
  })

  it.each(['token', 'secret', 'password', 'sandi', 'apiKey'])(
    "field '%s' juga ditolak — daftarnya bukan satu nama",
    async (nama) => {
      const r = await kirim({
        jenis: 'wa',
        adaptor: 'evolution',
        nama: `${TANDA} ${nama}`,
        konfigurasi: { [nama]: 'x' },
      })
      expect(r.statusCode).toBe(422)
    },
  )

  it('tabel registry memang TAK PUNYA kolom rahasia', async () => {
    // Pertahanan kedua: sekalipun route bocor, kolomnya tak ada.
    const { rows } = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'penyedia_layanan'`,
    )
    const kolom = rows.map((r) => r.column_name as string)
    for (const terlarang of ['api_key', 'kunci', 'secret', 'token', 'nilai_enc']) {
      expect(kolom, `kolom '${terlarang}' tak boleh ada`).not.toContain(terlarang)
    }
  })
})

describe('adaptor divalidasi terhadap yang DIKENALI kode', () => {
  it('adaptor karangan ditolak — bukan tersimpan lalu gagal saat dipakai', async () => {
    const r = await kirim({
      jenis: 'wa',
      adaptor: 'penyedia-yang-tidak-ada',
      nama: `${TANDA} Karangan`,
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/tidak dikenali/i)
  })

  it('adaptor AI tidak sah untuk jenis WA', async () => {
    // Pasangan silang: `anthropic` nyata, tapi bukan penyedia WhatsApp.
    const r = await kirim({ jenis: 'wa', adaptor: 'anthropic', nama: `${TANDA} Silang` })
    expect(r.statusCode).toBe(422)
  })

  it('pasangan yang sah diterima', async () => {
    const r = await kirim({
      jenis: 'wa',
      adaptor: 'fonnte',
      nama: `${TANDA} Fonnte`,
      konfigurasi: {},
      kunci_kredensial: 'WA_API_KEY',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().ok).toBe(true)
  })

  it('jenis tak dikenal ditolak — bukan diterima sebagai kategori baru', async () => {
    const r = await kirim({ jenis: 'email', adaptor: 'apa-saja', nama: `${TANDA} Email` })
    expect(r.statusCode).toBe(422)
  })
})

describe('katalog adaptor — UI tak boleh menebak', () => {
  it('mengembalikan adaptor WA dan AI yang benar-benar ada di kode', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/penyedia/adaptor',
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode).toBe(200)
    const b = r.json() as { wa: Array<{ kunci: string }>; ai: Array<{ kunci: string }> }

    // Kalau daftar ini kosong, UI menampilkan dropdown kosong dan orang
    // menyimpulkan fiturnya rusak.
    expect(b.wa.length).toBeGreaterThan(0)
    expect(b.ai.length).toBeGreaterThan(0)
    expect(b.wa.map((a) => a.kunci)).toContain('evolution')
    expect(b.wa.map((a) => a.kunci)).toContain('fonnte')

    // Bentuknya SERAGAM antar jenis — sumber AI memakai `id`, dan route
    // memetakannya ke `kunci`. Kalau pemetaan itu lepas, UI harus mengenali
    // dua nama untuk hal yang sama.
    for (const a of [...b.wa, ...b.ai]) {
      expect(a.kunci).toBeTruthy()
    }
  })
})

describe('uji koneksi tak membocorkan kunci', () => {
  it('tanpa kredensial → gagal dengan pesan yang MENGARAHKAN, bukan bocor', async () => {
    const buat = await kirim({
      jenis: 'wa',
      adaptor: 'fonnte',
      nama: `${TANDA} Tanpa Kunci`,
      kunci_kredensial: 'KUNCI_YANG_TIDAK_ADA_DI_KATALOG',
    })
    expect(buat.statusCode).toBe(200)
    const id = buat.json().id as string

    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/penyedia/${id}/uji`,
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode).toBe(200)
    const b = r.json() as { ok: boolean; pesan: string }
    expect(b.ok).toBe(false)
    // Pesannya menyebut APA YANG HARUS DILAKUKAN, bukan sekadar "gagal".
    expect(b.pesan).toMatch(/Kredensial/i)
  })

  it('hasil uji TIDAK memuat nilai kunci apa pun', async () => {
    const buat = await kirim({
      jenis: 'ai', adaptor: 'anthropic', nama: `${TANDA} AI`,
      kunci_kredensial: 'ANTHROPIC_API_KEY',
    })
    const id = buat.json().id as string

    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/penyedia/${id}/uji`,
      headers: { authorization: 'Bearer t' },
    })
    const teks = r.body
    // Bentuk kunci Anthropic: `sk-ant-...`. Ia TAK BOLEH muncul di balasan
    // mana pun, termasuk di pesan galat.
    expect(teks).not.toMatch(/sk-ant/)
  })

  it('uji mencatat JEJAK, bukan hanya status terakhir', async () => {
    const buat = await kirim({
      jenis: 'ai', adaptor: 'anthropic', nama: `${TANDA} Jejak`,
      kunci_kredensial: 'ANTHROPIC_API_KEY',
    })
    const id = buat.json().id as string

    await app.inject({
      method: 'POST', url: `/api/v1/penyedia/${id}/uji`,
      headers: { authorization: 'Bearer t' },
    })

    // "Sekarang bagaimana" dijawab kolom status; "sejak kapan" dan "sesering
    // apa" hanya bisa dijawab jejak.
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM penyedia_uji_log WHERE penyedia_id = $1`, [id])
    expect(rows[0].n).toBeGreaterThan(0)
  })
})

describe('isolasi tenant', () => {
  it('penyedia tenant lain tidak terbaca', async () => {
    // Tenant kedua dibuat langsung di basis — route-nya tak punya jalan
    // membuat penyedia untuk company lain, dan itu memang yang diuji.
    const { rows: pemilik } = await db.query(
      `SELECT owner_user_id FROM companies WHERE code = 'puraloka-persada'`)
    const { rows: lain } = await db.query(
      `INSERT INTO companies (code, name, owner_user_id) VALUES ($1, $2, $3)
       RETURNING id`,
      [`uji-s1-${Date.now()}`, `${TANDA} Tenant Lain`, pemilik[0].owner_user_id],
    )

    await db.query(
      `INSERT INTO penyedia_layanan (company_id, jenis, adaptor, nama)
       VALUES ($1, 'wa', 'evolution', $2)`,
      [lain[0].id, `${TANDA} Milik Tenant Lain`],
    )

    const r = await app.inject({
      method: 'GET', url: '/api/v1/penyedia',
      headers: { authorization: 'Bearer t' },
    })
    const b = r.json() as { data: Array<{ nama: string }> }
    expect(b.data.some((p) => p.nama.includes('Milik Tenant Lain'))).toBe(false)

    await db.query(`DELETE FROM penyedia_layanan WHERE company_id = $1`, [lain[0].id])
    await db.query(`UPDATE companies SET is_active = false WHERE id = $1`, [lain[0].id])
  })

  it('nama ganda per jenis ditolak basis', async () => {
    const a = await kirim({ jenis: 'wa', adaptor: 'fonnte', nama: `${TANDA} Kembar` })
    expect(a.statusCode).toBe(200)
    const b = await kirim({ jenis: 'wa', adaptor: 'fonnte', nama: `${TANDA} Kembar` })
    // Daftar yang memuat dua nama sama membuat orang memilih yang salah.
    expect(b.statusCode).toBe(500)
  })
})
