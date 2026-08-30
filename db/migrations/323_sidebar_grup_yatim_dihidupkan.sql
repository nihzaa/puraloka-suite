-- ============================================================================
-- 323 — SIDEBAR: 18 item menggantung karena INDUKNYA dimatikan
-- ============================================================================
--
-- Founder mengirim tangkapan layar: *"kok ini masih ada yg diluar grup"* —
-- "Rencana Mutu Proyek", "Hasil Uji Material", "Audit Mutu", "Plafon Asisten",
-- dan "Penyedia Layanan" berdiri sendiri tanpa induk di sidebar.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA SELURUH PENGUKURAN SAYA BUTA TERHADAP INI
-- ══════════════════════════════════════════════════════════════════════════
--
-- Setiap kueri audit sidebar yang saya tulis menyaring `g.is_active` — termasuk
-- penjaga `audit-sidebar-urutan` (migrasi 319/320). Item yang induknya MATI
-- karena itu tak pernah masuk hitungan sama sekali.
--
-- Diukur sesudah founder menunjukkannya: **18 item aktif bergantung pada 5 grup
-- akar yang `is_active = false`.**
--
--     g-qaqc   "Mutu (QA/QC)"        3 item
--     g-hse    "K3 & Lingkungan"     3 item
--     g-hr     "SDM & Payroll"       7 item
--     g-risiko "Risiko & Kepatuhan"  3 item
--     g-sistem "Administrasi"        2 item
--
-- Sidebar tetap merender anaknya karena penyaringnya per-baris, bukan per-pohon
-- — jadi mereka muncul sebagai item lepas di bawah grup terakhir yang kebetulan
-- berdekatan `sort_order`. Itulah yang founder lihat.
--
-- **Kedelapan belas halamannya ADA** — diperiksa satu per satu di
-- `app/(dashboard)`. Ini bukan menu ke halaman kosong; ini 18 halaman jadi yang
-- kehilangan jalan masuk yang benar.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KEPUTUSAN FOUNDER: HIDUPKAN KEMBALI KELIMA GRUPNYA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Alternatifnya (memindahkan ke grup aktif) akan membengkakkan "Mutu & K3"
-- jadi 14 item. Founder memilih tiap item kembali ke rumah aslinya.
--
-- ── Dua tabrakan NAMA yang harus ikut diselesaikan
--
-- Menghidupkan apa adanya akan menaruh dua pasang nama membingungkan
-- berdampingan di sidebar:
--
--     "Mutu & K3"     (aktif)  vs  "Mutu (QA/QC)"   ← keduanya soal mutu
--     "Administrasi"  (aktif)  vs  "Administrasi"   ← SAMA PERSIS
--
-- Yang kedua terutama: dua grup bernama identik membuat mustahil menebak isi
-- mana yang mana sebelum diklik. Diganti menurut ISI-nya, bukan kategorinya:
--
--     "Mutu (QA/QC)"  → "Rencana & Uji Mutu"   (rencana mutu, uji material, audit)
--     "Administrasi"  → "Layanan & Plafon AI"  (plafon asisten, penyedia layanan)
--
-- ── Tiga `sort_order` grup yang bentrok
--
-- g-qaqc 1000 bentrok "Mutu & K3"; g-hse 1100 bentrok "Keuangan";
-- g-hr 1200 bentrok "Akuntansi". Ditempatkan ulang supaya yang serumpun
-- berdekatan:
--
--     850   SDM & Payroll        ← sesudah Mandor & Subkon (800); keduanya orang
--    1010   Rencana & Uji Mutu   ← sesudah Mutu & K3 (1000)
--    1020   K3 & Lingkungan
--    1030   Risiko & Kepatuhan
--    1620   Layanan & Plafon AI  ← sesudah Administrasi (1600)
--
-- Anak-anaknya ikut dinomori ulang ke `gso+1..gso+99` — konvensi yang diukur di
-- migrasi 320 dan kini dijaga `audit-sidebar-urutan`.
-- ============================================================================

DO $$
BEGIN
  -- ── 1. Grup dihidupkan + ditempatkan + dinamai ulang ─────────────────────
  UPDATE menu_items SET is_active = true, sort_order =  850, updated_at = now() WHERE key = 'g-hr';
  UPDATE menu_items SET is_active = true, sort_order = 1010, label = 'Rencana & Uji Mutu',  updated_at = now() WHERE key = 'g-qaqc';
  UPDATE menu_items SET is_active = true, sort_order = 1020, updated_at = now() WHERE key = 'g-hse';
  UPDATE menu_items SET is_active = true, sort_order = 1030, updated_at = now() WHERE key = 'g-risiko';
  UPDATE menu_items SET is_active = true, sort_order = 1620, label = 'Layanan & Plafon AI', updated_at = now() WHERE key = 'g-sistem';

  -- ── 2. Anak dinomori ulang ke rentang induknya ───────────────────────────
  --
  -- Urutan RELATIF dipertahankan persis seperti sebelumnya — yang berubah
  -- hanya basisnya, supaya `audit-sidebar-urutan` tak merah dan grup
  -- berikutnya tak menabrak rentang ini.

  -- SDM & Payroll (850): timesheet → cuti → payroll → kompetensi,
  -- lalu tiga halaman PENGATURAN payroll di belakangnya.
  UPDATE menu_items SET sort_order = 851, updated_at = now() WHERE href = '/sdm/timesheet' AND is_active;
  UPDATE menu_items SET sort_order = 852, updated_at = now() WHERE href = '/sdm/cuti' AND is_active;
  UPDATE menu_items SET sort_order = 853, updated_at = now() WHERE href = '/sdm/payroll' AND is_active;
  UPDATE menu_items SET sort_order = 854, updated_at = now() WHERE href = '/sdm/kompetensi' AND is_active;
  UPDATE menu_items SET sort_order = 855, updated_at = now() WHERE href = '/pengaturan/tarif-payroll' AND is_active;
  UPDATE menu_items SET sort_order = 856, updated_at = now() WHERE href = '/pengaturan/markup' AND is_active;
  UPDATE menu_items SET sort_order = 857, updated_at = now() WHERE href = '/pengaturan/api-key' AND is_active;

  -- Rencana & Uji Mutu (1010)
  UPDATE menu_items SET sort_order = 1011, updated_at = now() WHERE href = '/mutu/rencana' AND is_active;
  UPDATE menu_items SET sort_order = 1012, updated_at = now() WHERE href = '/mutu/uji-material' AND is_active;
  UPDATE menu_items SET sort_order = 1013, updated_at = now() WHERE href = '/mutu/audit' AND is_active;

  -- K3 & Lingkungan (1020): inspeksi lebih dulu — ia ringkasan modulnya.
  UPDATE menu_items SET sort_order = 1021, updated_at = now() WHERE href = '/k3' AND is_active;
  UPDATE menu_items SET sort_order = 1022, updated_at = now() WHERE href = '/k3/jsa' AND is_active;
  UPDATE menu_items SET sort_order = 1023, updated_at = now() WHERE href = '/k3/insiden' AND is_active;

  -- Risiko & Kepatuhan (1030)
  UPDATE menu_items SET sort_order = 1031, updated_at = now() WHERE href = '/risiko' AND is_active;
  UPDATE menu_items SET sort_order = 1032, updated_at = now() WHERE href = '/risiko/izin' AND is_active;
  UPDATE menu_items SET sort_order = 1033, updated_at = now() WHERE href = '/risiko/sengketa' AND is_active;

  -- Layanan & Plafon AI (1620)
  UPDATE menu_items SET sort_order = 1621, updated_at = now() WHERE href = '/pengaturan/penyedia' AND is_active;
  UPDATE menu_items SET sort_order = 1622, updated_at = now() WHERE href = '/pengaturan/plafon-asisten' AND is_active;
END $$;

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
--
-- Memeriksa yang benar-benar menentukan:
--   1. NOL item aktif yang induknya mati  ← cacat yang memicu migrasi ini
--   2. nol tabrakan sort_order (grup DAN anak)
--   3. semua anak di rentang gso+1..gso+99
--   4. nol grup akar aktif bernama SAMA
--   5. kelima grup benar-benar hidup dengan anak lengkap
DO $$
DECLARE
  n_yatim   INT;
  n_bentrok INT;
  n_luar    INT;
  n_kembar  INT;
  n_grup    INT;
BEGIN
  SELECT count(*) INTO n_yatim
    FROM menu_items i JOIN menu_items g ON g.id = i.parent_id
   WHERE i.is_active AND NOT g.is_active;
  /*
    DITURUNKAN JADI CATATAN 2026-08-31 — dulu RAISE EXCEPTION.

    Pemeriksaan ini menyapu SELURUH pohon menu, bukan yang migrasi ini ubah,
    jadi ia gagal atas item yang ditambahkan migrasi SESUDAHNYA:

        HARD FAIL — 323_sidebar_grup_yatim_dihidupkan.sql
          323 verifikasi gagal: 2 anak di luar rentang gso+1..gso+99

    Pesan yang sama persis dengan yang memerahkan 320 satu putaran CI
    sebelumnya — dan sebabnya sama: migrasi menjaga invarian yang berlaku
    selamanya, padahal ia hanya bisa menjamin keadaan pada detik ia jalan.

    Invariannya TIDAK dilepas. Ketiganya dijaga penjaga CI yang HIDUP —
    `audit-sidebar-urutan.mjs` (rentang & tabrakan) dan `audit-nav-yatim.mjs`
    (induk mati) — yang berjalan pada SETIAP push dan melihat keadaan hari
    ini, bukan potret satu migrasi.

    Yang tetap RAISE EXCEPTION di bawah adalah pekerjaan migrasi ini sendiri:
    grup yang ia hidupkan benar-benar hidup.
  */
  IF n_yatim > 0 THEN
    RAISE NOTICE '323: % item aktif berinduk MATI di pohon — dijaga audit-nav-yatim', n_yatim;
  END IF;

  SELECT count(*) INTO n_bentrok FROM (
    SELECT i.parent_id, i.sort_order
      FROM menu_items i JOIN menu_items g ON g.id = i.parent_id
     WHERE i.is_active AND g.is_active
     GROUP BY i.parent_id, i.sort_order HAVING count(*) > 1
    UNION ALL
    SELECT NULL, sort_order FROM menu_items
     WHERE parent_id IS NULL AND is_active
     GROUP BY sort_order HAVING count(*) > 1) t;
  IF n_bentrok > 0 THEN
    RAISE NOTICE '323: % sort_order bentrok di pohon — dijaga audit-sidebar-urutan', n_bentrok;
  END IF;

  SELECT count(*) INTO n_luar
    FROM menu_items g JOIN menu_items i ON i.parent_id = g.id AND i.is_active
   WHERE g.parent_id IS NULL AND g.is_active
     AND (i.sort_order <= g.sort_order OR i.sort_order > g.sort_order + 99);
  IF n_luar > 0 THEN
    RAISE NOTICE '323: % anak di luar rentang gso+1..gso+99 — dijaga audit-sidebar-urutan', n_luar;
  END IF;

  SELECT count(*) INTO n_kembar FROM (
    SELECT label FROM menu_items WHERE parent_id IS NULL AND is_active
     GROUP BY label HAVING count(*) > 1) t;
  IF n_kembar > 0 THEN
    RAISE EXCEPTION '323 verifikasi gagal: % nama grup akar kembar', n_kembar;
  END IF;

  SELECT count(*) INTO n_grup FROM menu_items
   WHERE key IN ('g-qaqc','g-hse','g-hr','g-risiko','g-sistem') AND is_active;
  IF n_grup <> 5 THEN
    RAISE EXCEPTION '323 verifikasi gagal: % dari 5 grup hidup', n_grup;
  END IF;

  RAISE NOTICE '323 OK — grup yang dihidupkan migrasi ini benar-benar hidup. Di pohon: % yatim, % bentrok, % di luar rentang (ketiganya dijaga penjaga CI)', n_yatim, n_bentrok, n_luar;
END $$;
