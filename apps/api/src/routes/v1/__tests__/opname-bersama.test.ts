/**
 * D1 — Opname Bersama + gerbang pembayaran, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Test lib membuktikan aturan gerbangnya benar; ia hijau meski rute
 * pembayaran tak pernah memanggilnya. Dan itu persis cacat yang modul ini
 * perbaiki: `requires_opname` ada sejak 2024 dan TAK PERNAH DIBACA satu baris
 * kode pun.
 *
 *   • pembayaran borongan/progress_pct DITOLAK tanpa opname terverifikasi
 *   • SoD ditegakkan DUA lapis: aplikasi (pesan yang bisa ditindaklanjuti)
 *     dan basis (CHECK, untuk importer & psql)
 *   • berita acara terverifikasi TAK BISA diubah
 *   • `opname_report_id` benar-benar terisi saat pembayaran lolos — jejak
 *     yang membuktikan gerbangnya dilewati, bukan dilompati
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import opnameRoutes from '../opname-bersama.js'
import mandorRoutes from '../mandor.js'

let app: FastifyInstance
let db: Client
let adminAuth: string
let adminUserId: string
let lainUserId: string
let lainAuth: string
let scopeId: string
let companyId: string
const dibuat: string[] = []

const TANDA = '[TEST-OPN]'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const buatOpname = (body: Record<string, unknown>) =>
  app.inject({
    method: 'POST', url: '/api/v1/opname',
    payload: body as never, headers: { authorization: 'Bearer t' },
  })

const verifikasi = (id: string, body: Record<string, unknown> = {}) =>
  app.inject({
    method: 'PATCH', url: `/api/v1/opname/${id}/verifikasi`,
    payload: body as never, headers: { authorization: 'Bearer t' },
  })

const bayar = (pct: number) =>
  app.inject({
    method: 'POST', url: '/api/v1/mandor/progress-payments',
    payload: { work_scope_id: scopeId, pct_completed: pct, gross_payment: 1_000_000 } as never,
    headers: { authorization: 'Bearer t' },
  })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  adminAuth = auth

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [adminAuth])
  adminUserId = u[0].id

  const { rows: co } = await db.query(
    `SELECT m.company_id FROM company_members m WHERE m.user_id = $1 LIMIT 1`, [adminUserId])
  companyId = co[0].company_id

  // Pengguna kedua yang BER-auth_id DAN berizin `opname:verifikasi`.
  //
  // Versi pertama memakai `LIMIT 1` apa adanya dan mendapat pengguna tanpa
  // `auth_id` — verifikasinya dilewati, dan empat test sesudahnya berpijak
  // pada opname yang tak pernah terverifikasi. Hijau/merahnya jadi soal
  // urutan baris di basis, bukan soal kode.
  const { rows: l } = await db.query(
    `SELECT u2.id, u2.auth_id FROM users u2
       JOIN company_members m ON m.user_id = u2.id
       JOIN roles ro ON ro.id = u2.role_id
       JOIN role_permissions rp ON rp.role_id = ro.id
       JOIN permissions pe ON pe.id = rp.permission_id
      WHERE m.company_id = $1 AND u2.id <> $2 AND u2.auth_id IS NOT NULL
        AND u2.is_active AND pe.key = 'opname:verifikasi'
      LIMIT 1`, [companyId, adminUserId])
  if (!l.length) {
    throw new Error('butuh pengguna kedua ber-auth_id dan berizin opname:verifikasi untuk menguji SoD')
  }
  lainUserId = l[0].id
  lainAuth = l[0].auth_id

  // Lingkup kerja bersistem `progress_pct` — yang wajib opname DAN punya
  // endpoint pembayarannya. Dipilih menurut syaratnya, bukan posisi.
  const { rows: ws } = await db.query(
    `SELECT ws.id FROM work_scopes ws
       JOIN mandor_assignments ma ON ma.id = ws.assignment_id
       JOIN projects p ON p.id = ma.project_id
      WHERE ws.payment_system = 'progress_pct' AND p.company_id = $1 LIMIT 1`, [companyId])
  if (!ws.length) throw new Error('tak ada work_scope progress_pct untuk diuji')
  scopeId = ws[0].id

  app = Fastify({ logger: false })
  await app.register(opnameRoutes)
  await app.register(mandorRoutes)
  await app.ready()
  actAs(adminAuth)
}, 90_000)

afterAll(async () => {
  // Pembayaran uji dibersihkan LEBIH DULU — FK-nya menahan opname.
  await db.query(
    `DELETE FROM progress_payments WHERE opname_report_id = ANY($1)`, [dibuat])
  await db.query(`DELETE FROM opname_bersama WHERE nomor LIKE '%' AND catatan LIKE '${TANDA}%'`)
  for (const id of dibuat) {
    await db.query('DELETE FROM opname_bersama_item WHERE opname_id = $1', [id])
    await db.query('DELETE FROM opname_bersama WHERE id = $1', [id])
  }
  vi.restoreAllMocks()
  await app.close()
  await db.end()
})

describe('gerbang pembayaran — lubang yang ditutup', () => {
  it('pembayaran progress_pct DITOLAK tanpa opname terverifikasi', async () => {
    // INI cacatnya: `requires_opname` ada sejak 2024, tak pernah dibaca.
    // Diukur 2026-08-12: 5 dari 5 pembayaran bertanda wajib, nol punya
    // berita acara.
    const r = await bayar(20)
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/Belum ada berita acara opname/i)
  })
})

describe('membuat berita acara', () => {
  it('menolak tanpa item — berita acara yang tak mengukur apa pun', async () => {
    const r = await buatOpname({
      work_scope_id: scopeId, tanggal_opname: '2026-08-01', item: [],
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/minimal satu item/i)
  })

  it('menolak volume_terukur negatif', async () => {
    const r = await buatOpname({
      work_scope_id: scopeId, tanggal_opname: '2026-08-01',
      item: [{ uraian: 'x', satuan: 'm2', volume_terukur: -5, pct_selesai: 50 }],
    })
    expect(r.statusCode).toBe(400)
  })

  it('menolak pct di luar 0-100', async () => {
    const r = await buatOpname({
      work_scope_id: scopeId, tanggal_opname: '2026-08-01',
      item: [{ uraian: 'x', satuan: 'm2', volume_terukur: 5, pct_selesai: 150 }],
    })
    expect(r.statusCode).toBe(400)
  })

  it('menolak lingkup kerja milik tenant lain', async () => {
    const r = await buatOpname({
      work_scope_id: '00000000-0000-0000-0000-0000000000ff',
      tanggal_opname: '2026-08-01',
      item: [{ uraian: 'x', satuan: 'm2', volume_terukur: 5, pct_selesai: 50 }],
    })
    expect(r.statusCode).toBe(404)
  })

  it('membuat berita acara bernomor urut', async () => {
    const r = await buatOpname({
      work_scope_id: scopeId, tanggal_opname: '2026-08-01',
      catatan: `${TANDA} opname pertama`,
      item: [
        { uraian: 'Pasangan bata', satuan: 'm2', volume_rencana: 100, volume_terukur: 40, pct_selesai: 40 },
      ],
    })
    expect(r.statusCode, r.body).toBe(201)
    const j = r.json()
    expect(j.opname.nomor).toMatch(/^BA-OPN-2026-\d{4}$/)
    expect(j.opname.status).toBe('diajukan')
    dibuat.push(j.opname.id)
  })
})

describe('SoD — dua lapis', () => {
  it('APLIKASI: pengukur tak bisa memverifikasi sendiri, dengan alasan', async () => {
    const r = await verifikasi(dibuat[0], { setujui: true })
    expect(r.statusCode).toBe(403)
    // Pesannya menjelaskan KENAPA, bukan sekadar "akses ditolak".
    expect(r.json().error).toMatch(/dua pihak menyaksikan angka yang sama/i)
  })

  it('BASIS: CHECK menolak meski lewat SQL langsung', async () => {
    // Importer dan skrip perbaikan data menulis ke sini juga; lapisan
    // aplikasi tak menjaga mereka.
    await expect(
      db.query(
        `UPDATE opname_bersama
            SET status = 'diverifikasi', diverifikasi_oleh = diukur_oleh, diverifikasi_pada = now()
          WHERE id = $1`, [dibuat[0]]),
    ).rejects.toThrow(/check/i)
  })
})

describe('verifikasi oleh pihak kedua', () => {
  it('berhasil, dan mencatat siapa & kapan', async () => {
    // Impersonasi pengguna LAIN — inilah pihak keduanya.
    actAs(lainAuth)

    const r = await verifikasi(dibuat[0], { setujui: true })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().opname.status).toBe('diverifikasi')

    const { rows: cek } = await db.query(
      'SELECT diverifikasi_oleh, diverifikasi_pada FROM opname_bersama WHERE id = $1', [dibuat[0]])
    expect(cek[0].diverifikasi_oleh).toBe(lainUserId)
    expect(cek[0].diverifikasi_pada).not.toBeNull()

    actAs(adminAuth)
  })

  it('berita acara terverifikasi TAK BISA diubah', async () => {
    // Berita acara yang bisa disunting sesudah ditandatangani bukan berita
    // acara.
    await expect(
      db.query(`UPDATE opname_bersama SET catatan = 'diubah' WHERE id = $1`, [dibuat[0]]),
    ).rejects.toThrow(/sudah diverifikasi dan tak bisa diubah/i)
  })

  it('itemnya ikut terkunci', async () => {
    await expect(
      db.query(`UPDATE opname_bersama_item SET volume_terukur = 999 WHERE opname_id = $1`, [dibuat[0]]),
    ).rejects.toThrow(/tak bisa diubah setelah/i)
  })
})

describe('gerbang sesudah opname terverifikasi', () => {
  it('pembayaran MELAMPAUI opname tetap ditolak', async () => {
    // Opname mencatat 40%; pembayaran 80% tak dibenarkan olehnya. Tanpa ini,
    // satu opname di awal proyek membuka seluruh pembayaran sesudahnya.
    const r = await bayar(80)
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/melampaui/i)
  })

  it('pembayaran DI BAWAH opname lolos, dan MENCATAT jejaknya', async () => {
    const r = await bayar(30)
    expect(r.statusCode, r.body).toBe(201)

    // `opname_report_id` terisi = bukti gerbangnya dilewati, bukan dilompati.
    const { rows } = await db.query(
      `SELECT opname_report_id FROM progress_payments
        WHERE work_scope_id = $1 ORDER BY created_at DESC LIMIT 1`, [scopeId])
    expect(rows[0].opname_report_id).toBe(dibuat[0])
  })
})
