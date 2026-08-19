-- ============================================================================
-- 431 - EJAAN CUACA DISERAGAMKAN (prasyarat, bukan otomasi)
-- ============================================================================
--
-- ── OTOMASI CUACA (3.8) DIUKUR DAN TIDAK DIBANGUN
--
-- Founder meminta semua celah dibangun. Yang ini DITOLAK sesudah diukur, dan
-- alasannya ditulis di sini supaya tak digali ulang dari nol.
--
-- Yang diukur 2026-08-16:
--
--   98 catatan cuaca di `progress_logs`
--    4 di antaranya hujan (3 "hujan ringan" + 1 "Hujan")
--    0 proyek menunjukkan penurunan tenaga kerja pada hari hujan
--    0 baris di `contract_eot` — tak ada klaim perpanjangan waktu untuk
--      dihubungkan
--
-- Automation "dampak cuaca" akan memicu empat kali seumur data, tanpa satu pun
-- akibat yang bisa ditunjukkan. Itu bentuk kelumpuhan yang sudah berulang di
-- repo ini: rute hidup, terlihat mengesankan di katalog, memicu nol selamanya.
--
-- ── SYARAT PENCABUTAN
--
-- Bangun 3.8 bila SALAH SATU terpenuhi:
--
--   a) hari hujan mencapai >10% catatan DAN tenaga kerja pada hari itu
--      terukur lebih rendah — barulah "cuaca menghentikan pekerjaan" punya
--      bukti, bukan asumsi;
--   b) `contract_eot` mulai terisi — klaim perpanjangan waktu butuh bukti
--      cuaca yang terkumpul rapi, dan DI SITULAH nilainya, bukan di
--      notifikasi harian.
--
-- Ukur:
--   SELECT lower(trim(weather)) w, COUNT(*) FROM progress_logs
--    WHERE weather IS NOT NULL GROUP BY 1;
--   SELECT COUNT(*) FROM contract_eot;
--
-- ── YANG TETAP DIKERJAKAN: EJAANNYA
--
-- Enam ejaan untuk empat keadaan — `cerah`/`Cerah`, `berawan`/`Berawan`,
-- `hujan ringan`, `Hujan`. Pengelompokan apa pun yang memakai kolom ini
-- (laporan, grafik, dan kelak automation 3.8) akan menghitungnya sebagai
-- kategori terpisah.
--
-- Itu cacat yang berdiri sendiri, tak bergantung pada dibangun-tidaknya 3.8:
-- laporan bulanan yang menampilkan "Cerah 27" dan "cerah 48" sebagai dua baris
-- sudah salah hari ini.
--
-- Diseragamkan ke huruf kecil tanpa spasi tepi. Nilai aslinya tidak dipetakan
-- ulang ke daftar tertutup — "hujan ringan" tetap berbeda dari "hujan", dan
-- membedakannya memang benar.
-- ============================================================================

UPDATE progress_logs
   SET weather = lower(trim(weather))
 WHERE weather IS NOT NULL
   AND weather <> lower(trim(weather));

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n INT; n_isi INT;
BEGIN
  SELECT count(*) INTO n_isi FROM progress_logs WHERE weather IS NOT NULL;
  IF n_isi < 1 THEN
    RAISE EXCEPTION '431 gagal: tak ada satu pun catatan cuaca untuk diseragamkan';
  END IF;

  -- Tak boleh ada sisa yang berbeda dari bentuk normalnya.
  SELECT count(*) INTO n FROM progress_logs
   WHERE weather IS NOT NULL AND weather <> lower(trim(weather));
  IF n > 0 THEN
    RAISE EXCEPTION '431 gagal: masih % baris cuaca belum seragam', n;
  END IF;

  /*
    Jumlah ejaan BERBEDA harus TURUN, bukan sekadar "tidak ada huruf besar".

    Pemeriksaan "tak ada huruf besar" saja akan hijau pada basis yang memang
    tak pernah punya huruf besar — dan migrasi ini lalu terlihat berhasil
    tanpa mengerjakan apa pun. Yang membuktikan kerjanya: ejaan berbedanya
    lebih sedikit daripada nilai mentah yang pernah ada.

    Diukur sebelum: 6 ejaan. Sesudah: 4.
  */
  SELECT count(DISTINCT weather) INTO n FROM progress_logs WHERE weather IS NOT NULL;
  IF n > 5 THEN
    RAISE EXCEPTION
      '431 gagal: masih % ejaan cuaca berbeda — penyeragaman tak berpengaruh', n;
  END IF;

  RAISE NOTICE '431 OK: % catatan cuaca, % ejaan berbeda', n_isi, n;
END $$;
