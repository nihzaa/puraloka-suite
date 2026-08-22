-- ============================================================================
-- 470 — ADMIN SAAS: subscriptions, tenant_usage_counters
-- ============================================================================
--
-- Spec §4.1. status HANYA soal billing (trialing/active/past_due/canceled) —
-- suspensi hidup di company_saas_meta.lifecycle_status (migrasi 471), BUKAN
-- di kolom ini. Dua kolom yang bisa menjawab "apakah tenant diblokir" adalah
-- anti-pattern yang eksplisit ditolak di spec (dua sumber kebenaran).
--
-- tenant_usage_counters.feature_key TEXT (bukan feature_id UUID) SENGAJA —
-- baris ini paling sering ditulis kode enforcement kuota (hot path), dan
-- konstanta string langsung lebih murah daripada join demi UUID di titik
-- yang paling sering dieksekusi. plan_features.key tetap UNIQUE, FK sah.
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  plan_id                UUID REFERENCES plans(id),
  status                 TEXT NOT NULL CHECK (status IN ('trialing','active','past_due','canceled')),
  trial_ends_at          TIMESTAMPTZ,
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT false,
  canceled_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN subscriptions.status IS
  'HANYA status billing. Suspensi akses hidup di company_saas_meta.lifecycle_status '
  '(migrasi 471) — jangan tambah nilai suspended di sini (spec §4.1).';

CREATE TABLE IF NOT EXISTS tenant_usage_counters (
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_key   TEXT NOT NULL REFERENCES plan_features(key),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  used_count    INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, feature_key, period_start)
);

COMMENT ON TABLE tenant_usage_counters IS
  'Kuota TERPAKAI, terpisah dari definisi kuota (plan_feature_values). '
  'period_start bagian primary key: periode baru = baris kosong otomatis, '
  'tak ada job reset yang bisa gagal senyap (spec §4.1).';

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN ('subscriptions','tenant_usage_counters');
  IF n <> 2 THEN
    RAISE EXCEPTION '470 gagal: hanya % dari 2 tabel yang tercipta', n;
  END IF;

  -- status TIDAK BOLEH memuat 'suspended' — pastikan CHECK constraint benar.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname LIKE '%subscriptions_status_check%'
       AND pg_get_constraintdef(oid) ILIKE '%suspended%'
  ) THEN
    RAISE EXCEPTION '470 gagal: subscriptions.status memuat suspended — itu milik company_saas_meta';
  END IF;

  RAISE NOTICE '470 OK: 2 tabel terpasang, status TANPA nilai suspended';
END $$;
