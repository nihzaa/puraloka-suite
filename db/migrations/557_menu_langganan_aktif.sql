-- ============================================================================
-- 557 — Menu Langganan diaktifkan kembali
-- ============================================================================
--
-- Migrasi 552 menyisipkan menu `pengaturan-langganan` dengan `is_active = true`
-- (baris 64, terbaca jelas di sumbernya). Diukur 2026-09-01, barisnya
-- `is_active = false` — dan `audit-nav-yatim.mjs` merahkannya:
--
--     ❌ YATIM — halaman tanpa satu pun tautan nav
--          /pengaturan/langganan
--
-- Halaman itu ADA dan berfungsi; yang hilang cuma pintunya. Dan halaman INI
-- khususnya tak boleh yatim: ia yang dituju pesan "akun dibatasi" dan halaman
-- modul terkunci — orang yang sampai ke sana sedang mencari jalan keluar,
-- bukan sedang menjelajah.
--
-- ── Kenapa bisa nonaktif, dan kenapa saya TIDAK mengarangnya
--
-- Saya tak tahu pasti. Yang terukur:
--
--   · migrasi 552 menulis `true`
--   · barisnya `false`
--   · `updated_at` = 16:56, jam yang sama ia disisipkan — tak ada jejak
--     perubahan sesudahnya
--   · 277 dari 420 menu berstatus nonaktif; menu ini satu di antaranya
--
-- Rantai migrasi 164-tertinggal baru dijalankan sesi lain sore itu, dan
-- sebagian migrasi lama memang menonaktifkan menu secara massal. Menu ini
-- kemungkinan ikut tersapu salah satunya.
--
-- Yang TIDAK saya lakukan: menebak migrasi mana lalu menyalahkannya di
-- komentar. Tebakan yang ditulis sebagai fakta persis racun konteks yang
-- dilarang pembuka CLAUDE.md — dan sesi berikutnya akan mempercayainya.
--
-- Yang bisa dipastikan: keadaan yang BENAR adalah aktif, dan migrasi ini
-- memulihkannya. Kalau ia mati lagi sesudah ini, penyebabnya berjalan
-- SESUDAH migrasi ini — dan itu informasi yang lebih berguna daripada
-- tebakan hari ini.

UPDATE menu_items
   SET is_active = true
 WHERE key = 'pengaturan-langganan'
   AND is_active = false;

-- ============================================================================
-- VERIFIKASI
-- ============================================================================
DO $$
DECLARE v_aktif BOOLEAN; v_href TEXT; v_induk UUID;
BEGIN
  SELECT is_active, href, parent_id INTO v_aktif, v_href, v_induk
    FROM menu_items WHERE key = 'pengaturan-langganan';

  IF v_aktif IS NULL THEN
    RAISE EXCEPTION '557 gagal: menu pengaturan-langganan TIDAK ADA. Migrasi 552 belum jalan?';
  END IF;
  IF NOT v_aktif THEN
    RAISE EXCEPTION '557 gagal: menu masih nonaktif sesudah UPDATE';
  END IF;

  -- Menu aktif yang tak punya induk akan muncul di level TERATAS sidebar —
  -- terlihat seperti bug acak, bukan seperti perbaikan.
  IF v_induk IS NULL THEN
    RAISE EXCEPTION '557 gagal: menu aktif tanpa induk — akan muncul di level teratas';
  END IF;

  IF v_href IS DISTINCT FROM '/pengaturan/langganan' THEN
    RAISE EXCEPTION '557 gagal: href = %, halamannya di /pengaturan/langganan', coalesce(v_href, '(null)');
  END IF;

  RAISE NOTICE '557 OK — menu Langganan aktif kembali, ber-induk, href benar';
END $$;
