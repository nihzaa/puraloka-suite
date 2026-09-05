import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'
import { PETA_TENANCY } from '../../../utils/tenant-map.generated.js'

// ============================================================
// T7 — EXIT CRITERIA L2 (ADR-011 §9, checklist doc 09 §2).
//
// Gerbang penutup Program D. Bedanya dengan test T5a/T5b/T6 yang menjaga satu
// mekanisme masing-masing: ini memeriksa apakah SELURUH klaim "multi-tenant
// selesai" masih benar — sekaligus, terhadap keadaan database, bukan terhadap
// dokumen.
//
// Kenapa perlu ada meski tiap tahap sudah punya test sendiri: klaim tingkat
// program ("aman untuk pelanggan kedua") bisa runtuh tanpa satu pun test tahap
// jadi merah — mis. tabel baru lahir dengan company_id tapi tanpa policy, atau
// UNIQUE global dipasang kembali oleh migrasi lain. Yang dijaga di sini adalah
// gabungannya.
//
// CECEP langkah 7+ menunggu gerbang ini (keputusan D1). Kalau test ini merah,
// artinya pondasinya belum layak dilanjutkan — bukan sekadar ada test gagal.
// ============================================================

let c: Client

beforeAll(async () => {
  c = await createRlsClient()
}, 120_000)

afterAll(async () => {
  await c?.end()
})

const hitung = async (sql: string, params: unknown[] = []): Promise<number> =>
  Number((await c.query(sql, params)).rows[0].n)

describe('L2 · kriteria 1 — company_id di seluruh tabel transaksional', () => {
  it('setiap tabel ANCHOR/B/AB benar-benar punya kolom company_id', async () => {
    // Dibaca dari peta (yang di-generate dari skema) lalu diperiksa balik ke
    // skema. Terdengar berputar, tapi menangkap kasus nyata: peta di repo basi
    // terhadap database — persis yang dijaga P3.
    const perlu = Object.entries(PETA_TENANCY)
      .filter(([, v]) => ['ANCHOR', 'B', 'AB'].includes(v.kategori))
      .map(([t]) => t)

    const kurang: string[] = []
    for (const t of perlu) {
      const ada = await hitung(
        `SELECT count(*)::int n FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1 AND column_name='company_id'`, [t])
      if (ada === 0) kurang.push(t)
    }
    expect(kurang, 'tabel ber-tenant tanpa kolom company_id').toEqual([])
    expect(perlu.length, 'peta tenancy kosong — kemungkinan gagal di-generate')
      .toBeGreaterThan(20)
  }, 120_000)
})

describe('L2 · kriteria 2 — dual-axis RLS aktif', () => {
  it('axis company terpasang di seluruh tabel ber-tenant', async () => {
    // VIEW dikecualikan — ia tak bisa punya policy RLS. Alasan lengkapnya di
    // `t5a-policy-tenant.test.ts`; ringkasnya: menuntutnya pada view membuat
    // salah-kategori jadi satu-satunya jalan keluar, dan salah kategori di
    // gerbang tenancy adalah cacat yang diam.
    const berTenant = Object.entries(PETA_TENANCY)
      .filter(([, v]) => ['ANCHOR', 'B', 'AB', 'C'].includes(v.kategori))
      .filter(([, v]) => !('view' in v && v.view))
      .map(([t]) => t)
    /*
      ⚠ Disaring lewat STRUKTUR, bukan NAMA — diperbaiki 2026-09-04.

      Versi sebelumnya mencari `policyname='tenant_isolation'`, dan tiga tabel
      jatuh sebagai "tak berpagar" padahal terlindungi dengan benar:

          entitlement_snapshot   entitlement_baca_tenant · entitlement_pagar_tenant
          situs_domain           situs_domain_baca · situs_domain_pagar
          tagihan_tenant         tagihan_tenant_baca · tagihan_tenant_pagar

      Ketiganya punya PERMISSIVE + RESTRICTIVE yang keduanya menyaring
      `company_id`. Yang berbeda cuma namanya — dan nama itu justru membawa
      informasi: `_baca` vs `_pagar` membedakan permissive dari restrictive,
      yang hilang kalau keduanya dipaksa bernama `tenant_isolation` (dan satu
      tabel tak bisa punya dua policy bernama sama).

      Penyaringan lewat nama membuat perlindungan yang SAH terbaca sebagai
      lubang, dan mendorong orang menamai policy demi lolos test alih-alih
      demi kejelasan. CLAUDE.md mencatat kelas cacat ini; `t5a-policy-tenant`
      di sebelah sudah menyaring lewat predikat, dan pola itu yang ditiru.
    */
    const punya = new Set(
      (await c.query(
        `SELECT DISTINCT c.relname AS tablename
           FROM pg_policy p
           JOIN pg_class c ON c.oid = p.polrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND (pg_get_expr(p.polqual, p.polrelid) LIKE '%auth_company_id%'
              OR pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%auth_company_id%')`
      )).rows.map((r) => r.tablename)
    )
    expect(berTenant.filter((t) => !punya.has(t))).toEqual([])
  }, 60_000)

  it('tak ada policy yang tak pernah dievaluasi (RLS mati)', async () => {
    expect(await hitung(
      `SELECT count(DISTINCT p.tablename)::int n FROM pg_policies p
         JOIN pg_class ct ON ct.relname = p.tablename
         JOIN pg_namespace nn ON nn.oid = ct.relnamespace AND nn.nspname='public'
        WHERE p.schemaname='public' AND ct.relkind='r' AND NOT ct.relrowsecurity`
    )).toBe(0)
  }, 60_000)

  /*
    "Mati total" = RLS aktif, nol PERMISSIVE. RESTRICTIVE di-AND dengan hasil OR
    seluruh PERMISSIVE, dan OR dari himpunan KOSONG adalah FALSE — jadi tabelnya
    tak terbaca siapa pun.

    ⚠ Yang DIKECUALIKAN: tabel yang tak punya kunci tenant sama sekali.

    Diukur 2026-08-30: 13 tabel ber-RLS nol policy, dan tak satu pun punya
    `company_id`/`tenant_id`/`project_id` — `admin_saas_*` (izin konsol vendor,
    repo terpisah), `marketing_*` (halaman publik), `plans`/`plan_features`
    (spec Billing §7: sengaja tak dipakai, billing hidup di DB Vendor).

    Mereka tak bisa dipagari tanpa MENGARANG kolom tenant, dan berkas t5a
    sudah menulis kenapa itu paling berbahaya di gerbang tenancy. Enam tabel
    yang BISA dipagari sudah ditutup migrasi 518 & 519.

    Pengecualiannya DITURUNKAN DARI SKEMA, bukan daftar tulisan tangan: begitu
    salah satu tabel itu mendapat `company_id`, ia otomatis kembali masuk
    jangkauan test ini. Daftar tulisan tangan akan diam saat itu terjadi.
  */
  it('tak ada tabel yang mati total (RLS aktif tanpa permissive)', async () => {
    expect(await hitung(
      `SELECT count(*)::int n FROM pg_class ct
         JOIN pg_namespace nn ON nn.oid = ct.relnamespace
        WHERE nn.nspname='public' AND ct.relkind='r' AND ct.relrowsecurity
          AND NOT EXISTS (SELECT 1 FROM pg_policies p
            WHERE p.schemaname='public' AND p.tablename=ct.relname
              AND p.permissive='PERMISSIVE')
          AND EXISTS (SELECT 1 FROM information_schema.columns col
            WHERE col.table_schema='public' AND col.table_name=ct.relname
              AND col.column_name IN ('company_id','tenant_id','project_id'))`
    )).toBe(0)
  }, 60_000)
})

describe('L2 · kriteria 3 — penomoran per company', () => {
  it('counter tersedia dan UNIQUE global sudah dilepas', async () => {
    expect(
      await hitung(`SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n2 ON n2.oid=p.pronamespace WHERE n2.nspname='public' AND p.proname='next_document_number'`),
      'next_document_number() hilang — penomoran kembali ke COUNT(*)'
    ).toBeGreaterThan(0)

    expect(
      await hitung(
        // ⚠️ Filter `nspname='public'` WAJIB. Tanpa itu, `pg_constraint`
        // memuat SELURUH schema — termasuk schema test yang dibangun
        // `procurement.test.ts` dengan constraint bernama sama.
        //
        // Ketahuan 2026-08-01 tepat setelah migrasi 154 membuat 6 integration
        // test benar-benar BERJALAN (sebelumnya "skipped" karena guard
        // `to_regclass` menembus schema). Test ini lalu ikut menghitung
        // constraint schema test dan gagal — bukan karena skema production
        // berubah, melainkan karena tetangganya akhirnya hidup.
        //
        // Pola yang sama persis dengan cacat yang baru diperbaiki: kueri
        // katalog TANPA filter skema menjawab pertanyaan yang lebih luas dari
        // yang dimaksud.
        `SELECT count(*)::int n FROM pg_constraint con
           JOIN pg_class cl ON cl.oid = con.conrelid
           JOIN pg_namespace n ON n.oid = cl.relnamespace
          WHERE n.nspname = 'public' AND con.conname IN
          ('material_requests_mr_number_key','purchase_orders_po_number_key',
           'goods_receipts_gr_number_key','invoices_invoice_number_key')`
      ),
      'UNIQUE global pada nomor dokumen dipasang kembali — dua tenant tak bisa ' +
        'sama-sama punya MR-2026-001'
    ).toBe(0)
  }, 60_000)
})

describe('L2 · kriteria 4 — company switcher berbasis keanggotaan', () => {
  it('auth_company_id() memakai keanggotaan, bukan "company satu-satunya"', async () => {
    // P1 (ADR-011 §9.5): dilarang ada cabang "kalau cuma satu company, pakai
    // itu". Cabang semacam itu membuat sistem terlihat benar sampai tenant
    // kedua muncul — waktu paling mahal untuk menemukannya.
    const def = (await c.query(
      `SELECT pg_get_functiondef(p.oid) d FROM pg_proc p JOIN pg_namespace n2 ON n2.oid=p.pronamespace WHERE n2.nspname='public' AND p.proname='auth_company_id'`
    )).rows[0].d as string

    expect(def, 'auth_company_id tidak membaca keanggotaan').toContain('company_members')
    expect(def, 'auth_company_id tidak menghormati default keanggotaan').toContain('is_default')
    expect(
      def.toUpperCase(),
      'auth_company_id memakai LIMIT tanpa syarat keanggotaan — gejala cabang ' +
        '"ambil satu-satunya company yang ada" yang dilarang P1'
    ).not.toMatch(/FROM\s+COMPANIES\s+LIMIT/)
  }, 60_000)
})

describe('L2 · kriteria 5 — Menu Registry per company', () => {
  it('mekanisme pengecualian menu per company tersedia dan ter-isolasi', async () => {
    // Item checklist L2 yang sempat terlewat saat T7 pertama dikerjakan —
    // ditambahkan ke gerbang ini supaya "lengkap" berarti benar-benar lengkap,
    // bukan lengkap menurut yang kebetulan saya periksa.
    expect(
      await hitung(`SELECT count(*)::int n FROM information_schema.tables
        WHERE table_schema='public' AND table_name='company_menu_settings'`),
      'company_menu_settings hilang — menu kembali seragam untuk semua tenant'
    ).toBe(1)

    expect(
      await hitung(`SELECT count(*)::int n FROM pg_policies
        WHERE schemaname='public' AND tablename='company_menu_settings'
          AND policyname='tenant_isolation'`),
      'pengaturan menu tanpa isolasi tenant — satu perusahaan bisa mengubah ' +
        'tampilan perusahaan lain'
    ).toBe(1)
  }, 60_000)
})

describe('L2 · kriteria 6 — biaya RLS tidak membuat sistem tak terpakai', () => {
  it('seluruh helper konstan dievaluasi sebagai InitPlan', async () => {
    // Bagian dari exit criteria, bukan kerapian: tanpa ini T5c menghasilkan
    // sistem dengan query 3,5 detik — secara teknis "aman", secara praktis mati.
    const HELPER = ['has_permission', 'auth_role', 'auth_user_id', 'auth_client_id', 'auth_company_id']
    const sudah = new RegExp(`\\(\\s*SELECT\\s+(${HELPER.join('|')})\\s*\\([^()]*\\)[^()]*\\)`, 'gi')
    const telanjang = new RegExp(`(?<![.\\w])(${HELPER.join('|')})\\s*\\(`, 'i')

    const { rows } = await c.query(
      `SELECT tablename, policyname, qual, with_check FROM pg_policies
        WHERE schemaname='public'`
    )
    const pelanggar = rows
      .filter((r) => [r.qual, r.with_check].some(
        (e) => e && telanjang.test(String(e).replace(sudah, 'X'))))
      .map((r) => `${r.tablename}.${r.policyname}`)

    expect(pelanggar, 'policy memanggil helper per baris — lihat migration 132').toEqual([])
  }, 60_000)
})
