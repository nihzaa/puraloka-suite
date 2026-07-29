import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// ============================================================
// P2 (ADR-011 §9.5) — ISOLASI DIBUKTIKAN SEBELUM PELANGGAN KEDUA ADA.
//
// Membuat tenant kedua BETULAN berisi data, lalu menyatakan yang NEGATIF:
// data tenant B tidak pernah muncul di sisi tenant A. Semua di dalam satu
// transaksi yang di-ROLLBACK — dev tidak berubah sedikit pun.
//
// Kenapa ini penting sekarang, bukan nanti: checklist L2 mensyaratkan "isolasi
// 2 company terverifikasi". Kalau menunggu pelanggan kedua nyata, verifikasinya
// terjadi saat data produksi sudah masuk — waktu paling mahal dan paling tak
// bisa di-rollback.
//
// CAKUPAN JUJUR: yang diuji di sini adalah PREDIKAT yang dipakai wrapper
// (`eq(company_id)` untuk B, `IS NULL OR eq` untuk AB, daftar id untuk C) —
// bukan tiap endpoint HTTP satu per satu. Uji per-endpoint ada di
// `search-tenant-isolation.test.ts` (masih di-skip, lihat catatan di sana).
// Jadi test ini membuktikan ATURANNYA benar, bukan bahwa 60 endpoint sudah
// memakainya — yang terakhir dijaga ratchet + audit, bukan test ini.
// ============================================================

let c: Client
let companyA: string
let companyB: string
let userId: string
let idProyekB: string
let idKlienB: string

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')

  userId = (await c.query(`SELECT id FROM users LIMIT 1`)).rows[0].id
  companyA = (await c.query(`SELECT id FROM companies ORDER BY created_at LIMIT 1`)).rows[0].id
  companyB = (await c.query(
    `INSERT INTO companies (code, name) VALUES ('uji-isolasi-p2', 'Tenant B (uji)') RETURNING id`
  )).rows[0].id

  idKlienB = (await c.query(
    `INSERT INTO clients (contact_person, phone, created_by, company_id)
     VALUES ('[UJI-P2] Klien B', '0800', $1, $2) RETURNING id`, [userId, companyB]
  )).rows[0].id
  idProyekB = (await c.query(
    `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date, created_by, company_id)
     VALUES ($1, $2, '[UJI-P2] Proyek B', 'Jakarta', '2026-01-01', '2026-12-31', $2, $3) RETURNING id`,
    [idKlienB, userId, companyB]
  )).rows[0].id
}, 120_000)

afterAll(async () => {
  // ROLLBACK, bukan DELETE: satu perintah, tak mungkin menyisakan residu
  // meski test gagal di tengah.
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

/** Meniru predikat wrapper untuk kategori B/ANCHOR: eq(company_id). */
const barisKategoriB = (tabel: string, companyId: string) =>
  c.query(`SELECT id FROM ${tabel} WHERE company_id = $1`, [companyId])

/** Meniru predikat wrapper untuk kategori AB: NULL (bersama) OR milik sendiri. */
const barisKategoriAB = (tabel: string, companyId: string) =>
  c.query(`SELECT count(*)::int n FROM ${tabel} WHERE company_id IS NULL OR company_id = $1`,
    [companyId])

describe('P2 — kategori B/ANCHOR: milik tenant, tak bocor', () => {
  it('projects: proyek B TIDAK terlihat oleh tenant A', async () => {
    const { rows } = await barisKategoriB('projects', companyA)
    expect(rows.map((r) => r.id)).not.toContain(idProyekB)
  }, 30_000)

  it('projects: proyek B terlihat oleh tenant B sendiri (bukan over-filtering)', async () => {
    // Isolasi yang menyembunyikan data dari PEMILIKNYA juga "aman" tapi rusak.
    const { rows } = await barisKategoriB('projects', companyB)
    expect(rows.map((r) => r.id)).toContain(idProyekB)
  }, 30_000)

  it('clients: klien B TIDAK terlihat oleh tenant A (PII: NPWP, telepon, alamat)', async () => {
    const { rows } = await barisKategoriB('clients', companyA)
    expect(rows.map((r) => r.id)).not.toContain(idKlienB)
  }, 30_000)

  it('tenant A tetap punya datanya sendiri — bukan nol', async () => {
    const { rows } = await barisKategoriB('projects', companyA)
    expect(rows.length, 'tenant A kehilangan proyeknya = over-filtering').toBeGreaterThan(0)
  }, 30_000)
})

describe('P2 — kategori AB: katalog bersama tetap bersama', () => {
  it('AHSP nasional terlihat oleh KEDUA tenant', async () => {
    // Ini yang membuat katalog nasional jadi nilai jual produk, bukan aset satu
    // pelanggan. Kalau angka B jauh lebih kecil dari 2.620, berarti scoping
    // terlalu ketat dan tenant baru kehilangan katalognya.
    const a = (await barisKategoriAB('assemblies', companyA)).rows[0].n
    const b = (await barisKategoriAB('assemblies', companyB)).rows[0].n
    expect(a, 'tenant A kehilangan katalog').toBeGreaterThan(2000)
    expect(b, 'tenant BARU tak mewarisi katalog nasional').toBeGreaterThan(2000)
  }, 30_000)

  it('AHSP company milik A TIDAK ikut terlihat tenant B', async () => {
    const a = (await barisKategoriAB('assemblies', companyA)).rows[0].n
    const b = (await barisKategoriAB('assemblies', companyB)).rows[0].n
    // A = nasional + miliknya sendiri; B = nasional saja. Selisihnya persis
    // jumlah assembly company milik A.
    const milikA = (await c.query(
      `SELECT count(*)::int n FROM assemblies WHERE company_id = $1`, [companyA])).rows[0].n
    expect(a - b).toBe(milikA)
    expect(milikA, 'fixture: tenant A harus punya assembly company').toBeGreaterThan(0)
  }, 30_000)
})

describe('P2 — kategori C: mewarisi lewat project', () => {
  it('daftar id proyek tenant A tidak memuat proyek B', async () => {
    // Inilah predikat yang dipakai SELURUH endpoint kategori C
    // (.in('project_id', await db.projectIds())). Kalau daftar ini bocor,
    // semua turunannya ikut bocor sekaligus.
    const { rows } = await c.query(
      `SELECT id FROM projects WHERE company_id = $1`, [companyA])
    const ids = rows.map((r) => r.id)
    expect(ids).not.toContain(idProyekB)
    expect(ids.length).toBeGreaterThan(0)
  }, 30_000)
})

describe('P2 — jaring pengaman DB (migration 128) saat tenant > 1', () => {
  it('INSERT tanpa company_id DITOLAK saat ada 2 company (tidak menebak)', async () => {
    // Trigger fn_isi_company_id MENGERAS SENDIRI begitu tenant kedua ada:
    // selama satu tenant ia mengisi otomatis; begitu ambigu ia membiarkan NULL
    // dan constraint NOT NULL yang menolak. Diuji di sini karena hanya di
    // konteks 2-tenant perilaku itu bisa dibuktikan.
    await expect(
      c.query(`INSERT INTO clients (contact_person, phone, created_by)
               VALUES ('[UJI-P2] tanpa company', '08', $1)`, [userId])
    ).rejects.toThrow()
  }, 30_000)
})
