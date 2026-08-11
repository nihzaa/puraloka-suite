-- ════════════════════════════════════════════════════════════════════════════
-- 279 — CHECKLIST INSPEKSI + HASIL UJI MATERIAL (G1d)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa migrasi ini ada
--
-- Founder mencabut seluruh larangan bangun 2026-08-11 (RATIFIKASI R-011).
-- Dari 7 sub-item Mutu, dua ini benar-benar NOL TABEL — diukur:
--
--   inspection_requests    24 baris   ← sudah ada
--   ncr_items              18 baris   ← sudah ada
--   checklist inspeksi     NOL TABEL
--   hasil uji material     NOL TABEL
--
-- ── Kenapa DUA tabel, bukan satu
--
-- Keduanya menjawab pertanyaan yang berbeda, dan menyatukannya akan memaksa
-- kolom yang selalu kosong di separuh baris:
--
--   CHECKLIST  = "apa saja yang diperiksa dalam inspeksi ini, dan lolos?"
--                Butirnya lahir DARI inspeksi, mati bersama inspeksi.
--
--   UJI MATERIAL = "beton batch ini kuat berapa?"
--                Hasilnya lahir dari LABORATORIUM, hidup lebih lama dari
--                inspeksi mana pun, dan sering dirujuk berulang kali
--                (sertifikat mutu, klaim, sengketa).
--
-- ── Yang dijaga constraint, dan kenapa
--
-- 1. Butir checklist yang dinyatakan TIDAK LOLOS wajib beralasan. Butir gagal
--    tanpa catatan tak bisa ditindaklanjuti siapa pun — dan pola yang sama
--    sudah ditegakkan di `inspection_requests` (migrasi 157).
--
-- 2. Hasil uji WAJIB punya nilai ATAU kesimpulan. Uji yang tercatat tanpa
--    keduanya adalah baris yang menyatakan "ada uji" tanpa mengatakan apa
--    hasilnya — dan itu lebih buruk daripada tak ada barisnya, karena ia
--    terhitung sebagai bukti.
--
-- 3. Nilai uji `numeric`, bukan float (CLAUDE.md §5.4). Kuat tekan beton
--    dipakai memutuskan apakah struktur diterima; pembulatan biner tak punya
--    tempat di situ.
--
-- ── Kenapa `nilai_syarat` disimpan, bukan dihitung saat baca
--
-- Syarat mutu berubah antar-proyek dan antar-edisi SNI. Menyimpannya bersama
-- hasilnya membuat kesimpulan "lolos/tidak" bisa diperiksa ulang bertahun
-- kemudian — tanpa menebak standar mana yang berlaku saat itu.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Butir checklist per inspeksi
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inspeksi_checklist (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id     UUID NOT NULL REFERENCES inspection_requests(id) ON DELETE CASCADE,

  -- Urutan tampil. Butir pemeriksaan punya urutan yang bermakna (dari bawah
  -- ke atas, dari struktur ke finishing), dan mengurutkannya berdasarkan
  -- waktu input akan mengacaknya.
  urutan            INT  NOT NULL DEFAULT 0,

  butir             TEXT NOT NULL,
  -- `acuan` = pasal spesifikasi / SNI yang jadi dasar. Butir tanpa acuan
  -- adalah pendapat; butir ber-acuan adalah persyaratan.
  acuan             TEXT,

  -- NULL = belum diperiksa. Dibedakan dari `false` (diperiksa, gagal):
  -- "belum diperiksa" dan "tidak lolos" menuntut tindakan yang berbeda.
  lolos             BOOLEAN,
  catatan           TEXT,

  diperiksa_oleh    UUID REFERENCES users(id),
  diperiksa_pada    TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Butir TIDAK LOLOS wajib beralasan.
  --
  -- Pola yang sama dengan `inspeksi_hasil_berpemeriksa` (157): hasil tanpa
  -- keterangan tak bisa ditindaklanjuti. Yang menerima tugas perbaikan harus
  -- tahu APA yang salah, bukan sekadar bahwa ada yang salah.
  CONSTRAINT checklist_gagal_beralasan CHECK (
    lolos IS DISTINCT FROM FALSE
    OR (catatan IS NOT NULL AND btrim(catatan) <> '')
  ),

  -- Hasil pemeriksaan wajib punya pemeriksa DAN waktunya.
  CONSTRAINT checklist_hasil_berpemeriksa CHECK (
    lolos IS NULL
    OR (diperiksa_oleh IS NOT NULL AND diperiksa_pada IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_checklist_inspeksi
  ON inspeksi_checklist (inspection_id, urutan);

-- ------------------------------------------------------------
-- 2. Hasil uji material
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS uji_material (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  nomor             TEXT NOT NULL,
  -- Material yang diuji. NULLABLE: sebagian uji menyangkut hasil pekerjaan
  -- (kuat tekan beton di lokasi), bukan material dari katalog.
  material_id       UUID REFERENCES materials(id),
  -- Deskripsi bebas untuk yang tak ada di katalog: "beton K-250 zona B lantai 2".
  objek             TEXT NOT NULL,

  jenis_uji         TEXT NOT NULL,
  lembaga_uji       TEXT,
  nomor_sertifikat  TEXT,

  tanggal_uji       DATE NOT NULL,

  -- ── Angka: `numeric`, bukan float (CLAUDE.md §5.4) ────────────────────
  -- Kuat tekan beton dipakai memutuskan apakah struktur diterima. Pembulatan
  -- biner tak punya tempat di keputusan seperti itu.
  nilai_hasil       NUMERIC(14,4),
  -- Syarat yang berlaku SAAT ITU, disimpan bersama hasilnya. Syarat mutu
  -- berubah antar-proyek dan antar-edisi SNI; menyimpannya membuat
  -- kesimpulan bisa diperiksa ulang bertahun kemudian tanpa menebak standar
  -- mana yang dipakai.
  nilai_syarat      NUMERIC(14,4),
  satuan            TEXT,

  -- Kesimpulan MANUSIA, bukan turunan otomatis dari nilai vs syarat.
  --
  -- Sebagian uji tak punya ambang tunggal (visual, kimia, gradasi), dan
  -- sebagian lain punya toleransi yang butuh penilaian ahli. Menurunkannya
  -- otomatis akan menyatakan "tidak memenuhi" untuk hasil yang sebenarnya
  -- masih dalam toleransi.
  kesimpulan        TEXT CHECK (kesimpulan IN ('memenuhi', 'tidak_memenuhi', 'perlu_uji_ulang')),
  catatan           TEXT,

  -- Uji yang melahirkan NCR — jejak dari temuan ke tindak lanjutnya.
  ncr_id            UUID REFERENCES ncr_items(id) ON DELETE SET NULL,

  dicatat_oleh      UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Nomor uji unik per proyek — ia dirujuk dalam sertifikat dan surat resmi.
  CONSTRAINT uji_material_nomor_unik UNIQUE (project_id, nomor),

  -- Uji WAJIB punya nilai ATAU kesimpulan.
  --
  -- Baris yang menyatakan "ada uji" tanpa mengatakan apa hasilnya lebih buruk
  -- daripada tak ada barisnya: ia terhitung sebagai bukti saat auditor
  -- menghitung berapa uji yang sudah dilakukan.
  CONSTRAINT uji_material_ada_hasil CHECK (
    nilai_hasil IS NOT NULL OR kesimpulan IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_uji_material_proyek
  ON uji_material (project_id, tanggal_uji DESC);
CREATE INDEX IF NOT EXISTS idx_uji_material_ncr
  ON uji_material (ncr_id) WHERE ncr_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. RLS — RESTRICTIVE, lewat project.company_id
--
-- Pola yang sama dengan `ncr_items` (189) dan `punch_items`.
-- `(SELECT auth_company_id())` dibungkus SELECT supaya dievaluasi sekali per
-- query, bukan per baris.
-- ------------------------------------------------------------
ALTER TABLE inspeksi_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE uji_material       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON inspeksi_checklist;
CREATE POLICY tenant_isolation ON inspeksi_checklist AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM inspection_requests i
                   JOIN projects p ON p.id = i.project_id
                  WHERE i.id = inspeksi_checklist.inspection_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM inspection_requests i
                        JOIN projects p ON p.id = i.project_id
                       WHERE i.id = inspeksi_checklist.inspection_id
                         AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON uji_material;
CREATE POLICY tenant_isolation ON uji_material AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = uji_material.project_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p
                       WHERE p.id = uji_material.project_id
                         AND p.company_id = (SELECT auth_company_id())));

-- ------------------------------------------------------------
-- 4. Capability
--
-- Memakai `ncr:view`/`ncr:manage` yang sudah ada akan menyamakan dua
-- kewenangan yang berbeda: yang boleh mencatat hasil uji laboratorium belum
-- tentu yang boleh memutuskan disposisi NCR.
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description) VALUES
  ('mutu:uji:view',   'mutu', 'Lihat hasil uji',
   'Melihat hasil uji material dan sertifikatnya'),
  ('mutu:uji:manage', 'mutu', 'Kelola hasil uji',
   'Mencatat & mengubah hasil uji material')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key IN ('mutu:uji:view', 'mutu:uji:manage')
   AND r.name IN ('admin', 'direktur', 'pm')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 5. Verifikasi — migrasi gagal keras kalau objeknya tidak benar-benar ada.
--
-- Pelajaran dari migrasi 043: ia tercatat sukses tanpa pernah membuat
-- tabelnya, dan tak seorang pun tahu selama berbulan-bulan.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.inspeksi_checklist') IS NULL THEN
    RAISE EXCEPTION '279 gagal: inspeksi_checklist tidak terbentuk';
  END IF;
  IF to_regclass('public.uji_material') IS NULL THEN
    RAISE EXCEPTION '279 gagal: uji_material tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'checklist_gagal_beralasan'
  ) THEN
    RAISE EXCEPTION '279 gagal: constraint checklist_gagal_beralasan tidak terpasang';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uji_material_ada_hasil'
  ) THEN
    RAISE EXCEPTION '279 gagal: constraint uji_material_ada_hasil tidak terpasang';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'inspeksi_checklist' AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION '279 gagal: RLS inspeksi_checklist tidak terpasang';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'uji_material' AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION '279 gagal: RLS uji_material tidak terpasang';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'mutu:uji:manage') THEN
    RAISE EXCEPTION '279 gagal: capability mutu:uji:manage tidak ter-seed';
  END IF;

  -- Nominal WAJIB numeric, bukan float (CLAUDE.md §5.4).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'uji_material'
       AND column_name IN ('nilai_hasil', 'nilai_syarat')
       AND data_type <> 'numeric'
  ) THEN
    RAISE EXCEPTION '279 gagal: nilai uji bukan numeric';
  END IF;
END $$;
