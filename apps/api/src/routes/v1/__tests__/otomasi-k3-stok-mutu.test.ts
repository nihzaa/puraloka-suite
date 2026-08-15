/**
 * Insiden K3 (3.15) · stok minimum (4.5) · audit mutu (3.14).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * TIGA KEPUTUSAN YANG DIJAGA DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. Tenggang insiden BERSKALA menurut beratnya. Satu ambang untuk semua
 *      jenis memaksa memilih antara membiarkan kecelakaan berat menganggur
 *      berminggu-minggu, atau membuat tiap nyaris-celaka berbunyi tiap hari
 *      sampai orang mematikan notifikasinya — dan yang mati ikut membungkam
 *      yang berat.
 *
 *   2. Stok dijumlahkan dari DUA tempat. Membaca stok proyek saja membuat
 *      material yang menumpuk di gudang terlihat habis, lalu dipesan lagi.
 *
 *   3. Yang TAK BISA DINILAI dilaporkan. Dari 24 material aktif hanya satu
 *      yang punya batas minimum; otomasi yang cuma membaca batas melaporkan
 *      23 sisanya aman selamanya — bukan karena cukup, melainkan karena tak
 *      ada yang pernah menuliskan berapa yang disebut cukup.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import otomasiTerjadwalRoutes from '../otomasi-terjadwal.js'

const TANDA = 'UJI-KSM'

let app: FastifyInstance
let db: Client
let companyId: string
let proyek: string
let gudangId: string
let auditorId: string

const panggil = (rute: string, q = '') =>
  app.inject({
    method: 'GET',
    url: `/api/v1/otomasi/jalankan/${rute}${q}`,
    headers: { authorization: 'Bearer t' },
  })

function tanggal(selisih: number): string {
  const d = new Date()
  d.setDate(d.getDate() + selisih)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`
    + `${String(d.getDate()).padStart(2, '0')}`
}

async function bersihkan() {
  await db.query(`DELETE FROM insiden_k3 WHERE kronologi LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM audit_mutu WHERE nomor LIKE $1`, [`${TANDA}%`])
  await db.query(`DELETE FROM project_stocks WHERE material_id IN
                    (SELECT id FROM materials WHERE name LIKE $1)`, [`${TANDA}%`])
  await db.query(`DELETE FROM gudang_stok WHERE material_id IN
                    (SELECT id FROM materials WHERE name LIKE $1)`, [`${TANDA}%`])
  await db.query(`DELETE FROM materials WHERE name LIKE $1`, [`${TANDA}%`])
  await db.query(
    `DELETE FROM notifications
      WHERE company_id = $1
        AND type IN ('insiden_k3_menggantung', 'insiden_k3_tanpa_tindakan',
                     'stok_di_bawah_minimum', 'material_tanpa_batas_minimum',
                     'audit_mutu_lewat_jadwal', 'rencana_mutu_belum_disetujui')`,
    [companyId])
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  const { rows: c } = await db.query(
    `SELECT id FROM companies WHERE code = 'puraloka-persada'`)
  companyId = c[0].id

  const { rows: p } = await db.query(
    `SELECT id FROM projects WHERE company_id = $1 LIMIT 1`, [companyId])
  proyek = p[0].id

  const { rows: g } = await db.query(
    `SELECT id FROM gudang WHERE company_id = $1 LIMIT 1`, [companyId])
  if (!g[0]) throw new Error('tak ada gudang untuk diuji')
  gudangId = g[0].id

  // `audit_mutu.auditor` adalah uuid pengguna, bukan nama bebas.
  const { rows: au } = await db.query(
    `SELECT id FROM users WHERE is_active LIMIT 1`)
  auditorId = au[0].id

  app = Fastify()
  await app.register(otomasiTerjadwalRoutes)
  await app.ready()

  await bersihkan()
}, 60_000)

afterAll(async () => {
  await bersihkan()
  await app.close()
  await db.end()
})

/*
  `insiden_ditutup_berkorektif` menuntut insiden berstatus `ditutup` punya
  stempel penutupan DAN tindakan korektif sepanjang minimal 10 karakter.

  Itu invarian yang bagus dan sengaja dipatuhi apa adanya di sini: insiden
  yang ditutup dengan tindakan korektif "ok" adalah insiden yang tak pernah
  benar-benar ditangani, dan basisnya menolaknya di tingkat schema.
*/
async function buatInsiden(jenis: string, umurHari: number, opsi: {
  status?: string; tindakan?: string | null
} = {}) {
  const ditutup = (opsi.status ?? 'dilaporkan') === 'ditutup'
  const { rows } = await db.query(
    `INSERT INTO insiden_k3 (project_id, nomor, jenis, tanggal, kronologi,
                             status, tindakan_korektif, ditutup_pada)
     VALUES ($1,$2,$3::jenis_insiden,$4,$5,$6::status_insiden,$7,$8) RETURNING id`,
    [proyek, `${TANDA}-${jenis}-${umurHari}`, jenis, tanggal(-umurHari),
     `${TANDA} kronologi uji`, opsi.status ?? 'dilaporkan',
     opsi.tindakan ?? null, ditutup ? new Date().toISOString() : null])
  return rows[0].id as string
}

async function ditegur(tipe: string, id: string) {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM notifications
      WHERE type = $1 AND company_id = $2 AND action_data->>'record_id' = $3`,
    [tipe, companyId, id])
  return (rows[0].n as number) > 0
}

describe('3.15 — insiden K3 belum ditutup', () => {
  it('tenggangnya BERSKALA menurut berat insiden', async () => {
    /*
      Dua insiden berumur SAMA PERSIS (10 hari), hanya jenisnya berbeda.

      Dengan ambang dasar 7: kecelakaan berat ×0,2 = 1,4 → dibulatkan 1, jadi
      berbunyi. Nyaris celaka ×2 = 14, jadi belum.

      Kalau ambangnya tunggal, keduanya berperilaku sama — dan salah satu dari
      dua perilaku itu pasti keliru.
    */
    await bersihkan()
    const berat = await buatInsiden('kecelakaan_berat', 10, { tindakan: 'sudah dipasang pagar' })
    const nyaris = await buatInsiden('nyaris_celaka', 10)

    const r = await panggil('insiden-k3-belum-ditutup')
    expect(r.statusCode, r.body).toBe(200)

    expect(await ditegur('insiden_k3_menggantung', berat),
      'kecelakaan berat 10 hari TIDAK ditegur pada ambang dasar 7')
      .toBe(true)
    expect(await ditegur('insiden_k3_menggantung', nyaris),
      'nyaris-celaka 10 hari ikut ditegur — tenggangnya tak berskala, jadi '
      + 'tiap nyaris-celaka akan berbunyi dan yang berat ikut terabaikan')
      .toBe(false)
  }, 120_000)

  it('insiden berat TANPA tindakan korektif adalah temuan tersendiri', async () => {
    /*
      Terukur di basis dev: INS-04, kecelakaan berat, 18 hari `diselidiki`,
      `tindakan_korektif` NULL.

      Bedanya dari "belum ditutup" bukan tingkat kegentingan melainkan
      TINDAKAN: yang satu menutup berkas, yang satu mencegah kejadian kedua.
      Selama tindakan korektifnya kosong, penyebabnya masih di lokasi.
    */
    await bersihkan()
    const tanpa = await buatInsiden('kecelakaan_berat', 20, { status: 'diselidiki' })
    const dengan = await buatInsiden('kecelakaan_ringan', 20, {
      status: 'tindakan_berjalan', tindakan: 'perancah diperbaiki',
    })

    await panggil('insiden-k3-belum-ditutup')

    expect(await ditegur('insiden_k3_tanpa_tindakan', tanpa),
      'insiden berat tanpa tindakan korektif tak dapat teguran tersendiri')
      .toBe(true)
    expect(await ditegur('insiden_k3_tanpa_tindakan', dengan),
      'insiden yang SUDAH punya tindakan korektif ikut ditegur')
      .toBe(false)

    // Yang sama juga menggantung — dua orang berbeda mungkin menanganinya.
    expect(await ditegur('insiden_k3_menggantung', tanpa),
      'insiden berat tanpa tindakan hilang dari daftar menggantung — '
      + 'dua temuan itu tak boleh saling menggugurkan')
      .toBe(true)
  }, 120_000)

  it('insiden yang SUDAH ditutup tidak ditegur', async () => {
    await bersihkan()
    const tutup = await buatInsiden('kecelakaan_berat', 100, {
      status: 'ditutup',
      tindakan: 'Perancah diganti dan area dipagari, diperiksa ulang oleh K3.',
    })

    await panggil('insiden-k3-belum-ditutup')
    expect(await ditegur('insiden_k3_menggantung', tutup),
      'insiden yang sudah ditutup ikut ditegur — daftarnya tak akan pernah kosong')
      .toBe(false)
  }, 120_000)
})

describe('4.5 — stok di bawah minimum', () => {
  it('stok dijumlahkan dari proyek DAN gudang', async () => {
    /*
      Material dengan batas 100: 40 di proyek, 70 di gudang → total 110, AMAN.

      Kalau hanya stok proyek yang dibaca, ia terlihat 40 dari 100 dan dipesan
      lagi — padahal 70 sak sudah menumpuk di gudang. Kesalahan ini memindahkan
      uang sungguhan, bukan sekadar salah tampil.
    */
    await bersihkan()
    const { rows } = await db.query(
      `INSERT INTO materials (name, unit, min_stock, is_active)
       VALUES ($1,'sak',100,true) RETURNING id`, [`${TANDA} semen`])
    const mid = rows[0].id

    await db.query(
      `INSERT INTO project_stocks (project_id, material_id, qty_on_hand)
       VALUES ($1,$2,40)`, [proyek, mid])
    await db.query(
      `INSERT INTO gudang_stok (gudang_id, material_id, qty)
       VALUES ($1,$2,70)`, [gudangId, mid])

    const r = await panggil('stok-di-bawah-minimum')
    expect(r.statusCode, r.body).toBe(200)
    expect(await ditegur('stok_di_bawah_minimum', mid),
      'material dengan 40 di proyek + 70 di gudang (total 110 dari batas 100) '
      + 'ditegur — stok gudang tak ikut dijumlahkan, jadi barang yang sudah ada '
      + 'akan dipesan lagi')
      .toBe(false)

    // Dan ia MEMANG ditegur begitu totalnya benar-benar kurang.
    await db.query(`UPDATE gudang_stok SET qty = 10 WHERE material_id = $1`, [mid])
    await db.query(
      `DELETE FROM notifications WHERE type = 'stok_di_bawah_minimum'
        AND company_id = $1`, [companyId])
    await panggil('stok-di-bawah-minimum')
    expect(await ditegur('stok_di_bawah_minimum', mid),
      'total 50 dari batas 100 TIDAK ditegur')
      .toBe(true)
  }, 120_000)

  it('material tanpa batas minimum DILAPORKAN, bukan didiamkan', async () => {
    /*
      Diam pada kasus ini terlihat persis seperti keberhasilan: material yang
      tak punya batas akan selamanya "tidak menipis".
    */
    await bersihkan()
    const dasar = await panggil('stok-di-bawah-minimum')
    const awal = (dasar.json() as { checked: { tanpa_batas_minimum: number } })
      .checked.tanpa_batas_minimum

    await db.query(
      `INSERT INTO materials (name, unit, min_stock, is_active)
       VALUES ($1,'btg',0,true)`, [`${TANDA} besi tanpa batas`])

    const r = await panggil('stok-di-bawah-minimum')
    const c = (r.json() as {
      checked: { tanpa_batas_minimum: number; material_aktif: number }
    }).checked

    expect(c.tanpa_batas_minimum,
      'material tanpa batas minimum tak terhitung — angka ini yang menahan '
      + '"1 menipis" dibaca sebagai "sisanya aman"')
      .toBe(awal + 1)
    expect(c.material_aktif, 'jumlah material aktif nol').toBeGreaterThan(0)

    /*
      Dan seseorang HARUS diberitahu.

      Mutasi membuktikan kenapa dua pemeriksaan ini tak sama: mematikan blok
      notifikasinya membiarkan angka di `checked` tetap benar, dan test yang
      hanya membaca angka itu lulus. Ringkasan yang dihitung tetapi tak pernah
      dikirim tak menolong siapa pun — ia cuma membuat lognya terlihat sehat.
    */
    const { rows: n } = await db.query(
      `SELECT message FROM notifications
        WHERE type = 'material_tanpa_batas_minimum' AND company_id = $1`,
      [companyId])
    expect(n.length,
      'nol notifikasi padahal ada material tanpa batas — angkanya dihitung '
      + 'tetapi tak seorang pun diberitahu')
      .toBeGreaterThan(0)
    expect(String(n[0].message), 'pesan tak menyebut jumlahnya')
      .toMatch(new RegExp(String(c.tanpa_batas_minimum)))
  }, 120_000)
})

describe('3.14 — audit mutu lewat jadwal', () => {
  it('audit SELESAI dilewati, yang berjalan dan yang belum mulai dibedakan', async () => {
    /*
      Tindakannya berbeda: audit yang belum dimulai butuh orang menetapkan
      tanggal; audit yang berjalan terlalu lama butuh orang menyelesaikan
      temuannya. Pesan yang menyamakan keduanya membuat penerimanya menebak.
    */
    await bersihkan()
    /*
      `audit_mutu_selesai_berjejak` menuntut audit berstatus `selesai` punya
      tanggal selesai DAN nama auditornya. Audit yang mengaku selesai tanpa
      bisa menyebut siapa yang menutupnya bukan audit.
    */
    const buat = async (nomor: string, status: string, lewat: number) => {
      const selesai = status === 'selesai'
      const { rows } = await db.query(
        `INSERT INTO audit_mutu (project_id, nomor, judul, status, tanggal_rencana,
                                 tanggal_selesai, auditor)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [proyek, nomor, `${TANDA} audit`, status, tanggal(-lewat),
         selesai ? tanggal(-1) : null, selesai ? auditorId : null])
      return rows[0].id as string
    }

    const selesai = await buat(`${TANDA}-SELESAI`, 'selesai', 30)
    const berjalan = await buat(`${TANDA}-JALAN`, 'berjalan', 30)
    const belum = await buat(`${TANDA}-BELUM`, 'rencana', 30)

    const r = await panggil('audit-mutu-lewat-jadwal')
    expect(r.statusCode, r.body).toBe(200)

    expect(await ditegur('audit_mutu_lewat_jadwal', selesai),
      'audit yang sudah SELESAI ikut ditegur')
      .toBe(false)
    expect(await ditegur('audit_mutu_lewat_jadwal', berjalan),
      'audit berjalan yang lewat 30 hari tak ditegur')
      .toBe(true)

    const { rows: pesan } = await db.query(
      `SELECT action_data->>'record_id' rid, message FROM notifications
        WHERE type = 'audit_mutu_lewat_jadwal' AND company_id = $1
          AND action_data->>'record_id' IN ($2, $3)`,
      [companyId, berjalan, belum])

    const teksBerjalan = pesan.find((x) => x.rid === berjalan)?.message ?? ''
    const teksBelum = pesan.find((x) => x.rid === belum)?.message ?? ''

    expect(String(teksBerjalan),
      'pesan untuk audit BERJALAN tak menyatakan bahwa auditnya sudah dimulai')
      .toMatch(/sudah dimulai/)
    expect(String(teksBelum),
      'pesan untuk audit yang BELUM dimulai berbunyi sama dengan yang berjalan')
      .toMatch(/belum dimulai/)
  }, 120_000)

  it('ambang hari benar-benar menyaring', async () => {
    await bersihkan()
    await db.query(
      `INSERT INTO audit_mutu (project_id, nomor, judul, status, tanggal_rencana)
       VALUES ($1,$2,$3,'berjalan',$4)`,
      [proyek, `${TANDA}-TIPIS`, `${TANDA} audit`, tanggal(-2)])

    const hitung = async (q: string) => {
      const r = await panggil('audit-mutu-lewat-jadwal', q)
      return (r.json() as { checked: { lewat_jadwal: number } }).checked.lewat_jadwal
    }

    const bawaan = await hitung('')
    const longgar = await hitung('?hari=30')
    expect(longgar,
      'menaikkan ambang tak mengurangi yang lewat jadwal — nilainya tak dipakai')
      .toBeLessThan(bawaan)
  }, 120_000)
})
