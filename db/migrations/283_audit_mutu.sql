-- ════════════════════════════════════════════════════════════════════════════
-- 283 — AUDIT MUTU (G1f) — pemeriksaan berkala penerapan SISTEM mutu
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa migrasi ini ada
--
-- Item terakhir kelompok G1 (R-011, 2026-08-11). Diukur hari ini:
--
--     ncr_items             19 baris
--     inspection_requests   24 baris
--     itp_titik              8 baris   ← 280
--     uji_material           5 baris   ← 279
--     inspeksi_checklist     5 baris   ← 279
--     audit mutu           NOL TABEL
--
-- ── Bedanya dari inspeksi, dan kenapa itu menentukan bentuk tabelnya
--
-- INSPEKSI memeriksa PEKERJAAN: "apakah beton kolom ini kuat 250 kg/cm2?"
-- AUDIT memeriksa SISTEM   : "apakah ITP benar-benar diikuti? apakah NCR
--                            ditutup dalam tenggat? apakah uji material
--                            dilakukan sesuai rencana mutu?"
--
-- Auditor tidak mengukur beton. Ia mengukur apakah yang dijanjikan dokumen
-- mutu benar-benar dikerjakan. Karena itu temuannya tidak menunjuk elemen
-- struktur, melainkan KLAUSUL — pasal rencana mutu atau standar yang tak
-- dipatuhi.
--
-- ── Kenapa klasifikasi temuan berupa enum, bukan teks
--
-- Klasifikasi audit punya arti baku yang menentukan AKIBATNYA:
--
--   MAJOR       sistem mutunya gagal pada titik ini — wajib melahirkan NCR
--               dan wajib ditutup sebelum audit berikutnya
--   MINOR       penyimpangan tunggal yang tak membatalkan sistem; wajib
--               diperbaiki, tak wajib jadi NCR
--   OBSERVASI   belum menyimpang, tapi berpotensi. Catatan, bukan tuntutan
--
-- Menyimpannya sebagai teks bebas menghasilkan "Major", "MAJOR", "mayor",
-- "besar" di kolom yang sama, dan pertanyaan "berapa temuan major yang
-- belum ditutup" — satu-satunya pertanyaan yang benar-benar ditanyakan
-- auditor eksternal — jadi mustahil dijawab tanpa menebak ejaan.
--
-- ── Kenapa temuan MAJOR disambungkan ke NCR
--
-- Ini inti modulnya. Audit yang menghasilkan dokumen tanpa akibat adalah
-- ritual: temuan dicatat, laporan dicetak, dan tak ada yang berubah di
-- lapangan. Yang membedakan audit yang bekerja adalah temuan major-nya
-- MASUK ke siklus NCR yang sudah ada — dengan penanggung jawab, target
-- selesai, dan verifikasi penutupan.
--
-- Repo ini sudah tujuh kali membangun kolom dan endpoint yang benar tanpa
-- SAMBUNGANNYA (`audit-kolom-tak-tersambung.mjs` lahir dari itu), dan G1e
-- baru saja mengulanginya. Karena itu `temuan_audit.ncr_id` ada sejak awal,
-- bukan ditambahkan nanti.
--
-- ── Yang dijaga constraint, dan kenapa
--
-- 1. Temuan MAJOR yang audit-nya sudah SELESAI wajib punya NCR. Selama audit
--    masih berjalan, auditor boleh mencatat dulu dan menindaklanjuti
--    kemudian — tapi menutup audit dengan major yang menggantung berarti
--    menyatakan pemeriksaan tuntas sementara akibatnya tak pernah dijalankan.
--    Ini yang membedakan audit dari daftar keluhan.
--
-- 2. Tiap temuan wajib menunjuk KLAUSUL. Temuan tanpa acuan adalah pendapat
--    auditor, dan pendapat tak bisa dibantah maupun ditutup — yang diaudit
--    tak punya cara menunjukkan bahwa ia sudah patuh.
--
-- 3. Audit yang dinyatakan SELESAI wajib punya tanggal selesai dan auditor.
--    Pola sama dengan 157, 279, 280.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Enum
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_mutu_status') THEN
    CREATE TYPE audit_mutu_status AS ENUM ('rencana', 'berjalan', 'selesai', 'dibatalkan');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'temuan_audit_klasifikasi') THEN
    CREATE TYPE temuan_audit_klasifikasi AS ENUM ('major', 'minor', 'observasi');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Audit mutu
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_mutu (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  nomor             TEXT NOT NULL,
  judul             TEXT NOT NULL,

  -- Rencana mutu yang diaudit. NULLABLE: sebagian audit memeriksa penerapan
  -- standar umum tanpa merujuk satu dokumen tertentu.
  rencana_mutu_id   UUID REFERENCES rencana_mutu(id) ON DELETE SET NULL,

  status            audit_mutu_status NOT NULL DEFAULT 'rencana',

  -- Lingkup: bagian mana dari sistem mutu yang diperiksa.
  lingkup           TEXT,
  -- Kriteria audit: standar/pasal yang jadi tolok ukur.
  kriteria          TEXT,

  tanggal_rencana   DATE,
  tanggal_mulai     DATE,
  tanggal_selesai   DATE,

  -- Auditor: orang yang MEMERIKSA. Terpisah dari `dibuat_oleh` (yang
  -- menjadwalkan) karena keduanya sering berbeda, dan yang dipertanggung-
  -- jawabkan dalam laporan adalah pemeriksanya.
  auditor           UUID REFERENCES users(id),
  -- Pihak yang diaudit — bisa tim internal atau subkontraktor.
  teraudit          TEXT,

  kesimpulan        TEXT,
  catatan           TEXT,

  dibuat_oleh       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Nomor audit unik per proyek — dirujuk dalam laporan dan sertifikasi.
  CONSTRAINT audit_mutu_nomor_unik UNIQUE (project_id, nomor),

  -- Audit yang dinyatakan SELESAI wajib punya tanggal selesai DAN auditor.
  --
  -- Laporan audit tanpa nama pemeriksa tak bisa dipertanggungjawabkan, dan
  -- justru laporan itulah yang ditunjukkan ke auditor eksternal.
  CONSTRAINT audit_mutu_selesai_berjejak CHECK (
    status <> 'selesai'
    OR (tanggal_selesai IS NOT NULL AND auditor IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_audit_mutu_proyek
  ON audit_mutu (project_id, tanggal_rencana DESC);

-- ------------------------------------------------------------
-- 3. Temuan audit
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS temuan_audit (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id          UUID NOT NULL REFERENCES audit_mutu(id) ON DELETE CASCADE,

  urutan            INT NOT NULL DEFAULT 0,
  kode              TEXT,

  uraian            TEXT NOT NULL,
  -- Pasal/klausul yang tak dipatuhi. WAJIB — lihat kepala berkas: temuan
  -- tanpa acuan adalah pendapat, dan pendapat tak bisa ditutup.
  klausul           TEXT NOT NULL,
  bukti             TEXT,

  klasifikasi       temuan_audit_klasifikasi NOT NULL,

  -- Sambungan ke siklus NCR — inti modul ini. Temuan major yang tak masuk
  -- siklus NCR tak punya penanggung jawab, target, maupun verifikasi.
  ncr_id            UUID REFERENCES ncr_items(id) ON DELETE SET NULL,

  -- Temuan ditutup saat perbaikannya diverifikasi. `null` = belum.
  ditutup_pada      TIMESTAMPTZ,
  ditutup_oleh      UUID REFERENCES users(id),
  catatan_penutupan TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Penutupan wajib berjejak siapa & kapan (pola 157, 279, 280).
  CONSTRAINT temuan_ditutup_berjejak CHECK (
    ditutup_pada IS NULL OR ditutup_oleh IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_temuan_audit
  ON temuan_audit (audit_id, urutan);
-- Temuan MAJOR yang belum ditutup adalah satu-satunya yang menghalangi
-- sertifikasi. Indeks parsial: itulah pertanyaan yang paling sering diajukan.
CREATE INDEX IF NOT EXISTS idx_temuan_major_terbuka
  ON temuan_audit (audit_id)
  WHERE klasifikasi = 'major' AND ditutup_pada IS NULL;

-- ------------------------------------------------------------
-- 4. Temuan MAJOR wajib ber-NCR saat auditnya SELESAI
--
-- Tidak bisa jadi CHECK constraint: aturannya melibatkan DUA tabel
-- (`temuan_audit.klasifikasi` × `audit_mutu.status`). CHECK hanya melihat
-- barisnya sendiri.
--
-- Trigger dipasang pada KEDUA sisi, karena pelanggarannya bisa datang dari
-- dua arah:
--   (a) audit ditutup sementara ada major tanpa NCR
--   (b) NCR dilepas dari temuan major yang auditnya sudah selesai
--
-- Menjaga hanya satu sisi meninggalkan pintu yang pasti dilewati — dan
-- bukan karena niat buruk, melainkan karena jalur (b) tak terlihat sebagai
-- "menutup audit".
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_major_wajib_ncr()
RETURNS TRIGGER
LANGUAGE plpgsql
-- `search_path` DIPAKU: fungsi SECURITY-sensitif tanpa ini bisa dibelokkan
-- lewat schema bayangan. Bukan pelanggaran `audit-migrasi-skema-dipaku`
-- (yang melarang MEMAKU schema pada nama objek), melainkan praktik yang
-- justru dituntut untuk fungsi.
SET search_path = public, pg_temp
AS $$
DECLARE
  n_gantung INT;
  v_audit_id UUID;
BEGIN
  -- `IF`, bukan `CASE`.
  --
  -- Versi pertama memakai `CASE TG_TABLE_NAME WHEN 'audit_mutu' THEN NEW.id
  -- ELSE NEW.audit_id END` dan GAGAL saat trigger sisi `audit_mutu` menyala:
  -- plpgsql menentukan tipe SELURUH ekspresi CASE sebelum mengevaluasinya,
  -- jadi `NEW.audit_id` tetap diperiksa meski cabangnya tak akan diambil —
  -- dan `audit_mutu` tak punya kolom itu.
  --
  -- Galatnya (`plpgsql_exec_get_datum_type_info`) tidak menyebut kolom mana
  -- yang bermasalah, dan muncul pada UPDATE yang kelihatan tak berhubungan.
  IF TG_TABLE_NAME = 'audit_mutu' THEN
    v_audit_id := NEW.id;
  ELSE
    v_audit_id := NEW.audit_id;
  END IF;

  -- Hanya audit yang SELESAI yang ditegakkan. Selama berjalan, auditor
  -- boleh mencatat temuan dulu dan membuat NCR-nya kemudian.
  IF NOT EXISTS (
    SELECT 1 FROM audit_mutu a WHERE a.id = v_audit_id AND a.status = 'selesai'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO n_gantung
    FROM temuan_audit t
   WHERE t.audit_id = v_audit_id
     AND t.klasifikasi = 'major'
     AND t.ncr_id IS NULL;

  IF n_gantung > 0 THEN
    RAISE EXCEPTION
      'Audit tak bisa diselesaikan: % temuan major belum punya NCR. '
      'Temuan major berarti sistem mutunya gagal di titik itu — tanpa NCR ia '
      'tak punya penanggung jawab, target selesai, maupun verifikasi.', n_gantung
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_selesai_major_berncr ON audit_mutu;
CREATE TRIGGER trg_audit_selesai_major_berncr
  AFTER UPDATE OF status ON audit_mutu
  FOR EACH ROW
  WHEN (NEW.status = 'selesai')
  EXECUTE FUNCTION fn_audit_major_wajib_ncr();

DROP TRIGGER IF EXISTS trg_temuan_major_berncr ON temuan_audit;
CREATE TRIGGER trg_temuan_major_berncr
  AFTER INSERT OR UPDATE OF klasifikasi, ncr_id ON temuan_audit
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_major_wajib_ncr();

-- ------------------------------------------------------------
-- 5. RLS — RESTRICTIVE, lewat project.company_id (pola 189, 279, 280)
-- ------------------------------------------------------------
ALTER TABLE audit_mutu   ENABLE ROW LEVEL SECURITY;
ALTER TABLE temuan_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON audit_mutu;
CREATE POLICY tenant_isolation ON audit_mutu AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = audit_mutu.project_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p
                       WHERE p.id = audit_mutu.project_id
                         AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON temuan_audit;
CREATE POLICY tenant_isolation ON temuan_audit AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM audit_mutu a
                   JOIN projects p ON p.id = a.project_id
                  WHERE a.id = temuan_audit.audit_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM audit_mutu a
                        JOIN projects p ON p.id = a.project_id
                       WHERE a.id = temuan_audit.audit_id
                         AND p.company_id = (SELECT auth_company_id())));

-- ------------------------------------------------------------
-- 6. Capability
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description) VALUES
  ('mutu:audit:view',   'mutu', 'Lihat audit mutu',
   'Melihat audit mutu dan temuannya'),
  ('mutu:audit:manage', 'mutu', 'Kelola audit mutu',
   'Menjadwalkan audit, mencatat temuan, dan menutupnya')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key IN ('mutu:audit:view', 'mutu:audit:manage')
   AND r.name IN ('admin', 'direktur', 'pm')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 7. Menu — href nyata + aktif, di migrasi yang SAMA dengan tabelnya
--
-- 281 sengaja meninggalkan `qc-audit` menunjuk `/m/qc-audit` karena
-- halamannya belum ada. Sekarang ada.
-- ------------------------------------------------------------
UPDATE menu_items
   SET href = '/mutu/audit', is_active = TRUE
 WHERE key = 'qc-audit';

-- ------------------------------------------------------------
-- 8. Verifikasi
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.audit_mutu') IS NULL THEN
    RAISE EXCEPTION '283 gagal: audit_mutu tidak terbentuk';
  END IF;
  IF to_regclass('public.temuan_audit') IS NULL THEN
    RAISE EXCEPTION '283 gagal: temuan_audit tidak terbentuk';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'temuan_audit_klasifikasi') THEN
    RAISE EXCEPTION '283 gagal: enum temuan_audit_klasifikasi tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_mutu_selesai_berjejak'
  ) THEN
    RAISE EXCEPTION '283 gagal: constraint audit_mutu_selesai_berjejak tak terpasang';
  END IF;

  -- Trigger dua sisi — inti modul ini. Kalau salah satu hilang, audit bisa
  -- ditutup dengan major menggantung lewat jalur yang tak dijaga.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_selesai_major_berncr'
  ) THEN
    RAISE EXCEPTION '283 gagal: trigger sisi audit_mutu tak terpasang';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_temuan_major_berncr'
  ) THEN
    RAISE EXCEPTION '283 gagal: trigger sisi temuan_audit tak terpasang';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'audit_mutu' AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION '283 gagal: RLS audit_mutu tak terpasang';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'temuan_audit' AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION '283 gagal: RLS temuan_audit tak terpasang';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'mutu:audit:manage') THEN
    RAISE EXCEPTION '283 gagal: capability mutu:audit:manage tak ter-seed';
  END IF;

  -- Menu wajib menunjuk halaman nyata DAN aktif — pelajaran 281.
  IF EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'qc-audit' AND (href LIKE '/m/%' OR is_active IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION '283 gagal: menu qc-audit belum menunjuk halaman nyata atau masih mati';
  END IF;

  -- Waktu WAJIB timestamptz (CLAUDE.md §5.4).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name IN ('audit_mutu', 'temuan_audit')
       AND data_type = 'timestamp without time zone'
  ) THEN
    RAISE EXCEPTION '283 gagal: ada kolom timestamp tanpa zona waktu';
  END IF;

  RAISE NOTICE '283 OK — audit_mutu + temuan_audit + trigger dua sisi + menu aktif';
END $$;
