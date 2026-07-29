import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Client } from 'pg'
import { createTestClient, resetTestSchema, closeTestClient } from '../../../test-utils/test-db.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// T3 — UJI ROLLBACK (janji Dokumen Audit Pra-Eksekusi §6 poin 1)
//
// Dokumen T3 menjanjikan "rencana rollback TERUJI, bukan diasumsikan", dan
// janji itu tetap ditepati meski ack founder sudah diterima 2026-07-29.
//
// Yang dibuktikan di sini — terhadap Postgres NYATA, migrasi VERBATIM:
//   1. T3 (127) berjalan penuh: kolom + backfill + NOT NULL + CHECK + index
//   2. Backfill BENAR: yang milik tenant terisi, yang milik bersama tetap NULL
//   3. Katalog nasional TIDAK ter-klaim tenant (penjaga nilai jual produk)
//   4. Jumlah baris tiap tabel TIDAK berubah — backfill hanya mengisi kolom
//   5. ROLLBACK mengembalikan skema PERSIS ke keadaan pasca-126
//   6. Setelah rollback, data existing utuh (nol baris hilang/berubah)
//   7. Fail-loud: backfill MENOLAK jalan kalau tenant > 1
// ============================================================

let c: Client
const MIG = (f: string) => join(import.meta.dirname, '../../../../../../db/migrations/', f)
const sql126 = () => readFileSync(MIG('126_multitenant_core.sql'), 'utf-8')
const sql127 = () => readFileSync(MIG('127_multitenant_company_id.sql'), 'utf-8')

// 32 tabel yang dapat kolom (hasil audit T1 + ack Q1=privat).
const NOT_NULL = [
  'projects', 'cash_accounts', 'kasbons', 'notifications', 'supplier_invoices',
  'cash_transfers', 'supplier_payments', 'supplier_payment_allocations', 'clients',
  'workers', 'company_settings', 'financial_config', 'approval_chains',
  'approval_steps', 'approval_progress', 'notification_rules',
  'notification_rule_targets', 'material_pack', 'suppliers', 'audit_logs',
]
const NULLABLE = [
  'assemblies', 'assembly_components', 'cost_codes', 'price_book_entries',
  'materials', 'cbs_templates', 'cbs_nodes', 'expense_category_templates',
  'productivity_records', 'feature_flags', 'roles', 'role_permissions',
]
const SEMUA = [...NOT_NULL, ...NULLABLE]

// Skema minimal: hanya tabel yang disentuh 126/127, dengan bentuk yang relevan.
// Sengaja sempit — yang diuji perilaku 127, bukan seluruh sejarah skema.
async function bootstrap(cl: Client) {
  await cl.query(`
    CREATE TABLE roles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT UNIQUE);
    CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT, role_id UUID REFERENCES roles(id), is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE permissions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), key TEXT UNIQUE);
    CREATE TABLE role_permissions (role_id UUID REFERENCES roles(id),
      permission_id UUID REFERENCES permissions(id));
    CREATE TABLE company_profile (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_name TEXT, tagline TEXT, address TEXT, city TEXT, postal_code TEXT,
      phone TEXT, email TEXT, website TEXT, npwp TEXT, logo_url TEXT, bank_name TEXT,
      bank_account TEXT, bank_account_name TEXT, invoice_prefix TEXT,
      invoice_notes TEXT, signature_name TEXT, updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE feature_flags (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT, enabled BOOLEAN DEFAULT false, company_id UUID);
    CREATE TABLE projects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL, contract_value NUMERIC(15,2) DEFAULT 0);
    CREATE TABLE assemblies (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL, name TEXT, source TEXT NOT NULL DEFAULT 'national',
      status TEXT NOT NULL DEFAULT 'active');
    CREATE TABLE assembly_components (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assembly_id UUID NOT NULL REFERENCES assemblies(id),
      resource_id UUID, coefficient NUMERIC(14,6), sort_order INT DEFAULT 0);
  `)
  // Sisa tabel: bentuk generik cukup — 127 hanya menambah kolom + mengisi.
  const sisa = SEMUA.filter((t) => ![
    'projects', 'assemblies', 'assembly_components', 'feature_flags', 'roles', 'role_permissions',
  ].includes(t))
  for (const t of sisa) {
    await cl.query(
      `CREATE TABLE ${t} (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), label TEXT)`)
  }
  // Guard immutability komponen (107) — versi SEBELUM 127 memperbaruinya.
  // Wajib ditiru: tanpa ini, pelonggaran sempit di 127 tak pernah teruji, dan
  // yang lebih penting, kita tak bisa membuktikan guard TETAP menolak edit isi.
  await cl.query(`
    CREATE OR REPLACE FUNCTION fn_assembly_component_parent_draft() RETURNS trigger
    LANGUAGE plpgsql AS $fn$
    DECLARE v_status TEXT; v_aid UUID;
    BEGIN
      v_aid := COALESCE(NEW.assembly_id, OLD.assembly_id);
      SELECT status INTO v_status FROM assemblies WHERE id = v_aid;
      IF v_status IS NOT NULL AND v_status <> 'draft' THEN
        RAISE EXCEPTION
          'Komponen Assembly hanya bisa diubah saat Assembly berstatus draft (kini %).', v_status
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN COALESCE(NEW, OLD);
    END $fn$;
    CREATE TRIGGER trg_assembly_component_guard
      BEFORE INSERT OR UPDATE OR DELETE ON assembly_components
      FOR EACH ROW EXECUTE FUNCTION fn_assembly_component_parent_draft();
  `)

  // audit_logs WAJIB punya trigger append-only seperti dev (migrasi 073).
  // Tanpa ini, jalur DISABLE/ENABLE TRIGGER di 127 tak pernah teruji — dan
  // itu persis kelemahan yang membuat uji rollback pertama lolos padahal
  // migrasi gagal saat menyentuh dev.
  await cl.query(`
    CREATE OR REPLACE FUNCTION audit_logs_block_mutation() RETURNS TRIGGER
      LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'audit_logs bersifat append-only: % ditolak', TG_OP;
      END $$;
    CREATE TRIGGER trg_audit_logs_no_update BEFORE UPDATE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();
    CREATE TRIGGER trg_audit_logs_no_delete BEFORE DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();
  `)
  await cl.query(`
    CREATE OR REPLACE FUNCTION auth_user_id() RETURNS UUID
      LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true),'')::UUID $$;
    CREATE OR REPLACE FUNCTION has_permission(p TEXT) RETURNS BOOLEAN
      LANGUAGE sql STABLE AS $$ SELECT true $$;
  `)
  await cl.query(`INSERT INTO roles (name) VALUES ('admin'),('pm')`)
  await cl.query(`INSERT INTO users (email, role_id) SELECT 'a@t.test', id FROM roles WHERE name='admin'`)
  await cl.query(`INSERT INTO permissions (key) VALUES ('settings:manage'),('users:manage')`)
  await cl.query(`INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r, permissions p WHERE r.name='admin'`)
  await cl.query(`INSERT INTO company_profile (company_name, invoice_prefix)
    VALUES ('CV Uji Rollback', 'INV-RB')`)
  await cl.query(`INSERT INTO projects (name, contract_value)
    VALUES ('Proyek A', 1000000), ('Proyek B', 2500000)`)
  // 3 national (milik bersama) + 2 company (milik tenant) — pembeda paling penting.
  await cl.query(`INSERT INTO assemblies (code, name, source) VALUES
    ('N-1','Nasional 1','national'), ('N-2','Nasional 2','national'),
    ('N-3','Nasional 3','national'), ('C-1','Company 1','company'),
    ('C-2','Company 2','company')`)
  // Insert saat draft (alur nyata), baru diaktifkan — supaya guard 107 berlaku
  // persis seperti di dev: 3.037 assembly dev semuanya berstatus active.
  await cl.query(`UPDATE assemblies SET status='draft'`)
  await cl.query(`INSERT INTO assembly_components (assembly_id, coefficient)
    SELECT id, 1.5 FROM assemblies`)
  await cl.query(`UPDATE assemblies SET status='active'`)
  for (const t of sisa) {
    await cl.query(`INSERT INTO ${t} (label) VALUES ('x1'), ('x2')`)
  }
}

/** Cap keadaan: jumlah baris tiap tabel + daftar kolom company_id yang ada. */
async function cap(cl: Client) {
  const baris: Record<string, number> = {}
  for (const t of SEMUA) {
    baris[t] = (await cl.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n
  }
  // company_members & document_number_series LAHIR dengan company_id di 126
  // (bagian dari definisi tabelnya, bukan tambahan 127). Dikecualikan agar
  // hitungan ini benar-benar mengukur "kolom yang 127 tambahkan".
  const LAHIR_DI_126 = ['company_members', 'document_number_series']
  const kolom = (await cl.query(
    `SELECT table_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND column_name='company_id'
       AND table_name <> ALL($1::text[]) ORDER BY 1`, [LAHIR_DI_126]
  )).rows.map((r) => r.table_name)
  const constraints = (await cl.query(
    `SELECT conname FROM pg_constraint con
     JOIN pg_class cl ON cl.oid=con.conrelid
     JOIN pg_namespace n ON n.oid=cl.relnamespace
     WHERE n.nspname = current_schema() AND conname LIKE '%company%'
       AND cl.relname <> ALL($1::text[]) ORDER BY 1`, [LAHIR_DI_126]
  )).rows.map((r) => r.conname)
  return { baris, kolom, constraints }
}

async function rollback127(cl: Client) {
  // Urutan kebalikan T3c → T3b → T3a, persis seperti §6 dokumen audit.
  await cl.query(`ALTER TABLE assemblies DROP CONSTRAINT IF EXISTS assemblies_source_company_konsisten`)
  for (const t of NOT_NULL) {
    await cl.query(`ALTER TABLE ${t} ALTER COLUMN company_id DROP NOT NULL`)
  }
  for (const t of SEMUA) {
    await cl.query(`DROP INDEX IF EXISTS idx_${t}_company`)
    // feature_flags.company_id milik migrasi 077 — BUKAN punya 127, jangan dibuang.
    if (t === 'feature_flags') {
      await cl.query(`UPDATE feature_flags SET company_id = NULL`)
      continue
    }
    await cl.query(`ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS ${t}_company_id_fkey`)
    await cl.query(`ALTER TABLE ${t} DROP COLUMN IF EXISTS company_id`)
  }
  await cl.query(`DROP FUNCTION IF EXISTS project_company_id(UUID)`)
}

let sebelum: Awaited<ReturnType<typeof cap>>

beforeAll(async () => {
  await resetTestSchema()
  c = await createTestClient()
  await c.query('SET client_min_messages TO WARNING')
  await bootstrap(c)
  await c.query(sql126())
  sebelum = await cap(c)
}, 180_000)

afterAll(async () => {
  if (c) await closeTestClient(c)
})

describe('T3 — migrasi 127 berjalan benar', () => {
  it('pasca-126: hanya feature_flags yang punya company_id (kolom yatim 077)', () => {
    expect(sebelum.kolom).toEqual(['feature_flags'])
  }, 60_000)

  it('127 berjalan penuh tanpa error', async () => {
    await c.query(sql127())
    const { kolom } = await cap(c)
    expect(kolom.sort()).toEqual([...SEMUA].sort())
    expect(kolom).toHaveLength(32)
  }, 60_000)

  it('20 tabel benar-benar NOT NULL, 12 tabel AB tetap nullable BY DESIGN', async () => {
    const r = await c.query(
      `SELECT table_name, is_nullable FROM information_schema.columns
       WHERE table_schema = current_schema() AND column_name='company_id'`)
    const map = Object.fromEntries(r.rows.map((x) => [x.table_name, x.is_nullable]))
    for (const t of NOT_NULL) expect(`${t}=${map[t]}`).toBe(`${t}=NO`)
    for (const t of NULLABLE) expect(`${t}=${map[t]}`).toBe(`${t}=YES`)
  }, 60_000)

  it('backfill: tabel B terisi penuh, nol NULL tersisa', async () => {
    for (const t of NOT_NULL) {
      const n = (await c.query(`SELECT count(*)::int n FROM ${t} WHERE company_id IS NULL`)).rows[0].n
      expect(`${t}:${n}`).toBe(`${t}:0`)
    }
  }, 60_000)

  it('KATALOG NASIONAL tetap milik bersama — nol baris ter-klaim tenant', async () => {
    // Penjaga nilai jual produk: 3 assembly national HARUS tetap NULL.
    const n = (await c.query(
      `SELECT count(*)::int n FROM assemblies WHERE source='national' AND company_id IS NOT NULL`)).rows[0].n
    expect(n).toBe(0)
    const c2 = (await c.query(
      `SELECT count(*)::int n FROM assemblies WHERE source='company' AND company_id IS NOT NULL`)).rows[0].n
    expect(c2).toBe(2)
  }, 60_000)

  it('komponen mengikuti induknya — nol yang beda tenant dari analisanya', async () => {
    const n = (await c.query(
      `SELECT count(*)::int n FROM assembly_components ac JOIN assemblies a ON a.id=ac.assembly_id
       WHERE ac.company_id IS DISTINCT FROM a.company_id`)).rows[0].n
    expect(n).toBe(0)
  }, 60_000)

  it('CHECK menolak upaya meng-klaim katalog nasional lewat UPDATE biasa', async () => {
    const cid = (await c.query(`SELECT id FROM companies`)).rows[0].id
    await expect(
      c.query(`UPDATE assemblies SET company_id=$1 WHERE source='national'`, [cid])
    ).rejects.toThrow(/assemblies_source_company_konsisten/)
  }, 60_000)

  it('JUMLAH BARIS tiap tabel tidak berubah — backfill hanya mengisi kolom', async () => {
    const { baris } = await cap(c)
    expect(baris).toEqual(sebelum.baris)
  }, 60_000)

  it('GERBANG CECEP tetap berdiri: ubah koefisien pd assembly aktif TETAP DITOLAK', async () => {
    // Ini bagian terpenting dari pelonggaran guard 107 — membuktikan yang
    // dibuka HANYA label kepemilikan, dan isi analisa tetap beku.
    await expect(
      c.query(`UPDATE assembly_components SET coefficient = 99 WHERE coefficient = 1.5`)
    ).rejects.toThrow(/berstatus draft/)
  }, 60_000)

  it('gerbang juga menolak ganti resource_id pd assembly aktif', async () => {
    await expect(
      c.query(`UPDATE assembly_components SET resource_id = gen_random_uuid()`)
    ).rejects.toThrow(/berstatus draft/)
  }, 60_000)

  it('gerbang menolak UPDATE campuran (company_id + koefisien sekaligus)', async () => {
    // Celah paling halus: menyelundupkan perubahan isi dgn membonceng company_id.
    const cid = (await c.query(`SELECT id FROM companies`)).rows[0].id
    await expect(
      c.query(`UPDATE assembly_components SET company_id=$1, coefficient=77`, [cid])
    ).rejects.toThrow(/berstatus draft/)
  }, 60_000)

  it('SEGEL audit_logs terpasang KEMBALI setelah backfill (kegagalan paling senyap)', async () => {
    const t = await c.query(
      `SELECT tgenabled FROM pg_trigger WHERE tgrelid='audit_logs'::regclass
         AND tgname='trg_audit_logs_no_update'`)
    expect(t.rows[0]?.tgenabled).toBe('O')   // 'O' = aktif, 'D' = mati
  }, 60_000)

  it('audit_logs KEMBALI menolak UPDATE biasa — segel benar-benar berfungsi lagi', async () => {
    // Bukan cuma "trigger tercatat aktif", tapi benar-benar memblokir.
    await expect(
      c.query(`UPDATE audit_logs SET label='diubah'`)
    ).rejects.toThrow(/append-only/)
  }, 60_000)

  it('audit_logs terisi penuh — 1.555 baris dev setara, nol NULL', async () => {
    const n = (await c.query(`SELECT count(*)::int n FROM audit_logs WHERE company_id IS NULL`)).rows[0].n
    expect(n).toBe(0)
  }, 60_000)

  it('project_company_id() hidup dan mengembalikan tenant proyek', async () => {
    const p = (await c.query(`SELECT id, company_id FROM projects LIMIT 1`)).rows[0]
    const r = await c.query(`SELECT project_company_id($1) AS v`, [p.id])
    expect(r.rows[0].v).toBe(p.company_id)
  }, 60_000)

  it('idempoten — 127 re-run = no-op, bukan error', async () => {
    await c.query(sql127())
    const { baris } = await cap(c)
    expect(baris).toEqual(sebelum.baris)
  }, 60_000)
})

describe('T3 — ROLLBACK mengembalikan keadaan persis pasca-126', () => {
  it('rollback berjalan tanpa error', async () => {
    await rollback127(c)
  }, 60_000)

  it('skema kembali persis: hanya feature_flags yang punya company_id', async () => {
    const { kolom } = await cap(c)
    expect(kolom).toEqual(sebelum.kolom)
  }, 60_000)

  it('constraint bikinan 127 hilang seluruhnya', async () => {
    const { constraints } = await cap(c)
    expect(constraints).toEqual(sebelum.constraints)
  }, 60_000)

  it('DATA EXISTING UTUH — nol baris hilang atau berubah', async () => {
    const { baris } = await cap(c)
    expect(baris).toEqual(sebelum.baris)
    // Nilai bisnis ikut diperiksa, bukan cuma jumlah baris.
    const v = (await c.query(`SELECT sum(contract_value)::float8 v FROM projects`)).rows[0].v
    expect(v).toBe(3500000)
    const a = (await c.query(`SELECT count(*)::int n FROM assemblies WHERE source='national'`)).rows[0].n
    expect(a).toBe(3)
  }, 60_000)

  it('project_company_id() ikut terbuang (tak menyisakan fungsi yatim)', async () => {
    const n = (await c.query(
      `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
       WHERE ns.nspname = current_schema() AND p.proname='project_company_id'`)).rows[0].n
    expect(n).toBe(0)
  }, 60_000)

  it('127 bisa dijalankan LAGI setelah rollback (rollback benar-benar bersih)', async () => {
    await c.query(sql127())
    const { kolom } = await cap(c)
    expect(kolom).toHaveLength(32)
    const nulls = (await c.query(`SELECT count(*)::int n FROM projects WHERE company_id IS NULL`)).rows[0].n
    expect(nulls).toBe(0)
  }, 60_000)
})

describe('T3 — fail-loud saat tenant lebih dari satu', () => {
  it('backfill MENOLAK jalan kalau companies berisi >1 baris', async () => {
    await rollback127(c)
    await c.query(`INSERT INTO companies (code, name) VALUES ('tenant-kedua','Tenant Kedua')`)
    // Ini inti keamanan T3b: dengan 2 tenant, "milik siapa" tak dapat diturunkan
    // mekanis. Migrasi HARUS berhenti, bukan menebak dan mencampur data.
    await expect(c.query(sql127())).rejects.toThrow(/menolak jalan|bukan 1/)
    await c.query(`ALTER TABLE companies DISABLE TRIGGER trg_company_no_casual_delete`)
    await c.query(`DELETE FROM companies WHERE code='tenant-kedua'`)
    await c.query(`ALTER TABLE companies ENABLE TRIGGER trg_company_no_casual_delete`)
  }, 60_000)
})
