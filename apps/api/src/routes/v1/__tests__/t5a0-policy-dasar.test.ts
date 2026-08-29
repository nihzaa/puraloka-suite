import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// ============================================================
// T5a-0 — penjaga permanen: NOL tabel RLS-enabled tanpa policy.
//
// Temuan T1-F3, dibuktikan empiris: Postgres meng-AND policy RESTRICTIVE
// dengan hasil OR SELURUH policy PERMISSIVE. Kalau permissive-nya nol,
// hasilnya SELALU false — tabel jadi tak terbaca sama sekali.
//
// Selama API memakai service_role, gejalanya TIDAK terlihat (RLS di-bypass).
// Ia baru meledak di T5c. Test ini membuat bahaya itu ketahuan di CI, bukan
// saat service_role dilepas.
// ============================================================

let c: Client

beforeAll(async () => { c = await createRlsClient() }, 60_000)
afterAll(async () => { await c?.end() })

/*
  ── TABEL YANG SENGAJA TAK BERPOLICY, dan kenapa itu bukan lubang ───────────

  Diukur 2026-08-30: 22 tabel ber-RLS punya nol policy. Enam di antaranya
  BISA dipagari dan sudah — migrasi 518.

  Enam belas sisanya TIDAK PUNYA kunci tenant sama sekali: nol `company_id`,
  nol `tenant_id`, nol `project_id`. Tak ada yang bisa dipakai menyaring.

  Satu-satunya cara "memberi policy" pada mereka adalah MENGARANG kolom tenant
  untuk data yang memang bukan milik tenant, atau MENGUBAH KATEGORINYA supaya
  penjaga diam. Berkas t5a (tetangga berkas ini) sudah menuliskan kenapa itu
  paling berbahaya di gerbang tenancy — dan penjaga yang hijau karena
  kategorinya dipalsukan lebih buruk daripada penjaga yang merah dengan jujur.

  Tiga kelompok, masing-masing dengan alasannya:

    admin_saas_*        izin & pengguna KONSOL VENDOR, bukan data tenant.
                        Ia dikelola repo terpisah (admin-saas) yang memakai
                        basisnya sendiri; tabel di sini peninggalan sebelum
                        konsol itu dipisah.

    marketing_*         halaman jual publik. Isinya memang untuk dibaca
                        siapa pun — menyaringnya per-tenant justru salah.

    plans, plan_features, plan_feature_values, saas_invoice_line_items
                        katalog paket. `docs/specs/2026-08-28-billing-design.md`
                        §7 menyatakan tabel ini SENGAJA tak dipakai: billing
                        hidup di DB Vendor, dan yang di sini dibiarkan kosong.

  ⚠ KOREKSI 2026-08-30: `template_input`, `template_item`, dan
  `saas_invoice_line_items` SEMPAT ada di daftar ini dengan alasan "katalog
  bersama". Alasan itu benar secara harfiah — mereka memang tak punya
  `company_id` — dan SALAH secara akibat.

  `f2-3-batch3-tenancy-turunan` menemukannya dengan cara yang lebih dapat
  dipercaya daripada peta kategori: ia membaca FK dari SKEMA. Ketiganya anak
  dari tabel yang PUNYA `company_id` — `template_rab` dan `saas_invoices` —
  dan `template_rab` justru yang dipagari 518 karena memuat struktur harga.
  Anaknya membawa ISI template itu (71 dan 161 baris).

  Pagar induk tanpa pagar anak hampir tak berarti: yang bocor bukan judul
  templatenya, melainkan isinya. Ketiganya kini dipagari lewat induk —
  migrasi 519.

  ⚠ Daftar ini BUKAN tempat membuang tabel yang merepotkan. Syarat masuk:
  tabelnya harus TAK PUNYA kunci tenant apa pun. Begitu sebuah tabel di sini
  mendapat `company_id`, ia keluar dari daftar dan wajib dipagari — dan test
  di bawah menegakkan syarat itu, bukan sekadar mempercayai daftarnya.
*/
const TANPA_KUNCI_TENANT = [
  'admin_saas_audit_log',
  'admin_saas_permissions',
  'admin_saas_role_permissions',
  'admin_saas_roles',
  'admin_saas_users',
  'marketing_faqs',
  'marketing_pages',
  'marketing_pricing_plans',
  'marketing_sections',
  'marketing_testimonials',
  'plan_feature_values',
  'plan_features',
  'plans',
]

describe('T5a-0 — tak boleh ada tabel RLS-enabled tanpa policy', () => {
  it('tabel yang dikecualikan BENAR-BENAR tak punya kunci tenant', async () => {
    /*
      Penjaga atas daftar pengecualian itu sendiri.

      Tanpa test ini, `TANPA_KUNCI_TENANT` pelan-pelan berubah jadi tempat
      pembuangan: sekali sebuah tabel masuk, tak ada yang memeriksanya lagi
      walau ia kemudian mendapat `company_id`. Yang dijaga di sini adalah
      SYARAT masuknya, bukan isinya.
    */
    const { rows } = await c.query(
      `SELECT table_name, string_agg(column_name, ', ') AS kunci
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1)
          AND column_name IN ('company_id', 'tenant_id', 'project_id')
        GROUP BY table_name
        ORDER BY table_name`,
      [TANPA_KUNCI_TENANT],
    )
    expect(
      rows.map((r) => `${r.table_name} (${r.kunci})`),
      'Tabel ini dikecualikan sebagai "tak punya kunci tenant", TAPI ternyata ' +
        'punya. Ia harus dipagari seperti enam tabel di migrasi 518 — bukan ' +
        'tetap di daftar pengecualian.',
    ).toEqual([])
  }, 60_000)

  it('nol tabel ber-RLS yang tak punya policy sama sekali', async () => {
    const { rows } = await c.query(`
      SELECT ct.relname AS t
        FROM pg_class ct JOIN pg_namespace n ON n.oid = ct.relnamespace
       WHERE n.nspname = 'public' AND ct.relkind = 'r' AND ct.relrowsecurity
         AND NOT EXISTS (SELECT 1 FROM pg_policies p
                          WHERE p.schemaname = 'public' AND p.tablename = ct.relname)
       ORDER BY 1`)
    const namaTabel = rows.map((r) => r.t).filter((t) => !TANPA_KUNCI_TENANT.includes(t))
    expect(
      namaTabel,
      'Tabel ini RLS-nya aktif tapi NOL policy. Begitu policy RESTRICTIVE ' +
        'tenant ditambahkan (T5a), mereka jadi TAK TERBACA sama sekali — ' +
        'restrictive di-AND dengan hasil OR permissive, dan OR dari himpunan ' +
        'kosong adalah FALSE. Beri policy permissive dasar dulu (lihat ' +
        'migration 130), berbasis has_permission() bukan literal role (ADR-004).'
    ).toEqual([])
  }, 30_000)

  it('nol policy permisif tanpa syarat (USING true) pada tabel ber-tenant', async () => {
    // Policy `USING (true)` menelan semua policy sah di tabel yang sama karena
    // permissive di-OR. Satu yang lolos = seluruh axis role tabel itu tak
    // berarti apa-apa (kasus nyata: "Allow all access on users", dibuang
    // migration 129).
    //
    // Versi pertama test ini hanya memeriksa `cmd='ALL'` — dan karena itu
    // MELEWATKAN tiga policy `USING(true)` ber-`cmd='SELECT'` yang ada di dev
    // (materials, material_categories, expense_category_templates). Batasan
    // `cmd='ALL'` dibuang: baca-semua-tanpa-syarat sama berbahayanya dengan
    // tulis-semua-tanpa-syarat kalau tabelnya memang milik tenant.
    //
    // Yang TIDAK dianggap pelanggaran: tabel kategori A — kosakata bersama yang
    // memang tak punya `company_id` sama sekali (mis. material_categories:
    // 10 baris "Beton & Semen", "Besi & Baja"). Di sana `USING(true)` adalah
    // pernyataan yang benar, bukan kelalaian. Pembedanya bukan selera:
    // ada-tidaknya kolom `company_id` di tabel itu.
    const { rows } = await c.query(`
      SELECT p.tablename, p.policyname FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.qual = 'true'
         AND EXISTS (
           SELECT 1 FROM information_schema.columns col
            WHERE col.table_schema = 'public' AND col.table_name = p.tablename
              AND col.column_name = 'company_id')
       ORDER BY p.tablename`)

    // Tabel ber-`company_id` yang punya policy USING(true) hanya aman kalau ada
    // policy RESTRICTIVE yang mempersempitnya kembali — itulah mekanisme T5a.
    // Jadi yang dilaporkan hanya yang TIDAK terlindungi restrictive.
    const pelanggar: string[] = []
    for (const r of rows) {
      const { rows: pel } = await c.query(
        `SELECT 1 FROM pg_policies WHERE schemaname='public'
          AND tablename=$1 AND permissive='RESTRICTIVE'`, [r.tablename])
      if (pel.length === 0) pelanggar.push(`${r.tablename}.${r.policyname}`)
    }

    expect(
      pelanggar,
      'Policy permisif tanpa syarat di tabel ber-company_id TANPA policy ' +
        'restrictive yang mempersempitnya = data terbaca lintas company.'
    ).toEqual([])
  }, 60_000)

  it('policy T5a-0 memakai has_permission(), BUKAN literal nama role (ADR-004)', async () => {
    // ADR-004 Mandatory Rule #2: dilarang auth_role() = 'admin' / role IN (...).
    const { rows } = await c.query(`
      SELECT tablename, policyname, qual FROM pg_policies
       WHERE schemaname = 'public'
         AND policyname IN ('rab_items_select','rab_items_write','rab_schedule_select',
              'rab_schedule_write','rab_absorption_log_select','rab_absorption_log_write',
              'change_orders_select','change_orders_write','change_order_items_select',
              'change_order_items_write','work_scope_item_specs_select',
              'work_scope_item_specs_write','company_profile_select')`)
    expect(rows.length, 'policy T5a-0 tak ditemukan — migration 130 belum di-apply?')
      .toBeGreaterThan(10)
    const melanggar = rows.filter((r) => /auth_role\(\)/.test(r.qual ?? ''))
    expect(melanggar.map((r) => r.policyname), 'policy memakai literal role').toEqual([])
  }, 30_000)
})
