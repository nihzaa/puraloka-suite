import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Client } from 'pg'
import { createRlsClient, authIdForRole } from '../../../test-utils/rls-harness.js'
import { supabaseAuth } from '../../../utils/supabase.js'
import auditRoutes from '../audit.js'

// ============================================================================
// `GET /api/v1/audit/meta` menawarkan SELURUH nilai saringan, bukan 1.000
// baris pertamanya
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA TEST INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Sampai 2026-09-15 rute ini menyusun dropdown begini:
//
//     supabase.from('audit_logs').select('table_name')
//       .eq('company_id', cid).order('table_name')          ← tanpa .limit()
//     const tables = [...new Set(data.map(r => r.table_name))]
//
// PostgREST memulangkan **maksimal 1.000 baris** — batas keras, ditegakkan
// server, TANPA galat dan TANPA penanda pemotongan. `.order('table_name')`
// lalu memastikan seribu baris itu bukan sampel acak melainkan seluruhnya
// milik tabel yang MENANG ALFABETIS.
//
// Diukur di basis dev 2026-09-15 (tenant 48befb54…, 102.089 baris):
//
//     DISTINCT table_name yang sebenarnya ada  :  95
//     yang ditawarkan dropdown                 :   3
//
// Auditor membuka dropdown, melihat tiga tabel, dan menyimpulkan tak ada
// modul lain yang pernah terjejak. Tak ada galat yang bisa membantahnya.
//
// ── Kenapa kebenarannya DIUKUR dari SQL, bukan ditulis sebagai angka
//
// Menulis `expect(tables.length).toBe(95)` akan basi begitu ada satu baris
// audit baru dari tabel yang belum pernah terjejak — dan test yang merah
// karena DATA berubah (bukan kode) melatih orang menaikkan angkanya tanpa
// membaca. Jadi kebenarannya dihitung dari basis pada saat test berjalan,
// lalu dibandingkan dengan yang dibalas rute.
//
// ── Kenapa test ini TIDAK bisa hijau di atas kode lama
//
// Ia menuntut kesamaan PERSIS dengan `SELECT DISTINCT`. Selama daftarnya
// disusun dengan menarik baris ke JS, ia tunduk pada batas 1.000 — dan
// selisihnya di basis ini 92 nilai. Sudah dibuktikan dengan mengembalikan
// kode lama: MERAH, `95 !== 3`.
// ============================================================================

let app: FastifyInstance
let client: Client
let adminAuth: string
let companyId: string

const actAs = (a: string) =>
  vi.spyOn(supabaseAuth.auth, 'getUser').mockResolvedValue(
    { data: { user: { id: a } }, error: null } as never,
  )

beforeAll(async () => {
  client = await createRlsClient()
  adminAuth = (await authIdForRole(client, 'admin')) as string

  /*
    Company yang benar-benar dipakai rute.

    ⚠ Ini WAJIB meniru `resolveCompanyId()` (`plugins/auth.ts:65`) persis,
    dan percobaan pertama tidak — ia hanya `JOIN company_members … LIMIT 1`
    tanpa `is_default` maupun `cm.is_active`. Akibatnya SQL mengukur tenant
    yang BERBEDA dari yang dibaca endpoint, dan keempat asersi merah dengan
    "expected 95 to be 0": angka yang terbaca persis seperti rutenya bocor
    lintas-tenant, padahal yang salah alat ukurnya.

    Kelas yang sama dengan `audit-fixture-akun-hidup.mjs` (CLAUDE.md §6):
    fixture yang memilih identitas lewat kolom yang salah menghasilkan galat
    yang MENUDUH RUTE.

    Urutannya mengikuti auth: keanggotaan `is_default` lebih dulu, sisanya
    baru sesudahnya.
  */
  const { rows } = await client.query(
    `SELECT cm.company_id
       FROM users u
       JOIN company_members cm ON cm.user_id = u.id
      WHERE u.auth_id = $1 AND cm.is_active
      ORDER BY cm.is_default DESC
      LIMIT 1`,
    [adminAuth],
  )
  companyId = rows[0]?.company_id

  app = Fastify()
  await app.register(auditRoutes)
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app?.close()
  await client?.end()
})

describe('GET /api/v1/audit/meta · daftar saringan tidak terpotong di 1.000 baris', () => {
  it('menawarkan SELURUH `table_name` milik tenant, sesuai SELECT DISTINCT', async () => {
    expect(companyId, 'admin uji tak punya keanggotaan company').toBeTruthy()

    // Kebenaran, langsung dari basis.
    const { rows } = await client.query(
      `SELECT DISTINCT table_name FROM public.audit_logs
        WHERE company_id = $1 AND table_name IS NOT NULL
        ORDER BY table_name`,
      [companyId],
    )
    const benar = rows.map((r: { table_name: string }) => r.table_name)

    actAs(adminAuth)
    const r = await app.inject({
      method: 'GET', url: '/api/v1/audit/meta',
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode).toBe(200)

    const tables = r.json().tables as string[]

    /*
      Dibandingkan sebagai HIMPUNAN yang sama persis, bukan lewat
      `length >= 1` atau `toContain` satu nilai.

      Kode lama memulangkan 3 dari 95 — dan KETIGANYA sah, jadi asersi
      "berisi sesuatu yang benar" akan hijau di atas cacatnya. Yang
      membedakan hanya kelengkapan.
    */
    expect(
      tables.length,
      `dropdown menawarkan ${tables.length} tabel, padahal tenant ini punya ${benar.length} — ` +
      'selisihnya nilai yang TAK PERNAH bisa dipilih auditor',
    ).toBe(benar.length)
    expect([...tables].sort()).toEqual([...benar].sort())
  }, 60_000)

  it('menawarkan SELURUH `action` milik tenant, sesuai SELECT DISTINCT', async () => {
    const { rows } = await client.query(
      `SELECT DISTINCT action FROM public.audit_logs
        WHERE company_id = $1 AND action IS NOT NULL`,
      [companyId],
    )
    const benar = rows.map((r: { action: string }) => r.action)

    actAs(adminAuth)
    const r = await app.inject({
      method: 'GET', url: '/api/v1/audit/meta',
      headers: { authorization: 'Bearer t' },
    })
    expect(r.statusCode).toBe(200)

    const actions = r.json().actions as string[]
    expect(actions.length).toBe(benar.length)
    expect([...actions].sort()).toEqual([...benar].sort())
  }, 60_000)

  it('melampaui batas 1.000 baris PostgREST — bukan sekadar lolos kebetulan', async () => {
    /*
      Penjaga terhadap test yang hijau tanpa menguji apa pun.

      Kalau tenant uji kebetulan punya < 1.000 baris audit, kedua asersi di
      atas akan hijau BAHKAN di atas kode lama — pemotongannya tak pernah
      terjadi. Hijau semacam itu terbaca persis seperti hijau yang sah, dan
      justru di lingkungan bersih (CI dengan basis baru) ia paling mungkin
      muncul.

      Jadi keadaan itu dilaporkan sebagai yang sesungguhnya: bukan kegagalan
      kode, melainkan test yang TIDAK BERDAYA menguji klaimnya.
    */
    const { rows } = await client.query(
      `SELECT count(*)::int n FROM public.audit_logs WHERE company_id = $1`,
      [companyId],
    )
    const jml = rows[0].n as number

    if (jml <= 1000) {
      console.warn(
        `  ⚠ tenant uji hanya punya ${jml} baris audit (<= 1.000), jadi dua asersi di\n` +
        '    atas TAK MEMBUKTIKAN apa-apa tentang pemotongan PostgREST — keduanya akan\n' +
        '    hijau juga di atas kode lama yang cacat.',
      )
    }
    expect(jml).toBeGreaterThan(0)
  }, 60_000)

  it('tidak membocorkan nilai milik tenant lain', async () => {
    /*
      Perbaikannya memindahkan penyaringan tenant dari `.eq('company_id', …)`
      ke parameter RPC. Itu jalur BARU, jadi isolasinya harus dibuktikan
      ulang — bukan diwarisi.

      `audit_logs` memuat diff nilai kontrak, pemutihan denda, dan perubahan
      role: daftar tabel milik tenant lain saja sudah membocorkan modul apa
      yang mereka pakai.
    */
    const { rows } = await client.query(
      `SELECT DISTINCT table_name FROM public.audit_logs
        WHERE company_id <> $1 AND table_name IS NOT NULL
          AND table_name NOT IN (
            SELECT DISTINCT table_name FROM public.audit_logs
             WHERE company_id = $1 AND table_name IS NOT NULL)`,
      [companyId],
    )
    const hanyaMilikTenantLain = rows.map((r: { table_name: string }) => r.table_name)

    actAs(adminAuth)
    const r = await app.inject({
      method: 'GET', url: '/api/v1/audit/meta',
      headers: { authorization: 'Bearer t' },
    })
    const tables = r.json().tables as string[]

    const bocor = tables.filter((t) => hanyaMilikTenantLain.includes(t))
    expect(bocor, `nilai milik tenant lain ikut terbawa: ${bocor.join(', ')}`).toEqual([])
  }, 60_000)
})
