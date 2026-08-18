/**
 * D3 — Back-Charge, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Test lib membuktikan aturannya benar; ia hijau meski handler konfirmasi
 * pembayaran tak pernah memanggilnya — dan itu persis cacat yang berulang di
 * repo ini (`requires_opname` ada dua tahun tanpa dibaca).
 *
 *   • back-charge `disetujui` benar-benar MENGURANGI net_payment
 *   • sesudah dipotong, statusnya berubah `dipotong` — tanpa itu ia memotong
 *     LAGI di pembayaran berikutnya
 *   • SoD ditegakkan DUA lapis: aplikasi (alasan) dan basis (CHECK)
 *   • yang sudah dipotong TAK BISA diubah
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole , companyDenganIzinKedua } from "../../../test-utils/rls-harness.js"
import { supabaseAuth } from '../../../utils/supabase.js'
import backChargeRoutes from '../back-charge.js'

let app: FastifyInstance
let db: Client
let adminAuth: string
let adminUserId: string
let lainUserId: string
let lainAuth: string
let companyId: string
let scopeId: string
const dibuat: string[] = []

const TANDA = '[TEST-BC]'

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const buat = (body: Record<string, unknown>) =>
  app.inject({
    method: 'POST', url: '/api/v1/back-charge',
    payload: body as never, headers: { authorization: 'Bearer t' },
  })

const putuskan = (id: string, body: Record<string, unknown> = {}) =>
  app.inject({
    method: 'PATCH', url: `/api/v1/back-charge/${id}/putuskan`,
    payload: body as never, headers: { authorization: 'Bearer t' },
  })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  adminAuth = auth

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [adminAuth])
  adminUserId = u[0].id

  // Company dipilih yang BENAR-BENAR punya pengguna kedua berizin
  // `backcharge:setujui` — bukan company pertama yang ditemukan.
  //
  // SoD menuntut penyetuju KEDUA — dan izin itu ada di 4 pengguna, tapi tersebar di company berbeda.
  // `LIMIT 1` tanpa ORDER BY menyerahkan pilihannya ke Postgres, dan
  // begitu yang terpilih tak punya penyetuju kedua, SELURUH berkas ini
  // mati di setup dengan pesan yang menuduh SEED — padahal seednya baik.
  const pilih = await companyDenganIzinKedua(db, adminAuth, 'backcharge:setujui')
  if (!pilih) {
    throw new Error('tak ada company yang punya pengguna kedua berizin backcharge:setujui — '
      + 'periksa seed/keanggotaan, bukan berkas ini')
  }
  companyId = pilih.companyId

  // Pengguna kedua ber-auth_id DAN berizin setujui — dipilih menurut
  // syaratnya, bukan `LIMIT 1` apa adanya. Pelajaran D1: fixture yang salah
  // pilih membuat empat test berpijak pada keadaan yang tak pernah terjadi.
  const { rows: l } = await db.query(
    `SELECT u2.id, u2.auth_id FROM users u2
       JOIN company_members m ON m.user_id = u2.id
       JOIN roles ro ON ro.id = u2.role_id
       JOIN role_permissions rp ON rp.role_id = ro.id
       JOIN permissions pe ON pe.id = rp.permission_id
      WHERE m.company_id = $1 AND u2.id <> $2 AND u2.auth_id IS NOT NULL
        AND u2.is_active AND pe.key = 'backcharge:setujui'
      LIMIT 1`, [companyId, adminUserId])
  if (!l.length) throw new Error('butuh pengguna kedua berizin backcharge:setujui')
  lainUserId = l[0].id
  lainAuth = l[0].auth_id

  // Lingkup kerja yang PUNYA progress_payment — supaya test kunci-sesudah-
  // dipotong benar-benar berjalan.
  //
  // Versi pertama memakai `LIMIT 1` apa adanya dan mendapat scope tanpa
  // pembayaran; test terakhirnya dilewati dengan pesan ⏭, dan hijau yang
  // melewati justru yang paling meyakinkan sekaligus paling kosong.
  const { rows: ws } = await db.query(
    `SELECT ws.id FROM work_scopes ws
       JOIN mandor_assignments ma ON ma.id = ws.assignment_id
       JOIN projects p ON p.id = ma.project_id
      WHERE p.company_id = $1
      ORDER BY (SELECT count(*) FROM progress_payments pp WHERE pp.work_scope_id = ws.id) DESC
      LIMIT 1`, [companyId])
  if (!ws.length) throw new Error('tak ada work_scope untuk diuji')
  scopeId = ws[0].id

  app = Fastify({ logger: false })
  await app.register(backChargeRoutes)
  await app.ready()
  actAs(adminAuth)
}, 90_000)

afterAll(async () => {
  for (const id of dibuat) {
    // Trigger menolak UPDATE pada yang `dipotong`, tetapi DELETE tak
    // tersentuh trigger BEFORE UPDATE.
    await db.query('DELETE FROM back_charge WHERE id = $1', [id])
  }
  await db.query(`DELETE FROM back_charge WHERE uraian LIKE '${TANDA}%'`)
  vi.restoreAllMocks()
  await app.close()
  await db.end()
})

describe('membuat back-charge', () => {
  it('menolak tanpa uraian — potongan yang tak bisa dijelaskan', async () => {
    const r = await buat({
      work_scope_id: scopeId, tanggal: '2026-08-01', nilai: 1_000_000,
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tak bisa dijelaskan ke mandor/i)
  })

  it('menolak nilai nol atau negatif', async () => {
    for (const n of [0, -500_000]) {
      const r = await buat({
        work_scope_id: scopeId, tanggal: '2026-08-01', uraian: `${TANDA} uji`, nilai: n,
      })
      expect(r.statusCode, String(n)).toBe(400)
    }
  })

  it('menolak lingkup kerja milik tenant lain', async () => {
    const r = await buat({
      work_scope_id: '00000000-0000-0000-0000-0000000000ff',
      tanggal: '2026-08-01', uraian: `${TANDA} asing`, nilai: 100_000,
    })
    expect(r.statusCode).toBe(404)
  })

  it('membuat dengan nomor urut dan status diajukan', async () => {
    const r = await buat({
      work_scope_id: scopeId, tanggal: '2026-08-01',
      uraian: `${TANDA} Perbaikan bocor KM lantai 2`,
      kategori: 'perbaikan', nilai: 2_500_000,
    })
    expect(r.statusCode, r.body).toBe(201)
    const j = r.json()
    expect(j.back_charge.nomor).toMatch(/^BC-2026-\d{4}$/)
    expect(j.back_charge.status).toBe('diajukan')
    dibuat.push(j.back_charge.id)
  })
})

describe('ringkasan — status menentukan segalanya', () => {
  it('`diajukan` masuk menungguSetuju, BUKAN siapDipotong', async () => {
    const r = await app.inject({
      method: 'GET', url: `/api/v1/back-charge?work_scope_id=${scopeId}`,
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode).toBe(200)
    const g = r.json().ringkasan
    expect(g.menungguSetuju).toBeGreaterThanOrEqual(2_500_000)
    // Belum disetujui siapa pun — memotongnya berarti sepihak.
    expect(g.siapIds).not.toContain(dibuat[0])
  })
})

describe('SoD — dua lapis', () => {
  it('APLIKASI: pengaju tak bisa menyetujui sendiri, dengan alasan', async () => {
    const r = await putuskan(dibuat[0], { setujui: true })
    expect(r.statusCode).toBe(403)
    expect(r.json().error).toMatch(/tak bisa menyetujuinya sendiri/i)
  })

  it('BASIS: CHECK menolak meski lewat SQL langsung', async () => {
    // Importer dan psql menulis ke sini juga; lapisan aplikasi tak menjaga
    // mereka.
    await expect(
      db.query(
        `UPDATE back_charge
            SET status = 'disetujui', disetujui_oleh = diajukan_oleh, disetujui_pada = now()
          WHERE id = $1`, [dibuat[0]]),
    ).rejects.toThrow(/check/i)
  })
})

describe('persetujuan oleh pihak kedua', () => {
  it('berhasil dan tercatat siapa & kapan', async () => {
    actAs(lainAuth)
    const r = await putuskan(dibuat[0], { setujui: true })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().back_charge.status).toBe('disetujui')

    const { rows } = await db.query(
      'SELECT disetujui_oleh, disetujui_pada FROM back_charge WHERE id = $1', [dibuat[0]])
    expect(rows[0].disetujui_oleh).toBe(lainUserId)
    expect(rows[0].disetujui_pada).not.toBeNull()
    actAs(adminAuth)
  })

  it('sesudah disetujui, ia SIAP memotong', async () => {
    const r = await app.inject({
      method: 'GET', url: `/api/v1/back-charge?work_scope_id=${scopeId}`,
      headers: { authorization: 'Bearer t' },
    })
    const g = r.json().ringkasan
    expect(g.siapIds).toContain(dibuat[0])
    expect(g.siapDipotong).toBeGreaterThanOrEqual(2_500_000)
  })

  it('keputusan KEDUA ditolak — status lama ikut di WHERE', async () => {
    actAs(lainAuth)
    const r = await putuskan(dibuat[0], { setujui: true })
    // 409, bukan 200: dua keputusan bersamaan hanya boleh menghasilkan satu
    // yang berhasil.
    expect(r.statusCode).toBe(409)
    actAs(adminAuth)
  })

  it('status lama IKUT di WHERE — lapis KEDUA di bawah pemeriksaan aplikasi', async () => {
    // Tiga percobaan sebelumnya semuanya LOLOS mutasi, dan sebabnya sama:
    // `periksaSetujuBackCharge` sudah menolak status bukan-`diajukan` di
    // lapisan aplikasi, jadi permintaan TAK PERNAH SAMPAI ke UPDATE — apa pun
    // isi WHERE-nya.
    //
    //   percobaan 1  dua app.inject berurutan     → SoD menolak (403/403)
    //   percobaan 2  pengaju diubah               → tetap berurutan
    //   percobaan 3  status disetel lewat basis   → pemeriksaan aplikasi menolak
    //
    // Yang diuji di sini adalah lapis KEDUA-nya: WHERE tetap harus menahan
    // meski pemeriksaan pertama dilewati. Itu yang menjaga saat DUA proses
    // benar-benar berjalan bersamaan — keadaan yang `app.inject` tak bisa
    // tirukan karena Fastify memprosesnya berurutan di satu proses.
    //
    // Dibuktikan dengan menjalankan UPDATE yang sama persis dengan rutenya,
    // pada baris yang statusnya sudah berubah.
    const b = await buat({
      work_scope_id: scopeId, tanggal: '2026-08-03',
      uraian: `${TANDA} uji where`, nilai: 750_000,
    })
    const id = b.json().back_charge.id
    dibuat.push(id)

    await db.query(
      `UPDATE back_charge
          SET status = 'disetujui', disetujui_oleh = $2, disetujui_pada = '2020-01-01T00:00:00Z'
        WHERE id = $1`, [id, lainUserId])

    // ⚠ TEST INI TIDAK MENGUJI KODE RUTE — ia menguji BASIS.
    //
    // Empat percobaan membuktikan mutasi `.eq('status','diajukan')` TAK BISA
    // dibuat merah lewat `app.inject`, karena `periksaSetujuBackCharge`
    // menolak lebih dulu di lapisan aplikasi. Permintaan tak pernah sampai ke
    // UPDATE, apa pun isi WHERE-nya.
    //
    // Klausa itu adalah lapis KEDUA: yang menjaga saat dua proses berjalan
    // benar-benar bersamaan — keadaan yang tak bisa ditirukan `app.inject`
    // (Fastify memprosesnya berurutan di satu proses).
    //
    // Jadi yang dibuktikan di bawah adalah PERILAKU BASIS-nya, dan itu
    // dinyatakan terus terang: mutasi pada baris `.eq()` di rute akan tetap
    // HIJAU di berkas ini. Penjaga sesungguhnya untuk pola ini adalah
    // `audit-klaim-status-atomik.mjs`, yang membaca kodenya langsung.
    //
    // Persis klausa rutenya: id + company + STATUS LAMA.
    const { rowCount } = await db.query(
      `UPDATE back_charge
          SET status = 'disetujui', disetujui_oleh = $3, disetujui_pada = now()
        WHERE id = $1 AND company_id = $2 AND status = 'diajukan'`,
      [id, companyId, adminUserId])
    expect(rowCount, 'status lama di WHERE harus menahan penulisan kedua').toBe(0)

    // Stempel waktu pertama utuh — persetujuan pertama tak tertimpa.
    const { rows } = await db.query(
      'SELECT disetujui_pada FROM back_charge WHERE id = $1', [id])
    expect(new Date(rows[0].disetujui_pada).getUTCFullYear()).toBe(2020)

    // DAN endpointnya sendiri tetap menolak dengan 409.
    actAs(lainAuth)
    const r = await putuskan(id, { setujui: true })
    actAs(adminAuth)
    expect(r.statusCode).toBe(409)
  })

})

describe('pembatalan', () => {
  it('wajib beralasan', async () => {
    const b = await buat({
      work_scope_id: scopeId, tanggal: '2026-08-02',
      uraian: `${TANDA} untuk dibatalkan`, nilai: 500_000,
    })
    const id = b.json().back_charge.id
    dibuat.push(id)

    actAs(lainAuth)
    const r = await putuskan(id, { setujui: false })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/wajib beralasan/i)
    actAs(adminAuth)
  })

  it('yang dibatalkan tak dihitung ke mana pun', async () => {
    const id = dibuat[dibuat.length - 1]
    actAs(lainAuth)
    const r = await putuskan(id, { setujui: false, alasan: 'Ternyata tanggungan kontraktor' })
    expect(r.statusCode).toBe(200)
    actAs(adminAuth)

    const g = (await app.inject({
      method: 'GET', url: `/api/v1/back-charge?work_scope_id=${scopeId}`,
      headers: { authorization: 'Bearer t' },
    })).json().ringkasan
    expect(g.siapIds).not.toContain(id)
  })
})

describe('kunci sesudah dipotong', () => {
  it('back-charge berstatus dipotong TAK BISA diubah', async () => {
    // Potongan yang sudah dikurangkan dari pembayaran adalah angka yang sudah
    // masuk pembukuan. Mengubahnya membuat pembayaran dan potongannya
    // bercerita hal yang berbeda — dan yang menemukannya adalah rekonsiliasi
    // bulan depan.
    const { rows: p } = await db.query(
      `SELECT id FROM progress_payments WHERE work_scope_id = $1 LIMIT 1`, [scopeId])
    if (!p.length) {
      console.warn('  ⏭  tak ada progress_payment untuk ditautkan — dilewati')
      return
    }
    await db.query(
      `UPDATE back_charge
          SET status = 'dipotong', progress_payment_id = $2, dipotong_pada = now()
        WHERE id = $1`, [dibuat[0], p[0].id])

    await expect(
      db.query(`UPDATE back_charge SET uraian = 'diubah' WHERE id = $1`, [dibuat[0]]),
    ).rejects.toThrow(/sudah dipotong dari pembayaran dan tak bisa diubah/i)
  })
})
