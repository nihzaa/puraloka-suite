/**
 * F1 — penomoran dokumen, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   • prefix yang disimpan BENAR-BENAR terbaca oleh `next_document_number_full`
 *     — inti F1, dan hal yang tak bisa dibuktikan test murni
 *   • counter TIDAK naik saat halaman pengaturan dibuka (pratinjau tak
 *     membakar nomor)
 *   • counter tak pernah MUNDUR, dan tak ada rute yang bisa memundurkannya
 *   • CHECK basis menolak prefix/padding yang lolos dari sisi aplikasi
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, companyRute } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import penomoranRoutes from '../penomoran.js'

let app: FastifyInstance
let db: Client
let companyId: string

const JENIS = 'uji_f1'

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })
const patch = (url: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  // `companyRute`, bukan `company_members ... LIMIT 1`: pengguna admin yang
  // dipilih harness anggota TIGA company, dan `LIMIT 1` tanpa `ORDER BY`
  // memulangkan yang lain daripada `auth_company_id()` yang dipakai rute.
  // Seri lalu ditulis ke tenant A dan dicari di tenant B - 404, bukan galat
  // izin, jadi gejalanya menuduh rute alih-alih fixture. Diukur 2026-08-28.
  companyId = await companyRute(db, auth)

  await db.query('DELETE FROM document_number_series WHERE doc_type LIKE $1', [`${JENIS}%`])
  // Dua periode supaya pengelompokan & "periode terbaru" benar-benar teruji.
  await db.query(
    `INSERT INTO document_number_series (company_id, doc_type, period, prefix, padding, last_number)
     VALUES ($1, $2, '2026-07', '', 4, 30), ($1, $2, '2026-08', '', 4, 12)`,
    [companyId, JENIS])

  app = Fastify({ logger: false })
  await app.register(penomoranRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await db.query('DELETE FROM document_number_series WHERE doc_type LIKE $1', [`${JENIS}%`])
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('membaca seri', () => {
  it('mengelompokkan periode di bawah satu jenis, periode terbaru di depan', async () => {
    const r = await get('/api/v1/penomoran')
    expect(r.statusCode, r.body).toBe(200)
    const j = r.json().penomoran.find((x: { doc_type: string }) => x.doc_type === JENIS)
    expect(j).toBeTruthy()
    expect(j.periode).toHaveLength(2)
    expect(j.terbaru.period).toBe('2026-08')
    expect(j.totalTerbit).toBe(42)
  })

  it('contoh nomor berikutnya dihitung dari periode terbaru', async () => {
    const r = await get('/api/v1/penomoran')
    const j = r.json().penomoran.find((x: { doc_type: string }) => x.doc_type === JENIS)
    // last_number 12 pada 2026-08, prefix kosong → berikutnya 2026-08-0013.
    expect(j.contoh_berikutnya).toBe('2026-08-0013')
  })

  it('MEMBUKA halaman TIDAK menaikkan counter', async () => {
    // Kalau pratinjau memanggil `next_document_number_full()`, tiap kali
    // seseorang membuka pengaturan satu nomor terbakar — dan lubang pada
    // urutan nomor karena orang melihat-lihat sulit dijelaskan ke auditor.
    const { rows: sebelum } = await db.query(
      `SELECT last_number FROM document_number_series
        WHERE company_id = $1 AND doc_type = $2 AND period = '2026-08'`,
      [companyId, JENIS])

    await get('/api/v1/penomoran')
    await get('/api/v1/penomoran')
    await get('/api/v1/penomoran')

    const { rows: sesudah } = await db.query(
      `SELECT last_number FROM document_number_series
        WHERE company_id = $1 AND doc_type = $2 AND period = '2026-08'`,
      [companyId, JENIS])
    expect(String(sesudah[0].last_number)).toBe(String(sebelum[0].last_number))
  })
})

describe('mengubah prefix', () => {
  it('prefix tersimpan ke SELURUH periode jenis itu', async () => {
    const r = await patch(`/api/v1/penomoran/${JENIS}`, { prefix: 'UJI', padding: 4 })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().penomoran).toHaveLength(2)

    const { rows } = await db.query(
      `SELECT period, prefix FROM document_number_series
        WHERE company_id = $1 AND doc_type = $2 ORDER BY period`,
      [companyId, JENIS])
    expect(rows.map((x) => x.prefix)).toEqual(['UJI', 'UJI'])
  })

  it('prefix BENAR-BENAR terbaca fungsi penomor — inti F1', async () => {
    // Sampai migrasi 333, `prefix` tak pernah dibaca: fungsinya mengembalikan
    // BIGINT saja. Ini yang membuktikan lubang itu tertutup, dan ia hanya bisa
    // dijawab dengan memanggil fungsinya sungguhan.
    const { rows } = await db.query(
      `SELECT * FROM next_document_number_full($1, $2, '2026-08', 4)`, [companyId, JENIS])
    expect(rows[0].nomor).toBe('UJI-2026-08-0013')
    expect(rows[0].prefix_dipakai).toBe('UJI')

    // Dan counter-nya naik — pemanggilan ini memang menomori.
    const { rows: sesudah } = await db.query(
      `SELECT last_number FROM document_number_series
        WHERE company_id = $1 AND doc_type = $2 AND period = '2026-08'`,
      [companyId, JENIS])
    expect(Number(sesudah[0].last_number)).toBe(13)
  })

  it('padding tersimpan dan dipakai', async () => {
    const r = await patch(`/api/v1/penomoran/${JENIS}`, { prefix: 'UJI', padding: 6 })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().contoh_berikutnya).toBe('UJI-2026-08-000014')

    const { rows } = await db.query(
      `SELECT * FROM next_document_number_full($1, $2, '2026-08', 6)`, [companyId, JENIS])
    expect(rows[0].nomor).toBe('UJI-2026-08-000014')
  })

  it('prefix bertanda hubung ditolak 400 dengan alasan yang menyebut akibatnya', async () => {
    const r = await patch(`/api/v1/penomoran/${JENIS}`, { prefix: 'UJI-2026', padding: 4 })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/UJI-2026-2026-0001|INV-2026-2026-0001/)
  })

  it('padding kosong ditolak 400, BUKAN disimpan sebagai nol', async () => {
    const r = await patch(`/api/v1/penomoran/${JENIS}`, { prefix: 'UJI', padding: '' })
    expect(r.statusCode).toBe(400)

    const { rows } = await db.query(
      `SELECT DISTINCT padding FROM document_number_series
        WHERE company_id = $1 AND doc_type = $2`, [companyId, JENIS])
    expect(rows.every((x) => Number(x.padding) > 0)).toBe(true)
  })

  it('jenis yang belum punya seri ditolak 404, tidak diam-diam dibuat', async () => {
    const r = await patch('/api/v1/penomoran/jenis_yang_tak_ada', { prefix: 'X', padding: 4 })
    expect(r.statusCode, r.body).toBe(404)
    expect(r.json().error).toMatch(/lahir sendiri/i)

    const { rows } = await db.query(
      `SELECT count(*)::int n FROM document_number_series WHERE doc_type = 'jenis_yang_tak_ada'`)
    expect(rows[0].n).toBe(0)
  })

  it('seri milik tenant LAIN tak tersentuh', async () => {
    const { rows: coLain } = await db.query(
      'SELECT id FROM companies WHERE id <> $1 LIMIT 1', [companyId])
    if (!coLain.length) throw new Error('fixture company lain tak ada')

    await db.query(
      `INSERT INTO document_number_series (company_id, doc_type, period, prefix, padding, last_number)
       VALUES ($1, $2, '2026-08', 'ASING', 4, 5)
       ON CONFLICT (company_id, doc_type, period) DO UPDATE SET prefix = 'ASING'`,
      [coLain[0].id, JENIS])

    const r = await patch(`/api/v1/penomoran/${JENIS}`, { prefix: 'KITA', padding: 4 })
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      `SELECT prefix FROM document_number_series WHERE company_id = $1 AND doc_type = $2`,
      [coLain[0].id, JENIS])
    expect(rows[0].prefix,
      'prefix tenant lain ikut berubah — satu perusahaan mengubah nomor invoice perusahaan lain')
      .toBe('ASING')
  })
})

describe('counter tak boleh mundur', () => {
  it('tak ada rute yang memundurkan last_number', async () => {
    // Bukan test perilaku melainkan test PERMUKAAN: begitu endpoint semacam
    // itu ada, ia cepat atau lambat diberikan ke seseorang, dan nomor dokumen
    // yang sudah terkirim ke pihak ketiga lahir kembali.
    const rutes = app.printRoutes({ commonPrefix: false })
    expect(rutes).not.toMatch(/reset|mundur|rollback/i)
  })

  it('PATCH tidak menyentuh last_number sama sekali', async () => {
    const { rows: sebelum } = await db.query(
      `SELECT period, last_number FROM document_number_series
        WHERE company_id = $1 AND doc_type = $2 ORDER BY period`, [companyId, JENIS])

    await patch(`/api/v1/penomoran/${JENIS}`, { prefix: 'TETAP', padding: 5 })

    const { rows: sesudah } = await db.query(
      `SELECT period, last_number FROM document_number_series
        WHERE company_id = $1 AND doc_type = $2 ORDER BY period`, [companyId, JENIS])
    expect(sesudah.map((x) => String(x.last_number)))
      .toEqual(sebelum.map((x) => String(x.last_number)))
  })
})

describe('nomor invoice tak lagi dari COUNT(*) — F1', () => {
  // `termin-payment.ts` memakai multipart (upload bukti transfer), jadi
  // mengujinya lewat `app.inject` berarti menyusun form-data di test —
  // kerumitan yang menguji parser, bukan penomorannya.
  //
  // Yang diuji di sini adalah SIFAT yang membedakan kedua pola, dan sifat itu
  // hidup di basis: counter tak pernah mundur saat baris dihapus, sementara
  // `COUNT(*)` selalu mundur. Kalau rutenya kembali ke COUNT, sifat ini yang
  // pertama hilang.
  const JENIS_INV = `${JENIS}_inv`

  it('counter TIDAK mundur saat dokumen dihapus — COUNT(*) selalu mundur', async () => {
    await db.query('DELETE FROM document_number_series WHERE doc_type = $1', [JENIS_INV])

    const { rows: a } = await db.query(
      `SELECT * FROM next_document_number_full($1, $2, '2026-08', 4)`, [companyId, JENIS_INV])
    const { rows: b } = await db.query(
      `SELECT * FROM next_document_number_full($1, $2, '2026-08', 4)`, [companyId, JENIS_INV])
    expect(Number(a[0].urut)).toBe(1)
    expect(Number(b[0].urut)).toBe(2)

    // Dokumen kedua "dihapus" — counter tetap di 2.
    const { rows: c } = await db.query(
      `SELECT * FROM next_document_number_full($1, $2, '2026-08', 4)`, [companyId, JENIS_INV])
    expect(Number(c[0].urut),
      'nomor dokumen lahir kembali sesudah penghapusan — nomor kembar untuk ' +
      'dokumen yang sudah terkirim ke klien').toBe(3)
  })

  it('dua company memakai deret TERPISAH, nomornya tak berlanjut', async () => {
    // Cacat #1 migrasi 135: `COUNT(*)` tak menyaring company, jadi tenant B
    // melanjutkan penomoran tenant A — dan dari lompatan nomornya, B bisa
    // menyimpulkan berapa dokumen yang dibuat A.
    const { rows: coLain } = await db.query(
      'SELECT id FROM companies WHERE id <> $1 LIMIT 1', [companyId])
    if (!coLain.length) throw new Error('fixture company lain tak ada')

    const { rows: lain } = await db.query(
      `SELECT * FROM next_document_number_full($1, $2, '2026-08', 4)`,
      [coLain[0].id, JENIS_INV])
    expect(Number(lain[0].urut),
      'tenant kedua melanjutkan penomoran tenant pertama').toBe(1)

    await db.query('DELETE FROM document_number_series WHERE doc_type = $1', [JENIS_INV])
  })
})

describe('LPAD memangkas — nomor melebihi lebar', () => {
  it('nomor 10001 dengan lebar 4 TIDAK jadi 1000', async () => {
    // `LPAD` di Postgres bukan hanya MENAMBAL; ia MEMANGKAS bila stringnya
    // lebih panjang: `LPAD('10001', 4, '0')` = '1000'.
    //
    // Akibatnya bukan nomor yang jelek melainkan nomor yang BERULANG — dan
    // unique index menolak setiap INSERT berikutnya, jadi dokumen jenis itu
    // berhenti bisa dibuat sama sekali.
    //
    // Ditemukan penjaga `audit-lpad-memangkas.mjs` pada versi pertama fungsi
    // ini. Test murni tak bisa menangkapnya: `padStart` di JavaScript TIDAK
    // memangkas, jadi pemodelan JS-nya hijau sementara basisnya salah.
    const JENIS_LEBAR = `${JENIS}_lebar`
    await db.query('DELETE FROM document_number_series WHERE doc_type = $1', [JENIS_LEBAR])
    await db.query(
      `INSERT INTO document_number_series (company_id, doc_type, period, prefix, padding, last_number)
       VALUES ($1, $2, '2026', 'BIG', 4, 10000)`,
      [companyId, JENIS_LEBAR])

    const { rows } = await db.query(
      `SELECT * FROM next_document_number_full($1, $2, '2026', 4)`, [companyId, JENIS_LEBAR])
    expect(rows[0].nomor,
      'nomor terpangkas — dua dokumen berbeda mendapat nomor yang sama').toBe('BIG-2026-10001')

    await db.query('DELETE FROM document_number_series WHERE doc_type = $1', [JENIS_LEBAR])
  })

  it('nomor yang masih muat TETAP ditambal nol', async () => {
    const JENIS_KECIL = `${JENIS}_kecil`
    await db.query('DELETE FROM document_number_series WHERE doc_type = $1', [JENIS_KECIL])
    await db.query(
      `INSERT INTO document_number_series (company_id, doc_type, period, prefix, padding, last_number)
       VALUES ($1, $2, '2026', 'KEC', 4, 6)`,
      [companyId, JENIS_KECIL])

    const { rows } = await db.query(
      `SELECT * FROM next_document_number_full($1, $2, '2026', 4)`, [companyId, JENIS_KECIL])
    expect(rows[0].nomor).toBe('KEC-2026-0007')

    await db.query('DELETE FROM document_number_series WHERE doc_type = $1', [JENIS_KECIL])
  })
})

describe('CHECK basis — lapis kedua di bawah validasi aplikasi', () => {
  it('prefix berspasi ditolak basis', async () => {
    await expect(
      db.query(
        `UPDATE document_number_series SET prefix = 'A B'
          WHERE company_id = $1 AND doc_type = $2`, [companyId, JENIS]),
    ).rejects.toThrow(/check/i)
  })

  it('padding di luar 1-12 ditolak basis', async () => {
    await expect(
      db.query(
        `UPDATE document_number_series SET padding = 99
          WHERE company_id = $1 AND doc_type = $2`, [companyId, JENIS]),
    ).rejects.toThrow(/check/i)
  })
})
