-- ============================================================
-- 136 — T7: Menu Registry per company
--
-- Item checklist L2 terakhir yang belum dipenuhi (ADR-011 §"Pemetaan ke
-- checklist L2": "Menu Registry per-company | T7").
--
-- ------------------------------------------------------------
-- MASALAH
-- ------------------------------------------------------------
-- `menu_items` adalah katalog GLOBAL (kategori A, 23 baris): setiap perusahaan
-- mendapat menu yang persis sama. Tidak ada cara bagi satu perusahaan untuk
-- mematikan modul yang memang tidak ia pakai — mis. kontraktor kecil tanpa
-- pengadaan formal tetap melihat menu Pengadaan dengan 8 tab kosong.
--
-- Hari ini tak terasa (satu tenant, semua modul dipakai). Ia menjadi masalah
-- persis saat perusahaan kedua masuk dengan cakupan operasi berbeda.
--
-- ------------------------------------------------------------
-- KENAPA OVERRIDE, BUKAN SALINAN PER COMPANY
-- ------------------------------------------------------------
-- Alternatif yang lebih lurus adalah memberi `menu_items` kolom `company_id`
-- lalu menyalin 23 baris untuk tiap tenant baru. Ditolak: menu adalah STRUKTUR
-- APLIKASI, bukan data pelanggan. Menyalinnya berarti setiap penambahan menu
-- baru di rilis berikutnya harus di-backfill ke semua tenant, dan tenant yang
-- terlewat diam-diam kehilangan fitur. Itu memindahkan beban rilis ke data.
--
-- Yang dipakai: tabel override sempit `company_menu_settings` yang hanya
-- menyimpan PENGECUALIAN. Nol baris = semua menu tampil (perilaku sekarang,
-- jadi migrasi ini tidak mengubah apa pun sampai ada yang sengaja mematikan
-- sesuatu). Menu baru otomatis tersedia untuk semua tenant tanpa backfill.
--
-- ------------------------------------------------------------
-- YANG TIDAK DILAKUKAN — dan kenapa
-- ------------------------------------------------------------
-- Menu TIDAK dipakai sebagai lapis keamanan. Menyembunyikan menu Pengadaan
-- tidak membuat endpoint pengadaan tertutup — itu tetap urusan permission
-- (ADR-004) dan RLS. Kalau menu dianggap penjaga akses, orang akan berhenti
-- memasang gerbang yang sebenarnya, dan URL yang diketik langsung tetap tembus.
-- Ini murni soal kerapian tampilan: menyembunyikan yang tak relevan.
-- ============================================================

CREATE TABLE IF NOT EXISTS company_menu_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  menu_key    TEXT NOT NULL REFERENCES menu_items(key) ON DELETE CASCADE,
  -- Sengaja hanya `is_hidden`, bukan `is_visible`: baris yang ADA berarti
  -- PENGECUALIAN. Dengan begitu "tidak ada baris" = "tampil", sehingga tabel
  -- kosong berperilaku persis seperti sebelum migrasi ini.
  is_hidden   BOOLEAN NOT NULL DEFAULT true,
  -- Urutan khusus per perusahaan; NULL = pakai sort_order bawaan menu_items.
  sort_order  INTEGER,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT company_menu_unik UNIQUE (company_id, menu_key)
);

COMMENT ON TABLE company_menu_settings IS
  'T7: pengecualian menu per perusahaan. Baris yang ADA = menu disembunyikan '
  'atau diurutkan ulang; NOL baris = seluruh menu tampil (perilaku bawaan). '
  'BUKAN lapis keamanan — akses tetap dijaga permission (ADR-004) + RLS.';

CREATE INDEX IF NOT EXISTS idx_company_menu_company
  ON company_menu_settings (company_id);

-- ------------------------------------------------------------
-- RLS — kategori B (company_id NOT NULL).
--
-- Dua axis, mengikuti pola yang sama dengan seluruh tabel ber-tenant:
-- permissive memegang axis ROLE, restrictive memegang axis COMPANY.
-- Helper dibungkus `(SELECT ...)` supaya jadi InitPlan (migrasi 132).
-- ------------------------------------------------------------
ALTER TABLE company_menu_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_menu_read ON company_menu_settings;
CREATE POLICY company_menu_read ON company_menu_settings FOR SELECT
  USING ((SELECT has_permission('settings:view')) OR (SELECT has_permission('settings:manage')));

DROP POLICY IF EXISTS company_menu_write ON company_menu_settings;
CREATE POLICY company_menu_write ON company_menu_settings FOR ALL
  USING ((SELECT has_permission('settings:manage')))
  WITH CHECK ((SELECT has_permission('settings:manage')));

DROP POLICY IF EXISTS tenant_isolation ON company_menu_settings;
CREATE POLICY tenant_isolation ON company_menu_settings AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- ------------------------------------------------------------
-- Verifikasi.
-- ------------------------------------------------------------
DO $$
DECLARE v_baris INT;
BEGIN
  -- Tabel HARUS lahir kosong. Kalau tidak, migrasi ini diam-diam mengubah menu
  -- yang dilihat orang — padahal janjinya "nol perubahan sampai ada yang
  -- sengaja mematikan sesuatu".
  SELECT count(*) INTO v_baris FROM company_menu_settings;
  IF v_baris > 0 THEN
    RAISE EXCEPTION
      '136: company_menu_settings lahir dengan % baris. Migrasi ini harus '
      'netral — menu yang tampil hari ini tak boleh berubah.', v_baris;
  END IF;

  -- Prasyarat T1-F3: RLS aktif TANPA policy permissive = tabel mati total.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
     AND tablename='company_menu_settings' AND permissive='PERMISSIVE'
  ) THEN
    RAISE EXCEPTION '136: tak ada policy permissive — tabel tak terbaca siapa pun.';
  END IF;

  RAISE NOTICE '136: menu per-company aktif (nol pengecualian = seluruh menu tampil).';
END $$;
