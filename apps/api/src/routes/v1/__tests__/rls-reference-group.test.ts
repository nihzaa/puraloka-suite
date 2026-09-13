import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient, asUser, authIdForRole, wajibAda } from '../../../test-utils/rls-harness.js'

// RLS verification for Epic 4 — has_permission() function + Reference group
// (material_categories, materials). Runs against the REAL public schema with
// role impersonation; every write is inside a rolled-back transaction.

let client: Client
let adminId: string | null
let pmId: string | null
let mandorId: string | null

beforeAll(async () => {
  client = await createRlsClient()
  adminId = await authIdForRole(client, 'admin')
  pmId = await authIdForRole(client, 'pm')
  mandorId = await authIdForRole(client, 'mandor')
})

afterAll(async () => {
  await client.end()
})

describe('has_permission() function', () => {
  it('returns true for a permission the role holds (admin → procurement:material:manage)', async () => {
    const r = await asUser(client, adminId, (c) =>
      c.query("SELECT has_permission('procurement:material:manage') AS ok")
    )
    expect(r.rows[0].ok).toBe(true)
  })

  it('is fail-closed for an unknown permission key', async () => {
    const r = await asUser(client, adminId, (c) =>
      c.query("SELECT has_permission('this:does:not:exist') AS ok")
    )
    expect(r.rows[0].ok).toBe(false)
  })

  it('returns false for a role that lacks the permission (mandor → procurement:material:manage)', async () => {
    wajibAda(mandorId, "user berperan mandor")
    const r = await asUser(client, mandorId, (c) =>
      c.query("SELECT has_permission('procurement:material:manage') AS ok")
    )
    expect(r.rows[0].ok).toBe(false)
  })
})

describe('RLS: materials write policies (has_permission-based, expand)', () => {
  const insertMaterial = (c: Client) =>
    c.query(
      `INSERT INTO materials (name, unit, category_id)
       VALUES ('__rls_test_material__', 'pcs',
         (SELECT id FROM material_categories LIMIT 1))
       RETURNING id`
    )

  it('allows admin to insert (has procurement:material:manage)', async () => {
    const r = await asUser(client, adminId, insertMaterial)
    expect(r.rows[0].id).toBeTruthy()
  })

  /*
    ⚠ JUDUL & ARAHNYA DIBALIK 2026-09-14 — dan yang salah TESTNYA, bukan RLS.

    Versi sebelumnya berbunyi "allows pm to insert" dan merah dengan:

        new row violates row-level security policy for table "materials"

    Galat itu terbaca seperti policy yang terlalu ketat. Diukur ke
    `role_permissions` sebelum menyentuh apa pun:

        pemegang procurement:material:manage :
          admin · direktur · estimator · procurement_officer

    `pm` TIDAK memegangnya — tidak di template, tidak di salinan tenant. Jadi
    RLS menolak dengan BENAR, dan testnya yang menuntut kebalikannya.

    Kelas yang sama persis dengan yang tercatat di kepala
    `authz-endpoints.test.ts`: "`allow` dan `deny` WAJIB dicocokkan ke tabel
    `role_permissions`, bukan ditebak dari nama jabatan."

    ⚠ Yang TIDAK ditempuh: memberi izin itu kepada `pm` supaya testnya hijau.
    Itu memperluas kewenangan nyata di seluruh tenant demi kehijauan test —
    keputusan produk lewat RATIFIKASI, bukan efek samping perbaikan test.

    Diganti jadi pemeriksaan yang BENAR-BENAR bermakna: `pm` peran senior yang
    tetap ditolak karena tak memegang izinnya. Itu bukti terkuat bahwa
    policy-nya berbasis IZIN, bukan jabatan — `mandor` di bawah bisa ditolak
    sekadar karena ia junior; `pm` tidak bisa.

    (estimator / procurement_officer belum punya akun uji ber-auth_id.
    Menambahkannya keputusan data uji tersendiri — siapkan-akun-uji-peran.mjs)
  */
  it('denies pm insert (pm TIDAK memegang procurement:material:manage)', async () => {
    wajibAda(pmId, "user berperan pm")
    await expect(asUser(client, pmId, insertMaterial)).rejects.toThrow(
      /row-level security|policy/i
    )
  })

  it('denies mandor insert (lacks procurement:material:manage)', async () => {
    wajibAda(mandorId, "user berperan mandor")
    await expect(asUser(client, mandorId, insertMaterial)).rejects.toThrow(
      /row-level security|policy/i
    )
  })

  it('denies anon insert', async () => {
    await expect(asUser(client, null, insertMaterial)).rejects.toThrow(
      /row-level security|policy|permission denied/i
    )
  })
})

describe('RLS: materials SELECT (open by design, USING(true))', () => {
  it('allows any authenticated user to read materials', async () => {
    const r = await asUser(client, mandorId ?? adminId, (c) =>
      c.query('SELECT count(*)::int AS n FROM materials')
    )
    expect(typeof r.rows[0].n).toBe('number')
  })
})
