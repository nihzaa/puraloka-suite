/**
 * `work_scopes.rab_category_id` kini bisa DI-PATCH — terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-13: kolom ini terisi 0 dari 20 work scope. Ia bisa diisi
 * saat MEMBUAT scope, tetapi tak ada di daftar kolom yang boleh di-PATCH —
 * jadi dua puluh lingkup kerja yang sudah telanjur ada tak punya satu pun
 * jalan untuk diberi kategori.
 *
 * Akibatnya `lib/cvr.ts` tak bisa memecah biaya per pekerjaan, dan cakupan
 * CVR terhenti di upah borongan saja. Taksonomi menandainya "data belum ada";
 * yang lebih tepat: datanya tak BISA diisi.
 *
 *   • kategori tersimpan lewat PATCH
 *   • `null` melepas kategori (keputusan sadar)
 *   • `undefined` TIDAK menyentuhnya — menyunting nama scope tak boleh
 *     menghapus kategorinya
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import mandorRoutes from '../mandor.js'

let app: FastifyInstance
let db: Client
let scopeId: string
let kategoriId: string
let kategoriLain: string
let kategoriAwal: string | null = null

const patch = (url: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

const bacaScope = async () => {
  const { rows } = await db.query(
    'SELECT scope_name, rab_category_id FROM work_scopes WHERE id = $1', [scopeId])
  return rows[0] as { scope_name: string; rab_category_id: string | null }
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [auth])
  const { rows: co } = await db.query(
    'SELECT company_id FROM company_members WHERE user_id = $1 LIMIT 1', [u[0].id])

  // Scope dipilih menurut SYARAT: harus milik proyek tenant ini, karena
  // rutenya menyaring lewat tenancy.
  const { rows: s } = await db.query(
    `SELECT w.id, w.rab_category_id FROM work_scopes w
       JOIN mandor_assignments a ON a.id = w.assignment_id
       JOIN projects p ON p.id = a.project_id
      WHERE p.company_id = $1 LIMIT 1`, [co[0].company_id])
  if (!s.length) throw new Error('tak ada work scope di company ini — fixture tak terbentuk')
  scopeId = s[0].id
  kategoriAwal = s[0].rab_category_id

  // DUA kategori: satu untuk memasang, satu untuk membuktikan penggantian
  // benar-benar berpindah — bukan sekadar "tidak null".
  const { rows: k } = await db.query(
    `SELECT ri.id FROM rab_items ri
       JOIN mandor_assignments a ON a.id = (SELECT assignment_id FROM work_scopes WHERE id = $1)
      WHERE ri.project_id = a.project_id AND ri.level = 'category' LIMIT 2`, [scopeId])
  if (k.length < 2) throw new Error('butuh dua kategori RAB di proyek ini — fixture tak terbentuk')
  kategoriId = k[0].id
  kategoriLain = k[1].id

  app = Fastify({ logger: false })
  await app.register(mandorRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  // Keadaan dikembalikan: berkas ini menyunting data DEV yang nyata, bukan
  // fixture buatannya sendiri.
  if (scopeId) {
    await db.query('UPDATE work_scopes SET rab_category_id = $1 WHERE id = $2',
      [kategoriAwal, scopeId])
  }
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('rab_category_id bisa di-PATCH', () => {
  it('kategori tersimpan', async () => {
    const r = await patch(`/api/v1/mandor/work-scopes/${scopeId}`,
      { rab_category_id: kategoriId })
    expect(r.statusCode, r.body).toBe(200)

    expect((await bacaScope()).rab_category_id,
      'kategori tak tersimpan — CVR tetap tak bisa memecah biaya per pekerjaan').toBe(kategoriId)
  })

  it('kategori bisa DIGANTI, bukan hanya dipasang sekali', async () => {
    const r = await patch(`/api/v1/mandor/work-scopes/${scopeId}`,
      { rab_category_id: kategoriLain })
    expect(r.statusCode, r.body).toBe(200)
    expect((await bacaScope()).rab_category_id).toBe(kategoriLain)
  })

  it('menyunting NAMA tidak menghapus kategorinya', async () => {
    // Ini yang dijaga pembedaan `undefined` vs `null`. Kalau keduanya
    // disamakan, kategori lenyap tiap kali orang membetulkan salah ketik
    // pada nama scope — dan CVR diam-diam kehilangan cakupannya lagi.
    const sebelum = await bacaScope()
    const r = await patch(`/api/v1/mandor/work-scopes/${scopeId}`,
      { scope_name: sebelum.scope_name })
    expect(r.statusCode, r.body).toBe(200)

    expect((await bacaScope()).rab_category_id,
      'kategori terhapus saat nama disunting').toBe(sebelum.rab_category_id)
  })

  it('null MELEPAS kategori — keputusan sadar, bukan efek samping', async () => {
    const r = await patch(`/api/v1/mandor/work-scopes/${scopeId}`,
      { rab_category_id: null })
    expect(r.statusCode, r.body).toBe(200)
    expect((await bacaScope()).rab_category_id).toBeNull()
  })

  it('baris RAB yang BUKAN kategori ditolak', async () => {
    // `rab_items` memuat kategori DAN baris pekerjaan di bawahnya. Memasang
    // baris pekerjaan sebagai "kategori" membuat pengelompokan biaya jatuh
    // satu tingkat terlalu dalam — dan totalnya tetap berjumlah benar, jadi
    // tak ada yang curiga.
    const { rows } = await db.query(
      `SELECT ri.id FROM rab_items ri
        WHERE ri.level <> 'category'
          AND ri.project_id = (SELECT a.project_id FROM work_scopes w
                                 JOIN mandor_assignments a ON a.id = w.assignment_id
                                WHERE w.id = $1)
        LIMIT 1`, [scopeId])
    if (!rows.length) throw new Error('tak ada baris RAB non-kategori — fixture tak terbentuk')

    const r = await patch(`/api/v1/mandor/work-scopes/${scopeId}`,
      { rab_category_id: rows[0].id })
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/KATEGORI RAB/i)

    expect((await bacaScope()).rab_category_id).not.toBe(rows[0].id)
  })

  it('kategori dari proyek LAIN ditolak rute', async () => {
    // FK TIDAK menjaganya — ia hanya menjamin baris `rab_items` itu ada, bukan
    // bahwa ia milik proyek yang sama. Memasang kategori proyek lain membuat
    // biaya jatuh ke pekerjaan yang salah, dan laporan variansnya tetap
    // terlihat wajar: tak ada galat, tak ada gejala.
    const { rows } = await db.query(
      `SELECT ri.id FROM rab_items ri
        WHERE ri.level = 'category'
          AND ri.project_id <> (SELECT a.project_id FROM work_scopes w
                                  JOIN mandor_assignments a ON a.id = w.assignment_id
                                 WHERE w.id = $1)
        LIMIT 1`, [scopeId])
    if (!rows.length) throw new Error('tak ada kategori proyek lain — fixture tak terbentuk')

    const r = await patch(`/api/v1/mandor/work-scopes/${scopeId}`,
      { rab_category_id: rows[0].id })

    // Versi pertama test ini menerima 200 asal nilainya tak tersimpan, dan
    // hasilnya: ia LOLOS sambil membiarkan kategori proyek lain tersimpan.
    // FK hanya menjamin barisnya ada. Harapan dipertegas ke penolakan
    // eksplisit — pesan yang bisa dibaca orang, bukan sekadar "tidak apa-apa".
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/milik proyek lain/i)

    expect((await bacaScope()).rab_category_id,
      'kategori proyek lain tersimpan — biaya akan jatuh ke pekerjaan yang salah')
      .not.toBe(rows[0].id)
  })
})
