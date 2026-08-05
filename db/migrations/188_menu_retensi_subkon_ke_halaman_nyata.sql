-- 188 — "Retensi Subkon" diarahkan ke halaman nyata
--
-- ── Keadaan sebelumnya
--
-- Menu `sk-retensi` ("Retensi Subkon") menunjuk `/m/sk-retensi` — halaman
-- penampung generik yang menampilkan "sub-menu ini belum digarap".
--
-- Padahal API-nya SUDAH ADA dan ber-test sejak lama:
--   GET  /api/v1/mandor/retensi-register  — daftar retensi per scope
--   POST /api/v1/mandor/retensi-releases  — pencairan
--
-- Yang hilang cuma layarnya. Ditemukan lewat `uji-api-punya-ui.mjs`, yang
-- mendaftar endpoint tanpa satu pun pemakaian di web.
--
-- ── Kenapa ini bukan sekadar kerapian
--
-- Retensi adalah uang MILIK MANDOR yang ditahan sebagai jaminan mutu,
-- biasanya 5% nilai pekerjaan. Tanpa daftar, tak ada yang bisa menjawab
-- "scope mana yang sudah selesai dan retensinya belum dicairkan" — dan
-- mandor menagih berkali-kali ke orang yang tak punya tempat memeriksanya.
--
-- Uang yang seharusnya keluar mengendap tanpa niat buruk siapa pun; itu
-- kelas kerugian yang tak muncul di laporan mana pun.
--
-- ── Kenapa href, bukan menu baru
--
-- Entri menunya sudah ada, sudah punya izin, sudah di grup yang benar
-- (`g-subkon`). Menambah entri kedua akan membuat dua pintu ke hal yang
-- sama — dan yang lama tetap membawa orang ke halaman kosong.

UPDATE menu_items
SET    href = '/mandor/retensi',
       updated_at = now()
WHERE  key = 'sk-retensi'
  AND  href = '/m/sk-retensi';   -- idempoten: replay kedua tak mengubah apa pun
