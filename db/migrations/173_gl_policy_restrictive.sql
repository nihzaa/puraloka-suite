-- ============================================================
-- PURALOKA SUITE — Migration 173
-- GL: policy dua lapis — permissive (hak) + RESTRICTIVE (tenancy)
-- ============================================================
--
-- ── Cacat di migrasi 167/172, ditangkap gerbang lokal
--
-- Policy `tenant_isolation` GL dibuat PERMISSIVE. Itu membalik artinya:
--
--   PERMISSIVE  di-OR   → MELEBARKAN akses
--   RESTRICTIVE di-AND  → MEMBATASI akses
--
-- Keduanya "jalan" tanpa error. Yang permissive justru menambah jalan masuk
-- alih-alih menutupnya — kebalikan dari maksud sebuah policy isolasi.
--
-- `t5a-policy-tenant.test.ts` menjaga ini dengan kalimat yang tepat: *"satu
-- kata yang salah membalik arti policy"*. Ditangkap `scripts/gerbang.mjs`,
-- bukan oleh review — dan ini kedua kalinya gerbang itu menemukan cacat GL
-- dalam satu jam.
--
-- ── Pola dua lapis yang dipakai repo ini
--
-- Contoh dari `kasbons`:
--
--   kasbons_manage_v2   PERMISSIVE   has_permission('finance:manage')  ← HAK
--   tenant_isolation    RESTRICTIVE  company_id = auth_company_id()    ← TENANCY
--
-- Keduanya perlu, dan tak bisa digabung: RESTRICTIVE sendirian menolak semua
-- (tak ada permissive yang mengizinkan), PERMISSIVE sendirian tak membatasi
-- tenant. Yang benar: hak menentukan SIAPA boleh, tenancy menentukan
-- BARIS MANA — dan keduanya harus terpenuhi.
--
-- ── Capability yang dipakai
--
-- `gl:view` untuk membaca, `gl:manage` untuk menulis (migrasi 171). Sesuai
-- ADR-004: policy memeriksa CAPABILITY, tak pernah nama jabatan.
-- ============================================================

-- ── accounts ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON accounts;
CREATE POLICY tenant_isolation ON accounts
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS accounts_read ON accounts;
CREATE POLICY accounts_read ON accounts
  FOR SELECT USING ((SELECT has_permission('gl:view')));

DROP POLICY IF EXISTS accounts_write ON accounts;
CREATE POLICY accounts_write ON accounts
  FOR ALL USING ((SELECT has_permission('gl:manage')));

-- ── journal_entries ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON journal_entries;
CREATE POLICY tenant_isolation ON journal_entries
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS journal_entries_read ON journal_entries;
CREATE POLICY journal_entries_read ON journal_entries
  FOR SELECT USING ((SELECT has_permission('gl:view')));

DROP POLICY IF EXISTS journal_entries_write ON journal_entries;
CREATE POLICY journal_entries_write ON journal_entries
  FOR ALL USING ((SELECT has_permission('gl:manage')));

-- ── journal_entry_lines ─────────────────────────────────────────────────────
-- Mewarisi tenancy dari kepala jurnal — tak punya `company_id` sendiri,
-- sehingga tak ada dua sumber kebenaran yang bisa berselisih.
DROP POLICY IF EXISTS tenant_isolation ON journal_entry_lines;
CREATE POLICY tenant_isolation ON journal_entry_lines
  AS RESTRICTIVE FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM journal_entries je
       WHERE je.id = journal_entry_lines.entry_id
         AND je.company_id = (SELECT auth_company_id())
    )
  );

DROP POLICY IF EXISTS journal_entry_lines_read ON journal_entry_lines;
CREATE POLICY journal_entry_lines_read ON journal_entry_lines
  FOR SELECT USING ((SELECT has_permission('gl:view')));

DROP POLICY IF EXISTS journal_entry_lines_write ON journal_entry_lines;
CREATE POLICY journal_entry_lines_write ON journal_entry_lines
  FOR ALL USING ((SELECT has_permission('gl:manage')));

-- ── Verifikasi: tenancy RESTRICTIVE, dan ada permissive yang mengizinkan ────
-- Tanpa keduanya, tabel jadi tak bisa diakses siapa pun — dan gejalanya
-- "daftar kosong", bukan error.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','journal_entries','journal_entry_lines'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = current_schema() AND tablename = t
         AND policyname = 'tenant_isolation' AND permissive = 'RESTRICTIVE'
    ) THEN
      RAISE EXCEPTION
        'tenant_isolation di % bukan RESTRICTIVE — ia MELEBARKAN akses, bukan membatasi', t;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = current_schema() AND tablename = t
         AND permissive = 'PERMISSIVE'
    ) THEN
      RAISE EXCEPTION
        'Tak ada policy PERMISSIVE di % — restrictive sendirian menolak SEMUA akses', t;
    END IF;
  END LOOP;
END $$;
