-- ============================================================================
-- 244 — JADWAL TUGAS BERKALA (TJS-A2)
-- ============================================================================
--
-- Repo ini TIDAK PUNYA penjadwal. `/sistem` adalah dua tombol manual, dan
-- kalau tak ada manusia yang menekannya, notifikasi tenggat & milestone TIDAK
-- PERNAH TERBIT.
--
-- ── Kenapa BUKAN pg_cron, padahal tersedia
--
-- `pg_cron` ada di Supabase dan sempat jadi rencana. Tapi ia hanya bisa
-- menjalankan SQL, sementara seluruh logika notifikasi di repo ini adalah
-- TypeScript (`utils/notifications.ts`, `utils/email.ts`, routing penerima).
-- Memakainya menuntut `pg_net` (ekstensi kedua) untuk memanggil balik API —
-- jadi dua ketergantungan baru, keduanya di jalur yang sulit di-debug saat
-- gagal.
--
-- Yang dipakai: **cron GitHub Actions yang SUDAH BERJALAN** di repo ini
-- (`cadangan-harian`, `ci-keepalive`, `uji-pemulihan`). Nol infrastruktur
-- baru, dan jalurnya HTTP biasa yang bisa dipanggil tangan saat menyelidiki.
--
-- Tabel ini karenanya menyimpan NIAT (apa, kapan, terakhir kapan) — bukan
-- mesin pemicunya.
--
-- ── Kenapa `terakhir_jalan` dicatat saat MULAI, bukan saat berhasil
--
-- Pelajaran langsung dari TJS. Kalau dicatat saat berhasil, tugas yang gagal
-- akan diulang tiap tick — dan tugas yang gagal karena beban justru diulang
-- paling sering, memperparah sebabnya sendiri. Mencatat di awal membuat satu
-- periode = satu percobaan.
--
-- Kegagalannya tidak hilang: `terakhir_status` dan `terakhir_galat`
-- merekamnya, dan itu yang dibaca UI.
--
-- ── Kolom jadwal WAJIB punya pembaca
--
-- `BackupPolicy` TJS punya kolom jadwal bertahun-tahun tanpa satu pun kode
-- yang membacanya — "terjadwal di layar, tidak di kenyataan". Penjaga CI
-- `audit-jadwal-punya-pembaca.mjs` lahir bersama tabel ini supaya kelas cacat
-- itu tak bisa terulang diam-diam.
-- ============================================================================

CREATE TABLE IF NOT EXISTS jadwal_tugas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Tugas apa. Bukan enum: menambah tugas baru lebih sering daripada migrasi,
  -- dan daftar yang sah ditegakkan di aplikasi (satu katalog, satu tempat).
  tugas        TEXT NOT NULL,

  jenis        TEXT NOT NULL DEFAULT 'harian',
  jam          TEXT NOT NULL DEFAULT '07:00',
  hari_pekan   SMALLINT,        -- 0=Minggu … 6=Sabtu, untuk 'mingguan'
  hari_bulan   SMALLINT,        -- 1..31, untuk 'bulanan'
  aktif        BOOLEAN NOT NULL DEFAULT true,

  -- Dicatat saat MULAI. Lihat catatan di atas.
  terakhir_jalan   TIMESTAMPTZ,
  terakhir_status  TEXT,        -- 'sukses' | 'gagal'
  terakhir_galat   TEXT,
  terakhir_durasi_ms INTEGER,
  jumlah_jalan     INTEGER NOT NULL DEFAULT 0,

  dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT jadwal_tugas_unik UNIQUE (company_id, tugas),

  CONSTRAINT jadwal_tugas_jenis_sah CHECK (jenis IN ('harian', 'mingguan', 'bulanan')),

  -- Bentuk jam ditegakkan basis, bukan hanya aplikasi. `harusJalan()` menolak
  -- jam tak sah dengan DIAM (alasan 'jam-tak-sah'), dan diam itu benar untuk
  -- runtime — tapi jam rusak tak boleh bisa tersimpan sejak awal.
  CONSTRAINT jadwal_tugas_jam_sah CHECK (jam ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

  CONSTRAINT jadwal_tugas_hari_pekan_sah CHECK (
    hari_pekan IS NULL OR (hari_pekan BETWEEN 0 AND 6)
  ),
  CONSTRAINT jadwal_tugas_hari_bulan_sah CHECK (
    hari_bulan IS NULL OR (hari_bulan BETWEEN 1 AND 31)
  ),
  CONSTRAINT jadwal_tugas_status_sah CHECK (
    terakhir_status IS NULL OR terakhir_status IN ('sukses', 'gagal')
  )
);

CREATE INDEX IF NOT EXISTS idx_jadwal_tugas_company ON jadwal_tugas(company_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_tugas_aktif   ON jadwal_tugas(aktif) WHERE aktif;

COMMENT ON TABLE jadwal_tugas IS
  'Jadwal tugas berkala per tenant. Pemicunya cron GitHub Actions -> '
  'POST /api/v1/jadwal/jalankan. Kolom jadwal WAJIB punya pembaca — dijaga '
  'audit-jadwal-punya-pembaca.mjs.';

COMMENT ON COLUMN jadwal_tugas.terakhir_jalan IS
  'Dicatat saat MULAI, bukan saat berhasil — supaya tugas yang gagal tidak '
  'diulang tiap tick.';

-- ------------------------------------------------------------
-- Tenancy — kategori B.
--
-- Policy ditulis meski jalur API hari ini memakai peran ber-`rolbypassrls`
-- (F2-6): supaya ia langsung hidup saat koneksi pindah peran. Yang menjaga
-- HARI INI tetap penyaringan aplikasi.
-- ------------------------------------------------------------
ALTER TABLE jadwal_tugas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON jadwal_tugas;
CREATE POLICY tenant_isolation ON jadwal_tugas AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS jadwal_tugas_baca ON jadwal_tugas;
CREATE POLICY jadwal_tugas_baca ON jadwal_tugas FOR SELECT USING (true);

DROP POLICY IF EXISTS jadwal_tugas_kelola ON jadwal_tugas;
CREATE POLICY jadwal_tugas_kelola ON jadwal_tugas FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION fn_jadwal_tugas_sentuh()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.diperbarui_pada := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_jadwal_tugas_sentuh ON jadwal_tugas;
CREATE TRIGGER trg_jadwal_tugas_sentuh
  BEFORE UPDATE ON jadwal_tugas
  FOR EACH ROW EXECUTE FUNCTION fn_jadwal_tugas_sentuh();

-- ------------------------------------------------------------
-- Permission
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description, sort_order)
VALUES
  ('settings:schedule:view', 'settings', 'Lihat jadwal tugas',
   'Melihat jadwal tugas berkala beserta riwayat jalannya.', 920),
  ('settings:schedule:manage', 'settings', 'Kelola jadwal tugas',
   'Mengubah jam, frekuensi, dan aktif/nonaktif tugas berkala.', 921)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.key IN ('settings:schedule:view', 'settings:schedule:manage')
  AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Seed: dua tugas yang selama ini HANYA bisa dipicu manual dari /sistem.
--
-- Diaktifkan langsung. Keduanya idempoten (dedup per hari sudah ada di
-- endpoint-nya sejak lama), jadi menjalankannya otomatis tidak menghasilkan
-- notifikasi ganda — dan itu memang prasyarat sebelum tabel ini dibuat.
-- ------------------------------------------------------------
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, aktif)
SELECT c.id, t.tugas, 'harian', t.jam, true
FROM companies c
CROSS JOIN (VALUES
  ('cek-tenggat',   '07:00'),
  ('cek-milestone', '07:05')
) AS t(tugas, jam)
ON CONFLICT (company_id, tugas) DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE v_seed INT;
BEGIN
  IF to_regclass('public.jadwal_tugas') IS NULL THEN
    RAISE EXCEPTION '244 gagal: jadwal_tugas tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'jadwal_tugas' AND relrowsecurity
  ) THEN
    RAISE EXCEPTION '244 gagal: RLS tidak aktif';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'jadwal_tugas' AND policyname = 'tenant_isolation'
      AND permissive = 'RESTRICTIVE'
  ) THEN
    RAISE EXCEPTION '244 gagal: tenant_isolation tidak RESTRICTIVE';
  END IF;

  SELECT count(*) INTO v_seed FROM jadwal_tugas WHERE tugas IN ('cek-tenggat', 'cek-milestone');
  IF v_seed = 0 THEN
    RAISE EXCEPTION '244 gagal: tugas bawaan tidak ter-seed';
  END IF;

  -- CHECK jam benar-benar menolak bentuk rusak.
  BEGIN
    INSERT INTO jadwal_tugas (company_id, tugas, jam)
    VALUES ((SELECT id FROM companies LIMIT 1), '__uji_244__', '25:99');
    RAISE EXCEPTION '244 gagal: CHECK jam TIDAK menolak "25:99"';
  EXCEPTION
    WHEN check_violation THEN NULL;   -- yang diharapkan
  END;
END $$;
