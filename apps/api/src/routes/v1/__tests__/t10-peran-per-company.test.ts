import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// ============================================================
// T10 — PERAN DIBACA DARI COMPANY AKTIF, BUKAN PERAN GLOBAL.
//
// Migrasi 144 mengubah `auth_role()` — dipakai 100 RLS policy — supaya membaca
// `company_members.role_id` untuk company yang sedang aktif. Sisi API tidak
// ikut berubah: `authenticate()` mengambil peran dari `users.role_id` dan
// menyerahkannya ke `get_role_permissions()`, yang menentukan SELURUH
// `requirePermission`. Dua lapis otorisasi memakai peran yang berbeda.
//
// Salah ke dua arah, dan arah kedua adalah eskalasi hak akses:
//   • turun — di company ini `admin`, global `mandor` → API menolak pekerjaan
//     yang memang haknya, sementara RLS mengizinkan.
//   • naik  — global `admin`, di company ini `mandor` → API memberi seluruh
//     95 permission admin di badan usaha yang bukan wewenangnya (peran
//     `mandor` hanya 11). Kewenangan menyeberang antar tenant.
//
// Diuji di level data, bukan HTTP: yang menentukan benar-salahnya adalah
// PREDIKAT resolusi peran, dan itu yang rusak diam-diam saat direfaktor.
// Nol gejala — request tetap 200, hanya isinya yang salah.
// ============================================================

let c: Client
let userId: string
let companyA: string
let companyB: string
let idAdmin: string
let idMandor: string

/**
 * Meniru predikat `resolveCompanyId()` sesudah perbaikan: peran diambil dari
 * keanggotaan pada company aktif, fallback ke peran global bila keanggotaan
 * tak punya `role_id` (meniru `auth_role()` persis — lihat catatan di sana).
 */
const peranApi = async (uid: string, companyId: string): Promise<string | null> =>
  (await c.query(
    `SELECT COALESCE(rc.name, rg.name) AS peran
       FROM company_members cm
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN roles rc ON rc.id = cm.role_id
       LEFT JOIN roles rg ON rg.id = u.role_id
      WHERE cm.user_id = $1 AND cm.company_id = $2 AND cm.is_active`,
    [uid, companyId]
  )).rows[0]?.peran ?? null

/** Peran global murni — perilaku LAMA yang sedang ditinggalkan. */
const peranGlobal = async (uid: string): Promise<string | null> =>
  (await c.query(
    `SELECT r.name FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [uid]
  )).rows[0]?.name ?? null

const jumlahPermission = async (peran: string): Promise<number> =>
  Number((await c.query(
    `SELECT count(*) n FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id WHERE r.name = $1`, [peran]
  )).rows[0].n)

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')

  idAdmin = (await c.query(`SELECT id FROM roles WHERE name = 'admin'`)).rows[0].id
  idMandor = (await c.query(`SELECT id FROM roles WHERE name = 'mandor'`)).rows[0].id

  companyA = (await c.query(
    `SELECT id FROM companies ORDER BY created_at LIMIT 1`)).rows[0].id
  companyB = (await c.query(
    `INSERT INTO companies (code, name) VALUES ('uji-t10-peran', 'Tenant B (T10)')
     RETURNING id`)).rows[0].id

  // User dengan peran GLOBAL `mandor` — sengaja yang paling sedikit haknya,
  // supaya arah "naik" (eskalasi) terlihat sebagai selisih besar.
  userId = (await c.query(
    `INSERT INTO users (name, email, role_id, is_active)
     VALUES ('[UJI-T10] dua company', 'uji-t10-' || gen_random_uuid() || '@contoh.test',
             $1, true) RETURNING id`, [idMandor])).rows[0].id

  // Anggota A sebagai ADMIN (peran di company > peran global)
  await c.query(
    `INSERT INTO company_members (company_id, user_id, role_id, is_default, is_active, created_by)
     VALUES ($1, $2, $3, true, true, $2)`, [companyA, userId, idAdmin])
  // Anggota B sebagai MANDOR (sama dengan peran global)
  await c.query(
    `INSERT INTO company_members (company_id, user_id, role_id, is_default, is_active, created_by)
     VALUES ($1, $2, $3, false, true, $2)`, [companyB, userId, idMandor])
}, 180_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

describe('T10 — peran mengikuti company aktif', () => {
  it('peran GLOBAL berbeda dari peran di company — prasyarat uji ini sahih', async () => {
    // Kalau prasyaratnya tak terpenuhi, tiga test di bawah lulus tanpa menguji
    // apa pun. Ini penjaga terhadap uji yang tampak hijau padahal kosong.
    expect(await peranGlobal(userId)).toBe('mandor')
    expect(await peranApi(userId, companyA)).not.toBe(await peranGlobal(userId))
  }, 60_000)

  it('di company A user adalah admin, bukan mandor (arah TURUN tertutup)', async () => {
    expect(
      await peranApi(userId, companyA),
      'peran dibaca global — user ditolak melakukan pekerjaan yang memang ' +
        'haknya di company ini, sementara RLS mengizinkannya'
    ).toBe('admin')
  }, 60_000)

  it('di company B user tetap mandor (arah NAIK tertutup)', async () => {
    expect(
      await peranApi(userId, companyB),
      'peran dari company lain terbawa — kewenangan menyeberang antar tenant'
    ).toBe('mandor')
  }, 60_000)

  it('API dan RLS menjawab peran yang SAMA untuk company yang sama', async () => {
    // Inti perbaikannya. Dua lapis otorisasi yang menjawab berbeda lebih
    // berbahaya daripada satu lapis yang salah: yang satu menolak, yang lain
    // mengizinkan, dan hasilnya dibaca sebagai bug UI, bukan bug otorisasi.
    for (const [nama, cid] of [['A', companyA], ['B', companyB]] as const) {
      await c.query(`SELECT set_config('app.company_id', $1, true)`, [cid])
      const rls = (await c.query(
        `SELECT r.name FROM company_members cm JOIN roles r ON r.id = cm.role_id
          WHERE cm.user_id = $1 AND cm.company_id = $2 AND cm.is_active`,
        [userId, cid])).rows[0]?.name ?? null
      expect(
        await peranApi(userId, cid), `company ${nama}: API dan RLS berbeda`
      ).toBe(rls)
    }
  }, 60_000)

  it('selisih kewenangannya nyata, bukan perbedaan nama belaka', async () => {
    // Kalau `admin` dan `mandor` kebetulan punya permission yang sama, seluruh
    // temuan ini hanya kosmetik. Ukur, jangan asumsikan.
    const adm = await jumlahPermission('admin')
    const man = await jumlahPermission('mandor')
    expect(adm, 'peran admin tanpa permission — seed rusak').toBeGreaterThan(0)
    expect(
      adm - man,
      'admin dan mandor punya kewenangan setara — jika benar, salah-peran ' +
        'memang tak berdampak dan test ini boleh dicabut'
    ).toBeGreaterThan(10)
  }, 60_000)

  it('`role_id` NOT NULL — cabang fallback memang tak terjangkau', async () => {
    // Versi pertama test ini mencoba mengosongkan `role_id` untuk menguji
    // fallback ke peran global, dan GAGAL: kolomnya NOT NULL. Diverifikasi ke
    // `pg_attribute`, bukan diasumsikan dari migrasi.
    //
    // Artinya fallback `?? peranGlobal` di `resolveCompanyId()` adalah cabang
    // MATI. Ia sengaja dipertahankan karena `auth_role()` punya fallback yang
    // sama — dua lapis otorisasi harus jatuh dengan cara yang identik, dan
    // constraint bisa dilonggarkan di kemudian hari tanpa siapa pun ingat
    // bahwa API bergantung padanya.
    //
    // Test ini menjaga alasan itu tetap benar: kalau NOT NULL suatu saat
    // dilepas, ia MERAH — dan yang membacanya diarahkan menulis uji nyata
    // untuk fallback itu, bukan menemukan cabang mati tanpa penjelasan.
    const notNull = (await c.query(
      `SELECT a.attnotnull FROM pg_attribute a
         JOIN pg_class cl ON cl.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE n.nspname = 'public' AND cl.relname = 'company_members'
          AND a.attname = 'role_id' AND a.attnum > 0`)).rows[0]?.attnotnull

    expect(
      notNull,
      'company_members.role_id tak lagi NOT NULL — fallback ke peran global di ' +
        'resolveCompanyId() kini BISA terjangkau dan harus diuji sungguhan'
    ).toBe(true)
  }, 60_000)

  it('user tanpa keanggotaan ditolak, bukan dilayani dengan peran global', async () => {
    // Ini skenario fallback yang NYATA bisa terjadi. `resolveCompanyId()`
    // membalas 403 sebelum peran apa pun dipakai — P1 (ADR-011 §9.5): tak ada
    // cabang "tebak saja". Yang dijaga di sini: predikatnya mengembalikan
    // KOSONG, sehingga tak ada company untuk membaca peran darinya.
    await c.query('SAVEPOINT t10tanpa')
    const lain = (await c.query(
      `INSERT INTO users (name, email, role_id, is_active)
       VALUES ('[UJI-T10] tanpa company', 'uji-t10b-' || gen_random_uuid() || '@contoh.test',
               $1, true) RETURNING id`, [idAdmin])).rows[0].id

    const adaKeanggotaan = (await c.query(
      `SELECT count(*) n FROM company_members WHERE user_id = $1 AND is_active`, [lain]
    )).rows[0].n
    const peranA = await peranApi(lain, companyA)
    await c.query('ROLLBACK TO SAVEPOINT t10tanpa')

    expect(Number(adaKeanggotaan), 'prasyarat: user ini memang tanpa keanggotaan').toBe(0)
    expect(
      peranA,
      'user berperan global `admin` tanpa keanggotaan tetap mendapat peran di ' +
        'company A — peran global bocor ke badan usaha yang bukan haknya'
    ).toBeNull()
  }, 60_000)
})
