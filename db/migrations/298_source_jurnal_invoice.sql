-- ════════════════════════════════════════════════════════════════════════════
-- 298 — `journal_entries.source` menerima 'invoice' (R-012, lanjutan 297)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Cacat yang ditemukan test, dan kenapa perbaikannya BUKAN memakai nilai
--    yang sudah ada
--
-- `journal_entries_source_check` membatasi `source` pada tujuh nilai:
--
--   manual · kasbon · payment · purchase_order · expense · wage · opening_balance
--
-- Penjurnalan invoice (R-012) menulis `source = 'otomatis'`, dan basis
-- menolaknya. Yang saya lakukan pertama: menebak nilai itu tanpa memeriksa
-- constraint-nya — dan test menangkapnya.
--
-- Godaan berikutnya: memakai `'payment'` yang sudah ada supaya lolos. Itu
-- SALAH ARTI. Kolom `source` menjawab "jurnal ini berasal dari transaksi apa",
-- dan invoice bukan payment: yang pertama mengakui pendapatan, yang kedua
-- menerima kas. Menyamakannya membuat penelusuran balik dari buku besar ke
-- transaksinya menunjuk ke tempat yang salah — dan itu justru satu-satunya
-- guna kolom ini.
--
-- Perhatikan pula `'otomatis'` yang saya pakai semula juga salah bentuk: ia
-- menjawab "BAGAIMANA jurnal dibuat", bukan "DARI APA". Yang otomatis maupun
-- manual sama-sama bisa berasal dari invoice.
--
-- ── Kenapa 'invoice' belum ada sejak awal
--
-- Bukan kelalaian: sampai R-012 dijawab, tak ada jurnal yang berasal dari
-- invoice — pemetaan akunnya belum ditetapkan. Daftar tujuh nilai itu
-- mencerminkan keadaan saat migrasi GL ditulis, dan sekarang keadaannya
-- bertambah satu.
--
-- ── Yang TIDAK diubah
--
-- Tujuh nilai lama tetap. Menghapus salah satunya akan membuat jurnal lama
-- yang memakainya gagal saat di-UPDATE — dan constraint yang menolak baris
-- yang sudah ada adalah cara paling cepat membuat modul lain rusak tanpa
-- sebab yang terlihat.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_check;

ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_check
  CHECK (source = ANY (ARRAY[
    'manual', 'kasbon', 'payment', 'purchase_order', 'expense', 'wage',
    'opening_balance',
    'invoice'          -- ← R-012: penjurnalan otomatis dari invoice termin
  ]));

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_def TEXT;
  v_company UUID;
  v_user UUID;
  v_lolos BOOLEAN := FALSE;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint WHERE conname = 'journal_entries_source_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION '298 gagal: constraint source hilang seluruhnya';
  END IF;

  -- 'invoice' HARUS diterima …
  IF position('invoice' IN v_def) = 0 THEN
    RAISE EXCEPTION '298 gagal: source tak menerima nilai invoice';
  END IF;

  -- … dan tujuh nilai lama HARUS tetap ada.
  FOR v_def IN
    SELECT x FROM unnest(ARRAY['manual','kasbon','payment','purchase_order',
                               'expense','wage','opening_balance']) x
     WHERE position(x IN (SELECT pg_get_constraintdef(oid) FROM pg_constraint
                           WHERE conname = 'journal_entries_source_check')) = 0
  LOOP
    RAISE EXCEPTION '298 gagal: nilai source lama "%" hilang', v_def;
  END LOOP;

  -- Nilai NGAWUR tetap ditolak — constraint yang menerima apa pun bukan
  -- constraint.
  SELECT company_id INTO v_company FROM projects WHERE company_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_user FROM users LIMIT 1;
  IF v_company IS NOT NULL THEN
    BEGIN
      INSERT INTO journal_entries
        (company_id, entry_number, entry_date, description, source, status, created_by)
      VALUES (v_company, '[298-VERIFIKASI]', '1999-01-01', 'x', 'ngawur', 'draft', v_user);
      v_lolos := TRUE;
    EXCEPTION WHEN OTHERS THEN
      NULL;   -- ditolak: benar
    END;
    IF v_lolos THEN
      DELETE FROM journal_entries WHERE entry_number = '[298-VERIFIKASI]';
      RAISE EXCEPTION '298 gagal: source ngawur LOLOS — constraint tak menjaga apa pun';
    END IF;
  END IF;

  RAISE NOTICE '298 OK — source menerima invoice, tujuh nilai lama tetap, ngawur ditolak';
END $$;
