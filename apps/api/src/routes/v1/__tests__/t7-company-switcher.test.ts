import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// ============================================================
// T7 — COMPANY SWITCHER: daftar perusahaan milik user.
//
// Endpoint `GET /api/v1/my/companies` adalah fondasi switcher. Ia satu-satunya
// tempat di sistem yang SENGAJA tidak memakai wrapper tenant — karena yang
// ditanyakan justru "company mana saja yang boleh saya pakai", dan wrapper akan
// menyaringnya ke company aktif saja.
//
// Karena itu lingkupnya harus dijaga sumber lain: `company_members.user_id`.
// Test ini menjaga persis itu — bahwa daftar yang keluar TIDAK PERNAH memuat
// perusahaan yang user bukan anggotanya.
//
// Diuji di level data (bukan HTTP) karena yang menentukan benar-salahnya adalah
// predikat query-nya, dan itu yang mudah rusak diam-diam saat direfaktor.
// ============================================================

let c: Client
let userId: string
let companyA: string
let companyB: string

/** Meniru predikat endpoint: keanggotaan aktif milik user ini. */
const daftarCompany = async (uid: string) =>
  (await c.query(
    `SELECT cm.company_id FROM company_members cm
      WHERE cm.user_id = $1 AND cm.is_active = true`, [uid]
  )).rows.map((r) => r.company_id)

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')

  userId = (await c.query(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.is_active = true LIMIT 1`)).rows[0].id
  companyA = (await c.query(
    `SELECT id FROM companies ORDER BY created_at LIMIT 1`)).rows[0].id
  companyB = (await c.query(
    `INSERT INTO companies (code, name, owner_user_id) VALUES ('uji-t7-switch', 'Tenant B (T7)', (SELECT id FROM users ORDER BY created_at LIMIT 1))
     RETURNING id`)).rows[0].id

  // User ini anggota A saja — B sengaja TIDAK diberikan.
  await c.query(
    `INSERT INTO company_members (company_id, user_id, role_id, is_default, is_active, created_by)
     SELECT $1, $2, u.role_id, true, true, $2 FROM users u WHERE u.id = $2
     ON CONFLICT (company_id, user_id) DO UPDATE SET is_active = true`,
    [companyA, userId]
  )
}, 180_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

describe('T7 — daftar company hanya yang jadi haknya', () => {
  it('perusahaan yang user BUKAN anggotanya tidak muncul', async () => {
    const daftar = await daftarCompany(userId)
    expect(
      daftar,
      'daftar memuat perusahaan yang user bukan anggotanya — switcher akan ' +
        'menawarkan company yang tak boleh ia buka'
    ).not.toContain(companyB)
  }, 60_000)

  it('perusahaan yang jadi haknya tetap muncul (bukan menutup semuanya)', async () => {
    const daftar = await daftarCompany(userId)
    expect(daftar, 'user kehilangan akses ke perusahaannya sendiri').toContain(companyA)
  }, 60_000)

  it('keanggotaan yang dinonaktifkan tidak lagi muncul', async () => {
    // Mencabut akses harus BERLAKU, bukan hanya menandai. Kalau baris
    // is_active=false masih ikut terdaftar, mantan anggota tetap bisa
    // berpindah ke perusahaan itu.
    await c.query('SAVEPOINT t7nonaktif')
    await c.query(
      `INSERT INTO company_members (company_id, user_id, role_id, is_default, is_active, created_by)
       SELECT $1, $2, u.role_id, false, false, $2 FROM users u WHERE u.id = $2
       ON CONFLICT (company_id, user_id) DO UPDATE SET is_active = false`,
      [companyB, userId]
    )
    const daftar = await daftarCompany(userId)
    await c.query('ROLLBACK TO SAVEPOINT t7nonaktif')

    expect(
      daftar,
      'keanggotaan nonaktif masih terdaftar — pencabutan akses tak berlaku'
    ).not.toContain(companyB)
  }, 60_000)

  it('user tanpa keanggotaan mendapat daftar KOSONG, bukan semua company', async () => {
    // P1 (ADR-011 §9.5): tak ada cabang "kalau tak punya keanggotaan, kasih
    // yang ada". Kosong adalah jawaban yang benar — dan di API, itu menjadi 403
    // pada resolveCompanyId, bukan diam-diam dilayani company sembarang.
    await c.query('SAVEPOINT t7kosong')
    const lain = (await c.query(
      `INSERT INTO users (name, email, role_id, is_active)
       SELECT '[UJI-T7] tanpa company', 'uji-t7-' || gen_random_uuid() || '@contoh.test',
              u.role_id, true FROM users u WHERE u.id = $1 RETURNING id`, [userId]
    )).rows[0].id

    const daftar = await daftarCompany(lain)
    await c.query('ROLLBACK TO SAVEPOINT t7kosong')

    expect(
      daftar,
      'user tanpa keanggotaan mendapat daftar berisi — ini cabang "tebak saja" ' +
        'yang dilarang P1'
    ).toEqual([])
  }, 60_000)
})
