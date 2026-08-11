-- ════════════════════════════════════════════════════════════════════════════
-- 281 — Menu Mutu: dua halaman jadi tak terjangkau, empat entri berlebih
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Cacat yang diperbaiki
--
-- Diukur 2026-08-11, sesudah `audit-nav-yatim.mjs` merah:
--
--     KETUJUH menu `qc-*` berhref `/m/<key>` DAN `is_active = false`.
--
-- Dua di antaranya punya halaman yang benar-benar hidup dan TAK PUNYA
-- tautan lain ke sana — `audit-nav-yatim.mjs` menamainya:
--
--     qc-uji        → /mutu/uji-material   (G1d, di-commit 439a5dc)
--     qc-rencana    → /mutu/rencana        (G1e — migrasi ini)
--
-- Empat sisanya TIDAK diberi tautan sendiri; alasannya di blok berikutnya.
--
-- `/m/<key>` adalah halaman placeholder yang MENYATAKAN fiturnya belum
-- digarap. Jadi seandainya menunya aktif, pengguna yang mengkliknya akan
-- mendarat di layar yang mengatakan fitur itu belum ada — padahal ada.
-- Karena `is_active = false`, yang terjadi justru lebih senyap: halamannya
-- tak muncul di mana pun, dan hanya bisa dibuka dengan mengetik URL.
--
-- ── Kenapa saya sendiri melewatkannya sampai penjaga berbunyi
--
-- Saya memperbarui `apps/web/lib/peta-menu.ts` di tiap commit G1b–G1e dan
-- menganggap status menunya beres. `peta-menu.ts` adalah dokumentasi status
-- per sub-menu — BUKAN sumber sidebar. Sidebar dibaca dari tabel `menu_items`
-- di basis, dan keduanya tak saling memeriksa.
--
-- Dua sumber yang menjawab pertanyaan berbeda dengan nama yang mirip: yang
-- satu berkata "Hasil Uji Material sudah hidup", yang lain mengarahkan
-- penggunanya ke halaman "belum digarap". Keduanya konsisten dengan dirinya
-- sendiri, dan tak ada satu pun galat.
--
-- Yang menangkapnya `audit-nav-yatim.mjs` (lahir bersama migrasi 220, dari
-- kelas cacat yang SAMA PERSIS pada 20 menu lain). Penjaga itu bekerja; yang
-- gagal adalah saya tak menjalankannya sampai sesudah commit G1d.
--
-- ── Idempoten
--
-- `UPDATE ... WHERE key = ...` menetapkan nilai akhir, bukan menambah.
-- Dijalankan berapa kali pun hasilnya sama.
-- ════════════════════════════════════════════════════════════════════════════

-- ── G1d ────────────────────────────────────────────────────────────────────
UPDATE menu_items SET href = '/mutu/uji-material' WHERE key = 'qc-uji';

-- ── G1e ────────────────────────────────────────────────────────────────────
UPDATE menu_items SET href = '/mutu/rencana'      WHERE key = 'qc-rencana';

-- ── EMPAT yang TIDAK diberi tautan sendiri, dan kenapa ─────────────────────
--
-- Percobaan pertama migrasi ini mengarahkan `qc-capa` → /mutu/ncr,
-- `qc-itp` → /mutu/rencana, `qc-checklist` → /lapangan/inspeksi, dan
-- menyalakan `qc-ncr` → /mutu/ncr. `audit-menu-berbagi-href.mjs`
-- merahkannya, dan aturannya tegas sejak migrasi 232:
-- **SATU route = SATU link sidebar.**
--
-- `qc-ncr` khususnya: diukur saat memperbaiki ini, ternyata **`mutu-ncr`
-- SUDAH ADA dan AKTIF** menunjuk /mutu/ncr — itulah tautan sidebar NCR
-- selama ini. Menyalakan `qc-ncr` menjadikannya item KETIGA untuk halaman
-- yang sama (bersama `lp-ncr` yang nonaktif). Taksonomi punya tiga entri
-- untuk satu halaman karena tiga peran mencarinya di tempat berbeda —
-- dan itu persis yang aturan 232 larang.
--
-- Alasannya bukan kerapian: dua item yang menunjuk halaman sama akan
-- MENYALA BERSAMAAN saat halaman itu dibuka, sehingga sidebar menyatakan
-- pengguna berada di dua tempat sekaligus. Dan pengguna yang mengklik
-- "Inspection & Test Plan" lalu mendarat di halaman berjudul "Rencana Mutu
-- Proyek" akan mengira ia salah klik.
--
-- Ketiganya memang BUKAN halaman tersendiri:
--
--   qc-capa       Tindakan korektif adalah TAHAP dalam siklus hidup NCR
--                 (akar masalah → perbaikan → penugasan → verifikasi),
--                 bukan entitas lain. ARAH-VISUAL-2026 §6a: halaman untuk
--                 entitas berbeda, bukan untuk tahap berbeda dari entitas
--                 yang sama.
--   qc-itp        ITP adalah ISI dari Rencana Mutu. Memisahkannya memaksa
--                 pengguna berpindah halaman untuk membaca satu dokumen.
--   qc-checklist  Butir checklist lahir dari inspeksi dan mati bersamanya;
--                 ia dibaca di detail inspeksinya. Daftar butir
--                 lintas-inspeksi tak menjawab pertanyaan siapa pun
--                 (alasan lengkap di routes/v1/mutu.ts).
--
-- Karena itu ketiganya DINONAKTIFKAN dari sidebar, bukan diarahkan. Isinya
-- tetap terjangkau — lewat halaman induknya, dan lewat /peta-modul yang
-- memang ada untuk mendaftar seluruh kemampuan.
UPDATE menu_items SET is_active = FALSE
 WHERE key IN ('qc-capa', 'qc-itp', 'qc-checklist', 'qc-ncr');

-- `qc-audit` (Audit Mutu) SENGAJA dibiarkan menunjuk `/m/qc-audit`:
-- halamannya memang belum ada (G1f). Mengarahkannya sekarang akan membuat
-- kebalikan dari cacat di atas — menu yang menjanjikan halaman yang tak ada.

-- ── Dan menyalakannya: href yang benar tak berguna kalau menunya mati ──────
--
-- Memperbaiki href saja tak mengubah apa pun yang dilihat pengguna —
-- sidebar membaca `WHERE is_active`, dan ketujuh menu `qc-*` mati.
--
-- `is_active = false` adalah sisa dari status `gerbang` sebelum R-011
-- (2026-08-11) mencabut seluruh larangan bangun. Larangannya dicabut,
-- halamannya dibangun, tetapi saklarnya tak pernah ikut dinyalakan.
--
-- Ini pasangan dari cacat href di atas, dan bentuknya sama: dua sumber yang
-- masing-masing konsisten dengan dirinya sendiri, tak ada galat, dan
-- hasilnya fitur yang sudah jadi tetap tak terlihat.
UPDATE menu_items SET is_active = TRUE
 WHERE key IN ('qc-uji', 'qc-rencana');

-- `qc-audit` tetap NONAKTIF — halamannya belum ada. Dinyalakan di G1f.
-- `qc-capa`, `qc-itp`, `qc-checklist`, `qc-ncr` juga nonaktif — lihat blok
-- di atas. NCR tetap terjangkau lewat `mutu-ncr` yang sudah aktif.

-- ------------------------------------------------------------
-- Verifikasi — migrasi gagal keras kalau tak ada yang berubah.
-- ------------------------------------------------------------
DO $$
DECLARE
  sisa INT;
BEGIN
  SELECT count(*) INTO sisa
    FROM menu_items
   WHERE key IN ('qc-uji', 'qc-rencana')
     AND (href IS NULL OR href LIKE '/m/%');

  IF sisa > 0 THEN
    RAISE EXCEPTION '281 gagal: % menu mutu masih menunjuk halaman "belum digarap"', sisa;
  END IF;

  -- href benar tapi menu mati = tak ada yang berubah bagi pengguna.
  SELECT count(*) INTO sisa
    FROM menu_items
   WHERE key IN ('qc-uji', 'qc-rencana')
     AND is_active IS NOT TRUE;

  IF sisa > 0 THEN
    RAISE EXCEPTION '281 gagal: % menu mutu masih nonaktif — href benar tapi tak terlihat', sisa;
  END IF;

  -- SATU route = SATU link sidebar (aturan sejak migrasi 232). Dua item aktif
  -- yang menunjuk halaman sama akan menyala bersamaan.
  SELECT count(*) INTO sisa
    FROM (SELECT href FROM menu_items
           WHERE is_active AND href IS NOT NULL AND href LIKE '/mutu/%'
           GROUP BY href HAVING count(*) > 1) d;

  IF sisa > 0 THEN
    RAISE EXCEPTION '281 gagal: % href /mutu/* dipakai lebih dari satu menu aktif', sisa;
  END IF;

  RAISE NOTICE '281 OK — 2 menu mutu baru aktif, tiap href /mutu/* dipegang satu menu';
END $$;
