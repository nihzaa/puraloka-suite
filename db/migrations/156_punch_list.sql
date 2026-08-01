-- Migration 156: Punch List / Snagging — ROADMAP #24 (Capability Tier-2)
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA INI DULU DARI RFI & SUBMITTAL
-- ══════════════════════════════════════════════════════════════════════════
--
-- Blueprint 01-capability-to-task menandai ketiganya "🔵 Belum dibangun" dengan
-- dependency berbeda: RFI & Submittal butuh Workflow Engine (kini lunas), Punch
-- List hanya butuh "Field Ops core (sudah ada)". Jadi ia yang paling sedikit
-- asumsinya — dan ia menghasilkan data yang QC/NCR nanti rujuk, bukan
-- sebaliknya.
--
-- Ada juga bukti bahwa kebutuhannya SUDAH nyata, bukan diantisipasi:
-- `project_photos` punya kategori `defect` dan **7 baris memakainya**
-- (dihitung 2026-08-01). Lapangan sudah menandai cacat — yang belum ada adalah
-- tempat mencatat apa cacatnya, siapa yang memperbaiki, dan kapan ditutup.
-- Foto itu bukti tanpa perkara.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KATEGORI TENANCY: C (lewat `project_id`)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Temuan cacat SELALU milik satu proyek — tak ada punch item lintas proyek,
-- dan tak ada katalog cacat bersama. Karena itu `project_id NOT NULL` dan
-- scoping mengikuti `projects` (ANCHOR), bukan kolom `company_id` sendiri.
--
-- Ini SENGAJA berbeda dari `assets` (149, kategori B): aset dipakai lintas
-- proyek, cacat tidak. Menyalin pola B ke sini akan membuat dua sumber
-- kebenaran tenancy untuk baris yang sama — dan saat keduanya berselisih,
-- yang menang adalah yang kebetulan dibaca duluan.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KEPUTUSAN RANCANGAN
-- ══════════════════════════════════════════════════════════════════════════
--
-- 1. NOMOR per-proyek, bukan global. `PL-001` di proyek A dan proyek B adalah
--    dua perkara berbeda dan keduanya sah. Keunikan global akan membuat proyek
--    kedua mulai dari `PL-038` — persis cacat `asset_code` di draft 045 dan
--    `financial_config` (145).
--
-- 2. Penanggung jawab = `users`, BUKAN `mandor_assignments`. Cacat bisa
--    ditugaskan ke mandor, PM, atau supplier-liaison; mengikat ke assignment
--    membuat cacat tak bisa dipindahkan saat mandornya berganti — padahal
--    justru pergantian mandor yang paling sering meninggalkan cacat.
--    Kaitan ke pekerjaan tetap ada lewat `work_scope_id` (opsional).
--
-- 3. `rab_item_id` OPSIONAL. Cacat sering ditemukan sebelum siapa pun tahu
--    item RAB mana yang terdampak ("bocor di plafon lantai 2"). Mewajibkannya
--    memaksa penemu menebak, dan tebakan yang salah lebih buruk daripada
--    kosong — laporan biaya-perbaikan-per-item akan terlihat presisi padahal
--    isinya karangan.
--
-- 4. `verified_by` TERPISAH dari `closed_by`. Yang memperbaiki tidak boleh
--    menyatakan perbaikannya sah. Kalau satu kolom saja, mandor menutup
--    cacatnya sendiri dan punch list berubah jadi daftar niat.
--
-- 5. Status `ditolak` ADA. Tanpa itu, satu-satunya cara menyingkirkan temuan
--    yang keliru adalah menghapusnya — dan temuan yang dihapus tak
--    meninggalkan jejak bahwa seseorang pernah keberatan.

BEGIN;

-- ── Enum ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE punch_status AS ENUM (
    'terbuka',      -- baru dicatat, belum ditugaskan/dikerjakan
    'dikerjakan',   -- penanggung jawab sedang memperbaiki
    'menunggu_cek', -- perbaikan diklaim selesai, menunggu verifikasi
    'ditutup',      -- diverifikasi pihak lain, selesai
    'ditolak'       -- temuan dinyatakan tidak berlaku (dengan alasan)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE punch_severity AS ENUM (
    'ringan',   -- kosmetik; tak menghalangi serah terima
    'sedang',   -- harus selesai sebelum serah terima
    'berat',    -- menghalangi pekerjaan lanjutan
    'kritis'    -- keselamatan / struktural — berhenti kerja
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tabel ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS punch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Nomor perkara, unik PER PROYEK (lihat keputusan #1).
  nomor TEXT NOT NULL,

  judul TEXT NOT NULL,
  deskripsi TEXT,
  lokasi TEXT,                     -- "Lantai 2, kamar tidur utama, plafon sisi timur"

  severity punch_severity NOT NULL DEFAULT 'sedang',
  status punch_status NOT NULL DEFAULT 'terbuka',

  -- Kaitan OPSIONAL ke pekerjaan (lihat keputusan #2 & #3).
  rab_item_id UUID REFERENCES rab_items(id) ON DELETE SET NULL,
  work_scope_id UUID REFERENCES work_scopes(id) ON DELETE SET NULL,

  -- Siapa. `ditemukan_oleh` NOT NULL: temuan tanpa penemu tak bisa
  -- dikonfirmasi ulang saat isinya diperdebatkan.
  ditemukan_oleh UUID NOT NULL REFERENCES users(id),
  ditugaskan_ke UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Verifikator TERPISAH dari pelaksana (keputusan #4).
  diverifikasi_oleh UUID REFERENCES users(id) ON DELETE SET NULL,
  diverifikasi_pada TIMESTAMPTZ,

  alasan_penolakan TEXT,           -- wajib saat status='ditolak' (constraint di bawah)

  target_selesai DATE,
  ditutup_pada TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Menolak tanpa alasan sama dengan menghapus diam-diam (keputusan #5).
  CONSTRAINT punch_tolak_beralasan CHECK (
    status <> 'ditolak' OR (alasan_penolakan IS NOT NULL AND length(trim(alasan_penolakan)) > 0)
  ),
  -- Ditutup harus punya jejak SIAPA yang memverifikasi dan KAPAN. Tanpa ini
  -- "ditutup" bisa berarti "seseorang mengubah dropdown".
  CONSTRAINT punch_tutup_terverifikasi CHECK (
    status <> 'ditutup' OR (diverifikasi_oleh IS NOT NULL AND ditutup_pada IS NOT NULL)
  )
);

-- Nomor unik PER PROYEK, bukan global (keputusan #1).
CREATE UNIQUE INDEX IF NOT EXISTS uq_punch_items_project_nomor
  ON punch_items (project_id, nomor);

CREATE INDEX IF NOT EXISTS idx_punch_items_project_status
  ON punch_items (project_id, status);
CREATE INDEX IF NOT EXISTS idx_punch_items_ditugaskan
  ON punch_items (ditugaskan_ke) WHERE ditugaskan_ke IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_punch_items_rab
  ON punch_items (rab_item_id) WHERE rab_item_id IS NOT NULL;

-- ── Bukti foto ──────────────────────────────────────────────────────────────
-- Foto TIDAK disalin: ia tetap di `project_photos` (satu tempat penyimpanan,
-- satu jalur upload, satu bucket ber-policy — jalur itu baru benar-benar hidup
-- sejak migrasi 098). Yang ditambah hanya KAITANNYA, plus penanda apakah foto
-- itu bukti cacat atau bukti perbaikan — perbedaan yang menentukan saat
-- perkaranya diperdebatkan.
CREATE TABLE IF NOT EXISTS punch_item_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  punch_item_id UUID NOT NULL REFERENCES punch_items(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES project_photos(id) ON DELETE CASCADE,
  jenis TEXT NOT NULL DEFAULT 'temuan' CHECK (jenis IN ('temuan', 'perbaikan')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (punch_item_id, photo_id, jenis)
);

CREATE INDEX IF NOT EXISTS idx_punch_photos_item ON punch_item_photos (punch_item_id);

-- ── Trigger updated_at ──────────────────────────────────────────────────────
-- `trigger_set_updated_at` — fungsi generik yang MEMANG ADA (diverifikasi ke
-- `pg_proc`, bukan ditebak dari nama yang lazim).
DROP TRIGGER IF EXISTS trg_punch_items_updated ON punch_items;
CREATE TRIGGER trg_punch_items_updated
  BEFORE UPDATE ON punch_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Kategori C: scoping lewat `projects`. RESTRICTIVE mengunci lintas-tenant,
-- PERMISSIVE memberi akses — RESTRICTIVE tanpa PERMISSIVE = tabel MATI TOTAL
-- (pelajaran migrasi 149/150, tertangkap penjaga t5a/t7).
--
-- Nama policy WAJIB `tenant_isolation` — dijaga `t5a-policy-tenant.test.ts`
-- dan `t7-exit-criteria-l2.test.ts`.
--
-- `(SELECT auth_company_id())` dibungkus SELECT supaya dievaluasi sekali
-- per-query (InitPlan), bukan per-baris.
ALTER TABLE punch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE punch_item_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON punch_items;
CREATE POLICY tenant_isolation ON punch_items AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = punch_items.project_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p
                       WHERE p.id = punch_items.project_id
                         AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON punch_item_photos;
CREATE POLICY tenant_isolation ON punch_item_photos AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM punch_items pi
                   JOIN projects p ON p.id = pi.project_id
                  WHERE pi.id = punch_item_photos.punch_item_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM punch_items pi
                        JOIN projects p ON p.id = pi.project_id
                       WHERE pi.id = punch_item_photos.punch_item_id
                         AND p.company_id = (SELECT auth_company_id())));

-- PERMISSIVE — berbasis permission (ADR-004: kode & policy membaca capability,
-- bukan nama jabatan).
DROP POLICY IF EXISTS punch_items_baca ON punch_items;
CREATE POLICY punch_items_baca ON punch_items
  FOR SELECT TO authenticated
  USING ((SELECT has_permission('punch:view')));

DROP POLICY IF EXISTS punch_items_kelola ON punch_items;
CREATE POLICY punch_items_kelola ON punch_items
  FOR ALL TO authenticated
  USING ((SELECT has_permission('punch:manage')))
  WITH CHECK ((SELECT has_permission('punch:manage')));

DROP POLICY IF EXISTS punch_photos_baca ON punch_item_photos;
CREATE POLICY punch_photos_baca ON punch_item_photos
  FOR SELECT TO authenticated
  USING ((SELECT has_permission('punch:view')));

DROP POLICY IF EXISTS punch_photos_kelola ON punch_item_photos;
CREATE POLICY punch_photos_kelola ON punch_item_photos
  FOR ALL TO authenticated
  USING ((SELECT has_permission('punch:manage')))
  WITH CHECK ((SELECT has_permission('punch:manage')));

-- ── Permission ──────────────────────────────────────────────────────────────
-- Tiga capability, bukan satu. `punch:verify` DIPISAH dari `punch:manage`
-- karena itulah inti keputusan #4: yang memperbaiki tak boleh menyatakan
-- perbaikannya sah. Kalau keduanya satu permission, pemisahan di tabel hanya
-- dekorasi — siapa pun yang bisa mengubah status bisa menutup perkaranya sendiri.
INSERT INTO permissions (key, module, label, description, sort_order)
VALUES
  ('punch:view',   'lapangan', 'Lihat Punch List',
   'Melihat daftar temuan cacat dan statusnya', 610),
  ('punch:manage', 'lapangan', 'Kelola Punch List',
   'Mencatat temuan, menugaskan, dan memperbarui status perbaikan', 611),
  ('punch:verify', 'lapangan', 'Verifikasi Perbaikan',
   'Menyatakan perbaikan sah dan menutup temuan — sengaja terpisah dari kelola, '
   'supaya pelaksana tidak menutup perkaranya sendiri', 612)
ON CONFLICT (key) DO NOTHING;

-- Penerima DITURUNKAN dari capability yang sudah ada, bukan disebut per nama
-- role (ADR-004: permission = capability, role = data konfigurasi yang bisa
-- diubah lewat UI). Menyebut 'admin'/'pm' langsung membuat role kustom yang
-- founder buat nanti — mis. 'pengawas' — tidak kebagian, dan tak ada yang tahu
-- sampai orangnya mengeluh.
--
-- Capability sumber diverifikasi ADA lebih dulu, bukan ditebak dari nama yang
-- masuk akal. Rancangan pertama memakai `progress:approve` — yang TIDAK ADA di
-- `permissions`, sehingga seed `punch:verify` akan menghasilkan NOL BARIS tanpa
-- satu pun error. Kelas kegagalan yang persis dilarang §9a: benar secara
-- sintaks, mati secara jalur. Ditangkap karena dihitung, bukan karena dibaca.
--
-- Pemetaannya (turunan mekanis dari scope yang sudah berlaku hari ini):
--   punch:view    ← `projects:view`      — admin, pm, mandor, client, direktur
--   punch:manage  ← `mandor:view`        — yang bekerja di lapangan; ini yang
--                    membuat mandor kebagian. `progress:manage` TIDAK dipakai:
--                    ia hanya dipegang admin & pm, jadi orang yang justru
--                    menemukan cacat tak akan bisa mencatatnya.
--   punch:verify  ← `mandor:wage:approve` — pola "menyetujui pekerjaan lapangan"
--                    yang sudah ada. Sengaja BUKAN turunan dari `punch:manage`:
--                    itulah yang menjaga keputusan #4 tetap berlaku saat role
--                    baru dibuat lewat UI.
--
-- Konsekuensi yang disengaja: `mandor` mendapat view+manage tapi TIDAK verify
-- (ia tak punya `mandor:wage:approve`), dan `client` hanya view. Keduanya
-- dijaga blok verifikasi di bawah.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'punch:view'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'projects:view')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'punch:manage'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'mandor:view')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'punch:verify'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'mandor:wage:approve')
ON CONFLICT DO NOTHING;

-- ── Menu ────────────────────────────────────────────────────────────────────
-- `lp-punch` sudah terdaftar (migrasi 153). Yang diubah: rutenya jadi nyata +
-- permission yang menyaringnya. Kolomnya `href`, BUKAN `route` (diverifikasi
-- ke `pg_attribute`).
UPDATE menu_items
   SET href = '/lapangan/punch-list',
       required_permissions = ARRAY['punch:view']
 WHERE key = 'lp-punch';

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE n INT;
BEGIN
  IF to_regclass(current_schema() || '.punch_items') IS NULL THEN
    RAISE EXCEPTION '156 GAGAL: punch_items tak terbentuk';
  END IF;
  IF to_regclass(current_schema() || '.punch_item_photos') IS NULL THEN
    RAISE EXCEPTION '156 GAGAL: punch_item_photos tak terbentuk';
  END IF;

  -- RESTRICTIVE tanpa PERMISSIVE = tabel mati total (pelajaran 149/150).
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = current_schema() AND tablename = 'punch_items'
         AND permissive = 'PERMISSIVE') = 0 THEN
    RAISE EXCEPTION '156 GAGAL: punch_items nol policy permissive — tabel mati total';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = current_schema() AND tablename = 'punch_item_photos'
         AND permissive = 'PERMISSIVE') = 0 THEN
    RAISE EXCEPTION '156 GAGAL: punch_item_photos nol policy permissive';
  END IF;

  -- Keunikan nomor harus PER PROYEK. Kalau indeksnya global, proyek kedua
  -- mulai dari nomor lanjutan proyek pertama — cacat 045/145/146 lagi.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = current_schema()
                    AND indexname = 'uq_punch_items_project_nomor') THEN
    RAISE EXCEPTION '156 GAGAL: indeks unik (project_id, nomor) tak terbentuk';
  END IF;

  SELECT count(*) INTO n FROM permissions WHERE key LIKE 'punch:%';
  IF n <> 3 THEN
    RAISE EXCEPTION '156 GAGAL: permission punch:* = % (harus 3)', n;
  END IF;

  -- ⚠️ Seed turunan GAGAL DIAM-DIAM kalau capability sumbernya salah nama:
  -- `INSERT ... SELECT` yang tak cocok menghasilkan nol baris, nol error.
  -- Rancangan pertama memakai `progress:approve` yang tak ada — dan ini blok
  -- yang menangkapnya. HITUNG, jangan percaya bahwa INSERT-nya jalan.
  FOR n IN
    SELECT 1 FROM (VALUES ('punch:view'), ('punch:manage'), ('punch:verify')) v(k)
     WHERE NOT EXISTS (
       SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
        WHERE p.key = v.k)
  LOOP
    RAISE EXCEPTION '156 GAGAL: ada permission punch:* yang NOL role memegangnya '
      '— capability sumber turunannya kemungkinan salah nama (cek `permissions`)';
  END LOOP;

  -- `punch:verify` TIDAK boleh menempel ke mandor — itu inti keputusan #4.
  -- Diperiksa lewat NAMA ROLE, bukan lewat turunan, supaya penjaganya tetap
  -- benar walau aturan turunannya kelak diubah.
  IF EXISTS (
    SELECT 1 FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
     WHERE r.name = 'mandor' AND p.key = 'punch:verify'
  ) THEN
    RAISE EXCEPTION '156 GAGAL: mandor mendapat punch:verify — pelaksana bisa menutup perkaranya sendiri';
  END IF;

  -- Mandor HARUS bisa mencatat temuan — ia yang di lapangan. Kalau tidak,
  -- modulnya lahir tanpa penggunanya.
  IF NOT EXISTS (
    SELECT 1 FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
     WHERE r.name = 'mandor' AND p.key = 'punch:manage'
  ) THEN
    RAISE EXCEPTION '156 GAGAL: mandor TIDAK bisa mencatat temuan — modul lahir tanpa penggunanya';
  END IF;

  -- Client boleh melihat, TIDAK mengelola (transparansi tanpa kendali).
  IF EXISTS (
    SELECT 1 FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
     WHERE r.name = 'client' AND p.key IN ('punch:manage', 'punch:verify')
  ) THEN
    RAISE EXCEPTION '156 GAGAL: client mendapat kendali punch list, bukan sekadar melihat';
  END IF;

  -- Menu harus benar-benar menunjuk ke suatu tempat.
  IF NOT EXISTS (SELECT 1 FROM menu_items
                  WHERE key = 'lp-punch' AND href = '/lapangan/punch-list') THEN
    RAISE EXCEPTION '156 GAGAL: menu lp-punch tak menunjuk rute punch list';
  END IF;

  RAISE NOTICE '156 OK: punch_items + punch_item_photos, kategori C, 3 capability';
END $$;

COMMIT;
