-- ============================================================================
-- 250 — KONFIGURASI PENYEDIA AI + PELACAKAN BIAYA (TJS-B1)
-- ============================================================================
--
-- Founder 2026-08-09: *"termasuk konfigurasi api nya juga yg dikonfig dari ui
-- semua"*. Hari ini model dipaku di env (`ANTHROPIC_MODEL`), jadi mengganti
-- model berarti menyunting berkas server dan me-restart — mustahil untuk SaaS
-- multi-tenant, tempat tiap pelanggan bisa memilih penyedianya sendiri.
--
-- ── Dua tabel, dan kenapa terpisah
--
-- `ai_provider_config`  NIAT   — penyedia & model apa yang dipakai
-- `ai_biaya_token`      FAKTA  — berapa yang benar-benar terpakai
--
-- Menggabungkannya menggoda (satu baris per tenant, kolom `total_biaya`), dan
-- salah: total yang di-update terus-menerus tak bisa menjawab "bulan lalu
-- berapa", "tugas mana yang paling mahal", atau "kenapa tagihannya melonjak
-- Selasa lalu". Riwayat yang tak disimpan tak bisa diminta kembali.
--
-- ── Kenapa biaya dicatat PER RONDE, bukan per pesan
--
-- Diambil dari TJS, dan alasannya terbukti di sana: satu pesan WhatsApp bisa
-- memicu 16 panggilan API berturut-turut (tool-calling). Mencatat per pesan
-- membuat "satu percakapan = satu baris" — dan biaya sesungguhnya tersembunyi
-- di dalamnya.
--
-- ── Kenapa cache-write & cache-read dipisah
--
-- Harganya berbeda jauh dari token biasa: cache write ~1,25x input, cache read
-- ~0,1x. Menjumlahkannya jadi satu angka membuat penghematan caching TIDAK
-- TERLIHAT — dan yang tak terlihat tak akan dioptimalkan.
--
-- ── USD *dan* Rupiah, plus kurs saat mencatat (L-2)
--
-- TJS hanya menyimpan USD. Seluruh ERP ini berbahasa Rupiah, dan
-- `KEPUTUSAN-SCOPE` mencoret multi-currency justru karena semuanya satu mata
-- uang. Kursnya ikut disimpan supaya biaya historis TIDAK BERUBAH saat kurs
-- bergerak — laporan biaya bulan lalu harus tetap sama besok.
--
-- Semua nominal `numeric` (CLAUDE.md §5.4). Nol float.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Konfigurasi penyedia — satu baris per (tenant, asisten)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_provider_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Asisten mana. Dipisah karena tugasnya beda dan modelnya wajar beda:
  -- `insight` menulis dua kalimat (Haiku cukup), sementara asisten yang kelak
  -- memanggil tool butuh penalaran bertingkat.
  asisten     TEXT NOT NULL,

  penyedia    TEXT NOT NULL DEFAULT 'anthropic',
  model       TEXT,
  max_token   INTEGER NOT NULL DEFAULT 1024,
  aktif       BOOLEAN NOT NULL DEFAULT true,

  -- Batas biaya bulanan dalam RUPIAH — mata uang yang dipakai founder saat
  -- memutuskan, bukan yang dipakai penyedia saat menagih.
  batas_bulanan_idr NUMERIC(14,2),
  mode_batas  TEXT NOT NULL DEFAULT 'peringatkan',

  dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_oleh UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT ai_provider_config_unik UNIQUE (company_id, asisten),
  CONSTRAINT ai_provider_config_asisten_sah
    CHECK (asisten IN ('insight', 'owner', 'staff', 'web')),
  CONSTRAINT ai_provider_config_mode_sah
    CHECK (mode_batas IN ('blokir', 'peringatkan')),
  -- Batas token divalidasi BASIS, bukan hanya UI. Nilai 0 atau negatif
  -- membuat tiap panggilan gagal dengan galat yang tak menyebut sebabnya.
  CONSTRAINT ai_provider_config_max_token_wajar
    CHECK (max_token BETWEEN 1 AND 64000),
  CONSTRAINT ai_provider_config_batas_positif
    CHECK (batas_bulanan_idr IS NULL OR batas_bulanan_idr >= 0)
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_config_company
  ON ai_provider_config(company_id);

COMMENT ON TABLE ai_provider_config IS
  'Penyedia & model AI per tenant. API KEY TIDAK di sini — ia di '
  'app_credentials terenkripsi. Tabel config dibaca banyak tempat dan gampang '
  'ikut ter-log.';

-- ------------------------------------------------------------
-- 2. Biaya token — satu baris per RONDE panggilan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_biaya_token (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  asisten     TEXT NOT NULL,
  penyedia    TEXT NOT NULL,
  model       TEXT NOT NULL,

  -- Ronde ke berapa dalam satu percakapan. 1 untuk panggilan tunggal.
  ronde       INTEGER NOT NULL DEFAULT 1,

  token_masuk        INTEGER NOT NULL DEFAULT 0,
  token_keluar       INTEGER NOT NULL DEFAULT 0,
  token_cache_tulis  INTEGER NOT NULL DEFAULT 0,
  token_cache_baca   INTEGER NOT NULL DEFAULT 0,

  -- numeric, bukan float (CLAUDE.md §5.4). Presisi 6 desimal: satu ronde
  -- Haiku bisa berbiaya di bawah seperseribu dolar, dan membulatkannya ke sen
  -- membuat seluruh percakapan tercatat nol.
  biaya_usd   NUMERIC(12,6) NOT NULL DEFAULT 0,
  biaya_idr   NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Kurs SAAT MENCATAT. Tanpa ini, biaya historis ikut berubah tiap kali kurs
  -- bergerak — dan laporan bulan lalu tak lagi sama dengan yang dicetak.
  kurs_idr    NUMERIC(10,2) NOT NULL,

  -- Untuk menelusuri ke request/percakapan asalnya.
  correlation_id UUID,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ai_biaya_token_asisten_sah
    CHECK (asisten IN ('insight', 'owner', 'staff', 'web')),
  CONSTRAINT ai_biaya_token_ronde_positif CHECK (ronde >= 1),
  CONSTRAINT ai_biaya_token_kurs_positif  CHECK (kurs_idr > 0),
  CONSTRAINT ai_biaya_token_nonnegatif CHECK (
    token_masuk >= 0 AND token_keluar >= 0
    AND token_cache_tulis >= 0 AND token_cache_baca >= 0
    AND biaya_usd >= 0 AND biaya_idr >= 0
  )
);

-- Indeks utama: "berapa biaya bulan ini untuk tenant ini" — pertanyaan yang
-- dijalankan SEBELUM tiap panggilan API saat mode blokir aktif.
CREATE INDEX IF NOT EXISTS idx_ai_biaya_company_waktu
  ON ai_biaya_token(company_id, dibuat_pada DESC);
CREATE INDEX IF NOT EXISTS idx_ai_biaya_correlation
  ON ai_biaya_token(correlation_id) WHERE correlation_id IS NOT NULL;

COMMENT ON TABLE ai_biaya_token IS
  'Biaya AI per RONDE tool-calling, bukan per pesan — satu pesan bisa memicu '
  '16 panggilan. Kurs disimpan bersama tiap baris supaya biaya historis tak '
  'berubah saat kurs bergerak.';

-- ------------------------------------------------------------
-- 3. Tenancy — kategori B
-- ------------------------------------------------------------
ALTER TABLE ai_provider_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_biaya_token     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON ai_provider_config;
CREATE POLICY tenant_isolation ON ai_provider_config AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS ai_provider_config_baca ON ai_provider_config;
CREATE POLICY ai_provider_config_baca ON ai_provider_config FOR SELECT USING (true);
DROP POLICY IF EXISTS ai_provider_config_kelola ON ai_provider_config;
CREATE POLICY ai_provider_config_kelola ON ai_provider_config FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation ON ai_biaya_token;
CREATE POLICY tenant_isolation ON ai_biaya_token AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS ai_biaya_token_baca ON ai_biaya_token;
CREATE POLICY ai_biaya_token_baca ON ai_biaya_token FOR SELECT USING (true);
DROP POLICY IF EXISTS ai_biaya_token_kelola ON ai_biaya_token;
CREATE POLICY ai_biaya_token_kelola ON ai_biaya_token FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION fn_ai_provider_config_sentuh()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.diperbarui_pada := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ai_provider_config_sentuh ON ai_provider_config;
CREATE TRIGGER trg_ai_provider_config_sentuh
  BEFORE UPDATE ON ai_provider_config
  FOR EACH ROW EXECUTE FUNCTION fn_ai_provider_config_sentuh();

-- ------------------------------------------------------------
-- 4. Permission
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description, sort_order)
VALUES
  ('settings:ai:view', 'settings', 'Lihat konfigurasi AI',
   'Melihat penyedia, model, dan biaya AI yang terpakai.', 930),
  ('settings:ai:manage', 'settings', 'Kelola konfigurasi AI',
   'Mengganti penyedia, model, batas token, dan batas biaya bulanan.', 931)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE p.key IN ('settings:ai:view', 'settings:ai:manage') AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 5. Seed: `insight` untuk tenant yang punya anggota
--
-- Hanya yang beranggota — pelajaran migrasi 245: menyemai untuk 26 tenant
-- padahal 25 di antaranya tenant uji kosong menghasilkan 50 baris yang tak
-- pernah dipakai, dan barisan mati melatih mata mengabaikan tabelnya.
-- ------------------------------------------------------------
INSERT INTO ai_provider_config (company_id, asisten, penyedia, model, max_token, aktif)
SELECT DISTINCT c.id, 'insight', 'anthropic', 'claude-haiku-4-5', 1024, true
FROM companies c
WHERE EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = c.id)
ON CONFLICT (company_id, asisten) DO NOTHING;

-- ------------------------------------------------------------
-- 6. Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE v_seed INT;
BEGIN
  IF to_regclass('public.ai_provider_config') IS NULL THEN
    RAISE EXCEPTION '250 gagal: ai_provider_config tidak terbentuk';
  END IF;
  IF to_regclass('public.ai_biaya_token') IS NULL THEN
    RAISE EXCEPTION '250 gagal: ai_biaya_token tidak terbentuk';
  END IF;

  FOR v_seed IN
    SELECT 1 FROM (VALUES ('ai_provider_config'), ('ai_biaya_token')) t(n)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = t.n AND policyname = 'tenant_isolation' AND permissive = 'RESTRICTIVE'
    )
  LOOP
    RAISE EXCEPTION '250 gagal: ada tabel tanpa tenant_isolation RESTRICTIVE';
  END LOOP;

  /*
    ⚠ Seed di atas disaring `WHERE EXISTS (company_members)` — dan pagar ini
    harus memakai syarat yang SAMA. Diperbaiki 2026-09-04 (preseden 212 & 016).

    Di schema BERSIH tak ada satu pun `users`, dan migrasi 126 mengisi
    `company_members` DARI tabel users. Nol user berarti nol anggota, jadi
    seed-nya memang nol — bukan gagal.

    Diukur di CI: replay bersih lolos 249 migrasi lalu tumbang di sini dengan
    pesan yang menuduh seed-nya. Seed-nya benar; pagarnya yang membaca
    "kosong" sebagai "rusak" — bentuk yang sama persis dengan 245, dan
    komentar di atas seed ini bahkan MENYEBUT pelajaran 245.

    Pola yang dipakai di sini sudah ada di repo ini: migrasi 270 menjaga
    pemeriksaannya dengan `IF v_comp IS NOT NULL THEN`. Itu yang ditiru,
    bukan pendekatan baru.
  */
  SELECT count(*) INTO v_seed FROM ai_provider_config WHERE asisten = 'insight';
  IF v_seed = 0 AND EXISTS (SELECT 1 FROM company_members) THEN
    RAISE EXCEPTION
      '250 gagal: config insight tidak ter-seed padahal ada tenant beranggota';
  END IF;

  -- Nominal WAJIB numeric, bukan float (CLAUDE.md §5.4).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_biaya_token'
      AND column_name IN ('biaya_usd', 'biaya_idr', 'kurs_idr')
      AND data_type <> 'numeric'
  ) THEN
    RAISE EXCEPTION '250 gagal: ada kolom nominal yang bukan numeric';
  END IF;

  -- CHECK kurs benar-benar menolak nol.
  BEGIN
    INSERT INTO ai_biaya_token (company_id, asisten, penyedia, model, kurs_idr)
    VALUES ((SELECT id FROM companies LIMIT 1), 'insight', 'anthropic', 'uji', 0);
    RAISE EXCEPTION '250 gagal: kurs 0 tidak ditolak';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  -- CHECK max_token menolak nilai tak wajar.
  BEGIN
    INSERT INTO ai_provider_config (company_id, asisten, max_token)
    VALUES ((SELECT id FROM companies LIMIT 1), 'web', 0);
    RAISE EXCEPTION '250 gagal: max_token 0 tidak ditolak';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END $$;
