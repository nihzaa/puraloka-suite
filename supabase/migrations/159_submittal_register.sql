-- Migration 159: Submittal Register — ROADMAP #24 (Capability Tier-2)
--
-- ══════════════════════════════════════════════════════════════════════════
-- APA INI
-- ══════════════════════════════════════════════════════════════════════════
--
-- Pengajuan kontraktor ke konsultan/owner untuk DISETUJUI sebelum dipakai:
-- contoh material (keramik, cat, kusen), gambar kerja (shop drawing), data
-- teknis produk, hasil uji laboratorium.
--
-- Bedanya dari dua modul RFI (157) — dan inilah yang menentukan rancangannya:
--   RFI-Inspeksi   — minta DIPERIKSA pekerjaan yang sudah jadi
--   RFI-Informasi  — BERTANYA soal gambar yang ambigu
--   Submittal      — mengajukan APA YANG AKAN DIPAKAI, untuk disetujui dulu
--
-- Yang terakhir punya sifat yang tak dimiliki dua yang lain: ia **ditolak
-- berkali-kali dan diajukan ulang**. Keramik ditolak karena warnanya beda,
-- diganti, ditolak lagi karena ukurannya. Karena itu REVISI adalah warga kelas
-- satu di sini — bukan tambalan.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA MEMAKAI WORKFLOW ENGINE, BUKAN STATUS SENDIRI
-- ══════════════════════════════════════════════════════════════════════════
--
-- Blueprint menandai Submittal "butuh Document Mgmt + Workflow Engine".
-- Keduanya diverifikasi lunas KE KODE, bukan dibaca dari dokumen:
--   · `approval_chains` berisi 6 rantai / 13 langkah, dipakai 4 modul
--   · `entity_type` bertipe TEXT tanpa constraint/enum → menambah tipe baru
--     tak butuh migrasi enum, hanya menambah union TypeScript
--   · bucket `project-documents` ADA dan privat; jalur uploadnya hidup
--     (`documents` nol baris hanya karena sistem belum dipakai — sama seperti
--     punch_items, dan §9a mengklasifikasikannya "kosong tapi ada kodenya")
--
-- Membuat status approval sendiri di sini berarti implementasi hardcode
-- KEEMPAT yang harus dimigrasikan lagi nanti — persis masalah yang Program B
-- sengaja selesaikan. Blueprint melarangnya eksplisit untuk RFI & Submittal.
--
-- Konsekuensinya pada rancangan: tabel ini TIDAK punya kolom `disetujui_oleh`.
-- Persetujuan hidup di `approval_progress`, satu tempat untuk seluruh sistem.
-- Yang disimpan di sini hanya HASIL akhirnya (`status`) plus catatan reviewer.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KATEGORI TENANCY: C (lewat `project_id`)
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$ BEGIN
  CREATE TYPE submittal_status AS ENUM (
    'draft',
    'diajukan',           -- menunggu keputusan konsultan/owner
    'disetujui',          -- boleh dipakai apa adanya
    'disetujui_catatan',  -- boleh dipakai DENGAN perbaikan yang disebut
    'ditolak',            -- harus diajukan ulang dengan usulan lain
    'dibatalkan'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE submittal_jenis AS ENUM (
    'contoh_material',   -- keramik, cat, kusen — fisik
    'shop_drawing',      -- gambar kerja detail
    'data_teknis',       -- brosur, spesifikasi pabrik
    'hasil_uji',         -- lab: kuat tekan beton, uji tanah
    'metode_kerja',      -- method statement
    'lainnya'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS submittals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nomor TEXT NOT NULL,

  judul TEXT NOT NULL,             -- "Keramik lantai 60x60 — ruang utama"
  jenis submittal_jenis NOT NULL DEFAULT 'contoh_material',
  spesifikasi TEXT,                -- apa yang diajukan, selengkapnya
  referensi_spek TEXT,             -- pasal RKS yang mensyaratkan

  status submittal_status NOT NULL DEFAULT 'draft',

  -- ── Revisi sebagai warga kelas satu ─────────────────────────────────────
  -- Submittal ditolak lalu diajukan ulang adalah alur NORMAL, bukan kekecualian.
  -- `revisi` naik tiap pengajuan ulang; `induk_id` merantai seluruh percobaan
  -- ke pengajuan pertama, sehingga riwayatnya bisa dibaca sebagai satu perkara:
  -- "keramik ditolak 3× sebelum disetujui" adalah fakta yang menjelaskan
  -- keterlambatan, dan itu hilang kalau tiap percobaan jadi baris tak berkaitan.
  revisi INT NOT NULL DEFAULT 0,
  induk_id UUID REFERENCES submittals(id) ON DELETE SET NULL,

  ditujukan_ke TEXT,               -- pihak LUAR, jadi teks bukan FK
  diajukan_pada TIMESTAMPTZ,
  keputusan_diharapkan DATE,
  diputuskan_pada TIMESTAMPTZ,
  catatan_reviewer TEXT,           -- alasan tolak / syarat pada "disetujui_catatan"
  diputuskan_oleh TEXT,            -- nama orang di pihak luar

  -- Kaitan OPSIONAL ke pekerjaan yang menunggu. Sama seperti punch list:
  -- mewajibkannya memaksa pengaju menebak, dan tebakan salah lebih buruk
  -- daripada kosong.
  rab_item_id UUID REFERENCES rab_items(id) ON DELETE SET NULL,
  material_id UUID REFERENCES materials(id) ON DELETE SET NULL,

  -- Apakah pekerjaan berhenti menunggu keputusan. Dibedakan dari urgensi:
  -- sebagian submittal diajukan jauh hari dan tak menahan siapa pun.
  menghentikan_pekerjaan BOOLEAN NOT NULL DEFAULT false,

  diajukan_oleh UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Diajukan harus punya TANGGAL AJU — tanpa itu lama-menunggu tak terhitung,
  -- dan submittal yang tertahan lama adalah dasar klaim yang sama sahnya
  -- dengan RFI yang lama dijawab (157).
  CONSTRAINT submittal_diajukan_bertanggal CHECK (
    status IN ('draft', 'dibatalkan') OR diajukan_pada IS NOT NULL
  ),
  -- Keputusan harus bertanggal.
  CONSTRAINT submittal_keputusan_bertanggal CHECK (
    status NOT IN ('disetujui', 'disetujui_catatan', 'ditolak')
    OR diputuskan_pada IS NOT NULL
  ),
  -- DITOLAK dan DISETUJUI-DENGAN-CATATAN keduanya WAJIB beralasan. Yang kedua
  -- sering dilupakan: "boleh dipakai" tanpa menyebut syaratnya membuat
  -- syaratnya hilang, dan pekerjaan berjalan dengan asumsi yang salah.
  CONSTRAINT submittal_catatan_wajib CHECK (
    status NOT IN ('ditolak', 'disetujui_catatan')
    OR (catatan_reviewer IS NOT NULL AND length(trim(catatan_reviewer)) > 0)
  ),
  -- Keputusan tak boleh mendahului pengajuan.
  CONSTRAINT submittal_urutan_waktu CHECK (
    diputuskan_pada IS NULL OR diajukan_pada IS NULL
    OR diputuskan_pada >= diajukan_pada
  ),
  -- Submittal tak boleh jadi induk dirinya sendiri — rantai revisi yang
  -- melingkar membuat penelusuran riwayat berputar selamanya.
  CONSTRAINT submittal_induk_bukan_diri CHECK (induk_id IS NULL OR induk_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_submittals_project_nomor
  ON submittals (project_id, nomor);
CREATE INDEX IF NOT EXISTS idx_submittals_project_status
  ON submittals (project_id, status);
CREATE INDEX IF NOT EXISTS idx_submittals_induk
  ON submittals (induk_id) WHERE induk_id IS NOT NULL;
-- Yang menunggu keputusan DAN menahan pekerjaan.
CREATE INDEX IF NOT EXISTS idx_submittals_menunggu
  ON submittals (project_id, keputusan_diharapkan) WHERE status = 'diajukan';

-- ── Lampiran ────────────────────────────────────────────────────────────────
-- Berkas TIDAK disalin: ia tetap di `documents` (satu bucket, satu jalur
-- ber-policy). Yang ditambah hanya KAITANNYA — pola yang sama dengan
-- `punch_item_photos` (156).
CREATE TABLE IF NOT EXISTS submittal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submittal_id UUID NOT NULL REFERENCES submittals(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (submittal_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_submittal_docs ON submittal_documents (submittal_id);

-- ── Trigger ─────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_submittals_updated ON submittals;
CREATE TRIGGER trg_submittals_updated BEFORE UPDATE ON submittals
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Kategori C. RESTRICTIVE tanpa PERMISSIVE = tabel MATI TOTAL (149/150).
ALTER TABLE submittals ENABLE ROW LEVEL SECURITY;
ALTER TABLE submittal_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON submittals;
CREATE POLICY tenant_isolation ON submittals AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = submittals.project_id
                   AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = submittals.project_id
                        AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON submittal_documents;
CREATE POLICY tenant_isolation ON submittal_documents AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM submittals s JOIN projects p ON p.id = s.project_id
                  WHERE s.id = submittal_documents.submittal_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM submittals s JOIN projects p ON p.id = s.project_id
                       WHERE s.id = submittal_documents.submittal_id
                         AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS submittal_baca ON submittals;
CREATE POLICY submittal_baca ON submittals FOR SELECT TO authenticated
  USING ((SELECT has_permission('submittal:view')));
DROP POLICY IF EXISTS submittal_kelola ON submittals;
CREATE POLICY submittal_kelola ON submittals FOR ALL TO authenticated
  USING ((SELECT has_permission('submittal:manage')))
  WITH CHECK ((SELECT has_permission('submittal:manage')));

DROP POLICY IF EXISTS submittal_doc_baca ON submittal_documents;
CREATE POLICY submittal_doc_baca ON submittal_documents FOR SELECT TO authenticated
  USING ((SELECT has_permission('submittal:view')));
DROP POLICY IF EXISTS submittal_doc_kelola ON submittal_documents;
CREATE POLICY submittal_doc_kelola ON submittal_documents FOR ALL TO authenticated
  USING ((SELECT has_permission('submittal:manage')))
  WITH CHECK ((SELECT has_permission('submittal:manage')));

-- ── Permission ──────────────────────────────────────────────────────────────
-- `submittal:decide` TERPISAH dari `submittal:manage`, pola yang sama dengan
-- `punch:verify` (156) dan `inspeksi:periksa` (157).
--
-- ⚠️ Alasannya BERBEDA dari dua modul itu, dan bedanya penting. Di sana
-- pemisahan mencegah pelaksana menilai pekerjaannya sendiri. Di sini keputusan
-- sebenarnya datang dari LUAR (konsultan/owner) — yang menekan tombol hanya
-- MENCATAT keputusan itu. Pemisahannya tetap ada karena mencatat "disetujui"
-- adalah pernyataan bahwa persetujuan pihak luar benar-benar diterima, dan
-- pengaju yang sedang terdesak jadwal adalah orang paling tak tepat untuk
-- menyatakannya.
INSERT INTO permissions (key, module, label, description, sort_order)
VALUES
  ('submittal:view',   'lapangan', 'Lihat Submittal',
   'Melihat pengajuan material & gambar kerja beserta keputusannya', 640),
  ('submittal:manage', 'lapangan', 'Ajukan Submittal',
   'Mengajukan contoh material, shop drawing, dan data teknis untuk disetujui', 641),
  ('submittal:decide', 'lapangan', 'Catat Keputusan Submittal',
   'Mencatat persetujuan atau penolakan dari konsultan/pemberi kerja — '
   'sengaja terpisah dari pengajuan, karena mencatat "disetujui" adalah '
   'pernyataan bahwa persetujuan pihak luar benar-benar diterima', 642)
ON CONFLICT (key) DO NOTHING;

-- Penerima DITURUNKAN dari capability yang sudah berlaku (ADR-004).
-- Capability sumber diverifikasi ADA — `INSERT … SELECT` yang tak cocok
-- menghasilkan NOL BARIS tanpa error (pelajaran 156: `progress:approve`
-- ternyata tak pernah ada). Blok verifikasi di bawah MENGHITUNG hasilnya.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'submittal:view'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'projects:view')
ON CONFLICT DO NOTHING;

-- Mengajukan = pekerjaan orang lapangan/teknik.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'submittal:manage'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'mandor:view')
ON CONFLICT DO NOTHING;

-- Mencatat keputusan = urusan yang berhubungan dengan pihak luar, sama
-- lingkupnya dengan RFI kontrak (157) dan EOT/bond/CO.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'submittal:decide'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'projects:contract')
ON CONFLICT DO NOTHING;

-- ── Rantai approval ─────────────────────────────────────────────────────────
-- Submittal ikut Workflow Engine yang sudah hidup (Program B), BUKAN status
-- approval sendiri — membuat yang keempat berarti mengulang persis masalah
-- yang Program B selesaikan.
--
-- `entity_type` bertipe TEXT tanpa constraint (diverifikasi ke katalog), jadi
-- tipe baru tak butuh migrasi enum. Rantai dibuat per-company supaya tenant
-- kedua tak memakai rantai tenant pertama — cacat yang sudah menggigit di
-- `approval_chains` (T4h) dan ditutup dengan `company_id`.
-- ⚠️ Kolomnya `label`, BUKAN `name`; `approval_steps` TIDAK punya `max_amount`
-- dan `company_id`-nya NOT NULL. Ketiganya diverifikasi ke `pg_attribute`
-- sebelum ditulis — menebak nama kolom yang "masuk akal" adalah kelas
-- kesalahan yang sudah menghapus Rp 755,7 juta dari AC kurva-S.
--
-- Keunikan per-(company, entity_type) baru berlaku sejak migrasi 158; sebelum
-- itu `UNIQUE (entity_type)` GLOBAL membuat baris ini gagal 23505 pada company
-- kedua. 158 WAJIB jalan lebih dulu.
INSERT INTO approval_chains (company_id, entity_type, label, is_active)
SELECT c.id, 'submittal', 'Persetujuan Submittal', true
  FROM companies c
 WHERE NOT EXISTS (
   SELECT 1 FROM approval_chains ac
    WHERE ac.company_id = c.id AND ac.entity_type = 'submittal');

INSERT INTO approval_steps (company_id, chain_id, level, required_permission, min_amount, label)
SELECT ac.company_id, ac.id, 1, 'submittal:decide', NULL, 'Keputusan konsultan/pemberi kerja'
  FROM approval_chains ac
 WHERE ac.entity_type = 'submittal'
   AND NOT EXISTS (SELECT 1 FROM approval_steps s WHERE s.chain_id = ac.id);

-- ── Menu ────────────────────────────────────────────────────────────────────
UPDATE menu_items
   SET href = '/lapangan/submittal', required_permissions = ARRAY['submittal:view']
 WHERE key = 'lp-submittal';

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE n INT; k TEXT;
BEGIN
  IF to_regclass(current_schema() || '.submittals') IS NULL THEN
    RAISE EXCEPTION '159 GAGAL: submittals tak terbentuk';
  END IF;
  IF to_regclass(current_schema() || '.submittal_documents') IS NULL THEN
    RAISE EXCEPTION '159 GAGAL: submittal_documents tak terbentuk';
  END IF;

  FOR k IN SELECT unnest(ARRAY['submittals', 'submittal_documents']) LOOP
    IF (SELECT count(*) FROM pg_policies
         WHERE schemaname = current_schema() AND tablename = k
           AND permissive = 'PERMISSIVE') = 0 THEN
      RAISE EXCEPTION '159 GAGAL: % nol policy permissive — tabel mati total', k;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = current_schema()
                    AND indexname = 'uq_submittals_project_nomor') THEN
    RAISE EXCEPTION '159 GAGAL: keunikan nomor per-proyek tak terbentuk';
  END IF;

  SELECT count(*) INTO n FROM permissions WHERE key LIKE 'submittal:%';
  IF n <> 3 THEN
    RAISE EXCEPTION '159 GAGAL: permission submittal:* = % (harus 3)', n;
  END IF;

  -- Seed turunan gagal DIAM-DIAM kalau capability sumbernya salah nama.
  FOR k IN
    SELECT v.k FROM (VALUES ('submittal:view'), ('submittal:manage'), ('submittal:decide')) v(k)
     WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp
                         JOIN permissions p ON p.id = rp.permission_id WHERE p.key = v.k)
  LOOP
    RAISE EXCEPTION '159 GAGAL: permission % NOL role memegangnya — capability '
      'sumber turunannya kemungkinan salah nama', k;
  END LOOP;

  -- Rantai approval harus benar-benar terbentuk DAN berlangkah. Rantai tanpa
  -- langkah bersifat FAIL-CLOSED (`steps.length === 0` → nol orang bisa
  -- approve): modulnya lahir dengan pengajuan yang mustahil diputuskan.
  SELECT count(*) INTO n FROM approval_chains WHERE entity_type = 'submittal';
  IF n = 0 THEN
    RAISE EXCEPTION '159 GAGAL: rantai approval submittal tak terbentuk';
  END IF;
  SELECT count(*) INTO n
    FROM approval_chains ac JOIN approval_steps s ON s.chain_id = ac.id
   WHERE ac.entity_type = 'submittal';
  IF n = 0 THEN
    RAISE EXCEPTION '159 GAGAL: rantai submittal NOL langkah — fail-closed, '
      'tak seorang pun akan bisa memutuskan submittal';
  END IF;

  -- Tiap company harus punya rantainya sendiri; memakai rantai company lain
  -- adalah cacat T4h yang sudah ditutup.
  IF EXISTS (SELECT 1 FROM companies c
              WHERE NOT EXISTS (SELECT 1 FROM approval_chains ac
                                 WHERE ac.company_id = c.id AND ac.entity_type = 'submittal')) THEN
    RAISE EXCEPTION '159 GAGAL: ada company tanpa rantai approval submittal';
  END IF;

  -- Pengaju tak boleh mencatat keputusan atas pengajuannya sendiri.
  IF EXISTS (SELECT 1 FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
               JOIN permissions p ON p.id = rp.permission_id
              WHERE r.name = 'mandor' AND p.key = 'submittal:decide') THEN
    RAISE EXCEPTION '159 GAGAL: mandor mendapat submittal:decide';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM menu_items
                  WHERE key = 'lp-submittal' AND href = '/lapangan/submittal') THEN
    RAISE EXCEPTION '159 GAGAL: menu lp-submittal tak menunjuk rutenya';
  END IF;

  RAISE NOTICE '159 OK: submittals + submittal_documents, kategori C, 3 capability, rantai approval';
END $$;

COMMIT;
