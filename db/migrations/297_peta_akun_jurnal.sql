-- ════════════════════════════════════════════════════════════════════════════
-- 297 — PETA AKUN JURNAL: penjurnalan otomatis yang bisa dikonfigurasi (R-012)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⚠ EMBER [C] TIDAK dilanggar. Yang jadi data di sini adalah PEMETAAN AKUN —
--   akun mana untuk pendapatan, mana untuk retensi. Yang TETAP tak bisa
--   dikonfigurasi: invariant debit=kredit, immutability jurnal posted, dan
--   penguncian periode (migrasi 294). Struktur rumusnya tetap; isinya data.
--
-- ── Kenapa peta akun jadi DATA, bukan konstanta di kode
--
-- Pelajaran G2a (tarif payroll) berlaku persis di sini: menuliskan
-- `PENDAPATAN = '4120'` ke dalam kode berarti tiap perubahan kebijakan
-- akuntansi menuntut deploy — dan yang paling sering berubah justru pemetaan
-- akun, bukan rumusnya.
--
-- Lebih buruk lagi: peta akun yang salah menghasilkan laporan keuangan yang
-- SALAH DENGAN MEYAKINKAN. Slip gaji yang salah masih bisa dibantah
-- penerimanya; neraca yang salah tak punya siapa pun yang membantah sampai
-- auditor datang.
--
-- ── Kenapa penjurnalan MENOLAK berjalan sampai petanya diisi
--
-- Sama seperti tarif payroll (G2a): sampai founder mengisi petanya, layar
-- menyatakan "peta akun belum ditetapkan" dan penjurnalan tak berjalan —
-- BUKAN memakai akun bawaan yang kelihatan masuk akal.
--
-- Bawaan yang kelihatan masuk akal adalah bentuk paling berbahaya dari
-- menebak: ia tak pernah ditanyakan siapa pun karena hasilnya terlihat wajar.
--
-- ── Jawaban R-012 yang dipakai sebagai USULAN (bukan bawaan yang diam-diam)
--
--   pendapatan_termin      4120  Pendapatan Termin
--   piutang_usaha          1121  Piutang Usaha
--   retensi_ditahan        1124  Retensi Belum Ditagih   ← ASET, bukan 4130
--   uang_muka_klien        2150  Uang Muka Klien         ← LIABILITAS
--   ppn_keluaran           2131  PPN Keluaran            ← BARU (titipan)
--   pph_final              5950  Beban PPh Final         ← BARU (beban)
--   kas_bank               1113  Bank
--
-- Dasar tiap barisnya ada di `RATIFIKASI.md` R-012. Yang di sini hanya
-- USULAN yang ditawarkan halaman pengaturan — founder tetap menekan simpan,
-- dan sampai ia menekan, `peta_akun_jurnal` KOSONG.
--
-- ── §1. Kenapa PPh final BEBAN, dan PPN LIABILITAS
--
-- Diukur 2026-08-12: 16 dari 16 proyek memakai `tax_scheme = 'pph_final'`.
--
--   PPh final 2%   BEBAN perusahaan — mengurangi laba
--   PPN 11%        TITIPAN dari pelanggan — utang ke negara, bukan beban
--
-- Bagan yang ada hanya punya `2130 Utang Pajak`, dan memakainya untuk PPh
-- final membuat laba terlihat LEBIH BESAR dari yang sebenarnya: beban yang
-- dicatat sebagai utang tak pernah muncul di laba rugi.
--
-- Karena itu migrasi ini menambah dua akun. Menambah, bukan mengganti —
-- `2130` tetap ada untuk PPh 21 karyawan yang memang utang.
--
-- ── §2. Yang dijaga constraint
--
--  1. satu jenis akun hanya boleh dipetakan sekali per company
--  2. akun yang dipetakan wajib milik company yang sama
--  3. jenis pemetaan terbatas pada yang dikenali kode
--  4. akun yang dipetakan wajib aktif
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Dua akun yang belum ada (§1)
--
-- Ditambahkan untuk SETIAP company yang punya bagan akun — kalau tidak,
-- tenant yang dibuat sebelum migrasi ini tak akan punya akunnya.
-- ------------------------------------------------------------
INSERT INTO accounts (company_id, code, name, type, is_active, description)
SELECT DISTINCT a.company_id, '2131', 'PPN Keluaran', 'liability', TRUE,
       'PPN yang dipungut dari pelanggan — TITIPAN untuk negara, bukan pendapatan. Dipisah dari 2130 supaya rekonsiliasi SPT masa tak jadi pekerjaan manual.'
  FROM accounts a
 WHERE NOT EXISTS (
   SELECT 1 FROM accounts x WHERE x.company_id = a.company_id AND x.code = '2131')
ON CONFLICT DO NOTHING;

INSERT INTO accounts (company_id, code, name, type, is_active, description)
SELECT DISTINCT a.company_id, '5950', 'Beban PPh Final', 'expense', TRUE,
       'PPh final jasa konstruksi (PP 9/2022). BEBAN, bukan utang: ia mengurangi laba. Mencatatnya di 2130 Utang Pajak membuat laba terlihat lebih besar dari yang sebenarnya.'
  FROM accounts a
 WHERE NOT EXISTS (
   SELECT 1 FROM accounts x WHERE x.company_id = a.company_id AND x.code = '5950')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 2. Peta akun — DATA, bukan konstanta (§ kepala berkas)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jenis_peta_akun') THEN
    CREATE TYPE jenis_peta_akun AS ENUM (
      'pendapatan_termin',
      'piutang_usaha',
      'retensi_ditahan',
      'uang_muka_klien',
      'ppn_keluaran',
      'pph_final',
      'kas_bank');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS peta_akun_jurnal (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  jenis       jenis_peta_akun NOT NULL,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  catatan     TEXT,
  ditetapkan_oleh UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satu jenis = satu akun. Dua akun untuk "pendapatan_termin" membuat jurnal
-- yang dihasilkan bergantung urutan baris — kelas cacat yang lolos di satu
-- lingkungan dan gagal di lain.
CREATE UNIQUE INDEX IF NOT EXISTS uq_peta_akun_jenis
  ON peta_akun_jurnal(company_id, jenis);

CREATE INDEX IF NOT EXISTS idx_peta_akun_company ON peta_akun_jurnal(company_id);

-- Akun yang dipetakan WAJIB milik company yang sama dan AKTIF. Trigger,
-- bukan CHECK: aturannya menyentuh tabel lain.
CREATE OR REPLACE FUNCTION fn_peta_akun_sah()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_aktif   BOOLEAN;
  v_kode    TEXT;
BEGIN
  SELECT company_id, is_active, code
    INTO v_company, v_aktif, v_kode
    FROM accounts WHERE id = NEW.account_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Akun yang dipetakan tidak ditemukan';
  END IF;

  IF v_company <> NEW.company_id THEN
    RAISE EXCEPTION
      'Akun % milik perusahaan lain — peta akun tak boleh menyeberang tenant', v_kode;
  END IF;

  IF v_aktif IS NOT TRUE THEN
    RAISE EXCEPTION
      'Akun % sudah tidak aktif — jurnal yang menunjuk akun mati tak bisa dibaca laporan', v_kode;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_peta_akun_sah ON peta_akun_jurnal;
CREATE TRIGGER trg_peta_akun_sah
  BEFORE INSERT OR UPDATE OF account_id, company_id ON peta_akun_jurnal
  FOR EACH ROW EXECUTE FUNCTION fn_peta_akun_sah();

-- ------------------------------------------------------------
-- 3. Jejak: invoice mana yang sudah dijurnalkan
--
-- `journal_entries.ref_type`/`ref_id` sudah ada di skema sejak awal dan
-- menunggu diisi. Yang belum ada: jaminan bahwa satu invoice tak dijurnalkan
-- DUA KALI — dan itu bukan kerapian, itu penggandaan pendapatan.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_jurnal_satu_per_rujukan
  ON journal_entries(company_id, ref_type, ref_id)
  WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL AND status <> 'void';

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------
ALTER TABLE peta_akun_jurnal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON peta_akun_jurnal;
CREATE POLICY tenant_isolation ON peta_akun_jurnal AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- ------------------------------------------------------------
-- 5. Capability
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description) VALUES
  ('gl:peta-akun:view',   'gl', 'Lihat peta akun jurnal',
   'Melihat pemetaan akun untuk penjurnalan otomatis'),
  ('gl:peta-akun:manage', 'gl', 'Tetapkan peta akun jurnal',
   'Menetapkan akun mana untuk pendapatan, retensi, uang muka, dan pajak'),
  ('gl:jurnalkan',        'gl', 'Jurnalkan transaksi',
   'Membuat jurnal otomatis dari invoice dan pembayaran')
ON CONFLICT (key) DO NOTHING;

-- Peta akun menentukan bentuk SELURUH laporan keuangan. Kewenangannya
-- sesempit membuka periode tertutup.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('gl:peta-akun:view', 'gl:peta-akun:manage', 'gl:jurnalkan')
   AND r.name IN ('admin', 'direktur')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 6. Menu
-- ------------------------------------------------------------
UPDATE menu_items
   SET href = '/akuntansi/peta-akun', is_active = TRUE,
       required_permissions = ARRAY['gl:peta-akun:view']::text[]
 WHERE key = 'akun-pajak';

-- ------------------------------------------------------------
-- 7. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'peta_akun_jurnal') THEN
    RAISE EXCEPTION '297 gagal: tabel peta_akun_jurnal tak terbentuk';
  END IF;

  -- Peta akun WAJIB KOSONG. Kalau ter-seed, penjurnalan berjalan dengan
  -- akun yang tak pernah dipilih siapa pun — persis yang dilarang §
  -- "kenapa menolak berjalan sampai petanya diisi". Pelajaran G2a: migrasi
  -- 284 punya penjaga yang sama untuk tarif payroll.
  SELECT count(*) INTO n FROM peta_akun_jurnal;
  IF n > 0 THEN
    RAISE EXCEPTION
      '297 gagal: % baris peta akun ter-seed. Peta akun HARUS ditetapkan founder, bukan ditebak migrasi.', n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_peta_akun_sah') THEN
    RAISE EXCEPTION '297 gagal: trigger peta-akun-sah tak terpasang';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_jurnal_satu_per_rujukan') THEN
    RAISE EXCEPTION '297 gagal: penjaga jurnal-ganda tak terpasang';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'peta_akun_jurnal' AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION '297 gagal: peta_akun_jurnal tanpa RLS tenant_isolation';
  END IF;

  -- Dua akun baru wajib ada untuk tiap company yang punya bagan akun.
  SELECT count(*) INTO n
    FROM (SELECT DISTINCT company_id FROM accounts) c
   WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.company_id = c.company_id AND a.code = '2131')
      OR NOT EXISTS (SELECT 1 FROM accounts a WHERE a.company_id = c.company_id AND a.code = '5950');
  IF n > 0 THEN
    RAISE EXCEPTION '297 gagal: % company belum punya akun 2131/5950', n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'gl:jurnalkan') THEN
    RAISE EXCEPTION '297 gagal: capability gl:jurnalkan tak ter-seed';
  END IF;

  RAISE NOTICE '297 OK — peta_akun_jurnal (KOSONG, menunggu founder) + akun 2131 & 5950';
END $$;
