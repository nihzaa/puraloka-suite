-- ════════════════════════════════════════════════════════════════════════════
-- 291 — REGISTER RISIKO · MITIGASI · PERIZINAN PROYEK · SENGKETA (G3)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Yang DIUKUR lebih dulu, dan bagaimana hasilnya mengubah rencana
--
-- Kelompok G3 di RATIFIKASI berbunyi "5 item, `izin_kerja` sudah ada sebagai
-- titik mula". Diukur ke basis 2026-08-11, dan tiga dari lima item ternyata
-- BUKAN lahan kosong:
--
--   dokumen_kepatuhan     9 baris   → `rk-kepatuhan` SUDAH hidup di /kepatuhan
--   izin_kerja            4 baris   → izin K3, BUKAN perizinan bangunan
--   contract_claims       0 baris   → tabel + rute + 20 test SUDAH ada
--   polis_asuransi        0 baris   → tabel + `lib/register-asuransi.ts` ada
--   risiko / mitigasi   NOL TABEL
--
-- Maka yang dibangun di sini BUKAN lima hal:
--
--   rk-register    dibangun penuh — nol tabel, inti G3
--   rk-mitigasi    MENYATU dengan register, bukan tabel terpisah (alasan di §2)
--   rk-perizinan   dibangun — `dokumen_kepatuhan` menyimpan dokumen PIHAK
--                  (supplier_id / pihak_nama), bukan izin PROYEK. IMB/PBG
--                  melekat pada bangunan, bukan pada perusahaan
--   rk-kepatuhan   TIDAK dibangun ulang — sudah hidup. Yang ditambahkan hanya
--                  sambungannya ke register risiko
--   rk-sengketa    dibangun sebagai ESKALASI dari klaim yang ada, bukan modul
--                  baru — alasannya di §4
--
-- Membangun ulang yang sudah ada adalah cara paling mahal untuk terlihat
-- produktif. Yang tidak dibangun dinyatakan di sini, bukan disembunyikan.
--
-- ── §1. Kenapa register risiko bukan sekadar daftar
--
-- Register risiko yang hanya mendaftar bahaya adalah dokumen tender, bukan
-- alat kerja: ia ditulis sekali, dilampirkan, lalu tak pernah dibuka lagi.
-- Yang membuatnya hidup adalah PERUBAHAN skornya dari waktu ke waktu.
--
-- Karena itu:
--   · `dampak` dan `kemungkinan` disimpan sebagai angka 1..5, dan `skor`
--     adalah kolom TERHITUNG (GENERATED) — bukan angka yang diketik. Skor
--     yang diketik manual akan menyimpang dari faktornya dalam hitungan
--     minggu, dan yang menyimpang itu justru yang dibaca orang.
--   · skor SESUDAH mitigasi disimpan terpisah (`dampak_sisa`,
--     `kemungkinan_sisa`). Register yang menimpa skor awal dengan skor
--     sesudah mitigasi menghapus bukti bahwa mitigasinya berguna — dan
--     pertanyaan pertama saat risikonya terjadi adalah "apa yang sudah
--     dilakukan untuk mencegah?"
--
-- ── §2. Kenapa mitigasi TIDAK jadi tabel terpisah dengan halaman sendiri
--
-- Peta menu memisahkan "Register Risiko" dan "Rencana Mitigasi" jadi dua
-- item. Sebagai TABEL keduanya memang terpisah (satu risiko punya banyak
-- tindakan), dan itu dibangun: `tindakan_mitigasi`.
--
-- Sebagai HALAMAN keduanya tidak boleh terpisah. Mitigasi yang dibaca tanpa
-- risikonya adalah daftar tugas tanpa alasan — dan daftar tugas tanpa alasan
-- adalah hal pertama yang diabaikan orang. ARAH-VISUAL §6a: tab = data yang
-- sama dilihat dari sudut lain; halaman berbeda = entitas berbeda. Mitigasi
-- bukan entitas berbeda, ia BAGIAN dari risiko.
--
-- ── §3. Perizinan proyek — kenapa tabel sendiri, bukan menumpang
--
-- `dokumen_kepatuhan` sudah menyimpan SIUJK/SBU/NPWP/asuransi, dan godaannya
-- adalah menambah jenis 'imb' ke sana. Itu salah: kolom penentunya berbeda.
-- Dokumen kepatuhan menjawab "PIHAK ini boleh bekerja?" (kunci: supplier_id /
-- pihak_nama). Izin bangunan menjawab "PEKERJAAN ini boleh dimulai?" (kunci:
-- project_id) — dan tak punya pihak sama sekali.
--
-- Menumpangkan keduanya berarti setiap query harus mengingat "kalau jenisnya
-- imb maka supplier_id-nya NULL dan project_id-nya wajib" — aturan yang tak
-- bisa dijaga constraint dan hanya hidup di kepala orang yang menulisnya.
--
-- Yang dijaga di sini: izin yang KEDALUWARSA sementara proyeknya masih
-- berjalan. Itu bukan cacat administrasi — pekerjaan yang berjalan tanpa
-- PBG yang berlaku bisa disegel, dan yang disegel adalah proyeknya, bukan
-- berkasnya.
--
-- ── §4. Sengketa — kenapa eskalasi, bukan modul baru
--
-- `contract_claims` sudah hidup (migrasi 184, 20 test). Tetapi enum
-- `claim_status` berakhir di 'ditolak' dan 'gugur' — dan di situlah lubangnya:
--
--   klaim yang DITOLAK tidak hilang. Ia menjadi sengketa.
--
-- Kalau sengketa dibangun sebagai modul lepas, orang akan mengetik ulang
-- nilai, tanggal kejadian, dan dasar klaimnya — dan angka yang diketik ulang
-- akan berbeda dari angka aslinya. Dalam sengketa, selisih angka antara dua
-- dokumen milik sendiri adalah senjata pihak lawan.
--
-- Karena itu `sengketa` menyimpan `klaim_id` (opsional — tak semua sengketa
-- lahir dari klaim) dan `nilai_tuntutan` dijaga constraint agar tak bisa
-- negatif. Sengketa yang berasal dari klaim WAJIB klaim yang sudah ditolak
-- atau gugur: menyengketakan klaim yang masih diproses adalah menyerah
-- sebelum jawabannya keluar.
--
-- ── §5. Yang dijaga constraint, dan kenapa masing-masing
--
--  1. dampak & kemungkinan 1..5 — skala di luar itu membuat skor tak sebanding
--  2. skor GENERATED — tak bisa diketik, jadi tak bisa menyimpang
--  3. risiko tertutup wajib beralasan & bertanggal — risiko yang hilang tanpa
--     penjelasan adalah risiko yang dilupakan, bukan yang selesai
--  4. skor sisa tak boleh MELEBIHI skor awal — mitigasi yang menaikkan risiko
--     adalah salah input, dan angka itu yang dibawa ke rapat
--  5. tindakan mitigasi selesai wajib bertanggal
--  6. izin: berlaku_sampai tak boleh mendahului berlaku_dari
--  7. izin berstatus terbit wajib punya nomor — izin tanpa nomor tak bisa
--     ditunjukkan ke pengawas
--  8. sengketa dari klaim wajib klaim yang sudah ditolak/gugur
--  9. sengketa selesai wajib punya hasil & tanggalnya
-- 10. nilai tuntutan & nilai putusan tak boleh negatif
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Enum
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kategori_risiko') THEN
    CREATE TYPE kategori_risiko AS ENUM (
      'teknis', 'keuangan', 'jadwal', 'k3', 'lingkungan',
      'hukum', 'pengadaan', 'eksternal');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_risiko') THEN
    -- 'terpantau' bukan 'terbuka': risiko tak pernah "dibuka", ia selalu ada
    -- sejak proyeknya ada. Yang berubah adalah apakah ada yang mengawasinya.
    CREATE TYPE status_risiko AS ENUM ('terpantau', 'terjadi', 'tertutup');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'strategi_risiko') THEN
    -- Empat strategi baku ISO 31000. 'terima' ADA dengan sengaja: risiko yang
    -- diterima sadar berbeda dari risiko yang diabaikan, dan register yang
    -- tak bisa menyatakan "kami tahu dan kami terima" memaksa orang menulis
    -- mitigasi palsu supaya barisnya tidak merah.
    CREATE TYPE strategi_risiko AS ENUM ('hindari', 'kurangi', 'alihkan', 'terima');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_tindakan_mitigasi') THEN
    CREATE TYPE status_tindakan_mitigasi AS ENUM ('rencana', 'berjalan', 'selesai', 'batal');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_izin_proyek') THEN
    CREATE TYPE status_izin_proyek AS ENUM (
      'rencana', 'diajukan', 'terbit', 'ditolak', 'dicabut');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_sengketa') THEN
    CREATE TYPE status_sengketa AS ENUM (
      'dicatat', 'negosiasi', 'mediasi', 'arbitrase', 'pengadilan', 'selesai');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Register risiko
--
-- `skor` GENERATED — lihat §1. Kolom terhitung tak bisa diketik, jadi tak
-- bisa menyimpang dari faktornya.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS risiko_proyek (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kode              TEXT,
  judul             TEXT NOT NULL,
  uraian            TEXT,
  kategori          kategori_risiko NOT NULL,
  penyebab          TEXT,
  dampak_uraian     TEXT,

  dampak            SMALLINT NOT NULL,
  kemungkinan       SMALLINT NOT NULL,
  skor              SMALLINT GENERATED ALWAYS AS (dampak * kemungkinan) STORED,

  strategi          strategi_risiko NOT NULL DEFAULT 'kurangi',

  -- Skor SESUDAH mitigasi, disimpan terpisah. Menimpa skor awal menghapus
  -- bukti bahwa mitigasinya berguna (§1).
  dampak_sisa       SMALLINT,
  kemungkinan_sisa  SMALLINT,

  pemilik_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  tenggat_tinjau    DATE,

  status            status_risiko NOT NULL DEFAULT 'terpantau',
  terjadi_pada      DATE,
  ditutup_pada      DATE,
  alasan_tutup      TEXT,

  -- Sambungan ke yang SUDAH ada (§: jangan bangun ulang).
  izin_kerja_id     UUID REFERENCES izin_kerja(id) ON DELETE SET NULL,
  dokumen_kepatuhan_id UUID REFERENCES dokumen_kepatuhan(id) ON DELETE SET NULL,

  catatan           TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'risiko_skala_sah') THEN
    ALTER TABLE risiko_proyek ADD CONSTRAINT risiko_skala_sah
      CHECK (dampak BETWEEN 1 AND 5 AND kemungkinan BETWEEN 1 AND 5);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'risiko_skala_sisa_sah') THEN
    ALTER TABLE risiko_proyek ADD CONSTRAINT risiko_skala_sisa_sah
      CHECK ((dampak_sisa      IS NULL OR dampak_sisa      BETWEEN 1 AND 5)
         AND (kemungkinan_sisa IS NULL OR kemungkinan_sisa BETWEEN 1 AND 5));
  END IF;

  -- Mitigasi yang MENAIKKAN risiko adalah salah input — dan angka itu yang
  -- dibawa ke rapat sebagai "sudah kami tangani".
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'risiko_sisa_tak_melebihi_awal') THEN
    ALTER TABLE risiko_proyek ADD CONSTRAINT risiko_sisa_tak_melebihi_awal
      CHECK (dampak_sisa IS NULL OR kemungkinan_sisa IS NULL
             OR (dampak_sisa * kemungkinan_sisa) <= (dampak * kemungkinan));
  END IF;

  -- Risiko yang hilang tanpa penjelasan adalah risiko yang DILUPAKAN.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'risiko_tertutup_beralasan') THEN
    ALTER TABLE risiko_proyek ADD CONSTRAINT risiko_tertutup_beralasan
      CHECK (status <> 'tertutup'
             OR (ditutup_pada IS NOT NULL
                 AND alasan_tutup IS NOT NULL AND length(trim(alasan_tutup)) >= 10));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'risiko_terjadi_bertanggal') THEN
    ALTER TABLE risiko_proyek ADD CONSTRAINT risiko_terjadi_bertanggal
      CHECK (status <> 'terjadi' OR terjadi_pada IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_risiko_proyek        ON risiko_proyek(project_id);
CREATE INDEX IF NOT EXISTS idx_risiko_status_skor   ON risiko_proyek(status, skor DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_risiko_kode
  ON risiko_proyek(project_id, kode) WHERE kode IS NOT NULL;

-- ------------------------------------------------------------
-- 3. Tindakan mitigasi — tabel terpisah, HALAMAN yang sama (§2)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tindakan_mitigasi (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risiko_id      UUID NOT NULL REFERENCES risiko_proyek(id) ON DELETE CASCADE,
  tindakan       TEXT NOT NULL,
  penanggung_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  tenggat        DATE,
  status         status_tindakan_mitigasi NOT NULL DEFAULT 'rencana',
  selesai_pada   DATE,
  biaya_estimasi NUMERIC(18,2),
  catatan        TEXT,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mitigasi_selesai_bertanggal') THEN
    ALTER TABLE tindakan_mitigasi ADD CONSTRAINT mitigasi_selesai_bertanggal
      CHECK (status <> 'selesai' OR selesai_pada IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mitigasi_biaya_tak_negatif') THEN
    ALTER TABLE tindakan_mitigasi ADD CONSTRAINT mitigasi_biaya_tak_negatif
      CHECK (biaya_estimasi IS NULL OR biaya_estimasi >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mitigasi_risiko ON tindakan_mitigasi(risiko_id);

-- ------------------------------------------------------------
-- 4. Perizinan proyek — IMB/PBG, izin lingkungan (§3)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS izin_proyek (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  jenis          TEXT NOT NULL,
  nomor          TEXT,
  penerbit       TEXT,
  status         status_izin_proyek NOT NULL DEFAULT 'rencana',
  diajukan_pada  DATE,
  berlaku_dari   DATE,
  berlaku_sampai DATE,          -- NULL = tanpa batas (izin lokasi permanen)
  biaya          NUMERIC(18,2),
  file_url       TEXT,
  -- Izin yang MENGHALANGI pekerjaan dimulai. Dibedakan karena akibatnya
  -- berbeda: izin reklame yang belum terbit menunda papan nama; PBG yang
  -- belum terbit membuat seluruh pekerjaan bisa disegel.
  menghalangi_mulai BOOLEAN NOT NULL DEFAULT FALSE,
  catatan        TEXT,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'izin_proyek_masa_urut') THEN
    ALTER TABLE izin_proyek ADD CONSTRAINT izin_proyek_masa_urut
      CHECK (berlaku_dari IS NULL OR berlaku_sampai IS NULL
             OR berlaku_sampai >= berlaku_dari);
  END IF;

  -- Izin tanpa nomor tak bisa ditunjukkan ke pengawas.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'izin_proyek_terbit_bernomor') THEN
    ALTER TABLE izin_proyek ADD CONSTRAINT izin_proyek_terbit_bernomor
      CHECK (status <> 'terbit'
             OR (nomor IS NOT NULL AND length(trim(nomor)) > 0
                 AND berlaku_dari IS NOT NULL));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'izin_proyek_biaya_tak_negatif') THEN
    ALTER TABLE izin_proyek ADD CONSTRAINT izin_proyek_biaya_tak_negatif
      CHECK (biaya IS NULL OR biaya >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_izin_proyek        ON izin_proyek(project_id);
CREATE INDEX IF NOT EXISTS idx_izin_proyek_masa   ON izin_proyek(berlaku_sampai)
  WHERE berlaku_sampai IS NOT NULL;

-- ------------------------------------------------------------
-- 5. Sengketa — ESKALASI dari klaim yang ada (§4)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sengketa (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  -- Opsional: tak semua sengketa lahir dari klaim (mis. sengketa lahan).
  klaim_id        UUID REFERENCES contract_claims(id) ON DELETE SET NULL,
  nomor           TEXT,
  judul           TEXT NOT NULL,
  pihak_lawan     TEXT NOT NULL,
  pokok_perkara   TEXT NOT NULL,
  dasar_hukum     TEXT,
  nilai_tuntutan  NUMERIC(18,2),
  status          status_sengketa NOT NULL DEFAULT 'dicatat',
  tanggal_mulai   DATE NOT NULL,
  forum           TEXT,           -- BANI, PN Bandung, dst
  hasil           TEXT,
  nilai_putusan   NUMERIC(18,2),
  selesai_pada    DATE,
  catatan         TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sengketa_nilai_tak_negatif') THEN
    ALTER TABLE sengketa ADD CONSTRAINT sengketa_nilai_tak_negatif
      CHECK ((nilai_tuntutan IS NULL OR nilai_tuntutan >= 0)
         AND (nilai_putusan  IS NULL OR nilai_putusan  >= 0));
  END IF;

  -- Sengketa yang selesai tanpa hasil tercatat adalah sengketa yang hilang.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sengketa_selesai_berhasil') THEN
    ALTER TABLE sengketa ADD CONSTRAINT sengketa_selesai_berhasil
      CHECK (status <> 'selesai'
             OR (selesai_pada IS NOT NULL
                 AND hasil IS NOT NULL AND length(trim(hasil)) >= 10));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sengketa_selesai_tak_mendahului') THEN
    ALTER TABLE sengketa ADD CONSTRAINT sengketa_selesai_tak_mendahului
      CHECK (selesai_pada IS NULL OR selesai_pada >= tanggal_mulai);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sengketa_proyek ON sengketa(project_id);
CREATE INDEX IF NOT EXISTS idx_sengketa_klaim  ON sengketa(klaim_id) WHERE klaim_id IS NOT NULL;

-- Menyengketakan klaim yang MASIH DIPROSES adalah menyerah sebelum
-- jawabannya keluar (§4). Trigger, bukan CHECK: aturannya menyentuh tabel
-- lain, dan CHECK tak boleh melakukan subquery.
CREATE OR REPLACE FUNCTION fn_sengketa_dari_klaim_selesai()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF NEW.klaim_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status::TEXT INTO v_status FROM contract_claims WHERE id = NEW.klaim_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Klaim yang disengketakan tidak ditemukan';
  END IF;

  IF v_status NOT IN ('ditolak', 'gugur') THEN
    RAISE EXCEPTION
      'Klaim masih berstatus % — sengketa hanya untuk klaim yang sudah ditolak atau gugur',
      v_status;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sengketa_dari_klaim_selesai ON sengketa;
CREATE TRIGGER trg_sengketa_dari_klaim_selesai
  BEFORE INSERT OR UPDATE OF klaim_id ON sengketa
  FOR EACH ROW EXECUTE FUNCTION fn_sengketa_dari_klaim_selesai();

-- ------------------------------------------------------------
-- 6. RLS — lewat projects, karena keempat tabel bersandar pada proyek
-- ------------------------------------------------------------
ALTER TABLE risiko_proyek     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tindakan_mitigasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE izin_proyek       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sengketa          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON risiko_proyek;
CREATE POLICY tenant_isolation ON risiko_proyek AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = risiko_proyek.project_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p
                       WHERE p.id = risiko_proyek.project_id
                         AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON tindakan_mitigasi;
CREATE POLICY tenant_isolation ON tindakan_mitigasi AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM risiko_proyek r JOIN projects p ON p.id = r.project_id
                  WHERE r.id = tindakan_mitigasi.risiko_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM risiko_proyek r JOIN projects p ON p.id = r.project_id
                       WHERE r.id = tindakan_mitigasi.risiko_id
                         AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON izin_proyek;
CREATE POLICY tenant_isolation ON izin_proyek AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = izin_proyek.project_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p
                       WHERE p.id = izin_proyek.project_id
                         AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON sengketa;
CREATE POLICY tenant_isolation ON sengketa AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = sengketa.project_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p
                       WHERE p.id = sengketa.project_id
                         AND p.company_id = (SELECT auth_company_id())));

-- ------------------------------------------------------------
-- 7. Capability
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description) VALUES
  ('risiko:view',    'risiko', 'Lihat register risiko',
   'Melihat register risiko proyek beserta mitigasinya'),
  ('risiko:manage',  'risiko', 'Kelola risiko',
   'Mencatat risiko, menilai skor, dan menyusun tindakan mitigasi'),
  ('izin:view',      'risiko', 'Lihat perizinan proyek',
   'Melihat IMB/PBG dan izin lingkungan proyek'),
  ('izin:manage',    'risiko', 'Kelola perizinan proyek',
   'Mencatat pengajuan dan penerbitan izin proyek'),
  ('sengketa:view',  'risiko', 'Lihat sengketa',
   'Melihat catatan sengketa dan klaim yang tereskalasi'),
  ('sengketa:manage','risiko', 'Kelola sengketa',
   'Mencatat sengketa, forum, dan hasilnya')
ON CONFLICT (key) DO NOTHING;

-- Risiko & izin dilihat luas: PM yang tak tahu risiko proyeknya tak bisa
-- mengelolanya, dan izin yang belum terbit menghentikan pekerjaan di lapangan.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('risiko:view', 'risiko:manage', 'izin:view', 'izin:manage')
   AND r.name IN ('admin', 'direktur', 'pm')
ON CONFLICT DO NOTHING;

-- Sengketa memuat posisi hukum perusahaan terhadap pihak lawan. Kewenangannya
-- sempit — bocornya isi sengketa ke pihak yang salah merugikan perkaranya.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('sengketa:view', 'sengketa:manage')
   AND r.name IN ('admin', 'direktur')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 8. Menu — di migrasi yang SAMA dengan tabelnya (pelajaran 281)
--
-- SATU halaman `/risiko` untuk register + mitigasi (§2), satu `/risiko/izin`,
-- satu `/risiko/sengketa`. Aturan 232: satu route = satu link.
-- `rk-kepatuhan` TIDAK diaktifkan — `/kepatuhan` sudah hidup lewat `kep-*`,
-- dan mengaktifkannya membuat dua item menyala untuk satu halaman.
-- ------------------------------------------------------------
UPDATE menu_items
   SET href = '/risiko', is_active = TRUE,
       required_permissions = ARRAY['risiko:view']::text[]
 WHERE key = 'rk-register';

UPDATE menu_items
   SET href = '/risiko/izin', is_active = TRUE,
       required_permissions = ARRAY['izin:view']::text[]
 WHERE key = 'rk-perizinan';

UPDATE menu_items
   SET href = '/risiko/sengketa', is_active = TRUE,
       required_permissions = ARRAY['sengketa:view']::text[]
 WHERE key = 'rk-sengketa';

-- Mitigasi = tab di /risiko (§2). Kepatuhan regulasi = /kepatuhan yang sudah
-- hidup. Keduanya sengaja TIDAK punya link sendiri.
UPDATE menu_items SET is_active = FALSE WHERE key IN ('rk-mitigasi', 'rk-kepatuhan');

-- ------------------------------------------------------------
-- 9. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  FOR n IN
    SELECT 1 FROM unnest(ARRAY['risiko_proyek', 'tindakan_mitigasi',
                               'izin_proyek', 'sengketa']) t
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables
                        WHERE table_schema = 'public' AND table_name = t)
  LOOP
    RAISE EXCEPTION '291 gagal: ada tabel G3 yang tak terbentuk';
  END LOOP;

  FOR n IN
    SELECT 1 FROM unnest(ARRAY[
      'risiko_skala_sah', 'risiko_skala_sisa_sah', 'risiko_sisa_tak_melebihi_awal',
      'risiko_tertutup_beralasan', 'risiko_terjadi_bertanggal',
      'mitigasi_selesai_bertanggal', 'mitigasi_biaya_tak_negatif',
      'izin_proyek_masa_urut', 'izin_proyek_terbit_bernomor',
      'izin_proyek_biaya_tak_negatif',
      'sengketa_nilai_tak_negatif', 'sengketa_selesai_berhasil',
      'sengketa_selesai_tak_mendahului']) c
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c)
  LOOP
    RAISE EXCEPTION '291 gagal: ada constraint G3 yang tak terpasang';
  END LOOP;

  FOR n IN
    SELECT 1 FROM unnest(ARRAY['risiko_proyek', 'tindakan_mitigasi',
                               'izin_proyek', 'sengketa']) t
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation')
  LOOP
    RAISE EXCEPTION '291 gagal: ada tabel G3 tanpa RLS tenant_isolation';
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sengketa_dari_klaim_selesai') THEN
    RAISE EXCEPTION '291 gagal: trigger sengketa-dari-klaim tak terpasang';
  END IF;

  -- `skor` WAJIB terhitung, bukan kolom biasa. Kalau ia jadi kolom biasa,
  -- seluruh alasan §1 batal tanpa satu pun galat.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'risiko_proyek' AND column_name = 'skor'
       AND is_generated = 'ALWAYS'
  ) THEN
    RAISE EXCEPTION '291 gagal: risiko_proyek.skor bukan kolom terhitung';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'sengketa:manage') THEN
    RAISE EXCEPTION '291 gagal: capability sengketa:manage tak ter-seed';
  END IF;

  -- Menu wajib menunjuk halaman nyata, tepat satu per route.
  IF EXISTS (
    SELECT 1 FROM menu_items
     WHERE key IN ('rk-register', 'rk-perizinan', 'rk-sengketa')
       AND (href LIKE '/m/%' OR is_active IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION '291 gagal: ada menu G3 yang belum menunjuk halaman nyata';
  END IF;

  FOR n IN
    SELECT count(*)::int FROM menu_items
     WHERE is_active AND href IN ('/risiko', '/risiko/izin', '/risiko/sengketa')
     GROUP BY href HAVING count(*) <> 1
  LOOP
    RAISE EXCEPTION '291 gagal: ada route G3 dengan jumlah menu aktif <> 1';
  END LOOP;

  -- Nominal WAJIB numeric, waktu WAJIB timestamptz (CLAUDE.md §5.4).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name IN ('risiko_proyek', 'tindakan_mitigasi', 'izin_proyek', 'sengketa')
       AND (data_type = 'timestamp without time zone'
            OR data_type IN ('double precision', 'real'))
  ) THEN
    RAISE EXCEPTION '291 gagal: ada kolom float atau timestamp tanpa zona waktu';
  END IF;

  RAISE NOTICE '291 OK — risiko_proyek + tindakan_mitigasi + izin_proyek + sengketa';
END $$;
