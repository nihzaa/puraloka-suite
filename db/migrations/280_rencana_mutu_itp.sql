-- ════════════════════════════════════════════════════════════════════════════
-- 280 — RENCANA MUTU PROYEK + INSPECTION & TEST PLAN (G1e)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa migrasi ini ada
--
-- R-011 (2026-08-11) mencabut seluruh larangan bangun. Dari 7 sub-item Mutu,
-- dua ini masih NOL TABEL — diukur 2026-08-11:
--
--   inspection_requests    24 baris  ← sudah ada, hasil PELAKSANAAN
--   inspeksi_checklist      5 baris  ← 279
--   uji_material            5 baris  ← 279
--   rencana mutu           NOL TABEL
--   ITP                    NOL TABEL
--
-- Yang hilang bukan tempat menyimpan dokumen: yang hilang adalah **rencana
-- yang bisa dibandingkan dengan pelaksanaannya**. Hari ini 24 inspeksi ada
-- tanpa ada satu pun pernyataan berapa yang SEHARUSNYA ada — jadi tak ada cara
-- menjawab "titik periksa mana yang terlewat" selain mengingat.
--
-- ── Kenapa ITP bukan sekadar daftar
--
-- Titik periksa dalam ITP punya sifat yang menentukan apakah pekerjaan boleh
-- lanjut, dan istilahnya baku di kontrak konstruksi:
--
--   HOLD    pekerjaan BERHENTI sampai titik ini lolos. Melewatinya berarti
--           menutup pekerjaan yang belum boleh ditutup — pembesian yang
--           sudah dicor tak bisa diperiksa lagi tanpa membongkar.
--   WITNESS pemilik/konsultan berhak HADIR, tetapi ketidakhadirannya tidak
--           menahan pekerjaan. Wajib diberi tahu, tidak wajib ditunggu.
--   REVIEW  cukup dokumen (sertifikat, hasil lab) — tak ada yang perlu
--           datang ke lokasi.
--
-- Kalau ketiganya disimpan sama, ITP jadi hiasan: tak ada yang bisa dijawab
-- dengan bertanya ke basis, dan satu-satunya penjaga jadi ingatan orang.
-- Karena itu `jenis_titik` NOT NULL dan berupa enum — bukan teks bebas.
--
-- ── Kenapa `inspection_requests` DISAMBUNGKAN, bukan tabel terpisah
--
-- Repo ini sudah punya kelas cacat yang berulang tujuh kali: kolom dan
-- endpoint ada, terpisah-pisah dan masing-masing ber-test, tetapi
-- SAMBUNGANNYA tak pernah dibuat — sehingga dua modul yang seharusnya saling
-- menjelaskan tak pernah bertemu (`audit-kolom-tak-tersambung.mjs` lahir dari
-- itu).
--
-- ITP tanpa `inspection_requests.itp_titik_id` akan mengulanginya persis:
-- rencana di satu tabel, pelaksanaan di tabel lain, dan pertanyaan yang jadi
-- alasan modul ini dibangun — "titik HOLD mana yang belum lolos padahal
-- pekerjaannya sudah jalan?" — tetap tak terjawab.
--
-- ── Kenapa RMP dan ITP DUA tabel
--
-- RMP  = pernyataan tingkat PROYEK: standar apa yang dipakai, siapa
--        penanggung jawab mutu, revisi ke berapa, disetujui siapa. Satu
--        proyek satu dokumen aktif.
-- ITP  = BARIS-BARIS titik periksa. Satu RMP punya banyak, dan tiap barisnya
--        punya siklus hidupnya sendiri (direncanakan → diperiksa → lolos).
--
-- Menyatukannya memaksa kolom tingkat-dokumen berulang di tiap baris titik,
-- dan revisi dokumen jadi tak bisa dinyatakan tanpa menyentuh semua barisnya.
--
-- ── Yang dijaga constraint, dan kenapa
--
-- 1. Titik yang dinyatakan SUDAH DIPERIKSA wajib punya pemeriksa dan waktunya
--    (pola sama dengan 157 dan 279). Titik "lolos" tanpa siapa-kapan tak bisa
--    dipertanggungjawabkan saat sengketa — dan justru sengketa alasan ITP ada.
--
-- 2. RMP yang berstatus `disetujui` wajib punya penyetuju dan tanggalnya.
--    Dokumen mutu yang mengaku disetujui tanpa jejak siapa yang menyetujui
--    adalah klaim, bukan bukti.
--
-- 3. Nomor revisi RMP tak boleh mundur — revisi adalah bilangan naik. Ini
--    dijaga di aplikasi, tetapi bentuk kolomnya (INT NOT NULL DEFAULT 0)
--    membuat "tak ada revisi" mustahil dibedakan dari "revisi 0"; keduanya
--    memang sama, dan itu disengaja.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Jenis titik periksa — enum, bukan teks bebas
--
-- Teks bebas akan menghasilkan "Hold", "HOLD", "hold point", "H" di kolom
-- yang sama, dan pertanyaan "titik HOLD mana yang belum lolos" jadi mustahil
-- dijawab tanpa menebak ejaan.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'itp_jenis_titik') THEN
    CREATE TYPE itp_jenis_titik AS ENUM ('hold', 'witness', 'review');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rmp_status') THEN
    CREATE TYPE rmp_status AS ENUM ('draf', 'diajukan', 'disetujui', 'kedaluwarsa');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Rencana Mutu Proyek
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rencana_mutu (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  nomor             TEXT NOT NULL,
  judul             TEXT NOT NULL,

  -- Revisi: dokumen mutu HIDUP sepanjang proyek dan berubah. Yang penting
  -- bukan revisi keberapanya, melainkan bahwa revisi lama tak hilang —
  -- klaim dan sengketa merujuk versi yang berlaku SAAT pekerjaan dilakukan.
  revisi            INT NOT NULL DEFAULT 0,

  status            rmp_status NOT NULL DEFAULT 'draf',

  -- Standar acuan: "SNI 2847:2019, SNI 03-2834-2000, Spesifikasi Teknis Bab 3".
  -- Teks, bukan relasi: acuan datang dari dokumen tender yang bentuknya
  -- berbeda tiap proyek, dan memaksakan katalog akan membuat orang menulis
  -- "lain-lain" untuk sebagian besar kasus.
  standar_acuan     TEXT,

  -- Penanggung jawab mutu di proyek ini. NULLABLE: draf awal sering disusun
  -- sebelum orangnya ditunjuk.
  penanggung_jawab  UUID REFERENCES users(id),

  sasaran_mutu      TEXT,
  catatan           TEXT,

  disetujui_oleh    UUID REFERENCES users(id),
  disetujui_pada    TIMESTAMPTZ,

  dibuat_oleh       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Nomor + revisi unik per proyek: dokumen ini dirujuk dalam surat resmi,
  -- dan dua dokumen bernomor sama membuat rujukan itu ambigu.
  CONSTRAINT rencana_mutu_nomor_unik UNIQUE (project_id, nomor, revisi),

  -- Yang mengaku DISETUJUI wajib punya jejak siapa & kapan.
  --
  -- Tanpa ini, `status = 'disetujui'` hanyalah pernyataan yang bisa disetel
  -- siapa pun — dan dokumen mutu yang mengaku disetujui adalah persis yang
  -- ditunjukkan ke pemilik dan auditor.
  CONSTRAINT rmp_disetujui_berjejak CHECK (
    status <> 'disetujui'
    OR (disetujui_oleh IS NOT NULL AND disetujui_pada IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_rencana_mutu_proyek
  ON rencana_mutu (project_id, revisi DESC);

-- ------------------------------------------------------------
-- 3. Titik periksa ITP
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS itp_titik (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rencana_mutu_id   UUID NOT NULL REFERENCES rencana_mutu(id) ON DELETE CASCADE,

  -- Urutan tahapan pekerjaan. Bermakna: pembesian diperiksa SEBELUM
  -- pengecoran, dan daftar yang mengurut menurut waktu input akan
  -- membalikkannya.
  urutan            INT NOT NULL DEFAULT 0,

  kode              TEXT,
  tahap_pekerjaan   TEXT NOT NULL,
  uraian            TEXT NOT NULL,

  -- Menentukan apakah pekerjaan boleh lanjut. Lihat kepala berkas.
  jenis_titik       itp_jenis_titik NOT NULL,

  -- Kriteria penerimaan + acuannya. Titik periksa tanpa kriteria menyerahkan
  -- keputusan lolos/tidak ke pendapat orang yang kebetulan hadir.
  kriteria          TEXT,
  acuan             TEXT,
  metode_verifikasi TEXT,

  -- Siapa yang harus hadir/memverifikasi — kontraktor, konsultan, pemilik.
  -- Teks: susunan pihak berbeda tiap kontrak.
  pihak_verifikasi  TEXT,

  -- Sambungan ke RAB: titik periksa melekat pada pekerjaan tertentu.
  rab_item_id       UUID REFERENCES rab_items(id) ON DELETE SET NULL,

  -- ── Hasil pelaksanaan ──────────────────────────────────────────────
  -- NULL = belum diperiksa. Dibedakan dari `false` (diperiksa, gagal) —
  -- pola yang sama dengan `inspeksi_checklist.lolos` (279), dan alasannya
  -- sama: pekerjaan yang belum diperiksa tak boleh terhitung lolos.
  lolos             BOOLEAN,
  diperiksa_oleh    UUID REFERENCES users(id),
  diperiksa_pada    TIMESTAMPTZ,
  catatan_hasil     TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Hasil pemeriksaan wajib punya pemeriksa DAN waktunya (pola 157 & 279).
  CONSTRAINT itp_hasil_berpemeriksa CHECK (
    lolos IS NULL
    OR (diperiksa_oleh IS NOT NULL AND diperiksa_pada IS NOT NULL)
  ),

  -- Titik yang GAGAL wajib beralasan — yang menerima tugas perbaikan harus
  -- tahu APA yang salah, bukan sekadar bahwa ada yang salah.
  CONSTRAINT itp_gagal_beralasan CHECK (
    lolos IS DISTINCT FROM FALSE
    OR (catatan_hasil IS NOT NULL AND btrim(catatan_hasil) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_itp_rencana
  ON itp_titik (rencana_mutu_id, urutan);
-- Titik HOLD yang belum lolos adalah satu-satunya yang MENAHAN pekerjaan.
-- Indeks parsial: itulah pertanyaan yang paling sering ditanyakan.
CREATE INDEX IF NOT EXISTS idx_itp_hold_belum
  ON itp_titik (rencana_mutu_id)
  WHERE jenis_titik = 'hold' AND lolos IS DISTINCT FROM TRUE;

-- ------------------------------------------------------------
-- 4. SAMBUNGAN — inspeksi tahu titik ITP mana yang dijawabnya
--
-- Tanpa kolom ini, rencana dan pelaksanaan hidup di dua tabel yang tak
-- pernah bertemu, dan repo ini sudah tujuh kali mengalaminya. Lihat kepala
-- berkas.
-- ------------------------------------------------------------
ALTER TABLE inspection_requests
  ADD COLUMN IF NOT EXISTS itp_titik_id UUID REFERENCES itp_titik(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inspeksi_itp
  ON inspection_requests (itp_titik_id) WHERE itp_titik_id IS NOT NULL;

-- ------------------------------------------------------------
-- 5. RLS — RESTRICTIVE, lewat project.company_id (pola 189 & 279)
-- ------------------------------------------------------------
ALTER TABLE rencana_mutu ENABLE ROW LEVEL SECURITY;
ALTER TABLE itp_titik    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON rencana_mutu;
CREATE POLICY tenant_isolation ON rencana_mutu AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = rencana_mutu.project_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p
                       WHERE p.id = rencana_mutu.project_id
                         AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON itp_titik;
CREATE POLICY tenant_isolation ON itp_titik AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM rencana_mutu r
                   JOIN projects p ON p.id = r.project_id
                  WHERE r.id = itp_titik.rencana_mutu_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM rencana_mutu r
                        JOIN projects p ON p.id = r.project_id
                       WHERE r.id = itp_titik.rencana_mutu_id
                         AND p.company_id = (SELECT auth_company_id())));

-- ------------------------------------------------------------
-- 6. Capability
--
-- Terpisah dari `mutu:uji:*` (279): yang menyusun rencana mutu dan menyetujui
-- ITP bukan orang yang sama dengan yang mencatat hasil lab.
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description) VALUES
  ('mutu:rmp:view',   'mutu', 'Lihat rencana mutu',
   'Melihat Rencana Mutu Proyek dan titik-titik ITP'),
  ('mutu:rmp:manage', 'mutu', 'Kelola rencana mutu',
   'Menyusun & merevisi Rencana Mutu Proyek dan ITP'),
  ('mutu:rmp:approve', 'mutu', 'Setujui rencana mutu',
   'Menyetujui Rencana Mutu Proyek sehingga berlaku mengikat')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key IN ('mutu:rmp:view', 'mutu:rmp:manage')
   AND r.name IN ('admin', 'direktur', 'pm')
ON CONFLICT DO NOTHING;

-- Menyetujui adalah kewenangan yang lebih sempit daripada menyusun.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key = 'mutu:rmp:approve'
   AND r.name IN ('admin', 'direktur')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 7. Verifikasi — migrasi gagal keras kalau objeknya tidak benar-benar ada.
--
-- Pelajaran dari migrasi 043: ia tercatat sukses tanpa pernah membuat
-- tabelnya, dan tak seorang pun tahu selama berbulan-bulan.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.rencana_mutu') IS NULL THEN
    RAISE EXCEPTION '280 gagal: rencana_mutu tidak terbentuk';
  END IF;
  IF to_regclass('public.itp_titik') IS NULL THEN
    RAISE EXCEPTION '280 gagal: itp_titik tidak terbentuk';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'itp_jenis_titik') THEN
    RAISE EXCEPTION '280 gagal: enum itp_jenis_titik tidak terbentuk';
  END IF;

  -- Sambungan rencana→pelaksanaan. Ini yang paling mudah hilang tanpa
  -- ketahuan, dan justru inti dari migrasi ini.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'inspection_requests' AND column_name = 'itp_titik_id'
  ) THEN
    RAISE EXCEPTION '280 gagal: inspection_requests.itp_titik_id tidak terpasang';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rmp_disetujui_berjejak'
  ) THEN
    RAISE EXCEPTION '280 gagal: constraint rmp_disetujui_berjejak tidak terpasang';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'itp_hasil_berpemeriksa'
  ) THEN
    RAISE EXCEPTION '280 gagal: constraint itp_hasil_berpemeriksa tidak terpasang';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'itp_gagal_beralasan'
  ) THEN
    RAISE EXCEPTION '280 gagal: constraint itp_gagal_beralasan tidak terpasang';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'rencana_mutu' AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION '280 gagal: RLS rencana_mutu tidak terpasang';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'itp_titik' AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION '280 gagal: RLS itp_titik tidak terpasang';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'mutu:rmp:approve') THEN
    RAISE EXCEPTION '280 gagal: capability mutu:rmp:approve tidak ter-seed';
  END IF;

  -- Waktu WAJIB timestamptz, bukan timestamp polos (CLAUDE.md §5.4).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name IN ('rencana_mutu', 'itp_titik')
       AND data_type = 'timestamp without time zone'
  ) THEN
    RAISE EXCEPTION '280 gagal: ada kolom timestamp tanpa zona waktu';
  END IF;

  RAISE NOTICE '280 OK — rencana_mutu + itp_titik + sambungan inspeksi terpasang';
END $$;
