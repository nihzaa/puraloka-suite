import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyRequest, FastifyReply } from 'fastify'

// ============================================================
// Menguji `authenticate()` YANG SUNGGUHAN — bukan tiruan predikatnya.
//
// `t10-peran-per-company.test.ts` menguji query resolusi peran terhadap DB
// nyata, dan itu berharga. Tapi ia menulis ULANG query-nya di file test, jadi
// ketika `authenticate()` dikembalikan ke perilaku lama (`role: peranGlobal`)
// SELURUH suite tetap hijau — 403 test, nol yang merah. Uji mutasi yang
// membuktikannya adalah alasan file ini ada.
//
// Yang dijaga: baris tempat peran dipasang ke `request.currentUser`, karena
// nilai itulah yang diserahkan ke `get_role_permissions()` dan menentukan
// setiap `requirePermission` di sistem.
// ============================================================

const COMPANY_A = 'aaaaaaaa-0000-0000-0000-00000000000a'
const COMPANY_B = 'bbbbbbbb-0000-0000-0000-00000000000b'
const USER_ID = 'cccccccc-0000-0000-0000-00000000000c'
const AUTH_ID = 'dddddddd-0000-0000-0000-00000000000d'

/** Baris `users` — peran GLOBAL sengaja `mandor` (paling sedikit haknya). */
const barisUser = {
  id: USER_ID, auth_id: AUTH_ID, name: 'Uji', email: 'uji@contoh.test',
  phone: null, role_id: 'r-mandor', roles: { name: 'mandor' },
}

/** Keanggotaan: admin di company A, mandor di company B. */
let keanggotaan: Array<Record<string, unknown>> = []

vi.mock('../../utils/supabase.js', () => {
  const buatChain = (tabel: string) => {
    const chain: Record<string, unknown> = {}
    const kembali = () => chain
    chain.select = kembali
    chain.eq = kembali
    chain.single = async () =>
      tabel === 'users' ? { data: barisUser, error: null } : { data: null, error: null }
    // `company_members` di-await langsung (daftar), bukan `.single()`
    chain.then = (r: (v: unknown) => unknown) =>
      Promise.resolve({ data: keanggotaan, error: null }).then(r)
    return chain
  }
  return {
    supabase: { from: vi.fn((t: string) => buatChain(t)) },
    supabaseAuth: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: AUTH_ID } }, error: null })) },
    },
    // `authenticate()` merakit `request.db` dari klien ber-token pengguna
    // (T5c langkah 2). Mock modul mengganti SELURUH modul, jadi ekspor yang
    // tak disebut di sini akan melempar "No export is defined" — bukan
    // undefined yang lolos diam-diam.
    //
    // Dikembalikan sebagai penanda yang bisa dikenali, supaya test di bawah
    // bisa memastikan klien itu BENAR-BENAR diteruskan ke `createTenantDb` —
    // bukan sekadar tak melempar.
    klienUntukToken: vi.fn((token: string) => ({ _token: token })),
  }
})

vi.mock('../../utils/tenant-db.js', () => ({
  createTenantDb: vi.fn((cid: string, klien?: unknown) => ({ _company: cid, _klien: klien })),
}))

const { authenticate } = await import('../auth.js')

function buatRequest(companyDiminta?: string): FastifyRequest {
  return {
    headers: {
      authorization: 'Bearer token-uji',
      ...(companyDiminta ? { 'x-company-id': companyDiminta } : {}),
    },
    cookies: {},
  } as unknown as FastifyRequest
}

function buatReply(): FastifyReply & { _status?: number; _body?: unknown } {
  const r: Record<string, unknown> = {}
  r.status = (s: number) => { r._status = s; return r }
  r.send = (b: unknown) => { r._body = b; return r }
  return r as unknown as FastifyReply & { _status?: number; _body?: unknown }
}

beforeEach(() => {
  keanggotaan = [
    { company_id: COMPANY_A, is_default: true, role_id: 'r-admin', roles: { name: 'admin' } },
    { company_id: COMPANY_B, is_default: false, role_id: 'r-mandor', roles: { name: 'mandor' } },
  ]
})

describe('authenticate() — peran dari company aktif', () => {
  it('company bawaan: peran = peran DI COMPANY itu, bukan peran global', async () => {
    const req = buatRequest()
    await authenticate(req, buatReply())

    expect(req.companyId, 'company bawaan salah').toBe(COMPANY_A)
    expect(
      req.currentUser?.role,
      'peran diambil dari users.role_id (global) — user ditolak melakukan ' +
        'pekerjaan yang haknya di company ini, sementara RLS mengizinkan'
    ).toBe('admin')
  })

  it('berpindah company MENGUBAH peran (arah NAIK tertutup)', async () => {
    // Inti eskalasinya: kalau peran ikut global, user ini membawa 95 permission
    // admin ke company B tempat ia hanya mandor (11 permission).
    const req = buatRequest(COMPANY_B)
    await authenticate(req, buatReply())

    expect(req.companyId).toBe(COMPANY_B)
    expect(
      req.currentUser?.role,
      'peran dari company lain terbawa — kewenangan menyeberang antar tenant'
    ).toBe('mandor')
  })

  it('peran GLOBAL tidak sama dengan peran manapun yang diuji — prasyarat sahih', () => {
    // Tanpa penjaga ini, dua test di atas bisa lulus karena kebetulan cocok.
    expect(barisUser.roles.name).toBe('mandor')
    expect(keanggotaan[0].roles).toEqual({ name: 'admin' })
  })

  it('company yang bukan haknya ditolak 403, bukan diam-diam jatuh ke bawaan', async () => {
    const req = buatRequest('99999999-0000-0000-0000-000000000099')
    const rep = buatReply()
    await authenticate(req, rep)

    expect(rep._status, 'company asing dilayani — jalur eskalasi hak akses').toBe(403)
    expect(req.companyId, 'companyId terpasang padahal request ditolak').toBeUndefined()
  })

  it('tanpa keanggotaan → 403, peran global TIDAK dipakai sebagai jalan pintas', async () => {
    keanggotaan = []
    const req = buatRequest()
    const rep = buatReply()
    await authenticate(req, rep)

    expect(rep._status).toBe(403)
    expect(
      req.currentUser,
      'currentUser terpasang padahal user bukan anggota perusahaan manapun — ' +
        'handler di belakang guard akan membacanya sebagai user sah'
    ).toBeUndefined()
  })

  it('`request.db` ter-scope ke company yang sama dengan peran', async () => {
    // Dua-duanya turun dari `hasil` yang sama; test ini menjaga keduanya tak
    // terpisah saat direfaktor — db ke company A tapi peran dari company B
    // adalah kombinasi terburuk: data benar, kewenangan salah.
    const req = buatRequest(COMPANY_B)
    await authenticate(req, buatReply())

    expect((req.db as unknown as { _company: string })._company).toBe(COMPANY_B)
    expect(req.currentUser?.role).toBe('mandor')
  })

  it('`request.db` memakai klien ber-TOKEN PENGGUNA, bukan service_role', async () => {
    // T5c langkah 2. Tanpa ini, seluruh akses data lewat kunci service_role
    // yang `bypassrls` — 775 policy RLS terpasang tapi tak pernah dievaluasi,
    // dan isolasi antar-tenant bergantung sepenuhnya pada disiplin kode.
    //
    // Kegagalannya kalau jalur ini dilepas TIDAK terlihat: aplikasi tetap
    // jalan, test lain tetap hijau, dan yang hilang hanya lapis kedua yang
    // seharusnya menahan rute yang lupa memakai `request.db`.
    //
    // Yang diperiksa: klien yang sampai ke `createTenantDb` berasal dari
    // token permintaan ini — bukan klien modul, dan bukan token orang lain.
    const req = buatRequest(COMPANY_B)
    await authenticate(req, buatReply())

    const klien = (req.db as unknown as { _klien?: { _token?: string } })._klien
    expect(klien, 'createTenantDb dipanggil TANPA klien — request.db jatuh ke service_role').toBeDefined()
    expect(klien?._token).toBe('token-uji')
  })
})
