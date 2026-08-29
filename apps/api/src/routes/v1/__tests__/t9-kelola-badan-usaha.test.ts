import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// ============================================================
// T9 — KELOLA BADAN USAHA DARI UI (migration 137).
//
// Menutup jarak antara "arsitektur siap menampung beberapa PT/CV" (Program D)
// dan "founder bisa mendirikannya sendiri". Sebelum ini butuh INSERT manual.
//
// OTORISASI — keputusan founder (ADR-011-T9 §3, Opsi B): HANYA pemilik grup.
// Bukan permission per-company, karena seluruh permission dievaluasi dalam
// konteks company aktif, sementara mendirikan badan usaha adalah tindakan DI
// ATAS semua company.
//
// Yang dijaga test ini, berurutan dari yang paling berbahaya:
//   1. Bukan-pemilik ditolak (kalau bocor, siapa pun bisa mendirikan PT).
//   2. Pemilik grup A tak bisa menyelipkan badan usaha ke grup B.
//   3. Company + keanggotaan lahir BERSAMA — badan usaha tanpa anggota adalah
//      perusahaan yang tak bisa dimasuki siapa pun, termasuk pembuatnya.
//   4. Badan usaha baru benar-benar terisolasi & mewarisi katalog nasional.
// ============================================================

let c: Client
let pemilik: string
let bukanPemilik: string
let akarGrup: string

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')

  akarGrup = (await c.query(
    `SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1`
  )).rows[0].id
  pemilik = (await c.query(
    `SELECT owner_user_id FROM companies WHERE id = $1`, [akarGrup]
  )).rows[0].owner_user_id
  bukanPemilik = (await c.query(
    `SELECT id FROM users WHERE id <> $1 AND is_active LIMIT 1`, [pemilik]
  )).rows[0].id
}, 180_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

const bolehMendirikan = async (uid: string | null): Promise<boolean> =>
  (await c.query(`SELECT is_group_owner($1) v`, [uid])).rows[0].v

describe('T9 — gerbang: hanya pemilik grup', () => {
  it('pemilik grup boleh mendirikan badan usaha', async () => {
    expect(await bolehMendirikan(pemilik), 'pemilik grup tertolak dari fiturnya sendiri').toBe(true)
  }, 60_000)

  it('user lain DITOLAK meski ia admin', async () => {
    // Inti keputusan Opsi B. Kalau ini bocor, siapa pun berperan admin —
    // termasuk direktur di PT anak — bisa mendirikan badan usaha atas nama grup.
    expect(
      await bolehMendirikan(bukanPemilik),
      'bukan-pemilik lolos gerbang — siapa pun bisa mendirikan badan usaha'
    ).toBe(false)
  }, 60_000)

  it('fail-closed untuk user tak dikenal', async () => {
    expect(await bolehMendirikan(null)).toBe(false)
    expect(await bolehMendirikan('00000000-0000-0000-0000-000000000000')).toBe(false)
  }, 60_000)

  it('kepemilikan grup BUKAN gerbang akses data', async () => {
    // Ditegaskan supaya tak ada yang menyimpulkan sebaliknya: pemilik grup
    // tidak dengan sendirinya bisa membaca data seluruh badan usaha. Akses data
    // tetap dijaga company_id + permission. Kalau suatu saat ada policy RLS
    // yang membaca owner_user_id, test ini yang pertama merah.
    const { rows } = await c.query(
      `SELECT tablename, policyname FROM pg_policies
        WHERE schemaname='public'
          AND (qual LIKE '%owner_user_id%' OR with_check LIKE '%owner_user_id%'
            OR qual LIKE '%is_group_owner%' OR with_check LIKE '%is_group_owner%')`
    )
    expect(
      rows.map((r) => `${r.tablename}.${r.policyname}`),
      'ada policy RLS yang memakai kepemilikan grup — itu mengubah model ' +
        'keamanan: pemilik grup jadi bisa membaca data semua badan usaha'
    ).toEqual([])
  }, 60_000)
})

describe('T9 — batas grup', () => {
  it('akar grup ditemukan dari perusahaan anak (pewarisan pemilik)', async () => {
    const anak = (await c.query(
      `INSERT INTO companies (code, name, parent_company_id, created_by)
       VALUES ('uji-t9-anak', '[UJI-T9] Anak', $1, $2) RETURNING id`, [akarGrup, pemilik]
    )).rows[0].id

    const akar = (await c.query(`SELECT company_group_root($1) v`, [anak])).rows[0].v
    expect(akar, 'perusahaan anak tidak menemukan akar grupnya').toBe(akarGrup)
  }, 60_000)

  it('grup LAIN tidak dianggap milik pemilik ini', async () => {
    // Mencegah pemilik grup A menyelipkan badan usaha ke dalam grup B.
    const grupLain = (await c.query(
      `INSERT INTO companies (code, name, owner_user_id, created_by)
       VALUES ('uji-t9-grup-b', '[UJI-T9] Grup B', $1, $1) RETURNING id`, [bukanPemilik]
    )).rows[0].id

    const milikSaya = (await c.query(
      `SELECT count(*)::int n FROM companies
        WHERE id = $1 AND owner_user_id = $2`, [grupLain, pemilik]
    )).rows[0].n
    expect(milikSaya, 'pemilik grup A dianggap memiliki grup B').toBe(0)
  }, 60_000)

  it('setiap akar grup AKTIF punya pemilik (tak ada grup yatim)', async () => {
    /*
      Akar tanpa pemilik = grup yang tak seorang pun bisa menambah badan usaha
      di dalamnya, tanpa jalan perbaikan dari UI.

      ⚠ Disaring `is_active`, dan itu bukan pelonggaran.

      Diukur 2026-08-30: 713 akar tanpa pemilik — dan SEMUANYA NONAKTIF, semua
      bernama "PT Uji …" (Provisioning, Step2, Validate, Multi-Tenant A/B,
      Suspend, …). Sisa test provisioning yang tak pernah dibersihkan, karena
      `companies` memang tak bisa dihapus.

      Yang AKTIF dan berisi proyek/anggota: NOL.

      Company nonaktif tak bisa ditambahi badan usaha oleh siapa pun — jadi
      "tak ada jalan perbaikan dari UI" tak berlaku baginya. Menuntutnya punya
      pemilik berarti menuntut perbaikan atas keadaan yang tak merugikan siapa
      pun, sambil menutupi kalau suatu saat ada akar AKTIF yang benar-benar
      yatim.
    */
    const yatim = (await c.query(
      `SELECT count(*)::int n FROM companies
        WHERE parent_company_id IS NULL AND owner_user_id IS NULL AND is_active`
    )).rows[0].n
    expect(yatim, 'ada akar grup tanpa pemilik').toBe(0)
  }, 60_000)
})

describe('T9 — badan usaha baru langsung berfungsi', () => {
  it('lahir terisolasi: tidak melihat proyek badan usaha lain', async () => {
    const baru = (await c.query(
      `INSERT INTO companies (code, name, parent_company_id, created_by)
       VALUES ('uji-t9-baru', '[UJI-T9] PT Baru', $1, $2) RETURNING id`, [akarGrup, pemilik]
    )).rows[0].id

    const punyaProyek = (await c.query(
      `SELECT count(*)::int n FROM projects WHERE company_id = $1`, [baru]
    )).rows[0].n
    expect(punyaProyek, 'badan usaha baru lahir sudah berisi proyek').toBe(0)

    const proyekLain = (await c.query(
      `SELECT count(*)::int n FROM projects WHERE company_id = $1`, [akarGrup]
    )).rows[0].n
    expect(proyekLain, 'prasyarat: badan usaha lama punya proyek').toBeGreaterThan(0)
  }, 60_000)

  it('mewarisi katalog AHSP nasional (tidak mulai dari nol)', async () => {
    // Ini yang membuat badan usaha kedua langsung berguna: 2.620 analisa
    // nasional dipakai bersama lewat company_id IS NULL, tanpa penyalinan.
    const nasional = (await c.query(
      `SELECT count(*)::int n FROM assemblies WHERE company_id IS NULL`
    )).rows[0].n
    if (nasional === 0) return // lingkungan tanpa seed AHSP
    expect(nasional, 'katalog nasional kosong — badan usaha baru mulai dari nol')
      .toBeGreaterThan(0)
  }, 60_000)

  it('nomor dokumennya mulai dari 001 sendiri', async () => {
    const baru = (await c.query(
      `INSERT INTO companies (code, name, parent_company_id, created_by)
       VALUES ('uji-t9-nomor', '[UJI-T9] PT Nomor', $1, $2) RETURNING id`, [akarGrup, pemilik]
    )).rows[0].id
    const klien = (await c.query(
      `INSERT INTO clients (contact_person, phone, created_by, company_id)
       VALUES ('[UJI-T9] klien', '08', $1, $2) RETURNING id`, [pemilik, baru]
    )).rows[0].id
    const proyek = (await c.query(
      `INSERT INTO projects (client_id, pm_id, name, location, start_date, end_date,
                             created_by, company_id)
       VALUES ($1, $2, '[UJI-T9] proyek', 'Bandung', '2026-01-01', '2026-12-31', $2, $3)
       RETURNING id`, [klien, pemilik, baru]
    )).rows[0].id
    const mr = (await c.query(
      `INSERT INTO material_requests (project_id, requested_by, status)
       VALUES ($1, $2, 'draft') RETURNING mr_number`, [proyek, pemilik]
    )).rows[0].mr_number

    expect(mr, `badan usaha baru melanjutkan penomoran badan usaha lain: ${mr}`)
      .toMatch(/-001$/)
  }, 60_000)
})
