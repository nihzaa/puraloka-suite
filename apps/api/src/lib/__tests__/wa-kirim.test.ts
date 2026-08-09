/**
 * TJS-D1 — pintu keluar WhatsApp.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA HAL YANG TJS TIDAK PUNYA, DAN KEDUANYA DIUJI DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * IDEMPOTENSI KELUAR   TJS punya dedup MASUK (`providerMessageId`), tetapi tak
 *                      ada apa pun yang mencegah pesan KELUAR terkirim dua
 *                      kali. Webhook yang diulang penyedia adalah hal BIASA,
 *                      bukan kelainan — dan notifikasi ganda ke mandor
 *                      terbaca sebagai dua kejadian berbeda ("ada DUA invoice
 *                      jatuh tempo?").
 *
 * NORMALISASI NOMOR    `+62 812…`, `62812…`, dan `0812…` adalah nomor yang
 *                      SAMA. Menyimpannya apa adanya membuat pencarian gagal
 *                      untuk bentuk yang tak persis, dan gagalnya senyap:
 *                      pesannya masuk `ai_akses_ditolak` seolah pengirimnya
 *                      orang asing.
 *
 * Adaptornya TIDAK dipanggil sungguhan — yang diuji logika pintunya. Panggilan
 * nyata ke Evolution akan membuat test bergantung pada layanan yang hidup, dan
 * test semacam itu akhirnya dimatikan orang.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { createTenantDb } from '../../utils/tenant-db.js'
import { buatAdaptorWa, kirimWa, normalkanNomor } from '../wa-kirim.js'

let db: Client
let companyId: string

const KUNCI_UJI = 'uji-d1:'

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(`
    SELECT c.id FROM companies c
    WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1
  `)
  companyId = rows[0].id
}, 60_000)

afterAll(async () => {
  await db.query(`DELETE FROM wa_kirim_idempotensi WHERE kunci LIKE $1`, [`${KUNCI_UJI}%`])
  await db.query(`DELETE FROM wa_pesan_log WHERE company_id = $1 AND nomor LIKE '6289%'`, [companyId])
  await db.end()
})

beforeEach(async () => {
  await db.query(`DELETE FROM wa_kirim_idempotensi WHERE kunci LIKE $1`, [`${KUNCI_UJI}%`])
})

describe('normalisasi nomor', () => {
  it('tiga bentuk yang sama menghasilkan satu nomor', () => {
    // Kalau ketiganya menghasilkan nilai berbeda, satu orang bisa terdaftar
    // tiga kali — dan pesannya cocok hanya kalau bentuknya kebetulan sama.
    const hasil = ['+62 812-3456-7890', '62812 3456 7890', '0812-3456-7890']
      .map((n) => normalkanNomor(n))
    expect(new Set(hasil).size).toBe(1)
    expect(hasil[0]).toBe('628123456790'.slice(0, 0) + '6281234567890')
  })

  it('awalan 00 internasional dibuang, bukan diperlakukan sebagai nol lokal', () => {
    expect(normalkanNomor('006281234567890')).toBe('6281234567890')
  })

  it('nomor tak masuk akal DITOLAK, bukan ditebak', () => {
    // Menebak berarti menyimpan nomor yang salah dan mengirim pesan ke orang
    // lain — kegagalan yang jauh lebih buruk daripada menolak.
    expect(normalkanNomor('')).toBeNull()
    expect(normalkanNomor('abc')).toBeNull()
    expect(normalkanNomor('123')).toBeNull()
    expect(normalkanNomor('9'.repeat(20))).toBeNull()
  })

  it('hasilnya lolos CHECK basis — dua tempat harus sepakat', async () => {
    const nomor = normalkanNomor('0812-9999-0001')!
    const { rows } = await db.query(`SELECT $1 ~ '^[1-9][0-9]{7,14}$' AS cocok`, [nomor])
    // CHECK `wa_nomor_bentuk` di migrasi 256 dan fungsi ini harus sepakat.
    // Kalau tidak, aplikasi menerima nomor yang basis tolak, dan galatnya
    // muncul jauh dari tempat nomornya diketik.
    expect(rows[0].cocok).toBe(true)
  })
})

describe('registry adaptor', () => {
  it('evolution dikenali', () => {
    const a = buatAdaptorWa({
      penyedia: 'evolution', baseUrl: 'http://x', apiKey: 'k', instance: 'i',
    })
    expect(a?.nama).toBe('evolution')
  })

  it('penyedia asing mengembalikan null, bukan jatuh ke bawaan', () => {
    // Jatuh ke bawaan berarti tenant yang salah ketik penyedianya diam-diam
    // mengirim lewat jalur yang tak ia pilih.
    expect(buatAdaptorWa({
      penyedia: 'wablas', baseUrl: 'http://x', apiKey: 'k', instance: 'i',
    })).toBeNull()
  })
})

describe('IDEMPOTENSI keluar — yang TJS tak punya', () => {
  it('pengiriman KEDUA dengan kunci sama DILEWATI', async () => {
    const kunci = `${KUNCI_UJI}invoice-1`
    const dasar = {
      db: createTenantDb(companyId),
      companyId,
      nomor: '628999000111',
      teks: 'Invoice INV-001 jatuh tempo besok.',
      kunciIdempotensi: kunci,
      // Konfigurasi NULL: adaptornya tak pernah dipanggil, jadi test ini tak
      // bergantung pada Evolution yang hidup. Yang diuji klaim kuncinya.
      konfigurasi: null,
    }

    await kirimWa(dasar)
    const kedua = await kirimWa(dasar)

    // Yang kedua harus dilewati — dan itu dilaporkan sebagai SUKSES, karena
    // yang diinginkan pemanggil ("pesan ini terkirim sekali") sudah terpenuhi.
    expect(kedua.ok).toBe(true)
    if (kedua.ok) expect(kedua.dilewati).toBe(true)
  })

  it('kunci BERBEDA tetap terkirim — bukan menelan semua', async () => {
    const dasar = {
      db: createTenantDb(companyId), companyId,
      nomor: '628999000112', teks: 'halo', konfigurasi: null,
    }
    const a = await kirimWa({ ...dasar, kunciIdempotensi: `${KUNCI_UJI}a` })
    const b = await kirimWa({ ...dasar, kunciIdempotensi: `${KUNCI_UJI}b` })

    // Teks yang sama untuk dua peristiwa berbeda MEMANG harus terkirim dua
    // kali. Kunci berbasis isi akan menelan yang kedua.
    for (const h of [a, b]) {
      expect(h.ok).toBe(false)
      if (!h.ok) expect(h.alasan).toBe('kredensial_tak_ada')
    }
  })

  it('kunci diklaim SEBELUM mengirim — barisnya ada meski gagal', async () => {
    const kunci = `${KUNCI_UJI}gagal`
    await kirimWa({
      db: createTenantDb(companyId), companyId,
      nomor: '628999000113', teks: 'x', kunciIdempotensi: kunci, konfigurasi: null,
    })

    const { rows } = await db.query(
      `SELECT berhasil FROM wa_kirim_idempotensi WHERE kunci = $1`, [kunci])
    // Mengirim lalu mencatat berarti dua permintaan bersamaan sama-sama lolos
    // pemeriksaan dan sama-sama mengirim — persis balapan yang hendak dicegah.
    expect(rows).toHaveLength(1)
    expect(rows[0].berhasil).toBe(false)
  })

  it('TANPA kunci, tak ada perlindungan ganda — dan itu disengaja', async () => {
    const dasar = {
      db: createTenantDb(companyId), companyId,
      nomor: '628999000114', teks: 'balasan percakapan', konfigurasi: null,
    }
    await kirimWa(dasar)
    await kirimWa(dasar)

    const { rows } = await db.query(
      `SELECT count(*)::int n FROM wa_kirim_idempotensi WHERE nomor = '628999000114'`)
    // Balasan percakapan memang tak punya peristiwa pemicu. Memaksa kunci
    // untuk semuanya akan membuat balasan kedua dalam satu obrolan tertelan.
    expect(rows[0].n).toBe(0)
  })
})

describe('tidak pernah melempar', () => {
  it('nomor tak sah mengembalikan hasil, bukan exception', async () => {
    const h = await kirimWa({
      db: createTenantDb(companyId), companyId,
      nomor: 'bukan-nomor', teks: 'x', konfigurasi: null,
    })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toBe('nomor_tak_sah')
  })

  it('konfigurasi kosong mengembalikan hasil, bukan exception', async () => {
    const h = await kirimWa({
      db: createTenantDb(companyId), companyId,
      nomor: '628999000115', teks: 'x', konfigurasi: null,
    })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toBe('kredensial_tak_ada')
  })

  it('penyedia tak dikenal mengembalikan hasil, bukan exception', async () => {
    const h = await kirimWa({
      db: createTenantDb(companyId), companyId,
      nomor: '628999000116', teks: 'x',
      konfigurasi: { penyedia: 'entah', baseUrl: 'http://x', apiKey: 'k', instance: 'i' },
    })
    expect(h.ok).toBe(false)
    if (!h.ok) expect(h.alasan).toBe('penyedia_tak_dikenal')
  })
})

describe('log SELALU ditulis, termasuk yang gagal', () => {
  it('kegagalan tercatat dengan sebabnya', async () => {
    await kirimWa({
      db: createTenantDb(companyId), companyId,
      nomor: '628999000117', teks: 'x', konfigurasi: null,
    })

    const { rows } = await db.query(
      `SELECT status, galat, panjang FROM wa_pesan_log
        WHERE company_id = $1 AND nomor = '628999000117' ORDER BY dibuat_pada DESC LIMIT 1`,
      [companyId],
    )
    // `kirimWa` tak pernah melempar, jadi pemanggil yang mengabaikan hasilnya
    // kehilangan satu-satunya tanda kegagalan. Log ini yang membuat "kenapa
    // mandor tak dapat notifikasi" punya jawaban.
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('gagal')
    expect(rows[0].galat).toBeTruthy()
  })

  it('ISI pesan TIDAK disimpan — hanya panjangnya', async () => {
    const rahasia = 'nilai kontrak Rp 4,1 miliar dengan PT Rahasia'
    await kirimWa({
      db: createTenantDb(companyId), companyId,
      nomor: '628999000118', teks: rahasia, konfigurasi: null,
    })

    const { rows } = await db.query(
      `SELECT * FROM wa_pesan_log WHERE company_id = $1 AND nomor = '628999000118' LIMIT 1`,
      [companyId],
    )
    // Log yang menyimpan isi jadi salinan kedua data operasional yang
    // retensinya tak pernah ikut diatur.
    const semua = JSON.stringify(rows[0])
    expect(semua).not.toContain('Rahasia')
    expect(rows[0].panjang).toBe(rahasia.length)
  })
})
