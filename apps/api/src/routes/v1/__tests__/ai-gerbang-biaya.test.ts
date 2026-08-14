/**
 * TJS-B1 — gerbang biaya AI pada RUTE, bukan pada fungsinya sendiri.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA TEST INI TERPISAH DARI `lib/__tests__/ai-config.test.ts`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Test lib membuktikan `periksaGerbangAi()` mengembalikan `boleh: false` saat
 * batas terlampaui. Ia TIDAK membuktikan rutenya memanggil fungsi itu — apalagi
 * memanggilnya SEBELUM `messages.create`.
 *
 * Perbedaan itu justru inti perbaikannya. TJS punya pencatatan biaya yang benar
 * dan dashboard yang benar, dan tetap tak bisa menghentikan apa pun, karena tak
 * ada yang memanggil pemeriksaan di jalur yang menghabiskan uang.
 *
 * ── Kenapa kunci Anthropic tidak dipasang di sini
 *
 * Justru itu yang diinginkan: kalau gerbangnya bekerja, panggilan berbayar tak
 * pernah terjadi, jadi kunci tak diperlukan. Yang diperiksa adalah `alasan` yang
 * dikembalikan — `batas_terlampaui` dan `nonaktif` hanya bisa muncul dari
 * gerbang, sedangkan `kunci_belum_dipasang` muncul saat gerbang dilewati.
 * Ketiganya membedakan "diblokir" dari "tak jadi jalan karena hal lain".
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import aiRoutes from '../ai.js'

let app: FastifyInstance
let db: Client
let adminAuth: string
let companyId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const insight = () =>
  app.inject({ method: 'GET', url: '/api/v1/ai/insight', headers: { authorization: 'Bearer t' } })

/**
 * Menyetel konfigurasi — DUA tabel sejak migrasi 382.
 *
 * Plafon biaya (`batas_bulanan_idr`, `mode_batas`) pindah ke
 * `ai_pengaturan_tenant` karena uangnya milik tenant, bukan milik kanal;
 * sisanya (`aktif`, `penyedia`, `model`) tetap per-asisten.
 *
 * Pemisahannya disembunyikan di dalam helper supaya tiap test tetap menulis
 * satu panggilan. Yang diuji test-test ini adalah URUTAN GERBANG, bukan tabel
 * mana yang menyimpan apa — memaksa tiap kasus tahu pembagiannya akan membuat
 * mereka merah tiap kali penyimpanannya dipindah lagi.
 */
const KOLOM_TENANT = new Set(['batas_bulanan_idr', 'mode_batas'])

async function setConfig(kolom: Record<string, unknown>) {
  const perAsisten = Object.entries(kolom).filter(([k]) => !KOLOM_TENANT.has(k))
  const perTenant = Object.entries(kolom).filter(([k]) => KOLOM_TENANT.has(k))

  if (perAsisten.length > 0) {
    const set = perAsisten.map(([k], i) => `${k} = $${i + 2}`).join(', ')
    await db.query(
      `UPDATE ai_provider_config SET ${set} WHERE company_id = $1 AND asisten = 'insight'`,
      [companyId, ...perAsisten.map(([, v]) => v)],
    )
  }

  if (perTenant.length > 0) {
    const set = perTenant.map(([k], i) => `${k} = $${i + 2}`).join(', ')
    // Baris tenant belum tentu ada — dibuat kalau perlu, supaya test tak
    // bergantung pada urutan berkas lain yang kebetulan membuatnya lebih dulu.
    await db.query(
      `INSERT INTO ai_pengaturan_tenant (company_id) VALUES ($1)
       ON CONFLICT (company_id) DO NOTHING`,
      [companyId],
    )
    await db.query(
      `UPDATE ai_pengaturan_tenant SET ${set} WHERE company_id = $1`,
      [companyId, ...perTenant.map(([, v]) => v)],
    )
  }
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  // Gagal keras kalau tak ada admin: test yang jalan dengan identitas kosong
  // akan hijau karena 401, bukan karena gerbangnya bekerja.
  if (!auth) throw new Error('tak ada pengguna ber-role admin untuk test ini')
  adminAuth = auth

  const { rows } = await db.query(`
    SELECT c.id FROM companies c
    WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1
  `)
  companyId = rows[0].id

  await db.query(
    `INSERT INTO ai_provider_config (company_id, asisten, penyedia, model, max_token)
     VALUES ($1, 'insight', 'anthropic', 'claude-haiku-4-5', 1024)
     ON CONFLICT (company_id, asisten) DO NOTHING`,
    [companyId],
  )

  app = Fastify()
  await app.register(aiRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await db.query(`DELETE FROM ai_biaya_token WHERE company_id = $1 AND model = 'uji-gerbang'`, [companyId])
  await setConfig({ aktif: true, batas_bulanan_idr: null, mode_batas: 'peringatkan' })
  await app.close()
  await db.end()
})

beforeEach(async () => {
  vi.restoreAllMocks()
  actAs(adminAuth)
  await db.query(`DELETE FROM ai_biaya_token WHERE company_id = $1 AND model = 'uji-gerbang'`, [companyId])
  await setConfig({ aktif: true, batas_bulanan_idr: null, mode_batas: 'peringatkan' })
})

/** Biaya yang cukup besar untuk melewati batas mana pun yang dipasang test ini. */
async function catatBiaya(idr: number) {
  await db.query(
    `INSERT INTO ai_biaya_token (company_id, asisten, penyedia, model, biaya_usd, biaya_idr, kurs_idr)
     VALUES ($1, 'insight', 'anthropic', 'uji-gerbang', 0.001, $2, 16000)`,
    [companyId, idr],
  )
}

describe('GET /api/v1/ai/insight — gerbang biaya', () => {
  it('mode blokir + batas terlampaui → AI TIDAK dipanggil', async () => {
    await catatBiaya(50_000)
    await setConfig({ batas_bulanan_idr: 10_000, mode_batas: 'blokir' })

    const r = await insight()
    const b = r.json()

    expect(r.statusCode).toBe(200)
    expect(b.sumber).toBe('deterministik')
    // `batas_terlampaui` hanya bisa lahir dari gerbang. Kalau yang muncul
    // `kunci_belum_dipasang`, artinya gerbang dilewati dan kode berjalan sampai
    // ke pembuatan klien — yaitu kegagalan yang test ini ada untuk cegah.
    expect(b.alasan).toBe('batas_terlampaui')
  })

  it('yang diblokir TIDAK menambah baris biaya — panggilannya memang tak terjadi', async () => {
    await catatBiaya(50_000)
    await setConfig({ batas_bulanan_idr: 10_000, mode_batas: 'blokir' })

    const sebelum = await db.query(
      `SELECT count(*)::int n FROM ai_biaya_token WHERE company_id = $1`, [companyId])
    await insight()
    const sesudah = await db.query(
      `SELECT count(*)::int n FROM ai_biaya_token WHERE company_id = $1`, [companyId])

    expect(sesudah.rows[0].n).toBe(sebelum.rows[0].n)
  })

  it('mode peringatkan + batas terlampaui → TETAP jalan', async () => {
    await catatBiaya(50_000)
    await setConfig({ batas_bulanan_idr: 10_000, mode_batas: 'peringatkan' })

    const b = (await insight()).json()
    // Lolos gerbang. Berhentinya kemudian karena kunci/panggilan, BUKAN batas —
    // dan itulah bedanya "peringatkan" dari "blokir".
    expect(b.alasan).not.toBe('batas_terlampaui')
  })

  it('asisten dinonaktifkan → AI tidak dipanggil, apa pun batasnya', async () => {
    await setConfig({ aktif: false, batas_bulanan_idr: null })
    const b = (await insight()).json()
    expect(b.alasan).toBe('nonaktif')
  })

  it('batas belum tercapai → lolos gerbang', async () => {
    await catatBiaya(1_000)
    await setConfig({ batas_bulanan_idr: 100_000, mode_batas: 'blokir' })

    const b = (await insight()).json()
    expect(b.alasan).not.toBe('batas_terlampaui')
    expect(b.alasan).not.toBe('nonaktif')
  })

  it('fakta portofolio tetap dikirim meski AI diblokir', async () => {
    await catatBiaya(50_000)
    await setConfig({ batas_bulanan_idr: 10_000, mode_batas: 'blokir' })

    const b = (await insight()).json()
    // Skornya deterministik dan tak pernah menyentuh model. Menghilangkannya
    // saat AI diblokir akan mengosongkan kartu beranda yang seluruh angkanya
    // sebenarnya masih benar.
    expect(b.fakta).toBeTruthy()
    expect(typeof b.fakta.skor).toBe('number')
  })
})
