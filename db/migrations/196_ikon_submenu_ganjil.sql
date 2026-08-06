-- ════════════════════════════════════════════════════════════════════════════
-- 196 — Satu sub-menu yang ganjil sendirian ikonnya
--
-- ── Yang diukur (2026-08-06)
--
--   34 grup induk  : 34 ber-ikon         (100%)
--   217 sub-menu   : 13 ber-ikon, 204 memakai titik ("Dot")
--
-- 204 titik itu BUKAN kelalaian, dan tidak diubah. Sub-menu dibaca sebagai
-- daftar di bawah grup yang sudah punya ikon; memberi 204 ikon berbeda justru
-- merusak — mata kehilangan jangkar, dan pada grup berisi 18 anak, 18 ikon
-- berbeda menjadi bising. Titik berfungsi sebagai penanda hierarki.
--
-- Dari 13 yang ber-ikon, dua kelompok memang SERAGAM dan dibiarkan:
--
--   Keuangan    3 dari 3 anak ber-ikon
--   Pengaturan  9 dari 9 anak ber-ikon
--
-- Yang ganjil hanya SATU: `kt-rfi` ("Request for Information") ber-ikon
-- sendirian di antara 12 saudara yang memakai titik. Satu ikon di tengah
-- daftar titik menarik mata ke item yang tak lebih penting daripada
-- tetangganya — persis kebalikan dari gunanya ikon.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items
   SET icon = 'Dot'
 WHERE key = 'kt-rfi'
   AND icon <> 'Dot';
