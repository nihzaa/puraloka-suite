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

  it('nol policy permisif tanpa syarat (USING true FOR ALL)', async () => {
    // Policy `FOR ALL USING (true)` menelan semua policy sah di tabel yang sama
    // karena permissive di-OR. Satu yang lolos = seluruh axis role tabel itu
    // tak berarti apa-apa (kasus nyata: "Allow all access on users", dibuang
    // migration 129).
    const { rows } = await c.query(`
      SELECT tablename, policyname FROM pg_policies
       WHERE schemaname = 'public' AND qual = 'true' AND cmd = 'ALL'
       ORDER BY tablename`)
    expect(
      rows.map((r) => `${r.tablename}.${r.policyname}`),
      'Policy permisif tanpa syarat membatalkan seluruh policy sah di tabelnya.'
    ).toEqual([])
  }, 30_000)

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
