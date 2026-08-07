-- ════════════════════════════════════════════════════════════════════════════
-- 222 — 13 anak menu naik ke tingkat atas karena induknya dimatikan
--
-- ── Cacat yang diperbaiki
--
-- Migrasi 153 mengganti seluruh struktur menu dengan taksonomi 20 kelompok, dan
-- menonaktifkan kelompok lama (`keuangan`, `pengaturan`). Tapi **anak-anaknya
-- dibiarkan aktif**. Karena `routes/v1/menu.ts:115` menaikkan anak yang induknya
-- tak ada ke root, ketiga belas anak itu muncul **sejajar dengan 20 kelompok
-- besar** di tingkat teratas sidebar:
--
--     Beranda                    ← item lepas, memang disengaja
--     Invoice & Bayar            ← seharusnya di dalam kelompok Penagihan
--     Piutang                    ← seharusnya di dalam kelompok Penagihan
--     Kas & Pengeluaran          ← seharusnya di dalam kelompok Keuangan
--     Master Data       (18) ▾
--     Pra-Konstruksi    (13) ▾
--     ...
--
-- Sidebar jadi mencampur dua tingkat hierarki dalam satu daftar: tiga item
-- sempit di antara kelompok-kelompok besar, tanpa alasan yang bisa dilihat
-- pengguna. Terlihat seperti pengelompokan yang gagal — dan memang begitu.
--
-- Ini juga sumber "label ganda" yang terhitung di audit navigasi: "Badan Usaha"
-- muncul dua kali (`pengaturan-perusahaan` yatim + `md-perusahaan` di Master
-- Data), begitu pula "Aturan Notifikasi" dan "Konfigurasi Keuangan".
--
-- ── Kenapa diperbaiki di DATA, bukan di kode
--
-- `routes/v1/menu.ts:110-113` sengaja membiarkan perilaku ini, dengan alasan
-- tertulis: mengubahnya saat itu berarti "menyelundupkan perubahan perilaku
-- yang tak diminta". Alasan itu benar pada waktunya.
--
-- Yang salah bukan aturan menaikkan-anak — itu justru jaring pengaman supaya
-- item tak lenyap diam-diam saat induknya hilang. Yang salah adalah **datanya**:
-- ada 13 anak yang induknya sudah dipensiunkan tiga puluh migrasi lalu dan tak
-- pernah dibereskan. Menambal di kode akan menyembunyikan data yang kotor.
--
-- ── Tiga kelompok tindakan, dibedakan dengan MENGUKUR bukan menebak
--
-- Untuk tiap anak yatim, ditanyakan: apakah href-nya sudah punya jalan masuk
-- lain yang aktif di kelompok baru?
--
--   A. PUNYA PADANAN (10) → dimatikan. Duplikat murni; padanannya tetap hidup.
--        keuangan-invoice      -> tg-invoice, tg-progress, tg-termin, ...
--        keuangan-piutang      -> fn-ar, tg-retensi, tg-followup, ...
--        keuangan-kas          -> fn-kas, fn-petty
--        pengaturan-profil     -> sy-modul
--        pengaturan-perusahaan -> md-perusahaan   ("Badan Usaha" ganda)
--        pengaturan-keuangan   -> md-pajak
--        pengaturan-satuan     -> md-satuan
--        pengaturan-approval   -> sy-approval, dk-approval
--        pengaturan-roles      -> sy-permission
--        pengaturan-notifikasi -> sy-notifikasi   ("Aturan Notifikasi" ganda)
--
--   B. TANPA PADANAN (3) → DIPINDAHKAN ke kelompok Administrasi, bukan
--      dimatikan. Mematikannya membuat halamannya YATIM — cacat yang baru saja
--      diberantas migrasi 220.
--        pengaturan-kategori         /pengaturan/kategori-pekerjaan
--        pengaturan-kasbon-purposes  /pengaturan/kasbon-purposes
--        pengaturan-situs            /pengaturan/situs
--
-- Ketiganya masuk `g-sistem` (Administrasi) — kelompok yang sudah memuat
-- Matriks Izin, Konfigurasi Approval, dan Audit Log, jadi sifatnya cocok.
--
-- ── Idempoten
--
-- Seluruhnya `UPDATE ... WHERE key = ...` yang menetapkan nilai akhir.
-- ════════════════════════════════════════════════════════════════════════════

-- ── A. Duplikat murni — dimatikan ───────────────────────────────────────────
--
-- Dinonaktifkan, TIDAK dihapus: `company_menu_settings.menu_key` bisa memuat
-- acuan ke key ini pada tenant yang sudah menyetelnya.
UPDATE menu_items SET is_active = false
 WHERE key IN (
   'keuangan-invoice', 'keuangan-piutang', 'keuangan-kas',
   'pengaturan-profil', 'pengaturan-perusahaan', 'pengaturan-keuangan',
   'pengaturan-satuan', 'pengaturan-approval', 'pengaturan-roles',
   'pengaturan-notifikasi');

-- ── B. Satu-satunya jalan masuk — dipindahkan ke Administrasi ───────────────
UPDATE menu_items
   SET parent_id  = (SELECT id FROM menu_items WHERE key = 'g-sistem'),
       section    = 'main',
       sort_order = 1911
 WHERE key = 'pengaturan-kategori';

UPDATE menu_items
   SET parent_id  = (SELECT id FROM menu_items WHERE key = 'g-sistem'),
       section    = 'main',
       sort_order = 1912
 WHERE key = 'pengaturan-kasbon-purposes';

UPDATE menu_items
   SET parent_id  = (SELECT id FROM menu_items WHERE key = 'g-sistem'),
       section    = 'main',
       sort_order = 1913
 WHERE key = 'pengaturan-situs';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_yatim   TEXT;
  v_hilang  TEXT;
BEGIN
  -- 1. Tak boleh ada lagi anak aktif yang induknya mati — itulah yang
  --    menaikkan mereka ke tingkat atas.
  SELECT string_agg(c.key, ', ' ORDER BY c.key) INTO v_yatim
    FROM menu_items c
    JOIN menu_items p ON p.id = c.parent_id
   WHERE c.is_active AND NOT p.is_active;

  IF v_yatim IS NOT NULL THEN
    RAISE EXCEPTION '222 gagal: masih ada anak aktif berinduk mati: %', v_yatim;
  END IF;

  -- 2. Ketiga halaman tanpa padanan WAJIB tetap punya jalan masuk aktif.
  --    Tanpa pemeriksaan ini, kelompok A dan B mudah tertukar saat disunting,
  --    dan halamannya jadi yatim tanpa satu pun galat.
  SELECT string_agg(h, ', ' ORDER BY h) INTO v_hilang
    FROM unnest(ARRAY[
      '/pengaturan/kategori-pekerjaan',
      '/pengaturan/kasbon-purposes',
      '/pengaturan/situs']) AS h
   WHERE NOT EXISTS (
     SELECT 1 FROM menu_items mi WHERE mi.is_active AND mi.href = h);

  IF v_hilang IS NOT NULL THEN
    RAISE EXCEPTION '222 gagal: halaman kehilangan jalan masuk: %', v_hilang;
  END IF;
END $$;
