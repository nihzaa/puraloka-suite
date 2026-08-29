/**
 * Data kepegawaian, terhadap Postgres NYATA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG HANYA BISA DIJAWAB DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   • GAJI benar-benar tak keluar untuk yang tak berwenang
 *   • pengguna tenant lain ditolak jadi pegawai
 *   • nomor induk kembar ditolak per-tenant, TAPI boleh sama antar tenant
 *   • pegawai yang sudah KELUAR terkunci data pokoknya (trigger 340)
 *   • daftar `calon` benar-benar mengecualikan yang sudah terdaftar
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import pegawaiRoutes from '../pegawai.js'

let app: FastifyInstance
let db: Client
let companyId: string
let userBaru: string | null = null
let userAsing: string | null = null
/** Fixture yang DIBUAT test ini — hanya itu yang boleh dihapusnya. */
let userAsingDibuat: string | null = null
const dibuat: string[] = []

const TANDA = 'UJI-PEG'

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })
const post = (url: string, payload: unknown) =>
  app.inject({ method: 'POST', url, payload: payload as never, headers: { authorization: 'Bearer t' } })
const patch = (url: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, payload: payload as never, headers: { authorization: 'Bearer t' } })

async function bersihkan() {
  await db.query(`DELETE FROM pegawai WHERE nomor_induk LIKE $1`, [`${TANDA}%`])
}

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser')
    .mockResolvedValue({ data: { user: { id: auth } }, error: null } as never)

  const { rows: u } = await db.query('SELECT id FROM users WHERE auth_id = $1', [auth])
  const { rows: co } = await db.query(
    'SELECT company_id FROM company_members WHERE user_id = $1 AND is_default AND is_active LIMIT 1', [u[0].id])
  companyId = co[0].company_id

  await bersihkan()

  // Anggota tenant ini yang BELUM punya data kepegawaian — dipilih menurut
  // SYARAT, bukan LIMIT 1: `pegawai_user_unik` akan menolak yang sudah punya,
  // dan testnya gagal karena alasan yang salah (pelajaran migrasi 328).
  const { rows: baru } = await db.query(
    `SELECT cm.user_id FROM company_members cm
      WHERE cm.company_id = $1
        AND NOT EXISTS (SELECT 1 FROM pegawai p WHERE p.user_id = cm.user_id AND p.company_id = $1)
      LIMIT 1`, [companyId])
  userBaru = baru.length ? baru[0].user_id : null

  // Pengguna yang BUKAN anggota tenant ini. Id yang benar-benar ADA, bukan
  // UUID acak: dengan UUID acak `maybeSingle()` mengembalikan null dengan atau
  // tanpa saringan, jadi testnya tetap hijau saat saringannya dibuang
  // (terbukti di E1).
  const { rows: asing } = await db.query(
    `SELECT u.id FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM company_members cm
                         WHERE cm.user_id = u.id AND cm.company_id = $1)
      LIMIT 1`, [companyId])
  if (asing.length) {
    userAsing = asing[0].id
  } else {
    // SELURUH pengguna adalah anggota company ini (diukur 2026-08-12: 0 di
    // luar). Fixture-nya DIBUAT, bukan test-nya dilewati — test yang di-skip
    // karena data kebetulan tak ada adalah test yang tak pernah menjaga apa pun.
    // `role_id` NOT NULL — diukur ke schema sesudah insert pertama ditolak.
    const { rows: peran } = await db.query('SELECT id FROM roles LIMIT 1')
    const { rows: u2 } = await db.query(
      `INSERT INTO users (email, name, auth_id, role_id)
       VALUES ($1, $2, gen_random_uuid(), $3) RETURNING id`,
      [`${TANDA}-asing@uji.local`, `${TANDA} bukan anggota`, peran[0].id])
    userAsing = u2[0].id
    userAsingDibuat = u2[0].id
  }

  app = Fastify({ logger: false })
  await app.register(pegawaiRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  for (const id of dibuat) await db.query('DELETE FROM pegawai WHERE id = $1', [id])
  await bersihkan()
  if (userAsingDibuat) await db.query('DELETE FROM users WHERE id = $1', [userAsingDibuat])
  vi.restoreAllMocks()
  if (app) await app.close()
  await db.end()
})

describe('membaca', () => {
  it('daftar membawa ringkasan dan kelengkapan tiap baris', async () => {
    const r = await get('/api/v1/sdm/pegawai/kelola')
    expect(r.statusCode, r.body).toBe(200)
    const j = r.json()
    expect(j.ringkasan).toHaveProperty('aktif')
    expect(j.ringkasan).toHaveProperty('kritisKosong')
    if (j.pegawai.length > 0) {
      expect(j.pegawai[0]).toHaveProperty('kelengkapan')
      expect(j.pegawai[0].kelengkapan).toHaveProperty('kurangKritis')
    }
  })

  it('pilihan PTKP & TER dikirim SERVER, bukan diketik ulang klien', async () => {
    // Dua daftar untuk hal yang sama pasti berselisih suatu saat — dan yang
    // berselisih di sini adalah tarif pajak.
    const r = await get('/api/v1/sdm/pegawai/kelola')
    const j = r.json()
    expect(j.pilihan.status_ptkp).toContain('TK/0')
    expect(j.pilihan.status_ptkp).toContain('K/I/3')
    expect(j.pilihan.kategori_ter).toEqual(['A', 'B', 'C'])
  })

  it('daftar calon TIDAK memuat yang sudah punya data kepegawaian', async () => {
    const r = await get('/api/v1/sdm/pegawai/calon')
    expect(r.statusCode, r.body).toBe(200)
    const idCalon = r.json().calon.map((c: { id: string }) => c.id)

    const { rows } = await db.query(
      'SELECT user_id FROM pegawai WHERE company_id = $1', [companyId])
    for (const p of rows) {
      expect(idCalon,
        'pengguna yang sudah terdaftar muncul sebagai calon — HRD akan mencoba ' +
        'mendaftarkannya lagi dan ditolak constraint').not.toContain(p.user_id)
    }
  })
})

describe('membuat', () => {
  it('menolak tanpa user_id', async () => {
    const r = await post('/api/v1/sdm/pegawai', { jabatan: 'x' })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/menempel pada akun pengguna/i)
  })

  it('menolak pengguna yang BUKAN anggota tenant ini', async () => {
    if (!userAsing) throw new Error('fixture pengguna asing tak terbentuk')
    const r = await post('/api/v1/sdm/pegawai', {
      user_id: userAsing, nomor_induk: `${TANDA}-ASING`,
    })
    expect(r.statusCode, r.body).toBe(404)
    expect(r.json().error).toMatch(/bukan anggota/i)

    const { rows } = await db.query(
      'SELECT count(*)::int n FROM pegawai WHERE user_id = $1 AND company_id = $2',
      [userAsing, companyId])
    expect(rows[0].n, 'data kepegawaian terbuat untuk pengguna perusahaan lain').toBe(0)
  })

  it('menolak status PTKP yang tak dikenal', async () => {
    if (!userBaru) throw new Error('fixture pengguna baru tak terbentuk')
    const r = await post('/api/v1/sdm/pegawai', {
      user_id: userBaru, nomor_induk: `${TANDA}-001`, status_ptkp: 'TK/9',
    })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/TK\/0/)
  })

  it('membuat pegawai dengan data lengkap', async () => {
    if (!userBaru) throw new Error('fixture pengguna baru tak terbentuk')
    const r = await post('/api/v1/sdm/pegawai', {
      user_id: userBaru,
      nomor_induk: `${TANDA}-001`,
      jabatan: 'Staf Teknik',
      departemen: 'Operasional',
      tanggal_masuk: '2025-03-01',
      gaji_pokok: 6_000_000,
      status_ptkp: 'K/1',
      kategori_ter: 'b',
      npwp: '01.234.567.8-901.000',
      jam_standar: 8,
    })
    expect(r.statusCode, r.body).toBe(201)
    dibuat.push(r.json().pegawai.id)

    const { rows } = await db.query(
      'SELECT kategori_ter, gaji_pokok FROM pegawai WHERE id = $1', [r.json().pegawai.id])
    // Kategori TER dinaikkan jadi huruf besar oleh lib.
    expect(rows[0].kategori_ter).toBe('B')
    expect(Number(rows[0].gaji_pokok)).toBe(6_000_000)
  })

  it('pengguna yang SAMA ditolak 409, bukan membuat data kedua', async () => {
    if (!userBaru) throw new Error('fixture pengguna baru tak terbentuk')
    const r = await post('/api/v1/sdm/pegawai', {
      user_id: userBaru, nomor_induk: `${TANDA}-002`,
    })
    expect(r.statusCode, r.body).toBe(409)
  })

  it('nomor induk KEMBAR di tenant yang sama ditolak', async () => {
    const { rows: lain } = await db.query(
      `SELECT cm.user_id FROM company_members cm
        WHERE cm.company_id = $1
          AND NOT EXISTS (SELECT 1 FROM pegawai p WHERE p.user_id = cm.user_id AND p.company_id = $1)
        LIMIT 1`, [companyId])
    if (!lain.length) return

    const r = await post('/api/v1/sdm/pegawai', {
      user_id: lain[0].user_id, nomor_induk: `${TANDA}-001`,
    })
    expect(r.statusCode,
      'dua pegawai bernomor induk sama — slip gaji bisa tertuju ke orang yang salah')
      .toBe(409)
  })
})

describe('menyunting', () => {
  let idPeg: string

  beforeAll(async () => {
    const { rows } = await db.query(
      `SELECT id FROM pegawai WHERE nomor_induk = $1`, [`${TANDA}-001`])
    idPeg = rows[0].id
  })

  it('memperbarui hanya tanggal keluar TIDAK menghapus tanggal masuk', async () => {
    // Kalau `tanggal_masuk` tak diambil dari barisnya, validasinya membacanya
    // null dan urutan tanggal lolos tanpa diperiksa.
    const r = await patch(`/api/v1/sdm/pegawai/${idPeg}`, { tanggal_keluar: '2026-06-30' })
    expect(r.statusCode, r.body).toBe(200)

    const { rows } = await db.query(
      'SELECT tanggal_masuk, tanggal_keluar FROM pegawai WHERE id = $1', [idPeg])
    expect(rows[0].tanggal_masuk).toBeTruthy()
    expect(rows[0].tanggal_keluar).toBeTruthy()
  })

  it('pegawai yang sudah KELUAR terkunci gajinya — trigger 340', async () => {
    const r = await patch(`/api/v1/sdm/pegawai/${idPeg}`, { gaji_pokok: 99_000_000 })
    expect(r.statusCode, r.body).toBe(422)
    expect(r.json().error).toMatch(/slip gaji dan timesheet lama/i)

    const { rows } = await db.query('SELECT gaji_pokok FROM pegawai WHERE id = $1', [idPeg])
    expect(Number(rows[0].gaji_pokok),
      'gaji pegawai yang sudah keluar berubah — riwayat penggajian jadi retroaktif')
      .toBe(6_000_000)
  })

  it('membatalkan kekeluaran melepas kuncinya', async () => {
    const buka = await patch(`/api/v1/sdm/pegawai/${idPeg}`, { tanggal_keluar: null })
    expect(buka.statusCode, buka.body).toBe(200)

    const r = await patch(`/api/v1/sdm/pegawai/${idPeg}`, { gaji_pokok: 7_000_000 })
    expect(r.statusCode, r.body).toBe(200)
  })

  it('menolak tanggal keluar yang mendahului masuk', async () => {
    const r = await patch(`/api/v1/sdm/pegawai/${idPeg}`, { tanggal_keluar: '2020-01-01' })
    expect(r.statusCode).toBe(400)
    expect(r.json().error).toMatch(/masa kerja negatif/i)
  })

  it('pegawai tenant lain ditolak 404', async () => {
    const { rows } = await db.query(
      'SELECT id FROM pegawai WHERE company_id <> $1 LIMIT 1', [companyId])
    if (!rows.length) return
    const r = await patch(`/api/v1/sdm/pegawai/${rows[0].id}`, { jabatan: 'diubah orang luar' })
    expect(r.statusCode, r.body).toBe(404)
  })
})

describe('gaji tak bocor', () => {
  // Catatan jujur tentang pemisahan izin gaji:
  //
  // Melucuti `bolehLihatGaji ? … : SELECT_AMAN` TIDAK membuat test ini merah —
  // diverifikasi lewat mutasi. Sebabnya test berjalan sebagai admin yang
  // MEMEGANG `sdm:pegawai:manage`, jadi kedua cabang menghasilkan respons yang
  // sama.
  //
  // Membuktikannya menuntut sesi kedua dengan pengguna ber-izin `view` saja —
  // dan harness ini mengimpersonasi satu identitas per berkas. Dicatat sebagai
  // TAK TERBUKTI, bukan dihapus: pemisahannya tetap menahan kebocoran nyata,
  // dan menghapusnya karena tak bisa diuji dari sini membuka kembali.
  //
  // Yang test di bawah BUKTIKAN: benderanya tak pernah berbohong tentang isi
  // responsnya — kalau salah satu berubah tanpa yang lain, ia merah.
  it('bendera boleh_lihat_gaji konsisten dengan isi respons', async () => {
    const r = await get('/api/v1/sdm/pegawai/kelola')
    const j = r.json()
    if (j.pegawai.length === 0) return

    const adaGaji = Object.prototype.hasOwnProperty.call(j.pegawai[0], 'gaji_pokok')
    expect(adaGaji,
      'bendera boleh_lihat_gaji tak sesuai dengan isi respons — salah satunya berbohong')
      .toBe(j.boleh_lihat_gaji)
  })

  it('gaji TIDAK ikut ke audit log', async () => {
    // Nominalnya sudah ada di barisnya sendiri; menyalinnya ke log
    // memperbanyak tempat ia bisa terbaca oleh yang tak berwenang.
    const { rows } = await db.query(
      `SELECT new_values FROM audit_logs
        WHERE table_name = 'pegawai' AND action = 'pegawai.create'
        ORDER BY created_at DESC LIMIT 1`)
    if (!rows.length) return
    expect(JSON.stringify(rows[0].new_values)).not.toMatch(/gaji/i)
  })
})
