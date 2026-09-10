/**
 * S8 — riwayat asisten: batas privasi, isolasi tenant, dan jejak pengawas.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI BERAT DI SISI PRIVASI, BUKAN DI SISI TAMPILAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Halaman ini memuat percakapan ORANG LAIN. Cacatnya karena itu tak berbentuk
 * layar rusak — ia berbentuk data yang terbaca oleh yang tak berhak, dan
 * kebocoran seperti itu tak pernah mengeluarkan galat. Yang diuji:
 *
 *   1. daftar TIDAK memulangkan isi percakapan (`teks`) sama sekali
 *   2. percakapan tenant LAIN tak terbaca, baik di daftar maupun per-id
 *   3. membaca percakapan orang lain MENINGGALKAN jejak audit
 *   4. membaca percakapan SENDIRI tidak — audit yang penuh baris tak berarti
 *      membuat baris yang berarti tenggelam
 *   5. `/keputusan` hanya memulangkan jejak tenant sendiri
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import aiRiwayatRoutes from '../ai-riwayat.js'

let app: FastifyInstance
let db: Client
let companyId: string
let userId: string
let lainCompanyId: string
let lainPercakapanId: string
let punyaOrangLainId: string

const get = (url: string) =>
  app.inject({ method: 'GET', url, headers: { authorization: 'Bearer t' } })

beforeAll(async () => {
  db = await createRlsClient()
  const auth = await authIdForRole(db, 'admin')
  if (!auth) throw new Error('tak ada pengguna ber-role admin')
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: auth } }, error: null } as never,
  )

  /*
    Company diambil dari keanggotaan DEFAULT admin sesi, bukan company
    beranggota mana pun.

    `LIMIT 1` tanpa ORDER BY atas seluruh companies beranggota memilih tenant
    yang belum tentu sama dengan `auth_company_id()` — dan RLS menyaring lewat
    yang kedua. Begitu keduanya berbeda, baris yang BARU SAJA disisipkan test
    tak terlihat oleh rute, dan gejalanya `expected 404 to be 200`.

    Pola diambil dari `ai-chat.test.ts` yang sudah diperbaiki lebih dulu.
  */
  const { rows } = await db.query(
    `SELECT m.company_id AS id
       FROM company_members m
       JOIN users u ON u.id = m.user_id
      WHERE u.auth_id = $1 AND m.is_default AND m.is_active
      LIMIT 1`,
    [auth],
  )
  if (!rows.length) throw new Error('admin uji tak punya keanggotaan default')
  companyId = rows[0].id
  const { rows: u } = await db.query(
    `SELECT id FROM users WHERE auth_id = $1`, [auth])
  userId = u[0].id

  // Percakapan milik ORANG LAIN di tenant yang sama.
  const { rows: lainUser } = await db.query(
    `SELECT user_id FROM company_members WHERE company_id = $1 AND user_id <> $2 LIMIT 1`,
    [companyId, userId])
  /*
   * Kalau tenant ini hanya punya SATU anggota, tak ada "orang lain" yang bisa
   * dijadikan pemilik. Ditandai eksplisit supaya test jejak-audit di bawah
   * tak diam-diam menguji percakapan milik sendiri dan LULUS tanpa arti.
   */
  const pemilikLain: string | null = lainUser[0]?.user_id ?? null
  if (!pemilikLain) {
    // Lebih baik GAGAL daripada lulus tanpa arti: tanpa "orang lain", test
    // jejak-audit di bawah akan menguji percakapan milik sendiri dan hijau
    // untuk alasan yang salah.
    throw new Error(
      'tenant uji hanya punya satu anggota — test jejak "baca milik orang lain" ' +
        'tak bisa dibuktikan. Tambahkan anggota kedua ke company_members.',
    )
  }

  const { rows: p1 } = await db.query(
    `INSERT INTO ai_percakapan (company_id, user_id, asisten, judul, kanal)
     VALUES ($1, $2, 'staff', '[UJI-S8] milik orang lain', 'web') RETURNING id`,
    [companyId, pemilikLain])
  punyaOrangLainId = p1[0].id
  await db.query(
    `INSERT INTO ai_pesan (company_id, percakapan_id, peran, urutan, teks)
     VALUES ($1, $2, 'user', 1, 'RAHASIA MILIK ORANG LAIN')`,
    [companyId, punyaOrangLainId])

  // Tenant LAIN.
  const { rows: pemilik } = await db.query(
    `SELECT owner_user_id FROM companies WHERE id = $1`, [companyId])
  const { rows: lain } = await db.query(
    `INSERT INTO companies (code, name, owner_user_id) VALUES ($1,$2,$3) RETURNING id`,
    [`uji-s8-${Date.now()}`, '[UJI-S8] Tenant Lain', pemilik[0].owner_user_id])
  lainCompanyId = lain[0].id

  // `user_id` NOT NULL — diukur, bukan ditebak. Pemilik company dipakai
  // sebagai penanya; yang diuji isolasi COMPANY-nya, bukan siapa penanyanya.
  const { rows: p2 } = await db.query(
    `INSERT INTO ai_percakapan (company_id, user_id, asisten, judul, kanal)
     VALUES ($1, $2, 'staff', '[UJI-S8] TENANT LAIN', 'web') RETURNING id`,
    [lainCompanyId, pemilik[0].owner_user_id])
  lainPercakapanId = p2[0].id
  await db.query(
    `INSERT INTO ai_pesan (company_id, percakapan_id, peran, urutan, teks)
     VALUES ($1, $2, 'user', 1, 'RAHASIA TENANT LAIN')`,
    [lainCompanyId, lainPercakapanId])

  app = Fastify()
  await app.register(aiRiwayatRoutes)
  await app.ready()
}, 90_000)

afterAll(async () => {
  await db.query(`DELETE FROM ai_percakapan WHERE judul LIKE '[UJI-S8]%'`)
  await db.query(`UPDATE companies SET is_active = false WHERE id = $1`, [lainCompanyId])
  // `app`/`db` bisa belum terbentuk kalau beforeAll gagal. Teardown yang
  // melempar MENUTUPI galat aslinya — persis yang terjadi saat berkas ini
  // ditulis: pesan "Cannot read properties of undefined (reading 'close')"
  // muncul di layar, sementara sebab sebenarnya (user_id NOT NULL) tenggelam.
  if (app) await app.close()
  if (db) await db.end()
})

describe('daftar — metadata saja', () => {
  it('TIDAK memulangkan isi percakapan', async () => {
    /*
     * Inti berkas ini.
     *
     * Daftar yang ikut membawa `teks` mengubah "log aktivitas" jadi papan
     * pengumuman: satu layar yang tak sengaja terlihat rekan kerja
     * membocorkan pertanyaan orang lain tentang gaji, kasbon, atau sengketa.
     * Dan yang bocor lewat balasan API tetap bocor walau UI tak
     * menampilkannya.
     */
    const r = await get('/api/v1/ai/riwayat')
    expect(r.statusCode).toBe(200)
    const mentah = r.body
    expect(mentah).not.toContain('RAHASIA MILIK ORANG LAIN')
    expect(mentah).not.toContain('"teks"')
  })

  it('percakapan tenant LAIN tak ikut terdaftar', async () => {
    const r = await get('/api/v1/ai/riwayat')
    expect(r.body).not.toContain('[UJI-S8] TENANT LAIN')
    expect(r.body).not.toContain('RAHASIA TENANT LAIN')
  })

  it('membawa nama penanya, bukan hanya UUID', async () => {
    const r = await get('/api/v1/ai/riwayat')
    const data = r.json().data as Array<{ nama: string; jumlah_pesan: number }>
    expect(data.length).toBeGreaterThan(0)
    // Daftar tanpa nama menuntut orang menghafal UUID untuk tahu siapa yang
    // bertanya — dan yang menghafal UUID tak akan memeriksa apa pun.
    expect(data.every((d) => typeof d.nama === 'string' && d.nama.length > 0)).toBe(true)
    expect(data.some((d) => d.jumlah_pesan > 0)).toBe(true)
  })
})

describe('membuka satu percakapan', () => {
  it('percakapan tenant LAIN dibalas 404, isinya tak bocor', async () => {
    const r = await get(`/api/v1/ai/riwayat/${lainPercakapanId}`)
    expect(r.statusCode).toBe(404)
    expect(r.body).not.toContain('RAHASIA TENANT LAIN')
  })

  it('percakapan tenant SENDIRI bisa dibaca', async () => {
    // Pasangan wajib: gerbang yang menolak SEMUANYA juga lolos test di atas.
    const r = await get(`/api/v1/ai/riwayat/${punyaOrangLainId}`)
    expect(r.statusCode).toBe(200)
    expect(r.json().pesan.length).toBeGreaterThan(0)
  })

  it('membaca percakapan ORANG LAIN meninggalkan jejak audit', async () => {
    /*
     * Pengawasan atas pengawas. Halaman ini dibuat supaya pemilik bisa
     * mengawasi asisten; tanpa jejak ini ia jadi jendela sepihak untuk
     * mengintip bawahan, dan yang diintip tak punya cara tahu.
     */
    // Dihitung SEBELUM dan SESUDAH, bukan dihapus lalu dihitung: audit_logs
    // append-only, dan DELETE-nya memang ditolak basis.
    const { rows: sebelum } = await db.query(
      `SELECT count(*)::int AS n FROM audit_logs
        WHERE action = 'ai.riwayat.baca_milik_orang_lain' AND record_id = $1`,
      [punyaOrangLainId])

    await get(`/api/v1/ai/riwayat/${punyaOrangLainId}`)
    // logAuditEvent dipanggil tanpa await (void) — beri waktu mendarat.
    await new Promise((r) => setTimeout(r, 900))

    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM audit_logs
        WHERE action = 'ai.riwayat.baca_milik_orang_lain' AND record_id = $1`,
      [punyaOrangLainId])
    expect(
      rows[0].n,
      'membaca percakapan orang lain tak meninggalkan jejak — halaman pengawas ' +
        'jadi jendela sepihak untuk mengintip bawahan',
    ).toBeGreaterThan(sebelum[0].n)
  })

  it('membaca percakapan SENDIRI tidak dicatat', async () => {
    // Audit yang penuh baris tak berarti membuat baris yang berarti tenggelam.
    const { rows: milikSaya } = await db.query(
      `INSERT INTO ai_percakapan (company_id, user_id, asisten, judul, kanal)
       VALUES ($1, $2, 'staff', '[UJI-S8] milik saya', 'web') RETURNING id`,
      [companyId, userId])

    await get(`/api/v1/ai/riwayat/${milikSaya[0].id}`)
    await new Promise((r) => setTimeout(r, 900))

    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM audit_logs
        WHERE action = 'ai.riwayat.baca_milik_orang_lain' AND record_id = $1`,
      [milikSaya[0].id])
    expect(rows[0].n).toBe(0)
  })
})

describe('jejak keputusan', () => {
  it('hanya memulangkan jejak ai.* milik tenant sendiri', async () => {
    const { rows } = await db.query(
      `INSERT INTO audit_logs (company_id, user_id, action, table_name, record_id, new_values)
       VALUES ($1, NULL, 'ai.tulis.berhasil', 'uji', $2, '{"ringkasan":"JEJAK TENANT LAIN"}'::jsonb)
       RETURNING id`,
      [lainCompanyId, lainPercakapanId])

    const r = await get('/api/v1/ai/riwayat/keputusan')
    expect(r.statusCode).toBe(200)
    expect(r.body).not.toContain('JEJAK TENANT LAIN')

    /*
     * TIDAK dihapus — `audit_logs` append-only (migrasi 073), dan DELETE-nya
     * ditolak basis. Itu aturan yang BENAR: jejak audit yang bisa dihapus
     * bukan jejak audit, dan test yang menyiasatinya akan mengajari orang
     * berikutnya bahwa aturan itu bisa ditawar.
     *
     * Barisnya tertinggal di company `[UJI-S8] Tenant Lain` yang dinonaktifkan
     * di afterAll — dan justru itu bukti tambahan bahwa penyaringnya bekerja:
     * ia ada di basis, dan tetap tak terbaca dari tenant ini.
     */
    void rows
  })

  it('rute /keputusan tak tertelan oleh /:id', async () => {
    // Kalau `/:id` yang menang, "keputusan" dibaca sebagai UUID percakapan
    // dan balasannya 404 — galat yang menunjuk ke tempat yang salah.
    const r = await get('/api/v1/ai/riwayat/keputusan')
    expect(r.statusCode).toBe(200)
    expect(Array.isArray(r.json().data)).toBe(true)
  })
})
