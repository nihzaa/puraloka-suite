-- ════════════════════════════════════════════════════════════════════════════
-- 324 — Akun beban penyusutan (A2: penyusutan → jurnal)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Yang diukur 2026-08-12
--
-- `penyusutan_alat` berisi 12 baris dengan `journal_entry_id` NULL SELURUHNYA.
-- Kolomnya ada sejak lama; jalur yang MENGISINYA tak pernah dibangun.
--
-- Akibatnya: beban penyusutan tak pernah masuk laba-rugi, dan nilai buku aset
-- di neraca lebih tinggi daripada kenyataannya. Dua laporan yang paling sering
-- ditanyakan calon pelanggan, dua-duanya salah, tanpa satu pun galat.
--
-- ── Kenapa migrasi ini hanya membuat SATU akun
--
-- Bagan akun (migrasi 170) sudah punya `1511 Akumulasi Penyusutan` — sisi
-- kredit jurnal penyusutan. Yang tak ada: akun BEBAN-nya, sisi debit.
--
-- Diperiksa ke basis, bukan diandaikan: nol akun bertipe `expense` yang
-- namanya menyebut penyusutan/depresiasi.
--
-- ── Kenapa `5960`, bukan `5410`
--
-- `5410 Biaya Sewa Alat` sudah ada dan tampak berdekatan, tetapi menyewa alat
-- dan menyusutkan alat milik sendiri adalah dua hal yang berbeda secara
-- akuntansi DAN secara keputusan bisnis: yang satu kas keluar, yang satu
-- tidak. Menyatukannya membuat pertanyaan "lebih murah sewa atau beli?" tak
-- bisa dijawab dari buku besar.
--
-- Nomornya masuk kelompok `59xx Overhead` karena penyusutan alat di sini
-- belum diatribusikan ke proyek — `penyusutan_alat` tak punya `project_id`.
-- Kalau suatu saat atribusi itu ada, akunnya pindah ke `54xx`, dan itu
-- perubahan yang harus terbaca di review, bukan diam-diam.
--
-- ── Kenapa PER COMPANY
--
-- `accounts.company_id` NOT NULL — bagan akun milik tenant, bukan global.
-- Tenant yang baru dibuat sesudah migrasi ini menyalin bagan akun dari
-- company contoh (pola `siapkanRantaiApproval`), jadi akun ini ikut terbawa.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO accounts (company_id, code, name, type, parent_id, description)
SELECT c.id,
       '5960',
       'Beban Penyusutan Alat',
       'expense',
       (SELECT a.id FROM accounts a WHERE a.company_id = c.id AND a.code = '5900' LIMIT 1),
       'Penyusutan periodik alat & peralatan milik sendiri. Lawan kreditnya 1511 Akumulasi Penyusutan.'
  FROM companies c
 WHERE NOT EXISTS (
   SELECT 1 FROM accounts a WHERE a.company_id = c.id AND a.code = '5960'
 )
   -- Hanya company yang SUDAH punya bagan akun. Membuat satu akun yatim di
   -- tenant tanpa bagan akun menghasilkan neraca yang isinya satu baris.
   AND EXISTS (SELECT 1 FROM accounts a WHERE a.company_id = c.id AND a.code = '1511');

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
  m INT;
BEGIN
  -- Tiap company yang punya 1511 WAJIB punya pasangannya 5960 — kalau tidak,
  -- jurnal penyusutan tak bisa disusun berpasangan di tenant itu.
  SELECT count(*) INTO n
    FROM accounts a1
   WHERE a1.code = '1511'
     AND NOT EXISTS (
       SELECT 1 FROM accounts a2 WHERE a2.company_id = a1.company_id AND a2.code = '5960');
  IF n > 0 THEN
    RAISE EXCEPTION '324 gagal: % company punya 1511 tanpa 5960 — jurnal penyusutan tak berpasangan', n;
  END IF;

  SELECT count(*) INTO m FROM accounts WHERE code = '5960' AND type = 'expense';
  IF m = 0 THEN
    RAISE EXCEPTION '324 gagal: akun 5960 tak terbentuk di satu company pun';
  END IF;

  -- Tipe akun menentukan ARAH SALDO di laporan (`asset|expense` → debit −
  -- kredit). Salah tipe di sini membuat beban penyusutan MENAMBAH laba,
  -- bukan menguranginya — dan angkanya tetap terlihat wajar.
  SELECT count(*) INTO n FROM accounts WHERE code = '5960' AND type <> 'expense';
  IF n > 0 THEN
    RAISE EXCEPTION '324 gagal: % akun 5960 bertipe selain expense', n;
  END IF;

  RAISE NOTICE '324 OK — akun 5960 Beban Penyusutan Alat ada di % company', m;
END $$;
