import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import cutiKaryawanRoutes from '../cuti-karyawan.js'

/**
 * CUTI & IZIN terhadap Postgres NYATA.
 *
 * ── Yang HANYA bisa dijawab di sini
 *
 * Perhitungannya sudah dikunci 24 test di `lib/__tests__/cuti-karyawan.test.ts`
 * (14 mutasi MERAH) tanpa menyentuh basis. Yang tersisa:
 *
 *   • rantai tenancy `cuti_hak`/`cuti_ambil` lewat `pegawai_id`
 *   • kalender `hari_libur` NYATA benar-benar mengurangi jumlah hari
 *   • `jumlah_hari` DISIMPAN — mengubah kalender sesudahnya TIDAK mengubah
 *     cuti yang sudah diajukan
 *   • constraint DB menolak (nol hari, rentang terbalik, tolak tanpa alasan)
 *   • pemutus diisi dari SESI, bukan dari klien
 *   • dua keputusan bersamaan hanya satu yang berhasil
 *   • hak NEGATIF diterima (koreksi berjejak), hak NOL ditolak
 *
 * Fixture berprefiks [TEST-CT] dan dibersihkan di akhir.
 */

let app: FastifyInstance
let client: Client
let adminAuth: string | null
let companyId: string
let pegawaiId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: a } }, error: null } as never)

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

const kirim = (method: 'POST', url: string, payload: Record<string, unknown> = {}) =>
  app.inject({ method, url, payload, headers: { authorization: 'Bearer t' } })

async function purge() {
  // Jejak approval TIDAK punya FK ke `cuti_ambil` (ia generik lintas entitas),
  // jadi ia tak ikut terhapus dan akan membuat test "tercatat di mesin" lolos
  // dari sisa run SEBELUMNYA — hijau tanpa membuktikan apa pun. Pelajaran G1e.
  await client.query(
    `DELETE FROM approval_progress
      WHERE entity_type = 'cuti_karyawan'
        AND entity_id IN (SELECT id FROM cuti_ambil WHERE pegawai_id IN
              (SELECT id FROM pegawai WHERE nomor_induk LIKE '[TEST-CT]%'))`)
  await client.query(
    `DELETE FROM cuti_ambil WHERE pegawai_id IN
       (SELECT id FROM pegawai WHERE nomor_induk LIKE '[TEST-CT]%')`)
  await client.query(
    `DELETE FROM cuti_hak WHERE pegawai_id IN
       (SELECT id FROM pegawai WHERE nomor_induk LIKE '[TEST-CT]%')`)
  await client.query(`DELETE FROM pegawai WHERE nomor_induk LIKE '[TEST-CT]%'`)
  await client.query(`DELETE FROM hari_libur WHERE nama LIKE '[TEST-CT]%'`)
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
    `INSERT INTO pegawai (user_id, company_id, nomor_induk, jabatan, jam_standar)
     VALUES ($1, $2, '[TEST-CT]001', 'Staf uji cuti', 8) RETURNING id`,
    [u[0].id, companyId])
  pegawaiId = g[0].id

  // Hari libur uji: Rabu 2027-09-08 (tahun jauh supaya tak bentrok data lain).
  await client.query(
    `INSERT INTO hari_libur (company_id, tanggal, nama, jenis, tetap_bekerja)
     VALUES ($1, '2027-09-08', '[TEST-CT] Libur Uji', 'perusahaan', false)`,
    [companyId])

  app = Fastify()
  await app.register(await import('@fastify/jwt'), { secret: 'uji' })
  await app.register(cutiKaryawanRoutes)
  await app.ready()

  if (!adminAuth) throw new Error('auth_id untuk peran admin tak ditemukan')
  actAs(adminAuth)
})

afterAll(async () => {
  await purge()
  await app?.close()
  await client?.end()
})

describe('POST /sdm/pegawai/:id/cuti-hak', () => {
  it('alasan WAJIB — angka jatah tanpa keterangan tak bisa dipertanggungjawabkan', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/cuti-hak`, {
      tahun: 2027, jumlah_hari: 12,
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/alasan/i)
    expect(r.json().error).not.toMatch(/null value in column/)
  })

  it('jumlah NOL ditolak dengan pesan yang menjelaskan negatif SAH', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/cuti-hak`, {
      tahun: 2027, jumlah_hari: 0, alasan: 'nol',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/NEGATIF/i)
  })

  it('jatah tahunan tersimpan', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/cuti-hak`, {
      tahun: 2027, jumlah_hari: 12, alasan: 'Jatah tahunan 2027',
    })
    expect(r.statusCode).toBe(201)
  })

  it('hak NEGATIF diterima sebagai koreksi berjejak', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/cuti-hak`, {
      tahun: 2027, jumlah_hari: -2, alasan: 'Koreksi kelebihan jatah',
    })
    // Koreksi dicatat sebagai BARIS, bukan dengan mengedit baris lama —
    // mengedit menghapus jejak.
    expect(r.statusCode).toBe(201)

    const j = (await get(`/api/v1/sdm/pegawai/${pegawaiId}/cuti?tahun=2027`)).json()
    expect(j.saldo.hak).toBe(10)
  })
})

describe('POST /sdm/pegawai/:id/cuti — kalender libur NYATA', () => {
  it('hari libur di basis mengurangi jumlah hari', async () => {
    // Senin 2027-09-06 … Kamis 2027-09-09, dengan Rabu 09-08 libur uji.
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/cuti`, {
      jenis: 'tahunan', tanggal_mulai: '2027-09-06', tanggal_selesai: '2027-09-09',
      alasan: 'Uji kalender',
    })
    expect(r.statusCode).toBe(201)
    // 4 tanggal − 1 libur = 3 hari kerja.
    expect(Number(r.json().cuti.jumlah_hari)).toBe(3)
    expect(r.json().cuti.hari_dilewati).toMatch(/Libur Uji/)
  })

  it('`jumlah_hari` DISIMPAN — mengubah kalender tak mengubah cuti yang ada', async () => {
    // ── Invarian yang membedakan modul ini dari "hitung saat baca" ────────
    //
    // Kalender libur bisa berubah: cuti bersama sering diumumkan pemerintah
    // di tengah tahun. Cuti yang sudah diajukan tak boleh tiba-tiba memakan
    // jatah yang berbeda dari yang disepakati.
    const sebelum = (await client.query(
      `SELECT jumlah_hari FROM cuti_ambil
        WHERE pegawai_id = $1 AND tanggal_mulai = '2027-09-06'`, [pegawaiId])).rows[0]

    // Tambah libur BARU di tengah rentang yang sudah diajukan.
    await client.query(
      `INSERT INTO hari_libur (company_id, tanggal, nama, jenis, tetap_bekerja)
       VALUES ($1, '2027-09-07', '[TEST-CT] Cuti Bersama Dadakan', 'cuti_bersama', false)`,
      [companyId])

    const j = (await get(`/api/v1/sdm/pegawai/${pegawaiId}/cuti?tahun=2027`)).json()
    const c = j.ambil.find((x: { tanggal_mulai: string }) => x.tanggal_mulai === '2027-09-06')
    // TETAP 3, bukan 2.
    expect(Number(c.jumlah_hari)).toBe(Number(sebelum.jumlah_hari))
  })

  it('rentang yang seluruhnya akhir pekan ditolak, bukan diterima 0 hari', async () => {
    // 2027-09-11 Sabtu, 09-12 Minggu.
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/cuti`, {
      jenis: 'tahunan', tanggal_mulai: '2027-09-11', tanggal_selesai: '2027-09-12',
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().penghalang.map((p: { kode: string }) => p.kode)).toContain('nol-hari')
  })

  it('tumpang tindih dengan pengajuan hidup ditolak', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/cuti`, {
      jenis: 'tahunan', tanggal_mulai: '2027-09-09', tanggal_selesai: '2027-09-10',
    })
    expect(r.statusCode).toBe(422)
    expect(r.json().penghalang.map((p: { kode: string }) => p.kode))
      .toContain('tumpang-tindih')
  })

  it('jenis di luar enum ditolak sebelum menyentuh basis', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/cuti`, {
      jenis: 'liburan', tanggal_mulai: '2027-10-04', tanggal_selesai: '2027-10-05',
    })
    expect(r.statusCode).toBe(400)
  })

  it('404 untuk pegawai yang tak ada', async () => {
    const r = await kirim('POST',
      '/api/v1/sdm/pegawai/00000000-0000-0000-0000-0000000000ff/cuti',
      { jenis: 'tahunan', tanggal_mulai: '2027-10-04', tanggal_selesai: '2027-10-05' })
    expect(r.statusCode).toBe(404)
  })
})

describe('POST /sdm/cuti/:id/putuskan', () => {
  let cutiId: string

  beforeAll(async () => {
    const { rows } = await client.query(
      `SELECT id FROM cuti_ambil WHERE pegawai_id = $1 AND status = 'diajukan' LIMIT 1`,
      [pegawaiId])
    cutiId = rows[0].id
  })

  it('penolakan WAJIB beralasan', async () => {
    const r = await kirim('POST', `/api/v1/sdm/cuti/${cutiId}/putuskan`, { setujui: false })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/alasan|diperbaiki/i)
    expect(r.json().error).not.toMatch(/violates check constraint/)
  })

  it('pemutus diisi dari SESI, bukan dari klien', async () => {
    const r = await kirim('POST', `/api/v1/sdm/cuti/${cutiId}/putuskan`, {
      setujui: true,
      diputuskan_oleh: '00000000-0000-0000-0000-0000000000ff',
    })
    expect(r.statusCode).toBe(200)

    const { rows } = await client.query(
      `SELECT diputuskan_oleh, diputuskan_pada FROM cuti_ambil WHERE id = $1`, [cutiId])
    expect(rows[0].diputuskan_oleh).not.toBe('00000000-0000-0000-0000-0000000000ff')
    expect(rows[0].diputuskan_pada).not.toBeNull()
  })

  it('sesudah disetujui, saldo BERKURANG', async () => {
    const j = (await get(`/api/v1/sdm/pegawai/${pegawaiId}/cuti?tahun=2027`)).json()
    expect(j.saldo.terpakai).toBe(3)
    expect(j.saldo.sisa).toBe(7)
  })

  it('persetujuan tercatat di MESIN approval, bukan hanya di kolom', async () => {
    // ── Kenapa test ini ada ──────────────────────────────────────────────
    //
    // Versi pertama endpoint menulis `diputuskan_oleh` langsung, dan
    // `audit-approval-satu-pintu.mjs` merahkannya. Cuti TANPA GAJI memotong
    // gaji, dan sebagian perusahaan menuntut cuti panjang disetujui
    // berjenjang — tulis-langsung membuat rantai dua langkah lolos dengan
    // satu ketukan.
    //
    // Kolom terisi BUKAN bukti mesinnya dipakai. Yang membedakan: jejak di
    // `approval_progress`.
    const { rows } = await client.query(
      `SELECT level, approved_by FROM approval_progress
        WHERE entity_type = 'cuti_karyawan' AND entity_id = $1`, [cutiId])
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].approved_by).not.toBeNull()
  })

  it('PENOLAKAN tidak menuntut rantai — pengajuan salah tak menggantung', async () => {
    // Menolak bukan "menyetujui langkah". Menuntut rantai penuh untuk
    // menolak berarti pengajuan yang jelas salah tetap menggantung menunggu
    // level berikutnya.
    const { rows } = await client.query(
      `INSERT INTO cuti_ambil (pegawai_id, jenis, tanggal_mulai, tanggal_selesai,
                               jumlah_hari, status)
       VALUES ($1, 'tahunan', '2027-11-15', '2027-11-16', 2, 'diajukan') RETURNING id`,
      [pegawaiId])
    const r = await kirim('POST', `/api/v1/sdm/cuti/${rows[0].id}/putuskan`, {
      setujui: false, alasan: 'Bentrok dengan jadwal serah terima',
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().cuti.status).toBe('ditolak')

    // Dan TIDAK meninggalkan jejak approval — penolakan bukan persetujuan.
    const { rows: jejak } = await client.query(
      `SELECT 1 FROM approval_progress
        WHERE entity_type = 'cuti_karyawan' AND entity_id = $1`, [rows[0].id])
    expect(jejak).toHaveLength(0)
  })

  it('keputusan KEDUA ditolak — status lama ikut di WHERE', async () => {
    const r = await kirim('POST', `/api/v1/sdm/cuti/${cutiId}/putuskan`, { setujui: true })
    expect(r.statusCode).toBe(409)
  })

  it('dua keputusan BERSAMAAN: tepat satu berhasil', async () => {
    const { rows } = await client.query(
      `INSERT INTO cuti_ambil (pegawai_id, jenis, tanggal_mulai, tanggal_selesai,
                               jumlah_hari, status)
       VALUES ($1, 'tahunan', '2027-11-01', '2027-11-02', 2, 'diajukan') RETURNING id`,
      [pegawaiId])
    const url = `/api/v1/sdm/cuti/${rows[0].id}/putuskan`
    const [a, b] = await Promise.all([
      kirim('POST', url, { setujui: true }),
      kirim('POST', url, { setujui: true }),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409])
  })
})

describe('POST /sdm/cuti/:id/batal', () => {
  it('membatalkan yang DISETUJUI mengembalikan saldo', async () => {
    const { rows } = await client.query(
      `SELECT id FROM cuti_ambil WHERE pegawai_id = $1 AND status = 'disetujui'
        AND tanggal_mulai = '2027-11-01' LIMIT 1`, [pegawaiId])

    const sebelum = (await get(`/api/v1/sdm/pegawai/${pegawaiId}/cuti?tahun=2027`)).json()
    const r = await kirim('POST', `/api/v1/sdm/cuti/${rows[0].id}/batal`)
    expect(r.statusCode).toBe(200)

    const sesudah = (await get(`/api/v1/sdm/pegawai/${pegawaiId}/cuti?tahun=2027`)).json()
    // Rencana berubah — memaksa cuti yang tak jadi diambil tetap memotong
    // jatah adalah hukuman untuk sesuatu yang bukan kesalahan.
    expect(sesudah.saldo.sisa).toBe(sebelum.saldo.sisa + 2)
  })

  it('membatalkan DUA KALI ditolak', async () => {
    const { rows } = await client.query(
      `SELECT id FROM cuti_ambil WHERE pegawai_id = $1 AND status = 'dibatalkan' LIMIT 1`,
      [pegawaiId])
    const r = await kirim('POST', `/api/v1/sdm/cuti/${rows[0].id}/batal`)
    expect(r.statusCode).toBe(409)
  })

  it('yang dibatalkan TIDAK menghalangi pengajuan di tanggal sama', async () => {
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/cuti`, {
      jenis: 'tahunan', tanggal_mulai: '2027-11-01', tanggal_selesai: '2027-11-02',
    })
    expect(r.statusCode).toBe(201)
  })
})

describe('GET /sdm/pegawai/:id/cuti — saldo dari transaksi', () => {
  it('cuti tahun LAIN tak mengurangi saldo tahun ini', async () => {
    // ── Kenapa test ini ditambahkan ───────────────────────────────────────
    //
    // Mutasi membuktikan saringan tahun TAK PERNAH DIUJI: seluruh fixture
    // ada di 2027, jadi melepas `.filter(tahun)` tak membuat satu test pun
    // merah. Jatah 2027 yang dimakan cuti 2028 adalah kesalahan yang baru
    // terlihat saat karyawan mengajukan cuti dan ditolak tanpa sebab jelas.
    const sebelum = (await get(`/api/v1/sdm/pegawai/${pegawaiId}/cuti?tahun=2027`)).json()

    await client.query(
      `INSERT INTO cuti_ambil (pegawai_id, jenis, tanggal_mulai, tanggal_selesai,
                               jumlah_hari, status, diputuskan_oleh, diputuskan_pada)
       VALUES ($1, 'tahunan', '2028-03-06', '2028-03-08', 3, 'disetujui',
               (SELECT id FROM users LIMIT 1), now())`, [pegawaiId])

    const sesudah = (await get(`/api/v1/sdm/pegawai/${pegawaiId}/cuti?tahun=2027`)).json()
    expect(sesudah.saldo.terpakai).toBe(sebelum.saldo.terpakai)
    expect(sesudah.saldo.sisa).toBe(sebelum.saldo.sisa)
  })

  it('pengajuan BARU tak dihalangi jatah yang dimakan tahun lain', async () => {
    // Sisi tulis dari invarian yang sama: `bolehAjukan` memakai saldo tahun
    // pengajuan, bukan saldo gabungan seluruh tahun.
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/cuti`, {
      jenis: 'tahunan', tanggal_mulai: '2027-10-04', tanggal_selesai: '2027-10-05',
      alasan: 'Uji saringan tahun',
    })
    expect(r.statusCode).toBe(201)
  })

  it('cuti SAKIT tidak memakan jatah tahunan', async () => {
    const sebelum = (await get(`/api/v1/sdm/pegawai/${pegawaiId}/cuti?tahun=2027`)).json()
    const r = await kirim('POST', `/api/v1/sdm/pegawai/${pegawaiId}/cuti`, {
      jenis: 'sakit', tanggal_mulai: '2027-12-06', tanggal_selesai: '2027-12-08',
      alasan: 'Demam',
    })
    expect(r.statusCode).toBe(201)

    const sesudah = (await get(`/api/v1/sdm/pegawai/${pegawaiId}/cuti?tahun=2027`)).json()
    // Memotongnya dari jatah berarti karyawan yang sakit kehilangan
    // liburannya.
    expect(sesudah.saldo.sisa).toBe(sebelum.saldo.sisa)
    expect(sesudah.saldo.tertahan).toBe(sebelum.saldo.tertahan)
  })
})
