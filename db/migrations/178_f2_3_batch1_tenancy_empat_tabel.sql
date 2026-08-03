-- ============================================================================
-- 178 — F2-3 BATCH 1: empat tabel yang klasifikasi F2-2 sisakan untuk keputusan.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KONTEKS
-- ══════════════════════════════════════════════════════════════════════════
--
-- F2-2 mengklasifikasi 123 tabel (docs/adr/F2-2-KLASIFIKASI-TENANCY.md).
-- Dari 80 tabel tanpa `company_id`, hanya EMPAT yang tak punya jawaban dari
-- aturan ADR-011 §5 — sisanya sudah punya tenancy lewat rantai FK NOT NULL.
--
-- Migrasi ini mengerjakan keempatnya, dan HANYA keempatnya. Aturan F2-3
-- berbunyi "tiap langkah terpisah", dan alasannya sudah terbukti tujuh kali
-- di Fase 0: perubahan tenancy yang digabung membuat kegagalannya mustahil
-- dilacak.
--
-- ── Keputusan yang dieksekusi (F2-2 §4, diratifikasi founder)
--
--   company_profile      → B    : company_id NOT NULL + UNIQUE(company_id)
--   kasbon_purposes      → A/B  : company_id NULLABLE (overlay)
--   material_categories  → A    : TETAP shared — nol perubahan skema
--   menu_items           → A    : TETAP shared — nol perubahan skema
--
-- Dua yang terakhir sengaja **tidak disentuh**. Mencatatnya di sini penting:
-- "sudah diputuskan tetap A" berbeda dari "belum diperiksa", dan tanpa catatan
-- ini orang berikutnya akan memeriksanya lagi dari nol.
--
-- ── Yang TIDAK dilakukan migrasi ini
--
-- Tak menyentuh 66 tabel kategori C. Mereka sudah punya tenancy lewat rantai
-- FK; memberi mereka `company_id` sendiri menciptakan DUA SUMBER KEBENARAN
-- yang bisa bertentangan — dan yang salah tak terlihat sampai ada baris yang
-- company_id-nya berbeda dari induknya.
-- ============================================================================

-- ── 1. company_profile → kategori B ─────────────────────────────────────────
--
-- ADR-011 §4 sudah memutuskan ini; migrasi 032 membuatnya sebagai tabel
-- SINGLE-ROW (satu profil untuk seluruh sistem) di era pra-multi-tenant.
--
-- Backfill ke tenant pertama, lalu UNIQUE(company_id) — "utang tabel
-- single-row lunas tanpa DROP", bunyi ADR apa adanya.

ALTER TABLE company_profile ADD COLUMN IF NOT EXISTS company_id UUID;

-- Backfill: satu-satunya baris yang ada milik company akar. Dijalankan SEBELUM
-- NOT NULL supaya urutannya tak bisa gagal separuh jalan.
UPDATE company_profile
   SET company_id = (SELECT id FROM companies WHERE parent_company_id IS NULL
                      ORDER BY created_at LIMIT 1)
 WHERE company_id IS NULL;

DO $$
DECLARE v_yatim int;
BEGIN
  -- Gerbang: NOT NULL tak boleh dipasang bila masih ada baris tanpa pemilik.
  -- Tanpa gerbang, ALTER-nya gagal dengan pesan generik dan orang mengira
  -- migrasinya yang rusak, bukan datanya.
  SELECT count(*) INTO v_yatim FROM company_profile WHERE company_id IS NULL;
  IF v_yatim > 0 THEN
    RAISE EXCEPTION '178: % baris company_profile tanpa company_id — '
                    'apakah tabel companies kosong?', v_yatim;
  END IF;
END $$;

ALTER TABLE company_profile ALTER COLUMN company_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'company_profile_company_id_key') THEN
    ALTER TABLE company_profile
      ADD CONSTRAINT company_profile_company_id_key UNIQUE (company_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'company_profile_company_id_fkey') THEN
    ALTER TABLE company_profile
      ADD CONSTRAINT company_profile_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 2. kasbon_purposes → kategori A/B (overlay) ─────────────────────────────
--
-- NULL = keperluan bawaan yang berlaku untuk semua tenant.
-- terisi = keperluan khusus milik satu PT.
--
-- ⚠️ PK-nya `code`, bukan `id`. Itu masalah: dua PT harus boleh memakai kode
-- yang sama untuk keperluan berbeda ("OPS" di PT A ≠ "OPS" di PT B), tetapi
-- PK `code` melarangnya secara global.
--
-- ⚠️ PRIMARY KEY TIDAK BOLEH memuat kolom NULLABLE.
--
-- Rancangan pertama saya memakai `PRIMARY KEY (code, company_id)`, dan itu
-- MUSTAHIL selama `company_id` boleh NULL — padahal NULL justru inti pola
-- A/B (NULL = baris bawaan milik semua tenant). Ketahuan saat menulis DDL-nya,
-- bukan saat menjalankannya.
--
-- Yang dipakai: `id` sintetis sebagai PK baru, plus UNIQUE INDEX ber-`NULLS
-- NOT DISTINCT` untuk menjaga keunikan (code, company_id).
--
-- `NULLS NOT DISTINCT` (PG15+) yang menentukan: tanpanya Postgres menganggap
-- setiap NULL berbeda, sehingga dua baris bawaan berkode sama bisa hidup
-- bersama — dan resolusi overlay lalu mengembalikan dua baris untuk satu kode.

ALTER TABLE kasbon_purposes ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE kasbon_purposes ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- Isi id untuk baris lama sebelum dijadikan PK.
UPDATE kasbon_purposes SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE kasbon_purposes ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'kasbon_purposes_company_id_fkey') THEN
    ALTER TABLE kasbon_purposes
      ADD CONSTRAINT kasbon_purposes_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;

  -- Pindahkan PK dari `code` ke `id` — hanya bila masih PK lama (idempoten).
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'kasbon_purposes_pkey'
                AND pg_get_constraintdef(oid) = 'PRIMARY KEY (code)') THEN
    ALTER TABLE kasbon_purposes DROP CONSTRAINT kasbon_purposes_pkey;
    ALTER TABLE kasbon_purposes ADD CONSTRAINT kasbon_purposes_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS kasbon_purposes_code_company_uniq
  ON kasbon_purposes (code, company_id) NULLS NOT DISTINCT;

-- ── 2b. Penegakan tenancy di DATABASE, bukan hanya kolom ────────────────────
--
-- Kolom `company_id` yang tak dijaga policy adalah dokumentasi, bukan isolasi.
--
-- Pola disalin dari `assemblies` — satu-satunya tabel A/B yang sudah berjalan
-- dan teruji (ADR-011 §7): policy RESTRICTIVE bernama `tenant_isolation`,
-- di-AND-kan dengan policy PERMISSIVE yang sudah ada.
--
-- ⚠️ RESTRICTIVE SAJA MEMATIKAN TABEL. Peringatan T1-F3 di migrasi 131:
-- tanpa policy PERMISSIVE yang menyertainya, RESTRICTIVE menolak segalanya.
-- Karena itu blok di bawah memeriksa keberadaannya dan GAGAL KERAS bila tak
-- ada — lebih baik migrasi berhenti daripada tabel mati senyap di produksi.

DO $$
DECLARE
  t text;
  v_permissive int;
BEGIN
  FOREACH t IN ARRAY ARRAY['company_profile', 'kasbon_purposes'] LOOP
    SELECT count(*) INTO v_permissive
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = t AND permissive = 'PERMISSIVE';

    IF v_permissive = 0 THEN
      RAISE EXCEPTION '178: % tak punya policy PERMISSIVE. Menambah RESTRICTIVE '
                      'sekarang akan MEMATIKAN tabel (lihat T1-F3, migrasi 131).', t;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
  END LOOP;
END $$;

-- company_profile — kategori B: WAJIB milik satu tenant, NULL tak sah.
CREATE POLICY tenant_isolation ON company_profile
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- kasbon_purposes — kategori A/B: baris bawaan (NULL) terlihat semua tenant.
--
-- ⚠️ Beda USING dan WITH CHECK di sini DISENGAJA dan penting:
--   USING      → boleh MEMBACA baris bawaan (NULL) dan miliknya sendiri
--   WITH CHECK → hanya boleh MENULIS baris miliknya sendiri
--
-- Tanpa pembedaan itu, tenant mana pun bisa mengubah keperluan bawaan yang
-- dipakai SELURUH tenant lain — satu tenant menyunting, semua terdampak.
CREATE POLICY tenant_isolation ON kasbon_purposes
  AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- ── 3 & 4. material_categories, menu_items → TETAP kategori A ───────────────
--
-- Nol perubahan skema. Dicatat di sini supaya "sudah diputuskan tetap shared"
-- tidak tertukar dengan "belum diperiksa".
--
--   material_categories — kosakata standar industri; "Semen" berarti sama di
--     PT mana pun. Tripwire: bila ada pelanggan menuntut kategori sendiri,
--     naikkan ke A/B (overlay), BUKAN ke B.
--   menu_items — bentuk aplikasi, bukan data pelanggan. Penyesuaian per-tenant
--     sudah punya mekanismenya sendiri: company_menu_settings (migrasi 136),
--     teruji oleh t7-menu-per-company.

DO $$ BEGIN
  RAISE NOTICE '178: material_categories & menu_items TETAP kategori A '
               '(shared) — nol perubahan skema, sesuai F2-2 §4.2 & §4.4.';
END $$;
