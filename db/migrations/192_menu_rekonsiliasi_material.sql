-- ════════════════════════════════════════════════════════════════════════════
-- 192 — Menu "Rekonsiliasi Material" menunjuk halaman nyata
--
-- `iv-rekonsiliasi` sudah ada sejak triase sub-menu, tapi href-nya `/m/…` —
-- halaman placeholder yang menjelaskan bahwa fiturnya belum digarap.
--
-- Halamannya kini ada (F5 PEMBEDA: rekonsiliasi material, pembeda paling
-- lemah 1,5/5). Menu diarahkan ke sana, dan penjaga triase sub-menu tak lagi
-- menghitungnya sebagai "belum digarap".
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items
   SET href = '/gudang/rekonsiliasi'
 WHERE key = 'iv-rekonsiliasi';
