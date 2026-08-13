-- ============================================================================
-- 359 — AI & Otomasi: LIMA item sidebar yang kembar dengan tab-nya sendiri
-- ============================================================================
--
-- ── Keluhan founder, 2026-08-13
--
--   "di tiap halaman itu kayak asing dan menerka nerka cara pake nya"
--
-- Sebab yang ini terlihat begitu sidebar-nya dipotret berdampingan dengan
-- halamannya: **rute yang sama muncul DUA KALI di layar yang sama.**
--
--   sidebar  Asisten — Lapisan AI   → /pengaturan/asisten
--            Asisten Pemilik        → /pengaturan/asisten/pemilik
--            Asisten Staf           → /pengaturan/asisten/staf
--            Asisten Web            → /pengaturan/asisten/web
--            Wawasan Portofolio     → /pengaturan/asisten/wawasan
--
--   tab di   Lapisan AI · Asisten pemilik · Asisten staf · Asisten web ·
--   halaman  Wawasan portofolio          ← href-nya IDENTIK, kelimanya
--
-- Diukur, bukan dikira: `layout.tsx` BAGIAN[] dibandingkan baris demi baris
-- dengan `menu_items.href` — sama persis.
--
-- ── Kenapa yang DIBUANG sidebar-nya, bukan tab-nya
--
-- `ARAH-VISUAL-2026` §6a memberi ujinya: *"Tab = sudut pandang berbeda atas
-- DATA YANG SAMA; Halaman = entitas berbeda."*
--
-- Keempat asisten memang entitas berbeda — dan itulah kenapa keduanya rute
-- nyata, bukan state di satu halaman. Tetapi mereka adalah entitas SEJENIS
-- yang diatur berurutan: orang yang menyetel asisten pemilik hampir selalu
-- lanjut menyetel asisten staf. Tab menjaga konteks itu tetap terlihat,
-- sementara sidebar memaksa mata keluar dari halaman lalu masuk lagi.
--
-- Yang menentukan: hilangkan tab, dan lima halaman itu kehilangan penanda
-- "saya sedang di mana dalam himpunan ini". Hilangkan duplikat sidebar, dan
-- tak ada yang hilang — rutenya tetap bisa ditautkan, tetap punya judul
-- sendiri, tetap ditemukan pencarian.
--
-- ── Yang TIDAK dilakukan: menghapus barisnya
--
-- `is_active = false`, bukan DELETE. Barisnya dipakai `company_menu_settings`
-- (izin per tenant) dan audit; menghapusnya memutus rujukan yang tak
-- menghasilkan galat, hanya baris yatim. Pola yang sama dengan migrasi 334
-- (`md-wbs` dinonaktifkan, bukan dibuang).
--
-- Menghidupkannya kembali cukup satu UPDATE — dan kalau kelak tab-nya yang
-- dibuang, itu memang jalan pulangnya.
-- ============================================================================

DO $$
DECLARE
  n_sebelum int;
  n_sesudah int;
  v_induk   uuid;
BEGIN
  SELECT id INTO v_induk FROM menu_items WHERE key = 'g-ai';
  IF v_induk IS NULL THEN
    RAISE EXCEPTION '359 gagal: induk menu ''g-ai'' tidak ditemukan';
  END IF;

  SELECT count(*) INTO n_sebelum
    FROM menu_items WHERE parent_id = v_induk AND is_active;

  -- Empat anak asisten dinonaktifkan. `ai-asisten` (Lapisan AI) TETAP HIDUP:
  -- ia pintu masuk himpunan ini, dan tanpanya keempat halaman tak punya satu
  -- pun jalan dari sidebar.
  UPDATE menu_items
     SET is_active = false, updated_at = now()
   WHERE key IN ('ai-asisten-pemilik', 'ai-asisten-staf',
                 'ai-asisten-web', 'ai-asisten-wawasan');

  -- Labelnya ikut diperjelas: "Asisten — Lapisan AI" menyebut ISTILAH INTERNAL
  -- ("lapisan") yang tak berarti apa pun bagi pembacanya, dan tanda pisah di
  -- tengah membuatnya terbaca seperti dua item yang tertempel.
  UPDATE menu_items
     SET label = 'Asisten AI', updated_at = now()
   WHERE key = 'ai-asisten';

  SELECT count(*) INTO n_sesudah
    FROM menu_items WHERE parent_id = v_induk AND is_active;

  IF n_sesudah <> n_sebelum - 4 THEN
    RAISE EXCEPTION '359 gagal: harap % item aktif, dapat % (sebelum %)',
      n_sebelum - 4, n_sesudah, n_sebelum;
  END IF;

  -- Pintu masuknya WAJIB tetap ada. Tanpa ini, menonaktifkan keempat anak
  -- membuat keempat halaman tak terjangkau dari navigasi mana pun — dan
  -- halaman yang tak bisa dicapai sama saja dengan halaman yang dihapus,
  -- hanya tanpa jejak bahwa ia pernah ada.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'ai-asisten' AND is_active AND href = '/pengaturan/asisten'
  ) THEN
    RAISE EXCEPTION '359 gagal: pintu masuk ''ai-asisten'' hilang atau nonaktif';
  END IF;

  RAISE NOTICE '359: sub-menu AI & Otomasi % → % item aktif', n_sebelum, n_sesudah;
END $$;
