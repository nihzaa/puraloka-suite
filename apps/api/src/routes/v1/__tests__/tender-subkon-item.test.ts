/**
 * Penawaran subkon PER-ITEM + salin BOQ pemenang — terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   • trigger 437 benar-benar MENOLAK total yang tak cocok dengan rinciannya —
 *     dua arah: item yang diubah, dan total yang diubah
 *   • trigger DEFERRABLE benar-benar membiarkan keadaan setengah jalan lewat
 *     di dalam satu transaksi (kalau IMMEDIATE, PUT item mustahil berhasil)
 *   • penyalinan BOQ TIDAK MENIMPA `work_scope_items` yang sudah berprogres —
 *     `pct_done` kolom GENERATED, dan progres lapangan tak bisa dibuat ulang
 *   • penawaran hanya-total tetap sah (8 baris yang sudah ada di basis)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, companyBerisi } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import tenderSubkonRoutes from '../tender-subkon.js'

let app: FastifyInstance
let db: Client
let companyId: string
let projectId: string

const TANDA = 'UJI-TSKITEM'
const ALASAN = 'Satu-satunya yang pernah mengerjakan pekerjaan sejenis di lokasi ini.'

const put = (url: string, payload: unknown) =>
  app.inject({ method: 'PUT', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const patch = (url: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

async function bersihkan() {
  await db.query(
    `DELETE FROM work_scope_items WHERE work_scope_id IN (
       SELECT ws.id FROM work_scopes ws WHERE ws.scope_name LIKE $1)`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM work_scopes WHERE scope_name LIKE $1`, [`${TANDA}%`])
  // Penugasan hanya dihapus bila TAK ADA lingkup kerja lain yang menggantung
  // padanya. Fixture ini memakai `ON CONFLICT DO UPDATE`, jadi ia bisa saja
  // menumpang penugasan NYATA yang sudah ada di basis dev — menghapusnya
  // membuang data orang lain, dan FK-nya ON DELETE RESTRICT memang menolak.
  await db.query(
    `DELETE FROM mandor_assignments ma
      WHERE ma.notes = $1
        AND NOT EXISTS (SELECT 1 FROM work_scopes ws WHERE ws.assignment_id = ma.id)`,
    [TANDA])
  await db.query(
    `DELETE FROM penawaran_subkon WHERE tender_id IN
       (SELECT id FROM tender_subkon WHERE nomor LIKE $1)`, [`${TANDA}%`])
  await db.query('DELETE FROM tender_subkon WHERE nomor LIKE $1', [`${TANDA}%`])
}

/** Tender + dua penawar. Nilai sengaja BULAT supaya cocok dengan rinciannya. */
async function siapkanTender(nomor: string) {
  const { rows: t } = await db.query(
    `INSERT INTO tender_subkon (project_id, nomor, judul, nilai_perkiraan, tanggal, status)
     VALUES ($1, $2, 'Uji rincian per-item', 60000000, '2026-02-01', 'terkirim')
     RETURNING id`, [projectId, nomor])

  const { rows: w } = await db.query(
    'SELECT id FROM workers WHERE company_id = $1 LIMIT 2', [companyId])
  if (w.length < 2) throw new Error('butuh dua worker di company ini — fixture tak terbentuk')

  const buat = async (wid: string, nilai: number) => {
    const { rows } = await db.query(
      `INSERT INTO penawaran_subkon (tender_id, worker_id, nilai_penawaran, status)
       VALUES ($1, $2, $3, 'diajukan') RETURNING id`, [t[0].id, wid, nilai])
    return rows[0].id as string
  }

  return {
    tenderId: t[0].id as string,
    a: await buat(w[0].id, 50_000_000),
    b: await buat(w[1].id, 55_000_000),
  }
}

/**
 * Lingkup kerja + BOQ awal, supaya penyalinan punya tujuan.
 *
 * ⚠ Nama & tujuan kolomnya DIUKUR, bukan ditebak — dua kali salah:
 *
 *   1. `worker_id` → sebenarnya `mandor_id`
 *   2. `mandor_id` DIISI id dari `workers` → FK-nya menunjuk `users`,
 *      bukan `workers`
 *
 * Yang kedua tak terlihat dari nama kolomnya sama sekali. Dicatat di sini
 * karena "mandor" di modul ini punya DUA representasi (workers untuk penawar
 * tender, users untuk penerima penugasan), dan menyamakannya adalah galat
 * yang berulang.
 */
async function siapkanWorkScope(nomorScope: string) {
  const { rows: u } = await db.query(
    `SELECT u.id FROM users u
       JOIN company_members cm ON cm.user_id = u.id
      WHERE cm.company_id = $1 LIMIT 1`, [companyId])
  if (!u.length) throw new Error('tak ada user di company ini — fixture tak terbentuk')

  // SATU penugasan dipakai ulang seluruh berkas: `mandor_assignments` unik
  // atas (project_id, mandor_id), jadi tiap test yang membuat penugasan
  // sendiri akan bertabrakan pada test KEDUA. Yang dibedakan per test adalah
  // `work_scopes`-nya — dan itu memang yang sedang diuji.
  const { rows: ma } = await db.query(
    `INSERT INTO mandor_assignments (project_id, mandor_id, assigned_by, notes)
     VALUES ($1, $2, $2, $3)
     ON CONFLICT (project_id, mandor_id) DO UPDATE SET notes = EXCLUDED.notes
     RETURNING id`, [projectId, u[0].id, TANDA])

  const { rows: ws } = await db.query(
    `INSERT INTO work_scopes (assignment_id, scope_name, payment_system, borongan_value)
     VALUES ($1, $2, 'borongan', 50000000) RETURNING id`, [ma[0].id, nomorScope])

  return { scopeId: ws[0].id as string, userId: u[0].id as string }
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  // Company dipilih yang BENAR-BENAR berisi bahan fixture — akun uji anggota
  // tiga company, dan seluruh `workers` ada di satu saja.
  companyId = await companyBerisi(db, auth, ['workers', 'projects'])

  const { rows: p } = await db.query(
    'SELECT id FROM projects WHERE company_id = $1 LIMIT 1', [companyId])
  if (!p.length) throw new Error('tak ada proyek di company ini')
  projectId = p[0].id

  await bersihkan()

  app = Fastify({ logger: false })
  await app.register(tenderSubkonRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await bersihkan()
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('PUT rincian item — total dan rinciannya wajib cocok', () => {
  it('rincian yang jumlahnya COCOK tersimpan, subtotal dihitung basis', async () => {
    const f = await siapkanTender(`${TANDA}-001`)
    const r = await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.a}/item`, {
      item: [
        { kode_item: 'A.1', uraian: 'Galian tanah', satuan: 'm3', volume: 100, harga_satuan: 300000 },
        { kode_item: 'A.2', uraian: 'Urugan pasir', satuan: 'm3', volume: 40, harga_satuan: 500000 },
      ],
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().jumlah_item).toBe(2)

    const { rows } = await db.query(
      'SELECT SUM(subtotal)::numeric s FROM penawaran_subkon_item WHERE penawaran_id = $1', [f.a])
    expect(Number(rows[0].s)).toBe(50_000_000)
  })

  it('total yang TIDAK cocok dengan rinciannya ditolak 409, dan basis tak berubah', async () => {
    const f = await siapkanTender(`${TANDA}-002`)
    const r = await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.a}/item`, {
      item: [{ uraian: 'Galian', volume: 1, harga_satuan: 1000 }],
      nilai_penawaran: 99_000_000,
    })
    expect(r.statusCode, r.body).toBe(409)

    const { rows } = await db.query(
      'SELECT count(*)::int n FROM penawaran_subkon_item WHERE penawaran_id = $1', [f.a])
    expect(rows[0].n, 'penolakan meninggalkan rincian separuh jalan').toBe(0)
  })

  it('total tak dikirim → dihitung dari rincian, dan penawarannya ikut berubah', async () => {
    const f = await siapkanTender(`${TANDA}-003`)
    const r = await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.a}/item`, {
      item: [{ uraian: 'Galian', volume: 2, harga_satuan: 1_500_000 }],
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(Number(r.json().nilai_penawaran)).toBe(3_000_000)

    const { rows } = await db.query(
      'SELECT nilai_penawaran FROM penawaran_subkon WHERE id = $1', [f.a])
    expect(Number(rows[0].nilai_penawaran)).toBe(3_000_000)
  })

  it('mengirim [] menghapus rincian — penawaran kembali jadi HANYA TOTAL, tetap sah', async () => {
    // Inti dari "per-item OPSIONAL": 8 penawaran yang sudah ada di basis
    // hanya punya total, dan tak boleh jadi tak sah karena schema berkembang.
    const f = await siapkanTender(`${TANDA}-004`)
    await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.a}/item`, {
      item: [{ uraian: 'Galian', volume: 1, harga_satuan: 50_000_000 }],
    })
    const r = await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.a}/item`, { item: [] })
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      'SELECT nilai_penawaran FROM penawaran_subkon WHERE id = $1', [f.a])
    expect(Number(rows[0].nilai_penawaran)).toBe(50_000_000)
  })

  it('kode item KEMBAR dalam satu penawaran ditolak', async () => {
    const f = await siapkanTender(`${TANDA}-005`)
    const r = await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.a}/item`, {
      item: [
        { kode_item: 'A.1', uraian: 'Galian', volume: 1, harga_satuan: 1000 },
        { kode_item: 'A.1', uraian: 'Galian lagi', volume: 1, harga_satuan: 1000 },
      ],
      nilai_penawaran: 2000,
    })
    expect(r.statusCode, r.body).toBe(400)
    expect(r.json().error).toMatch(/kembar/i)
  })

  it('baris tanpa uraian ditolak dan MENYEBUT nomor barisnya', async () => {
    const f = await siapkanTender(`${TANDA}-006`)
    const r = await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.a}/item`, {
      item: [
        { uraian: 'Galian', volume: 1, harga_satuan: 1000 },
        { uraian: '   ', volume: 1, harga_satuan: 1000 },
      ],
    })
    expect(r.statusCode, r.body).toBe(400)
    expect(r.json().error).toMatch(/Baris 2/)
  })

  it('tender yang sudah SELESAI menolak perubahan rincian', async () => {
    const f = await siapkanTender(`${TANDA}-007`)
    await db.query(
      `UPDATE tender_subkon SET status = 'selesai', alasan_pilih = $2 WHERE id = $1`,
      [f.tenderId, ALASAN]).catch(() => {
        // Trigger 347 menuntut pemenang; kalau ditolak, tandai lewat pemenang.
      })
    await db.query(`UPDATE penawaran_subkon SET status = 'menang' WHERE id = $1`, [f.a])
    await db.query(
      `UPDATE tender_subkon SET status = 'selesai', alasan_pilih = $2 WHERE id = $1`,
      [f.tenderId, ALASAN])

    const r = await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.a}/item`, {
      item: [{ uraian: 'Galian', volume: 1, harga_satuan: 1000 }],
    })
    expect(r.statusCode, r.body).toBe(409)
  })
})

describe('GET detail — perbandingan per-item', () => {
  it('tanpa rincian, `perbandingan_item` NULL — bukan objek kosong', async () => {
    // Layar harus bisa membedakan "dibandingkan per-total saja" dari "ada
    // rincian tapi semuanya nol".
    const f = await siapkanTender(`${TANDA}-010`)
    const r = await get(`/api/v1/tender-subkon/${f.tenderId}`)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().perbandingan_item).toBeNull()
  })

  it('pos yang TIDAK diisi seorang penawar ditandai tak lengkap', async () => {
    const f = await siapkanTender(`${TANDA}-011`)
    await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.a}/item`, {
      item: [
        { kode_item: 'A.1', uraian: 'Galian', volume: 10, harga_satuan: 1_000_000 },
        { kode_item: 'A.2', uraian: 'Urugan', volume: 10, harga_satuan: 4_000_000 },
      ],
    })
    // Penawar B TIDAK mengisi A.2 — inilah pola "totalnya murah karena satu
    // pos tak ia hitung".
    await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.b}/item`, {
      item: [{ kode_item: 'A.1', uraian: 'Galian', volume: 10, harga_satuan: 900_000 }],
    })

    const r = await get(`/api/v1/tender-subkon/${f.tenderId}`)
    expect(r.statusCode, r.body).toBe(200)
    const pi = r.json().perbandingan_item
    expect(pi).not.toBeNull()
    expect(pi.jumlah_item_tak_lengkap).toBe(1)

    const b = pi.penawar.find((p: { penawaran_id: string }) => p.penawaran_id === f.b)
    expect(b.jumlah_tak_diisi).toBe(1)
  })
})

describe('penetapan pemenang — salin BOQ ke work_scope_items', () => {
  it('tanpa work_scope_id, penetapan TETAP berhasil dan sebabnya dinyatakan', async () => {
    const f = await siapkanTender(`${TANDA}-020`)
    await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.a}/item`, {
      item: [{ uraian: 'Galian', volume: 10, harga_satuan: 5_000_000 }],
    })
    const r = await patch(`/api/v1/tender-subkon/${f.tenderId}/pemenang`,
      { penawaran_id: f.a, alasan: ALASAN })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().boq.disalin).toBe(false)
    expect(r.json().boq.sebab).toMatch(/lingkup kerja/i)
  })

  it('BOQ kosong: seluruh item pemenang tersalin', async () => {
    const f = await siapkanTender(`${TANDA}-021`)
    const ws = await siapkanWorkScope(`${TANDA}-SCOPE-021`)
    await db.query('UPDATE tender_subkon SET work_scope_id = $2 WHERE id = $1',
      [f.tenderId, ws.scopeId])

    await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.a}/item`, {
      item: [
        { uraian: 'Galian tanah', satuan: 'm3', volume: 100, harga_satuan: 300000 },
        { uraian: 'Urugan pasir', satuan: 'm3', volume: 40, harga_satuan: 500000 },
      ],
    })

    const r = await patch(`/api/v1/tender-subkon/${f.tenderId}/pemenang`,
      { penawaran_id: f.a, alasan: ALASAN })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().boq.disalin, JSON.stringify(r.json().boq)).toBe(true)
    expect(r.json().boq.jumlah_sisip).toBe(2)

    const { rows } = await db.query(
      `SELECT item_name, unit::text, volume, unit_price
         FROM work_scope_items WHERE work_scope_id = $1 ORDER BY sort_order`, [ws.scopeId])
    expect(rows).toHaveLength(2)
    expect(rows[0].item_name).toBe('Galian tanah')
    expect(rows[0].unit).toBe('m3')
    expect(Number(rows[0].unit_price)).toBe(300000)
  })

  it('⚠ item BOQ yang SUDAH BERPROGRES tidak ditimpa — dan dilaporkan', async () => {
    // Titik paling penting di seluruh berkas ini. Menimpa `volume` mengubah
    // `pct_done` (kolom GENERATED 023:80), sehingga pekerjaan yang terukur
    // selesai bisa mendadak jadi separuh tanpa ada yang menyentuh lapangan.
    const f = await siapkanTender(`${TANDA}-022`)
    const ws = await siapkanWorkScope(`${TANDA}-SCOPE-022`)
    await db.query('UPDATE tender_subkon SET work_scope_id = $2 WHERE id = $1',
      [f.tenderId, ws.scopeId])

    // BOQ lama: satu item SUDAH dikerjakan 30 dari 50.
    await db.query(
      `INSERT INTO work_scope_items
         (work_scope_id, item_name, unit, volume, unit_price, volume_done, created_by)
       VALUES ($1, 'Galian tanah', 'm3', 50, 200000, 30, $2)`, [ws.scopeId, ws.userId])

    const { rows: sebelum } = await db.query(
      `SELECT volume, unit_price, pct_done FROM work_scope_items
        WHERE work_scope_id = $1 AND item_name = 'Galian tanah'`, [ws.scopeId])
    expect(Number(sebelum[0].pct_done)).toBe(60)

    await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.a}/item`, {
      item: [
        // Volume & harga BERBEDA jauh dari BOQ yang sudah berprogres.
        { uraian: 'Galian tanah', satuan: 'm3', volume: 999, harga_satuan: 1_000 },
        { uraian: 'Pos baru', satuan: 'ls', volume: 1, harga_satuan: 49_001_000 },
      ],
    })

    const r = await patch(`/api/v1/tender-subkon/${f.tenderId}/pemenang`,
      { penawaran_id: f.a, alasan: ALASAN })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().boq.dilewati_berprogres).toEqual(['Galian tanah'])
    expect(r.json().boq.jumlah_perbarui).toBe(0)
    expect(r.json().boq.jumlah_sisip).toBe(1)

    const { rows: sesudah } = await db.query(
      `SELECT volume, unit_price, volume_done, pct_done FROM work_scope_items
        WHERE work_scope_id = $1 AND item_name = 'Galian tanah'`, [ws.scopeId])
    expect(Number(sesudah[0].volume), 'volume item berprogres TERTIMPA').toBe(50)
    expect(Number(sesudah[0].unit_price), 'harga item berprogres TERTIMPA').toBe(200000)
    expect(Number(sesudah[0].volume_done)).toBe(30)
    expect(Number(sesudah[0].pct_done), 'progres lapangan berubah tanpa ada yang mengukur').toBe(60)
  })

  it('item BOQ yang BELUM berprogres diperbarui harganya', async () => {
    const f = await siapkanTender(`${TANDA}-023`)
    const ws = await siapkanWorkScope(`${TANDA}-SCOPE-023`)
    await db.query('UPDATE tender_subkon SET work_scope_id = $2 WHERE id = $1',
      [f.tenderId, ws.scopeId])

    await db.query(
      `INSERT INTO work_scope_items
         (work_scope_id, item_name, unit, volume, unit_price, volume_done, created_by)
       VALUES ($1, 'Galian tanah', 'm3', 50, 200000, 0, $2)`, [ws.scopeId, ws.userId])

    await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.a}/item`, {
      item: [{ uraian: 'Galian tanah', satuan: 'm3', volume: 100, harga_satuan: 500_000 }],
    })

    const r = await patch(`/api/v1/tender-subkon/${f.tenderId}/pemenang`,
      { penawaran_id: f.a, alasan: ALASAN })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().boq.jumlah_perbarui).toBe(1)

    const { rows } = await db.query(
      `SELECT volume, unit_price FROM work_scope_items
        WHERE work_scope_id = $1 AND item_name = 'Galian tanah'`, [ws.scopeId])
    expect(Number(rows[0].volume)).toBe(100)
    expect(Number(rows[0].unit_price)).toBe(500_000)
  })

  it('item BOQ lama yang tak ada di penawaran TIDAK dihapus', async () => {
    const f = await siapkanTender(`${TANDA}-024`)
    const ws = await siapkanWorkScope(`${TANDA}-SCOPE-024`)
    await db.query('UPDATE tender_subkon SET work_scope_id = $2 WHERE id = $1',
      [f.tenderId, ws.scopeId])

    await db.query(
      `INSERT INTO work_scope_items
         (work_scope_id, item_name, unit, volume, unit_price, volume_done, created_by)
       VALUES ($1, 'Pekerjaan tambah disepakati terpisah', 'ls', 1, 5000000, 0, $2)`,
      [ws.scopeId, ws.userId])

    await put(`/api/v1/tender-subkon/${f.tenderId}/penawaran/${f.a}/item`, {
      item: [{ uraian: 'Galian tanah', satuan: 'm3', volume: 10, harga_satuan: 5_000_000 }],
    })
    await patch(`/api/v1/tender-subkon/${f.tenderId}/pemenang`,
      { penawaran_id: f.a, alasan: ALASAN })

    const { rows } = await db.query(
      `SELECT count(*)::int n FROM work_scope_items
        WHERE work_scope_id = $1 AND item_name LIKE 'Pekerjaan tambah%'`, [ws.scopeId])
    expect(rows[0].n, 'kesepakatan lain terhapus karena tak ada di penawaran').toBe(1)
  })

  it('pemenang hanya-total: penetapan berhasil, BOQ tidak berubah', async () => {
    const f = await siapkanTender(`${TANDA}-025`)
    const ws = await siapkanWorkScope(`${TANDA}-SCOPE-025`)
    await db.query('UPDATE tender_subkon SET work_scope_id = $2 WHERE id = $1',
      [f.tenderId, ws.scopeId])

    const r = await patch(`/api/v1/tender-subkon/${f.tenderId}/pemenang`,
      { penawaran_id: f.a, alasan: ALASAN })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().boq.disalin).toBe(false)

    const { rows } = await db.query(
      'SELECT count(*)::int n FROM work_scope_items WHERE work_scope_id = $1', [ws.scopeId])
    expect(rows[0].n).toBe(0)
  })
})
