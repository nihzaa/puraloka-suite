-- Migration 155: modul aktif PER-PERUSAHAAN, bukan global
--
-- ══════════════════════════════════════════════════════════════════════════
-- CELAH YANG DITUTUP
-- ══════════════════════════════════════════════════════════════════════════
--
-- `modules` berkategori **A (katalog global)** — dan `is_enabled` disimpan di
-- baris katalog itu. Artinya `PATCH /api/v1/modules/:key` menulis ke baris yang
-- DIPAKAI BERSAMA seluruh perusahaan:
--
--   Perusahaan A mematikan modul "procurement"
--     → modul itu mati untuk perusahaan B, C, dan seluruh pelanggan SaaS.
--
-- Endpoint-nya sudah bergerbang permission (`settings:manage`) — jadi bukan
-- soal siapa boleh menekan tombolnya. Yang salah adalah CAKUPAN akibatnya:
-- admin sebuah perusahaan berwenang penuh atas perusahaannya sendiri, dan
-- kewenangan itu tak boleh menyeberang.
--
-- ── Kenapa diperbaiki sekarang padahal dampaknya masih NOL
--
-- `isModuleEnabled()` diverifikasi punya **nol pemanggil** hari ini (dicek
-- dengan grep ke seluruh `src/`, bukan diasumsikan). Jadi tak ada modul yang
-- benar-benar bisa dimatikan, dan celah ini belum pernah menggigit.
--
-- Justru itu alasan memperbaikinya SEKARANG: saat pemanggil pertama lahir,
-- cacatnya tak akan terlihat sebagai bug tenancy — ia akan terlihat sebagai
-- "modul kok mati sendiri", dan penyebabnya dicari di tempat yang salah.
-- Pola yang sama sudah menggigit dua kali: `financial_config` (145) dan
-- `feature_flags` (146), keduanya dalam satu hari.
--
-- ── Kategori AB, meniru `feature_flags`
--
-- Baris BERSAMA (`company_id IS NULL`) = katalog bawaan: modul apa saja yang
-- ADA di sistem. Baris per-perusahaan = pengecualian: perusahaan ini
-- mematikan/menyalakan modul itu.
--
-- Kenapa bukan menyalin seluruh katalog ke tiap perusahaan: menambah modul
-- baru berarti menyisipkannya ke SETIAP perusahaan, dan satu yang terlewat =
-- modul yang tak pernah muncul di sana tanpa gejala.

BEGIN;

ALTER TABLE modules ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);

COMMENT ON COLUMN modules.company_id IS
  'NULL = baris katalog BERSAMA (modul ini ada di sistem). Terisi = pengecualian per-perusahaan (is_enabled khusus perusahaan itu). Kategori AB — pola sama dengan feature_flags (146).';

-- Keunikan PER-COMPANY, bukan global.
--
-- ⚠️ UNIQUE lama pada `key` harus dilepas lebih dulu — kalau tidak, perusahaan
-- kedua tak bisa punya baris pengecualian untuk modul yang sama. Cacat identik
-- `financial_config` (145) dan `feature_flags` (146).
DO $$
DECLARE nama TEXT;
BEGIN
  FOR nama IN
    SELECT con.conname FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE n.nspname = current_schema() AND cl.relname = 'modules'
       AND con.contype = 'u'
       AND pg_get_constraintdef(con.oid) = 'UNIQUE (key)'
  LOOP
    EXECUTE format('ALTER TABLE modules DROP CONSTRAINT %I', nama);
    RAISE NOTICE '155: UNIQUE global %(key) dilepas', nama;
  END LOOP;
END $$;

-- `NULLS NOT DISTINCT` menjaga baris BERSAMA tetap unik per-key: tanpa itu,
-- dua baris katalog dengan key sama dan company_id NULL dianggap berbeda.
CREATE UNIQUE INDEX IF NOT EXISTS uq_modules_company_key
  ON modules (company_id, key) NULLS NOT DISTINCT;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Kategori AB: baris bersama (NULL) terbaca semua; baris per-perusahaan hanya
-- terbaca pemiliknya. Nama policy WAJIB `tenant_isolation` (dijaga t5a/t7).
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON modules;
CREATE POLICY tenant_isolation ON modules AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));

-- RESTRICTIVE tanpa PERMISSIVE = tabel mati total (pelajaran 149/150).
DROP POLICY IF EXISTS modules_baca ON modules;
CREATE POLICY modules_baca ON modules
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS modules_kelola ON modules;
CREATE POLICY modules_kelola ON modules
  FOR ALL TO authenticated
  USING ((SELECT has_permission('settings:manage')))
  WITH CHECK ((SELECT has_permission('settings:manage')));

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE n INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = current_schema() AND table_name = 'modules'
                    AND column_name = 'company_id') THEN
    RAISE EXCEPTION '155 GAGAL: modules.company_id tak terbentuk';
  END IF;

  -- UNIQUE global harus BENAR-BENAR lepas — kalau tidak, perusahaan kedua tak
  -- bisa punya pengecualian dan cacatnya kembali persis seperti semula.
  IF EXISTS (
    SELECT 1 FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace nn ON nn.oid = cl.relnamespace
     WHERE nn.nspname = current_schema() AND cl.relname = 'modules'
       AND con.contype = 'u' AND pg_get_constraintdef(con.oid) = 'UNIQUE (key)'
  ) THEN
    RAISE EXCEPTION '155 GAGAL: UNIQUE global (key) masih terpasang di modules';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = current_schema() AND indexname = 'uq_modules_company_key') THEN
    RAISE EXCEPTION '155 GAGAL: indeks unik per-company tak terbentuk';
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename = 'modules' AND permissive = 'PERMISSIVE';
  IF n = 0 THEN
    RAISE EXCEPTION '155 GAGAL: modules nol policy permissive — tabel akan mati total';
  END IF;

  RAISE NOTICE '155 OK: modules kategori AB — katalog bersama + pengecualian per-perusahaan';
END $$;

COMMIT;
