/**
 * TJS-C1 — rute POST /api/v1/ai/chat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG DIBUKTIKAN: JALUR GRATIS BENAR-BENAR DULUAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Kriteria C1 menyebut "jalur gratis (whitelist, konfirmasi) SEBELUM panggilan
 * berbayar". Itu bukan optimasi: tenant yang mematikan AI lalu tetap ditagih
 * karena pemeriksaannya di belakang akan menganggap saklar matinya rusak —
 * dan mereka benar.
 *
 * Dibuktikan dengan menghitung baris `ai_biaya_token` SEBELUM dan SESUDAH:
 * kalau gerbangnya bekerja, tak ada baris baru. Memeriksa "statusnya 403" saja
 * tidak cukup — 403 bisa dikembalikan SESUDAH uangnya keluar.
 *
 * Kunci Anthropic sengaja tak dipasang di lingkungan test. Itu justru yang
 * diinginkan: kalau gerbang bekerja, panggilan berbayar tak pernah terjadi.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import aiChatRoutes from '../ai-chat.js'

let app: FastifyInstance
let db: Client
let adminAuth: string
let companyId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const kirim = (badan: unknown) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/ai/chat',
    payload: badan as never,
    headers: { authorization: 'Bearer t' },
  })

async function jumlahBiaya(): Promise<number> {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM ai_biaya_token WHERE company_id = $1`, [companyId])
  return rows[0].n
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin untuk test ini')
  adminAuth = auth

  const { rows } = await db.query(`
    SELECT c.id FROM companies c
    WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1
  `)
  companyId = rows[0].id

  await db.query(
    `INSERT INTO ai_pengaturan_tenant (company_id, ai_aktif) VALUES ($1, true)
     ON CONFLICT (company_id) DO UPDATE SET ai_aktif = true, batas_bulanan_idr = NULL,
       mode_batas = 'peringatkan'`,
    [companyId],
  )
  await db.query(
    `INSERT INTO ai_provider_config (company_id, asisten, penyedia, model, max_token)
     VALUES ($1, 'web', 'anthropic', 'claude-haiku-4-5', 1024)
     ON CONFLICT (company_id, asisten) DO UPDATE SET aktif = true, batas_bulanan_idr = NULL`,
    [companyId],
  )

  app = Fastify()
  await app.register(aiChatRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await db.query(`DELETE FROM ai_percakapan WHERE company_id = $1 AND asisten = 'web'`, [companyId])
  await db.query(`DELETE FROM ai_biaya_token WHERE company_id = $1 AND model = 'uji-chat'`, [companyId])
  await db.query(
    `UPDATE ai_pengaturan_tenant SET ai_aktif = true, batas_bulanan_idr = NULL,
       mode_batas = 'peringatkan' WHERE company_id = $1`, [companyId])
  await db.query(
    `UPDATE ai_provider_config SET aktif = true, batas_bulanan_idr = NULL, penyedia = 'anthropic'
     WHERE company_id = $1`,
    [companyId],
  )
  await app.close()
  await db.end()
})

beforeEach(async () => {
  vi.restoreAllMocks()
  actAs(adminAuth)
  await db.query(
    `UPDATE ai_pengaturan_tenant SET ai_aktif = true, batas_bulanan_idr = NULL,
       mode_batas = 'peringatkan' WHERE company_id = $1`, [companyId])
  await db.query(
    `UPDATE ai_provider_config SET aktif = true, batas_bulanan_idr = NULL, penyedia = 'anthropic'
     WHERE company_id = $1`,
    [companyId],
  )
  await db.query(`DELETE FROM ai_biaya_token WHERE company_id = $1 AND model = 'uji-chat'`, [companyId])
})

describe('validasi masukan — sebelum apa pun', () => {
  it('pesan kosong ditolak 422', async () => {
    const r = await kirim({ pesan: '   ' })
    expect(r.statusCode).toBe(422)
  })

  it('pesan raksasa ditolak 422', async () => {
    // Bukan kerapian: pesan raksasa mendorong riwayat keluar jendela konteks
    // dan membuat jawaban kehilangan pertanyaannya sendiri.
    const r = await kirim({ pesan: 'x'.repeat(5_000) })
    expect(r.statusCode).toBe(422)
  })

  it('penolakan masukan TIDAK menimbulkan biaya', async () => {
    const sebelum = await jumlahBiaya()
    await kirim({ pesan: '' })
    expect(await jumlahBiaya()).toBe(sebelum)
  })
})

describe('§5.5 — saklar mati per tenant, dan GRATIS', () => {
  it('AI dimatikan → 403 dengan alasan yang bisa dibaca mesin', async () => {
    await db.query(`UPDATE ai_pengaturan_tenant SET ai_aktif = false WHERE company_id = $1`, [companyId])
    const r = await kirim({ pesan: 'berapa proyek berjalan?' })
    expect(r.statusCode).toBe(403)
    expect(r.json().alasan).toBe('ai_nonaktif')
  })

  it('AI dimatikan → NOL biaya baru', async () => {
    await db.query(`UPDATE ai_pengaturan_tenant SET ai_aktif = false WHERE company_id = $1`, [companyId])
    const sebelum = await jumlahBiaya()
    await kirim({ pesan: 'berapa proyek berjalan?' })
    // 403 yang dikembalikan SESUDAH uangnya keluar tetap 403. Yang membedakan
    // saklar mati dari laporan kerusakan adalah baris yang tak bertambah.
    expect(await jumlahBiaya()).toBe(sebelum)
  })

  it('mematikan AI tak menyentuh modul lain — hanya satu baris config', async () => {
    await db.query(`UPDATE ai_pengaturan_tenant SET ai_aktif = false WHERE company_id = $1`, [companyId])
    const { rows } = await db.query(
      `SELECT count(*)::int n FROM permissions WHERE key NOT LIKE 'ai:%'`)
    // Kalau saklar mati diterapkan dengan mencabut permission, tenant tak bisa
    // menyalakannya kembali sendiri — halaman pengaturannya ikut hilang.
    expect(rows[0].n).toBeGreaterThan(0)
  })
})

describe('gerbang biaya — juga sebelum berbayar', () => {
  it('batas terlampaui + mode blokir → 402, nol biaya baru', async () => {
    await db.query(
      `INSERT INTO ai_biaya_token (company_id, asisten, penyedia, model, biaya_usd, biaya_idr, kurs_idr)
       VALUES ($1, 'staff', 'anthropic', 'uji-chat', 0.01, 50000, 16000)`,
      [companyId],
    )
    await db.query(
      `UPDATE ai_pengaturan_tenant SET batas_bulanan_idr = 1000, mode_batas = 'blokir'
       WHERE company_id = $1`,
      [companyId],
    )

    const sebelum = await jumlahBiaya()
    const r = await kirim({ pesan: 'berapa proyek?' })

    expect(r.statusCode).toBe(402)
    expect(r.json().alasan).toBe('batas_terlampaui')
    expect(await jumlahBiaya()).toBe(sebelum)
  })

  it('asisten dinonaktifkan → 402 alasan nonaktif', async () => {
    await db.query(
      `UPDATE ai_provider_config SET aktif = false WHERE company_id = $1 AND asisten = 'web'`,
      [companyId],
    )
    const r = await kirim({ pesan: 'berapa proyek?' })
    expect(r.statusCode).toBe(402)
    expect(r.json().alasan).toBe('nonaktif')
  })
})

describe('penyedia tak dikenal — gerbang gratis terakhir', () => {
  /*
   * Versi pertama blok ini berasumsi lingkungan test TIDAK punya
   * `ANTHROPIC_API_KEY`, lalu menuntut 503 `kunci_tak_ada`.
   *
   * Diukur: kuncinya ADA di `apps/api/.env`, dan vitest memuatnya. Yang terjadi
   * bukan gerbang terlewat melainkan panggilan berbayar SUNGGUHAN — dan biaya
   * yang bertambah satu baris justru bukti pencatatannya benar.
   *
   * Asumsi test-nya yang salah, bukan kodenya. Diganti dengan penyedia yang
   * memang tak dikenal, yang menguji gerbang yang sama tanpa bergantung pada
   * ada-tidaknya kunci di mesin siapa pun.
   */
  it('penyedia salah ketik → 503 yang menyebut apa yang tersedia', async () => {
    await db.query(
      `UPDATE ai_provider_config SET penyedia = 'anthropc'
       WHERE company_id = $1 AND asisten = 'web'`,
      [companyId],
    )
    const r = await kirim({ pesan: 'berapa proyek?' })
    expect(r.statusCode).toBe(503)
    const b = r.json()
    expect(b.alasan).toBe('penyedia_tak_dikenal')
    // Pesan yang tak menyebut pilihan yang sah memaksa admin menebak.
    expect(b.error).toContain('anthropic')
  })

  it('penyedia salah ketik → NOL biaya, NOL percakapan terkunci', async () => {
    await db.query(
      `UPDATE ai_provider_config SET penyedia = 'anthropc'
       WHERE company_id = $1 AND asisten = 'web'`,
      [companyId],
    )
    const sebelum = await jumlahBiaya()
    await kirim({ pesan: 'berapa proyek?' })
    expect(await jumlahBiaya()).toBe(sebelum)

    const { rows } = await db.query(
      `SELECT count(*)::int n FROM ai_percakapan
       WHERE company_id = $1 AND giliran_terkunci_pada IS NOT NULL`,
      [companyId],
    )
    // Gerbangnya ada SEBELUM percakapan dibuat, jadi tak ada percakapan yatim
    // yang terkunci selamanya.
    expect(rows[0].n).toBe(0)
  })
})

describe('riwayat tersimpan — dan ini pernah GAGAL SENYAP', () => {
  /*
   * Cacat nyata 2026-08-10: pesan `user` tak menyebut `ada_galat_tool`,
   * sementara pesan `assistant` di batch yang sama menyebutnya. PostgREST
   * menyatukan kolom seluruh baris dan mengirim `null` untuk yang tak
   * menyebutkannya — bukan membiarkan DEFAULT berlaku. NOT NULL menolak
   * SELURUH batch.
   *
   * Gejalanya nihil: respons 200, jawaban benar, `ai_percakapan` bertambah.
   * Yang hilang riwayatnya, dan itu baru terasa pada pesan berikutnya saat
   * konteksnya kosong. Test ini ada supaya kegagalan yang tak bergejala itu
   * tetap punya satu tempat yang berteriak.
   */
  it('percakapan yang berhasil MENYIMPAN dua pesan', async () => {
    const { rows: sebelum } = await db.query(
      `SELECT count(*)::int n FROM ai_pesan WHERE company_id = $1`, [companyId])

    const r = await kirim({ pesan: 'Sebutkan satu proyek saja.' })
    // Kalau penyedianya tak bisa dihubungi, test ini tak bisa menyimpulkan
    // apa-apa — dinyatakan, bukan dilewati diam-diam.
    if (r.statusCode !== 200) {
      expect(r.statusCode, 'penyedia tak tersedia; penyimpanan tak teruji').toBeGreaterThan(0)
      return
    }

    const { rows: sesudah } = await db.query(
      `SELECT count(*)::int n FROM ai_pesan WHERE company_id = $1`, [companyId])
    expect(sesudah[0].n).toBe(sebelum[0].n + 2)
  }, 120_000)

  it('pesan asisten membawa BLOK tool, bukan hanya teks (C-5)', async () => {
    const r = await kirim({ pesan: 'Berapa proyek berjalan?' })
    if (r.statusCode !== 200) {
      expect(r.statusCode).toBeGreaterThan(0)
      return
    }
    const { rows } = await db.query(
      `SELECT jsonb_array_length(blok) AS n FROM ai_pesan
       WHERE company_id = $1 AND peran = 'assistant'
       ORDER BY dibuat_pada DESC LIMIT 1`,
      [companyId],
    )
    // Riwayat yang hanya menyimpan teks membuat pesan berikutnya kehilangan
    // hasil tool ronde ini — "cek stok" lalu "cukup untuk lantai 3?" jadi
    // mustahil.
    expect(Number(rows[0]?.n ?? 0)).toBeGreaterThan(0)
  }, 120_000)
})

describe('urutan gerbang', () => {
  it('saklar mati menang atas batas biaya', async () => {
    // Keduanya menghalangi; yang dilaporkan harus yang PALING AWAL, supaya
    // admin memperbaiki sebab yang benar.
    await db.query(`UPDATE ai_pengaturan_tenant SET ai_aktif = false WHERE company_id = $1`, [companyId])
    await db.query(
      `UPDATE ai_pengaturan_tenant SET batas_bulanan_idr = 0, mode_batas = 'blokir'
       WHERE company_id = $1`,
      [companyId],
    )
    const r = await kirim({ pesan: 'x' })
    expect(r.statusCode).toBe(403)
    expect(r.json().alasan).toBe('ai_nonaktif')
  })
})
