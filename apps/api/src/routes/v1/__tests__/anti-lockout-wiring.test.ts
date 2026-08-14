import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole, wajibAda } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import rolesRoutes from '../roles.js'
// `CRITICAL_PERMISSIONS` di `lib/` (keputusan murni), sementara
// `assertNoCriticalLockout` di `utils/` (yang menyentuh DB). Test ini sengaja
// membaca daftarnya dari sumber yang sama dengan produksi — bukan menyalinnya —
// supaya penambahan permission kritikal ikut terjaga tanpa menyunting berkas ini.
import { CRITICAL_PERMISSIONS } from '../../../lib/role-guard.js'

// ============================================================================
// F1-7 — ANTI-SELF-LOCKOUT: WIRING-nya, bukan logikanya.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA TEST INI ADA, PADAHAL LOCKOUT SUDAH PUNYA TEST
// ══════════════════════════════════════════════════════════════════════════
//
// `lib/__tests__/role-guard.test.ts` sudah menguji `findLockout()` dengan baik —
// 7 kasus, termasuk yang halus ("role lain punya permission TAPI nol user aktif
// = bukan pemegang efektif"). Tapi seluruhnya menguji **fungsi murni**.
//
// Yang TIDAK dibuktikan siapa pun: bahwa endpoint-nya benar-benar MEMANGGIL
// fungsi itu. Kalau `assertNoCriticalLockout` terhapus saat refactor —
// tercabut bersama import yang "tak terpakai", misalnya — seluruh 7 test itu
// tetap HIJAU, dan sistem kehilangan penjaganya tanpa satu pun gejala.
//
// Ini kelas cacat yang sama dengan yang ditemukan berulang di repo ini: logika
// benar, wiring-nya putus, dan test yang ada tak menjangkau sambungannya.
//
// ── Kenapa lockout layak dijaga sekeras ini
//
// Skenarionya bukan kehilangan data melainkan **kehilangan kendali**: mencabut
// `users:roles:manage` dari pemegang aktif terakhir membuat tak seorang pun
// bisa mengembalikannya lewat UI. Perbaikannya hanya lewat SQL langsung ke
// produksi — persis jenis operasi yang seluruh sistem ini berusaha hindari.
//
// ── Yang diuji
//
//   1. PUT /roles/:id/permissions yang MENCABUT permission kritikal dari
//      pemegang terakhir → 409, dan permission itu MASIH ADA sesudahnya
//      (bukan sekadar balasan 409 sementara datanya sudah terlanjur berubah).
//   2. DELETE /roles/:id atas pemegang terakhir → 409.
//   3. Kontrol positif: perubahan yang TIDAK menyentuh permission kritikal
//      tetap boleh — supaya penjaga tak menolak segalanya dan lolos uji ini
//      dengan cara yang salah.
//
// Yang di-stub HANYA verifikasi token (autentikasi), bukan otorisasi.
// ============================================================================

let client: Client
let app: FastifyInstance
let authAdmin: string

/** Permission kritikal yang dipakai sebagai bahan uji. */
const KRITIKAL = CRITICAL_PERMISSIONS[0]

let roleAdminId: string
let permKritikalId: string
let permBiasaId: string

const actAsAdmin = () =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: authAdmin } }, error: null } as never,
  )

const kirim = (method: 'PUT' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
  app.inject({ method, url, payload: payload as never, headers: { authorization: 'Bearer t' } })

/** Apakah role masih memegang permission ini? Dibaca dari DB, bukan dari balasan HTTP. */
const masihPunya = async (roleId: string, permId: string) =>
  (await client.query(
    `SELECT 1 FROM role_permissions WHERE role_id=$1 AND permission_id=$2`,
    [roleId, permId],
  )).rowCount === 1

beforeAll(async () => {
  client = await createRlsClient()
  authAdmin = wajibAda(await authIdForRole(client, 'admin'), "user ber-role 'admin' dengan auth_id")

  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(rolesRoutes as never)
  await app.ready()

  // Role `admin` dipakai apa adanya — ia memang pemegang permission kritikal,
  // dan itulah kondisi yang membuat lockout relevan. Membuat role tiruan tak
  // akan memicu penjaga, jadi ujinya lulus tanpa menguji apa pun.
  /*
    Baris `admin` yang BENAR-BENAR DIPAKAI, bukan "yang pertama ditemukan".

    Sejak migrasi 363-365 nama role tak lagi unik: ada baris template
    (`company_id NULL`) dan salinan per-tenant. `WHERE name='admin'` tanpa
    penentu mengembalikan keduanya, dan `rows[0]` bergantung pada urutan yang
    tak dijamin Postgres.

    Yang dipilih: baris yang punya PENGGUNA AKTIF — sebab itulah yang membuat
    lockout relevan. Mencabut izin dari baris yang tak dipakai siapa pun tak
    mengunci siapa pun, dan penjaganya memang tak seharusnya menahan.
  */
  roleAdminId = wajibAda(
    (await client.query(
      `SELECT r.id FROM roles r
        WHERE r.name = 'admin'
        ORDER BY (SELECT count(*) FROM users u WHERE u.role_id = r.id AND u.is_active) DESC
        LIMIT 1`,
    )).rows[0]?.id,
    "role 'admin' yang punya pengguna aktif",
  )
  permKritikalId = wajibAda(
    (await client.query(`SELECT id FROM permissions WHERE key=$1`, [KRITIKAL])).rows[0]?.id,
    `permission kritikal '${KRITIKAL}'`,
  )
  permBiasaId = wajibAda(
    (await client.query(
      `SELECT id FROM permissions WHERE key <> ALL($1::text[]) ORDER BY key LIMIT 1`,
      [CRITICAL_PERMISSIONS as unknown as string[]],
    )).rows[0]?.id,
    'permission non-kritikal',
  )

  // Prasyarat yang menentukan sahih-tidaknya seluruh berkas ini: `admin` harus
  // benar-benar PEMEGANG TERAKHIR permission kritikal itu. Kalau tidak,
  // penjaga memang tak seharusnya menolak, dan test di bawah akan lulus tanpa
  // membuktikan apa pun.
  const { rows: pemegang } = await client.query(
    `SELECT count(DISTINCT r.id)::int AS n
       FROM roles r
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE p.key = $1
        AND EXISTS (SELECT 1 FROM users u WHERE u.role_id = r.id AND u.is_active)`,
    [KRITIKAL],
  )
  if (pemegang[0].n !== 1) {
    throw new Error(
      `prasyarat gagal: '${KRITIKAL}' dipegang ${pemegang[0].n} role aktif, bukan 1. ` +
      `Uji lockout hanya bermakna saat ada pemegang TERAKHIR.`,
    )
  }
}, 120_000)

afterEach(() => { vi.restoreAllMocks() })

afterAll(async () => {
  /*
    IZIN ROLE ADMIN DIPULIHKAN — dan ini bukan kerapian.

    Test ini mengirim `PUT /roles/:id/permissions` dengan daftar berisi SATU
    izin. Kalau penjaga menahan (409), tak ada yang berubah — itu jalur yang
    diharapkan. Tetapi kalau penjaganya gagal, endpoint melakukan replace-all
    dan **217 izin admin benar-benar berganti jadi 1**.

    Itu persis yang terjadi 2026-08-14: `utils/role-guard.ts` menghitung
    pemegang per `role_id`, dan sejak role disalin per-tenant, salinan yang
    tak berpengguna terhitung sebagai "pemegang lain" — jadi penjaganya lolos.
    Setiap kali suite penuh berjalan, izin admin terkuras lagi.

    Gejalanya menyesatkan: berkas LAIN yang gagal ("prasyarat: dipegang 0 role
    aktif"), dan test ini sendiri terlihat cuma "skipped".

    Penjaga itu sudah diperbaiki (commit 224b373e). Pemulihan di sini adalah
    lapis KEDUA: test yang menguji perusakan tak boleh bergantung pada
    perbaikannya sendiri untuk tidak merusak. Kalau penjaganya rusak lagi,
    test-nya merah — tetapi datanya tetap utuh.
  */
  if (client && roleAdminId) {
    try {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, rp.permission_id
           FROM roles salinan
           JOIN role_permissions rp ON rp.role_id = salinan.id
          WHERE salinan.name = 'admin' AND salinan.id <> $1
         ON CONFLICT DO NOTHING`,
        [roleAdminId],
      )
    } catch { /* pemulihan best-effort; kegagalannya tak boleh menutup app */ }
  }
  await app?.close()
  await client?.end()
})

describe('F1-7 — wiring anti-lockout di endpoint (bukan hanya fungsinya)', () => {
  it('PUT permissions yang mencabut permission kritikal dari pemegang terakhir → 409', async () => {
    actAsAdmin()
    // Daftar baru sengaja TANPA permission kritikal → inilah pencabutannya.
    const r = await kirim('PUT', `/api/v1/roles/${roleAdminId}/permissions`, {
      permission_ids: [permBiasaId],
    })

    expect(r.statusCode, `WIRING PUTUS — endpoint membalas ${r.statusCode}, bukan 409. Body: ${r.body}`)
      .toBe(409)
    expect(r.body).toMatch(/pemegang aktif terakhir/i)
  }, 60_000)

  it('dan permission kritikal MASIH ADA sesudahnya (bukan sekadar balasan 409)', async () => {
    // Penjaga yang membalas 409 SETELAH data terlanjur berubah lebih berbahaya
    // daripada tak ada penjaga: ia meyakinkan pemanggil bahwa tak terjadi apa-apa.
    expect(await masihPunya(roleAdminId, permKritikalId),
      `409 dibalas TAPI permission '${KRITIKAL}' sudah tercabut — penolakannya terlambat`)
      .toBe(true)
  }, 60_000)

  it('DELETE role pemegang terakhir → 409', async () => {
    actAsAdmin()
    const r = await kirim('DELETE', `/api/v1/roles/${roleAdminId}`)
    // 409 (lockout) ATAU 400 (role bawaan tak boleh dihapus) — keduanya menolak.
    // Yang TIDAK boleh: 200/204. Role `admin` adalah builtin, jadi penjaga
    // pertama biasanya menang; keduanya sah selama hasilnya menolak.
    expect([400, 409], `role pemegang terakhir BISA DIHAPUS — membalas ${r.statusCode}. Body: ${r.body}`)
      .toContain(r.statusCode)
  }, 60_000)

  it('role admin masih ada sesudah percobaan hapus', async () => {
    const { rowCount } = await client.query(`SELECT 1 FROM roles WHERE id=$1`, [roleAdminId])
    expect(rowCount, 'role admin TERHAPUS — sistem kehilangan pemegang permission kritikal').toBe(1)
  }, 60_000)
})

describe('F1-7 — kontrol positif: penjaga tak menolak segalanya', () => {
  it('perubahan yang TETAP menyertakan permission kritikal TIDAK ditolak lockout', async () => {
    // Tanpa kasus ini, penjaga yang selalu membalas 409 akan lolos seluruh uji
    // di atas — dan menolak segalanya bukan keamanan, itu kerusakan.
    actAsAdmin()
    const { rows: semua } = await client.query(
      `SELECT permission_id FROM role_permissions WHERE role_id=$1`, [roleAdminId])
    const idsUtuh = semua.map((r) => r.permission_id as string)

    const r = await kirim('PUT', `/api/v1/roles/${roleAdminId}/permissions`, {
      permission_ids: idsUtuh,   // persis seperti semula → tak ada yang dicabut
    })
    expect(r.statusCode, `penjaga menolak perubahan yang SAH. Body: ${r.body}`).not.toBe(409)
  }, 60_000)

  it('permission role admin utuh setelah seluruh rangkaian uji', async () => {
    expect(await masihPunya(roleAdminId, permKritikalId)).toBe(true)
  }, 60_000)
})
