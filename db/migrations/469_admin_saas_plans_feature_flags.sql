-- ============================================================================
-- 469 — ADMIN SAAS: plans, plan_features, plan_feature_values, tenant_feature_overrides
-- ============================================================================
--
-- Spec: docs/superpowers/specs/2026-08-22-admin-saas-platform-design.md §4.1
--
-- Key-value (bukan kolom tetap di plans) supaya fitur baru (AI on/off, kuota,
-- dst) dikonfigurasi dari admin-saas tanpa ALTER TABLE — persis filosofi
-- ai_provider_config (250_ai_provider_dan_biaya.sql).
--
-- value_type ditegakkan lewat TRIGGER, bukan CHECK biasa (CHECK harus
-- immutable per-baris, tak bisa subquery ke plan_features).
-- ============================================================================

CREATE TABLE IF NOT EXISTS plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT,
  price_monthly  NUMERIC,
  price_yearly   NUMERIC,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  is_public      BOOLEAN NOT NULL DEFAULT true,
  sort_order     INT NOT NULL DEFAULT 100,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE plans IS
  'Paket langganan SaaS vendor→tenant. is_public=false: plan custom/enterprise, '
  'tak muncul di self-serve. Terpisah dari billing tenant sendiri (invoices).';

CREATE TABLE IF NOT EXISTS plan_features (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key          TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL,
  description  TEXT,
  value_type   TEXT NOT NULL CHECK (value_type IN ('boolean','integer','text'))
);

COMMENT ON TABLE plan_features IS
  'Katalog kapabilitas yang bisa di-toggle per plan (mis. ai_enabled, '
  'ai_monthly_quota, max_users). value_type menentukan kolom mana yang '
  'otoritatif di plan_feature_values/tenant_feature_overrides.';

CREATE TABLE IF NOT EXISTS plan_feature_values (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  feature_id     UUID NOT NULL REFERENCES plan_features(id) ON DELETE CASCADE,
  value_boolean  BOOLEAN,
  value_integer  INTEGER,
  value_text     TEXT,
  CONSTRAINT plan_feature_values_unique UNIQUE (plan_id, feature_id)
);

CREATE TABLE IF NOT EXISTS tenant_feature_overrides (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  feature_id     UUID NOT NULL REFERENCES plan_features(id) ON DELETE CASCADE,
  value_boolean  BOOLEAN,
  value_integer  INTEGER,
  value_text     TEXT,
  reason         TEXT NOT NULL,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ,
  CONSTRAINT tenant_feature_overrides_unique UNIQUE (company_id, feature_id)
);

COMMENT ON COLUMN tenant_feature_overrides.reason IS
  'WAJIB diisi — override tanpa alasan tercatat adalah keputusan uang/akses '
  'tak terlacak (spec §4.1).';

-- ── Trigger validasi value_type — berlaku di KEDUA tabel value ─────────────
CREATE OR REPLACE FUNCTION fn_cek_value_matches_type()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT value_type INTO v_type FROM plan_features WHERE id = NEW.feature_id;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'fn_cek_value_matches_type: feature_id % tidak ditemukan di plan_features', NEW.feature_id;
  END IF;

  IF v_type = 'boolean' AND (NEW.value_integer IS NOT NULL OR NEW.value_text IS NOT NULL) THEN
    RAISE EXCEPTION 'fn_cek_value_matches_type: feature bertipe boolean tapi value_integer/value_text terisi';
  ELSIF v_type = 'integer' AND (NEW.value_boolean IS NOT NULL OR NEW.value_text IS NOT NULL) THEN
    RAISE EXCEPTION 'fn_cek_value_matches_type: feature bertipe integer tapi value_boolean/value_text terisi';
  ELSIF v_type = 'text' AND (NEW.value_boolean IS NOT NULL OR NEW.value_integer IS NOT NULL) THEN
    RAISE EXCEPTION 'fn_cek_value_matches_type: feature bertipe text tapi value_boolean/value_integer terisi';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cek_value_type_plan ON plan_feature_values;
CREATE TRIGGER trg_cek_value_type_plan
  BEFORE INSERT OR UPDATE ON plan_feature_values
  FOR EACH ROW EXECUTE FUNCTION fn_cek_value_matches_type();

DROP TRIGGER IF EXISTS trg_cek_value_type_override ON tenant_feature_overrides;
CREATE TRIGGER trg_cek_value_type_override
  BEFORE INSERT OR UPDATE ON tenant_feature_overrides
  FOR EACH ROW EXECUTE FUNCTION fn_cek_value_matches_type();

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name IN
     ('plans','plan_features','plan_feature_values','tenant_feature_overrides');
  IF n <> 4 THEN
    RAISE EXCEPTION '469 gagal: hanya % dari 4 tabel yang tercipta', n;
  END IF;

  SELECT count(*) INTO n FROM pg_trigger WHERE tgname = 'trg_cek_value_type_plan';
  IF n <> 1 THEN
    RAISE EXCEPTION '469 gagal: trigger trg_cek_value_type_plan tidak terpasang';
  END IF;

  SELECT count(*) INTO n FROM pg_trigger WHERE tgname = 'trg_cek_value_type_override';
  IF n <> 1 THEN
    RAISE EXCEPTION '469 gagal: trigger trg_cek_value_type_override tidak terpasang';
  END IF;

  RAISE NOTICE '469 OK: 4 tabel + 2 trigger validasi value_type terpasang';
END $$;
