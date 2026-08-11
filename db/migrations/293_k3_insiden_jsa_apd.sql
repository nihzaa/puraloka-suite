-- ════════════════════════════════════════════════════════════════════════════
-- 293 — K3: INSIDEN · JSA · INDUKSI · APD · INSPEKSI · LINGKUNGAN (G4)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Yang DIUKUR lebih dulu, dan satu temuan yang mengubah urutan prioritas
--
-- Kelompok G4 tercatat "7 item, dari NOL TABEL". Diukur ke basis 2026-08-12,
-- dan itu benar untuk tabelnya — tetapi TIDAK benar untuk pemicunya:
--
--   izin_kerja               4 baris, `pengendalian_risiko` & `apd_wajib` TERISI
--   evaluasi_subkon          4 baris · 1 kecelakaan · 8 pelanggaran K3
--   workers                 60 · mandor_assignments 16
--   permissions k3:permit:*  3 capability sudah ada
--   K3 selebihnya            NOL TABEL
--
-- Yang paling menentukan ada di baris kedua:
--
--   `lib/kepatuhan-k3.ts` MENGGUGURKAN subkon dari pekerjaan bila
--   `jumlah_kecelakaan > 0` — dan angka itu DIKETIK MANUAL, tanpa satu pun
--   baris yang menjelaskan kecelakaan apa, kapan, dan siapa yang terluka.
--
-- Jadi sistem ini sudah mengambil keputusan berat tentang orang berdasarkan
-- angka tanpa sumber. Yang mengetik bisa salah ingat, dan yang dinilai tak
-- punya cara membantah — tak ada yang bisa ditunjuk.
--
-- Itulah pemicu nyata modul insiden, dan alasan ia dibangun PENUH sementara
-- item G4 lain dibangun secukupnya (§5).
--
-- ── §1. Kenapa JSA tabel sendiri padahal `izin_kerja` sudah punya
--        `pengendalian_risiko`
--
-- Keduanya menjawab pertanyaan berbeda, dan menyatukannya menghapus manfaat
-- utama JSA:
--
--   izin_kerja.pengendalian_risiko   pengendalian untuk PEKERJAAN INI, hari ini
--   jsa                              analisa bahaya untuk JENIS pekerjaan,
--                                    dipakai ULANG setiap kali jenis itu muncul
--
-- JSA yang ditulis ulang tiap izin akan berbeda-beda tiap kali — dan yang
-- berbeda-beda itu justru pengendalian yang menyelamatkan orang. Menyimpannya
-- sekali per jenis pekerjaan membuat pelajaran dari insiden bisa DIMASUKKAN
-- KEMBALI: satu perbaikan JSA berlaku untuk semua izin berikutnya.
--
-- Karena itu `izin_kerja.jsa_id` ditambahkan — izin merujuk JSA, bukan
-- menyalinnya. Kolom `pengendalian_risiko` yang lama TIDAK dihapus: ia
-- pengendalian tambahan khusus pekerjaan itu, dan menghapusnya akan
-- menghilangkan 4 baris yang sudah terisi.
--
-- ── §2. Insiden: kenapa "nyaris celaka" setara pentingnya
--
-- Nyaris celaka (near miss) adalah kecelakaan yang kebetulan tak melukai
-- siapa pun. Perusahaan yang hanya mencatat yang melukai kehilangan justru
-- data yang paling banyak: satu kecelakaan berat biasanya didahului puluhan
-- nyaris celaka yang tak dilaporkan karena "tidak ada apa-apa".
--
-- Karena itu `jenis_insiden` memuat `nyaris_celaka`, dan ia TIDAK menggugurkan
-- subkon — hanya kecelakaan yang melukai. Kalau nyaris celaka ikut
-- menggugurkan, tak akan ada yang melaporkannya lagi, dan sistemnya berhenti
-- melihat hal yang paling ingin ia lihat.
--
-- ── §3. Insiden: kenapa keparahan DAN hari hilang dipisah
--
-- "Keparahan" adalah penilaian; "hari kerja hilang" adalah fakta. Register
-- yang hanya menyimpan keparahan membuat perbandingan antar-periode mustahil
-- (penilai berganti, standarnya bergeser). Yang hanya menyimpan hari hilang
-- tak bisa membedakan luka ringan dari nyaris fatal yang kebetulan cepat
-- sembuh.
--
-- ── §4. Yang dijaga constraint, dan kenapa masing-masing
--
--  1. insiden yang MELUKAI wajib menyebut korban — insiden tanpa korban yang
--     ditandai melukai adalah data yang tak bisa ditindaklanjuti
--  2. hari kerja hilang tak boleh negatif
--  3. insiden `ditutup` wajib punya tindakan korektif tertulis (>=10 huruf):
--     insiden yang ditutup tanpa perbaikan hanya menunggu terulang
--  4. tanggal kejadian tak boleh di MASA DEPAN — laporan insiden bertanggal
--     besok adalah salah ketik yang masuk ke rekap keselamatan
--  5. JSA: langkah wajib punya bahaya DAN pengendalian; langkah tanpa
--     pengendalian adalah daftar bahaya, bukan analisa
--  6. JSA: risiko sisa tak boleh melebihi risiko awal (sama seperti G3)
--  7. induksi: tanggal induksi tak boleh di masa depan
--  8. APD: serah terima wajib punya penerima; jumlah > 0
--  9. inspeksi: temuan `ditutup` wajib bertanggal & berpenutup
-- 10. lingkungan: nilai ukur wajib punya satuan — angka tanpa satuan tak bisa
--     dibandingkan dengan baku mutu
--
-- ── §5. Kedalaman berbeda, dinyatakan bukan disembunyikan
--
--   PENUH     insiden (pemicu nyata: menggugurkan subkon tanpa sumber)
--             JSA     (dipakai ulang; pelajaran insiden masuk kembali ke sini)
--             inspeksi K3 (temuan berulang adalah sinyal, bukan daftar)
--   RINGAN    induksi · APD · lingkungan — pencatat, karena bentuk kerjanya
--             belum ada dan menebaknya berarti membangun yang pasti dibongkar
--   TIDAK     RK3K sebagai dokumen tersusun — ia RANGKUMAN dari yang di atas,
--             dan menyusunnya sebelum isinya ada menghasilkan template kosong
--             yang diisi asal supaya tendernya lolos. Menunggu tender nyata.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Enum
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jenis_insiden') THEN
    -- `nyaris_celaka` PERTAMA dengan sengaja: ia yang paling sering terjadi
    -- dan paling jarang dilaporkan. Lihat §2.
    CREATE TYPE jenis_insiden AS ENUM (
      'nyaris_celaka', 'kecelakaan_ringan', 'kecelakaan_berat', 'fatal',
      'kerusakan_properti', 'pencemaran_lingkungan');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_insiden') THEN
    CREATE TYPE status_insiden AS ENUM (
      'dilaporkan', 'diselidiki', 'tindakan_berjalan', 'ditutup');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_temuan_k3') THEN
    CREATE TYPE status_temuan_k3 AS ENUM ('terbuka', 'diperbaiki', 'ditutup');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. JSA — analisa bahaya per JENIS pekerjaan, dipakai ulang (§1)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jsa (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- NULL = berlaku untuk seluruh proyek perusahaan. JSA "bekerja di
  -- ketinggian" tak berubah karena proyeknya berbeda.
  project_id     UUID REFERENCES projects(id) ON DELETE CASCADE,
  kode           TEXT,
  jenis_pekerjaan TEXT NOT NULL,
  uraian         TEXT,
  disusun_oleh   UUID REFERENCES users(id) ON DELETE SET NULL,
  disetujui_oleh UUID REFERENCES users(id) ON DELETE SET NULL,
  disetujui_pada DATE,
  berlaku        BOOLEAN NOT NULL DEFAULT TRUE,
  catatan        TEXT,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jsa_langkah (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jsa_id          UUID NOT NULL REFERENCES jsa(id) ON DELETE CASCADE,
  urutan          SMALLINT NOT NULL DEFAULT 1,
  langkah         TEXT NOT NULL,
  bahaya          TEXT NOT NULL,
  pengendalian    TEXT NOT NULL,
  apd_wajib       TEXT,
  -- Skala 1..5 seperti register risiko (migrasi 291) — sengaja SAMA supaya
  -- angkanya sebanding, dan orang tak perlu belajar dua skala.
  dampak          SMALLINT NOT NULL DEFAULT 3,
  kemungkinan     SMALLINT NOT NULL DEFAULT 3,
  skor            SMALLINT GENERATED ALWAYS AS (dampak * kemungkinan) STORED,
  dampak_sisa     SMALLINT,
  kemungkinan_sisa SMALLINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jsa_jenis_tak_kosong') THEN
    ALTER TABLE jsa ADD CONSTRAINT jsa_jenis_tak_kosong
      CHECK (length(trim(jenis_pekerjaan)) > 0);
  END IF;

  -- Langkah tanpa pengendalian adalah DAFTAR BAHAYA, bukan analisa — dan
  -- daftar bahaya tanpa jawaban justru membuat orang berhenti membacanya.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jsa_langkah_lengkap') THEN
    ALTER TABLE jsa_langkah ADD CONSTRAINT jsa_langkah_lengkap
      CHECK (length(trim(langkah)) > 0
         AND length(trim(bahaya)) > 0
         AND length(trim(pengendalian)) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jsa_skala_sah') THEN
    ALTER TABLE jsa_langkah ADD CONSTRAINT jsa_skala_sah
      CHECK (dampak BETWEEN 1 AND 5 AND kemungkinan BETWEEN 1 AND 5
         AND (dampak_sisa      IS NULL OR dampak_sisa      BETWEEN 1 AND 5)
         AND (kemungkinan_sisa IS NULL OR kemungkinan_sisa BETWEEN 1 AND 5));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jsa_sisa_tak_melebihi_awal') THEN
    ALTER TABLE jsa_langkah ADD CONSTRAINT jsa_sisa_tak_melebihi_awal
      CHECK (dampak_sisa IS NULL OR kemungkinan_sisa IS NULL
             OR (dampak_sisa * kemungkinan_sisa) <= (dampak * kemungkinan));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jsa_company ON jsa(company_id);
CREATE INDEX IF NOT EXISTS idx_jsa_langkah ON jsa_langkah(jsa_id, urutan);

-- Izin kerja MERUJUK JSA, tidak menyalinnya (§1). `pengendalian_risiko` yang
-- lama tetap ada: itu pengendalian TAMBAHAN khusus pekerjaan hari itu.
ALTER TABLE izin_kerja ADD COLUMN IF NOT EXISTS jsa_id UUID REFERENCES jsa(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 3. Insiden — inti G4 (§ kepala berkas)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insiden_k3 (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nomor           TEXT,
  jenis           jenis_insiden NOT NULL,
  tanggal         DATE NOT NULL,
  waktu           TIME,
  lokasi          TEXT,
  kronologi       TEXT NOT NULL,
  -- Pihak yang terlibat. `supplier_id` menautkan ke subkon — inilah yang
  -- membuat `evaluasi_subkon.jumlah_kecelakaan` punya sumber yang bisa
  -- ditunjuk, bukan angka yang diketik.
  supplier_id     UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  -- Mandor adalah `users`, BUKAN tabel `mandors` — diukur, bukan ditebak
  -- dari namanya (`workers.mandor_id` menunjuk `users.id`). Tebakan
  -- pertama saya `REFERENCES mandors(id)` dan tabelnya tak ada.
  mandor_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Korban: nama ditulis apa adanya karena tak semua korban terdaftar di
  -- `workers` (tamu, pengemudi pengantar, warga sekitar).
  korban_nama     TEXT,
  korban_worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  melukai         BOOLEAN NOT NULL DEFAULT FALSE,
  hari_kerja_hilang INTEGER NOT NULL DEFAULT 0,
  cedera_uraian   TEXT,

  penyebab_langsung TEXT,
  penyebab_dasar    TEXT,
  tindakan_korektif TEXT,
  -- JSA yang seharusnya mencegahnya. Diisi saat penyelidikan: inilah jalan
  -- pelajaran insiden MASUK KEMBALI ke JSA (§1).
  jsa_id          UUID REFERENCES jsa(id) ON DELETE SET NULL,
  izin_kerja_id   UUID REFERENCES izin_kerja(id) ON DELETE SET NULL,

  status          status_insiden NOT NULL DEFAULT 'dilaporkan',
  dilaporkan_oleh UUID REFERENCES users(id) ON DELETE SET NULL,
  ditutup_pada    DATE,
  ditutup_oleh    UUID REFERENCES users(id) ON DELETE SET NULL,
  biaya_akibat    NUMERIC(18,2),
  catatan         TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insiden_kronologi_tak_kosong') THEN
    ALTER TABLE insiden_k3 ADD CONSTRAINT insiden_kronologi_tak_kosong
      CHECK (length(trim(kronologi)) >= 10);
  END IF;

  -- Insiden yang melukai wajib menyebut korbannya — entah namanya atau
  -- pekerjanya. Tanpa itu, tak ada yang bisa ditindaklanjuti: siapa yang
  -- diobati, siapa yang diberi santunan, siapa yang ditanya kronologinya.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insiden_melukai_berkorban') THEN
    ALTER TABLE insiden_k3 ADD CONSTRAINT insiden_melukai_berkorban
      CHECK (melukai IS NOT TRUE
             OR korban_worker_id IS NOT NULL
             OR (korban_nama IS NOT NULL AND length(trim(korban_nama)) > 0));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insiden_hari_hilang_wajar') THEN
    ALTER TABLE insiden_k3 ADD CONSTRAINT insiden_hari_hilang_wajar
      CHECK (hari_kerja_hilang >= 0);
  END IF;

  -- Insiden yang ditutup tanpa tindakan korektif hanya menunggu terulang.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insiden_ditutup_berkorektif') THEN
    ALTER TABLE insiden_k3 ADD CONSTRAINT insiden_ditutup_berkorektif
      CHECK (status <> 'ditutup'
             OR (ditutup_pada IS NOT NULL
                 AND tindakan_korektif IS NOT NULL
                 AND length(trim(tindakan_korektif)) >= 10));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insiden_biaya_tak_negatif') THEN
    ALTER TABLE insiden_k3 ADD CONSTRAINT insiden_biaya_tak_negatif
      CHECK (biaya_akibat IS NULL OR biaya_akibat >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_insiden_proyek ON insiden_k3(project_id, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_insiden_supplier ON insiden_k3(supplier_id)
  WHERE supplier_id IS NOT NULL;

-- Tanggal kejadian di MASA DEPAN adalah salah ketik yang masuk ke rekap
-- keselamatan — dan rekap itu dipakai menggugurkan subkon. Trigger, bukan
-- CHECK: `CURRENT_DATE` tidak immutable, jadi CHECK menolaknya.
CREATE OR REPLACE FUNCTION fn_insiden_tak_di_masa_depan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tanggal > CURRENT_DATE THEN
    RAISE EXCEPTION
      'Tanggal insiden % ada di masa depan — periksa kembali tanggalnya',
      NEW.tanggal;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_insiden_tak_di_masa_depan ON insiden_k3;
CREATE TRIGGER trg_insiden_tak_di_masa_depan
  BEFORE INSERT OR UPDATE OF tanggal ON insiden_k3
  FOR EACH ROW EXECUTE FUNCTION fn_insiden_tak_di_masa_depan();

-- ------------------------------------------------------------
-- 4. Induksi & pelatihan K3 — RINGAN (§5)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS induksi_k3 (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  worker_id    UUID REFERENCES workers(id) ON DELETE CASCADE,
  -- Nama bebas untuk yang bukan pekerja terdaftar (tamu, pengemudi, tenaga
  -- harian yang belum didata).
  peserta_nama TEXT,
  jenis        TEXT NOT NULL DEFAULT 'induksi_awal',
  tanggal      DATE NOT NULL,
  -- Induksi punya masa berlaku di banyak proyek besar (mis. 1 tahun).
  berlaku_sampai DATE,
  materi       TEXT,
  pemberi      TEXT,
  catatan      TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'induksi_berpeserta') THEN
    ALTER TABLE induksi_k3 ADD CONSTRAINT induksi_berpeserta
      CHECK (worker_id IS NOT NULL
             OR (peserta_nama IS NOT NULL AND length(trim(peserta_nama)) > 0));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'induksi_masa_urut') THEN
    ALTER TABLE induksi_k3 ADD CONSTRAINT induksi_masa_urut
      CHECK (berlaku_sampai IS NULL OR berlaku_sampai >= tanggal);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_induksi_proyek ON induksi_k3(project_id, tanggal DESC);

-- ------------------------------------------------------------
-- 5. APD — RINGAN: daftar jenis + serah terima (§5)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS apd_serah_terima (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  worker_id    UUID REFERENCES workers(id) ON DELETE CASCADE,
  penerima_nama TEXT,
  jenis_apd    TEXT NOT NULL,
  jumlah       INTEGER NOT NULL DEFAULT 1,
  tanggal      DATE NOT NULL,
  -- Kapan APD-nya jatuh tempo diganti. Helm punya masa pakai; harness wajib
  -- diperiksa berkala. APD kedaluwarsa memberi rasa aman tanpa melindungi.
  ganti_sebelum DATE,
  kondisi      TEXT,
  catatan      TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apd_berpenerima') THEN
    ALTER TABLE apd_serah_terima ADD CONSTRAINT apd_berpenerima
      CHECK (worker_id IS NOT NULL
             OR (penerima_nama IS NOT NULL AND length(trim(penerima_nama)) > 0));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apd_jumlah_wajar') THEN
    ALTER TABLE apd_serah_terima ADD CONSTRAINT apd_jumlah_wajar
      CHECK (jumlah > 0 AND length(trim(jenis_apd)) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apd_masa_urut') THEN
    ALTER TABLE apd_serah_terima ADD CONSTRAINT apd_masa_urut
      CHECK (ganti_sebelum IS NULL OR ganti_sebelum >= tanggal);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_apd_proyek ON apd_serah_terima(project_id, tanggal DESC);

-- ------------------------------------------------------------
-- 6. Inspeksi K3 + temuannya — PENUH (§5)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inspeksi_k3 (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nomor        TEXT,
  tanggal      DATE NOT NULL,
  area         TEXT,
  pemeriksa    UUID REFERENCES users(id) ON DELETE SET NULL,
  pemeriksa_nama TEXT,
  ringkasan    TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS temuan_k3 (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspeksi_id  UUID NOT NULL REFERENCES inspeksi_k3(id) ON DELETE CASCADE,
  uraian       TEXT NOT NULL,
  -- Kategori dipakai mencari temuan BERULANG: tiga kali "APD tak dipakai" di
  -- area yang sama bukan tiga temuan, melainkan satu masalah yang tak
  -- pernah diselesaikan.
  kategori     TEXT,
  tingkat      SMALLINT NOT NULL DEFAULT 2,
  tindakan     TEXT,
  penanggung_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tenggat      DATE,
  status       status_temuan_k3 NOT NULL DEFAULT 'terbuka',
  ditutup_pada DATE,
  ditutup_oleh UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'temuan_k3_uraian_tak_kosong') THEN
    ALTER TABLE temuan_k3 ADD CONSTRAINT temuan_k3_uraian_tak_kosong
      CHECK (length(trim(uraian)) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'temuan_k3_tingkat_sah') THEN
    ALTER TABLE temuan_k3 ADD CONSTRAINT temuan_k3_tingkat_sah
      CHECK (tingkat BETWEEN 1 AND 3);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'temuan_k3_ditutup_berjejak') THEN
    ALTER TABLE temuan_k3 ADD CONSTRAINT temuan_k3_ditutup_berjejak
      CHECK (status <> 'ditutup'
             OR (ditutup_pada IS NOT NULL AND ditutup_oleh IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inspeksi_k3_proyek ON inspeksi_k3(project_id, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_temuan_k3_inspeksi ON temuan_k3(inspeksi_id);

-- ------------------------------------------------------------
-- 7. Pemantauan lingkungan — RINGAN (§5)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pemantauan_lingkungan (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parameter    TEXT NOT NULL,
  tanggal      DATE NOT NULL,
  lokasi       TEXT,
  nilai        NUMERIC(18,4) NOT NULL,
  satuan       TEXT NOT NULL,
  -- Baku mutu yang berlaku. Disimpan BERSAMA hasilnya: baku mutu berubah
  -- lewat peraturan, dan hasil lama harus tetap terbaca dengan baku mutu
  -- yang berlaku saat itu.
  baku_mutu    NUMERIC(18,4),
  metode       TEXT,
  catatan      TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  -- Angka tanpa satuan tak bisa dibandingkan dengan baku mutu — dan
  -- "55" bisa berarti aman atau tiga kali ambang tergantung satuannya.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lingkungan_bersatuan') THEN
    ALTER TABLE pemantauan_lingkungan ADD CONSTRAINT lingkungan_bersatuan
      CHECK (length(trim(satuan)) > 0 AND length(trim(parameter)) > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lingkungan_proyek
  ON pemantauan_lingkungan(project_id, parameter, tanggal DESC);

-- ------------------------------------------------------------
-- 8. RLS
-- ------------------------------------------------------------
ALTER TABLE jsa                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE jsa_langkah           ENABLE ROW LEVEL SECURITY;
ALTER TABLE insiden_k3            ENABLE ROW LEVEL SECURITY;
ALTER TABLE induksi_k3            ENABLE ROW LEVEL SECURITY;
ALTER TABLE apd_serah_terima      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspeksi_k3           ENABLE ROW LEVEL SECURITY;
ALTER TABLE temuan_k3             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pemantauan_lingkungan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON jsa;
CREATE POLICY tenant_isolation ON jsa AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS tenant_isolation ON jsa_langkah;
CREATE POLICY tenant_isolation ON jsa_langkah AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM jsa j WHERE j.id = jsa_langkah.jsa_id
                   AND j.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM jsa j WHERE j.id = jsa_langkah.jsa_id
                        AND j.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON insiden_k3;
CREATE POLICY tenant_isolation ON insiden_k3 AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = insiden_k3.project_id
                   AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = insiden_k3.project_id
                        AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON induksi_k3;
CREATE POLICY tenant_isolation ON induksi_k3 AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = induksi_k3.project_id
                   AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = induksi_k3.project_id
                        AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON apd_serah_terima;
CREATE POLICY tenant_isolation ON apd_serah_terima AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = apd_serah_terima.project_id
                   AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = apd_serah_terima.project_id
                        AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON inspeksi_k3;
CREATE POLICY tenant_isolation ON inspeksi_k3 AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = inspeksi_k3.project_id
                   AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = inspeksi_k3.project_id
                        AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON temuan_k3;
CREATE POLICY tenant_isolation ON temuan_k3 AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM inspeksi_k3 i JOIN projects p ON p.id = i.project_id
                  WHERE i.id = temuan_k3.inspeksi_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM inspeksi_k3 i JOIN projects p ON p.id = i.project_id
                       WHERE i.id = temuan_k3.inspeksi_id
                         AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON pemantauan_lingkungan;
CREATE POLICY tenant_isolation ON pemantauan_lingkungan AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = pemantauan_lingkungan.project_id
                   AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = pemantauan_lingkungan.project_id
                        AND p.company_id = (SELECT auth_company_id())));

-- ------------------------------------------------------------
-- 9. Capability — melengkapi `k3:permit:*` yang sudah ada
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description) VALUES
  ('k3:insiden:view',   'k3', 'Lihat insiden K3',
   'Melihat laporan kecelakaan dan nyaris celaka'),
  ('k3:insiden:manage', 'k3', 'Laporkan & selidiki insiden',
   'Mencatat insiden, menyelidiki, dan menutupnya dengan tindakan korektif'),
  ('k3:jsa:view',       'k3', 'Lihat JSA',
   'Melihat analisa bahaya per jenis pekerjaan'),
  ('k3:jsa:manage',     'k3', 'Kelola JSA',
   'Menyusun dan menyetujui analisa bahaya'),
  ('k3:inspeksi:view',  'k3', 'Lihat inspeksi K3',
   'Melihat inspeksi keselamatan dan temuannya'),
  ('k3:inspeksi:manage','k3', 'Kelola inspeksi K3',
   'Mencatat inspeksi, temuan, dan penutupannya'),
  ('k3:induksi:manage', 'k3', 'Kelola induksi & APD',
   'Mencatat induksi K3 dan serah terima alat pelindung diri'),
  ('k3:lingkungan:manage', 'k3', 'Kelola pemantauan lingkungan',
   'Mencatat hasil pengukuran parameter lingkungan')
ON CONFLICT (key) DO NOTHING;

-- Insiden & JSA dilihat LUAS — termasuk mandor. Yang menemukan bahaya di
-- lapangan adalah mandor, dan melaporkan insiden tak boleh menuntut
-- kewenangan administratif. Yang boleh MENUTUP insiden tetap sempit.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('k3:insiden:view', 'k3:insiden:manage',
                 'k3:jsa:view', 'k3:inspeksi:view')
   AND r.name IN ('admin', 'direktur', 'pm', 'mandor')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('k3:jsa:manage', 'k3:inspeksi:manage',
                 'k3:induksi:manage', 'k3:lingkungan:manage')
   AND r.name IN ('admin', 'direktur', 'pm')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 10. Menu — di migrasi yang SAMA dengan tabelnya (pelajaran 281)
--
-- SATU halaman `/k3` dengan tab, bukan tujuh: aturan 232 (satu route = satu
-- link), dan ketujuh item adalah sudut pandang atas KESELAMATAN PROYEK YANG
-- SAMA (ARAH-VISUAL §6a). Insiden mendapat halamannya sendiri karena ia
-- entitas yang dirujuk dari luar (evaluasi subkon, register risiko).
-- ------------------------------------------------------------
UPDATE menu_items
   SET href = '/k3', is_active = TRUE,
       required_permissions = ARRAY['k3:inspeksi:view']::text[]
 WHERE key = 'hse-inspeksi';

UPDATE menu_items
   SET href = '/k3/insiden', is_active = TRUE,
       required_permissions = ARRAY['k3:insiden:view']::text[]
 WHERE key = 'hse-insiden';

UPDATE menu_items
   SET href = '/k3/jsa', is_active = TRUE,
       required_permissions = ARRAY['k3:jsa:view']::text[]
 WHERE key = 'hse-jsa';

-- Tab di `/k3` — bukan link sendiri (aturan 232).
UPDATE menu_items SET is_active = FALSE
 WHERE key IN ('hse-induksi', 'hse-apd', 'hse-lingkungan');

-- RK3K sengaja TIDAK diaktifkan: ia rangkuman dari yang di atas, dan
-- menyusunnya sebelum isinya ada menghasilkan template kosong (§5).
UPDATE menu_items SET is_active = FALSE WHERE key = 'hse-rk3k';

-- ------------------------------------------------------------
-- 11. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  FOR n IN
    SELECT 1 FROM unnest(ARRAY['jsa', 'jsa_langkah', 'insiden_k3', 'induksi_k3',
                               'apd_serah_terima', 'inspeksi_k3', 'temuan_k3',
                               'pemantauan_lingkungan']) t
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables
                        WHERE table_schema = 'public' AND table_name = t)
  LOOP
    RAISE EXCEPTION '293 gagal: ada tabel G4 yang tak terbentuk';
  END LOOP;

  FOR n IN
    SELECT 1 FROM unnest(ARRAY[
      'jsa_jenis_tak_kosong', 'jsa_langkah_lengkap', 'jsa_skala_sah',
      'jsa_sisa_tak_melebihi_awal',
      'insiden_kronologi_tak_kosong', 'insiden_melukai_berkorban',
      'insiden_hari_hilang_wajar', 'insiden_ditutup_berkorektif',
      'insiden_biaya_tak_negatif',
      'induksi_berpeserta', 'induksi_masa_urut',
      'apd_berpenerima', 'apd_jumlah_wajar', 'apd_masa_urut',
      'temuan_k3_uraian_tak_kosong', 'temuan_k3_tingkat_sah',
      'temuan_k3_ditutup_berjejak', 'lingkungan_bersatuan']) c
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c)
  LOOP
    RAISE EXCEPTION '293 gagal: ada constraint G4 yang tak terpasang';
  END LOOP;

  FOR n IN
    SELECT 1 FROM unnest(ARRAY['jsa', 'jsa_langkah', 'insiden_k3', 'induksi_k3',
                               'apd_serah_terima', 'inspeksi_k3', 'temuan_k3',
                               'pemantauan_lingkungan']) t
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation')
  LOOP
    RAISE EXCEPTION '293 gagal: ada tabel G4 tanpa RLS tenant_isolation';
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_insiden_tak_di_masa_depan') THEN
    RAISE EXCEPTION '293 gagal: trigger tanggal-insiden tak terpasang';
  END IF;

  -- `jsa_langkah.skor` WAJIB terhitung — sama seperti risiko_proyek (291).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'jsa_langkah' AND column_name = 'skor'
       AND is_generated = 'ALWAYS'
  ) THEN
    RAISE EXCEPTION '293 gagal: jsa_langkah.skor bukan kolom terhitung';
  END IF;

  -- Sambungan izin kerja → JSA (§1).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'izin_kerja' AND column_name = 'jsa_id'
  ) THEN
    RAISE EXCEPTION '293 gagal: izin_kerja.jsa_id tak terpasang';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'k3:insiden:manage') THEN
    RAISE EXCEPTION '293 gagal: capability k3:insiden:manage tak ter-seed';
  END IF;

  -- Menu wajib menunjuk halaman nyata, tepat satu per route.
  IF EXISTS (
    SELECT 1 FROM menu_items
     WHERE key IN ('hse-inspeksi', 'hse-insiden', 'hse-jsa')
       AND (href LIKE '/m/%' OR is_active IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION '293 gagal: ada menu G4 yang belum menunjuk halaman nyata';
  END IF;

  FOR n IN
    SELECT count(*)::int FROM menu_items
     WHERE is_active AND href IN ('/k3', '/k3/insiden', '/k3/jsa')
     GROUP BY href HAVING count(*) <> 1
  LOOP
    RAISE EXCEPTION '293 gagal: ada route G4 dengan jumlah menu aktif <> 1';
  END LOOP;

  -- Nominal WAJIB numeric, waktu WAJIB timestamptz (CLAUDE.md §5.4).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name IN ('jsa', 'jsa_langkah', 'insiden_k3', 'induksi_k3',
                          'apd_serah_terima', 'inspeksi_k3', 'temuan_k3',
                          'pemantauan_lingkungan')
       AND (data_type = 'timestamp without time zone'
            OR data_type IN ('double precision', 'real'))
  ) THEN
    RAISE EXCEPTION '293 gagal: ada kolom float atau timestamp tanpa zona waktu';
  END IF;

  RAISE NOTICE '293 OK — jsa + insiden_k3 + induksi + apd + inspeksi_k3 + lingkungan';
END $$;
