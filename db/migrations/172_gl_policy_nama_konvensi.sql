-- ============================================================
-- PURALOKA SUITE — Migration 172
-- GL: samakan nama policy dengan konvensi `tenant_isolation`
-- ============================================================
--
-- ── Cacat di migrasi 167, ditangkap gerbang lokal
--
-- Policy tenancy GL diberi nama `accounts_tenant_isolation`,
-- `journal_entries_tenant_isolation`, dan `journal_entry_lines_tenant_isolation`.
-- Konvensi repo ini `tenant_isolation` POLOS — nama tabel sudah ada di kolom
-- `tablename`, jadi mengulangnya di nama policy tak menambah informasi.
--
-- Bukan soal rapi: `t7-exit-criteria-l2.test.ts` memeriksa checklist L2
-- ("dual-axis RLS aktif") dengan mencocokkan `policyname='tenant_isolation'`
-- pada SETIAP tabel ber-tenant. Nama yang menyimpang membuat tabel GL
-- terlihat TAK PUNYA policy sama sekali — padahal punya.
--
-- Kalau tak diperbaiki, ada dua kerugian sekaligus: exit criteria L2 gagal,
-- dan yang lebih halus — tabel GL akan luput dari setiap pemeriksaan
-- berikutnya yang memakai konvensi itu.
--
-- Ditangkap `scripts/gerbang.mjs` pada jalan pertamanya, bukan oleh review.
--
-- ── Dampak ke keamanan: NOL
--
-- Isi policy tak berubah sedikit pun — hanya namanya. RLS tetap aktif selama
-- proses ini: `DROP` & `CREATE` berjalan dalam satu transaksi migrasi.
-- ============================================================

DROP POLICY IF EXISTS accounts_tenant_isolation ON accounts;
DROP POLICY IF EXISTS tenant_isolation ON accounts;
CREATE POLICY tenant_isolation ON accounts
  FOR ALL USING (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS journal_entries_tenant_isolation ON journal_entries;
DROP POLICY IF EXISTS tenant_isolation ON journal_entries;
CREATE POLICY tenant_isolation ON journal_entries
  FOR ALL USING (company_id = (SELECT auth_company_id()));

-- Baris jurnal mewarisi tenancy dari kepalanya — tak punya `company_id`
-- sendiri, jadi tak ada dua sumber kebenaran yang bisa berselisih.
DROP POLICY IF EXISTS journal_entry_lines_tenant_isolation ON journal_entry_lines;
DROP POLICY IF EXISTS tenant_isolation ON journal_entry_lines;
CREATE POLICY tenant_isolation ON journal_entry_lines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM journal_entries je
       WHERE je.id = journal_entry_lines.entry_id
         AND je.company_id = (SELECT auth_company_id())
    )
  );

-- ── Verifikasi: ketiganya bernama `tenant_isolation` dan RLS tetap menyala ──
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','journal_entries','journal_entry_lines'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = current_schema() AND tablename = t
         AND policyname = 'tenant_isolation'
    ) THEN
      RAISE EXCEPTION 'Policy tenant_isolation tak ada di % sesudah migrasi 172', t;
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class
             WHERE oid = to_regclass(current_schema() || '.' || t)) THEN
      RAISE EXCEPTION 'RLS mati di % sesudah migrasi 172', t;
    END IF;
  END LOOP;
END $$;
