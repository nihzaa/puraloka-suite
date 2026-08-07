-- ════════════════════════════════════════════════════════════════════════════
-- SEED REKONSILIASI BANK — koran Juni 2026 untuk "Kas Kolektor Ayah"
--
-- ── Kenapa seed ini penting, bukan sekadar mengisi tabel
--
-- Modul rekonsiliasi hanya berguna kalau ada yang TIDAK cocok. Seed yang
-- seluruhnya berpasangan menghasilkan layar hijau yang tak membuktikan apa pun
-- — persis jebakan yang membuat saya menunda "tutup buku" (GL 0 baris).
--
-- Jadi koran ini sengaja memuat empat keadaan yang benar-benar terjadi tiap
-- bulan di kantor kontraktor:
--
--   1. COCOK PERSIS      penerimaan yang tanggal & nominalnya sama
--   2. COCOK BERGESER    transfer yang masuk koran 2 hari kemudian —
--                        transfer antar bank memang butuh 1-3 hari kerja
--   3. HANYA DI KORAN    biaya admin & pajak bunga yang tak pernah dicatat
--                        siapa pun di buku; inilah yang paling sering
--                        membuat saldo tak pernah ketemu
--   4. HANYA DI BUKU     penerimaan yang sudah dicatat tapi belum masuk
--                        rekening (setoran dalam perjalanan)
--
-- ── Angka koran DITURUNKAN dari transaksi nyata
--
-- Nominalnya diambil dari `payments` yang benar-benar ada di basis, bukan
-- dikarang. Kalau dikarang, pencocokan otomatis tak akan menemukan apa pun dan
-- modulnya terlihat rusak padahal datanya yang tak nyambung.
--
-- ── Idempoten
--
-- Blok penjaga `IF EXISTS ... RETURN` di awal. `ON CONFLICT DO NOTHING` TIDAK
-- cukup di sini: `rekening_koran_baris` unik per (koran_id, hash_baris), dan
-- koran baru selalu menghasilkan koran_id baru — jadi menjalankan dua kali
-- akan membuat koran kedua berisi baris yang sama.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_akun     UUID;
  v_company  UUID;
  v_koran    UUID;
  v_baris    UUID;
  v_pay      RECORD;
  v_urut     INT := 0;
  v_saldo    NUMERIC := 0;
BEGIN
  -- ── Penjaga idempoten ─────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM rekening_koran WHERE nama_berkas = 'seed-koran-juni-2026.csv') THEN
    RAISE NOTICE 'Seed rekonsiliasi sudah ada — dilewati.';
    RETURN;
  END IF;

  SELECT id, company_id INTO v_akun, v_company
    FROM cash_accounts
   WHERE name = 'Kas Kolektor Ayah'
   LIMIT 1;

  IF v_akun IS NULL THEN
    RAISE NOTICE 'Rekening "Kas Kolektor Ayah" tak ada — seed dilewati.';
    RETURN;
  END IF;

  -- ── Koran Juni 2026 ───────────────────────────────────────────────────────
  --
  -- Saldo awal & akhir sengaja TIDAK dihitung dari barisnya sendiri: koran
  -- sungguhan mencantumkan saldo dari bank, dan itulah angka yang harus
  -- ditemui perhitungan buku. Kalau dihitung sendiri ia selalu cocok.
  INSERT INTO rekening_koran (
    company_id, cash_account_id, periode_dari, periode_sampai,
    saldo_awal, saldo_akhir, nama_berkas, catatan)
  VALUES (
    v_company, v_akun, '2026-06-01', '2026-06-30',
    0, 597900000,
    'seed-koran-juni-2026.csv',
    'Data contoh: sengaja memuat baris yang TIDAK berpasangan supaya modulnya bisa diuji dengan keadaan nyata.')
  RETURNING id INTO v_koran;

  -- ── 1 & 2. Penerimaan nyata dari `payments` ───────────────────────────────
  --
  -- Tiga penerimaan pertama masuk koran; yang keempat SENGAJA tidak — ia jadi
  -- "setoran dalam perjalanan" (keadaan 4).
  FOR v_pay IN
    SELECT id, amount_paid, paid_at, ref_number
      FROM payments
     WHERE cash_account_id = v_akun
     ORDER BY paid_at, id
     LIMIT 3
  LOOP
    v_urut := v_urut + 1;
    v_saldo := v_saldo + v_pay.amount_paid;

    INSERT INTO rekening_koran_baris (
      koran_id, tanggal, keterangan, debit, kredit, saldo, ref_bank,
      hash_baris, urutan)
    VALUES (
      v_koran,
      -- Baris kedua digeser 2 hari: transfer antar bank memang butuh waktu,
      -- dan pencocokan otomatis harus tetap menemukannya (toleransi 3 hari).
      CASE WHEN v_urut = 2 THEN (v_pay.paid_at::date + 2) ELSE v_pay.paid_at::date END,
      'TRANSFER MASUK ' || COALESCE(v_pay.ref_number, 'TANPA REF'),
      0, v_pay.amount_paid, v_saldo,
      COALESCE(v_pay.ref_number, 'REF' || v_urut),
      v_pay.paid_at::date::text || '|transfer masuk|' || v_urut,
      v_urut);
  END LOOP;

  -- ── 3. Hanya di koran: yang tak pernah dicatat siapa pun ──────────────────
  --
  -- Inilah yang paling sering membuat saldo tak pernah ketemu, dan yang paling
  -- membuktikan gunanya modul ini: tak seorang pun mengetik "biaya admin
  -- Rp 15.000" ke dalam sistem, tapi bank memotongnya tiap bulan.
  v_urut := v_urut + 1;
  v_saldo := v_saldo - 15000;
  INSERT INTO rekening_koran_baris (
    koran_id, tanggal, keterangan, debit, kredit, saldo, ref_bank, hash_baris, urutan)
  VALUES (v_koran, '2026-06-30', 'BIAYA ADMINISTRASI', 15000, 0, v_saldo,
          'ADM0626', '2026-06-30|biaya administrasi|' || v_urut, v_urut);

  v_urut := v_urut + 1;
  v_saldo := v_saldo + 8500;
  INSERT INTO rekening_koran_baris (
    koran_id, tanggal, keterangan, debit, kredit, saldo, ref_bank, hash_baris, urutan)
  VALUES (v_koran, '2026-06-30', 'JASA GIRO', 0, 8500, v_saldo,
          'GIR0626', '2026-06-30|jasa giro|' || v_urut, v_urut);

  v_urut := v_urut + 1;
  v_saldo := v_saldo - 1700;
  INSERT INTO rekening_koran_baris (
    koran_id, tanggal, keterangan, debit, kredit, saldo, ref_bank, hash_baris, urutan)
  VALUES (v_koran, '2026-06-30', 'PAJAK BUNGA 20%', 1700, 0, v_saldo,
          'PJK0626', '2026-06-30|pajak bunga|' || v_urut, v_urut);

  -- Satu pengeluaran yang keluar dari rekening TANPA catatan di buku. Ini
  -- keadaan paling mahal — uang bergerak dan tak seorang pun tahu untuk apa.
  v_urut := v_urut + 1;
  v_saldo := v_saldo - 4500000;
  INSERT INTO rekening_koran_baris (
    koran_id, tanggal, keterangan, debit, kredit, saldo, ref_bank, hash_baris, urutan)
  VALUES (v_koran, '2026-06-18', 'DEBIT KARTU - TOKO BANGUNAN SEJAHTERA', 4500000, 0, v_saldo,
          'DBT18062026', '2026-06-18|debit kartu toko|' || v_urut, v_urut);

  -- ── Pencocokan otomatis untuk yang jelas ──────────────────────────────────
  --
  -- Hanya yang PERSIS. Sisanya sengaja dibiarkan supaya layarnya menunjukkan
  -- pekerjaan yang tersisa, bukan hijau seluruhnya.
  FOR v_pay IN
    SELECT p.id AS pay_id, b.id AS baris_id
      FROM payments p
      JOIN rekening_koran_baris b
        ON b.koran_id = v_koran
       AND b.kredit = p.amount_paid
       AND b.tanggal = p.paid_at::date
     WHERE p.cash_account_id = v_akun
  LOOP
    INSERT INTO pencocokan_bank (company_id, baris_id, sumber_tabel, sumber_id, jenis)
    VALUES (v_company, v_pay.baris_id, 'payments', v_pay.pay_id, 'otomatis')
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ── Penyesuaian untuk biaya bank ──────────────────────────────────────────
  --
  -- Biaya admin & jasa giro TIDAK dicocokkan ke transaksi buku — memang tak
  -- ada pasangannya. Ia masuk sebagai penyesuaian, dan itulah bentuk yang
  -- benar: rekonsiliasi mengakuinya, bukan memaksanya berpasangan.
  INSERT INTO penyesuaian_rekonsiliasi (company_id, koran_id, jenis, keterangan, nominal)
  VALUES
    (v_company, v_koran, 'biaya_admin', 'Biaya administrasi bulanan Juni 2026', -15000),
    (v_company, v_koran, 'jasa_giro',   'Bunga giro Juni 2026', 8500),
    (v_company, v_koran, 'pajak_bunga', 'PPh final 20% atas jasa giro', -1700);

  RAISE NOTICE 'Seed rekonsiliasi: koran Juni 2026 dengan % baris.', v_urut;
END $$;
