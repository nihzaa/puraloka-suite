-- ============================================================================
-- 563 — 122 tugas terjadwal GAGAL 403 tiap denyut; company-nya sudah mati
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- Diukur 2026-09-01, saat menelusuri "otomasi tak pernah jalan":
--
--     jadwal_tugas aktif : 329
--       terakhir sukses  : 207
--       terakhir GAGAL   : 122   ← semuanya HTTP 403
--
--     galat: "/api/v1/otomasi/jalankan/evm-kinerja membalas 403:
--             {"error":"Anda bukan anggota perusahaan tersebut"}"
--
-- Ditelusuri, dan 403-nya BENAR — bukan cacat izin:
--
--     [UJI-ISOLASI] Karya Beton Nusantara   is_active=false   61 tugas
--     PT Cek RPC D1b                        is_active=false   61 tugas
--
-- Dua company UJI yang sudah dinonaktifkan, tetapi `jadwal_tugas`-nya
-- tertinggal aktif. Tiap denyut penjadwal mencoba menjalankan 122 tugas untuk
-- perusahaan yang tak lagi ada, gagal, lalu mencatat galat.
--
-- ── Kenapa ini bukan sekadar berisik
--
-- 122 dari 329 tugas berstatus `gagal` membuat papan pemantauan otomasi
-- MENYESATKAN: yang melihatnya menyimpulkan otomasi rusak, padahal 207 yang
-- lain bekerja. Kegagalan yang WAJAR dan berulang mengajari orang mengabaikan
-- kolom status — dan kegagalan yang SUNGGUHAN nanti ikut terabaikan.
--
-- Itu bentuk yang sama dengan temuan hari ini soal penjaga yang menuduh entri
-- jujur: laporan yang salah melatih pembacanya berhenti membaca.
--
-- ── Yang dilakukan
--
-- Menonaktifkan jadwal milik company yang `is_active = false`. BUKAN
-- menghapusnya: kalau company-nya dihidupkan lagi, jadwalnya tinggal
-- dinyalakan — dan riwayat `jumlah_jalan`/`terakhir_galat`-nya tetap ada
-- untuk ditelusuri.
--
-- Ditulis sebagai aturan umum (`WHERE NOT co.is_active`), bukan daftar dua
-- company yang dipaku. Pelajaran migrasi 322: memaku nilai membuat verifikasi
-- membusuk begitu keadaannya berubah — dan company uji berikutnya pasti ada.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

UPDATE jadwal_tugas jt
   SET aktif = FALSE, diperbarui_pada = now()
  FROM companies co
 WHERE co.id = jt.company_id
   AND jt.aktif
   AND NOT co.is_active;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_mati   INT;
  n_gagal  INT;
  n_aktif  INT;
BEGIN
  -- Nol jadwal aktif milik company mati.
  SELECT count(*) INTO n_mati
    FROM jadwal_tugas jt JOIN companies co ON co.id = jt.company_id
   WHERE jt.aktif AND NOT co.is_active;
  IF n_mati > 0 THEN
    RAISE EXCEPTION '563 gagal: % jadwal aktif masih milik company mati', n_mati;
  END IF;

  /*
    Dan jangan sampai mematikan TERLALU banyak: company yang hidup harus
    tetap punya jadwalnya. Kalau angka ini nol, sesuatu yang lebih luas
    ikut tersapu — dan itu memadamkan otomasi untuk semua orang.
  */
  SELECT count(*) INTO n_aktif
    FROM jadwal_tugas jt JOIN companies co ON co.id = jt.company_id
   WHERE jt.aktif AND co.is_active;
  IF n_aktif = 0 THEN
    RAISE EXCEPTION '563 gagal: NOL jadwal aktif tersisa — terlalu banyak dimatikan';
  END IF;

  SELECT count(*) INTO n_gagal
    FROM jadwal_tugas WHERE aktif AND terakhir_status = 'gagal';

  RAISE NOTICE '563 OK — % jadwal aktif tersisa (company hidup), % berstatus gagal',
    n_aktif, n_gagal;
END $$;
