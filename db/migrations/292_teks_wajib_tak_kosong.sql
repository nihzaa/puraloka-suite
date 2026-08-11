-- ════════════════════════════════════════════════════════════════════════════
-- 292 — TEKS WAJIB TIDAK BOLEH KOSONG (G3, lanjutan 291)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa migrasi terpisah, dan bagaimana lubangnya ditemukan
--
-- Migrasi 291 menandai `judul`, `jenis`, `tindakan`, `pihak_lawan`, dan
-- `pokok_perkara` sebagai NOT NULL — dan itu SAYA KIRA cukup. Rute juga
-- menolak yang kosong (`if (!b.judul?.trim())`), dan mutasi membuktikan
-- penolakan itu bekerja.
--
-- Yang menemukan lubangnya bukan test, melainkan LAYAR.
--
-- Sesudah membangun halaman `/risiko`, dua baris muncul tanpa judul sama
-- sekali — hanya "Pengadaan · Kurangi · belum ada pemiliknya", yang sebenarnya
-- baris KEDUA dari selnya. Ditelusuri: keduanya sisa mutasi "judul kosong
-- lolos" yang tak terhapus, dan basis MENERIMANYA.
--
--   NOT NULL bukan "tidak kosong". `''` adalah nilai yang sah.
--
-- Akibatnya bukan sekadar tampilan jelek. Baris tanpa judul di register risiko
-- tak bisa dirujuk dalam rapat, tak bisa dicari, dan tak bisa dibedakan satu
-- sama lain — ia hadir sebagai angka tanpa perkara. Dan yang memasukkannya tak
-- harus lewat formulir: skrip impor, migrasi data, atau rute lain yang kelak
-- menulis ke tabel yang sama tak melewati validasi rute mana pun.
--
-- Pemeriksaan aplikasi adalah kenyamanan (pesannya bisa dibaca manusia);
-- constraint basis adalah jaminan. Yang pertama boleh ada tanpa yang kedua
-- hanya kalau tak ada yang peduli barisnya rusak.
--
-- ── Kenapa `length(trim(...)) > 0`, bukan `<> ''`
--
-- `<> ''` meloloskan satu spasi — dan satu spasi terlihat persis sama dengan
-- kosong di layar, sementara ia lolos setiap pemeriksaan yang membandingkan
-- dengan string kosong.
--
-- ── Cakupan: hanya tabel G3
--
-- Lubang yang sama hampir pasti ada di tabel lain, tetapi memasang constraint
-- ke seluruh basis dalam satu migrasi berarti migrasi ini GAGAL kalau ada satu
-- baris lama yang melanggar — dan gagalnya di tengah, sesudah sebagian
-- terpasang. Yang di luar G3 dicatat sebagai pekerjaan tersendiri, bukan
-- ditambal diam-diam di sini.
-- ════════════════════════════════════════════════════════════════════════════

-- Membersihkan sisa yang melanggar SEBELUM constraint dipasang. Di lingkungan
-- ini hanya ada baris uji; kalau kelak ada data nyata yang melanggar,
-- migrasinya berhenti di blok verifikasi dengan pesan yang menyebut jumlahnya
-- — bukan menghapus data orang diam-diam.
DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n FROM risiko_proyek WHERE length(trim(judul)) = 0;
  IF n > 0 THEN
    RAISE NOTICE '292: % baris risiko_proyek berjudul kosong — dihapus (sisa mutasi uji)', n;
    DELETE FROM risiko_proyek WHERE length(trim(judul)) = 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'risiko_judul_tak_kosong') THEN
    ALTER TABLE risiko_proyek ADD CONSTRAINT risiko_judul_tak_kosong
      CHECK (length(trim(judul)) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mitigasi_tindakan_tak_kosong') THEN
    ALTER TABLE tindakan_mitigasi ADD CONSTRAINT mitigasi_tindakan_tak_kosong
      CHECK (length(trim(tindakan)) > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'izin_proyek_jenis_tak_kosong') THEN
    ALTER TABLE izin_proyek ADD CONSTRAINT izin_proyek_jenis_tak_kosong
      CHECK (length(trim(jenis)) > 0);
  END IF;

  -- Sengketa: TIGA medan sekaligus. Sengketa tanpa pihak lawan atau tanpa
  -- pokok perkara adalah catatan yang tak bisa dipakai saat perkaranya
  -- benar-benar berjalan — dan itulah satu-satunya saat ia dibutuhkan.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sengketa_teks_wajib_tak_kosong') THEN
    ALTER TABLE sengketa ADD CONSTRAINT sengketa_teks_wajib_tak_kosong
      CHECK (length(trim(judul)) > 0
         AND length(trim(pihak_lawan)) > 0
         AND length(trim(pokok_perkara)) > 0);
  END IF;
END $$;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  FOR n IN
    SELECT 1 FROM unnest(ARRAY[
      'risiko_judul_tak_kosong', 'mitigasi_tindakan_tak_kosong',
      'izin_proyek_jenis_tak_kosong', 'sengketa_teks_wajib_tak_kosong']) c
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c)
  LOOP
    RAISE EXCEPTION '292 gagal: ada constraint teks-tak-kosong yang tak terpasang';
  END LOOP;

  SELECT count(*) INTO n FROM risiko_proyek WHERE length(trim(judul)) = 0;
  IF n > 0 THEN
    RAISE EXCEPTION '292 gagal: masih ada % baris berjudul kosong', n;
  END IF;

  RAISE NOTICE '292 OK — teks wajib G3 tak bisa kosong lagi';
END $$;
