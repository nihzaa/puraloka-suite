/**
 * E1 — Surat Perintah Kerja, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Test lib membuktikan aturannya benar; ia hijau meski rutenya tak terdaftar.
 *
 *   • cache `work_scopes.contract_status` benar-benar tersinkron — lima kolom
 *     kontrak yang sejak 2024 tak pernah terisi
 *   • SPK bertanda tangan penuh TAK BISA diubah nilainya
 *   • pembatalan mengembalikan cache, TAPI tak menghapus status kontrak
 *     induknya bila ada SPK lain yang masih berlaku
 *   • peringatan SPK ganda muncul tanpa MENOLAK (addendum sah)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import spkRoutes from '../spk.js'

let app: FastifyInstance
let db: Client
let adminAuth: string
let companyId: string
let scopeId: string
let statusScopeAsli: string | null = null
/** Tender milik company LAIN — dibuat di sini, bukan diharapkan ada. */
let tenderAsing: string | null = null
const dibuat: string[] = []

const TANDA = '[TEST-SPK]'

const buat = (body: Record<string, unknown>) =>
  app.inject({
    method: 'POST', url: '/api/v1/spk',
    payload: body as never, headers: { authorization: 'Bearer t' },
  })

const ubah = (id: string, body: Record<string, unknown>) =>
  app.inject({
    method: 'PATCH', url: `/api/v1/spk/${id}/status`,
    payload: body as never, headers: { authorization: 'Bearer t' },
  })

const isiSah = (o: Record<string, unknown> = {}) => ({
  work_scope_id: scopeId,
  tanggal_terbit: '2026-08-01',
  lingkup_kerja: `${TANDA} Pekerjaan struktur`,
  nilai_kontrak: 50_000_000,
  tanggal_mulai: '2026-09-01',
  tanggal_selesai: '2026-11-30',
  ...o,
})

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  adminAuth = auth
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: adminAuth } }, error: null } as never)

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [adminAuth])
  const { rows: co } = await db.query(
    'SELECT company_id FROM company_members WHERE user_id = $1 LIMIT 1', [u[0].id])
  companyId = co[0].company_id

  const { rows: ws } = await db.query(
    `SELECT ws.id, ws.contract_status FROM work_scopes ws
       JOIN mandor_assignments ma ON ma.id = ws.assignment_id
       JOIN projects p ON p.id = ma.project_id
      WHERE p.company_id = $1 LIMIT 1`, [companyId])
  if (!ws.length) throw new Error('tak ada work_scope untuk diuji')
  scopeId = ws[0].id
  // Status asli DISIMPAN — test ini mengubahnya lewat trigger, dan data
  // nyata tak boleh tertinggal dalam keadaan yang bukan miliknya.
  statusScopeAsli = ws[0].contract_status

  // ── Tender milik company LAIN ─────────────────────────────────────────
  //
  // UUID acak TIDAK cukup menguji saringan tenant: id yang tak ada di tabel
  // mana pun membuat `maybeSingle()` mengembalikan null dengan atau tanpa
  // saringan, jadi testnya tetap hijau saat saringannya dibuang. Terbukti
  // lewat mutasi — versi pertama test ini LOLOS.
  //
  // Jadi tendernya harus benar-benar ADA, dan benar-benar milik orang lain.
  const { rows: pAsing } = await db.query(
    `SELECT p.id FROM projects p WHERE p.company_id <> $1 LIMIT 1`, [companyId])
  if (pAsing.length) {
    const { rows: t } = await db.query(
      `INSERT INTO tender_subkon (project_id, nomor, judul, status)
       VALUES ($1, $2, $3, 'selesai') RETURNING id`,
      [pAsing[0].id, `TND-ASING-${Date.now()}`, `${TANDA} tender tenant lain`])
    tenderAsing = t[0].id
  }

  app = Fastify({ logger: false })
  await app.register(spkRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  for (const id of dibuat) {
    await db.query('DELETE FROM surat_perintah_kerja WHERE id = $1', [id])
  }
  await db.query(`DELETE FROM surat_perintah_kerja WHERE lingkup_kerja LIKE '${TANDA}%'`)
  // Pulihkan cache yang tersentuh trigger.
  if (statusScopeAsli !== null) {
    await db.query('UPDATE work_scopes SET contract_status = $2 WHERE id = $1',
      [scopeId, statusScopeAsli])
  }
  if (tenderAsing) {
    await db.query('DELETE FROM tender_subkon WHERE id = $1', [tenderAsing])
  }
  vi.restoreAllMocks()
  await app.close()
  await db.end()
})

describe('validasi masukan', () => {
  it('menolak tanggal selesai yang mendahului mulai', async () => {
    const r = await buat(isiSah({ tanggal_mulai: '2026-11-30', tanggal_selesai: '2026-09-01' }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/mendahului/i)
  })

  it('menolak nilai kontrak nol', async () => {
    const r = await buat(isiSah({ nilai_kontrak: 0 }))
    expect(r.statusCode).toBe(400)
  })

  it('menolak lingkup kerja milik tenant lain', async () => {
    const r = await buat(isiSah({ work_scope_id: '00000000-0000-0000-0000-0000000000ff' }))
    expect(r.statusCode).toBe(404)
  })

  // ── Asal-usul tender: diverifikasi, bukan diterima ────────────────────
  //
  // `tender_id`/`penawaran_id` hanya DITAMPILKAN, tak dipakai menghitung —
  // jadi id milik tenant lain tersimpan tanpa satu pun galat, dan jejak
  // asal-usul yang menunjuk dokumen orang lain terlihat seperti bukti.
  it('menolak tender milik tenant lain', async () => {
    // Tender NYATA milik company lain — bukan UUID acak. Bedanya menentukan:
    // dengan UUID acak, membuang saringan `project_id` tak membuat test ini
    // merah sama sekali.
    if (!tenderAsing) throw new Error('fixture tender asing tak terbentuk')
    const r = await buat(isiSah({ tender_id: tenderAsing }))
    expect(r.statusCode, r.body).toBe(404)
    expect(r.json().error).toMatch(/tender tidak ditemukan/i)
  })

  it('menolak penawaran_id tanpa tender_id', async () => {
    // Penawaran yang tak diketahui tendernya tak bisa ditelusuri ke tenant
    // mana pun — menerimanya berarti menyimpan rujukan yang tak terverifikasi.
    const r = await buat(isiSah({ penawaran_id: '00000000-0000-0000-0000-0000000000ff' }))
    expect(r.statusCode, r.body).toBe(400)
    expect(r.json().error).toMatch(/tanpa tender_id/i)
  })

  it('menolak batas denda tanpa tarif harian', async () => {
    const r = await buat(isiSah({ denda_maks_pct: 5 }))
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/tak ada yang bisa dihitung/i)
  })
})

describe('menerbitkan SPK', () => {
  it('membuat dengan nomor urut, status draf', async () => {
    const r = await buat(isiSah({ denda_per_hari: 500_000, denda_maks_pct: 5 }))
    expect(r.statusCode, r.body).toBe(201)
    const j = r.json()
    expect(j.spk.nomor).toMatch(/^SPK-2026-\d{4}$/)
    expect(j.spk.status).toBe('draf')
    dibuat.push(j.spk.id)
  })

  it('draf TIDAK menyentuh cache work_scopes', async () => {
    // Trigger hanya bekerja pada `ditandatangani`/`dibatalkan`. Draf yang
    // mengubah status kontrak akan membuat lingkup kerja terlihat berkontrak
    // padahal belum ada yang menandatangani apa pun.
    const { rows } = await db.query(
      'SELECT contract_status FROM work_scopes WHERE id = $1', [scopeId])
    expect(rows[0].contract_status).toBe(statusScopeAsli)
  })
})

describe('alur status', () => {
  it('draf → ditandatangani DITOLAK (harus terbit dulu)', async () => {
    const r = await ubah(dibuat[0], { status: 'ditandatangani' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/diterbitkan lebih dulu/i)
  })

  it('draf → diterbitkan berhasil', async () => {
    const r = await ubah(dibuat[0], { status: 'diterbitkan' })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().spk.status).toBe('diterbitkan')
  })

  it('tanpa tanda tangan, ditandatangani ditolak dengan menyebut yang kurang', async () => {
    const r = await ubah(dibuat[0], { status: 'ditandatangani' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/kedua tanda tangan/i)
  })

  it('satu tanda tangan saja masih ditolak', async () => {
    const t = await ubah(dibuat[0], { ttd_url: 'penerbit.png', pihak: 'penerbit' })
    expect(t.statusCode, t.body).toBe(200)

    const r = await ubah(dibuat[0], { status: 'ditandatangani' })
    expect(r.statusCode).toBe(409)
    // SPK bertanda tangan satu pihak adalah pemberitahuan, bukan kesepakatan.
    expect(r.json().error).toMatch(/tanda tangan pelaksana/i)
  })

  it('dua tanda tangan → ditandatangani, dan cache work_scopes TERSINKRON', async () => {
    await ubah(dibuat[0], { ttd_url: 'pelaksana.png', pihak: 'pelaksana' })
    const r = await ubah(dibuat[0], { status: 'ditandatangani' })
    expect(r.statusCode, r.body).toBe(200)

    // INI yang ditutup: lima kolom kontrak yang sejak 2024 tak pernah terisi.
    const { rows } = await db.query(
      `SELECT contract_status, contract_signed_at, pm_signature_url, mandor_signature_url
         FROM work_scopes WHERE id = $1`, [scopeId])
    expect(rows[0].contract_status).toBe('signed')
    expect(rows[0].contract_signed_at).not.toBeNull()
    expect(rows[0].pm_signature_url).toBe('penerbit.png')
    expect(rows[0].mandor_signature_url).toBe('pelaksana.png')
  })
})

describe('kunci sesudah ditandatangani', () => {
  it('nilai kontrak TAK BISA diubah', async () => {
    await expect(
      db.query('UPDATE surat_perintah_kerja SET nilai_kontrak = 999 WHERE id = $1', [dibuat[0]]),
    ).rejects.toThrow(/tak bisa diubah/i)
  })

  it('lingkup kerja TAK BISA diubah', async () => {
    await expect(
      db.query(`UPDATE surat_perintah_kerja SET lingkup_kerja = 'x' WHERE id = $1`, [dibuat[0]]),
    ).rejects.toThrow(/tak bisa diubah/i)
  })

  it('tanda tangan TAK BISA dibubuhkan lagi sesudah ditandatangani penuh', async () => {
    // Tanpa `.in('status', ['draf','diterbitkan'])` di rutenya, tanda tangan
    // pelaksana bisa ditimpa sesudah SPK mengikat — dan yang tercatat sebagai
    // penerima perintah berubah tanpa siapa pun menyetujuinya.
    //
    // Mutasi yang mencabut klausa itu LOLOS sebelum test ini ada: seluruh
    // test lain membubuhkan ttd saat statusnya masih `diterbitkan`.
    const r = await ubah(dibuat[0], { ttd_url: 'orang-lain.png', pihak: 'pelaksana' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/draf atau yang sudah diterbitkan/i)

    // Dan tanda tangan aslinya utuh.
    const { rows } = await db.query(
      'SELECT ttd_pelaksana_url FROM surat_perintah_kerja WHERE id = $1', [dibuat[0]])
    expect(rows[0].ttd_pelaksana_url).toBe('pelaksana.png')
  })

  it('syarat khusus MASIH boleh diubah — bukan bagian yang mengikat nilai', async () => {
    // Kunci dibatasi pada nilai, lingkup, jangka waktu, dan denda. Mengunci
    // seluruh baris akan menghalangi hal yang tak mengubah kesepakatan (mis.
    // melampirkan PDF hasil pindai).
    const r = await db.query(
      `UPDATE surat_perintah_kerja SET pdf_url = 'scan.pdf' WHERE id = $1 RETURNING id`,
      [dibuat[0]])
    expect(r.rowCount).toBe(1)
  })
})

describe('SPK ganda & pembatalan', () => {
  it('SPK kedua DIPERINGATKAN, bukan ditolak — addendum sah', async () => {
    const r = await buat(isiSah({ lingkup_kerja: `${TANDA} Addendum tambah kolom` }))
    expect(r.statusCode).toBe(201)
    expect(r.json().peringatan).toMatch(/sudah punya SPK aktif/i)
    dibuat.push(r.json().spk.id)
  })

  it('pembatalan wajib beralasan', async () => {
    const r = await ubah(dibuat[1], { status: 'dibatalkan' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/wajib beralasan/i)
  })

  it('membatalkan yang KEDUA tak menghapus status kontrak induknya', async () => {
    // Tanpa syarat "tak ada SPK lain yang berlaku" di trigger, membatalkan
    // addendum akan mengembalikan `contract_status` jadi `unsigned` —
    // menghapus jejak kontrak induk yang masih sah.
    const r = await ubah(dibuat[1], { status: 'dibatalkan', alasan: 'salah lingkup' })
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      'SELECT contract_status FROM work_scopes WHERE id = $1', [scopeId])
    expect(rows[0].contract_status).toBe('signed')
  })

  it('yang sudah dibatalkan tak bisa diubah lagi', async () => {
    const r = await ubah(dibuat[1], { status: 'diterbitkan' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/sudah dibatalkan/i)
  })
})

describe('denda dihitung saat baca', () => {
  it('SPK terlambat menampilkan denda beserta batasnya', async () => {
    // Disimpan, denda jadi basi diam-diam: keterlambatan bertambah tiap hari
    // dan tak ada yang menjalankan ulang perhitungannya.
    const { rows: p } = await db.query(
      `SELECT project_id FROM work_scopes ws
         JOIN mandor_assignments ma ON ma.id = ws.assignment_id
        WHERE ws.id = $1`, [scopeId])

    const { rows: ins } = await db.query(
      `INSERT INTO surat_perintah_kerja
         (company_id, project_id, work_scope_id, nomor, tanggal_terbit, lingkup_kerja,
          nilai_kontrak, tanggal_mulai, tanggal_selesai, denda_per_hari, denda_maks_pct,
          diterbitkan_oleh, status, ttd_penerbit_url, ttd_pelaksana_url)
       VALUES ($1, $2, $3, $4, '2025-01-01', $5, 100000000, '2025-01-01', '2025-02-01',
               1000000, 5, (SELECT id FROM users WHERE auth_id = $6),
               'ditandatangani', 'a.png', 'b.png')
       RETURNING id`,
      [companyId, p[0].project_id, scopeId, `${TANDA}-LAMBAT`, `${TANDA} terlambat`, adminAuth])
    dibuat.push(ins[0].id)

    const r = await app.inject({
      method: 'GET', url: `/api/v1/spk?work_scope_id=${scopeId}`,
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode).toBe(200)
    const lambat = (r.json().spk as Array<Record<string, unknown>>)
      .find((s) => String(s.nomor).includes('LAMBAT'))
    expect(lambat).toBeTruthy()

    const d = lambat!.denda as Record<string, number | boolean>
    expect(d.hariTerlambat).toBeGreaterThan(300)
    // Batas 5% dari 100 jt = 5 jt, jauh di bawah denda kotornya.
    expect(d.dendaTerbatas).toBe(5_000_000)
    expect(d.terkenaBatas).toBe(true)
  })
})
