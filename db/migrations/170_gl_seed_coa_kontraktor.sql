-- ============================================================
-- PURALOKA SUITE — Migration 170
-- GL-1b: CoA standar kontraktor — sebagai FUNGSI, bukan INSERT sekali jalan
-- ============================================================
--
-- ── Kenapa fungsi, bukan `INSERT INTO accounts VALUES …`
--
-- Bagan akun milik BADAN USAHA, dan badan usaha bertambah: SaaS dengan
-- pelanggan konkret sudah jadi keputusan founder (ADR-011). Seed berbentuk
-- INSERT hanya mengisi company yang ada saat migrasi dijalankan — badan usaha
-- kedua lahir tanpa satu akun pun, dan tak ada yang memberi tahu sampai
-- seseorang mencoba membuat jurnal.
--
-- Sebagai fungsi, ia bisa dipanggil kapan saja: saat company dibuat, saat
-- pelanggan baru onboarding, atau untuk memulihkan bagan akun yang terlanjur
-- kosong.
--
-- ── Sumber bagan akun
--
-- `ERP_MASTER_PLAN.md` §Modul 10 — sudah disetujui founder dan dipakai peta
-- auto-jurnal GL-2. Menyalinnya apa adanya, bukan mengarang ulang: peta
-- auto-jurnal menyebut kode akun secara harfiah (1122, 5110, 2110), jadi
-- setiap penyimpangan di sini akan memecahkan GL-2 tanpa gejala.
--
-- ── Idempoten
--
-- `ON CONFLICT (company_id, code) DO NOTHING` — aman dipanggil berulang.
-- Akun yang sudah disesuaikan pengguna TIDAK ditimpa; itu bagan akun mereka,
-- bukan milik migrasi.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_seed_coa_kontraktor(p_company UUID, p_oleh UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
AS $function$
DECLARE
  v_dibuat INT := 0;
  v_id     UUID;
  r        RECORD;
BEGIN
  IF p_company IS NULL THEN
    RAISE EXCEPTION 'fn_seed_coa_kontraktor butuh company_id';
  END IF;

  -- Dua lintasan: induk dulu (parent_id NULL), baru anak — supaya `parent_id`
  -- bisa dirujuk lewat kode, bukan lewat UUID yang belum ada saat menulis.
  FOR r IN
    SELECT * FROM (VALUES
      -- kode,  nama,                        tipe,        induk
      ('1000', 'Aset',                       'asset',     NULL),
      ('2000', 'Liabilitas',                 'liability', NULL),
      ('3000', 'Ekuitas',                    'equity',    NULL),
      ('4000', 'Pendapatan',                 'revenue',   NULL),
      ('5000', 'Beban Langsung',             'expense',   NULL),
      ('5900', 'Overhead',                   'expense',   NULL)
    ) AS t(kode, nama, tipe, induk)
  LOOP
    INSERT INTO accounts (company_id, code, name, type, created_by)
    VALUES (p_company, r.kode, r.nama, r.tipe, p_oleh)
    ON CONFLICT (company_id, code) DO NOTHING;
    IF FOUND THEN v_dibuat := v_dibuat + 1; END IF;
  END LOOP;

  FOR r IN
    SELECT * FROM (VALUES
      -- ASET LANCAR
      ('1100', 'Aset Lancar',                'asset',     '1000'),
      ('1110', 'Kas & Bank',                 'asset',     '1100'),
      ('1111', 'Kas Kantor',                 'asset',     '1110'),
      ('1112', 'Kas Proyek',                 'asset',     '1110'),
      ('1113', 'Bank',                       'asset',     '1110'),
      ('1120', 'Piutang & Uang Muka',        'asset',     '1100'),
      ('1121', 'Piutang Usaha',              'asset',     '1120'),
      ('1122', 'Uang Muka Mandor',           'asset',     '1120'),
      ('1123', 'Uang Muka Supplier',         'asset',     '1120'),
      ('1124', 'Retensi Belum Ditagih',      'asset',     '1120'),
      ('1310', 'Persediaan Material',        'asset',     '1100'),
      -- ASET TETAP
      ('1500', 'Aset Tetap',                 'asset',     '1000'),
      ('1510', 'Peralatan & Alat Berat',     'asset',     '1500'),
      ('1511', 'Akumulasi Penyusutan',       'asset',     '1500'),
      -- LIABILITAS
      ('2110', 'Utang Supplier',             'liability', '2000'),
      ('2120', 'Utang Upah',                 'liability', '2000'),
      ('2130', 'Utang Pajak',                'liability', '2000'),
      ('2140', 'Utang Subkontraktor',        'liability', '2000'),
      ('2150', 'Uang Muka Klien',            'liability', '2000'),
      -- EKUITAS
      ('3110', 'Modal',                      'equity',    '3000'),
      ('3120', 'Laba Ditahan',               'equity',    '3000'),
      -- PENDAPATAN
      ('4110', 'Pendapatan Jasa Konstruksi', 'revenue',   '4000'),
      ('4120', 'Pendapatan Termin',          'revenue',   '4000'),
      ('4130', 'Retensi',                    'revenue',   '4000'),
      -- BEBAN LANGSUNG
      ('5110', 'Biaya Upah Mandor',          'expense',   '5000'),
      ('5210', 'Biaya Material',             'expense',   '5000'),
      ('5310', 'Biaya Subkontraktor',        'expense',   '5000'),
      ('5410', 'Biaya Sewa Alat',            'expense',   '5000'),
      -- OVERHEAD
      ('5910', 'Gaji Staf',                  'expense',   '5900'),
      ('5920', 'Sewa Kantor',                'expense',   '5900'),
      ('5930', 'Utilitas',                   'expense',   '5900'),
      ('5940', 'Biaya Umum Lain',            'expense',   '5900')
    ) AS t(kode, nama, tipe, induk)
  LOOP
    SELECT id INTO v_id FROM accounts
     WHERE company_id = p_company AND code = r.induk;

    INSERT INTO accounts (company_id, code, name, type, parent_id, created_by)
    VALUES (p_company, r.kode, r.nama, r.tipe, v_id, p_oleh)
    ON CONFLICT (company_id, code) DO NOTHING;
    IF FOUND THEN v_dibuat := v_dibuat + 1; END IF;
  END LOOP;

  RETURN v_dibuat;
END;
$function$;

COMMENT ON FUNCTION fn_seed_coa_kontraktor(UUID, UUID) IS
  'Isi Chart of Accounts standar kontraktor untuk satu badan usaha. Idempoten '
  '(ON CONFLICT DO NOTHING) — akun yang sudah disesuaikan pengguna tak ditimpa. '
  'Kode akun HARFIAH mengikuti ERP_MASTER_PLAN §Modul 10 karena peta '
  'auto-jurnal GL-2 merujuknya sebagai string.';

-- ── Isi bagan akun untuk badan usaha yang SUDAH ADA ─────────────────────────
-- Yang baru dibuat sesudah ini mendapatkannya lewat API (GL-1c) atau dengan
-- memanggil fungsi di atas.
DO $$
DECLARE
  c RECORD;
  n INT;
BEGIN
  FOR c IN SELECT id, name FROM companies LOOP
    n := fn_seed_coa_kontraktor(c.id);
    RAISE NOTICE 'CoA % : % akun dibuat', c.name, n;
  END LOOP;
END $$;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
-- Migrasi yang "berhasil" tanpa meninggalkan akun satu pun adalah kelas cacat
-- yang repo ini temui berkali-kali.
DO $$
DECLARE
  v_company UUID;
  v_akun    INT;
BEGIN
  SELECT id INTO v_company FROM companies ORDER BY created_at LIMIT 1;
  IF v_company IS NULL THEN
    RETURN;   -- database bersih tanpa company
  END IF;

  SELECT count(*) INTO v_akun FROM accounts WHERE company_id = v_company;
  IF v_akun < 30 THEN
    RAISE EXCEPTION 'CoA tak lengkap sesudah migrasi 170: hanya % akun (harusnya ≥30)', v_akun;
  END IF;

  -- Kode yang dirujuk peta auto-jurnal GL-2 WAJIB ada. Kalau salah satu hilang,
  -- GL-2 akan gagal menemukan akunnya — dan itu jenis kegagalan yang diam.
  IF EXISTS (
    SELECT k FROM unnest(ARRAY['1111','1112','1121','1122','1310','2110','5110','5210']) k
     WHERE NOT EXISTS (
       SELECT 1 FROM accounts WHERE company_id = v_company AND code = k)
  ) THEN
    RAISE EXCEPTION 'Akun yang dirujuk peta auto-jurnal GL-2 tak lengkap sesudah migrasi 170';
  END IF;
END $$;
