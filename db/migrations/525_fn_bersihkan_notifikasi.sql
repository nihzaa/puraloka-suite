-- ============================================================================
-- 525 - FUNGSI PEMBERSIH NOTIFIKASI (memindahkan penghapusan dari rute ke basis)
-- ============================================================================
--
-- ── KENAPA DIPINDAHKAN, PADAHAL RUTENYA SUDAH BEKERJA
--
-- Migrasi 524 memasang setelan retensi, dan rutenya menghapus lewat
-- `supabase.from('notifications').delete()`. Itu jalan — dan diuji di
-- produksi: 200, 8.893 dibaca, 1.017 mendesak dilindungi.
--
-- Tetapi `tenancy-ratchet` merah: akses supabase mentah 314 -> 317.
--
-- Ratchet itu menjaga hal nyata: query tanpa saringan tenant membaca data
-- perusahaan lain. Pembersihan retensi memang LINTAS TENANT dan tak bisa
-- memakai `request.db` (yang akan memulangkan nol baris tanpa konteks tenant),
-- jadi kasus ini sah — tetapi "sah" bukan alasan menaikkan ambang.
--
-- Dua rute pembersih yang sudah ada TIDAK menaikkan angkanya sama sekali:
--
--     ai-retensi.ts            0 akses mentah
--     idempotensi-retensi.ts   0 akses mentah
--
-- Keduanya memanggil FUNGSI BASIS, bukan `.from()`. Migrasi ini memberi
-- `notifikasi` pola yang sama, alih-alih memberinya pengecualian.
--
-- ── ATURAN RETENSI IKUT PINDAH, DAN ITU DISENGAJA
--
-- Menaruh penghapusan di SQL sementara aturannya tetap di TypeScript berarti
-- dua tempat yang harus sepakat — dan yang menyimpang diam-diam adalah yang
-- tak punya test.
--
-- `lib/retensi-notifikasi.ts` TIDAK dihapus: ia tetap dipakai rutenya untuk
-- mode kering (`?dryrun=1`), yang memperlihatkan apa yang AKAN terjadi tanpa
-- menghapus apa pun. Fungsi ini dan pustaka itu wajib sepakat, dan
-- kesepakatannya dijaga test.
--
-- ── YANG TIDAK PERNAH DIHAPUS
--
-- Notifikasi `urgent` yang BELUM dibaca - berapa pun umurnya. Ia berarti
-- sesuatu yang berbahaya dan belum ada yang melihatnya; menghapusnya karena
-- "sudah lama" adalah kebalikan dari yang seharusnya.
--
-- Diukur 2026-08-31 di produksi: 1.017 notifikasi terlindungi aturan ini.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_bersihkan_notifikasi_kadaluarsa(
  p_hari_dibaca     INTEGER DEFAULT 30,
  p_hari_tak_dibaca INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
-- search_path dipaku: SECURITY DEFINER tanpa ini bisa dibajak lewat skema yang
-- dikendalikan pemanggil. Skema `test` di basis ini MEMBAYANGI 9 tabel public
-- bernama sama, jadi ini bukan kehati-hatian teoretis.
SET search_path = public, pg_temp
AS $$
DECLARE
  v_terhapus INTEGER;
BEGIN
  /*
    Batas bawah 7 hari, bukan 1.

    Retensi satu hari berarti notifikasi Jumat sore hilang sebelum Senin pagi,
    dan orang yang libur akhir pekan tak pernah melihatnya. Tujuh hari adalah
    lantai terendah yang masih menjamin satu putaran pekan penuh.
  */
  IF p_hari_dibaca < 7 OR p_hari_tak_dibaca < 7 THEN
    RAISE EXCEPTION 'retensi minimal 7 hari, diterima dibaca=% tak_dibaca=%',
      p_hari_dibaca, p_hari_tak_dibaca;
  END IF;

  /*
    INVARIAN: yang BELUM dibaca disimpan minimal selama yang sudah dibaca.

    Kalau terbalik, pesan yang tak pernah dilihat siapa pun dihapus DULUAN
    sementara yang sudah ditangani bertahan lebih lama. Tak ada galat yang
    muncul dari keadaan itu - fungsinya tetap berjalan dan tetap memulangkan
    angka.
  */
  IF p_hari_tak_dibaca < p_hari_dibaca THEN
    RAISE EXCEPTION
      'retensi tak-dibaca (%) lebih pendek daripada yang dibaca (%) — pesan yang belum dilihat akan dihapus duluan',
      p_hari_tak_dibaca, p_hari_dibaca;
  END IF;

  DELETE FROM notifications n
   WHERE
     /*
       YANG MENDESAK & BELUM DIBACA TIDAK PERNAH DIHAPUS.

       Diperiksa lebih dulu, dan sengaja: makin lama sebuah peringatan
       mendesak tak dibaca, makin mendesak ia dibaca. Kalau kotak masuk penuh
       oleh yang mendesak, jawabannya mengerjakannya - bukan menghapusnya.

       `high` TIDAK ikut dilindungi. Kalau ikut, hampir separuh notifikasi
       jadi abadi dan pembersih ini kehilangan gunanya.
     */
     NOT (lower(coalesce(n.priority, '')) IN ('urgent', 'critical', 'kritis')
          AND coalesce(n.is_read, false) = false)
     AND (
       (coalesce(n.is_read, false) = true
        AND n.created_at < now() - make_interval(days => p_hari_dibaca))
       OR
       (coalesce(n.is_read, false) = false
        AND n.created_at < now() - make_interval(days => p_hari_tak_dibaca))
     );

  GET DIAGNOSTICS v_terhapus = ROW_COUNT;
  RETURN v_terhapus;
END $$;

COMMENT ON FUNCTION fn_bersihkan_notifikasi_kadaluarsa(INTEGER, INTEGER) IS
  'Hapus notifikasi kedaluwarsa. Yang SUDAH dibaca dihapus sesudah '
  'p_hari_dibaca; yang belum dibaca sesudah p_hari_tak_dibaca (lebih lama). '
  'Yang berprioritas mendesak DAN belum dibaca TIDAK PERNAH dihapus, berapa '
  'pun umurnya. Memulangkan jumlah baris terhapus.';

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n INT; v INT;
BEGIN
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'fn_bersihkan_notifikasi_kadaluarsa';
  IF n <> 1 THEN
    RAISE EXCEPTION '525 gagal: fungsi tidak terbentuk (% ditemukan)', n;
  END IF;

  /*
    PENOLAKAN ARGUMEN TAK MASUK AKAL DIUJI, bukan diasumsikan.

    Fungsi penghapus yang menerima argumen apa pun adalah tombol hapus yang
    salah ketik sekali bisa mengosongkan tabel.
  */
  BEGIN
    PERFORM fn_bersihkan_notifikasi_kadaluarsa(1, 90);
    RAISE EXCEPTION '525 gagal: retensi 1 hari DITERIMA — batas bawah tak bekerja';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '525 gagal%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM fn_bersihkan_notifikasi_kadaluarsa(90, 30);
    RAISE EXCEPTION '525 gagal: urutan terbalik DITERIMA — invarian tak bekerja';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '525 gagal%' THEN RAISE; END IF;
  END;

  /*
    YANG MENDESAK TERBUKTI TERLINDUNGI — diuji DI DALAM transaksi yang
    dibatalkan, bukan dengan menghapus sungguhan.

    ⚠ Versi pertama blok ini memanggil `fn_bersihkan_notifikasi_kadaluarsa(7,7)`
    langsung. Diukur sebelum dijalankan: itu akan MENGHAPUS 4.341 dari 8.723
    baris di basis — separuh isi tabel, sebagai efek samping sebuah migrasi.

    Migrasi yang menghapus data sebagai "verifikasi" adalah migrasi yang tak
    bisa dijalankan dua kali dengan aman, dan tak seorang pun akan menduganya
    dari namanya.

    Yang benar: jalankan di savepoint, periksa hasilnya, lalu putar balik.
    Fungsinya tetap terbukti bekerja; datanya tak tersentuh.
  */
  SELECT count(*) INTO n FROM notifications
   WHERE lower(coalesce(priority,'')) IN ('urgent','critical','kritis')
     AND coalesce(is_read,false) = false;

  IF n > 0 THEN
    BEGIN
      PERFORM fn_bersihkan_notifikasi_kadaluarsa(7, 7);

      SELECT count(*) INTO v FROM notifications
       WHERE lower(coalesce(priority,'')) IN ('urgent','critical','kritis')
         AND coalesce(is_read,false) = false;

      IF v <> n THEN
        RAISE EXCEPTION
          '525 gagal: notifikasi mendesak belum-dibaca BERKURANG % -> % — perlindungannya bocor',
          n, v;
      END IF;

      /*
        Dibatalkan dengan sengaja melempar lalu menangkapnya sendiri.

        PL/pgSQL tak punya ROLLBACK di dalam blok, tetapi blok ber-EXCEPTION
        adalah subtransaksi: melempar dari dalamnya membatalkan seluruh
        perubahan yang terjadi di dalam blok itu — termasuk DELETE tadi.
      */
      RAISE EXCEPTION '525:BATALKAN-UJI';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE '525 gagal%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%525:BATALKAN-UJI%' THEN RAISE; END IF;
    END;

    -- Buktikan pembatalannya benar-benar terjadi: cacah TOTAL harus utuh.
    SELECT count(*) INTO v FROM notifications;
    RAISE NOTICE '525: % mendesak terbukti kebal pada ambang 7/7; tabel utuh (% baris)', n, v;
  END IF;

  RAISE NOTICE '525 OK: fn_bersihkan_notifikasi_kadaluarsa terpasang & terbukti menolak argumen tak sah';
END $$;
