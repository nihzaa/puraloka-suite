-- ════════════════════════════════════════════════════════════════════════════
-- 296 — Riwayat periode: append-only TETAP, tetapi CASCADE bisa jalan (G5)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Cacat rancangan yang ditemukan TEST, bukan oleh membaca kode
--
-- Migrasi 294 memberi `periode_akuntansi_riwayat` dua hal yang saling
-- meniadakan:
--
--   periode_id ... REFERENCES periode_akuntansi(id) ON DELETE CASCADE
--   trigger BEFORE DELETE → RAISE EXCEPTION 'append-only'
--
-- Akibatnya: **periode tak bisa dihapus sama sekali.** CASCADE mencoba
-- menghapus riwayatnya, trigger menolak, dan penghapusan periodenya gagal
-- dengan pesan yang menunjuk ke tabel LAIN — sehingga sebabnya tak terbaca.
--
-- Ini bukan cacat teoretis: ia menghentikan pembersihan fixture test pada
-- percobaan pertama, dan di lingkungan nyata ia akan menghentikan penghapusan
-- periode yang salah dibuat (mis. salah ketik tanggal, dibuat dua kali).
--
-- ── Yang DIPERTAHANKAN, dan kenapa
--
-- Append-only-nya BENAR dan tetap ada. Riwayat penguncian yang bisa disunting
-- atau dihapus satu-satu adalah riwayat yang tak menjaga apa pun — persis
-- alasan `audit_logs` (migrasi 073) append-only.
--
-- Yang berubah hanya SATU hal: penghapusan yang berasal dari hilangnya
-- INDUKNYA diizinkan. Alasannya:
--
--   · riwayat tanpa periodenya tak menjelaskan apa pun — ia menunjuk ke
--     sesuatu yang tak ada
--   · menghapus periode sendiri sudah tercatat `audit_logs` (append-only),
--     jadi jejaknya tidak hilang, hanya berpindah ke tempat yang benar
--   · yang dilarang tetap dilarang: menghapus SATU baris riwayat sementara
--     periodenya masih ada — itulah bentuk penghapusan yang menyembunyikan
--     sesuatu
--
-- ── Cara membedakannya
--
-- `pg_trigger_depth() > 1` benar bila trigger ini dipicu dari dalam aksi
-- lain (di sini: CASCADE dari penghapusan periode). DELETE langsung dari
-- aplikasi punya depth 1.
--
-- Cara lain yang DITOLAK: memeriksa apakah periodenya masih ada. Saat CASCADE
-- berjalan, urutan penghapusannya tak dijamin, dan memeriksa keberadaan induk
-- menghasilkan perilaku yang bergantung urutan — kelas cacat yang paling
-- sulit ditemukan karena ia lolos di satu lingkungan dan gagal di lain.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_riwayat_periode_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- UPDATE selalu ditolak, tanpa kecuali. Tak ada alasan sah mengubah
  -- riwayat yang sudah tercatat.
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'periode_akuntansi_riwayat bersifat append-only: UPDATE ditolak';
  END IF;

  -- DELETE: diizinkan HANYA bila berasal dari CASCADE penghapusan induknya
  -- (kedalaman trigger > 1). DELETE langsung tetap ditolak.
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'periode_akuntansi_riwayat bersifat append-only: DELETE ditolak. '
    'Riwayat hanya hilang bersama periodenya, dan penghapusan periode itu '
    'sendiri tercatat di audit_logs.';
END $$;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_periode UUID;
  v_company UUID;
  v_riwayat UUID;
  v_lolos   BOOLEAN := FALSE;
BEGIN
  SELECT company_id INTO v_company FROM projects WHERE company_id IS NOT NULL LIMIT 1;
  IF v_company IS NULL THEN
    RAISE NOTICE '296: tak ada company untuk diuji — verifikasi dilewati';
    RETURN;
  END IF;

  INSERT INTO periode_akuntansi (company_id, nama, tanggal_mulai, tanggal_akhir)
  VALUES (v_company, '[296-VERIFIKASI]', '1999-01-01', '1999-01-31')
  RETURNING id INTO v_periode;

  INSERT INTO periode_akuntansi_riwayat (periode_id, tindakan)
  VALUES (v_periode, 'dibuat') RETURNING id INTO v_riwayat;

  -- 1. DELETE LANGSUNG harus tetap DITOLAK.
  BEGIN
    DELETE FROM periode_akuntansi_riwayat WHERE id = v_riwayat;
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN
    NULL;   -- ditolak: benar
  END;
  IF v_lolos THEN
    RAISE EXCEPTION '296 gagal: DELETE langsung riwayat LOLOS — append-only bocor';
  END IF;

  -- 2. UPDATE harus tetap DITOLAK.
  v_lolos := FALSE;
  BEGIN
    UPDATE periode_akuntansi_riwayat SET alasan = 'x' WHERE id = v_riwayat;
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  IF v_lolos THEN
    RAISE EXCEPTION '296 gagal: UPDATE riwayat LOLOS — append-only bocor';
  END IF;

  -- 3. CASCADE harus BERHASIL — inilah yang diperbaiki migrasi ini.
  DELETE FROM periode_akuntansi WHERE id = v_periode;

  IF EXISTS (SELECT 1 FROM periode_akuntansi_riwayat WHERE id = v_riwayat) THEN
    RAISE EXCEPTION '296 gagal: riwayat tak ikut terhapus lewat CASCADE';
  END IF;

  RAISE NOTICE '296 OK — append-only tetap (UPDATE & DELETE langsung ditolak), CASCADE jalan';
END $$;
