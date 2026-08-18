import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import companiesRoutes from '../companies.js'

// ============================================================================
// F1-8 — OTORISASI `companies.ts`, PINTU MASUK MULTI-TENANT.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA TEST INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `companies.ts` punya **coverage NOL** (COVERAGE-BASELINE.md), padahal ia
// endpoint yang mendirikan badan usaha dan mengatur keanggotaannya — pintu
// masuk seluruh model multi-tenant.
//
// Founder menetapkannya sebagai **gerbang Fase 1**: Fase 2 (sapuan tenancy 80
// tabel) tidak boleh dimulai selama pintu masuknya sendiri tak teruji.
//
// ── Kenapa gerbangnya BUKAN `requirePermission`
//
// Seluruh permission dievaluasi dalam konteks company aktif, sementara
// mendirikan badan usaha adalah tindakan **DI ATAS** semua company. Karena itu
// ADR-011-T9 §3 (Opsi B) memilih gerbang lain: `is_group_owner()`.
//
// Konsekuensinya penting untuk test ini: `authz-endpoints.test.ts` — yang
// menguji wiring `requirePermission` — **tidak menjangkau berkas ini sama
// sekali**. Jadi bukan sekadar "belum diuji", melainkan "tak mungkin terjaga
// oleh test yang ada".
//
// ── Dua lapis yang diuji, dan kenapa keduanya perlu
//
//   1. **Gerbang pemilik grup** — bukan-pemilik ditolak 403. Kalau bocor,
//      siapa pun yang bisa login dapat mendirikan PT atas nama grup orang lain.
//
//   2. **Isolasi lintas-grup** — pemilik grup A tak boleh menyentuh badan usaha
//      grup B. Ini yang paling berbahaya: lolos lapis 1 (ia memang pemilik
//      *suatu* grup) tetapi menyentuh milik grup lain. Endpoint anggota
//      (`/members`) adalah tempat kebocoran ini paling mungkin terjadi, karena
//      ID company datang dari URL — masukan pemanggil.
//
// ── Yang di-stub: HANYA verifikasi token
//
// `supabaseAuth.auth.getUser` di-stub karena itu **autentikasi**, bukan
// otorisasi — login nyata butuh password. Sisanya asli: modul route asli,
// `is_group_owner()` asli di DB, tabel `users`/`companies` asli. Pola dan
// alasannya sama dengan `authz-endpoints.test.ts`.
//
// ── Kenapa transaksi + ROLLBACK
//
// Test ini MEMBUAT company & user uji di schema `public` bersama. Tanpa
// transaksi, sisanya terlihat oleh shard lain di CI dan memicu kelas cacat yang
// empat kali merahkan CI (F0-14, F0-16, iso-test-b, purge terlalu luas).
// `app.inject` di sini aman dibungkus transaksi karena seluruh assertion-nya
// tentang STATUS OTORISASI (401/403), yang diputuskan sebelum data dibaca.
// ============================================================================

let app: FastifyInstance
let c: Client

let authPemilik: string       // auth_id pemilik grup akar
let authBukanPemilik: string  // auth_id user aktif yang BUKAN pemilik grup mana pun
let companyGrupLain: string   // company akar milik grup LAIN

const UUID_TAK_ADA = '00000000-0000-0000-0000-000000000000'

const actAs = (authId: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: authId } }, error: null } as never,
  )

const kirim = (
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: Record<string, unknown>,
) =>
  app.inject({ method, url, payload: payload as never, headers: { authorization: 'Bearer t' } })

beforeAll(async () => {
  app = Fastify({ logger: false })
  await app.register((await import('@fastify/cookie')).default)
  await app.register(companiesRoutes)
  await app.ready()

  c = await createRlsClient()
  await c.query('BEGIN')

  // Pemilik grup akar yang sudah ada — inilah "yang berhak".
  const { rows: akar } = await c.query(
    `SELECT co.id, co.owner_user_id, u.auth_id
       FROM companies co JOIN users u ON u.id = co.owner_user_id
      WHERE co.parent_company_id IS NULL AND u.auth_id IS NOT NULL
      ORDER BY co.created_at LIMIT 1`)
  if (!akar[0]) throw new Error('prasyarat gagal: tak ada grup akar ber-pemilik')
  authPemilik = akar[0].auth_id

  // User aktif yang BUKAN pemilik grup mana pun — inilah "yang tak berhak".
  // Sengaja dicari yang benar-benar ada, bukan dibuat: user buatan bisa
  // kebetulan lolos gerbang karena jalur seed yang tak terduga.
  const { rows: bukan } = await c.query(
    `SELECT u.auth_id FROM users u
      WHERE u.is_active AND u.auth_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM companies co WHERE co.owner_user_id = u.id)
      LIMIT 1`)
  if (!bukan[0]) throw new Error('prasyarat gagal: tak ada user non-pemilik ber-auth_id')
  authBukanPemilik = bukan[0].auth_id

  // Grup LAIN: akar kedua dengan pemilik berbeda. Dibuat di dalam transaksi
  // yang di-ROLLBACK, jadi tak pernah terlihat sesi/shard lain.
  const { rows: lain } = await c.query(
    `INSERT INTO companies (code, name, owner_user_id, created_by)
     VALUES ('uji-f18-grup-lain', '[UJI-F1-8] Grup Lain',
             (SELECT u.id FROM users u WHERE u.auth_id = $1),
             (SELECT u.id FROM users u WHERE u.auth_id = $1))
     RETURNING id`, [authBukanPemilik])
  companyGrupLain = lain[0].id
}, 120_000)

afterEach(() => { vi.restoreAllMocks() })

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await app?.close()
  await c?.end()
})

describe('F1-8 — gerbang pemilik grup (lapis 1)', () => {
  // Empat endpoint yang MENGUBAH keadaan atau membocorkan daftar. Kalau salah
  // satu preHandler-nya terhapus saat refactor, tak ada lagi yang menahannya.
  const TERLINDUNGI: Array<[string, 'GET' | 'POST' | 'PATCH', string, Record<string, unknown>?]> = [
    // Payload sengaja TAK SAH juga di sini. Kalau gerbangnya bocor, endpoint
    // berhenti di validasi 400 — test tetap MERAH (400 ≠ 403), tapi tanpa
    // meninggalkan badan usaha nyata di dev. Uji keamanan tak boleh butuh
    // pembersihan agar aman.
    ['dirikan badan usaha', 'POST', '/api/v1/companies', { name: '' }],
    ['daftar badan usaha', 'GET', '/api/v1/companies'],
    ['lihat anggota', 'GET', `/api/v1/companies/${UUID_TAK_ADA}/members`],
    ['tambah anggota', 'POST', `/api/v1/companies/${UUID_TAK_ADA}/members`, { user_id: UUID_TAK_ADA }],
  ]

  it.each(TERLINDUNGI)('bukan-pemilik DITOLAK 403: %s', async (_nama, method, url, payload) => {
    actAs(authBukanPemilik)
    const r = await kirim(method, url, payload)
    expect(r.statusCode, `BOCOR — ${method} ${url} membalas ${r.statusCode}, bukan 403. Body: ${r.body}`)
      .toBe(403)
  }, 30_000)

  // Sisi sebaliknya: gerbang tak boleh menolak orang yang BERHAK.
  //
  // Hanya dua endpoint yang diuji di sini, dan itu disengaja. Endpoint
  // `/companies/:id/members` memakai id dari URL, jadi UUID yang tak ada
  // membuatnya membalas 403 "bukan bagian dari grup Anda" — **benar**, itu
  // lapis 2 yang bekerja, bukan gerbang yang salah. Memasukkannya ke daftar ini
  // akan menuntut "bukan 403" pada endpoint yang memang seharusnya 403, dan
  // satu-satunya cara menghijaukannya adalah melemahkan isolasi lintas-grup.
  //
  // (Ketahuan saat test ini pertama dijalankan — asersinya yang salah, bukan
  // kodenya. Dicatat supaya tak ada yang "memperbaiki" ke arah yang keliru.)
  // ⚠️ Payload sengaja TIDAK SAH (nama kosong) supaya endpoint berhenti di
  // validasi 400 — SETELAH gerbang lolos, SEBELUM apa pun tertulis.
  //
  // Versi pertama memakai payload sah, dan `POST /companies` benar-benar
  // MENDIRIKAN badan usaha '[UJI] PT Bocor'. Transaksi + ROLLBACK di beforeAll
  // tak menolong: `app.inject` menempuh koneksi Fastify sendiri, di luar
  // transaksi test. Company itu bertahan di dev dan langsung merahkan
  // `submittal-aturan` ("ada company tanpa rantai submittal") — cacat yang
  // gejalanya muncul di berkas lain, jenis paling lama didiagnosis.
  //
  // Pelajarannya: test yang menembus HTTP tak bisa mengandalkan ROLLBACK.
  // Ia harus dirancang agar TIDAK PERNAH menulis sejak awal.
  const LOLOS_GERBANG: Array<[string, 'GET' | 'POST', string, Record<string, unknown>?]> = [
    ['daftar badan usaha', 'GET', '/api/v1/companies'],
    ['dirikan badan usaha (payload sengaja tak sah)', 'POST', '/api/v1/companies', { name: '' }],
  ]

  it.each(LOLOS_GERBANG)('pemilik grup TIDAK ditolak gerbang: %s', async (_nama, method, url, payload) => {
    // Sengaja "bukan 403", bukan "200": yang diuji gerbangnya lolos — bukan
    // bisnisnya. 400 karena payload tak sah justru hasil yang diharapkan.
    actAs(authPemilik)
    const r = await kirim(method, url, payload)
    expect(r.statusCode, `gerbang menolak PEMILIK — ${method} ${url}. Body: ${r.body}`)
      .not.toBe(403)
  }, 30_000)
})

describe('F1-8 — isolasi lintas-grup (lapis 2, paling berbahaya)', () => {
  // Lolos lapis 1 (ia memang pemilik SUATU grup) tetapi menyentuh grup LAIN.
  // ID company datang dari URL — masukan pemanggil — jadi inilah tempat
  // kebocoran paling mungkin terjadi.
  it('pemilik grup A tak bisa melihat anggota badan usaha grup B', async () => {
    actAs(authPemilik)
    const r = await kirim('GET', `/api/v1/companies/${companyGrupLain}/members`)
    expect(r.statusCode, `BOCOR LINTAS GRUP — membalas ${r.statusCode}. Body: ${r.body}`).toBe(403)
    expect(r.body).toMatch(/bukan bagian dari grup Anda/i)
  }, 30_000)

  it('pemilik grup A tak bisa menambah anggota ke badan usaha grup B', async () => {
    actAs(authPemilik)
    const r = await kirim('POST', `/api/v1/companies/${companyGrupLain}/members`, {
      user_id: UUID_TAK_ADA,
    })
    expect(r.statusCode, `BOCOR LINTAS GRUP (tulis) — membalas ${r.statusCode}. Body: ${r.body}`).toBe(403)
  }, 30_000)

  it('pemilik grup A tak bisa mengubah peran anggota di grup B', async () => {
    actAs(authPemilik)
    const r = await kirim('PATCH', `/api/v1/companies/${companyGrupLain}/members/${UUID_TAK_ADA}`, {
      role_id: UUID_TAK_ADA,
    })
    expect(r.statusCode, `BOCOR LINTAS GRUP (ubah peran) — membalas ${r.statusCode}. Body: ${r.body}`).toBe(403)
  }, 30_000)
})

describe('F1-8 — tanpa token sama sekali', () => {
  it('permintaan tanpa Authorization ditolak 401', async () => {
    // `authenticate` harus menolak SEBELUM gerbang pemilik grup dievaluasi.
    // Kalau ia membalas 403, artinya rantai preHandler-nya terbalik.
    const r = await app.inject({ method: 'GET', url: '/api/v1/companies' })
    expect(r.statusCode).toBe(401)
  }, 30_000)
})

// ============================================================================
// DAFTAR BADAN USAHA — tak boleh 500, dan tak boleh memuat fixture test.
//
// ══════════════════════════════════════════════════════════════════════════
// CACAT YANG MELAHIRKANNYA
// ══════════════════════════════════════════════════════════════════════════
//
// Founder membuka `/pengaturan/perusahaan` 2026-08-16 dan melihat "Gagal
// memuat daftar badan usaha". Terlihat seperti masalah tampilan; ternyata
// endpoint-nya membalas **500 setiap kali dipanggil**.
//
// Sebabnya: rute ini menyusun saringan `id.in.(…),parent_company_id.in.(…)`
// dari SEMUA company milik pemanggil. Badan usaha tak pernah dihapus dari
// basis (trigger melarangnya), dan tiap kali `ai-isolasi-tenant.test.ts`
// berjalan ia meninggalkan satu baris. Diukur: 652 baris → saringan 48.204
// byte → jauh melewati batas baris permintaan HTTP (~8 KB) → PostgREST
// menolak → 500.
//
// Angkanya masih naik: 652 (16 Agu) → 741 (19 Agu), karena test terus jalan.
//
// ── Kenapa dua assertion, bukan satu
//
//   1. **Tidak 500** — menjaga cacat aslinya. Kalau saringan `is_active` atau
//      `[UJI` hilang, jumlah id membengkak lagi dan URL-nya kepanjangan.
//   2. **Tak ada `[UJI` di hasil** — menjaga niat foundernya ("hapus ajaa").
//      Baris fixture tak boleh terlihat seperti badan usaha sungguhan di
//      layar keputusan, sekalipun ia masih ada di basis.
//
// Assertion (1) saja tak cukup: daftar bisa saja berhasil dimuat TAPI penuh
// sampah uji — persis keadaan yang dikeluhkan founder.
// ============================================================================
describe('daftar badan usaha — tahan membengkak & bersih dari fixture', () => {
  it('membalas 200, bukan 500, walau ratusan company uji menumpuk', async () => {
    actAs(authPemilik)
    const r = await kirim('GET', '/api/v1/companies')

    expect(
      r.statusCode,
      `Daftar badan usaha membalas ${r.statusCode}. 500 di sini biasanya berarti ` +
        'saringan .in.() tumbuh melewati batas panjang URL — periksa ' +
        '`is_active` dan TANDA_FIXTURE di companies.ts. Body: ' + r.body.slice(0, 200),
    ).toBe(200)
  }, 30_000)

  /*
   * ⚠ BATAS TEST INI — dibaca dulu sebelum percaya ia menjaga saringan nama.
   *
   * Assertion di bawah TIDAK bisa membuktikan saringan `[UJI` bekerja, dan
   * itu sudah diuji dengan mutasi: saringannya dicopot dari `companies.ts`,
   * test tetap HIJAU. Dua sebab, keduanya struktural:
   *
   *   1. Rute membaca lewat `request.db` → `createTenantDb` → klien Supabase
   *      (HTTP). Test menulis lewat `pg` di dalam transaksi yang belum
   *      di-commit. Dua koneksi berbeda: baris fixture yang dibuat di sini
   *      TAK PERNAH terlihat oleh rutenya.
   *   2. Seluruh 740 sisa fixture di basis kini `is_active = false`, jadi
   *      saringan `is_active` saja sudah cukup menyaringnya — tak ada yang
   *      tersisa untuk dibedakan.
   *
   * Yang MASIH dijaga assertion ini nyata dan berharga: kalau suatu hari
   * fixture aktif bocor ke daftar (mis. seseorang melonggarkan `is_active`),
   * ia berbunyi. Yang TIDAK dijaganya: saringan nama itu sendiri.
   *
   * Menuliskannya begini adalah pilihan sadar. Menghapus test ini membuang
   * penjagaan yang nyata; membiarkannya tanpa catatan membuat sesi berikutnya
   * mengira saringan nama sudah teruji padahal tidak. CHARTER §7: yang tak
   * terbukti tak boleh diklaim terbukti.
   *
   * Untuk benar-benar menguji saringan nama, fixture harus di-COMMIT (terlihat
   * PostgREST) lalu dibersihkan — dan `companies` menolak DELETE, jadi
   * pembersihannya sendiri butuh keputusan yang belum diambil.
   */
  it('tak memulangkan satu pun badan usaha bertanda [UJI', async () => {
    actAs(authPemilik)
    const r = await kirim('GET', '/api/v1/companies')
    expect(r.statusCode).toBe(200)

    const isi = JSON.parse(r.body) as { data: Array<{ name: string; is_active: boolean }> }
    const fixture = (isi.data ?? []).filter((x) => x.name?.startsWith('[UJI'))

    expect(
      fixture.map((x) => x.name),
      'Fixture test bocor ke daftar badan usaha — ia akan tampil seperti PT sungguhan ' +
        'di layar Pengaturan → Badan Usaha.',
    ).toEqual([])

    // Yang lolos saringan wajib aktif — nonaktif berarti sudah di-off-board.
    for (const x of isi.data ?? []) {
      expect(x.is_active, `"${x.name}" nonaktif tapi tetap terdaftar`).toBe(true)
    }
  }, 30_000)
})
