-- ============================================================================
-- 528 - Lima alur otomasi yang DIPAKAI kode tetapi tak pernah dibuat migrasi
-- ============================================================================
--
-- Cacat yang ditutup
--
-- `utils/terbit-peristiwa.ts` memetakan jenis notifikasi ke kode alur, dan
-- kode itu dipakai sebagai `path` webhook n8n. Penjaga
-- `audit-peristiwa-punya-alur.mjs` menuntut tiap kode punya barisnya di
-- `otomasi_alur`, dan di CI kelimanya tak ada:
--
--     Peristiwa menunjuk alur yang tak ada:
--        kasbon_submitted        -> teruskan-kasbon-diajukan
--        wage_report_submitted   -> teruskan-laporan-upah
--        invoice_paid            -> konfirmasi-invoice-dibayar
--        project_status_changed  -> lapor-status-proyek-berubah
--        stok_menipis            -> peringatan-stok-menipis
--        5 pelanggaran (ambang: 0)
--
-- Kelimanya ADA di basis dev, dan itu justru masalahnya: mereka dibuat di luar
-- jalur migrasi. Keadaan yang lahir dari tindakan manual di satu mesin bukan
-- keadaan sistem (CLAUDE.md 5.5).
--
-- Kelas yang sama dengan `template_rab` (migrasi 518 hari ini): dipakai kode,
-- tak pernah dibuat migrasi, dan hanya terlihat saat ada lingkungan bersih.
--
-- Kenapa `aktif` berbeda-beda
--
-- Empat aktif, satu tidak. `peringatan-stok-menipis` sengaja NONAKTIF: sejak
-- 2026-08-13 pekerjaan itu dilakukan automation internal Puraloka tanpa n8n,
-- dan mengaktifkannya membuat satu peristiwa menghasilkan DUA notifikasi.
-- Nilai ini disalin apa adanya dari basis dev, bukan ditebak.
--
-- Keterangan tiap baris memuat penanda [BELUM TERSAMBUNG]: barisnya mencatat
-- NIAT, bukan automation yang berjalan; `n8n_id` sengaja kosong. Penanda itu
-- yang membedakan "alur ada tapi belum disambungkan" dari "alur hilang".
--
-- Per tenant, bukan global
--
-- `otomasi_alur.company_id` NOT NULL: tiap badan usaha punya salinannya
-- sendiri. Disisipkan untuk SETIAP company aktif, dan ON CONFLICT menjaga agar
-- yang sudah ada tak tergilas, termasuk `n8n_id` yang mungkin sudah terisi di
-- basis yang alurnya sungguh tersambung.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

INSERT INTO otomasi_alur (company_id, kode, nama, keterangan, pemicu, kategori, jalur_webhook, aktif)
SELECT c.id, a.kode, a.nama, a.keterangan, 'webhook', a.kategori, a.kode, a.aktif
  FROM companies c
 CROSS JOIN (VALUES
   ('teruskan-kasbon-diajukan',
    'Teruskan kasbon yang baru diajukan',
    'Mandor mengajukan kasbon: teruskan ke penyetuju lewat WhatsApp dengan nominal dan alasannya, tanpa perlu membuka aplikasi. Sumber: notification_rules kasbon_submitted. [BELUM TERSAMBUNG] Belum ada workflow n8n untuk alur ini (n8n_id kosong). Baris ini mencatat NIAT, bukan automation yang berjalan.',
    'mandor', true),
   ('teruskan-laporan-upah',
    'Teruskan laporan upah mingguan',
    'Laporan upah diajukan: kirim ringkasannya (jumlah tukang, total, selisih vs minggu lalu) ke penyetuju. Sumber: notification_rules wage_report_submitted. [BELUM TERSAMBUNG] Belum ada workflow n8n untuk alur ini (n8n_id kosong). Baris ini mencatat NIAT, bukan automation yang berjalan.',
    'mandor', true),
   ('konfirmasi-invoice-dibayar',
    'Konfirmasi pembayaran diterima',
    'Begitu pembayaran tercatat: kirim konfirmasi ke klien dan hentikan seluruh pengingat untuk invoice itu. Sumber: notification_rules invoice_paid. Tanpa ini, klien yang SUDAH bayar tetap ditagih, kerusakan hubungan yang jauh lebih mahal daripada invoice-nya. [BELUM TERSAMBUNG] Belum ada workflow n8n untuk alur ini (n8n_id kosong). Baris ini mencatat NIAT, bukan automation yang berjalan.',
    'keuangan', true),
   ('lapor-status-proyek-berubah',
    'Kabar perubahan status proyek',
    'Status proyek berpindah (mis. jadi dikerjakan atau selesai): kabari klien dan tim inti. Sumber: notification_rules project_status_changed. [BELUM TERSAMBUNG] Belum ada workflow n8n untuk alur ini (n8n_id kosong). Baris ini mencatat NIAT, bukan automation yang berjalan.',
    'proyek', true),
   ('peringatan-stok-menipis',
    'Peringatan stok material menipis',
    'Saldo gudang menyentuh titik pesan ulang: kabari pengadaan sebelum pekerjaan berhenti. Pemicunya dari mutasi stok, bukan jadwal; keterlambatan satu hari di sini menghentikan orang di lapangan. [DIGANTIKAN 2026-08-13] Pekerjaan ini kini dilakukan automation internal Puraloka (tanpa n8n). Dinonaktifkan supaya satu peristiwa tak menghasilkan dua notifikasi bila workflow n8n-nya kelak dibuat.',
    'gudang', false)
 ) AS a(kode, nama, keterangan, kategori, aktif)
 WHERE c.is_active
ON CONFLICT (company_id, kode) DO NOTHING;

-- Verifikasi (pola migrasi 142)
DO $$
DECLARE
  v_kode   TEXT;
  v_kurang TEXT := '';
  n_aktif  INT;
  V_DAFTAR_KODE TEXT[] := ARRAY['teruskan-kasbon-diajukan', 'teruskan-laporan-upah',
                       'konfirmasi-invoice-dibayar', 'lapor-status-proyek-berubah',
                       'peringatan-stok-menipis'];
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;

  /*
    Kalau tak ada company aktif, tak ada yang bisa diberi alur, dan itu keadaan
    basis yang baru lahir, bukan kegagalan. Pelajaran dari sebelas migrasi lain
    hari ini yang menghentikan rantai karena datanya belum ada.
  */
  IF n_aktif = 0 THEN
    RAISE NOTICE '528 dilewati: nol company aktif di basis ini. Bukan galat.';
    RETURN;
  END IF;

  /*
    Diperiksa KEBERADAAN per kode, bukan cacah total.

    Cacah total (5 * n_aktif) akan merah begitu satu tenant menambah alurnya
    sendiri lewat UI, hal yang memang boleh terjadi. Yang penting: tiap kode
    yang dipakai `terbit-peristiwa.ts` punya barisnya.
  */
  FOREACH v_kode IN ARRAY V_DAFTAR_KODE LOOP
    IF NOT EXISTS (SELECT 1 FROM otomasi_alur WHERE otomasi_alur.kode = v_kode) THEN
      v_kurang := v_kurang || v_kode || ' ';
    END IF;
  END LOOP;

  IF v_kurang <> '' THEN
    RAISE EXCEPTION '528 gagal: alur belum terdaftar: %', v_kurang;
  END IF;

  RAISE NOTICE '528 OK: kelima alur peristiwa terdaftar untuk % company aktif', n_aktif;
END $$;
