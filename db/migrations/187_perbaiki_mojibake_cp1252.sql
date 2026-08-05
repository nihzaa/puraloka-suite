-- 187 — Memulihkan teks yang rusak encoding (mojibake CP1252)
--
-- ── Gejala
--
-- Nama proyek tampil sebagai "Pembangunan Rumah Bu Sari â€” Dago" di seluruh
-- aplikasi. Ditemukan saat memeriksa tangkapan layar dashboard, bukan dari
-- laporan galat — karena memang tak ada galat: datanya valid UTF-8, hanya
-- isinya yang salah. Ini kelas cacat yang bertahan lama justru karena tak
-- pernah membangunkan siapa pun.
--
-- ── Sebab
--
-- Teks UTF-8 pernah dibaca sebagai CP1252 lalu ditulis ulang sebagai UTF-8.
-- Em-dash "—" (byte E2 80 94) dibaca per-byte jadi tiga karakter CP1252
-- "â", "€", "”", lalu masing-masing di-encode ulang jadi UTF-8.
--
-- ── Kenapa REPLACE, bukan convert_from(convert_to(...))
--
-- Konversi menyeluruh adalah percobaan pertama, dan ia GAGAL — dua kali,
-- dengan galat berbeda:
--
--   • `LATIN1` → `report_untranslatable_char`: byte 0x94 tak ada di LATIN1.
--   • `WIN1252` → `report_invalid_encoding`: teksnya BERCAMPUR. Pesan
--     notifikasi memuat tanda kutip lengkung "…" yang TIDAK rusak; mengubah
--     seluruh string berarti ikut mengonversi karakter sehat itu jadi byte
--     0x93/0x94 yang bukan UTF-8 valid.
--
-- Pelajarannya: mojibake jarang merata. Perbaikan yang menyapu seluruh kolom
-- akan merusak karakter yang selama ini baik-baik saja.
--
-- Survei atas kelima kolom menemukan tepat SATU rangkaian rusak — "â€”",
-- 39 kemunculan, seluruhnya em-dash. Tidak ada pola lain. Jadi penggantian
-- harfiah adalah perbaikan yang paling sempit dan paling bisa dibuktikan.
--
-- ── Yang dijaga
--
-- 1. **Idempoten.** Setelah diganti, "â€”" tak ada lagi, jadi replay kedua
--    tak mengubah apa pun. Migrasi yang merusak saat dijalankan dua kali
--    adalah bom waktu.
--
-- 2. **Tidak menyentuh yang sehat.** REPLACE hanya mengenai rangkaian persis
--    ini. Tanda kutip lengkung, "&", dan seluruh teks lain lewat tanpa
--    disentuh — persis yang gagal dijaga oleh pendekatan konversi.
--
-- Cakupan: 39 baris di 5 kolom (notifications.message 19, projects.name 15,
-- cash_accounts.name 3, cash_accounts.notes 1, cash_transfers.notes 1) —
-- seluruhnya data seed pengembangan, bukan data pelanggan.

BEGIN;

UPDATE projects       SET name    = REPLACE(name,    'â€”', '—') WHERE name    LIKE '%â€”%';
UPDATE notifications  SET message = REPLACE(message, 'â€”', '—') WHERE message LIKE '%â€”%';
UPDATE cash_accounts  SET name    = REPLACE(name,    'â€”', '—') WHERE name    LIKE '%â€”%';
UPDATE cash_accounts  SET notes   = REPLACE(notes,   'â€”', '—') WHERE notes   LIKE '%â€”%';
UPDATE cash_transfers SET notes   = REPLACE(notes,   'â€”', '—') WHERE notes   LIKE '%â€”%';

COMMIT;
