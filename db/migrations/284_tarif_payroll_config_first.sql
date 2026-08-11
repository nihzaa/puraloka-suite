-- ════════════════════════════════════════════════════════════════════════════
-- 284 — TARIF PAYROLL SEBAGAI DATA, BUKAN KONSTANTA (G2a)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa migrasi ini ada, dan kenapa ia DULUAN
--
-- R-011 (2026-08-11) mencabut larangan membangun payroll, TAPI menyisakan
-- syarat yang tak bisa ditawar — dan syarat itu diucapkan founder sendiri
-- lewat alasan penolakan aslinya:
--
--   "aturan pajak berubah tiap tahun; salah hitung = urusan hukum, bukan bug"
--
-- Itu masih benar. Yang berubah: sekarang mesinnya dibangun. Yang TIDAK
-- berubah: tarif PTKP, lapisan PPh 21, dan persentase BPJS **tidak boleh
-- ditulis ke dalam kode**.
--
-- Slip gaji yang salah keluar dengan tampilan meyakinkan, dan penerimanya
-- tak punya cara tahu. Karyawan menerima angka yang lebih kecil dari haknya
-- tanpa bisa membantah, atau perusahaan menyetor pajak kurang dan
-- mengetahuinya saat pemeriksaan — bertahun kemudian, berbunga.
--
-- Karena itu migrasi ini DULUAN sebelum tabel payroll mana pun: kalau
-- tarifnya belum jadi data, mesin hitungnya tak boleh ada.
--
-- ── Yang membuat ini berbeda dari "tabel konfigurasi" biasa
--
-- 1. BERTANGGAL BERLAKU. Tarif tidak diganti — ia DITAMBAH dengan tanggal
--    berlaku baru. Slip gaji Januari harus tetap bisa dihitung ulang dengan
--    tarif yang berlaku Januari, bahkan sesudah tarif berubah di Juli.
--    Menimpa baris lama membuat riwayat penggajian tak bisa diaudit.
--
-- 2. TAK ADA BARIS BAWAAN. Migrasi ini sengaja TIDAK meng-INSERT tarif apa
--    pun. Angka bawaan yang "kelihatan wajar" adalah bentuk paling berbahaya
--    dari cacat ini: ia menghasilkan slip yang tampak benar tanpa seorang pun
--    pernah memutuskan angkanya.
--
--    Sampai founder mengisinya lewat halaman pengaturan, layar payroll
--    menyatakan "tarif belum ditetapkan" dan TIDAK menghitung apa pun.
--
-- 3. LAPISAN PPh 21 DISIMPAN SEBAGAI BARIS, bukan rumus. PMK-168/2023
--    memperkenalkan TER (Tarif Efektif Rata-rata) dengan kategori A/B/C dan
--    puluhan lapisan penghasilan. Menuliskannya sebagai `if/else` di kode
--    berarti setiap perubahan aturan menuntut deploy — dan deploy yang
--    terlambat berarti pemotongan yang salah selama berbulan-bulan.
--
-- ── Kenapa `numeric`, bukan float
--
-- CLAUDE.md §5.4. Persentase BPJS dikalikan dengan gaji lalu dibulatkan ke
-- rupiah; galat pembulatan biner pada 0,01 (1%) menghasilkan selisih yang
-- muncul di setoran dan tak bisa dijelaskan.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Enum
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jenis_tarif_payroll') THEN
    -- `ptkp`      Penghasilan Tidak Kena Pajak menurut status keluarga
    -- `ter_pph21` Lapisan Tarif Efektif Rata-rata (PMK-168/2023)
    -- `bpjs`      Persentase iuran, terpisah bagian perusahaan & karyawan
    CREATE TYPE jenis_tarif_payroll AS ENUM ('ptkp', 'ter_pph21', 'bpjs');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Periode berlaku — satu baris per (jenis, tanggal berlaku)
--
-- Tarif tidak diganti, ia DITAMBAH. Lihat kepala berkas.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarif_payroll_periode (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  jenis             jenis_tarif_payroll NOT NULL,

  -- Tanggal MULAI berlaku. Tak ada tanggal akhir: yang berlaku pada suatu
  -- tanggal adalah periode dengan `berlaku_sejak` terbesar yang <= tanggal
  -- itu. Menyimpan tanggal akhir menciptakan kemungkinan celah dan tumpang
  -- tindih yang harus dijaga terpisah.
  berlaku_sejak     DATE NOT NULL,

  -- Dasar hukum: "PMK-168/2023", "PP 44/2015 Ps. 16", dst. WAJIB — tarif
  -- tanpa dasar hukum tak bisa dipertanggungjawabkan saat pemeriksaan, dan
  -- yang mengisi tak punya cara menunjukkan dari mana angkanya.
  dasar_hukum       TEXT NOT NULL,
  catatan           TEXT,

  ditetapkan_oleh   UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tarif_periode_unik UNIQUE (company_id, jenis, berlaku_sejak)
);

CREATE INDEX IF NOT EXISTS idx_tarif_periode_cari
  ON tarif_payroll_periode (company_id, jenis, berlaku_sejak DESC);

-- ------------------------------------------------------------
-- 3. Baris tarif
--
-- Satu tabel untuk tiga jenis, karena bentuknya sama: sebuah kunci, batas
-- bawah/atas, dan nilai. Memecahnya jadi tiga tabel menghasilkan tiga
-- endpoint, tiga halaman, dan tiga tempat yang harus diingat saat aturan
-- berubah.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarif_payroll_baris (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periode_id        UUID NOT NULL REFERENCES tarif_payroll_periode(id) ON DELETE CASCADE,

  urutan            INT NOT NULL DEFAULT 0,

  -- Arti `kunci` berbeda per jenis, dan itu disengaja:
  --   ptkp       status keluarga: 'TK/0', 'K/1', 'K/3', dst.
  --   ter_pph21  kategori TER: 'A', 'B', 'C'
  --   bpjs       nama iuran: 'jht', 'jp', 'jkk', 'jkm', 'kesehatan'
  kunci             TEXT NOT NULL,
  label             TEXT,

  -- Rentang penghasilan bulanan. NULL = tak berbatas di sisi itu.
  -- Dipakai `ter_pph21` (lapisan) dan `bpjs` (batas upah/ceiling).
  batas_bawah       NUMERIC(16,2),
  batas_atas        NUMERIC(16,2),

  -- Nilai NOMINAL — dipakai `ptkp` (rupiah per tahun).
  nilai_nominal     NUMERIC(16,2),
  -- Nilai PERSEN — dipakai `ter_pph21` dan `bpjs`. Disimpan sebagai persen
  -- (5.00 = 5%), bukan pecahan (0.05): itulah bentuk yang tertulis di
  -- peraturan, dan menyimpannya berbeda dari sumbernya mengundang salah
  -- baca saat diperiksa ulang.
  nilai_persen      NUMERIC(9,4),

  -- Untuk BPJS: berapa yang ditanggung perusahaan vs karyawan. Keduanya
  -- persen dari upah, dan JUMLAHNYA belum tentu sama dengan `nilai_persen` —
  -- sebagian iuran hanya ditanggung satu pihak.
  persen_perusahaan NUMERIC(9,4),
  persen_karyawan   NUMERIC(9,4),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tarif_baris_unik UNIQUE (periode_id, kunci, batas_bawah),

  -- Baris tarif wajib punya SESUATU untuk dihitung.
  --
  -- Baris tanpa nilai apa pun adalah baris yang menyatakan "ada aturan"
  -- tanpa mengatakan aturannya — dan ia akan terhitung sebagai "tarif sudah
  -- diisi" oleh pemeriksaan kelengkapan, sehingga layar berhenti
  -- memperingatkan sementara perhitungannya menghasilkan nol.
  CONSTRAINT tarif_baris_ada_nilai CHECK (
    nilai_nominal IS NOT NULL
    OR nilai_persen IS NOT NULL
    OR persen_perusahaan IS NOT NULL
    OR persen_karyawan IS NOT NULL
  ),

  -- Rentang yang terbalik menghasilkan lapisan yang tak pernah cocok, diam-
  -- diam: penghasilan mana pun gagal masuk, dan pajaknya jadi nol.
  CONSTRAINT tarif_baris_rentang_masuk_akal CHECK (
    batas_bawah IS NULL OR batas_atas IS NULL OR batas_atas > batas_bawah
  ),

  -- Persentase negatif atau di atas 100 hampir selalu salah ketik (5000
  -- untuk 50,00). Membiarkannya berarti potongan yang menghabiskan gaji.
  CONSTRAINT tarif_baris_persen_wajar CHECK (
    (nilai_persen      IS NULL OR (nilai_persen      >= 0 AND nilai_persen      <= 100))
    AND (persen_perusahaan IS NULL OR (persen_perusahaan >= 0 AND persen_perusahaan <= 100))
    AND (persen_karyawan   IS NULL OR (persen_karyawan   >= 0 AND persen_karyawan   <= 100))
  )
);

CREATE INDEX IF NOT EXISTS idx_tarif_baris_periode
  ON tarif_payroll_baris (periode_id, urutan);

-- ------------------------------------------------------------
-- 4. RLS — company_id langsung untuk periode, lewat periode untuk baris
-- ------------------------------------------------------------
ALTER TABLE tarif_payroll_periode ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarif_payroll_baris   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON tarif_payroll_periode;
CREATE POLICY tenant_isolation ON tarif_payroll_periode AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS tenant_isolation ON tarif_payroll_baris;
CREATE POLICY tenant_isolation ON tarif_payroll_baris AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM tarif_payroll_periode p
                  WHERE p.id = tarif_payroll_baris.periode_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM tarif_payroll_periode p
                       WHERE p.id = tarif_payroll_baris.periode_id
                         AND p.company_id = (SELECT auth_company_id())));

-- ------------------------------------------------------------
-- 5. Capability
--
-- Menetapkan tarif adalah kewenangan TERSENDIRI, lebih sempit daripada
-- mengelola payroll: yang menjalankan penggajian bulanan tak harus orang
-- yang memutuskan persentase BPJS.
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description) VALUES
  ('payroll:tarif:view',   'payroll', 'Lihat tarif payroll',
   'Melihat tarif PTKP, PPh 21, dan BPJS yang berlaku'),
  ('payroll:tarif:manage', 'payroll', 'Tetapkan tarif payroll',
   'Menetapkan tarif PTKP, PPh 21, dan BPJS beserta tanggal berlakunya')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key = 'payroll:tarif:view'
   AND r.name IN ('admin', 'direktur')
ON CONFLICT DO NOTHING;

-- Menetapkan: hanya admin & direktur. Angka ini menentukan isi slip gaji
-- dan setoran pajak.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key = 'payroll:tarif:manage'
   AND r.name IN ('admin', 'direktur')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 6. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n_tarif INT;
BEGIN
  IF to_regclass('public.tarif_payroll_periode') IS NULL THEN
    RAISE EXCEPTION '284 gagal: tarif_payroll_periode tidak terbentuk';
  END IF;
  IF to_regclass('public.tarif_payroll_baris') IS NULL THEN
    RAISE EXCEPTION '284 gagal: tarif_payroll_baris tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tarif_baris_ada_nilai'
  ) THEN
    RAISE EXCEPTION '284 gagal: constraint tarif_baris_ada_nilai tak terpasang';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tarif_baris_persen_wajar'
  ) THEN
    RAISE EXCEPTION '284 gagal: constraint tarif_baris_persen_wajar tak terpasang';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'tarif_payroll_periode' AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION '284 gagal: RLS tarif_payroll_periode tak terpasang';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'tarif_payroll_baris' AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION '284 gagal: RLS tarif_payroll_baris tak terpasang';
  END IF;

  -- ⚠ INVARIAN R-011 YANG PALING PENTING DI MIGRASI INI.
  --
  -- Migrasi ini TIDAK BOLEH menanam tarif apa pun. Angka bawaan yang
  -- "kelihatan wajar" menghasilkan slip gaji yang tampak benar tanpa seorang
  -- pun pernah memutuskan angkanya — dan penerimanya tak punya cara tahu.
  --
  -- Kalau suatu saat ada yang menambahkan seed di sini, verifikasi ini
  -- menggagalkan migrasinya.
  SELECT count(*) INTO n_tarif FROM tarif_payroll_baris;
  IF n_tarif > 0 THEN
    RAISE EXCEPTION
      '284 gagal: % baris tarif ter-seed. Tarif WAJIB diisi founder lewat '
      'halaman pengaturan (R-011) — angka bawaan menghasilkan slip gaji yang '
      'tampak benar tanpa seorang pun memutuskannya.', n_tarif;
  END IF;

  -- Nominal WAJIB numeric, bukan float (CLAUDE.md §5.4).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name IN ('tarif_payroll_periode', 'tarif_payroll_baris')
       AND data_type IN ('double precision', 'real')
  ) THEN
    RAISE EXCEPTION '284 gagal: ada kolom nominal bertipe float';
  END IF;

  RAISE NOTICE '284 OK — tarif payroll siap diisi, NOL baris ter-seed (sesuai R-011)';
END $$;
