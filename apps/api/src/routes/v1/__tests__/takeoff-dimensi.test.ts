import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import estimateVersionRoutes from '../estimate-versions.js'

// Take-off dimensional (migrasi 431) — rute GET/POST/terapkan terhadap Postgres
// NYATA, bukan mock.
//
// Yang diuji di sini BUKAN aritmetikanya (itu golden test `lib/takeoff-dimensi.
// test.ts`, tanpa basis), melainkan tiga hal yang hanya bisa dibuktikan dengan
// basis sungguhan:
//
//   1. hasil take-off TIDAK menimpa estimate_items.quantity sampai manusia
//      menekan tombol terapkan — inti keputusan desainnya;
//   2. saat DITERAPKAN, `amount` ikut bergerak dan jejaknya tertulis lengkap;
//   3. gerbang `draft` benar-benar menahan.
//
// GOLDEN: 12,5 × 0,8 × 0,6 × 4 × 1,25 = 30,0000 m³ (dihitung tangan).

let app: FastifyInstance
let client: Client
let adminAuth: string
let adminUserId: string
let versionId: string
let itemId: string
let itemLain: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({ data: { user: { id: a } }, error: null } as never)
const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })
const post = (url: string, payload: unknown = {}) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function purge() {
  await client.query(`SET session_replication_role = 'replica'`)
  try {
    await client.query(`DELETE FROM takeoff_dimensi WHERE estimate_item_id IN
      (SELECT ei.id FROM estimate_items ei JOIN estimate_versions ev ON ev.id=ei.estimate_version_id
       JOIN scenarios s ON s.id=ev.scenario_id JOIN projects p ON p.id=s.project_id
       WHERE p.name='[TEST-431] Proyek')`)
    await client.query(`DELETE FROM estimate_items WHERE estimate_version_id IN
      (SELECT ev.id FROM estimate_versions ev JOIN scenarios s ON s.id=ev.scenario_id
       JOIN projects p ON p.id=s.project_id WHERE p.name='[TEST-431] Proyek')`)
    await client.query(`DELETE FROM estimate_versions WHERE scenario_id IN
      (SELECT s.id FROM scenarios s JOIN projects p ON p.id=s.project_id WHERE p.name='[TEST-431] Proyek')`)
    await client.query(`DELETE FROM scenarios WHERE project_id IN
      (SELECT id FROM projects WHERE name='[TEST-431] Proyek')`)
    await client.query(`DELETE FROM projects WHERE name='[TEST-431] Proyek'`)
    await client.query(`DELETE FROM clients WHERE contact_person='[TEST-431] Klien'`)
    // 102 melarang DELETE cost_codes lewat trigger (jejak RAB→EVM) — jadi ia
    // dinetralkan jadi deprecated, pola yang sama dengan migrasi 431 & 427.
    await client.query(
      `UPDATE cost_codes SET status='deprecated', deprecated_at=now() WHERE code='[TEST-431]CC'`)
  } finally {
    await client.query(`SET session_replication_role = 'origin'`)
  }
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string
  await purge()

  // Diturunkan dari `adminAuth`, BUKAN dicari ulang dengan query sendiri.
  //
  // Versi pertama memakai `... WHERE r.name='admin' LIMIT 1` — query terpisah
  // tanpa urutan, yang memilih pengguna admin MANA SAJA. Selama itu kebetulan
  // orang yang sama dengan pilihan `authIdForRole`, tak ada yang terlihat
  // salah.
  //
  // Begitu harness diperbaiki (2026-08-16) supaya melewati pengguna yatim
  // tanpa keanggotaan, keduanya menunjuk orang BERBEDA: rute mencatat
  // `diterapkan_oleh` = pengguna sesi, sementara test membandingkannya dengan
  // pengguna hasil query sendiri. Test merah, padahal rutenya benar.
  //
  // Dua sumber untuk satu fakta — "siapa admin yang sedang dipakai test ini" —
  // akan berbeda suatu hari. Sekarang satu sumber.
  const { rows: u } = await client.query(
    'SELECT id FROM users WHERE auth_id = $1', [adminAuth])
  if (!u.length) throw new Error('pengguna sesi tak ditemukan — fixture tak terbentuk')
  adminUserId = u[0].id

  // `ON CONFLICT (code)` TIDAK bisa dipakai di sini, dan itu diukur bukan
  // ditebak: satu-satunya indeks unik yang memuat `code` adalah
  // `cost_codes_code_per_company (company_id, code) WHERE code IS NOT NULL` —
  // parsial DAN dua kolom, jadi spesifikasi `(code)` tak pernah cocok
  // ("there is no unique or exclusion constraint matching the ON CONFLICT
  // specification"). Karena purge menetralkan jadi `deprecated` alih-alih
  // menghapus (trigger 102 melarang DELETE), baris lama bisa tertinggal dari
  // run sebelumnya — jadi: pakai ulang bila ada, sisipkan bila belum.
  const { rows: ccAda } = await client.query(
    `SELECT id FROM cost_codes WHERE code='[TEST-431]CC' LIMIT 1`)
  const cc = ccAda.length > 0
    ? (await client.query(
        `UPDATE cost_codes SET status='active', deprecated_at=NULL WHERE id=$1 RETURNING id`,
        [ccAda[0].id])).rows
    : (await client.query(
        `INSERT INTO cost_codes (code, name, created_by)
         VALUES ('[TEST-431]CC', '[TEST] Galian', $1) RETURNING id`, [adminUserId])).rows
  const { rows: clnt } = await client.query(
    `INSERT INTO clients (company_id, contact_person, phone, created_by)
     VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),
             '[TEST-431] Klien', '08', $1) RETURNING id`, [adminUserId])
  const { rows: pr } = await client.query(
    `INSERT INTO projects (company_id, client_id, pm_id, name, location, start_date, end_date, created_by)
     VALUES ((SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1),
             $1, $2, '[TEST-431] Proyek', 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, $2) RETURNING id`,
    [clnt[0].id, adminUserId])
  const { rows: sc } = await client.query(
    `INSERT INTO scenarios (project_id, name, created_by) VALUES ($1, '[TEST-431] Skenario', $2) RETURNING id`,
    [pr[0].id, adminUserId])
  const { rows: ev } = await client.query(
    `INSERT INTO estimate_versions (scenario_id, version_number, total_amount, created_by)
     VALUES ($1, 1, 0, $2) RETURNING id`, [sc[0].id, adminUserId])
  versionId = ev[0].id

  // quantity 1 & amount 1.000.000 → HSP tersirat 1.000.000/m³. Dipilih bulat
  // supaya pergeseran `amount` saat diterapkan bisa dihitung tangan: 30 × 1jt.
  const { rows: ei } = await client.query(
    `INSERT INTO estimate_items (estimate_version_id, cost_code_id, quantity, amount)
     VALUES ($1, $2, 1, 1000000) RETURNING id`, [versionId, cc[0].id])
  itemId = ei[0].id
  const { rows: ei2 } = await client.query(
    `INSERT INTO estimate_items (estimate_version_id, cost_code_id, quantity, amount)
     VALUES ($1, $2, 1, 500000) RETURNING id`, [versionId, cc[0].id])
  itemLain = ei2[0].id

  app = Fastify()
  await app.register(estimateVersionRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('POST take-off — geometri masuk, hasil tersimpan', () => {
  it('GOLDEN 12,5 × 0,8 × 0,6 × 4 × 1,25 = 30 m³, dan rumusnya ikut dipulangkan', async () => {
    actAs(adminAuth)
    const res = await post(`/api/v1/estimate-versions/${versionId}/items/${itemId}/takeoff-dimensi`, {
      uraian: 'Galian pondasi P1', metode: 'volume',
      panjang_m: 12.5, lebar_m: 0.8, tinggi_m: 0.6, jumlah: 4, faktor: 1.25,
    })
    expect(res.statusCode).toBe(201)
    const j = res.json()
    expect(j.hasilVolume).toBeCloseTo(30, 6)
    expect(j.rumus).toBe('12,5 × 0,8 × 0,6 × 4 × 1,25 = 30 m³')

    // Tersimpan di DB, bukan cuma dihitung — termasuk FAKTOR-nya, yang membuat
    // angka historis tetap reproducible bila kebiasaan perusahaan direvisi.
    const { rows } = await client.query(
      `SELECT hasil_volume, faktor, panjang_m FROM takeoff_dimensi WHERE id=$1`, [j.id])
    expect(Number(rows[0].hasil_volume)).toBeCloseTo(30, 4)
    expect(Number(rows[0].faktor)).toBeCloseTo(1.25, 4)
    expect(Number(rows[0].panjang_m)).toBeCloseTo(12.5, 4)
  })

  it('INTI KEPUTUSAN: menyisipkan take-off TIDAK menggerakkan quantity', async () => {
    // Kalau ini gagal, ada jalur yang menimpa diam-diam — persis yang sengaja
    // TIDAK dibangun. Volume yang sudah dipakai kontrak & progres lapangan
    // tak boleh bergeser tanpa keputusan manusia.
    const { rows } = await client.query(`SELECT quantity, amount FROM estimate_items WHERE id=$1`, [itemId])
    expect(Number(rows[0].quantity)).toBe(1)
    expect(Number(rows[0].amount)).toBe(1000000)
  })

  it('masukan cacat ditolak 400, bukan 500 (salah pengguna, bukan salah server)', async () => {
    actAs(adminAuth)
    // metode 'volume' tanpa tinggi — kalau NULL diperlakukan 1, hasilnya 20 m³:
    // angka yang terlihat wajar untuk sebuah galian.
    const tanpaTinggi = await post(`/api/v1/estimate-versions/${versionId}/items/${itemId}/takeoff-dimensi`, {
      uraian: 'Tanpa tinggi', metode: 'volume', panjang_m: 10, lebar_m: 2,
    })
    expect(tanpaTinggi.statusCode).toBe(400)

    const metodeNgaco = await post(`/api/v1/estimate-versions/${versionId}/items/${itemId}/takeoff-dimensi`, {
      uraian: 'X', metode: 'kubikasi', panjang_m: 10,
    })
    expect(metodeNgaco.statusCode).toBe(400)

    const faktorNol = await post(`/api/v1/estimate-versions/${versionId}/items/${itemId}/takeoff-dimensi`, {
      uraian: 'X', metode: 'panjang', panjang_m: 10, faktor: 0,
    })
    expect(faktorNol.statusCode).toBe(400)

    const tanpaUraian = await post(`/api/v1/estimate-versions/${versionId}/items/${itemId}/takeoff-dimensi`, {
      uraian: '  ', metode: 'panjang', panjang_m: 10,
    })
    expect(tanpaUraian.statusCode).toBe(400)
  })

  it('item milik versi LAIN ditolak 404', async () => {
    actAs(adminAuth)
    const res = await post(
      `/api/v1/estimate-versions/${versionId}/items/00000000-0000-0000-0000-000000000000/takeoff-dimensi`,
      { uraian: 'X', metode: 'panjang', panjang_m: 10 })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET take-off — perhitungan terlihat, selisih terbaca', () => {
  it('mengelompokkan per item, membawa rekap + banding vs quantity RAB', async () => {
    actAs(adminAuth)
    const res = await get(`/api/v1/estimate-versions/${versionId}/takeoff-dimensi`)
    expect(res.statusCode).toBe(200)
    const item = res.json().items.find((i: { estimate_item_id: string }) => i.estimate_item_id === itemId)
    expect(item.baris).toHaveLength(1)
    expect(item.rekap.totalVolume).toBeCloseTo(30, 4)
    expect(item.rekap.satuan).toBe('m³')

    // Sinyal yang justru hilang kalau take-off menimpa quantity otomatis:
    // RAB masih 1, take-off sudah 30 → tidak sinkron, dan selisihnya terbaca.
    expect(item.quantity_rab).toBe(1)
    expect(item.banding.sinkron).toBe(false)
    expect(item.banding.selisih).toBeCloseTo(29, 4)

    // Dimensi dipulangkan sebagai ANGKA, bukan string numeric dari driver —
    // string yang lolos ke UI akan "dijumlahkan" jadi konkatenasi.
    expect(typeof item.baris[0].panjang_m).toBe('number')
    expect(item.baris[0].satuan).toBe('m³')
  })

  it('item tanpa baris take-off tetap muncul, dengan banding null', async () => {
    actAs(adminAuth)
    const res = await get(`/api/v1/estimate-versions/${versionId}/takeoff-dimensi`)
    const kosong = res.json().items.find((i: { estimate_item_id: string }) => i.estimate_item_id === itemLain)
    expect(kosong).toBeTruthy()
    expect(kosong.baris).toHaveLength(0)
    expect(kosong.banding).toBeNull()
  })
})

describe('POST terapkan — manusia menerapkan, dan jejaknya tertulis', () => {
  it('quantity & amount bergerak bersama, total versi ikut disegarkan', async () => {
    actAs(adminAuth)
    const res = await post(
      `/api/v1/estimate-versions/${versionId}/items/${itemId}/takeoff-dimensi/terapkan`)
    expect(res.statusCode).toBe(200)
    const j = res.json()
    expect(j.quantity_lama).toBe(1)
    expect(j.quantity_baru).toBeCloseTo(30, 4)
    // HSP tersirat 1.000.000/m³ × 30 m³ = 30.000.000. `amount` yang tak ikut
    // bergerak adalah baris RAB yang volumenya tak cocok dengan rupiahnya.
    expect(j.amount_baru).toBeCloseTo(30_000_000, 2)

    const { rows } = await client.query(
      `SELECT quantity, amount FROM estimate_items WHERE id=$1`, [itemId])
    expect(Number(rows[0].quantity)).toBeCloseTo(30, 4)
    expect(Number(rows[0].amount)).toBeCloseTo(30_000_000, 2)

    // total_amount versi = Σ item (30jt + 500rb item lain)
    const { rows: ver } = await client.query(
      `SELECT total_amount FROM estimate_versions WHERE id=$1`, [versionId])
    expect(Number(ver[0].total_amount)).toBeCloseTo(30_500_000, 2)
  })

  it('jejak penerapan UTUH: volume + waktu + siapa (CHECK 431 menuntut bertiga)', async () => {
    const { rows } = await client.query(
      `SELECT volume_diterapkan, diterapkan_pada, diterapkan_oleh
         FROM takeoff_dimensi WHERE estimate_item_id=$1`, [itemId])
    expect(Number(rows[0].volume_diterapkan)).toBeCloseTo(30, 4)
    expect(rows[0].diterapkan_pada).toBeTruthy()
    expect(rows[0].diterapkan_oleh).toBe(adminUserId)
  })

  it('sesudah diterapkan, banding jadi SINKRON', async () => {
    actAs(adminAuth)
    const res = await get(`/api/v1/estimate-versions/${versionId}/takeoff-dimensi`)
    const item = res.json().items.find((i: { estimate_item_id: string }) => i.estimate_item_id === itemId)
    expect(item.banding.sinkron).toBe(true)
    expect(item.quantity_rab).toBeCloseTo(30, 4)
  })

  it('revisi take-off sesudahnya membuat RAB tertinggal — dan itu KELIHATAN', async () => {
    actAs(adminAuth)
    // Keadaan sah (mungkin sengaja), tapi tak boleh disamarkan: `hasil_volume`
    // bertambah sementara `volume_diterapkan` tetap di angka lama.
    const tambah = await post(`/api/v1/estimate-versions/${versionId}/items/${itemId}/takeoff-dimensi`, {
      uraian: 'Galian pondasi P2', metode: 'volume', panjang_m: 5, lebar_m: 1, tinggi_m: 0.5, jumlah: 2,
    })
    expect(tambah.statusCode).toBe(201)
    expect(tambah.json().hasilVolume).toBeCloseTo(5, 6) // 5 × 1 × 0,5 × 2

    const res = await get(`/api/v1/estimate-versions/${versionId}/takeoff-dimensi`)
    const item = res.json().items.find((i: { estimate_item_id: string }) => i.estimate_item_id === itemId)
    expect(item.rekap.totalVolume).toBeCloseTo(35, 4)
    expect(item.quantity_rab).toBeCloseTo(30, 4)   // RAB belum menyusul
    expect(item.banding.sinkron).toBe(false)
    expect(item.banding.selisih).toBeCloseTo(5, 4)
  })

  it('item tanpa baris take-off ditolak 422', async () => {
    actAs(adminAuth)
    const res = await post(
      `/api/v1/estimate-versions/${versionId}/items/${itemLain}/takeoff-dimensi/terapkan`)
    expect(res.statusCode).toBe(422)
  })

  it('satuan bercampur ditolak 422 — m³ + m tak boleh dijumlahkan diam-diam', async () => {
    actAs(adminAuth)
    const tambah = await post(`/api/v1/estimate-versions/${versionId}/items/${itemLain}/takeoff-dimensi`, {
      uraian: 'Beton', metode: 'volume', panjang_m: 2, lebar_m: 2, tinggi_m: 2,
    })
    expect(tambah.statusCode).toBe(201)
    const campur = await post(`/api/v1/estimate-versions/${versionId}/items/${itemLain}/takeoff-dimensi`, {
      uraian: 'Pipa', metode: 'panjang', panjang_m: 10,
    })
    expect(campur.statusCode).toBe(201)

    const res = await post(
      `/api/v1/estimate-versions/${versionId}/items/${itemLain}/takeoff-dimensi/terapkan`)
    expect(res.statusCode).toBe(422)
    expect(res.json().error).toMatch(/bercampur satuan/)

    // Dan quantity item itu TIDAK bergerak sedikit pun karena percobaan tadi.
    const { rows } = await client.query(`SELECT quantity FROM estimate_items WHERE id=$1`, [itemLain])
    expect(Number(rows[0].quantity)).toBe(1)
  })
})

describe('gerbang draft — versi yang sudah diajukan tak bisa digeser volumenya', () => {
  it('POST & terapkan sama-sama 409 saat versi bukan draft', async () => {
    actAs(adminAuth)
    await client.query(`UPDATE estimate_versions SET status='under_review' WHERE id=$1`, [versionId])
    try {
      const tulis = await post(`/api/v1/estimate-versions/${versionId}/items/${itemId}/takeoff-dimensi`, {
        uraian: 'X', metode: 'panjang', panjang_m: 10,
      })
      expect(tulis.statusCode).toBe(409)

      const terap = await post(
        `/api/v1/estimate-versions/${versionId}/items/${itemId}/takeoff-dimensi/terapkan`)
      expect(terap.statusCode).toBe(409)

      // Angka yang sudah dipakai orang lain untuk memutuskan sesuatu tetap utuh.
      const { rows } = await client.query(`SELECT quantity FROM estimate_items WHERE id=$1`, [itemId])
      expect(Number(rows[0].quantity)).toBeCloseTo(30, 4)
    } finally {
      await client.query(`UPDATE estimate_versions SET status='draft' WHERE id=$1`, [versionId])
    }
  })
})
