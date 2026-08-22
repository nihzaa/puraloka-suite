-- ============================================================================
-- 503 — ADMIN SAAS: saas_invoices, saas_invoice_line_items
-- ============================================================================
--
-- Spec §4.3. Tabel BARU, bukan reuse invoices/invoice_line_items existing —
-- itu AR tenant→klien konstruksi (project_id, termin_schedule_id). Mencampur
-- tagihan VENDOR→TENANT ke situ akan mengotori laporan finansial tenant
-- dengan baris yang bukan uang proyek mereka — kesalahan kategori.
--
-- ON DELETE SET NULL (bukan CASCADE) ke companies/subscriptions: riwayat
-- tagihan vendor adalah dokumen keuangan vendor sendiri (pembukuan/pajak),
-- tak boleh ikut lenyap saat job hard-delete tenant 90-hari jalan nanti.
--
-- currency dikunci CHECK ='IDR' — proyek ini IDR-only by design
-- (KEPUTUSAN-SCOPE-ERP-AI.md), bukan longgar untuk ekspansi yang belum
-- diputuskan.
-- ============================================================================

CREATE TABLE IF NOT EXISTS saas_invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID REFERENCES companies(id) ON DELETE SET NULL,
  subscription_id    UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  invoice_number     TEXT NOT NULL UNIQUE,
  period_start       DATE,
  period_end         DATE,
  amount             NUMERIC NOT NULL CHECK (amount >= 0),
  currency           TEXT NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
  status             TEXT NOT NULL CHECK (status IN ('draft','sent','paid','overdue','void')),
  due_date           DATE,
  paid_at            TIMESTAMPTZ,
  payment_reference  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas_invoice_line_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES saas_invoices(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  amount       NUMERIC NOT NULL
);

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n INT;
  v_fk_delete_rule TEXT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN ('saas_invoices','saas_invoice_line_items');
  IF n <> 2 THEN
    RAISE EXCEPTION '503 gagal: hanya % dari 2 tabel yang tercipta', n;
  END IF;

  -- company_id FK WAJIB ON DELETE SET NULL, bukan CASCADE.
  SELECT confdeltype INTO v_fk_delete_rule
    FROM pg_constraint
   WHERE conrelid = 'saas_invoices'::regclass
     AND confrelid = 'companies'::regclass;
  IF v_fk_delete_rule <> 'n' THEN  -- 'n' = SET NULL, 'c' = CASCADE
    RAISE EXCEPTION '503 gagal: FK saas_invoices.company_id bukan ON DELETE SET NULL (rule=%)', v_fk_delete_rule;
  END IF;

  RAISE NOTICE '503 OK: 2 tabel terpasang, FK company_id = SET NULL (bukan CASCADE)';
END $$;
