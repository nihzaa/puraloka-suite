-- ============================================================
-- 146 — feature_flags: UNIQUE per-company, bukan global
--
-- ── Cacat yang ditutup (pola yang SAMA PERSIS dengan migrasi 145)
--
-- `feature_flags` diklasifikasikan **AB** di peta tenancy: baris bersama
-- (`company_id NULL`) DITAMBAH pengecualian per-perusahaan. Tapi constraint-nya
-- masih `UNIQUE (key)` dari saat tabel ini lahir — sebelum multi-tenant ada.
--
-- Akibatnya sama dengan yang ditemukan pada `financial_config` beberapa jam
-- lalu: begitu badan usaha kedua berdiri, ia TIDAK BISA menyalakan/mematikan
-- flag untuk dirinya sendiri, karena baris ber-`key` itu sudah dipegang
-- perusahaan pertama.
--
-- Ini bukan kebetulan dua kali. Ia gejala dari satu sebab: tabel yang dibuat
-- pra-multi-tenant lalu diberi `company_id` di migrasi 127, tanpa
-- constraint-nya ikut ditinjau. Karena itu migrasi ini menutup satu tabel dan
-- `audit-gerbang-tenancy.mjs` menutup jalur menemukannya lagi.
--
-- ── Kenapa `(company_id, key)` dan BUKAN sekadar membuang UNIQUE-nya
--
-- Keunikannya sendiri benar dan wajib: dua baris `key` sama untuk SATU
-- perusahaan berarti "flag ini menyala atau mati?" tak punya jawaban. Yang
-- salah lingkupnya, bukan aturannya.
--
-- `NULLS NOT DISTINCT` dipakai supaya baris BERSAMA (`company_id IS NULL`)
-- juga tetap unik per-key. Tanpa itu, Postgres menganggap tiap NULL berbeda
-- dan katalog bersama bisa punya dua baris `key` yang sama — persis kondisi
-- yang membuat `getFeatureFlag()` mengembalikan nilai yang bergantung urutan.
--
-- ── Dampak ke data: NOL
--
-- `feature_flags` berisi 0 baris di dev (diverifikasi sebelum menulis migrasi
-- ini). Mempersempit lingkup UNIQUE pun tak pernah menolak baris yang sudah
-- lolos aturan lebih longgar — arah perubahannya melonggarkan.
-- ============================================================

BEGIN;

ALTER TABLE feature_flags DROP CONSTRAINT IF EXISTS feature_flags_key_key;

-- `IF NOT EXISTS` supaya migrasi idempoten (bisa dijalankan ulang aman).
CREATE UNIQUE INDEX IF NOT EXISTS uq_feature_flags_company_key
  ON feature_flags (company_id, key) NULLS NOT DISTINCT;

COMMENT ON INDEX uq_feature_flags_company_key IS
  'Keunikan flag PER-COMPANY (146). Perusahaan berbeda boleh punya key yang sama — itu justru inti kategori AB. NULLS NOT DISTINCT menjaga baris bersama (company_id NULL) tetap unik per-key.';

-- ── Verifikasi: gagal berisik kalau tak mencapai maksudnya ─────────────────
DO $$
DECLARE
  v_a UUID;
  v_b UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'feature_flags_key_key'
                AND conrelid = to_regclass('feature_flags')) THEN
    RAISE EXCEPTION '146 GAGAL: UNIQUE(key) global masih terpasang';
  END IF;

  IF to_regclass('uq_feature_flags_company_key') IS NULL THEN
    RAISE EXCEPTION '146 GAGAL: index per-company tak terbentuk';
  END IF;

  -- Bukti FUNGSIONAL, di dalam blok yang SELALU di-rollback. Pola ini dipakai
  -- migrasi 145: membersihkan diri dengan DELETE ditolak trigger
  -- `fn_company_no_casual_delete`, dan guard itu benar — jadi jangan dilawan.
  SELECT id INTO v_a FROM companies ORDER BY created_at LIMIT 1;
  IF v_a IS NULL THEN
    RAISE NOTICE '146: nol company — uji fungsional dilewati';
  ELSE
    BEGIN
      INSERT INTO companies (code, name) VALUES ('uji-146', '[UJI-146] sementara')
        RETURNING id INTO v_b;

      INSERT INTO feature_flags (key, is_enabled, company_id) VALUES ('uji146.flag', true,  v_a);
      -- Inilah yang SEBELUM migrasi ini gagal:
      INSERT INTO feature_flags (key, is_enabled, company_id) VALUES ('uji146.flag', false, v_b);
      -- Baris bersama juga masih boleh hidup berdampingan:
      INSERT INTO feature_flags (key, is_enabled, company_id) VALUES ('uji146.flag', true,  NULL);

      -- Yang HARUS tetap ditolak: dobel untuk company yang SAMA.
      BEGIN
        INSERT INTO feature_flags (key, is_enabled, company_id) VALUES ('uji146.flag', false, v_a);
        RAISE EXCEPTION '146 GAGAL: duplikat DALAM satu company tidak ditolak';
      EXCEPTION WHEN unique_violation THEN
        NULL;  -- benar
      END;

      -- Dan dobel pada baris BERSAMA (NULL) juga harus ditolak.
      BEGIN
        INSERT INTO feature_flags (key, is_enabled, company_id) VALUES ('uji146.flag', false, NULL);
        RAISE EXCEPTION '146 GAGAL: duplikat baris bersama tidak ditolak — NULLS NOT DISTINCT hilang?';
      EXCEPTION WHEN unique_violation THEN
        NULL;  -- benar
      END;

      RAISE EXCEPTION 'UJI146_SELESAI';
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM <> 'UJI146_SELESAI' THEN RAISE; END IF;
    END;
  END IF;

  RAISE NOTICE '146 OK: flag unik per-company; lintas-company boleh, dalam-company ditolak';
END $$;

COMMIT;
