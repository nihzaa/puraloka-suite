-- ════════════════════════════════════════════════════════════════════════════
-- 205 — Konten situs publik (compro Puraloka Persada)
--
-- ── Kenapa tabel sendiri, bukan menumpang `settings`
--
-- `settings` menyimpan konfigurasi PERILAKU aplikasi. Konten situs adalah
-- MATERI TERBIT: punya urutan, status tampil, dan kelompok. Menumpangkannya
-- berarti satu baris `settings` menyimpan paragraf, dan tak ada lagi yang bisa
-- menjawab "apa yang tampil di halaman depan hari ini" tanpa membaca kode.
--
-- ── Kenapa `company_id` padahal hari ini cuma satu perusahaan
--
-- Gerbang mutlak (STATUS.md): tenant kedua dilarang sebelum Tahap 4 & 5. Tapi
-- menambah kolom saat tabel KOSONG berbiaya nol, sementara retrofit adalah
-- pekerjaan yang sedang menyita Fase 0. Yang ditunda adalah PERILAKU
-- multi-tenant (resolusi domain→tenant), bukan bentuk datanya.
--
-- ── Kenapa `nilai` jsonb, bukan text
--
-- Satu kunci konten bisa berupa teks, angka, atau objek (tautan = label+url).
-- Kolom text memaksa tiap pemanggil mem-parse sendiri, dan tiap pemanggil akan
-- memilih konvensi yang berbeda.
--
-- ── Kenapa `has_permission()`, bukan `auth_role()`
--
-- ADR-004 Rule #2, dan pelajaran migrasi 202/204: peran adalah data
-- konfigurasi per-tenant, bukan konstanta. Rancangan awal file ini memakai
-- `auth_role() = 'admin'` — itu pelanggaran yang sama.
--
-- `situs:view` dan `situs:manage` DIBUAT di migrasi ini (blok permission di
-- bawah) sebelum policy memakainya. Urutan itu penting: policy yang menunjuk
-- permission tak-ada menolak SEMUA orang tanpa satu pun galat, dan gejalanya
-- hanya "layar situs kosong".
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Permission ──────────────────────────────────────────────────────────────
-- Dibuat LEBIH DULU: policy di bawah menunjuk key ini.
INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('situs:view',   'situs', 'Lihat Konten Situs',   'Melihat konten situs publik (compro)', 10),
  ('situs:manage', 'situs', 'Kelola Konten Situs',  'Mengedit konten, media, dan merek situs publik', 20)
ON CONFLICT (key) DO NOTHING;

-- ── Tabel ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS situs_konten (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kunci       text NOT NULL,
  nilai       jsonb NOT NULL,
  diperbarui  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, kunci)
);

CREATE TABLE IF NOT EXISTS situs_kategori (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kunci       text NOT NULL,
  judul       text NOT NULL,
  ringkasan   text,
  lokasi      text,
  lingkup     text,
  urutan      integer NOT NULL DEFAULT 0,
  tampil      boolean NOT NULL DEFAULT true,
  UNIQUE (company_id, kunci)
);

CREATE TABLE IF NOT EXISTS situs_media (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kategori_id   uuid REFERENCES situs_kategori(id) ON DELETE SET NULL,
  path_storage  text NOT NULL,
  alt           text NOT NULL,
  lebar         integer NOT NULL,
  tinggi        integer NOT NULL,
  urutan        integer NOT NULL DEFAULT 0,
  tampil        boolean NOT NULL DEFAULT true,
  -- Upsert idempoten skrip impor bersandar pada ini.
  UNIQUE (company_id, path_storage),
  CONSTRAINT situs_media_dimensi_masuk_akal CHECK (lebar > 0 AND tinggi > 0)
);

CREATE TABLE IF NOT EXISTS situs_milestone (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tahun       integer NOT NULL,
  judul       text NOT NULL,
  keterangan  text,
  urutan      integer NOT NULL DEFAULT 0,
  tampil      boolean NOT NULL DEFAULT true,
  CONSTRAINT situs_milestone_tahun_wajar CHECK (tahun BETWEEN 1900 AND 2200)
);

CREATE TABLE IF NOT EXISTS situs_legalitas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kode        text NOT NULL,
  judul       text NOT NULL,
  urutan      integer NOT NULL DEFAULT 0,
  tampil      boolean NOT NULL DEFAULT true,
  UNIQUE (company_id, kode)
);

CREATE TABLE IF NOT EXISTS situs_seksi (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kunci       text NOT NULL,
  aktif       boolean NOT NULL DEFAULT true,
  urutan      integer NOT NULL DEFAULT 0,
  varian      text NOT NULL DEFAULT 'baku',
  UNIQUE (company_id, kunci),
  -- Rem tingkat-3 (spec §4.2): varian adalah pilihan diskrit yang SUDAH
  -- dirancang, bukan teks bebas. Tanpa CHECK, admin bisa mengetik varian yang
  -- tak punya komponen dan seksinya hilang tanpa pesan galat.
  CONSTRAINT situs_seksi_varian_dikenal
    CHECK (varian IN ('baku', 'grid', 'carousel', 'split'))
);

CREATE TABLE IF NOT EXISTS situs_merek (
  company_id   uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  warna_utama  text NOT NULL DEFAULT '#003366',
  warna_aksen  text NOT NULL DEFAULT '#FFD600',
  logo_path    text,
  diperbarui   timestamptz NOT NULL DEFAULT now(),
  -- BENTUK hex divalidasi di sini; KONTRAS divalidasi di API — baris ini tak
  -- tahu latar mana dipakai peran mana, dan warna yang sama bisa lulus di navy
  -- lalu gagal di putih (spec §4.2).
  CONSTRAINT situs_merek_hex_utama CHECK (warna_utama ~* '^#[0-9a-f]{6}$'),
  CONSTRAINT situs_merek_hex_aksen CHECK (warna_aksen ~* '^#[0-9a-f]{6}$')
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Ember [C]: isolasi tenant tidak boleh bisa dikonfigurasi.
-- `(SELECT ...)` disengaja — initplan, lihat migrasi 132.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['situs_konten','situs_kategori','situs_media',
                           'situs_milestone','situs_legalitas','situs_seksi',
                           'situs_merek']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE
        USING (company_id = (SELECT auth_company_id()))
        WITH CHECK (company_id = (SELECT auth_company_id()));
    $f$, t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_baca', t);
    EXECUTE format($f$
      CREATE POLICY %I ON %I FOR SELECT
        USING ((SELECT has_permission('situs:view')));
    $f$, t || '_baca', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_kelola', t);
    EXECUTE format($f$
      CREATE POLICY %I ON %I FOR ALL
        USING ((SELECT has_permission('situs:manage')))
        WITH CHECK ((SELECT has_permission('situs:manage')));
    $f$, t || '_kelola', t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS situs_media_kategori_idx
  ON situs_media (company_id, kategori_id, urutan);
CREATE INDEX IF NOT EXISTS situs_konten_kunci_idx
  ON situs_konten (company_id, kunci);

COMMIT;
