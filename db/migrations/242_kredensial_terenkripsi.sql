-- ============================================================================
-- 242 — KREDENSIAL TERENKRIPSI (TJS-A1)
-- ============================================================================
--
-- Prasyarat seluruh lapisan AI: konfigurasi penyedia dari UI (permintaan
-- founder eksplisit), pengiriman WhatsApp, dan integrasi pihak ketiga
-- semuanya butuh tempat menyimpan kunci PER TENANT. `.env` server hanya
-- sanggup menampung satu.
--
-- ── Kenapa TIDAK memakai `company_settings` yang sudah ada
--
-- `company_settings` adalah key-value JSONB per tenant, dan bentuknya memang
-- pas untuk konfigurasi. Tapi nilainya terbaca siapa pun yang men-`SELECT`
-- tabel itu — termasuk halaman pengaturan lain, ekspor, dan dump. Kredensial
-- butuh tabel yang kolom rahasianya TAK PERNAH ikut di-select, dan itu hanya
-- bisa ditegakkan kalau ia tabel tersendiri.
--
-- ── Kenapa terenkripsi, padahal DB-nya sudah privat
--
-- Alasan yang sama yang membuat TJS memilihnya, dan alasan itu benar: dump
-- basis data mengalir ke tempat lain (backup, salinan pengembangan, unduhan
-- dukungan) tanpa melewati proses redaksi yang dilalui `.env`. Plaintext di
-- DB karenanya justru LEBIH buruk daripada `.env`.
--
-- ── Kenapa enkripsi di APLIKASI, bukan `pgcrypto`
--
-- `pgcrypto` aktif di basis ini (migrasi 001) dan menggoda dipakai. Tapi
-- `pgp_sym_encrypt(nilai, kunci)` mengirim KUNCINYA sebagai parameter query —
-- dan parameter query mendarat di `pg_stat_statements`, log statement lambat,
-- serta jejak galat. Enkripsi di aplikasi membuat kuncinya tak pernah
-- menyeberang batas jaringan.
--
-- Tabel ini karenanya menyimpan ciphertext sebagai TEXT dan tak tahu apa-apa
-- soal algoritmanya. Formatnya berversi (`v1:iv:tag:ciphertext`) supaya
-- algoritma bisa dirotasi tanpa migrasi tabel.
--
-- ── Yang SENGAJA disimpan tanpa enkripsi
--
-- `empat_akhir` — empat karakter terakhir nilai aslinya. Inilah yang membuat
-- UI bisa menampilkan `••••a1b2` sehingga admin tahu kunci mana yang tersimpan
-- tanpa pernah menerima nilainya. Empat karakter tak cukup untuk menebak
-- sisanya, dan tanpa itu satu-satunya cara memastikan "kunci yang benar sudah
-- terpasang" adalah mengirim nilainya ke browser — persis yang dilarang.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Tabel
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_credentials (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Nama kunci, mis. 'ANTHROPIC_API_KEY'. Bukan enum: penyedia baru muncul
  -- lebih sering daripada migrasi, dan katalog kunci yang sah ditegakkan di
  -- aplikasi (satu daftar, satu tempat) — bukan di CHECK yang harus dimigrasi
  -- tiap kali.
  kunci        TEXT NOT NULL,

  -- Ciphertext. Format berversi; tabel ini tak menafsirkannya.
  nilai_enc    TEXT NOT NULL,

  -- 4 karakter terakhir nilai ASLI, untuk ditampilkan. Lihat catatan di atas.
  empat_akhir  TEXT,

  catatan      TEXT,
  diperbarui_oleh UUID REFERENCES users(id) ON DELETE SET NULL,
  dibuat_pada  TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Satu nilai per (tenant, kunci). Tanpa ini, dua baris untuk kunci yang sama
  -- membuat "kredensial mana yang berlaku" jadi pertanyaan tanpa jawaban.
  CONSTRAINT app_credentials_unik UNIQUE (company_id, kunci),

  -- Empat karakter, bukan lebih. Batas ini ditegakkan basis supaya tak ada
  -- yang kelak menaruh separuh kunci di sini "supaya lebih jelas di UI".
  CONSTRAINT app_credentials_empat_akhir_pendek CHECK (
    empat_akhir IS NULL OR char_length(empat_akhir) <= 4
  ),

  -- Ciphertext berversi. Menolak nilai plaintext yang tak sengaja masuk lewat
  -- jalur yang melewati lapisan enkripsi.
  CONSTRAINT app_credentials_berversi CHECK (nilai_enc LIKE 'v%:%')
);

CREATE INDEX IF NOT EXISTS idx_app_credentials_company
  ON app_credentials(company_id);

COMMENT ON TABLE app_credentials IS
  'Kredensial pihak ketiga per tenant. `nilai_enc` TERENKRIPSI di aplikasi dan '
  'TIDAK BOLEH ikut di-SELECT oleh rute mana pun — dijaga penjaga CI '
  'audit-kredensial-tak-bocor.mjs.';

COMMENT ON COLUMN app_credentials.nilai_enc IS
  'Ciphertext berversi (v1:iv:tag:data). JANGAN PERNAH masukkan kolom ini ke '
  'daftar select rute, respons API, log, atau audit.';

-- ------------------------------------------------------------
-- 2. Tenancy
--
-- Kategori B: `company_id` langsung. Policy ditulis sekarang meski jalur API
-- hari ini memakai peran ber-`rolbypassrls` (keputusan F2-6) — supaya ia
-- langsung hidup begitu koneksi pindah peran, tanpa migrasi susulan.
-- Perlindungan yang BEKERJA hari ini tetap penyaringan di aplikasi.
-- ------------------------------------------------------------
ALTER TABLE app_credentials ENABLE ROW LEVEL SECURITY;

-- `(SELECT auth_company_id())` — bungkusan subquery-nya disengaja dan mengikuti
-- 141 policy lain di basis ini: tanpanya fungsinya dievaluasi ulang per baris.
DROP POLICY IF EXISTS tenant_isolation ON app_credentials;
CREATE POLICY tenant_isolation ON app_credentials AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS app_credentials_baca ON app_credentials;
CREATE POLICY app_credentials_baca ON app_credentials
  FOR SELECT USING (true);

DROP POLICY IF EXISTS app_credentials_kelola ON app_credentials;
CREATE POLICY app_credentials_kelola ON app_credentials
  FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 3. Trigger `diperbarui_pada`
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_app_credentials_sentuh()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.diperbarui_pada := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_app_credentials_sentuh ON app_credentials;
CREATE TRIGGER trg_app_credentials_sentuh
  BEFORE UPDATE ON app_credentials
  FOR EACH ROW EXECUTE FUNCTION fn_app_credentials_sentuh();

-- ------------------------------------------------------------
-- 4. Permission
--
-- DIPISAH SENGAJA. Melihat kredensial mana yang terpasang (dan 4 karakter
-- terakhirnya) adalah kebutuhan operasional biasa; MENGUBAHNYA memutus atau
-- mengalihkan integrasi yang sedang berjalan. Satu permission untuk keduanya
-- memaksa memberi wewenang mengubah kepada siapa pun yang cuma perlu memeriksa.
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description, sort_order)
VALUES
  ('settings:credentials:view',
   'settings', 'Lihat kredensial',
   'Melihat daftar kredensial yang terpasang beserta 4 karakter terakhirnya. TIDAK pernah nilainya.',
   910),
  ('settings:credentials:manage',
   'settings', 'Kelola kredensial',
   'Menyimpan, mengganti, dan menghapus kredensial pihak ketiga.',
   911)
ON CONFLICT (key) DO NOTHING;

-- Diberikan ke admin saja. Peran lain menerimanya lewat UI pengaturan peran —
-- itulah gunanya ADR-004: peran adalah data konfigurasi per-tenant.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.key IN ('settings:credentials:view', 'settings:credentials:manage')
  AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 5. Verifikasi — gagal keras kalau artefaknya tak benar-benar terbentuk
--    (pola migrasi 142; pelajaran dari 043 yang tercatat sukses tanpa
--    pernah membuat tabelnya).
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.app_credentials') IS NULL THEN
    RAISE EXCEPTION '242 gagal: app_credentials tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.relname = 'app_credentials' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION '242 gagal: RLS tidak aktif di app_credentials';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'app_credentials'
      AND policyname = 'tenant_isolation'
      AND permissive = 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION '242 gagal: policy tenant_isolation tidak RESTRICTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM permissions WHERE key = 'settings:credentials:manage'
  ) THEN
    RAISE EXCEPTION '242 gagal: permission settings:credentials:manage tidak ter-seed';
  END IF;

  -- CHECK berversi benar-benar menolak plaintext.
  BEGIN
    INSERT INTO app_credentials (company_id, kunci, nilai_enc)
    VALUES (
      (SELECT id FROM companies LIMIT 1),
      '__uji_242__',
      'plaintext-tanpa-versi'
    );
    RAISE EXCEPTION '242 gagal: CHECK berversi TIDAK menolak plaintext';
  EXCEPTION
    WHEN check_violation THEN NULL;  -- inilah yang diharapkan
  END;
END $$;
