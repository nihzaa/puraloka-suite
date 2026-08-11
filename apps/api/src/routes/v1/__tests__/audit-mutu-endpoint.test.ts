import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import auditMutuRoutes from '../audit-mutu.js'

/**
 * AUDIT MUTU terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perhitungannya sudah dikunci 15 test di `lib/__tests__/audit-mutu.test.ts`
 * (10 mutasi MERAH) tanpa menyentuh basis. Yang tersisa:
 *
 *   • rantai tenancy `temuan_audit` lewat `audit_id` benar-benar menempuh
 *     jalannya — `viaProject` memakai kolom itu, BUKAN `project_id`
 *   • TRIGGER DUA SISI (283) menolak lewat jalur HTTP, bukan hanya SQL
 *     langsung: audit ditutup dengan major menggantung, DAN NCR dilepas dari
 *     major di audit yang sudah selesai
 *   • klausul & klasifikasi ditolak di aplikasi dengan pesan yang bisa dibaca
 *   • penutup temuan diisi dari SESI, bukan dari klien
 *   • penyelesaian ganda gagal — status lama ikut di WHERE
 *
 * Fixture berprefiks [TEST] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let projectId: string
let userId: string
let ncrId: string
let auditId: string
let temuanMajorId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (method: 'POST' | 'PATCH', url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(
    `DELETE FROM temuan_audit WHERE audit_id IN
       (SELECT id FROM audit_mutu WHERE nomor LIKE '[TEST]%')`)
  await client.query(`DELETE FROM audit_mutu WHERE nomor LIKE '[TEST]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT id FROM projects WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 1`)
  projectId = p[0].id
  const { rows: u } = await client.query(`SELECT id FROM users LIMIT 1`)
  userId = u[0].id
  const { rows: n } = await client.query(
    `SELECT id FROM ncr_items WHERE project_id = $1 LIMIT 1`, [projectId])
  ncrId = n[0].id

  await purge()

  const { rows: a } = await client.query(
    `INSERT INTO audit_mutu (project_id, nomor, judul, status, lingkup, auditor, dibuat_oleh)
     VALUES ($1, '[TEST] AM-01', 'Audit uji', 'berjalan', 'Pelaksanaan ITP', $2, $2)
     RETURNING id`, [projectId, userId])
  auditId = a[0].id

  const { rows: t } = await client.query(
    `INSERT INTO temuan_audit (audit_id, urutan, uraian, klausul, klasifikasi)
     VALUES ($1, 10, 'Titik hold dilewati tanpa persetujuan', 'RMP Ps. 4.2', 'major')
     RETURNING id`, [auditId])
  temuanMajorId = t[0].id

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(auditMutuRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('GET /audit-mutu/:id', () => {
  // INVARIAN TENANCY. `temuan_audit` mewarisi lewat `audit_id`. Memberi id
  // proyek ke `viaProject` menyusun `.eq('audit_id', <id proyek>)` — dua
  // jenis id dibandingkan, nol baris, NOL GALAT.
  it('temuan terbaca lewat rantai tenancy-nya sendiri', async () => {
    const r = await get(`/api/v1/audit-mutu/${auditId}`)
    expect(r.statusCode).toBe(200)
    expect(r.json().temuan).toHaveLength(1)
    expect(r.json().temuan[0].klasifikasi).toBe('major')
  })

  it('major tanpa NCR menghalangi penyelesaian, dan temuannya dibawa keluar', async () => {
    const j = (await get(`/api/v1/audit-mutu/${auditId}`)).json()
    expect(j.ringkasan.major_tanpa_ncr).toHaveLength(1)
    expect(j.penyelesaian.boleh).toBe(false)
  })

  it('404 untuk audit yang tak ada', async () => {
    const r = await get('/api/v1/audit-mutu/00000000-0000-0000-0000-0000000000ff')
    expect(r.statusCode).toBe(404)
  })
})

describe('POST /audit-mutu/:id/temuan', () => {
  it('klausul WAJIB — temuan tanpa acuan adalah pendapat', async () => {
    const r = await kirim('POST', `/api/v1/audit-mutu/${auditId}/temuan`, {
      uraian: 'Sesuatu tak beres', klasifikasi: 'minor',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/klausul/i)
    // Bukan pesan constraint mentah — itu tak berarti apa-apa di layar.
    expect(r.json().error).not.toMatch(/null value in column/)
  })

  it('klasifikasi WAJIB — ia menentukan apakah wajib melahirkan NCR', async () => {
    const r = await kirim('POST', `/api/v1/audit-mutu/${auditId}/temuan`, {
      uraian: 'x', klausul: 'Ps. 1',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/klasifikasi/i)
  })

  it('klasifikasi di luar tiga nilai ditolak sebelum menyentuh basis', async () => {
    const r = await kirim('POST', `/api/v1/audit-mutu/${auditId}/temuan`, {
      uraian: 'x', klausul: 'Ps. 1', klasifikasi: 'Major',
    })
    expect(r.statusCode).toBe(400)
  })

  it('temuan minor tersimpan dan TIDAK menghalangi penyelesaian', async () => {
    const r = await kirim('POST', `/api/v1/audit-mutu/${auditId}/temuan`, {
      uraian: 'Catatan inspeksi tak lengkap', klausul: 'RMP Ps. 5.1',
      klasifikasi: 'minor', urutan: 20,
    })
    expect(r.statusCode).toBe(201)

    const j = (await get(`/api/v1/audit-mutu/${auditId}`)).json()
    expect(j.ringkasan.minor).toBe(1)
    // Minor tanpa NCR itu SAH — hanya major yang wajib.
    expect(j.ringkasan.major_tanpa_ncr).toHaveLength(1)
  })
})

describe('PATCH /temuan-audit/:id', () => {
  it('penutup diisi dari SESI, bukan dari klien', async () => {
    const r = await kirim('PATCH', `/api/v1/temuan-audit/${temuanMajorId}`, {
      tutup: true,
      ditutup_oleh: '00000000-0000-0000-0000-0000000000ff',
    })
    expect(r.statusCode).toBe(200)

    const { rows } = await client.query(
      `SELECT ditutup_oleh, ditutup_pada FROM temuan_audit WHERE id = $1`, [temuanMajorId])
    expect(rows[0].ditutup_oleh).not.toBe('00000000-0000-0000-0000-0000000000ff')
    expect(rows[0].ditutup_pada).not.toBeNull()
  })

  it('menutup temuan TIDAK menghapus kewajiban NCR-nya', async () => {
    // Temuan major sudah ditutup di test sebelumnya — tapi tanpa NCR, audit
    // tetap tak boleh diselesaikan. Menutup ≠ menindaklanjuti.
    const j = (await get(`/api/v1/audit-mutu/${auditId}`)).json()
    expect(j.ringkasan.major_tanpa_ncr).toHaveLength(1)
    expect(j.penyelesaian.boleh).toBe(false)
  })

  it('404 untuk temuan yang tak ada', async () => {
    const r = await kirim('PATCH',
      '/api/v1/temuan-audit/00000000-0000-0000-0000-0000000000ff', { tutup: true })
    expect(r.statusCode).toBe(404)
  })
})

describe('POST /audit-mutu/:id/selesaikan', () => {
  it('MENOLAK selama ada major tanpa NCR — dengan temuannya', async () => {
    const r = await kirim('POST', `/api/v1/audit-mutu/${auditId}/selesaikan`)
    expect(r.statusCode).toBe(422)
    const kode = r.json().penghalang.map((p: { kode: string }) => p.kode)
    expect(kode).toContain('major-tanpa-ncr')

    const { rows } = await client.query(
      `SELECT status FROM audit_mutu WHERE id = $1`, [auditId])
    expect(rows[0].status).toBe('berjalan')
  })

  it('MENOLAK audit tanpa auditor', async () => {
    const { rows } = await client.query(
      `INSERT INTO audit_mutu (project_id, nomor, judul, status, dibuat_oleh)
       VALUES ($1, '[TEST] AM-NOAUD', 'Tanpa auditor', 'berjalan', $2)
       RETURNING id`, [projectId, userId])
    const r = await kirim('POST', `/api/v1/audit-mutu/${rows[0].id}/selesaikan`)
    expect(r.statusCode).toBe(422)
    expect(r.json().penghalang.map((p: { kode: string }) => p.kode)).toContain('tanpa-auditor')
  })

  it('sesudah major ditautkan ke NCR, audit BOLEH diselesaikan', async () => {
    const taut = await kirim('PATCH', `/api/v1/temuan-audit/${temuanMajorId}`, { ncr_id: ncrId })
    expect(taut.statusCode).toBe(200)

    const r = await kirim('POST', `/api/v1/audit-mutu/${auditId}/selesaikan`, {
      kesimpulan: 'Sistem mutu dijalankan dengan satu penyimpangan major.',
    })
    expect(r.statusCode).toBe(200)

    const { rows } = await client.query(
      `SELECT status, tanggal_selesai FROM audit_mutu WHERE id = $1`, [auditId])
    expect(rows[0].status).toBe('selesai')
    // Constraint `audit_mutu_selesai_berjejak` menuntut tanggal + auditor.
    expect(rows[0].tanggal_selesai).not.toBeNull()
  })

  it('TRIGGER 283 menjaga jalur kedua: NCR dilepas dari major di audit selesai', async () => {
    // Ini pintu yang TIDAK terlihat sebagai "menutup audit", dan karena itu
    // paling mudah terlewat kalau hanya sisi `audit_mutu` yang dijaga.
    // Trigger dipasang di kedua tabel justru untuk ini.
    const r = await kirim('PATCH', `/api/v1/temuan-audit/${temuanMajorId}`, { ncr_id: null })
    expect(r.statusCode).toBe(500)

    const { rows } = await client.query(
      `SELECT ncr_id FROM temuan_audit WHERE id = $1`, [temuanMajorId])
    // Dan NCR-nya TETAP tertaut — penolakan basis membatalkan seluruh update.
    expect(rows[0].ncr_id).toBe(ncrId)
  })

  it('temuan baru TIDAK bisa ditambahkan ke audit yang sudah selesai', async () => {
    const r = await kirim('POST', `/api/v1/audit-mutu/${auditId}/temuan`, {
      uraian: 'Temuan susulan', klausul: 'Ps. 9', klasifikasi: 'minor',
    })
    // Laporannya sudah keluar. Menambah temuan sesudahnya mengubah isi
    // laporan yang sudah ditandatangani.
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/berikutnya/i)
  })

  it('penyelesaian kedua BERURUTAN ditolak pemeriksaan aplikasi', async () => {
    const r = await kirim('POST', `/api/v1/audit-mutu/${auditId}/selesaikan`)
    expect(r.statusCode).toBe(409)
  })

  it('dua penyelesaian BERSAMAAN: tepat satu berhasil — dijaga BASIS', async () => {
    // ── Kenapa test ini ada, dan kenapa yang di atas TIDAK CUKUP ──────────
    //
    // Ini kesalahan yang SAMA PERSIS dengan G1e, saya ulangi beberapa jam
    // sesudah menulis penjelasannya. Test berurutan hijau — tetapi juga
    // hijau ketika `.neq('status','selesai')` dilepas, terbukti lewat mutasi
    // sengaja. Yang diujinya adalah `bolehDiselesaikan` di aplikasi, bukan
    // penjaga di basis.
    //
    // Dua permintaan yang tiba bersamaan sama-sama membaca status 'berjalan'
    // SEBELUM salah satunya menulis. Yang menghentikan yang kedua hanya
    // status lama di WHERE — dan itu hanya terlihat kalau keduanya
    // benar-benar berlomba (`audit-klaim-status-atomik`).
    const { rows } = await client.query(
      `INSERT INTO audit_mutu (project_id, nomor, judul, status, auditor, dibuat_oleh)
       VALUES ($1, '[TEST] AM-LOMBA', 'Uji lomba', 'berjalan', $2, $2)
       RETURNING id`, [projectId, userId])

    const url = `/api/v1/audit-mutu/${rows[0].id}/selesaikan`
    const [a, b] = await Promise.all([kirim('POST', url), kirim('POST', url)])

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])

    const { rows: cek } = await client.query(
      `SELECT status FROM audit_mutu WHERE id = $1`, [rows[0].id])
    expect(cek[0].status).toBe('selesai')
  })
})
