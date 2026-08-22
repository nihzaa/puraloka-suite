-- ============================================================================
-- 502 — ADMIN SAAS: company_saas_meta (status vendor-side satelit companies)
-- ============================================================================
--
-- Spec §4.2. Satelit, BUKAN ALTER TABLE companies — companies.is_active sudah
-- berarti sesuatu bagi tenant admin sendiri, jangan tumpang tindih maknanya.
--
-- access_mode terpisah dari lifecycle_status: suspended+read_only (masa
-- tenggang, tenant TETAP bisa bayar sendiri) vs suspended+blocked (setelah
-- tenggang habis/pelanggaran ToS). read_only TIDAK PERNAH berarti blokir
-- halaman billing tenant sendiri — itu keputusan mengikat di spec §4.2.
-- ============================================================================

CREATE TABLE IF NOT EXISTS company_saas_meta (
  company_id              UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  lifecycle_status        TEXT NOT NULL DEFAULT 'provisioning'
                           CHECK (lifecycle_status IN ('provisioning','active','suspended','canceled')),
  access_mode             TEXT NOT NULL DEFAULT 'full'
                           CHECK (access_mode IN ('full','read_only','blocked')),
  suspended_reason        TEXT,
  suspended_at            TIMESTAMPTZ,
  suspended_by            UUID,
  scheduled_deletion_at   TIMESTAMPTZ,
  onboarding_completed_at TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN company_saas_meta.lifecycle_status IS
  'provisioning yang bertahan >beberapa menit = sinyal gagal-tengah-jalan '
  '(spec §5.1a), bukan status transisi normal.';
COMMENT ON COLUMN company_saas_meta.access_mode IS
  'read_only memblokir OPERASI BISNIS tenant (PO/approval/invoice baru), '
  'BUKAN halaman langganan/billing tenant sendiri — itu wajib tetap penuh '
  'kecuali access_mode=blocked (spec §4.2).';
COMMENT ON COLUMN company_saas_meta.scheduled_deletion_at IS
  'Diisi 90 hari setelah canceled (bukan 30 — data proyek/kontrak konstruksi '
  'punya relevansi legal jangka panjang). Job hard-delete TIDAK dibangun di '
  'sini — itu G-2/destructive, butuh spec+ratifikasi tersendiri.';

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'company_saas_meta';
  IF n <> 1 THEN
    RAISE EXCEPTION '502 gagal: tabel company_saas_meta tidak tercipta';
  END IF;

  RAISE NOTICE '502 OK: company_saas_meta terpasang';
END $$;
