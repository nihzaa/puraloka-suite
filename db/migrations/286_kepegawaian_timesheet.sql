-- ════════════════════════════════════════════════════════════════════════════
-- 286 — DATA KEPEGAWAIAN + TIMESHEET STAF KANTOR (G2b)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa migrasi ini ada
--
-- Diukur 2026-08-11:
--
--     public.users            25 staf aktif, NOL kolom kepegawaian
--     absensi_harian       1.279 baris (60 pekerja LAPANGAN, 9 Jul–7 Agu)
--     timesheet staf         NOL TABEL
--
-- ── Kenapa staf kantor TERPISAH dari absensi lapangan
--
-- `absensi_harian` mencatat kehadiran pekerja harian: `porsi_hari` (0,5 atau
-- 1) dan `jam_lembur`, per `scope_id` — melekat pada lingkup pekerjaan, dan
-- upahnya dibayar mingguan lewat `weekly_wage_reports`.
--
-- Staf kantor berbeda pada tiga hal yang menentukan bentuk tabelnya:
--
--   1. Digaji BULANAN dengan gaji pokok tetap — bukan per hari hadir. Absen
--      sehari tidak mengurangi gaji secara proporsional; ia mengurangi saldo
--      cuti atau jadi potongan menurut kebijakan.
--   2. Waktunya dibebankan ke PROYEK untuk perhitungan biaya overhead —
--      itulah gunanya timesheet, bukan untuk menghitung upahnya.
--   3. Punya jam kerja standar yang jadi pembanding lembur.
--
-- Menyatukannya memaksa kolom yang selalu kosong di separuh baris, dan yang
-- lebih buruk: membuat "berapa upah minggu ini" dan "berapa jam dibebankan ke
-- proyek A" dijawab dari tabel yang sama dengan aturan berbeda.
--
-- ── Kenapa data kepegawaian ADA DI SINI, bukan menunggu payroll
--
-- Timesheet tanpa jam kerja standar tak bisa menjawab pertanyaannya sendiri:
-- "8 jam hari ini" berarti penuh untuk yang standarnya 8, dan lembur satu jam
-- untuk yang standarnya 7. Tanpa acuan, angkanya cuma angka.
--
-- Dan gaji pokok dipisahkan ke `pegawai` (bukan menunggu G2c) karena ia
-- berubah lewat SK kenaikan, bukan lewat penggajian — riwayatnya milik
-- kepegawaian, bukan milik slip.
--
-- ── Yang dijaga constraint, dan kenapa
--
-- 1. Satu timesheet per (pegawai, tanggal). Dua baris untuk hari yang sama
--    membuat total jam berlipat tanpa ada yang salah terlihat.
-- 2. Jam tak boleh negatif dan tak boleh melebihi 24. Jam negatif mengurangi
--    total; 30 jam sehari adalah salah ketik yang lolos ke laporan biaya.
-- 3. Timesheet yang DISETUJUI wajib punya penyetuju & waktunya (pola 157,
--    279, 280, 283).
-- 4. Gaji pokok `numeric`, bukan float (CLAUDE.md §5.4).
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Enum
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_timesheet') THEN
    CREATE TYPE status_timesheet AS ENUM ('draf', 'diajukan', 'disetujui', 'ditolak');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Data kepegawaian — satu baris per user yang berstatus pegawai
--
-- TABEL TERPISAH dari `users`, bukan kolom tambahan di sana:
--   • `users` memuat siapa saja yang bisa MASUK ke sistem — termasuk klien
--     dan mandor yang bukan pegawai bergaji
--   • kolom kepegawaian di `users` akan NULL untuk sebagian besar barisnya,
--     dan NULL yang berarti "bukan pegawai" tak bisa dibedakan dari NULL yang
--     berarti "pegawai, datanya belum diisi"
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pegawai (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  nomor_induk       TEXT,
  jabatan           TEXT,
  departemen        TEXT,

  tanggal_masuk     DATE,
  tanggal_keluar    DATE,

  -- Gaji pokok bulanan. `numeric` (CLAUDE.md §5.4) — ia dikalikan persentase
  -- BPJS dan jadi dasar PPh 21; galat pembulatan biner muncul di setoran.
  gaji_pokok        NUMERIC(16,2),

  -- Status PTKP: 'TK/0', 'K/1', dst. Dicocokkan ke `tarif_payroll_baris`
  -- (migrasi 284) — TEKS, bukan enum, karena daftarnya bisa berubah bersama
  -- peraturan dan founder yang mengisinya lewat halaman tarif.
  status_ptkp       TEXT,
  -- Kategori TER PPh 21: 'A', 'B', 'C'. Diturunkan dari status PTKP menurut
  -- PMK-168/2023, TETAPI disimpan terpisah: pemetaannya bagian dari
  -- peraturan yang bisa berubah, dan menurunkannya di kode berarti
  -- menuliskan aturan pajak ke dalam program (dilarang R-011).
  kategori_ter      TEXT,

  npwp              TEXT,
  nomor_bpjs_tk     TEXT,
  nomor_bpjs_kes    TEXT,

  -- Jam kerja standar per hari. Jadi pembanding lembur di timesheet.
  jam_standar       NUMERIC(5,2) NOT NULL DEFAULT 8,

  catatan           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Satu user satu baris kepegawaian per company.
  CONSTRAINT pegawai_user_unik UNIQUE (company_id, user_id),

  -- Keluar tak boleh mendahului masuk. Rentang terbalik membuat masa kerja
  -- negatif, dan itu ikut ke perhitungan pesangon.
  CONSTRAINT pegawai_masa_kerja_masuk_akal CHECK (
    tanggal_keluar IS NULL OR tanggal_masuk IS NULL OR tanggal_keluar >= tanggal_masuk
  ),

  -- Gaji negatif adalah salah ketik yang menghasilkan slip bernilai minus.
  CONSTRAINT pegawai_gaji_tak_negatif CHECK (gaji_pokok IS NULL OR gaji_pokok >= 0),

  -- Jam standar 0 membuat SELURUH jam kerja terhitung lembur; di atas 24
  -- mustahil.
  CONSTRAINT pegawai_jam_standar_wajar CHECK (jam_standar > 0 AND jam_standar <= 24)
);

CREATE INDEX IF NOT EXISTS idx_pegawai_company ON pegawai (company_id);
CREATE INDEX IF NOT EXISTS idx_pegawai_user ON pegawai (user_id);

-- ------------------------------------------------------------
-- 3. Timesheet — jam kerja staf, dibebankan ke proyek
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timesheet_staf (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id        UUID NOT NULL REFERENCES pegawai(id) ON DELETE CASCADE,

  tanggal           DATE NOT NULL,

  -- Jam kerja NORMAL hari itu (di luar lembur).
  jam_kerja         NUMERIC(5,2) NOT NULL DEFAULT 0,
  jam_lembur        NUMERIC(5,2) NOT NULL DEFAULT 0,

  -- Proyek yang dibebani. NULLABLE: sebagian waktu staf memang overhead
  -- kantor yang tak melekat ke proyek mana pun, dan memaksakan proyek akan
  -- membuat orang memilih proyek asal — merusak justru angka yang dicari.
  project_id        UUID REFERENCES projects(id) ON DELETE SET NULL,

  kegiatan          TEXT,
  catatan           TEXT,

  status            status_timesheet NOT NULL DEFAULT 'draf',
  disetujui_oleh    UUID REFERENCES users(id),
  disetujui_pada    TIMESTAMPTZ,
  alasan_tolak      TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Satu baris per pegawai per hari.
  --
  -- Dua baris untuk hari yang sama membuat total jam berlipat tanpa satu pun
  -- galat — dan yang membacanya melihat angka yang masuk akal (16 jam
  -- seminggu jadi 32) tanpa cara tahu sebabnya.
  CONSTRAINT timesheet_pegawai_tanggal_unik UNIQUE (pegawai_id, tanggal),

  -- Jam negatif MENGURANGI total. Di atas 24 sehari mustahil, dan biasanya
  -- salah ketik (80 untuk 8,0) yang lolos ke laporan biaya proyek.
  CONSTRAINT timesheet_jam_wajar CHECK (
    jam_kerja >= 0 AND jam_lembur >= 0 AND (jam_kerja + jam_lembur) <= 24
  ),

  -- Yang DISETUJUI wajib berjejak siapa & kapan (pola 157, 279, 280, 283).
  CONSTRAINT timesheet_disetujui_berjejak CHECK (
    status <> 'disetujui'
    OR (disetujui_oleh IS NOT NULL AND disetujui_pada IS NOT NULL)
  ),

  -- Yang DITOLAK wajib beralasan — yang mengajukan harus tahu apa yang
  -- diperbaiki, bukan sekadar bahwa ditolak.
  CONSTRAINT timesheet_ditolak_beralasan CHECK (
    status <> 'ditolak'
    OR (alasan_tolak IS NOT NULL AND btrim(alasan_tolak) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_timesheet_pegawai
  ON timesheet_staf (pegawai_id, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_timesheet_proyek
  ON timesheet_staf (project_id, tanggal) WHERE project_id IS NOT NULL;
-- Yang menunggu persetujuan — pertanyaan yang paling sering diajukan atasan.
CREATE INDEX IF NOT EXISTS idx_timesheet_menunggu
  ON timesheet_staf (pegawai_id) WHERE status = 'diajukan';

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------
ALTER TABLE pegawai        ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_staf ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON pegawai;
CREATE POLICY tenant_isolation ON pegawai AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS tenant_isolation ON timesheet_staf;
CREATE POLICY tenant_isolation ON timesheet_staf AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM pegawai p
                  WHERE p.id = timesheet_staf.pegawai_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM pegawai p
                       WHERE p.id = timesheet_staf.pegawai_id
                         AND p.company_id = (SELECT auth_company_id())));

-- ------------------------------------------------------------
-- 5. Capability
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description) VALUES
  ('sdm:pegawai:view',    'sdm', 'Lihat data pegawai',
   'Melihat data kepegawaian staf'),
  ('sdm:pegawai:manage',  'sdm', 'Kelola data pegawai',
   'Mengubah data kepegawaian termasuk gaji pokok dan status PTKP'),
  ('sdm:timesheet:view',  'sdm', 'Lihat timesheet',
   'Melihat timesheet staf'),
  ('sdm:timesheet:manage', 'sdm', 'Isi timesheet',
   'Mengisi dan mengajukan timesheet sendiri'),
  ('sdm:timesheet:approve', 'sdm', 'Setujui timesheet',
   'Menyetujui atau menolak timesheet yang diajukan')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key IN ('sdm:timesheet:view', 'sdm:timesheet:manage')
   AND r.name IN ('admin', 'direktur', 'pm')
ON CONFLICT DO NOTHING;

-- Gaji pokok terlihat di sini — kewenangannya lebih sempit.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key IN ('sdm:pegawai:view', 'sdm:pegawai:manage', 'sdm:timesheet:approve')
   AND r.name IN ('admin', 'direktur')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 6. Menu — di migrasi yang SAMA dengan tabelnya (pelajaran 281)
-- ------------------------------------------------------------
UPDATE menu_items
   SET href = '/sdm/timesheet', is_active = TRUE,
       required_permissions = ARRAY['sdm:timesheet:view']::text[]
 WHERE key = 'hr-absensi';

-- ------------------------------------------------------------
-- 7. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF to_regclass('public.pegawai') IS NULL THEN
    RAISE EXCEPTION '286 gagal: pegawai tidak terbentuk';
  END IF;
  IF to_regclass('public.timesheet_staf') IS NULL THEN
    RAISE EXCEPTION '286 gagal: timesheet_staf tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timesheet_pegawai_tanggal_unik'
  ) THEN
    RAISE EXCEPTION '286 gagal: constraint timesheet_pegawai_tanggal_unik tak terpasang';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'timesheet_jam_wajar'
  ) THEN
    RAISE EXCEPTION '286 gagal: constraint timesheet_jam_wajar tak terpasang';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pegawai_jam_standar_wajar'
  ) THEN
    RAISE EXCEPTION '286 gagal: constraint pegawai_jam_standar_wajar tak terpasang';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'pegawai' AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION '286 gagal: RLS pegawai tak terpasang';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'timesheet_staf' AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION '286 gagal: RLS timesheet_staf tak terpasang';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'sdm:timesheet:approve') THEN
    RAISE EXCEPTION '286 gagal: capability sdm:timesheet:approve tak ter-seed';
  END IF;

  -- Menu wajib menunjuk halaman nyata DAN aktif (pelajaran 281), dan tepat
  -- satu menu aktif per route (aturan 232).
  IF EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'hr-absensi' AND (href LIKE '/m/%' OR is_active IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION '286 gagal: menu hr-absensi belum menunjuk halaman nyata atau masih mati';
  END IF;
  SELECT count(*) INTO n FROM menu_items WHERE is_active AND href = '/sdm/timesheet';
  IF n <> 1 THEN
    RAISE EXCEPTION '286 gagal: % menu aktif menunjuk /sdm/timesheet (harus tepat 1)', n;
  END IF;

  -- Nominal WAJIB numeric, waktu WAJIB timestamptz (CLAUDE.md §5.4).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name IN ('pegawai', 'timesheet_staf')
       AND (data_type IN ('double precision', 'real')
         OR data_type = 'timestamp without time zone')
  ) THEN
    RAISE EXCEPTION '286 gagal: ada kolom float atau timestamp tanpa zona waktu';
  END IF;

  RAISE NOTICE '286 OK — pegawai + timesheet_staf + menu aktif';
END $$;
