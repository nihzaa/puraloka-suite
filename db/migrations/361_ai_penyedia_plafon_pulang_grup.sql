-- ============================================================================
-- 361 — Penyedia AI & Plafon Asisten terdampar di grup Administrasi
-- ============================================================================
--
-- ── Yang founder lihat, 2026-08-14
--
--   "di grup ai &OTomasi itu jarak kanan kirinya masih belum sama kaya yg lain"
--
-- Yang ia tunjuk terlihat di tangkapan layarnya: **Penyedia Layanan** dan
-- **Plafon Asisten** muncul di bawah "Layanan & Plaf…" — grup lain, jauh dari
-- AI & Otomasi, dengan indentasi berbeda.
--
-- Diukur:
--
--   ai-penyedia         induk g-sistem   urut 1621
--   ai-plafon-setujui   induk g-sistem   urut 1622
--   ai-asisten .. ai-riwayat             urut 187-195, induk g-ai
--
-- Keduanya BER-PREFIX `ai-`, halamannya di `/pengaturan/penyedia-ai` dan
-- `/pengaturan/plafon-asisten`, dan seluruh isinya soal asisten AI — tetapi
-- induknya `g-sistem`.
--
-- ── Kenapa ini lebih dari sekadar salah tempat
--
-- Halaman "Penyedia AI" adalah tempat kunci API dan batas biaya diatur, dan
-- `PanduanHalaman` di halaman Asisten menyebutnya eksplisit: *"Modelnya
-- sendiri (dan batas biayanya) diatur di halaman Penyedia AI."*
--
-- Petunjuk yang menyuruh orang ke halaman yang ada di GRUP LAIN, tanpa
-- menyebut grupnya, adalah petunjuk yang menyesatkan — dan founder memang
-- menemukannya sendiri saat mencari.
--
-- ── Urutannya ikut ditata, bukan sekadar dipindah
--
-- Ditaruh SESUDAH `ai-asisten` karena begitulah urutan kerjanya: nyalakan
-- asisten dulu, baru pilih model & batas biayanya. Plafon persetujuan menyusul
-- karena ia keputusan yang hanya masuk akal sesudah asistennya hidup.
-- ============================================================================

DO $$
DECLARE
  v_gai   uuid;
  n_ai    int;
  n_sisa  int;
BEGIN
  SELECT id INTO v_gai FROM menu_items WHERE key = 'g-ai';
  IF v_gai IS NULL THEN
    RAISE EXCEPTION '361 gagal: grup ''g-ai'' tidak ditemukan';
  END IF;

  UPDATE menu_items SET parent_id = v_gai, sort_order = 188, updated_at = now()
   WHERE key = 'ai-penyedia';
  UPDATE menu_items SET parent_id = v_gai, sort_order = 196, updated_at = now()
   WHERE key = 'ai-plafon-setujui';

  -- Tak boleh ada lagi item ber-prefix `ai-` di luar grupnya. Yang tertinggal
  -- tak menghasilkan galat — ia hanya muncul di tempat yang tak dicari orang.
  SELECT count(*) INTO n_sisa
    FROM menu_items a LEFT JOIN menu_items b ON b.id = a.parent_id
   WHERE a.key LIKE 'ai-%' AND a.is_active
     AND (b.key IS DISTINCT FROM 'g-ai');
  IF n_sisa <> 0 THEN
    RAISE EXCEPTION '361 gagal: % item ai-* masih di luar grup g-ai', n_sisa;
  END IF;

  SELECT count(*) INTO n_ai FROM menu_items WHERE parent_id = v_gai AND is_active;
  RAISE NOTICE '361: AI & Otomasi kini % item aktif', n_ai;
END $$;
