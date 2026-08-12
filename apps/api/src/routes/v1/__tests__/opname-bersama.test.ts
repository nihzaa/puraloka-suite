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

describe('kesiapan (D2) — memberitahu SEBELUM ditolak', () => {
  it('menyebut berapa persen yang boleh ditagih, beserta sebabnya', async () => {
    // Gerbang D1 sudah bekerja di server, tapi layar penagihan tak menyebut
    // opname sama sekali: pengguna menekan Ajukan, ditolak 422, baru membaca
    // sebabnya. Penolakan yang bisa DIRAMALKAN lebih baik daripada penolakan
    // yang menjelaskan diri.
    const r = await app.inject({
      method: 'GET', url: `/api/v1/opname/kesiapan?work_scope_id=${scopeId}`,
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode, r.body).toBe(200)
    const k = r.json().kesiapan[0]
    expect(k.work_scope_id).toBe(scopeId)
    expect(k.wajib_opname).toBe(true)
    expect(k.pct_opname).toBe(40)          // opname yang diverifikasi di atas
    expect(typeof k.sebab).toBe('string')
    expect(k.sebab.length).toBeGreaterThan(15)
  })

  it('menghitung SISA hak, bukan hanya batas atasnya', async () => {
    // `pct_sudah_ditagih` dibandingkan dengan basis, BUKAN dipaku angka.
    //
    // Versi pertama test ini mengharapkan 30 — persen pembayaran yang dibuat
    // test ini sendiri. Basis dev ternyata sudah memuat pembayaran 60% dan
    // 80% dari seed lama, yang dibuat SEBELUM gerbang opname ada. Angka
    // yang benar adalah yang tertinggi di antara semuanya.
    //
    // Sisa yang NOL pada keadaan itu bukan cacat: opname mengukur 40%,
    // sementara 60% sudah terlanjur ditagih. Justru itu yang harus terlihat
    // — dan sebabnya menyebutkan opname susulan diperlukan.
    const { rows } = await db.query(
      `SELECT COALESCE(max(pct_completed), 0)::numeric AS t FROM progress_payments
        WHERE work_scope_id = $1 AND status <> 'rejected'`, [scopeId])

    const r = await app.inject({
      method: 'GET', url: `/api/v1/opname/kesiapan?work_scope_id=${scopeId}`,
      headers: { authorization: 'Bearer t' },
    })
    const k = r.json().kesiapan[0]
    expect(k.pct_sudah_ditagih).toBe(Number(rows[0].t))
    // Sisa = batas − yang sudah ditagih, tak pernah negatif.
    expect(k.pct_sisa).toBe(Math.max(0, k.pct_opname - k.pct_sudah_ditagih))
    expect(k.pct_sisa).toBeGreaterThanOrEqual(0)
  })

  it('yang DITOLAK tak menghabiskan hak', async () => {
    // Kalau pengajuan yang ditolak ikut dihitung, penolakan admin justru
    // MENGURANGI hak mandor — hukuman yang tak pernah dimaksudkan siapa pun.
    //
    // Barisnya DISISIPKAN di sini dengan persen yang sengaja lebih tinggi
    // dari apa pun yang ada, lalu dihapus di `finally`.
    //
    // Versi pertama test ini membandingkan hasil endpoint dengan query yang
    // MENIRU rumusnya (`status <> 'rejected'`) — dua sisi yang bergerak
    // bersama, jadi mutasi yang menghapus saringan itu LOLOS. Pembanding
    // yang meniru kode tak menguji kode.
    const { rows: p } = await db.query(
      `SELECT requested_by FROM progress_payments WHERE work_scope_id = $1 LIMIT 1`, [scopeId])
    // `earned_value` 1, bukan 0: CHECK `chk_progress_earned_value` menuntut > 0.
    const { rows: ins } = await db.query(
      `INSERT INTO progress_payments
         (work_scope_id, pct_completed, earned_value, gross_payment, deducted_kasbon,
          net_payment, status, requested_by)
       VALUES ($1, 99, 1, 1, 0, 1, 'rejected', $2) RETURNING id`,
      [scopeId, p[0]?.requested_by ?? null])
    try {
      const r = await app.inject({
        method: 'GET', url: `/api/v1/opname/kesiapan?work_scope_id=${scopeId}`,
        headers: { authorization: 'Bearer t' },
      })
      // 99 ditolak, jadi ia TIDAK boleh muncul sebagai yang sudah ditagih.
      expect(r.json().kesiapan[0].pct_sudah_ditagih).toBeLessThan(99)
    } finally {
      await db.query('DELETE FROM progress_payments WHERE id = $1', [ins[0].id])
    }
  })

  it('opname yang BELUM diverifikasi tak menaikkan batas', async () => {
    // Sama seperti di atas: pembanding tak boleh meniru rumus kode. Opname
    // baru berpersen tinggi disisipkan dalam status `diajukan`; batasnya
    // harus TETAP.
    const sebelum = await app.inject({
      method: 'GET', url: `/api/v1/opname/kesiapan?work_scope_id=${scopeId}`,
      headers: { authorization: 'Bearer t' },
    })
    const batasSebelum = sebelum.json().kesiapan[0].pct_opname

    const r = await buatOpname({
      work_scope_id: scopeId, tanggal_opname: '2026-08-02',
      catatan: `${TANDA} belum diverifikasi`,
      item: [{ uraian: 'Uji batas', satuan: 'm2', volume_rencana: 100, volume_terukur: 95, pct_selesai: 95 }],
    })
    expect(r.statusCode).toBe(201)
    const idBaru = r.json().opname.id
    dibuat.push(idBaru)

    const sesudah = await app.inject({
      method: 'GET', url: `/api/v1/opname/kesiapan?work_scope_id=${scopeId}`,
      headers: { authorization: 'Bearer t' },
    })
    expect(sesudah.json().kesiapan[0].pct_opname).toBe(batasSebelum)
    expect(sesudah.json().kesiapan[0].opname_menunggu).toBeGreaterThan(0)
  })

  it('sisa NOL disebut apa adanya, dengan jalan keluarnya', async () => {
    const r = await app.inject({
      method: 'GET', url: `/api/v1/opname/kesiapan?work_scope_id=${scopeId}`,
      headers: { authorization: 'Bearer t' },
    })
    const k = r.json().kesiapan[0]
    if (k.pct_sisa === 0) {
      // Kalimatnya harus memberitahu apa yang perlu dilakukan, bukan sekadar
      // "tak bisa menagih".
      expect(k.sebab).toMatch(/opname susulan/i)
    }
  })

  it('work_scope_id milik tenant lain tak melebarkan hasil', async () => {
    const r = await app.inject({
      method: 'GET', url: '/api/v1/opname/kesiapan?work_scope_id=00000000-0000-0000-0000-0000000000ff',
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode).toBe(200)
    const semua = await app.inject({
      method: 'GET', url: '/api/v1/opname/kesiapan',
      headers: { authorization: 'Bearer t' },
    })
    // Id asing diabaikan → hasilnya sama dengan tanpa saringan, bukan berisi
    // data tenant itu.
    expect(r.json().kesiapan.length).toBe(semua.json().kesiapan.length)
  })

  it('sistem harian dilaporkan TAK wajib, dengan pct_opname null', async () => {
    // `null`, bukan 100: menuliskan angka di sini akan terbaca sebagai
    // "opname memperbolehkan 100%", padahal opname tak berkata apa-apa
    // tentang sistem harian.
    const { rows } = await db.query(
      `SELECT ws.id FROM work_scopes ws
         JOIN mandor_assignments ma ON ma.id = ws.assignment_id
         JOIN projects p ON p.id = ma.project_id
        WHERE ws.payment_system = 'harian' AND p.company_id = $1 LIMIT 1`, [companyId])
    if (!rows.length) {
      console.warn('  ⏭  tak ada work_scope harian — dilewati')
      return
    }
    const r = await app.inject({
      method: 'GET', url: `/api/v1/opname/kesiapan?work_scope_id=${rows[0].id}`,
      headers: { authorization: 'Bearer t' },
    })
    const k = r.json().kesiapan[0]
    expect(k.wajib_opname).toBe(false)
    expect(k.pct_opname).toBeNull()
    expect(k.sebab).toMatch(/tak menuntut opname/i)
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
