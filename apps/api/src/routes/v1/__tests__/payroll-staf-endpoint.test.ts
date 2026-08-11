import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import payrollStafRoutes from '../payroll-staf.js'

/**
 * PAYROLL STAF terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perhitungannya sudah dikunci 22 test di `lib/__tests__/payroll-staf.test.ts`
 * (11 mutasi MERAH) tanpa menyentuh basis. Yang tersisa:
 *
 *   • slip MENYIMPAN hasilnya — `GET` sesudah `hitung` mengembalikan angka
 *     yang TERSIMPAN, dan tetap sama meski tarif berubah sesudahnya
 *   • periode TIDAK BISA DIKUNCI saat tarif belum ditetapkan (R-011: tarif
 *     bawaan menghasilkan slip yang tampak benar tanpa seorang pun
 *     memutuskan angkanya)
 *   • trigger immutability 287 menolak lewat jalur HTTP, bukan hanya SQL
 *   • menghitung ulang MENGGANTI slip lama, tak menumpuk
 *   • dua penguncian bersamaan hanya satu yang berhasil
 *
 * ⚠ Test ini MEMBUAT tarif uji lalu MENGHAPUSNYA di akhir. Basis harus
 * kembali ke NOL tarif — keadaan yang benar menurut R-011.
 *
 * Fixture berprefiks [TEST]/9xxx dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let companyId: string
let periodeId: string
let pegawaiId: string
/** Nilai gaji/PTKP pegawai SEBELUM test — dipulihkan di akhir. */
let gajiAsli: Array<{ id: string; gaji_pokok: string | null; status_ptkp: string | null; kategori_ter: string | null }> = []

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (method: 'POST', url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  // Kembalikan gaji pegawai seed ke nilai semula — test tak boleh
  // meninggalkan data yang tak pernah diputuskan siapa pun.
  for (const g of gajiAsli) {
    await client.query(
      `UPDATE pegawai SET gaji_pokok = $2, status_ptkp = $3, kategori_ter = $4
        WHERE id = $1`, [g.id, g.gaji_pokok, g.status_ptkp, g.kategori_ter])
  }
  gajiAsli = []
  await client.query(`DELETE FROM payroll_periode WHERE bulan LIKE '9%'`)
  await client.query(`DELETE FROM tarif_payroll_periode WHERE dasar_hukum LIKE '[TEST-PR]%'`)
  await client.query(`DELETE FROM pegawai WHERE nomor_induk LIKE '[TEST-PR]%'`)
}

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = await authIdForRole(client, 'admin')

  const { rows: p } = await client.query(
    `SELECT company_id FROM projects WHERE company_id IS NOT NULL ORDER BY created_at LIMIT 1`)
  companyId = p[0].company_id

  await purge()

  const { rows: u } = await client.query(
    `SELECT u.id FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM pegawai g WHERE g.user_id = u.id AND g.company_id = $1)
      LIMIT 1`, [companyId])

  const { rows: g } = await client.query(
    `INSERT INTO pegawai (user_id, company_id, nomor_induk, jabatan, gaji_pokok,
                          status_ptkp, kategori_ter, jam_standar)
     VALUES ($1, $2, '[TEST-PR]001', 'Staf uji payroll', 5000000, 'K/1', 'A', 8)
     RETURNING id`, [u[0].id, companyId])
  pegawaiId = g[0].id

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(payrollStafRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  // Pastikan basis kembali ke NOL tarif — keadaan yang benar menurut R-011.
  const { rows } = await client.query(`SELECT count(*)::int n FROM tarif_payroll_baris`)
  if (rows[0].n > 0) {
    console.warn(`⚠ ${rows[0].n} baris tarif tersisa sesudah test — periksa purge()`)
  }
  await app?.close()
  await client?.end()
})

describe('POST /payroll/periode', () => {
  it('bulan WAJIB berformat YYYY-MM', async () => {
    const r = await kirim('POST', '/api/v1/payroll/periode', { bulan: 'Agustus 9026' })
    expect(r.statusCode).toBe(400)
  })

  it('periode baru tersimpan dengan tanggal acuan AKHIR BULAN', async () => {
    const r = await kirim('POST', '/api/v1/payroll/periode', { bulan: '9026-02' })
    expect(r.statusCode).toBe(201)
    // Februari 9026 — tabel panjang-bulan yang ditulis tangan adalah sumber
    // galat kabisat klasik. `Date.UTC(y, m, 0)` menghindarinya.
    expect(r.json().periode.tanggal_acuan).toBe('9026-02-28')
    periodeId = r.json().periode.id
  })

  it('periode GANDA ditolak dengan pesan yang bisa dibaca', async () => {
    const r = await kirim('POST', '/api/v1/payroll/periode', { bulan: '9026-02' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error).not.toMatch(/duplicate key/)
    expect(r.json().error).toMatch(/sudah ada/i)
  })
})

describe('POST /hitung — tarif belum ditetapkan', () => {
  it('menghitung TETAP jalan, tapi melaporkan penghalang', async () => {
    const r = await kirim('POST', `/api/v1/payroll/periode/${periodeId}/hitung`)
    expect(r.statusCode).toBe(200)
    const j = r.json()
    expect(j.dihitung).toBeGreaterThan(0)
    // Slip dibuat supaya yang sudah bisa dihitung terlihat — TAPI periodenya
    // tak boleh dikunci.
    expect(j.boleh_dikunci).toBe(false)
    expect(j.bermasalah.length).toBeGreaterThan(0)
  })

  it('slip TIDAK memuat potongan yang lahir dari tarif bawaan', async () => {
    const { rows } = await client.query(
      `SELECT s.total_potongan, s.pph21, s.tarif_bpjs_id, s.tarif_ter_id
         FROM slip_gaji s WHERE s.periode_id = $1 AND s.pegawai_id = $2`,
      [periodeId, pegawaiId])
    expect(rows).toHaveLength(1)
    // Nol potongan karena tarifnya BELUM ADA — bukan karena kebetulan nol.
    expect(Number(rows[0].total_potongan)).toBe(0)
    expect(Number(rows[0].pph21)).toBe(0)
    expect(rows[0].tarif_bpjs_id).toBeNull()
    expect(rows[0].tarif_ter_id).toBeNull()
  })

  it('MENOLAK dikunci saat periode tarif ADA tapi barisnya KOSONG', async () => {
    // ── Cacat yang ditemukan DARI LAYAR 2026-08-11 ────────────────────────
    //
    // Periode tarif dibuat, tapi BARIS-nya gagal tersimpan. Akibatnya
    // `tarif_*_id` TERISI (periodenya memang ada), pemeriksaan
    // `slip-tanpa-tarif` lolos, dan periode DIKUNCI dengan potongan Rp 0
    // untuk semua orang — slip yang tampak sah dengan angka yang salah.
    //
    // `kesiapanTarif` di G2a sudah memperingatkan kelas cacat ini, tetapi
    // endpoint kunci tak memakainya. Yang menutupnya: pemeriksaan berdasarkan
    // HASIL (nol potongan pada slip bergaji), bukan berdasarkan keberadaan
    // periode tarif.
    const { rows: pr } = await client.query(
      `INSERT INTO payroll_periode (company_id, bulan, tanggal_acuan, status)
       VALUES ($1, '9026-09', '9026-09-30', 'dihitung') RETURNING id`, [companyId])
    // Periode tarif KOSONG — persis keadaan yang lolos sebelumnya.
    const { rows: tk } = await client.query(
      `INSERT INTO tarif_payroll_periode (company_id, jenis, berlaku_sejak, dasar_hukum)
       VALUES ($1, 'bpjs', '2019-01-01', '[TEST-PR] periode kosong') RETURNING id`,
      [companyId])
    await client.query(
      `INSERT INTO slip_gaji (periode_id, pegawai_id, gaji_pokok, total_penghasilan,
                              total_potongan, gaji_bersih, tarif_bpjs_id, tarif_ter_id)
       VALUES ($1, $2, 5000000, 5000000, 0, 5000000, $3, $3)`,
      [pr[0].id, pegawaiId, tk[0].id])

    const r = await kirim('POST', `/api/v1/payroll/periode/${pr[0].id}/kunci`)
    expect(r.statusCode).toBe(422)
    expect(r.json().penghalang.map((p: { kode: string }) => p.kode))
      .toContain('slip-nol-potongan')

    const { rows } = await client.query(
      `SELECT status FROM payroll_periode WHERE id = $1`, [pr[0].id])
    expect(rows[0].status).toBe('dihitung')
  })

  it('MENOLAK dikunci selama slip tanpa jejak tarif', async () => {
    const r = await kirim('POST', `/api/v1/payroll/periode/${periodeId}/kunci`)
    expect(r.statusCode).toBe(422)
    expect(r.json().penghalang.map((p: { kode: string }) => p.kode))
      .toContain('slip-tanpa-tarif')

    const { rows } = await client.query(
      `SELECT status FROM payroll_periode WHERE id = $1`, [periodeId])
    expect(rows[0].status).toBe('dihitung')
  })
})

describe('POST /hitung — sesudah tarif ditetapkan', () => {
  beforeAll(async () => {
    // Tarif UJI — angkanya sengaja tak menyerupai tarif Indonesia mana pun.
    const mk = async (jenis: string) => {
      const { rows } = await client.query(
        `INSERT INTO tarif_payroll_periode (company_id, jenis, berlaku_sejak, dasar_hukum)
         VALUES ($1, $2::jenis_tarif_payroll, '2020-01-01', '[TEST-PR] bukan aturan nyata')
         RETURNING id`, [companyId, jenis])
      return rows[0].id
    }
    const ptkp = await mk('ptkp')
    const ter = await mk('ter_pph21')
    const bpjs = await mk('bpjs')
    await client.query(
      `INSERT INTO tarif_payroll_baris (periode_id, kunci, nilai_nominal)
       VALUES ($1, 'K/1', 15000000)`, [ptkp])
    // Kategori A DAN B. Percobaan pertama hanya memasang A, dan modul
    // melaporkan `lapisan-ter-tak-cocok` untuk pegawai berkategori B —
    // penghalang yang BENAR (tabel tarifnya memang belum lengkap), bukan
    // diam-diam memakai 0%. Yang kurang fixture-nya.
    await client.query(
      `INSERT INTO tarif_payroll_baris (periode_id, kunci, batas_bawah, batas_atas, nilai_persen)
       VALUES ($1, 'A', 0, NULL, 1), ($1, 'B', 0, NULL, 2), ($1, 'C', 0, NULL, 3)`, [ter])
    await client.query(
      `INSERT INTO tarif_payroll_baris (periode_id, kunci, label, persen_perusahaan, persen_karyawan)
       VALUES ($1, 'jht', 'Hari Tua', 10, 5)`, [bpjs])

    // ⚠ Perhitungan menyertakan SELURUH pegawai aktif tenant ini, bukan hanya
    // fixture test. Basis bersama punya pegawai dummy dari seed yang gaji
    // pokoknya belum diisi — dan satu slip bermasalah membuat SELURUH periode
    // tak boleh dikunci (invarian yang memang diuji di lib).
    //
    // Test versi pertama gagal karena mengira hanya ada satu pegawai. Yang
    // diuji di sini bukan "berapa pegawai", jadi kekurangannya dilengkapi —
    // bukan invariannya yang dilonggarkan.
    //
    // Nilai dikembalikan di `pulihkanGaji()` supaya seed tetap seperti semula.
    const { rows: sebelum } = await client.query(
      `SELECT id, gaji_pokok, status_ptkp, kategori_ter FROM pegawai
        WHERE company_id = $1 AND tanggal_keluar IS NULL`, [companyId])
    gajiAsli = sebelum
    await client.query(
      `UPDATE pegawai SET gaji_pokok = COALESCE(gaji_pokok, 4000000),
                          status_ptkp = COALESCE(status_ptkp, 'K/1'),
                          kategori_ter = COALESCE(kategori_ter, 'A')
        WHERE company_id = $1 AND tanggal_keluar IS NULL`, [companyId])
  })

  it('menghitung ulang MENGGANTI slip lama, tak menumpuk', async () => {
    const r = await kirim('POST', `/api/v1/payroll/periode/${periodeId}/hitung`)
    expect(r.statusCode).toBe(200)
    if (!r.json().boleh_dikunci) {
      // Menampilkan penghalangnya, bukan cuma "expected false to be true" —
      // kegagalan yang tak menyebutkan sebabnya menghabiskan waktu.
      console.log('PENGHALANG TERSISA:', JSON.stringify(r.json().bermasalah).slice(0, 500))
    }
    expect(r.json().boleh_dikunci).toBe(true)

    const { rows } = await client.query(
      `SELECT count(*)::int n FROM slip_gaji WHERE periode_id = $1 AND pegawai_id = $2`,
      [periodeId, pegawaiId])
    // Dua slip untuk orang yang sama di bulan yang sama = dibayar dua kali.
    expect(rows[0].n).toBe(1)
  })

  it('slip MENYIMPAN angkanya beserta jejak tarif', async () => {
    const { rows } = await client.query(
      `SELECT total_potongan, pph21, tarif_bpjs_id, tarif_ter_id, tarif_ter_persen
         FROM slip_gaji WHERE periode_id = $1 AND pegawai_id = $2`,
      [periodeId, pegawaiId])
    // 5% dari 5.000.000 = 250.000 (JHT karyawan) + 1% pajak = 50.000
    expect(Number(rows[0].total_potongan)).toBe(300000)
    expect(Number(rows[0].pph21)).toBe(50000)
    // ID periode tarifnya disimpan, bukan cuma angkanya.
    expect(rows[0].tarif_bpjs_id).not.toBeNull()
    expect(rows[0].tarif_ter_id).not.toBeNull()
  })

  it('BPJS bagian perusahaan tersimpan sebagai `informasi`', async () => {
    const { rows } = await client.query(
      `SELECT k.jenis, k.nominal FROM slip_komponen k
         JOIN slip_gaji s ON s.id = k.slip_id
        WHERE s.periode_id = $1 AND s.pegawai_id = $2
          AND k.kode = 'bpjs_jht_perusahaan'`, [periodeId, pegawaiId])
    expect(rows).toHaveLength(1)
    // 10% dari 5jt = 500.000 — dua kali lipat bagian karyawan. Menjadikannya
    // potongan memotong gaji untuk sesuatu yang bukan tanggungan pegawai.
    expect(rows[0].jenis).toBe('informasi')
    expect(Number(rows[0].nominal)).toBe(500000)
  })

  it('komponen membawa dasar hitungnya', async () => {
    const { rows } = await client.query(
      `SELECT k.dasar_hitung FROM slip_komponen k
         JOIN slip_gaji s ON s.id = k.slip_id
        WHERE s.periode_id = $1 AND s.pegawai_id = $2 AND k.kode = 'pph21'`,
      [periodeId, pegawaiId])
    // Pegawai yang bertanya "kenapa segini" harus bisa dijawab dari slip,
    // bukan dengan membuka kode.
    expect(rows[0].dasar_hitung).toMatch(/TER A/)
  })
})

describe('POST /kunci', () => {
  it('mengunci periode yang bersih', async () => {
    const r = await kirim('POST', `/api/v1/payroll/periode/${periodeId}/kunci`)
    expect(r.statusCode).toBe(200)
    expect(r.json().periode.status).toBe('dikunci')
  })

  it('TRIGGER 287 menolak menghitung ulang periode terkunci', async () => {
    const r = await kirim('POST', `/api/v1/payroll/periode/${periodeId}/hitung`)
    expect(r.statusCode).toBe(409)
    expect(r.json().error).toMatch(/dikunci/i)
  })

  it('TRIGGER 287 menolak mengubah slip terkunci lewat SQL langsung', async () => {
    // Jalur yang tak lewat endpoint mana pun — dijaga di BASIS, bukan di
    // aplikasi. Aplikasi bisa dilewati; basis tidak.
    await expect(client.query(
      `UPDATE slip_gaji SET gaji_bersih = 999999999 WHERE periode_id = $1`, [periodeId]))
      .rejects.toThrow(/dikunci/i)
  })

  it('slip yang tersimpan TETAP SAMA meski tarif berubah sesudahnya', async () => {
    // ── Invarian paling penting di modul ini ──────────────────────────────
    //
    // Slip yang sudah dibayarkan adalah pernyataan tentang uang yang SUDAH
    // berpindah. Kalau ia dihitung ulang dengan tarif baru, angka di layar
    // tak lagi cocok dengan angka di rekening — dan penerimanya tak punya
    // cara membuktikan mana yang benar.
    const sebelum = (await client.query(
      `SELECT total_potongan, pph21 FROM slip_gaji
        WHERE periode_id = $1 AND pegawai_id = $2`, [periodeId, pegawaiId])).rows[0]

    // Ubah tarif secara drastis.
    await client.query(
      `UPDATE tarif_payroll_baris SET persen_karyawan = 50
        WHERE periode_id IN (SELECT id FROM tarif_payroll_periode
                              WHERE dasar_hukum LIKE '[TEST-PR]%' AND jenis = 'bpjs')`)

    const j = (await get(`/api/v1/payroll/periode/${periodeId}`)).json()
    const slip = j.slip.find((x: { pegawai_id: string }) => x.pegawai_id === pegawaiId)
    // GET membaca yang TERSIMPAN, bukan menghitung ulang.
    expect(Number(slip.total_potongan)).toBe(Number(sebelum.total_potongan))
    expect(Number(slip.pph21)).toBe(Number(sebelum.pph21))
  })

  it('penguncian KEDUA ditolak', async () => {
    const r = await kirim('POST', `/api/v1/payroll/periode/${periodeId}/kunci`)
    expect(r.statusCode).toBe(409)
  })

  it('dua penguncian BERSAMAAN: tepat satu berhasil', async () => {
    const { rows: p } = await client.query(
      `INSERT INTO payroll_periode (company_id, bulan, tanggal_acuan, status)
       VALUES ($1, '9026-03', '9026-03-31', 'dihitung') RETURNING id`, [companyId])
    const { rows: t } = await client.query(
      `SELECT id FROM tarif_payroll_periode WHERE dasar_hukum LIKE '[TEST-PR]%' LIMIT 1`)
    // `total_potongan` WAJIB terisi: penjaga `slip-nol-potongan` menolak slip
    // bergaji yang nol potongan — dan itu penjaga yang BENAR (lihat test
    // "periode tarif ADA tapi barisnya KOSONG"). Fixture yang tak mengisinya
    // menguji penolakan, bukan perlombaan.
    await client.query(
      `INSERT INTO slip_gaji (periode_id, pegawai_id, gaji_pokok, total_penghasilan,
                              total_potongan, gaji_bersih, tarif_bpjs_id, tarif_ter_id)
       VALUES ($1, $2, 5000000, 5000000, 300000, 4700000, $3, $3)`,
      [p[0].id, pegawaiId, t[0].id])

    const url = `/api/v1/payroll/periode/${p[0].id}/kunci`
    const [a, b] = await Promise.all([kirim('POST', url), kirim('POST', url)])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
  })

  it('periode KOSONG tak bisa dikunci', async () => {
    const { rows } = await client.query(
      `INSERT INTO payroll_periode (company_id, bulan, tanggal_acuan)
       VALUES ($1, '9026-04', '9026-04-30') RETURNING id`, [companyId])
    const r = await kirim('POST', `/api/v1/payroll/periode/${rows[0].id}/kunci`)
    // Mengunci nol slip = menyatakan penggajian selesai tanpa seorang pun
    // dibayar.
    expect(r.statusCode).toBe(422)
    expect(r.json().error).toMatch(/hitung dulu/i)
  })
})
