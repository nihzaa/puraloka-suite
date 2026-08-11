-- ════════════════════════════════════════════════════════════════════════════
-- 288 — CUTI & IZIN KARYAWAN (G2d)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa migrasi ini ada
--
-- Diukur 2026-08-11:
--
--     pegawai         5 baris   ← 286
--     hari_libur     18 baris   ← sudah ada (nasional + cuti bersama)
--     cuti           NOL TABEL
--
-- `izin_kerja` (4 baris) BUKAN modul ini — itu izin kerja K3 (permit to
-- work) untuk pekerjaan berbahaya. Namanya mirip, urusannya berbeda sama
-- sekali. Menyatukannya karena kemiripan nama adalah cara paling cepat
-- membuat dua modul saling merusak.
--
-- ── Keputusan rancangan yang menentukan kebenaran saldo
--
-- **Saldo cuti DITURUNKAN dari transaksi, bukan disimpan sebagai angka yang
-- di-update.**
--
-- Kolom `sisa_cuti` yang di-UPDATE tiap pengajuan akan menyimpang diam-diam
-- dari riwayatnya: satu update yang gagal separuh, satu pembatalan yang lupa
-- mengembalikan, satu koreksi manual — dan angkanya tak lagi cocok dengan
-- daftar cutinya sendiri. Yang paling berkepentingan angkanya benar adalah
-- karyawan, dan ia tak punya cara memeriksa.
--
-- Karena itu ada DUA tabel:
--
--   `cuti_hak`  = penambahan hak (jatah tahunan, carry-over, bonus).
--                 Satu baris per pemberian, dengan alasannya.
--   `cuti_ambil`= pengambilan. Satu baris per pengajuan.
--
-- Saldo = SUM(hak) − SUM(ambil yang disetujui). Selalu bisa ditelusuri ke
-- barisnya, dan koreksi apa pun meninggalkan jejak.
--
-- ── Kenapa `jumlah_hari` DISIMPAN, bukan dihitung dari rentang tanggal
--
-- Berlawanan dengan aturan di atas, dan sengaja: jumlah hari cuti bergantung
-- pada kalender libur YANG BERLAKU SAAT ITU. Hari libur bisa ditambahkan
-- belakangan (cuti bersama diumumkan pemerintah di tengah tahun), dan kalau
-- jumlahnya dihitung ulang saat dibaca, cuti yang sudah disetujui tiba-tiba
-- memakan jatah yang berbeda.
--
-- Jadi: dihitung SEKALI saat diajukan (dengan kalender saat itu), lalu
-- disimpan. Pola yang sama dengan slip gaji di 287.
--
-- ── Yang dijaga constraint, dan kenapa
--
-- 1. Rentang tanggal tak boleh terbalik.
-- 2. `jumlah_hari` harus > 0 — cuti nol hari adalah baris yang memakan
--    tempat di daftar tanpa berarti apa pun.
-- 3. Yang DISETUJUI/DITOLAK wajib berjejak siapa & kapan (pola 157, 279,
--    280, 283, 286, 287).
-- 4. Penolakan wajib beralasan.
-- 5. Hak cuti wajib punya alasan pemberian — angka jatah yang muncul tanpa
--    keterangan tak bisa dipertanggungjawabkan saat dipertanyakan.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Enum
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_cuti') THEN
    CREATE TYPE status_cuti AS ENUM ('diajukan', 'disetujui', 'ditolak', 'dibatalkan');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jenis_cuti') THEN
    -- `tahunan`  memakai jatah — inilah yang mengurangi saldo
    -- `sakit`    tak memakai jatah, tetapi tetap dicatat (butuh surat dokter
    --            di atas ambang tertentu, dan pola sakit berulang adalah
    --            informasi K3)
    -- `melahirkan`, `penting` (menikah, keluarga wafat), `besar` (cuti
    --            besar setelah masa kerja tertentu) — semuanya di luar jatah
    -- `tanpa_gaji` mengurangi gaji, bukan jatah
    CREATE TYPE jenis_cuti AS ENUM (
      'tahunan', 'sakit', 'melahirkan', 'penting', 'besar', 'tanpa_gaji');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Hak cuti — penambahan jatah
--
-- Satu baris per PEMBERIAN, bukan satu baris per pegawai yang di-update.
-- Lihat kepala berkas.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cuti_hak (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id        UUID NOT NULL REFERENCES pegawai(id) ON DELETE CASCADE,

  -- Tahun jatah. Cuti tahunan biasanya hangus di akhir tahun berikutnya,
  -- dan tanpa tahun asalnya tak ada cara tahu mana yang lebih dulu hangus.
  tahun             INT NOT NULL,

  jumlah_hari       NUMERIC(6,2) NOT NULL,

  -- Kenapa hak ini diberikan: "jatah tahunan 2026", "sisa 2025 dibawa",
  -- "bonus penyelesaian proyek". WAJIB — angka jatah yang muncul tanpa
  -- keterangan tak bisa dipertanggungjawabkan saat dipertanyakan.
  alasan            TEXT NOT NULL,

  -- Kapan hak ini hangus. NULL = tak hangus.
  berlaku_sampai    DATE,

  diberikan_oleh    UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Hak NEGATIF diizinkan: koreksi jatah yang terlanjur diberikan berlebih
  -- harus bisa dicatat sebagai BARIS TERSENDIRI, bukan dengan mengedit baris
  -- lama. Mengedit menghapus jejak; baris koreksi meninggalkannya.
  --
  -- Yang dilarang: nol, yang berarti baris tanpa akibat apa pun.
  CONSTRAINT cuti_hak_bukan_nol CHECK (jumlah_hari <> 0),

  CONSTRAINT cuti_hak_tahun_wajar CHECK (tahun BETWEEN 2000 AND 2200)
);

CREATE INDEX IF NOT EXISTS idx_cuti_hak_pegawai
  ON cuti_hak (pegawai_id, tahun DESC);

-- ------------------------------------------------------------
-- 3. Pengambilan cuti
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cuti_ambil (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id        UUID NOT NULL REFERENCES pegawai(id) ON DELETE CASCADE,

  jenis             jenis_cuti NOT NULL,
  tanggal_mulai     DATE NOT NULL,
  tanggal_selesai   DATE NOT NULL,

  -- DISIMPAN, tidak dihitung ulang saat dibaca. Kalender libur bisa berubah
  -- (cuti bersama diumumkan di tengah tahun), dan cuti yang sudah disetujui
  -- tak boleh tiba-tiba memakan jatah yang berbeda. Lihat kepala berkas.
  jumlah_hari       NUMERIC(6,2) NOT NULL,

  -- Hari libur & akhir pekan yang DILEWATI rentang ini, disimpan sebagai
  -- keterangan. Supaya pegawai yang bertanya "kenapa 3 hari padahal Senin
  -- sampai Jumat" bisa dijawab dari layarnya sendiri.
  hari_dilewati     TEXT,

  alasan            TEXT,
  status            status_cuti NOT NULL DEFAULT 'diajukan',

  diputuskan_oleh   UUID REFERENCES users(id),
  diputuskan_pada   TIMESTAMPTZ,
  alasan_tolak      TEXT,

  diajukan_oleh     UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cuti_rentang_masuk_akal CHECK (tanggal_selesai >= tanggal_mulai),

  -- Cuti nol hari adalah baris yang memakan tempat di daftar tanpa berarti
  -- apa pun — dan ia lolos ke laporan sebagai "1 pengajuan cuti".
  CONSTRAINT cuti_jumlah_positif CHECK (jumlah_hari > 0),

  -- Yang DIPUTUSKAN (disetujui/ditolak) wajib berjejak siapa & kapan.
  CONSTRAINT cuti_diputuskan_berjejak CHECK (
    status NOT IN ('disetujui', 'ditolak')
    OR (diputuskan_oleh IS NOT NULL AND diputuskan_pada IS NOT NULL)
  ),

  -- Penolakan wajib beralasan — yang mengajukan harus tahu APA yang salah,
  -- dan cuti yang ditolak tanpa alasan akan diajukan lagi dengan bentuk yang
  -- sama.
  CONSTRAINT cuti_ditolak_beralasan CHECK (
    status <> 'ditolak'
    OR (alasan_tolak IS NOT NULL AND btrim(alasan_tolak) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_cuti_ambil_pegawai
  ON cuti_ambil (pegawai_id, tanggal_mulai DESC);
-- Yang menunggu putusan — pertanyaan yang paling sering diajukan atasan.
CREATE INDEX IF NOT EXISTS idx_cuti_menunggu
  ON cuti_ambil (pegawai_id) WHERE status = 'diajukan';
-- Rentang tanggal untuk memeriksa tumpang tindih.
CREATE INDEX IF NOT EXISTS idx_cuti_rentang
  ON cuti_ambil (pegawai_id, tanggal_mulai, tanggal_selesai)
  WHERE status IN ('diajukan', 'disetujui');

-- ------------------------------------------------------------
-- 4. RLS — lewat pegawai → company
-- ------------------------------------------------------------
ALTER TABLE cuti_hak   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuti_ambil ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON cuti_hak;
CREATE POLICY tenant_isolation ON cuti_hak AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM pegawai p
                  WHERE p.id = cuti_hak.pegawai_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM pegawai p
                       WHERE p.id = cuti_hak.pegawai_id
                         AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON cuti_ambil;
CREATE POLICY tenant_isolation ON cuti_ambil AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM pegawai p
                  WHERE p.id = cuti_ambil.pegawai_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM pegawai p
                       WHERE p.id = cuti_ambil.pegawai_id
                         AND p.company_id = (SELECT auth_company_id())));

-- ------------------------------------------------------------
-- 5. Capability
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description) VALUES
  ('sdm:cuti:view',    'sdm', 'Lihat cuti',
   'Melihat pengajuan cuti dan saldo jatah'),
  ('sdm:cuti:manage',  'sdm', 'Ajukan cuti',
   'Mengajukan dan membatalkan cuti'),
  ('sdm:cuti:approve', 'sdm', 'Putuskan cuti',
   'Menyetujui atau menolak pengajuan cuti'),
  ('sdm:cuti:hak',     'sdm', 'Tetapkan jatah cuti',
   'Memberikan dan mengoreksi hak cuti karyawan')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key IN ('sdm:cuti:view', 'sdm:cuti:manage')
   AND r.name IN ('admin', 'direktur', 'pm')
ON CONFLICT DO NOTHING;

-- Memutuskan & menetapkan jatah: kewenangan yang lebih sempit.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key IN ('sdm:cuti:approve', 'sdm:cuti:hak')
   AND r.name IN ('admin', 'direktur')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 6. Menu — di migrasi yang SAMA dengan tabelnya (pelajaran 281)
-- ------------------------------------------------------------
UPDATE menu_items
   SET href = '/sdm/cuti', is_active = TRUE,
       required_permissions = ARRAY['sdm:cuti:view']::text[]
 WHERE key = 'hr-cuti';

-- ------------------------------------------------------------
-- 7. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF to_regclass('public.cuti_hak') IS NULL THEN
    RAISE EXCEPTION '288 gagal: cuti_hak tidak terbentuk';
  END IF;
  IF to_regclass('public.cuti_ambil') IS NULL THEN
    RAISE EXCEPTION '288 gagal: cuti_ambil tidak terbentuk';
  END IF;

  FOR n IN
    SELECT 1 FROM unnest(ARRAY['cuti_rentang_masuk_akal', 'cuti_jumlah_positif',
                               'cuti_diputuskan_berjejak', 'cuti_ditolak_beralasan',
                               'cuti_hak_bukan_nol']) k
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = k)
  LOOP
    RAISE EXCEPTION '288 gagal: ada constraint cuti yang tak terpasang';
  END LOOP;

  FOR n IN
    SELECT 1 FROM unnest(ARRAY['cuti_hak', 'cuti_ambil']) t
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation')
  LOOP
    RAISE EXCEPTION '288 gagal: ada tabel cuti tanpa RLS tenant_isolation';
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'sdm:cuti:approve') THEN
    RAISE EXCEPTION '288 gagal: capability sdm:cuti:approve tak ter-seed';
  END IF;

  -- ⚠ TIDAK BOLEH ada baris ter-seed. Jatah cuti adalah pernyataan tentang
  -- hak karyawan — menanamnya lewat migrasi berarti membuat pernyataan itu
  -- tanpa seorang pun memutuskannya. Pola yang sama dengan 284 dan 287.
  SELECT count(*) INTO n FROM cuti_hak;
  IF n > 0 THEN
    RAISE EXCEPTION '288 gagal: % baris hak cuti ter-seed. Jatah hanya boleh '
      'lahir dari keputusan manusia.', n;
  END IF;

  -- Menu wajib menunjuk halaman nyata DAN aktif, tepat satu per route.
  IF EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'hr-cuti' AND (href LIKE '/m/%' OR is_active IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION '288 gagal: menu hr-cuti belum menunjuk halaman nyata atau masih mati';
  END IF;
  SELECT count(*) INTO n FROM menu_items WHERE is_active AND href = '/sdm/cuti';
  IF n <> 1 THEN
    RAISE EXCEPTION '288 gagal: % menu aktif menunjuk /sdm/cuti (harus tepat 1)', n;
  END IF;

  -- Waktu WAJIB timestamptz (CLAUDE.md §5.4).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name IN ('cuti_hak', 'cuti_ambil')
       AND data_type = 'timestamp without time zone'
  ) THEN
    RAISE EXCEPTION '288 gagal: ada kolom timestamp tanpa zona waktu';
  END IF;

  RAISE NOTICE '288 OK — cuti_hak + cuti_ambil + menu aktif, NOL baris ter-seed';
END $$;
