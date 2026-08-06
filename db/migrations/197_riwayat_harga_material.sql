-- ════════════════════════════════════════════════════════════════════════════
-- 197 — Riwayat Harga Material (semula "Eskalasi Harga")
--
-- ── Kenapa NAMANYA berubah, bukan cuma href-nya
--
-- Triase menamainya "Eskalasi Harga" — kenaikan harga material terhadap
-- kontrak lama. Diukur pada data nyata 2026-08-06, arahnya KEBALIKANNYA:
--
--   Besi Beton Ø12mm SNI   17 Mar  120.000  →  04 Agu  100.000   TURUN 16,7%
--   Besi Beton Ø10mm SNI   17 Mar   85.000  →  04 Agu   80.000   TURUN  5,9%
--
-- Saya sempat melaporkan material ini "+20%" karena menghitung `max − min`
-- tanpa memperhatikan urutan waktu. Rentangnya memang 20%, arahnya terbalik.
--
-- Layar bernama "Eskalasi" menjanjikan kenaikan; pembacanya akan menyimpulkan
-- kenaikan bahkan saat angkanya turun. Nama menu ikut diperbaiki supaya
-- janjinya sama dengan isinya.
--
-- ── Kenapa TIDAK ada tabel baru
--
-- Seluruh datanya sudah ada di `purchase_order_items` + `purchase_orders`.
-- Menyalinnya ke tabel riwayat tersendiri menciptakan sumber kebenaran kedua
-- yang bisa berselisih dengan PO-nya — dan yang paling berkepentingan
-- menyunting riwayat harga adalah orang yang keputusannya sedang dinilai.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items
   SET label = 'Riwayat Harga Material',
       href  = '/procurement/riwayat-harga'
 WHERE key = 'crm-eskalasi';
