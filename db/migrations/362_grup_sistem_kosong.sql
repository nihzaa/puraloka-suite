-- ============================================================================
-- 362 — "Layanan & Plafon AI": grup yang tak punya isi, dan itu ULAH MIGRASI 361
-- ============================================================================
--
-- ── Yang founder tanyakan, 2026-08-14
--
--   "dan layanan & plafon ai itu halaman apa kok ada di sidebar?"
--
-- Pertanyaannya tepat, dan jawabannya: **bukan halaman apa-apa.** Ia grup
-- kosong yang tersisa dari pekerjaan saya sendiri.
--
-- Migrasi 361 memindahkan `ai-penyedia` dan `ai-plafon-setujui` dari
-- `g-sistem` ke `g-ai` — benar, karena keduanya memang halaman AI. Tetapi
-- keduanya adalah SATU-SATUNYA anak aktif `g-sistem`, dan saya tak memeriksa
-- apa yang tersisa sesudah dipindah.
--
-- Diukur sekarang: `g-sistem` punya NOL anak aktif (delapan anak lamanya —
-- `sy-jadwal`, `sy-approval`, dan seterusnya — sudah dinonaktifkan jauh
-- sebelumnya). Yang tampil di sidebar hanyalah judulnya, dan mengkliknya tak
-- membawa ke mana pun.
--
-- ── Pelajaran yang dicatat, bukan sekadar diperbaiki
--
-- Blok verifikasi 361 memeriksa TUJUAN ("apakah item ai-* sudah semua di
-- g-ai?") tetapi tidak memeriksa ASAL. Perpindahan selalu punya dua sisi, dan
-- sisi yang ditinggalkan tak pernah menghasilkan galat — ia hanya jadi kotak
-- kosong yang bertahan sampai ada yang menanyakannya.
--
-- Migrasi ini menambahkan penjaganya: nol grup aktif boleh tanpa anak aktif,
-- kecuali yang memang punya `href` sendiri (mis. `beranda` — pranala tunggal,
-- bukan grup).
-- ============================================================================

DO $$
DECLARE
  n_anak  int;
  n_yatim int;
BEGIN
  SELECT count(*) INTO n_anak
    FROM menu_items a JOIN menu_items b ON b.id = a.parent_id
   WHERE b.key = 'g-sistem' AND a.is_active;

  IF n_anak > 0 THEN
    RAISE EXCEPTION '362 batal: g-sistem ternyata punya % anak aktif — jangan dimatikan', n_anak;
  END IF;

  UPDATE menu_items
     SET is_active = false, updated_at = now()
   WHERE key = 'g-sistem';

  -- Penjaga: tak boleh ada grup aktif tanpa anak aktif DAN tanpa href sendiri.
  SELECT count(*) INTO n_yatim
    FROM menu_items g
   WHERE g.parent_id IS NULL
     AND g.is_active
     AND (g.href IS NULL OR g.href = '')
     AND NOT EXISTS (
       SELECT 1 FROM menu_items a WHERE a.parent_id = g.id AND a.is_active
     );

  IF n_yatim > 0 THEN
    RAISE EXCEPTION '362 gagal: masih ada % grup aktif tanpa isi dan tanpa href', n_yatim;
  END IF;

  RAISE NOTICE '362: g-sistem dinonaktifkan · nol grup kosong tersisa';
END $$;
