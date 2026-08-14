import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, wajibAda } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import rolesRoutes from '../roles.js'

// ─────────────────────────────────────────────────────────────────────────────
// PUT /roles/:id/permissions — REPLACE-ALL harus benar-benar MENGGANTI.
//
// KENAPA ADA
//
// Endpoint ini memakai pola replace-all: `DELETE` semua permission role, lalu
// `INSERT` daftar yang baru. Sampai 2026-08-01 hasil `DELETE` **tak diperiksa
// sama sekali** — kalau ia gagal sementara `INSERT` berhasil, role keluar
// dengan permission LAMA + BARU sekaligus.
//
// Itu bukan data rusak biasa. Ini endpoint yang justru dipakai untuk MENCABUT
// wewenang: orang yang baru saja dikurangi haknya akan tetap memilikinya,
// sementara layar menampilkan daftar barunya seolah berhasil. Tak ada error,
// tak ada log, tak ada gejala.
//
// YANG DIUJI (nyata, bukan mock): route asli + DB asli. Yang di-stub HANYA
// verifikasi token — itu autentikasi, bukan otorisasi.
//
// Test ini menjaga PERILAKUNYA (permission lama benar-benar hilang), bukan
// keberadaan satu baris `if (error)`. Kalau seseorang mengganti replace-all
// dengan pendekatan lain yang benar, test ini tetap hijau — itu memang yang
// diinginkan.
// ─────────────────────────────────────────────────────────────────────────────

let client: Client
let app: FastifyInstance
let authAdmin: string

/** Role uji coba yang dibuat & dibuang test ini sendiri. */
let roleUjiId: string | null = null
const NAMA_ROLE_UJI = 'zz_uji_replace_all'

function actAsAdmin() {
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue({
    data: { user: { id: authAdmin } }, error: null,
  } as never)
}

beforeAll(async () => {
  client = await createRlsClient()
  authAdmin = wajibAda(await authIdForRole(client, 'admin'), "user ber-role 'admin' dengan auth_id")

  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(rolesRoutes as never)
  await app.ready()

  // Role sendiri, supaya test tak pernah menyentuh role yang dipakai orang.
  // ⚠️ Dibuat lewat SQL langsung, bukan lewat API: yang diuji di sini adalah
  // PUT /permissions, dan menyiapkan fixture lewat endpoint lain membuat
  // kegagalan endpoint itu menyamar jadi kegagalan test ini.
  /*
    `ON CONFLICT (name)` TIDAK BISA dipakai lagi.

    Migrasi 363 membuang `UNIQUE (name)` global — nama role kini unik
    PER-COMPANY, dan penggantinya dua indeks PARSIAL:

        roles_template_name_uniq  ON roles (name)              WHERE company_id IS NULL
        roles_company_name_uniq   ON roles (company_id, name)  WHERE company_id IS NOT NULL

    `ON CONFLICT (name)` menuntut constraint yang persis menutup `(name)` tanpa
    syarat, dan itu sudah tak ada: Postgres membalas *"there is no unique or
    exclusion constraint matching the ON CONFLICT specification"*. Test gagal di
    `beforeAll`, seluruh isinya di-SKIP, dan berkasnya terlihat "tak menguji
    apa-apa" alih-alih merah.

    Role uji ini sengaja `company_id NULL` (ia menguji endpoint, bukan
    tenancy), jadi indeks yang berlaku baginya `roles_template_name_uniq` —
    disebut lewat predikatnya, bentuk yang diterima Postgres untuk indeks
    parsial.
  */
  const { rows } = await client.query(
    `INSERT INTO roles (name, label, description, is_builtin)
     VALUES ($1, 'Uji Replace-All', 'Role sementara milik test replace-all', false)
     ON CONFLICT (name) WHERE company_id IS NULL
       DO UPDATE SET description = EXCLUDED.description
     RETURNING id`,
    [NAMA_ROLE_UJI],
  )
  roleUjiId = rows[0].id
})

afterEach(() => { vi.restoreAllMocks() })

afterAll(async () => {
  if (roleUjiId) {
    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleUjiId])
    await client.query('DELETE FROM roles WHERE id = $1', [roleUjiId])
  }
  await app?.close()
  await client?.end()
})

/** Ambil id permission apa pun sejumlah `n` — isinya tak penting, jumlahnya iya. */
async function ambilPermissionIds(n: number): Promise<string[]> {
  const { rows } = await client.query('SELECT id FROM permissions ORDER BY key LIMIT $1', [n])
  if (rows.length < n) {
    throw new Error(
      `Prasyarat test tak terpenuhi: butuh ${n} permission di tabel \`permissions\`, ` +
      `hanya ada ${rows.length}. Seed RBAC belum jalan di database ini.`,
    )
  }
  return rows.map((r: { id: string }) => r.id)
}

async function permissionRole(roleId: string): Promise<string[]> {
  const { rows } = await client.query(
    'SELECT permission_id FROM role_permissions WHERE role_id = $1 ORDER BY permission_id',
    [roleId],
  )
  return rows.map((r: { permission_id: string }) => r.permission_id)
}

describe('PUT /roles/:id/permissions — replace-all benar-benar mengganti', () => {
  it('permission LAMA hilang, bukan bertumpuk dengan yang baru', async () => {
    const id = roleUjiId!
    const semua = await ambilPermissionIds(6)
    const lama = semua.slice(0, 3)
    const baru = semua.slice(3, 6)

    actAsAdmin()
    const r1 = await app.inject({
      method: 'PUT', url: `/api/v1/roles/${id}/permissions`,
      headers: { authorization: 'Bearer stub' },
      payload: { permission_ids: lama },
    })
    expect(r1.statusCode, r1.body).toBe(200)
    expect((await permissionRole(id)).sort()).toEqual([...lama].sort())

    actAsAdmin()
    const r2 = await app.inject({
      method: 'PUT', url: `/api/v1/roles/${id}/permissions`,
      headers: { authorization: 'Bearer stub' },
      payload: { permission_ids: baru },
    })
    expect(r2.statusCode, r2.body).toBe(200)

    const sesudah = await permissionRole(id)
    expect(
      sesudah.sort(),
      'permission LAMA masih menempel setelah diganti — role memegang wewenang ' +
      'yang sudah dicabut, dan layar menampilkan daftar barunya seolah berhasil',
    ).toEqual([...baru].sort())
    for (const p of lama) {
      if (baru.includes(p)) continue
      expect(sesudah, `permission ${p} seharusnya sudah dicabut`).not.toContain(p)
    }
  })

  it('daftar KOSONG mencabut semuanya — bukan diam-diam dilewati', async () => {
    // Mencabut seluruh permission adalah tindakan yang sah dan penting
    // (menonaktifkan role tanpa menghapusnya). Kalau daftar kosong membuat
    // endpoint melewati DELETE, role justru mempertahankan SELURUH wewenangnya
    // — kebalikan persis dari yang diminta.
    const id = roleUjiId!
    const isi = await ambilPermissionIds(2)

    actAsAdmin()
    await app.inject({
      method: 'PUT', url: `/api/v1/roles/${id}/permissions`,
      headers: { authorization: 'Bearer stub' },
      payload: { permission_ids: isi },
    })
    expect((await permissionRole(id)).length).toBe(2)

    actAsAdmin()
    const r = await app.inject({
      method: 'PUT', url: `/api/v1/roles/${id}/permissions`,
      headers: { authorization: 'Bearer stub' },
      payload: { permission_ids: [] },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(
      await permissionRole(id),
      'daftar kosong tak mencabut apa pun — role menonaktifkan tapi tetap berwenang penuh',
    ).toEqual([])
  })
})
