-- ════════════════════════════════════════════════════════════════════════════
-- 440 — Lima menu yang kini punya halamannya: titik kesiapan menyusul
-- ════════════════════════════════════════════════════════════════════════════
--
-- Lanjutan langsung 439, tapi sebabnya berbeda dan itu penting dicatat.
--
-- 439 membetulkan titik yang SEJAK AWAL salah — tiga halaman Master Data
-- sudah hidup sejak 2026-08-12 sementara titiknya tak pernah diperbarui.
--
-- 440 membetulkan titik yang BARU SAJA menjadi salah: empat halaman dibangun
-- hari ini (2026-08-17) karena menunya aktif tapi 404, plus `/lapangan/harian`
-- yang halamannya ternyata sudah ada:
--
--     /aset/perawatan     Jadwal Perawatan
--     /kontrak/subkon     Kontrak Subkontraktor
--     /kontrak/surat      Surat Masuk/Keluar
--     /mutu/insiden       Insiden & Kecelakaan
--     /lapangan/harian    Laporan Harian (DPR)
--
-- ── Pelajaran yang layak ditulis, bukan sekadar di-UPDATE
--
-- Membangun halaman TIDAK otomatis memperbarui `kesiapan`. Jadi tiap kali
-- halaman baru lahir dari menu yang tadinya kosong, ada langkah kedua yang
-- mudah terlupa — dan kalau terlupa, halaman yang sudah bisa dipakai tetap
-- terlihat "belum siap" di sidebar.
--
-- Itu kelas cacat yang sama dengan 439, hanya arah waktunya terbalik. Karena
-- itu keduanya dicatat terpisah alih-alih digabung: yang membaca riwayat ini
-- kelak perlu tahu bahwa ada DUA cara titik kesiapan jadi bohong.
--
-- ── Yang SENGAJA tidak disentuh
--
-- `/tender/penawaran` TETAP `rencana`. Halamannya memang belum ada di branch
-- ini — ia hidup di `feat/kematangan-modul` yang belum di-merge. Menyetelnya
-- `hidup` sekarang berarti titiknya hilang untuk halaman yang masih 404, dan
-- itu persis kebohongan yang 439 & 440 ada untuk mencegahnya.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items
   SET kesiapan = 'hidup', updated_at = now()
 WHERE href IN ('/aset/perawatan', '/kontrak/subkon', '/kontrak/surat',
                '/mutu/insiden', '/lapangan/harian')
   AND is_active = true
   AND kesiapan IS DISTINCT FROM 'hidup';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_hidup INT;
  v_penawaran TEXT;
BEGIN
  SELECT count(*) INTO v_hidup
    FROM menu_items
   WHERE href IN ('/aset/perawatan', '/kontrak/subkon', '/kontrak/surat',
                  '/mutu/insiden', '/lapangan/harian')
     AND is_active = true AND kesiapan = 'hidup';
  IF v_hidup <> 5 THEN
    RAISE EXCEPTION '440 gagal: hanya % dari 5 menu yang jadi hidup', v_hidup;
  END IF;

  -- `/tender/penawaran` WAJIB tetap rencana — halamannya belum ada di branch
  -- ini, dan titik yang hilang untuk halaman 404 adalah kebohongan.
  SELECT kesiapan INTO v_penawaran
    FROM menu_items WHERE href = '/tender/penawaran' AND is_active = true;
  IF v_penawaran IS NOT NULL AND v_penawaran = 'hidup' THEN
    RAISE EXCEPTION
      '440 gagal: /tender/penawaran ditandai hidup padahal halamannya belum ada';
  END IF;

  RAISE NOTICE '440 OK — 5 menu jadi hidup; /tender/penawaran sengaja tetap %',
    COALESCE(v_penawaran, '(tak ada)');
END $$;
