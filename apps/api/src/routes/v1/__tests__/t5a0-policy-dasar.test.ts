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

describe('T5a-0 — tak boleh ada tabel RLS-enabled tanpa policy', () => {
  it('nol tabel ber-RLS yang tak punya policy sama sekali', async () => {
    const { rows } = await c.query(`
      SELECT ct.relname AS t
        FROM pg_class ct JOIN pg_namespace n ON n.oid = ct.relnamespace
       WHERE n.nspname = 'public' AND ct.relkind = 'r' AND ct.relrowsecurity
         AND NOT EXISTS (SELECT 1 FROM pg_policies p
                          WHERE p.schemaname = 'public' AND p.tablename = ct.relname)
       ORDER BY 1`)
    const namaTabel = rows.map((r) => r.t)
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
