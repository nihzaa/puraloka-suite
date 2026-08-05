-- 189 — Non-Conformance Report (NCR) · INTI #7
--
-- ══════════════════════════════════════════════════════════════════════════
-- Kenapa NCR, padahal punch list sudah ada
-- ══════════════════════════════════════════════════════════════════════════
--
-- Punch list (migrasi 156) mencatat CACAT: "plafon retak, perbaiki". Ia
-- selesai begitu cacatnya diperbaiki dan diverifikasi.
--
-- NCR mencatat KETIDAKSESUAIAN terhadap spesifikasi, gambar, atau standar —
-- dan yang membedakannya bukan tingkat keparahan, melainkan **apa yang
-- dituntut untuk menutupnya**:
--
--   punch : temuan → perbaikan → verifikasi → tutup
--   NCR   : temuan → DISPOSISI → tindakan perbaikan → verifikasi → tutup
--                    ↑
--                    keputusan formal: diperbaiki? diterima apa adanya?
--                    dibongkar? diganti spesifikasinya?
--
-- Disposisi itu yang tak dimiliki punch list, dan itu yang disyaratkan
-- tender pemerintah (F5-1 triase item #7: "ketidaksesuaian mutu tak punya
-- siklus tutup; tender pemerintah mensyaratkannya").
--
-- ── Kenapa AKAR MASALAH wajib sebelum tutup
--
-- NCR tanpa akar masalah hanya mencatat bahwa sesuatu pernah salah. Yang
-- membuatnya berguna adalah mencegah kejadian yang sama — dan itu mustahil
-- kalau sebabnya tak pernah ditulis. Constraint di bawah menegakkannya:
-- status 'ditutup' menuntut `akar_masalah` terisi.
--
-- ── Kenapa verifikator TIDAK BOLEH sama dengan pelapor
--
-- Orang yang menemukan ketidaksesuaian tak boleh menyatakan sendiri bahwa
-- ia sudah beres. Itu bukan soal kecurigaan — melainkan karena orang yang
-- sama cenderung melihat apa yang ia harapkan. Ditegakkan constraint,
-- bukan diserahkan ke disiplin.

-- ── Enum ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE ncr_severity AS ENUM ('minor', 'major', 'kritis');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- 'terbuka'    → baru dicatat, belum diputuskan apa-apa
  -- 'disposisi'  → sudah diputuskan tindakannya, belum dikerjakan
  -- 'perbaikan'  → sedang dikerjakan
  -- 'verifikasi' → selesai dikerjakan, menunggu diperiksa
  -- 'ditutup'    → terverifikasi beres
  -- 'dibatalkan' → ternyata bukan ketidaksesuaian
  CREATE TYPE ncr_status AS ENUM (
    'terbuka', 'disposisi', 'perbaikan', 'verifikasi', 'ditutup', 'dibatalkan'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- Empat disposisi standar ISO 9001 §8.7. Bukan daftar bebas: masing-masing
  -- punya konsekuensi biaya dan kontrak yang berbeda, dan "lain-lain" akan
  -- dipakai untuk menghindari keputusan.
  --
  --   perbaiki  → kerjakan ulang sampai sesuai spesifikasi
  --   terima    → diterima apa adanya (concession) — WAJIB persetujuan
  --   bongkar   → dibongkar dan dikerjakan ulang dari awal
  --   ubah_spek → spesifikasinya yang diubah (design change)
  CREATE TYPE ncr_disposisi AS ENUM ('perbaiki', 'terima', 'bongkar', 'ubah_spek');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tabel ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ncr_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Nomor unik PER PROYEK, sama seperti punch list. NCR dirujuk dalam surat
  -- resmi ke konsultan/owner ("NCR-003 terlampir"), jadi nomornya harus
  -- stabil dan tak berubah.
  nomor TEXT NOT NULL,

  judul TEXT NOT NULL,
  deskripsi TEXT,
  lokasi TEXT,

  -- Terhadap APA ia tidak sesuai. Ini yang membedakan NCR dari cacat biasa:
  -- selalu ada acuan yang dilanggar.
  acuan TEXT,                      -- "RKS Bab 4.2", "Gambar A-12 rev.3", "SNI 2847:2019"

  severity ncr_severity NOT NULL DEFAULT 'minor',
  status ncr_status NOT NULL DEFAULT 'terbuka',

  -- Kaitan opsional ke pekerjaan, sama seperti punch list.
  rab_item_id UUID REFERENCES rab_items(id) ON DELETE SET NULL,
  work_scope_id UUID REFERENCES work_scopes(id) ON DELETE SET NULL,
  -- NCR sering lahir dari inspeksi yang gagal.
  inspection_request_id UUID REFERENCES inspection_requests(id) ON DELETE SET NULL,

  -- ── Siapa ──
  dilaporkan_oleh UUID NOT NULL REFERENCES users(id),
  ditugaskan_ke UUID REFERENCES users(id) ON DELETE SET NULL,
  diverifikasi_oleh UUID REFERENCES users(id) ON DELETE SET NULL,
  diverifikasi_pada TIMESTAMPTZ,

  -- ── Disposisi: keputusan formal ──
  disposisi ncr_disposisi,
  disposisi_oleh UUID REFERENCES users(id) ON DELETE SET NULL,
  disposisi_pada TIMESTAMPTZ,
  disposisi_catatan TEXT,

  -- ── Penutupan ──
  tindakan_perbaikan TEXT,         -- apa yang DIKERJAKAN
  akar_masalah TEXT,               -- KENAPA terjadi — wajib sebelum tutup
  ditutup_pada TIMESTAMPTZ,

  -- Biaya akibat ketidaksesuaian. `numeric`, bukan float (CLAUDE.md §5.4).
  -- Nullable: sering baru diketahui belakangan, dan memaksa angka di awal
  -- menghasilkan tebakan yang lalu diperlakukan sebagai fakta.
  biaya_dampak NUMERIC(15,2),

  target_selesai DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── Invarian ──

  -- Status di luar 'terbuka'/'dibatalkan' berarti sudah ada keputusan.
  -- Tanpa ini, NCR bisa melompat ke 'perbaikan' tanpa pernah diputuskan
  -- APA yang diperbaiki.
  CONSTRAINT ncr_lanjut_perlu_disposisi CHECK (
    status IN ('terbuka', 'dibatalkan')
    OR (disposisi IS NOT NULL AND disposisi_oleh IS NOT NULL AND disposisi_pada IS NOT NULL)
  ),

  -- Ditutup menuntut jejak lengkap: siapa memverifikasi, kapan, apa yang
  -- dikerjakan, dan KENAPA terjadi. Tanpa akar masalah, NCR hanya arsip
  -- kesalahan — bukan alat mencegahnya terulang.
  CONSTRAINT ncr_tutup_lengkap CHECK (
    status <> 'ditutup'
    OR (diverifikasi_oleh IS NOT NULL
        AND diverifikasi_pada IS NOT NULL
        AND ditutup_pada IS NOT NULL
        AND tindakan_perbaikan IS NOT NULL AND length(trim(tindakan_perbaikan)) > 0
        AND akar_masalah IS NOT NULL AND length(trim(akar_masalah)) > 0)
  ),

  -- Pelapor tak boleh memverifikasi temuannya sendiri.
  CONSTRAINT ncr_verifikator_bukan_pelapor CHECK (
    diverifikasi_oleh IS NULL OR diverifikasi_oleh <> dilaporkan_oleh
  ),

  -- Dibatalkan menuntut alasan — di kolom yang sama dengan catatan
  -- disposisi, karena "ternyata bukan ketidaksesuaian" ADALAH keputusan.
  CONSTRAINT ncr_batal_beralasan CHECK (
    status <> 'dibatalkan'
    OR (disposisi_catatan IS NOT NULL AND length(trim(disposisi_catatan)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ncr_items_project_nomor
  ON ncr_items (project_id, nomor);
CREATE INDEX IF NOT EXISTS idx_ncr_items_project_status
  ON ncr_items (project_id, status);
CREATE INDEX IF NOT EXISTS idx_ncr_items_ditugaskan
  ON ncr_items (ditugaskan_ke) WHERE ditugaskan_ke IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ncr_items_severity
  ON ncr_items (project_id, severity) WHERE status <> 'ditutup';

-- ── Foto bukti ──────────────────────────────────────────────────────────
-- Terpisah dari tabel utama: satu NCR bisa punya banyak foto, dan foto
-- "sebelum" vs "sesudah" adalah bukti yang berbeda perannya.
CREATE TABLE IF NOT EXISTS ncr_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ncr_id UUID NOT NULL REFERENCES ncr_items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  keterangan TEXT,
  -- 'temuan' = bukti ketidaksesuaian · 'perbaikan' = bukti sudah dibereskan.
  -- Tanpa pembeda ini, foto sesudah bisa disalahbaca sebagai bukti temuan.
  jenis TEXT NOT NULL DEFAULT 'temuan' CHECK (jenis IN ('temuan', 'perbaikan')),
  diunggah_oleh UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ncr_photos_ncr ON ncr_photos (ncr_id);

-- ── updated_at ──────────────────────────────────────────────────────────
-- Nama fungsinya `trigger_set_updated_at`, BUKAN `set_updated_at` —
-- diverifikasi dari trigger `punch_items` yang sudah jalan, bukan ditebak.
-- Nama yang salah di sini akan membuat migrasi gagal di lingkungan bersih
-- sementara dev tetap hijau, karena tabelnya sudah terlanjur dibuat.
DROP TRIGGER IF EXISTS trg_ncr_items_updated ON ncr_items;
CREATE TRIGGER trg_ncr_items_updated
  BEFORE UPDATE ON ncr_items
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────
-- Mengikuti pola punch_items: RESTRICTIVE, lewat project.company_id.
-- `(SELECT auth_company_id())` dibungkus SELECT supaya dievaluasi sekali
-- per query, bukan per baris.
ALTER TABLE ncr_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ncr_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON ncr_items;
CREATE POLICY tenant_isolation ON ncr_items AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = ncr_items.project_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p
                       WHERE p.id = ncr_items.project_id
                         AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON ncr_photos;
CREATE POLICY tenant_isolation ON ncr_photos AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM ncr_items n
                   JOIN projects p ON p.id = n.project_id
                  WHERE n.id = ncr_photos.ncr_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM ncr_items n
                        JOIN projects p ON p.id = n.project_id
                       WHERE n.id = ncr_photos.ncr_id
                         AND p.company_id = (SELECT auth_company_id())));

-- ⚠️ RESTRICTIVE saja MEMBUNUH tabel: ia di-AND-kan dengan PERMISSIVE, dan
-- tanpa satu pun PERMISSIVE hasilnya selalu nol baris (pelajaran T1-F3,
-- migrasi 131).
--
-- PERMISSIVE-nya berbasis PERMISSION, bukan `USING (true)` — mengikuti pola
-- punch_items (migrasi 156) dan ADR-004: policy membaca capability, bukan
-- nama jabatan. `USING (true)` akan membuat siapa pun yang lolos isolasi
-- tenant bisa menulis NCR, termasuk klien.
DROP POLICY IF EXISTS akses_ncr_items ON ncr_items;
DROP POLICY IF EXISTS ncr_items_baca ON ncr_items;
CREATE POLICY ncr_items_baca ON ncr_items
  FOR SELECT TO authenticated
  USING ((SELECT has_permission('ncr:view')));

DROP POLICY IF EXISTS ncr_items_kelola ON ncr_items;
CREATE POLICY ncr_items_kelola ON ncr_items
  FOR ALL TO authenticated
  USING ((SELECT has_permission('ncr:manage')))
  WITH CHECK ((SELECT has_permission('ncr:manage')));

DROP POLICY IF EXISTS akses_ncr_photos ON ncr_photos;
DROP POLICY IF EXISTS ncr_photos_baca ON ncr_photos;
CREATE POLICY ncr_photos_baca ON ncr_photos
  FOR SELECT TO authenticated
  USING ((SELECT has_permission('ncr:view')));

DROP POLICY IF EXISTS ncr_photos_kelola ON ncr_photos;
CREATE POLICY ncr_photos_kelola ON ncr_photos
  FOR ALL TO authenticated
  USING ((SELECT has_permission('ncr:manage')))
  WITH CHECK ((SELECT has_permission('ncr:manage')));

-- ── Permission ──────────────────────────────────────────────────────────
-- Empat capability. `ncr:disposisi` DIPISAH dari `ncr:manage` karena
-- disposisi adalah keputusan yang punya konsekuensi biaya dan kontrak:
-- "terima apa adanya" berarti perusahaan menanggung ketidaksesuaian, dan
-- "bongkar" berarti biaya kerja ulang. Orang yang mencatat temuan tak
-- otomatis berwenang memutuskannya.
--
-- `ncr:verify` dipisah dengan alasan yang sama seperti `punch:verify`:
-- yang memperbaiki tak boleh menyatakan perbaikannya sah.
INSERT INTO permissions (key, module, label, description, sort_order)
VALUES
  ('ncr:view',      'mutu', 'Lihat NCR',
   'Melihat register ketidaksesuaian dan statusnya', 620),
  ('ncr:manage',    'mutu', 'Kelola NCR',
   'Mencatat ketidaksesuaian, menugaskan, dan memperbarui tindakan perbaikan', 621),
  ('ncr:disposisi', 'mutu', 'Putuskan Disposisi NCR',
   'Memutuskan tindakan atas ketidaksesuaian (perbaiki / terima / bongkar / '
   'ubah spesifikasi) — keputusan berkonsekuensi biaya dan kontrak', 622),
  ('ncr:verify',    'mutu', 'Verifikasi & Tutup NCR',
   'Menyatakan perbaikan sah dan menutup ketidaksesuaian — sengaja terpisah '
   'dari kelola, supaya pelaksana tidak menutup perkaranya sendiri', 623)
ON CONFLICT (key) DO NOTHING;

-- Penerima DITURUNKAN dari capability yang SUDAH ADA — diverifikasi ada di
-- `permissions`, bukan ditebak dari nama yang masuk akal. Kelas kegagalan
-- yang dicatat migrasi 156: capability sumber yang tak ada menghasilkan NOL
-- BARIS tanpa satu pun error.
--
--   ncr:view      ← projects:view        (admin, pm, mandor, client, direktur)
--   ncr:manage    ← punch:manage         (yang bekerja di lapangan)
--   ncr:disposisi ← progress:manage      (admin & pm — keputusan berbiaya)
--   ncr:verify    ← punch:verify         (pola "menyatakan pekerjaan sah")
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'ncr:view'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'projects:view')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'ncr:manage'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'punch:manage')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'ncr:disposisi'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'progress:manage')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'ncr:verify'
   AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'punch:verify')
ON CONFLICT DO NOTHING;

-- ── Menu ────────────────────────────────────────────────────────────────
-- Dua entri sudah ada dan menunjuk halaman penampung:
--   lp-ncr (Operasi Lapangan) · qc-ncr (Mutu QA/QC)
-- Keduanya diarahkan ke halaman yang sama — NCR memang satu register yang
-- dilihat dari dua sudut kerja, bukan dua daftar berbeda.
UPDATE menu_items SET href = '/mutu/ncr', updated_at = now()
WHERE  key IN ('lp-ncr', 'qc-ncr') AND href LIKE '/m/%';
