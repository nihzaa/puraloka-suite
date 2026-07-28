import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, assertTestIsolation, resetTestSchema, closeTestClient } from '../../../test-utils/test-db.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// T2 — Skema inti multi-tenant (ADR-011 §4, migration 124)
//
// Dijalankan terhadap schema `test` terisolasi, memakai FILE MIGRATION ASLI —
// bukan tulis-ulang skema — supaya yang diuji adalah artefak yang benar-benar
// akan di-apply ke dev/produksi.
//
// Yang dijaga test ini (semuanya gagal-diam kalau tak diuji):
//   1. companies + company_members + document_number_series lahir dgn benar
//   2. Seed tenant pertama DIBACA dari company_profile — tidak hardcode nama
//   3. Peran existing setiap user DIPERTAHANKAN (nol perubahan otorisasi)
//   4. Migrasi idempoten (re-run = no-op, bukan tenant dobel)
//   5. Tenant tak bisa dihapus sembarangan
//   6. P1 (ADR-011 §9.5): auth_company_id() TIDAK jatuh ke "satu-satunya
//      company yang ada" saat tak dapat ditentukan — ini yang membuat jalur
//      multi-tenant benar-benar teruji sejak hari pertama
//   7. Dua tenant hidup berdampingan tanpa saling merusak (bibit fixture P2)
// ============================================================

let c: Client
const MIG = join(import.meta.dirname, '../../../../../../db/migrations/124_multitenant_core.sql')

// Skema minimal yang dibutuhkan 124: users, roles, company_profile, feature_flags.
// Sengaja dibuat manual & sempit supaya test ini cepat dan tidak ikut menyeret
// 123 migration lain — yang diuji adalah 124, bukan seluruh sejarah skema.
async function bootstrapPrasyarat(cl: Client) {
  await cl.query(`
    CREATE TABLE roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE);
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT, full_name TEXT,
      role_id UUID REFERENCES roles(id),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE company_profile (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_name TEXT, tagline TEXT, address TEXT, city TEXT, postal_code TEXT,
      phone TEXT, email TEXT, website TEXT, npwp TEXT, logo_url TEXT,
      bank_name TEXT, bank_account TEXT, bank_account_name TEXT,
      invoice_prefix TEXT, invoice_notes TEXT, signature_name TEXT,
      updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE feature_flags (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT, enabled BOOLEAN DEFAULT false, company_id UUID);
    CREATE TABLE permissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), key TEXT UNIQUE);
  `)
  // has_permission()/auth_user_id() dipakai policy 124. Di schema test kita beri
  // stub agar CREATE POLICY bisa di-resolve; perilaku RLS-nya sendiri diuji di
  // T5, bukan di sini (konsisten dgn catatan runMigrations: test app-level
  // memakai service_role yang bypass RLS).
  await cl.query(`
    CREATE OR REPLACE FUNCTION auth_user_id() RETURNS UUID
      LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true),'')::UUID $$;
    CREATE OR REPLACE FUNCTION has_permission(p TEXT) RETURNS BOOLEAN
      LANGUAGE sql STABLE AS $$ SELECT true $$;
  `)
  await cl.query(`INSERT INTO roles (name) VALUES ('admin'),('pm'),('mandor'),('client')`)
  await cl.query(`
    INSERT INTO users (email, full_name, role_id)
    SELECT 'admin@t.test','Admin Satu', id FROM roles WHERE name='admin'`)
  await cl.query(`
    INSERT INTO users (email, full_name, role_id)
    SELECT 'pm@t.test','PM Satu', id FROM roles WHERE name='pm'`)
  await cl.query(`
    INSERT INTO users (email, full_name, role_id)
    SELECT 'mandor@t.test','Mandor Satu', id FROM roles WHERE name='mandor'`)
  // Nama sengaja BUKAN "Puraloka" — kalau migrasi meng-hardcode nama founder,
  // test ini yang menangkapnya.
  await cl.query(`
    INSERT INTO company_profile (company_name, address, invoice_prefix, signature_name)
    VALUES ('CV Uji Beton Sejahtera', 'Jl. Test No. 1', 'INV-UJI', 'Penanda Tangan')`)
}

async function applyMigrasi124(cl: Client) {
  await cl.query(readFileSync(MIG, 'utf-8'))
}

beforeAll(async () => {
  // resetTestSchema() DULU, baru createTestClient() — pola wajib semua suite yang
  // menjalankan migration (lihat edition-axis.test.ts). Suite lain juga me-reset
  // schema yang sama; tanpa reset sendiri, suite ini bergantung pada sisa
  // pekerjaan suite sebelumnya. Itulah penyebab gagal di CI (schema
  // test_<run_id> tidak ada) padahal lokal lulus: lokal kebetulan punya schema
  // `test` yang tertinggal dari run terdahulu.
  await resetTestSchema()
  c = await createTestClient()
  await assertTestIsolation(c)
  await c.query('SET client_min_messages TO WARNING')
  await bootstrapPrasyarat(c)
  await applyMigrasi124(c)
}, 120_000)

afterAll(async () => {
  if (c) await closeTestClient(c)
})

describe('T2 — struktur skema inti', () => {
  it('membuat 3 tabel inti di schema test (bukan public)', async () => {
    // current_schema(), BUKAN konstanta TEST_SCHEMA: di CI nama schema-nya
    // test_<run_id> dan yang menentukan tabel mendarat di mana adalah
    // search_path koneksi ini, bukan nilai env. Memakai konstanta membuat
    // assertion menguji hal yang berbeda dari yang sebenarnya terjadi.
    const r = await c.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name IN
         ('companies','company_members','document_number_series') ORDER BY 1`
    )
    expect(r.rows.map((x) => x.table_name)).toEqual([
      'companies', 'company_members', 'document_number_series',
    ])
    // Sekaligus buktikan isolasi: yang barusan dibuat BUKAN di public.
    expect((await c.query(`SELECT current_schema() AS s`)).rows[0].s).not.toBe('public')
  })

  it('code perusahaan divalidasi format slug — huruf besar/spasi ditolak', async () => {
    await expect(
      c.query(`INSERT INTO companies (code, name) VALUES ('Huruf Besar','X')`)
    ).rejects.toThrow(/companies_code_format/)
  })

  it('code unik — dua tenant tak boleh berbagi code', async () => {
    const kode = (await c.query(`SELECT code FROM companies LIMIT 1`)).rows[0].code
    await expect(
      c.query(`INSERT INTO companies (code, name) VALUES ($1,'Kembar')`, [kode])
    ).rejects.toThrow(/companies_code_unique/)
  })

  it('company tak boleh jadi induk dirinya sendiri', async () => {
    const id = (await c.query(`SELECT id FROM companies LIMIT 1`)).rows[0].id
    await expect(
      c.query(`UPDATE companies SET parent_company_id=$1 WHERE id=$1`, [id])
    ).rejects.toThrow(/companies_no_self_parent/)
  })

  it('feature_flags.company_id akhirnya punya FK (yatim sejak migration 077)', async () => {
    // 'feature_flags'::regclass di-resolve lewat search_path koneksi ini —
    // otomatis menunjuk schema test yang sedang dipakai, tanpa merangkai nama.
    const r = await c.query(
      `SELECT 1 FROM pg_constraint
       WHERE conname='feature_flags_company_id_fkey'
         AND conrelid = 'feature_flags'::regclass`
    )
    expect(r.rowCount).toBe(1)
  })

  it('document_number_series unik per (company, jenis, periode)', async () => {
    const cid = (await c.query(`SELECT id FROM companies LIMIT 1`)).rows[0].id
    await c.query(
      `INSERT INTO document_number_series (company_id, doc_type, period) VALUES ($1,'invoice','2026')`, [cid])
    await expect(
      c.query(`INSERT INTO document_number_series (company_id, doc_type, period) VALUES ($1,'invoice','2026')`, [cid])
    ).rejects.toThrow(/dns_unique/)
    await c.query(`DELETE FROM document_number_series WHERE company_id=$1`, [cid])
  })

  it('last_number tak boleh negatif (counter monoton naik)', async () => {
    const cid = (await c.query(`SELECT id FROM companies LIMIT 1`)).rows[0].id
    await expect(
      c.query(`INSERT INTO document_number_series (company_id, doc_type, period, last_number)
               VALUES ($1,'po','-',-1)`, [cid])
    ).rejects.toThrow(/last_number/)
  })
})

describe('T2 — seed tenant pertama (dibaca, bukan dihardcode)', () => {
  it('tenant lahir dengan nama dari company_profile, BUKAN nama founder', async () => {
    const r = await c.query(`SELECT code, name, invoice_prefix, signature_name FROM companies`)
    expect(r.rowCount).toBe(1)
    expect(r.rows[0].name).toBe('CV Uji Beton Sejahtera')
    expect(r.rows[0].code).toBe('cv-uji-beton-sejahtera')
    expect(r.rows[0].invoice_prefix).toBe('INV-UJI')
    // Penjaga guardrail "jangan hardcode Puraloka Persada di logic":
    expect(r.rows[0].name).not.toMatch(/puraloka/i)
  })

  it('SEMUA user existing jadi anggota, dengan peran yang DIPERTAHANKAN', async () => {
    const r = await c.query(
      `SELECT r.name, count(*)::int n FROM company_members cm
       JOIN roles r ON r.id=cm.role_id GROUP BY r.name ORDER BY r.name`)
    expect(r.rows).toEqual([
      { name: 'admin', n: 1 }, { name: 'mandor', n: 1 }, { name: 'pm', n: 1 },
    ])
    // Nol perubahan otorisasi: peran di keanggotaan == peran lama di users.
    const beda = await c.query(
      `SELECT count(*)::int n FROM company_members cm
       JOIN users u ON u.id=cm.user_id WHERE cm.role_id IS DISTINCT FROM u.role_id`)
    expect(beda.rows[0].n).toBe(0)
  })

  it('tepat satu company default per user', async () => {
    const r = await c.query(
      `SELECT count(*)::int n FROM (
         SELECT user_id FROM company_members WHERE is_default
         GROUP BY user_id HAVING count(*) > 1) x`)
    expect(r.rows[0].n).toBe(0)
  })

  it('idempoten — re-run migrasi TIDAK melahirkan tenant kedua', async () => {
    await applyMigrasi124(c)
    const r = await c.query(`SELECT count(*)::int n FROM companies`)
    expect(r.rows[0].n).toBe(1)
    const m = await c.query(`SELECT count(*)::int n FROM company_members`)
    expect(m.rows[0].n).toBe(3)
  })
})

describe('T2 — guard penghapusan tenant', () => {
  it('DELETE company ditolak dengan pesan yang mengarahkan ke nonaktifkan', async () => {
    await expect(c.query(`DELETE FROM companies`)).rejects.toThrow(/tidak boleh dihapus/)
  })

  it('nonaktifkan (is_active=false) tetap boleh — itu jalur yang benar', async () => {
    await c.query(`UPDATE companies SET is_active=false`)
    expect((await c.query(`SELECT is_active FROM companies`)).rows[0].is_active).toBe(false)
    await c.query(`UPDATE companies SET is_active=true`)
  })
})

describe('T2 — P1: company pertama diperlakukan tenant biasa (ADR-011 §9.5)', () => {
  it('auth_company_id() NULL saat tak dapat ditentukan — TIDAK jatuh ke satu-satunya company', async () => {
    // Inti P1. Kalau migrasi memakai jalan pintas "kalau cuma ada satu company,
    // pakai itu saja", ekspektasi di bawah gagal — dan memang HARUS gagal,
    // karena jalan pintas itulah yang bikin jalur multi-tenant tak pernah
    // teruji sampai tenant kedua muncul di produksi.
    await c.query(`BEGIN`)
    await c.query(`SELECT set_config('app.company_id','',true)`)
    await c.query(`SELECT set_config('app.user_id','',true)`)
    const r = await c.query(`SELECT auth_company_id() AS cid`)
    await c.query(`ROLLBACK`)
    expect(r.rows[0].cid).toBeNull()
  })

  it('auth_company_id() memakai default keanggotaan saat user dikenali', async () => {
    const u = (await c.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin'`)).rows[0].id
    const expected = (await c.query(`SELECT id FROM companies`)).rows[0].id
    await c.query(`BEGIN`)
    await c.query(`SELECT set_config('app.user_id',$1,true)`, [u])
    const r = await c.query(`SELECT auth_company_id() AS cid`)
    await c.query(`ROLLBACK`)
    expect(r.rows[0].cid).toBe(expected)
  })

  it('app.company_id eksplisit MENANG atas default keanggotaan (company switcher)', async () => {
    const kedua = (await c.query(
      `INSERT INTO companies (code, name) VALUES ('tenant-b','Tenant B') RETURNING id`)).rows[0].id
    const u = (await c.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin'`)).rows[0].id
    await c.query(`BEGIN`)
    await c.query(`SELECT set_config('app.user_id',$1,true)`, [u])
    await c.query(`SELECT set_config('app.company_id',$1,true)`, [kedua])
    const r = await c.query(`SELECT auth_company_id() AS cid`)
    await c.query(`ROLLBACK`)
    expect(r.rows[0].cid).toBe(kedua)
    await c.query(`DELETE FROM company_members WHERE company_id=$1`, [kedua])
    await c.query(`ALTER TABLE companies DISABLE TRIGGER trg_company_no_casual_delete`)
    await c.query(`DELETE FROM companies WHERE id=$1`, [kedua])
    await c.query(`ALTER TABLE companies ENABLE TRIGGER trg_company_no_casual_delete`)
  })

  it('is_member_of() jujur: false untuk company yang bukan miliknya', async () => {
    const u = (await c.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin'`)).rows[0].id
    const asing = (await c.query(
      `INSERT INTO companies (code,name) VALUES ('tenant-asing','Asing') RETURNING id`)).rows[0].id
    const sendiri = (await c.query(`SELECT id FROM companies WHERE code <> 'tenant-asing'`)).rows[0].id
    await c.query(`BEGIN`)
    await c.query(`SELECT set_config('app.user_id',$1,true)`, [u])
    const ya = await c.query(`SELECT is_member_of($1) AS v`, [sendiri])
    const tidak = await c.query(`SELECT is_member_of($1) AS v`, [asing])
    await c.query(`ROLLBACK`)
    expect(ya.rows[0].v).toBe(true)
    expect(tidak.rows[0].v).toBe(false)
    await c.query(`ALTER TABLE companies DISABLE TRIGGER trg_company_no_casual_delete`)
    await c.query(`DELETE FROM companies WHERE id=$1`, [asing])
    await c.query(`ALTER TABLE companies ENABLE TRIGGER trg_company_no_casual_delete`)
  })
})

describe('T2 — dua tenant berdampingan (bibit fixture P2)', () => {
  it('user yang sama boleh jadi anggota 2 company dengan peran BERBEDA (D6)', async () => {
    const b = (await c.query(
      `INSERT INTO companies (code,name) VALUES ('tenant-b2','Tenant B2') RETURNING id`)).rows[0].id
    const u = (await c.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='admin'`)).rows[0].id
    const pmRole = (await c.query(`SELECT id FROM roles WHERE name='pm'`)).rows[0].id

    await c.query(
      `INSERT INTO company_members (company_id, user_id, role_id, is_default)
       VALUES ($1,$2,$3,false)`, [b, u, pmRole])

    const peran = await c.query(
      `SELECT co.code, r.name FROM company_members cm
       JOIN companies co ON co.id=cm.company_id
       JOIN roles r ON r.id=cm.role_id
       WHERE cm.user_id=$1`, [u])
    // admin di tenant asal, pm di tenant B2 — inilah alasan peran TIDAK boleh
    // tinggal di users.role_id (audit T1 §5, kategori D).
    // Diperiksa sbg PASANGAN company→peran, bukan urutan baris: urutan bergantung
    // pada nilai `code` dan bukan bagian dari kontrak yang sedang diuji.
    const map = Object.fromEntries(peran.rows.map((x) => [x.code, x.name]))
    expect(map['tenant-b2']).toBe('pm')
    expect(map['cv-uji-beton-sejahtera']).toBe('admin')
    expect(Object.keys(map)).toHaveLength(2)

    await c.query(`DELETE FROM company_members WHERE company_id=$1`, [b])
    await c.query(`ALTER TABLE companies DISABLE TRIGGER trg_company_no_casual_delete`)
    await c.query(`DELETE FROM companies WHERE id=$1`, [b])
    await c.query(`ALTER TABLE companies ENABLE TRIGGER trg_company_no_casual_delete`)
  })

  it('keanggotaan ganda di company yang SAMA ditolak', async () => {
    const cid = (await c.query(`SELECT id FROM companies LIMIT 1`)).rows[0].id
    const u = (await c.query(`SELECT id FROM users LIMIT 1`)).rows[0].id
    const rid = (await c.query(`SELECT id FROM roles LIMIT 1`)).rows[0].id
    await expect(
      c.query(`INSERT INTO company_members (company_id,user_id,role_id) VALUES ($1,$2,$3)`,
        [cid, u, rid])
    ).rejects.toThrow(/company_members_unique/)
  })

  it('menghapus company mem-CASCADE keanggotaannya, tanpa menyentuh users', async () => {
    const b = (await c.query(
      `INSERT INTO companies (code,name) VALUES ('tenant-c','Tenant C') RETURNING id`)).rows[0].id
    const u = (await c.query(`SELECT id FROM users LIMIT 1`)).rows[0].id
    const rid = (await c.query(`SELECT id FROM roles LIMIT 1`)).rows[0].id
    await c.query(`INSERT INTO company_members (company_id,user_id,role_id) VALUES ($1,$2,$3)`, [b, u, rid])
    const sebelum = (await c.query(`SELECT count(*)::int n FROM users`)).rows[0].n

    await c.query(`ALTER TABLE companies DISABLE TRIGGER trg_company_no_casual_delete`)
    await c.query(`DELETE FROM companies WHERE id=$1`, [b])
    await c.query(`ALTER TABLE companies ENABLE TRIGGER trg_company_no_casual_delete`)

    expect((await c.query(
      `SELECT count(*)::int n FROM company_members WHERE company_id=$1`, [b])).rows[0].n).toBe(0)
    // user TIDAK ikut terhapus — identitas hidup lintas tenant (kategori D).
    expect((await c.query(`SELECT count(*)::int n FROM users`)).rows[0].n).toBe(sebelum)
  })
})
