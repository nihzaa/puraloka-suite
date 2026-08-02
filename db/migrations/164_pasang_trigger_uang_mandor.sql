-- ============================================================
-- PURALOKA SUITE — Migration 164
-- Pasang EMPAT trigger uang mandor yang HILANG.
-- ============================================================
--
-- ── Kelas cacat yang sama, kali ketiga
--
-- Migrasi 161 & 162 menutup dua fungsi yang ada di `pg_proc` tapi tak punya
-- trigger yang memanggilnya. Penelusuran menyeluruh sesudahnya (2026-08-02)
-- menemukan bahwa itu bukan dua kasus terpencil: ada TUJUH fungsi
-- `RETURNS trigger` di dev yang tak dipakai trigger mana pun, dan EMPAT di
-- antaranya menyentuh uang secara langsung.
--
--   fn_update_cash_on_kasbon_approved        — kasbon disetujui → potong kas
--   fn_kasbon_approved_create_expense        — kasbon disetujui → catat beban
--   fn_progress_payment_approved_deduct_cash — bayar progress  → potong kas
--   fn_settle_borongan_deduct_cash           — settle borongan → potong kas
--
-- Keempatnya PUNYA `CREATE TRIGGER` di migrasi aslinya (022 dan 051), dan
-- setiap `DROP` di sana berpasangan dengan `CREATE` di file yang sama — pola
-- idempoten biasa, bukan pencabutan yang disengaja. Kenapa tak terpasang di
-- dev tak bisa dipastikan: repo ini baru punya `schema_migrations` belakangan.
--
-- ── Dampak nyata: Rp 67.600.000 tak pernah memotong saldo
--
-- Diverifikasi lewat koneksi langsung ke dev, 2026-08-02:
--
--   kasbon approved ber-akun kas :  16 baris  Rp 46.600.000
--   progress payment ber-akun kas:   3 baris  Rp 21.000.000
--   borongan settlement          :   0 baris  Rp 0
--
-- Uang ini sudah keluar di lapangan — mandor menerimanya — tapi saldo kas di
-- aplikasi masih menampilkannya sebagai uang yang ada.
--
-- ⚠️ Ini juga menjelaskan mengapa tiga kas kecil bersaldo negatif (STATUS.md
-- §E) TIDAK bisa dijelaskan oleh transaksi yang tercatat: arah kesalahannya
-- justru sebaliknya — saldo seharusnya lebih KECIL lagi, bukan lebih besar.
-- Dua anomali yang berlawanan arah pada data yang sama; keduanya perlu
-- direkonsiliasi ke uang sungguhan sebelum angka dev bisa dipercaya.
--
-- ── Kenapa tak ada risiko potongan ganda
--
-- Diperiksa sebelum memasang: `routes/v1/kasbons.ts` dan `routes/v1/mandor.ts`
-- HANYA membaca `cash_accounts` (`select`), tak pernah menulis saldonya. Jadi
-- tak ada pekerjaan yang sudah dilakukan di lapisan aplikasi yang akan
-- terduplikasi oleh trigger ini.
--
-- ── Yang migrasi ini LAKUKAN dan TIDAK lakukan
--
-- LAKUKAN  : memasang trigger, sehingga transaksi BERIKUTNYA memotong saldo.
-- TIDAK    : menyentuh saldo atau baris yang sudah ada.
--
-- `AFTER`-trigger hanya bereaksi pada perubahan baru — 19 baris lama tak
-- tersentuh, dan saldo sebelum & sesudah migrasi ini identik.
--
-- Koreksi retroaktif SENGAJA tidak dilakukan, alasan sama dengan migrasi 162:
-- itu keputusan akuntansi yang harus dicocokkan ke uang sungguhan lebih dulu.
-- Dicatat di STATUS.md sebagai keputusan terbuka.
-- ============================================================

-- ── 1. Kasbon disetujui → potong saldo kas ──────────────────────────────────
DROP TRIGGER IF EXISTS trg_update_cash_on_kasbon_approved ON kasbons;
CREATE TRIGGER trg_update_cash_on_kasbon_approved
  AFTER UPDATE ON kasbons
  FOR EACH ROW EXECUTE FUNCTION fn_update_cash_on_kasbon_approved();

-- ── 2. Kasbon disetujui → catat sebagai beban proyek ────────────────────────
DROP TRIGGER IF EXISTS trg_kasbon_approved_create_expense ON kasbons;
CREATE TRIGGER trg_kasbon_approved_create_expense
  AFTER UPDATE ON kasbons
  FOR EACH ROW EXECUTE FUNCTION fn_kasbon_approved_create_expense();

-- ── 3. Pembayaran progress disetujui → potong saldo kas ─────────────────────
DROP TRIGGER IF EXISTS trg_progress_payment_approved_deduct_cash ON progress_payments;
-- `AFTER UPDATE` saja, sama persis dengan migrasi 051. Menambahkan INSERT
-- akan memotong saldo DUA KALI untuk baris yang dibuat langsung approved.
CREATE TRIGGER trg_progress_payment_approved_deduct_cash
  AFTER UPDATE ON progress_payments
  FOR EACH ROW EXECUTE FUNCTION fn_progress_payment_approved_deduct_cash();

-- ── 4. Settlement borongan → potong saldo kas ───────────────────────────────
DROP TRIGGER IF EXISTS trg_settle_borongan_deduct_cash ON borongan_settlements;
-- `AFTER INSERT` saja, sama persis dengan migrasi 051 — settlement borongan
-- dibuat sekali dalam keadaan final, tak melalui alur persetujuan.
CREATE TRIGGER trg_settle_borongan_deduct_cash
  AFTER INSERT ON borongan_settlements
  FOR EACH ROW EXECUTE FUNCTION fn_settle_borongan_deduct_cash();

-- ── Verifikasi: keempatnya benar-benar terpasang ────────────────────────────
-- Gagal keras kalau tidak. Migrasi yang "berhasil" tanpa efek adalah persis
-- kelas cacat yang migrasi ini perbaiki — untuk ketiga kalinya.
DO $$
DECLARE
  hilang TEXT;
BEGIN
  SELECT string_agg(nama, ', ')
    INTO hilang
    FROM (VALUES
      ('trg_update_cash_on_kasbon_approved',        'kasbons'),
      ('trg_kasbon_approved_create_expense',        'kasbons'),
      ('trg_progress_payment_approved_deduct_cash', 'progress_payments'),
      ('trg_settle_borongan_deduct_cash',           'borongan_settlements')
    ) AS t(nama, tabel)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgname = t.nama
        AND tgrelid = t.tabel::regclass
   );

  IF hilang IS NOT NULL THEN
    RAISE EXCEPTION 'Trigger TIDAK terpasang sesudah migrasi 164: %', hilang;
  END IF;
END $$;
