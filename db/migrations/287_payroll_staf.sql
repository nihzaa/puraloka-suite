-- ════════════════════════════════════════════════════════════════════════════
-- 287 — PAYROLL STAF + SLIP GAJI (G2c)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa migrasi ini ada
--
-- Menyatukan G2a (tarif sebagai data) dengan G2b (data pegawai). Diukur
-- 2026-08-11:
--
--     pegawai                  5 baris
--     tarif_payroll_periode    0 baris   ← sengaja, R-011
--     tarif_payroll_baris      0 baris   ← sengaja, R-011
--     timesheet_staf           7 baris
--     payroll                NOL TABEL
--
-- ── Aturan yang tak bisa ditawar: SLIP MENYIMPAN HASILNYA
--
-- Ini keputusan rancangan paling penting di migrasi ini, dan ia berlawanan
-- dengan naluri "jangan simpan yang bisa dihitung".
--
-- Slip gaji WAJIB menyimpan setiap komponennya sebagai angka: gaji pokok,
-- tiap potongan BPJS, PTKP yang dipakai, tarif TER yang dipakai, dan pajak
-- yang dipotong. Bukan menghitung ulang saat dibaca.
--
-- Alasannya: **tarif berubah**, dan slip yang sudah dibayarkan adalah
-- pernyataan tentang uang yang SUDAH berpindah. Kalau slip Januari dihitung
-- ulang dengan tarif Juli, angka di layar tak lagi cocok dengan angka di
-- rekening — dan yang menerimanya tak punya cara membuktikan mana yang benar.
--
-- Yang lebih buruk: pemeriksaan pajak menuntut bukti berapa yang dipotong
-- SAAT ITU. Slip yang berubah sendiri bukan bukti.
--
-- Karena itu `slip_gaji` menyimpan angkanya, `slip_komponen` menyimpan
-- rinciannya, dan keduanya IMMUTABLE sesudah dibayarkan.
--
-- ── Kenapa `tarif_periode_*_id` disimpan di slip
--
-- Bukan cuma angkanya — ID periode tarifnya juga. Supaya pertanyaan "tarif
-- mana yang dipakai untuk slip ini" bisa dijawab dengan menunjuk barisnya,
-- bukan dengan menebak dari tanggal. Ketika seseorang mempertanyakan
-- potongannya, jawaban "PMK-168/2023 yang Anda tetapkan berlaku 1 Januari"
-- jauh lebih kuat daripada "5% menurut sistem".
--
-- ── Kenapa periode payroll TERPISAH dari slip
--
--   `payroll_periode` = satu bulan penggajian: dibuka, dihitung, dikunci
--   `slip_gaji`       = satu pegawai dalam periode itu
--
-- Yang dikunci adalah PERIODE-nya, bukan slip satu per satu. Mengunci per
-- slip membuat keadaan setengah-terkunci yang tak bisa dijelaskan: sebagian
-- pegawai sudah final, sebagian masih berubah, dan totalnya berarti apa?
--
-- ── Yang dijaga constraint, dan kenapa
--
-- 1. Satu slip per (periode, pegawai). Dua slip untuk orang yang sama di
--    bulan yang sama berarti dibayar dua kali.
-- 2. Periode yang DIKUNCI wajib punya pengunci & waktunya.
-- 3. Nominal `numeric`, nol float (CLAUDE.md §5.4).
-- 4. Gaji bersih tak boleh negatif TANPA alasan tertulis — potongan yang
--    melebihi penghasilan hampir selalu salah hitung, dan slip minus yang
--    lolos akan dibayarkan sebagai nol tanpa ada yang tahu.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Enum
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_payroll_periode') THEN
    CREATE TYPE status_payroll_periode AS ENUM ('draf', 'dihitung', 'dikunci', 'dibatalkan');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jenis_komponen_slip') THEN
    -- `penghasilan` menambah, `potongan` mengurangi, `informasi` tidak
    -- keduanya (mis. iuran yang ditanggung PERUSAHAAN — wajib terlihat di
    -- slip sebagai hak pegawai, tetapi tak mengurangi yang diterima).
    CREATE TYPE jenis_komponen_slip AS ENUM ('penghasilan', 'potongan', 'informasi');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Periode payroll — satu bulan penggajian
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payroll_periode (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- `YYYY-MM`. TEKS, bukan DATE: yang dimaksud adalah BULAN-nya, dan
  -- menyimpannya sebagai tanggal-1 mengundang perbandingan tanggal yang
  -- salah paham (slip Januari "berlaku sejak 1 Januari"?).
  bulan             TEXT NOT NULL,

  status            status_payroll_periode NOT NULL DEFAULT 'draf',

  -- Tanggal yang dipakai memilih tarif berlaku. Biasanya akhir bulan —
  -- disimpan supaya perhitungan bisa diulang persis, termasuk kalau
  -- kebijakannya berubah jadi awal bulan.
  tanggal_acuan     DATE NOT NULL,

  catatan           TEXT,

  dihitung_pada     TIMESTAMPTZ,
  dikunci_oleh      UUID REFERENCES users(id),
  dikunci_pada      TIMESTAMPTZ,

  dibuat_oleh       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payroll_periode_bulan_unik UNIQUE (company_id, bulan),

  -- Format bulan dijaga di basis: `bulan` dipakai memilih rentang tanggal,
  -- dan format yang salah menghasilkan rentang kosong tanpa satu pun galat.
  CONSTRAINT payroll_periode_bulan_bentuk CHECK (bulan ~ '^\d{4}-\d{2}$'),

  -- Yang DIKUNCI wajib berjejak siapa & kapan (pola 157, 279, 280, 283, 286).
  CONSTRAINT payroll_periode_dikunci_berjejak CHECK (
    status <> 'dikunci'
    OR (dikunci_oleh IS NOT NULL AND dikunci_pada IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_payroll_periode_company
  ON payroll_periode (company_id, bulan DESC);

-- ------------------------------------------------------------
-- 3. Slip gaji — MENYIMPAN hasilnya, bukan menghitung ulang
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slip_gaji (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periode_id        UUID NOT NULL REFERENCES payroll_periode(id) ON DELETE CASCADE,
  pegawai_id        UUID NOT NULL REFERENCES pegawai(id) ON DELETE RESTRICT,

  -- ── Angka yang DIBAYARKAN. Lihat kepala berkas: slip menyimpan hasilnya.
  gaji_pokok        NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_penghasilan NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_potongan    NUMERIC(16,2) NOT NULL DEFAULT 0,
  gaji_bersih       NUMERIC(16,2) NOT NULL DEFAULT 0,

  -- ── Jejak tarif yang DIPAKAI, supaya bisa ditunjuk saat dipertanyakan.
  --
  -- ID periode tarifnya, bukan cuma angkanya: jawaban "PMK-168/2023 yang
  -- Anda tetapkan berlaku 1 Januari" jauh lebih kuat daripada "5% menurut
  -- sistem".
  tarif_ptkp_id     UUID REFERENCES tarif_payroll_periode(id) ON DELETE SET NULL,
  tarif_ter_id      UUID REFERENCES tarif_payroll_periode(id) ON DELETE SET NULL,
  tarif_bpjs_id     UUID REFERENCES tarif_payroll_periode(id) ON DELETE SET NULL,

  -- Nilai yang dipakai, disalin saat menghitung.
  status_ptkp       TEXT,
  kategori_ter      TEXT,
  ptkp_setahun      NUMERIC(16,2),
  tarif_ter_persen  NUMERIC(9,4),
  pph21             NUMERIC(16,2) NOT NULL DEFAULT 0,

  -- Jam dari timesheet yang DISETUJUI, disalin sebagai angka.
  jam_kerja         NUMERIC(8,2),
  jam_lembur        NUMERIC(8,2),

  catatan           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Dua slip untuk orang yang sama di bulan yang sama = dibayar dua kali.
  CONSTRAINT slip_periode_pegawai_unik UNIQUE (periode_id, pegawai_id),

  -- Gaji bersih negatif hampir selalu salah hitung, dan slip minus yang lolos
  -- akan dibayarkan sebagai nol tanpa ada yang tahu. Kalau memang ada kasus
  -- sah (potongan pinjaman melebihi gaji bulan itu), ia WAJIB beralasan
  -- tertulis supaya keputusannya terlihat.
  CONSTRAINT slip_bersih_negatif_beralasan CHECK (
    gaji_bersih >= 0
    OR (catatan IS NOT NULL AND btrim(catatan) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_slip_periode ON slip_gaji (periode_id);
CREATE INDEX IF NOT EXISTS idx_slip_pegawai ON slip_gaji (pegawai_id);

-- ------------------------------------------------------------
-- 4. Komponen slip — rincian yang dicetak di slip
--
-- Baris terpisah, bukan kolom: susunan tunjangan & potongan berbeda tiap
-- perusahaan dan berubah tiap tahun. Kolom tetap memaksa migrasi setiap kali
-- ada komponen baru — dan yang pertama dilakukan orang adalah menumpangkan
-- komponen baru ke kolom lama yang namanya paling mirip.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slip_komponen (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slip_id           UUID NOT NULL REFERENCES slip_gaji(id) ON DELETE CASCADE,

  urutan            INT NOT NULL DEFAULT 0,
  jenis             jenis_komponen_slip NOT NULL,
  kode              TEXT NOT NULL,
  label             TEXT NOT NULL,
  nominal           NUMERIC(16,2) NOT NULL,

  -- Dari mana angkanya. Diisi saat menghitung: "3,70% dari Rp 5.000.000",
  -- "batas upah Rp 8.000.000". Tanpa ini, pegawai yang bertanya "kenapa
  -- segini" hanya bisa dijawab dengan membuka kode.
  dasar_hitung      TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT slip_komponen_unik UNIQUE (slip_id, kode),

  -- Nominal negatif dilarang: yang membedakan menambah dari mengurangi
  -- adalah `jenis`, bukan tanda. Membiarkan keduanya membuat potongan
  -- bernilai negatif diam-diam MENAMBAH penghasilan.
  CONSTRAINT slip_komponen_nominal_tak_negatif CHECK (nominal >= 0)
);

CREATE INDEX IF NOT EXISTS idx_slip_komponen ON slip_komponen (slip_id, urutan);

-- ------------------------------------------------------------
-- 5. IMMUTABILITY — periode yang DIKUNCI tak boleh berubah
--
-- Trigger, bukan constraint: aturannya melibatkan tabel LAIN
-- (`slip_gaji.periode_id` → `payroll_periode.status`).
--
-- Dipasang pada slip DAN komponennya, karena mengubah komponen tanpa
-- menyentuh slip juga mengubah isi slip yang sudah dibayarkan.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_slip_terkunci_tak_berubah()
RETURNS TRIGGER
LANGUAGE plpgsql
-- `search_path` dipaku: fungsi trigger tanpa ini bisa dibelokkan lewat
-- schema bayangan. Bukan pelanggaran `audit-migrasi-skema-dipaku` (yang
-- melarang memaku schema pada NAMA OBJEK), melainkan praktik yang dituntut
-- untuk fungsi.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_periode UUID;
  v_status  status_payroll_periode;
BEGIN
  -- `IF`, bukan `CASE`: plpgsql menentukan tipe SELURUH ekspresi CASE
  -- sebelum mengevaluasinya, jadi kolom yang tak ada di salah satu tabel
  -- tetap diperiksa. Pelajaran migrasi 283.
  IF TG_TABLE_NAME = 'slip_gaji' THEN
    v_periode := COALESCE(NEW.periode_id, OLD.periode_id);
  ELSE
    SELECT s.periode_id INTO v_periode
      FROM slip_gaji s WHERE s.id = COALESCE(NEW.slip_id, OLD.slip_id);
  END IF;

  SELECT status INTO v_status FROM payroll_periode WHERE id = v_periode;

  IF v_status = 'dikunci' THEN
    RAISE EXCEPTION
      'Periode payroll ini sudah dikunci — slip yang sudah dibayarkan tak '
      'boleh berubah. Kalau ada koreksi, buat periode penyesuaian tersendiri '
      'supaya jejaknya terlihat.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_slip_terkunci ON slip_gaji;
CREATE TRIGGER trg_slip_terkunci
  BEFORE UPDATE OR DELETE ON slip_gaji
  FOR EACH ROW EXECUTE FUNCTION fn_slip_terkunci_tak_berubah();

DROP TRIGGER IF EXISTS trg_slip_komponen_terkunci ON slip_komponen;
CREATE TRIGGER trg_slip_komponen_terkunci
  BEFORE INSERT OR UPDATE OR DELETE ON slip_komponen
  FOR EACH ROW EXECUTE FUNCTION fn_slip_terkunci_tak_berubah();

-- ------------------------------------------------------------
-- 6. RLS
-- ------------------------------------------------------------
ALTER TABLE payroll_periode ENABLE ROW LEVEL SECURITY;
ALTER TABLE slip_gaji       ENABLE ROW LEVEL SECURITY;
ALTER TABLE slip_komponen   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON payroll_periode;
CREATE POLICY tenant_isolation ON payroll_periode AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS tenant_isolation ON slip_gaji;
CREATE POLICY tenant_isolation ON slip_gaji AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM payroll_periode p
                  WHERE p.id = slip_gaji.periode_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM payroll_periode p
                       WHERE p.id = slip_gaji.periode_id
                         AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON slip_komponen;
CREATE POLICY tenant_isolation ON slip_komponen AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM slip_gaji s
                   JOIN payroll_periode p ON p.id = s.periode_id
                  WHERE s.id = slip_komponen.slip_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM slip_gaji s
                        JOIN payroll_periode p ON p.id = s.periode_id
                       WHERE s.id = slip_komponen.slip_id
                         AND p.company_id = (SELECT auth_company_id())));

-- ------------------------------------------------------------
-- 7. Capability
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description) VALUES
  ('payroll:jalankan:view',   'payroll', 'Lihat payroll',
   'Melihat periode penggajian dan slip gaji'),
  ('payroll:jalankan:manage', 'payroll', 'Jalankan payroll',
   'Membuka periode, menghitung slip, dan mengunci penggajian')
ON CONFLICT (key) DO NOTHING;

-- Payroll memperlihatkan gaji SELURUH pegawai. Kewenangannya sempit.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key IN ('payroll:jalankan:view', 'payroll:jalankan:manage')
   AND r.name IN ('admin', 'direktur')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 8. Menu — di migrasi yang SAMA dengan tabelnya (pelajaran 281)
-- ------------------------------------------------------------
UPDATE menu_items
   SET href = '/sdm/payroll', is_active = TRUE,
       required_permissions = ARRAY['payroll:jalankan:view']::text[]
 WHERE key = 'hr-payroll';

-- ------------------------------------------------------------
-- 9. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF to_regclass('public.payroll_periode') IS NULL THEN
    RAISE EXCEPTION '287 gagal: payroll_periode tidak terbentuk';
  END IF;
  IF to_regclass('public.slip_gaji') IS NULL THEN
    RAISE EXCEPTION '287 gagal: slip_gaji tidak terbentuk';
  END IF;
  IF to_regclass('public.slip_komponen') IS NULL THEN
    RAISE EXCEPTION '287 gagal: slip_komponen tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'slip_periode_pegawai_unik'
  ) THEN
    RAISE EXCEPTION '287 gagal: constraint slip_periode_pegawai_unik tak terpasang';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'slip_komponen_nominal_tak_negatif'
  ) THEN
    RAISE EXCEPTION '287 gagal: constraint slip_komponen_nominal_tak_negatif tak terpasang';
  END IF;

  -- Trigger DUA SISI — inti immutability. Kalau salah satu hilang, slip yang
  -- sudah dibayarkan bisa diubah lewat jalur yang tak dijaga.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_slip_terkunci') THEN
    RAISE EXCEPTION '287 gagal: trigger sisi slip_gaji tak terpasang';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_slip_komponen_terkunci') THEN
    RAISE EXCEPTION '287 gagal: trigger sisi slip_komponen tak terpasang';
  END IF;

  FOR n IN
    SELECT 1 FROM unnest(ARRAY['payroll_periode', 'slip_gaji', 'slip_komponen']) t
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation')
  LOOP
    RAISE EXCEPTION '287 gagal: ada tabel payroll tanpa RLS tenant_isolation';
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'payroll:jalankan:manage') THEN
    RAISE EXCEPTION '287 gagal: capability payroll:jalankan:manage tak ter-seed';
  END IF;

  -- Menu wajib menunjuk halaman nyata DAN aktif, tepat satu per route.
  IF EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'hr-payroll' AND (href LIKE '/m/%' OR is_active IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION '287 gagal: menu hr-payroll belum menunjuk halaman nyata atau masih mati';
  END IF;
  SELECT count(*) INTO n FROM menu_items WHERE is_active AND href = '/sdm/payroll';
  IF n <> 1 THEN
    RAISE EXCEPTION '287 gagal: % menu aktif menunjuk /sdm/payroll (harus tepat 1)', n;
  END IF;

  -- Nominal WAJIB numeric, waktu WAJIB timestamptz (CLAUDE.md §5.4).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name IN ('payroll_periode', 'slip_gaji', 'slip_komponen')
       AND (data_type IN ('double precision', 'real')
         OR data_type = 'timestamp without time zone')
  ) THEN
    RAISE EXCEPTION '287 gagal: ada kolom float atau timestamp tanpa zona waktu';
  END IF;

  -- ⚠ Sama seperti 284: TIDAK BOLEH ada slip ter-seed. Slip adalah pernyataan
  -- tentang uang yang berpindah — menanamnya lewat migrasi berarti membuat
  -- pernyataan itu tanpa seorang pun menjalankan penggajian.
  SELECT count(*) INTO n FROM slip_gaji;
  IF n > 0 THEN
    RAISE EXCEPTION '287 gagal: % slip gaji ter-seed. Slip hanya boleh lahir '
      'dari penggajian yang dijalankan manusia.', n;
  END IF;

  RAISE NOTICE '287 OK — payroll_periode + slip_gaji + slip_komponen + trigger kunci';
END $$;
