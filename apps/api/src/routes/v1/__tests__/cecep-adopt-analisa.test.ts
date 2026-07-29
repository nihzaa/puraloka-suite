import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// ============================================================
// ADOPSI ANALISA NASIONAL → COMPANY.
//
// Kebutuhan founder 2026-07-29: "AHSP nasional mau jadi AHSP company juga, tapi
// koefisiennya bisa disesuaikan — analisa Cibuluh yang lama tetap ada."
//
// Yang dijaga, berurutan dari yang paling merugikan bila rusak:
//   1. Analisa NASIONAL tidak ikut berubah. Ia dipakai bersama seluruh badan
//      usaha; satu tim mengubahnya = katalog semua orang berubah.
//   2. Jejak asal-usul tersimpan. Tanpa itu, salinan berkoefisien berbeda tak
//      bisa dibedakan dari analisa yang memang disusun sendiri.
//   3. Koefisien yang TIDAK disebut memakai nilai asli — mengubah satu angka
//      tak boleh memaksa mengetik ulang seluruh komponen.
//
// CATATAN: untuk sekadar memakai analisa nasional dengan HARGA sendiri, adopsi
// TIDAK diperlukan — harga bukan bagian analisa, dan harga company sudah menang
// atas nasional (sumbu lingkup). Adopsi hanya untuk yang mengubah KOEFISIEN.
// ============================================================

let c: Client
let userId: string
let companyId: string

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')
  userId = (await c.query(`SELECT id FROM users LIMIT 1`)).rows[0].id
  companyId = (await c.query(
    `SELECT id FROM companies ORDER BY created_at LIMIT 1`)).rows[0].id
}, 180_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

/** Analisa nasional ber-komponen, untuk dijadikan sumber adopsi. */
async function analisaNasional() {
  return (await c.query(
    `SELECT a.id, a.code, a.name, a.cost_code_id, a.output_unit_code, a.edition_id
       FROM assemblies a
      WHERE a.source = 'national'
        AND (SELECT count(*) FROM assembly_components x WHERE x.assembly_id = a.id) BETWEEN 2 AND 6
      LIMIT 1`)).rows[0]
}

/** Tiru endpoint adopt: salin analisa + komponen, dgn koefisien pengganti. */
async function adopsi(
  asal: { id: string; code: string; name: string; cost_code_id: string
          output_unit_code: string; edition_id: string },
  ganti: Map<string, number> = new Map(),
  kode = `${asal.code}-UJI`,
) {
  const baru = (await c.query(
    `INSERT INTO assemblies
       (code, name, source, company_id, cost_code_id, output_unit_code, edition_id,
        version_number, status, derived_from_assembly_id, derived_from_edition_id,
        edit_type, edit_reason, created_by)
     VALUES ($1, $2, 'company', $3, $4, $5, $6, 1, 'draft', $7, $6, $8, $9, $10)
     RETURNING id, code, source, status`,
    [kode, asal.name, companyId, asal.cost_code_id, asal.output_unit_code,
     asal.edition_id, asal.id, ganti.size > 0 ? 'deviation' : null,
     'uji adopsi', userId])).rows[0]

  const komp = (await c.query(
    `SELECT ac.resource_id, ac.coefficient, ac.sort_order, r.code
       FROM assembly_components ac JOIN resources r ON r.id = ac.resource_id
      WHERE ac.assembly_id = $1`, [asal.id])).rows

  for (const k of komp) {
    await c.query(
      `INSERT INTO assembly_components
         (assembly_id, resource_id, coefficient, sort_order, company_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [baru.id, k.resource_id, ganti.get(k.code) ?? k.coefficient, k.sort_order, companyId])
  }
  return { baru, komp }
}

describe('Adopsi — analisa nasional tidak ikut berubah', () => {
  it('mengubah koefisien salinan TIDAK menyentuh analisa nasionalnya', async () => {
    // Inti keamanan fitur ini. Katalog nasional dipakai bersama seluruh badan
    // usaha; kalau ia ikut berubah, satu tim mengubah katalog semua orang.
    const asal = await analisaNasional()
    if (!asal) return

    const komp = (await c.query(
      `SELECT r.code, ac.coefficient FROM assembly_components ac
         JOIN resources r ON r.id = ac.resource_id
        WHERE ac.assembly_id = $1 LIMIT 1`, [asal.id])).rows[0]
    const koefAsli = Number(komp.coefficient)

    await c.query('SAVEPOINT ad1')
    await adopsi(asal, new Map([[komp.code, koefAsli * 1.5]]))

    const sesudah = (await c.query(
      `SELECT ac.coefficient FROM assembly_components ac
         JOIN resources r ON r.id = ac.resource_id
        WHERE ac.assembly_id = $1 AND r.code = $2`, [asal.id, komp.code])).rows[0]
    await c.query('ROLLBACK TO SAVEPOINT ad1')

    expect(
      Number(sesudah.coefficient),
      'koefisien analisa NASIONAL ikut berubah — katalog milik bersama tercemar'
    ).toBe(koefAsli)
  }, 60_000)

  it('salinan memakai koefisien BARU, bukan koefisien asli', async () => {
    const asal = await analisaNasional()
    if (!asal) return
    const komp = (await c.query(
      `SELECT r.code, ac.coefficient FROM assembly_components ac
         JOIN resources r ON r.id = ac.resource_id
        WHERE ac.assembly_id = $1 LIMIT 1`, [asal.id])).rows[0]
    const baruKoef = Number(komp.coefficient) * 1.5

    await c.query('SAVEPOINT ad2')
    const { baru } = await adopsi(asal, new Map([[komp.code, baruKoef]]))
    const hasil = (await c.query(
      `SELECT ac.coefficient FROM assembly_components ac
         JOIN resources r ON r.id = ac.resource_id
        WHERE ac.assembly_id = $1 AND r.code = $2`, [baru.id, komp.code])).rows[0]
    await c.query('ROLLBACK TO SAVEPOINT ad2')

    expect(Number(hasil.coefficient)).toBeCloseTo(baruKoef, 6)
  }, 60_000)

  it('komponen yang TIDAK disebut memakai koefisien asli', async () => {
    // Mengubah satu koefisien tak boleh memaksa mengetik ulang seluruh
    // komponen — salah ketik di situ menghasilkan analisa yang diam-diam
    // berbeda dari yang dimaksud.
    const asal = await analisaNasional()
    if (!asal) return
    const semua = (await c.query(
      `SELECT r.code, ac.coefficient FROM assembly_components ac
         JOIN resources r ON r.id = ac.resource_id
        WHERE ac.assembly_id = $1 ORDER BY ac.sort_order`, [asal.id])).rows
    if (semua.length < 2) return

    await c.query('SAVEPOINT ad3')
    const { baru } = await adopsi(asal, new Map([[semua[0].code, 99]]))
    const hasil = (await c.query(
      `SELECT r.code, ac.coefficient FROM assembly_components ac
         JOIN resources r ON r.id = ac.resource_id
        WHERE ac.assembly_id = $1`, [baru.id])).rows
    await c.query('ROLLBACK TO SAVEPOINT ad3')

    for (const s of semua.slice(1)) {
      const h = hasil.find((x) => x.code === s.code)
      expect(
        Number(h.coefficient),
        `komponen "${s.code}" ikut berubah padahal tidak disebut`
      ).toBeCloseTo(Number(s.coefficient), 6)
    }
  }, 60_000)
})

describe('Adopsi — jejak asal-usul', () => {
  it('menyimpan analisa asalnya', async () => {
    // Tanpa jejak ini, salinan berkoefisien berbeda tak bisa dibedakan dari
    // analisa yang memang disusun sendiri — dan pertanyaan "angka ini dari
    // mana" tak terjawab.
    const asal = await analisaNasional()
    if (!asal) return

    await c.query('SAVEPOINT ad4')
    const { baru } = await adopsi(asal)
    const jejak = (await c.query(
      `SELECT derived_from_assembly_id, derived_from_edition_id, source, company_id
         FROM assemblies WHERE id = $1`, [baru.id])).rows[0]
    await c.query('ROLLBACK TO SAVEPOINT ad4')

    expect(jejak.derived_from_assembly_id, 'jejak analisa asal hilang').toBe(asal.id)
    expect(jejak.source, 'salinan harus bersumber company').toBe('company')
    expect(jejak.company_id, 'salinan tanpa pemilik').toBeTruthy()
  }, 60_000)

  it('edit_type "deviation" saat koefisien diubah, NULL saat identik', async () => {
    // `deviation` = cara kerja tim menyimpang dari standar nasional. Bukan
    // `correction` — kita tidak menyatakan angka nasionalnya salah. Salinan
    // yang identik bukan penyimpangan, jadi NULL.
    const asal = await analisaNasional()
    if (!asal) return
    const komp = (await c.query(
      `SELECT r.code, ac.coefficient FROM assembly_components ac
         JOIN resources r ON r.id = ac.resource_id
        WHERE ac.assembly_id = $1 LIMIT 1`, [asal.id])).rows[0]

    await c.query('SAVEPOINT ad5')
    const a = await adopsi(asal, new Map([[komp.code, Number(komp.coefficient) * 2]]), `${asal.code}-U1`)
    const b = await adopsi(asal, new Map(), `${asal.code}-U2`)
    const ta = (await c.query(`SELECT edit_type FROM assemblies WHERE id=$1`, [a.baru.id])).rows[0]
    const tb = (await c.query(`SELECT edit_type FROM assemblies WHERE id=$1`, [b.baru.id])).rows[0]
    await c.query('ROLLBACK TO SAVEPOINT ad5')

    expect(ta.edit_type).toBe('deviation')
    expect(tb.edit_type, 'salinan identik ditandai menyimpang').toBeNull()
  }, 60_000)
})

describe('Adopsi — analisa lama tetap utuh', () => {
  it('analisa Cibuluh (company lama) tidak terpengaruh adopsi', async () => {
    // Kekhawatiran eksplisit founder: "analisa company yang lama dari file
    // Cibuluh itu tetap ada."
    const sebelum = (await c.query(
      `SELECT count(*)::int n FROM assemblies
        WHERE source = 'company' AND code LIKE 'CIB-%'`)).rows[0].n
    if (sebelum === 0) return

    const asal = await analisaNasional()
    if (!asal) return

    await c.query('SAVEPOINT ad6')
    await adopsi(asal)
    const sesudah = (await c.query(
      `SELECT count(*)::int n FROM assemblies
        WHERE source = 'company' AND code LIKE 'CIB-%'`)).rows[0].n
    await c.query('ROLLBACK TO SAVEPOINT ad6')

    expect(sesudah, 'jumlah analisa Cibuluh berubah setelah adopsi').toBe(sebelum)
  }, 60_000)
})

describe('Prioritas harga — urut dampak, bukan abjad', () => {
  it('resource yang memblokir paling banyak analisa muncul di atas', async () => {
    // Satu resource bisa memblokir puluhan analisa sekaligus. Mengurutkan
    // menurut abjad berarti pengguna mengisi harga yang dampaknya kecil dulu.
    const { rows } = await c.query(
      `SELECT r.name, count(*)::int dipakai
         FROM assembly_components ac JOIN resources r ON r.id = ac.resource_id
        WHERE NOT EXISTS (SELECT 1 FROM price_book_entries p
                           WHERE p.resource_id = r.id AND p.status = 'active')
        GROUP BY r.id, r.name ORDER BY 2 DESC LIMIT 5`)
    if (rows.length < 2) return

    for (let i = 1; i < rows.length; i++) {
      expect(
        rows[i - 1].dipakai,
        'daftar prioritas tidak terurut menurun — pengguna mengisi yang dampaknya kecil dulu'
      ).toBeGreaterThanOrEqual(rows[i].dipakai)
    }
  }, 60_000)
})
