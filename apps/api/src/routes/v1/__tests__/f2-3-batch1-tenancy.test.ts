import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../../test-utils/rls-harness.js'

// ============================================================================
// F2-3 BATCH 1 — tenancy empat tabel yang F2-2 sisakan untuk keputusan.
//
// ══════════════════════════════════════════════════════════════════════════
// APA YANG DIJAGA DI SINI
// ══════════════════════════════════════════════════════════════════════════
//
// Migrasi 178 memberi `company_id` pada dua tabel dan sengaja TIDAK memberinya
// pada dua tabel lain. Keduanya perlu dijaga, dan alasannya berbeda:
//
//   company_profile  → B    : satu profil per tenant, NULL tak sah
//   kasbon_purposes  → A/B  : baris bawaan (NULL) + baris milik tenant
//   material_categories, menu_items → A : TETAP shared
//
// Dua yang terakhir dijaga justru supaya tak "diperbaiki" orang berikutnya.
// Tanpa test, seseorang yang melihat tabel tanpa `company_id` di sistem
// multi-tenant akan mengira itu kelalaian dan menambahkannya — memaksa tiap PT
// menyalin kosakata standar industri yang sama.
//
// ── Yang paling mudah salah, dan karena itu diuji paling keras
//
// Pola A/B punya dua sisi yang HARUS berbeda:
//
//   USING       → boleh MEMBACA baris bawaan (NULL) + miliknya sendiri
//   WITH CHECK  → hanya boleh MENULIS baris miliknya sendiri
//
// Menyamakan keduanya membuat satu tenant bisa menyunting keperluan bawaan
// yang dipakai SELURUH tenant lain. Kerusakannya tak terlihat di tenant yang
// menyunting — ia terlihat di semua tenant lain, sebagai data yang berubah
// tanpa ada yang mengubahnya.
//
// Seluruhnya di dalam transaksi yang di-ROLLBACK. Berkas ini menulis ke schema
// `public` bersama, dan tujuh kali dalam sesi ini cacat isolasi antar-shard
// berakar pada test yang meninggalkan jejak.
// ============================================================================

let c: Client
let companyA: string
let companyB: string

beforeAll(async () => {
  c = await createRlsClient()
  await c.query('BEGIN')

  companyA = (await c.query(
    `SELECT id FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1`,
  )).rows[0].id

  // Company kedua dibuat DI DALAM transaksi — tak pernah terlihat sesi lain,
  // jadi tak bisa memicu benturan lintas-shard.
  companyB = (await c.query(
    `INSERT INTO companies (code, name, owner_user_id, created_by)
     SELECT 'uji-f23b1', '[UJI-F2-3] Tenant B', owner_user_id, owner_user_id
       FROM companies WHERE id = $1 RETURNING id`, [companyA],
  )).rows[0].id
}, 120_000)

afterAll(async () => {
  await c?.query('ROLLBACK').catch(() => {})
  await c?.end()
})

describe('company_profile — kategori B (satu profil per tenant)', () => {
  it('punya company_id NOT NULL', async () => {
    const { rows } = await c.query(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='company_profile'
          AND column_name='company_id'`)
    expect(rows, 'company_profile.company_id HILANG').toHaveLength(1)
    expect(rows[0].is_nullable,
      'company_id nullable — profil tanpa pemilik bisa lahir').toBe('NO')
  }, 30_000)

  it('UNIQUE(company_id) — satu tenant tak bisa punya dua profil', async () => {
    const { rows } = await c.query(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint
        WHERE conrelid = to_regclass(current_schema() || '.company_profile')
          AND contype = 'u'`)
    expect(rows.map((r) => r.d).join(' '),
      'nol UNIQUE(company_id) — dua profil per tenant bisa hidup bersama, dan ' +
      'yang mana yang dipakai jadi tergantung urutan baris').toMatch(/UNIQUE \(company_id\)/)
  }, 30_000)

  it('baris yang ada TIDAK yatim — backfill benar-benar jalan', async () => {
    const { rows } = await c.query(
      `SELECT count(*)::int AS yatim FROM company_profile WHERE company_id IS NULL`)
    expect(rows[0].yatim, 'ada profil tanpa company_id').toBe(0)
  }, 30_000)
})

describe('kasbon_purposes — kategori A/B (overlay)', () => {
  it('kode SAMA boleh hidup di bawaan + dua tenant berbeda', async () => {
    // Inti pola overlay. Kalau ini ditolak, tenant kedua tak bisa memakai kode
    // yang kebetulan sudah dipakai tenant pertama — dan mereka tak saling
    // kenal, jadi tabrakan itu tak masuk akal bagi keduanya.
    await c.query(`INSERT INTO kasbon_purposes (code, label, company_id)
                   VALUES ('UJI-AB', 'bawaan', NULL)`)
    await c.query(`INSERT INTO kasbon_purposes (code, label, company_id)
                   VALUES ('UJI-AB', 'milik A', $1)`, [companyA])
    await c.query(`INSERT INTO kasbon_purposes (code, label, company_id)
                   VALUES ('UJI-AB', 'milik B', $1)`, [companyB])

    // Disaring ke KODE dan KETIGA pemilik yang test ini buat sendiri —
    // bukan `WHERE code = 'UJI-AB'` saja. Penjaga audit-asumsi-global-test
    // menolak bentuk itu, dan penolakannya benar: kode yang sama bisa dipakai
    // shard lain, dan hitungan ini akan ikut menghitungnya.
    const { rows } = await c.query(
      `SELECT count(*)::int n FROM kasbon_purposes
        WHERE code = $1 AND (company_id IS NULL OR company_id IN ($2, $3))`,
      ['UJI-AB', companyA, companyB])
    expect(rows[0].n).toBe(3)
  }, 30_000)

  it('kode kembar DALAM satu tenant ditolak', async () => {
    await c.query('SAVEPOINT s1')
    let ditolak = false
    try {
      await c.query(`INSERT INTO kasbon_purposes (code, label, company_id)
                     VALUES ('UJI-AB', 'duplikat A', $1)`, [companyA])
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT s1')
    expect(ditolak, 'satu tenant bisa punya dua keperluan berkode sama — ' +
      'pilihan mana yang dipakai jadi tergantung urutan baris').toBe(true)
  }, 30_000)

  it('DUA baris bawaan berkode sama ditolak — NULLS NOT DISTINCT', async () => {
    // Tanpa NULLS NOT DISTINCT, Postgres menganggap tiap NULL berbeda dan dua
    // baris bawaan berkode sama lolos. Resolusi overlay lalu mengembalikan DUA
    // baris untuk satu kode — dan yang terpilih bergantung urutan baca.
    await c.query('SAVEPOINT s2')
    let ditolak = false
    try {
      await c.query(`INSERT INTO kasbon_purposes (code, label, company_id)
                     VALUES ('UJI-AB', 'bawaan kembar', NULL)`)
    } catch { ditolak = true }
    await c.query('ROLLBACK TO SAVEPOINT s2')
    expect(ditolak, 'dua baris bawaan berkode sama LOLOS — index bukan ' +
      'NULLS NOT DISTINCT').toBe(true)
  }, 30_000)

  it('policy MEMBACA bawaan tapi hanya MENULIS miliknya sendiri', async () => {
    const { rows } = await c.query(
      `SELECT qual, with_check FROM pg_policies
        WHERE schemaname = current_schema() AND tablename = 'kasbon_purposes'
          AND policyname = 'tenant_isolation'`)
    expect(rows, 'policy tenant_isolation HILANG').toHaveLength(1)

    // USING boleh memuat NULL; WITH CHECK TIDAK BOLEH.
    expect(rows[0].qual,
      'USING tak mengizinkan baris bawaan — tenant tak bisa melihat ' +
      'keperluan standar').toMatch(/company_id IS NULL/)
    expect(rows[0].with_check ?? '',
      'WITH CHECK mengizinkan menulis baris bawaan — satu tenant bisa ' +
      'menyunting data yang dipakai SELURUH tenant lain').not.toMatch(/company_id IS NULL/)
  }, 30_000)
})

describe('material_categories & menu_items — TETAP kategori A', () => {
  // Dijaga supaya tak "diperbaiki". Melihat tabel tanpa company_id di sistem
  // multi-tenant memang terlihat seperti kelalaian — dokumen F2-2 §4.2/§4.4
  // menjelaskan kenapa bukan, dan test ini yang membuat penjelasan itu
  // mengikat.
  it.each(['material_categories', 'menu_items'])(
    '%s TIDAK punya company_id (keputusan F2-2, bukan kelalaian)',
    async (tabel) => {
      const { rows } = await c.query(
        `SELECT count(*)::int n FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1 AND column_name='company_id'`,
        [tabel])
      expect(rows[0].n,
        `${tabel} diberi company_id. Kalau ini disengaja, perbarui dulu ` +
        'docs/adr/F2-2-KLASIFIKASI-TENANCY.md §4 — jangan ubah test ini saja.').toBe(0)
    }, 30_000)

  it('menu_items punya mekanisme per-tenant sendiri', async () => {
    // Alasan menu_items boleh tetap shared: penyesuaian per-company sudah
    // punya tempatnya. Kalau tabel ini hilang, dasar keputusan §4.4 runtuh dan
    // menu_items harus ditinjau ulang.
    const { rows } = await c.query(
      `SELECT count(*)::int n FROM information_schema.tables
        WHERE table_schema='public' AND table_name='company_menu_settings'`)
    expect(rows[0].n,
      'company_menu_settings HILANG — dasar keputusan "menu_items tetap ' +
      'shared" runtuh; tinjau ulang F2-2 §4.4').toBe(1)
  }, 30_000)
})
