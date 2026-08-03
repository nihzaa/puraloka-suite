-- ============================================================
-- PURALOKA SUITE — Migration 169
-- GL: perbaiki constraint yang membuat pembatalan jurnal MUSTAHIL
-- ============================================================
--
-- ── Cacat di migrasi 167 (ditemukan test-nya sendiri, sebelum dipakai)
--
-- `je_posted_punya_tanggal` berbunyi:
--
--     CHECK ((status = 'posted') = (posted_at IS NOT NULL))
--
-- Maksudnya: jurnal posted wajib punya tanggal posting. Itu benar. Tapi
-- kesetaraan dua arah juga menuntut sebaliknya — status BUKAN posted wajib
-- `posted_at IS NULL`.
--
-- Akibatnya membatalkan jurnal (`posted` → `void`) DITOLAK: `posted_at` masih
-- terisi, dan constraint menuntutnya kosong. Satu-satunya jalan koreksi yang
-- diizinkan migrasi 168 justru tak bisa dilewati.
--
-- ── Kenapa `posted_at` TIDAK dikosongkan saat void
--
-- Alternatif "kosongkan posted_at saat membatalkan" menghapus fakta bahwa
-- jurnal itu PERNAH di-posting — kapan, dan oleh siapa. Buku besar yang
-- membuang jejak pembatalan berhenti jadi bukti; justru itu yang harus
-- dipertahankan.
--
-- ── Aturan yang benar
--
--   posted → WAJIB punya posted_at
--   void   → BOLEH punya posted_at (kalau ia pernah di-posting) atau tidak
--            (kalau dibatalkan saat masih draft)
--   draft  → TAK BOLEH punya posted_at
--
-- ── Dampak ke data: NOL
--
-- Tabelnya baru dibuat migrasi 167 dan belum berisi satu baris pun di luar
-- data uji. `DROP CONSTRAINT` + `ADD CONSTRAINT` divalidasi terhadap baris
-- yang ada — kalau nanti ada baris yang melanggar, migrasi ini gagal keras,
-- bukan diam-diam melewatkannya.
-- ============================================================

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS je_posted_punya_tanggal;

ALTER TABLE journal_entries
  ADD CONSTRAINT je_posted_punya_tanggal CHECK (
    (status = 'posted' AND posted_at IS NOT NULL)
    OR (status = 'draft' AND posted_at IS NULL)
    OR (status = 'void')   -- void: jejak posting lama DIPERTAHANKAN
  );

COMMENT ON CONSTRAINT je_posted_punya_tanggal ON journal_entries IS
  'posted wajib bertanggal · draft tak boleh · void bebas (jejak posting lama '
  'dipertahankan supaya pembatalan tetap bisa ditelusuri).';

-- ── Verifikasi: pembatalan benar-benar bisa dilakukan ───────────────────────
-- Constraint yang "terpasang" tapi masih memblokir void akan mengulangi persis
-- cacat yang migrasi ini perbaiki.
DO $$
DECLARE
  v_co  UUID;
  v_ak1 UUID;
  v_ak2 UUID;
  v_je  UUID;
BEGIN
  SELECT id INTO v_co FROM companies ORDER BY created_at LIMIT 1;
  IF v_co IS NULL THEN
    RETURN;   -- database bersih tanpa company; tak ada yang bisa diuji
  END IF;

  -- Jurnal WAJIB seimbang & berbaris ≥2 sebelum bisa di-posting (migrasi 168).
  -- Blok ini menghormati aturan itu alih-alih menyiasatinya: verifikasi yang
  -- melewati penjaganya sendiri tak membuktikan apa pun.
  INSERT INTO accounts (company_id, code, name, type)
  VALUES (v_co, '[V169]-D', 'Uji Debit', 'expense') RETURNING id INTO v_ak1;
  INSERT INTO accounts (company_id, code, name, type)
  VALUES (v_co, '[V169]-K', 'Uji Kredit', 'asset') RETURNING id INTO v_ak2;

  INSERT INTO journal_entries (company_id, entry_number, entry_date, description)
  VALUES (v_co, '[VERIFIKASI-169]', CURRENT_DATE, 'uji constraint')
  RETURNING id INTO v_je;

  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit)
  VALUES (v_je, v_ak1, 1000, 0), (v_je, v_ak2, 0, 1000);

  UPDATE journal_entries SET status='posted', posted_at=now() WHERE id = v_je;

  -- Inti yang diperbaiki migrasi ini: pembatalan jurnal yang sudah di-posting.
  UPDATE journal_entries SET status = 'void' WHERE id = v_je;

  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE id = v_je AND status = 'void') THEN
    RAISE EXCEPTION 'Pembatalan jurnal masih terblokir sesudah migrasi 169';
  END IF;

  -- Bersihkan jejak verifikasi. Baris jurnal ikut terhapus lewat ON DELETE
  -- CASCADE; statusnya 'void' jadi penjaga immutability tak menghalangi.
  DELETE FROM journal_entry_lines WHERE entry_id = v_je;
  DELETE FROM journal_entries WHERE id = v_je;
  DELETE FROM accounts WHERE id IN (v_ak1, v_ak2);
END $$;
