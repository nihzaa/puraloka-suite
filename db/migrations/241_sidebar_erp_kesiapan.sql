-- ════════════════════════════════════════════════════════════════════════════
-- 241 — SIDEBAR DIROMBAK ke struktur ERP + kolom kesiapan halaman
--
-- ── Permintaan founder 2026-08-09
--
--   "apakah sudah benar semua sesuai standar ERP penempatannya seperti ini?
--    yg saya lihat gaada data master"
--   "untuk estimasi & Biaya itu ganti aja, dan untuk membuat RAB itu punya
--    halaman tersendiri jangan campur dengan finance"
--   "untuk semua menu/submenu yg ada di taksonomi juga daftarkan ada ke
--    sidebar, dan untuk status kesiapan halamannya berikan label dulu aja"
--
-- Rancangan lengkap + alasannya: `docs/design/STRUKTUR-SIDEBAR-ERP.md`.
--
-- ── Tiga cacat yang diperbaiki (diukur, bukan dirasa)
--
--   1. TIDAK ADA grup Master Data. Taksonomi §1 punya 19 item; isinya
--      tersebar ke LIMA grup (Klien di Proyek, Supplier di Pengadaan,
--      Tukang di Mandor, Aset di Alat&Dokumen, Satuan di Administrasi).
--
--   2. "Estimasi & Biaya" isinya AKUNTANSI. Enam dari tujuh anaknya milik
--      taksonomi §14 (Jurnal, Bagan Akun, Neraca, Buku Besar), bukan §5.
--
--   3. `Ringkasan Gudang` ber-sort_order 1301 — bertabrakan dengan
--      `Pengguna & Role` di Administrasi. Kesalahan migrasi 240 saya sendiri.
--
-- ── R-3 migrasi 232 dicabut SEBAGIAN, bukan dilanggar diam-diam
--
-- R-3 berbunyi "menu hanya untuk halaman yang ADA", dan alasannya sah: menu
-- yang belum dibangun mengecewakan saat diklik.
--
-- Founder meminta sebaliknya supaya yang belum digarap tak terlupa. Jadi
-- kekhawatiran R-3 dijawab bukan dengan menyembunyikan melainkan MENANDAI:
-- kolom `kesiapan` + titik warna di sidebar. Orang tahu SEBELUM mengklik.
--
-- ── Idempoten
--
-- Kolom pakai IF NOT EXISTS; menu pakai ON CONFLICT (key) DO UPDATE yang
-- menetapkan nilai akhir. Dijalankan dua kali = keadaan sama.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. KOLOM KESIAPAN
-- ------------------------------------------------------------
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS kesiapan TEXT NOT NULL DEFAULT 'hidup';

ALTER TABLE menu_items DROP CONSTRAINT IF EXISTS menu_items_kesiapan_check;
ALTER TABLE menu_items ADD CONSTRAINT menu_items_kesiapan_check
  CHECK (kesiapan IN ('hidup', 'sebagian', 'rencana'));

COMMENT ON COLUMN menu_items.kesiapan IS
  'hidup = halaman jadi & dipakai · sebagian = ada tapi belum lengkap · rencana = halaman belum dibangun. Sidebar menampilkannya sebagai titik warna. Aturan: docs/design/STRUKTUR-SIDEBAR-ERP.md §R-5';

-- ------------------------------------------------------------
-- 2. GRUP INDUK — urutan mengikuti ALUR KERJA kontraktor
--
-- Blok ratusan (R-4). Tiap grup satu blok; anak memakai induk+1, induk+2.
-- Nomor tak boleh melompat antar-grup — itu yang membuat 240 bertabrakan.
-- ------------------------------------------------------------
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active, kesiapan)
VALUES
  ('g-master-data',   'Master Data',           NULL, 'Database',      50,   'main', NULL, true, 'hidup'),
  ('g-crm-tender',    'CRM & Tender',          NULL, 'Gavel',         100,  'main', NULL, true, 'hidup'),
  ('g-proyek',        'Proyek',                NULL, 'FolderKanban',  200,  'main', NULL, true, 'hidup'),
  ('g-kontrak',       'Kontrak',               NULL, 'FileSignature', 300,  'main', NULL, true, 'hidup'),
  ('g-jadwal',        'Perencanaan & Jadwal',  NULL, 'CalendarRange', 400,  'main', NULL, true, 'hidup'),
  ('g-anggaran',      'Estimasi & Anggaran',   NULL, 'Calculator',    500,  'main', NULL, true, 'hidup'),
  ('g-pengadaan',     'Pengadaan',             NULL, 'ShoppingCart',  600,  'main', NULL, true, 'hidup'),
  ('g-gudang',        'Gudang & Material',     NULL, 'Package',       700,  'main', NULL, true, 'hidup'),
  ('g-mandor-subkon', 'Mandor & Subkon',       NULL, 'HardHat',       800,  'main', NULL, true, 'hidup'),
  ('g-lapangan',      'Lapangan',              NULL, 'ClipboardList', 900,  'main', NULL, true, 'hidup'),
  ('g-mutu-kepatuhan','Mutu & K3',             NULL, 'ShieldCheck',   1000, 'main', NULL, true, 'hidup'),
  ('g-keuangan',      'Keuangan',              NULL, 'Landmark',      1100, 'main', NULL, true, 'hidup'),
  ('g-akuntansi',     'Akuntansi',             NULL, 'BookOpen',      1200, 'main', NULL, true, 'hidup'),
  ('g-alat-aset',     'Alat & Aset',           NULL, 'Truck',         1300, 'main', NULL, true, 'hidup'),
  ('g-dokumen',       'Dokumen',               NULL, 'FolderOpen',    1400, 'main', NULL, true, 'hidup'),
  ('g-pelaporan',     'Pelaporan & BI',        NULL, 'BarChart3',     1500, 'main', NULL, true, 'hidup'),
  ('g-administrasi',  'Administrasi',          NULL, 'Settings',      1600, 'main', NULL, true, 'hidup')
ON CONFLICT (key) DO UPDATE
   SET label = EXCLUDED.label, icon = EXCLUDED.icon,
       sort_order = EXCLUDED.sort_order, section = 'main',
       parent_id = NULL, is_active = true, href = NULL,
       kesiapan = EXCLUDED.kesiapan;

-- Grup lama yang isinya dipindah — dinonaktifkan, TIDAK dihapus.
-- Menghapusnya memutus jejak: kalau kelak ada yang bertanya "dulu Klien di
-- mana", barisnya masih ada dengan is_active=false.
UPDATE menu_items SET is_active = false, updated_at = now()
 WHERE key IN ('g-estimasi-biaya', 'g-kas-bank', 'g-piutang', 'g-alat-dokumen');

-- ------------------------------------------------------------
-- 3. ANAK — dipindahkan ke induk yang benar
--
-- Fungsi bantu supaya 90+ baris di bawah tak mengulang subquery yang sama.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pasang_menu(
  p_key TEXT, p_label TEXT, p_href TEXT, p_induk TEXT,
  p_urut INT, p_kesiapan TEXT DEFAULT 'hidup', p_izin TEXT[] DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_induk UUID;
BEGIN
  SELECT id INTO v_induk FROM menu_items WHERE key = p_induk;
  IF v_induk IS NULL THEN
    RAISE EXCEPTION 'induk % tak ditemukan untuk menu %', p_induk, p_key;
  END IF;

  INSERT INTO menu_items (key, label, href, icon, sort_order, section,
                          parent_id, is_active, kesiapan, required_permissions)
  VALUES (p_key, p_label, p_href, 'Dot', p_urut, 'main',
          v_induk, true, p_kesiapan, COALESCE(p_izin, ARRAY[]::text[]))
  ON CONFLICT (key) DO UPDATE
     SET label = EXCLUDED.label, href = EXCLUDED.href,
         sort_order = EXCLUDED.sort_order, section = 'main',
         parent_id = EXCLUDED.parent_id, is_active = true,
         kesiapan = EXCLUDED.kesiapan,
         required_permissions = COALESCE(p_izin, menu_items.required_permissions);
END $$;

-- == 50 MASTER DATA -- taksonomi §1. Acuan yang dipakai SEMUA modul,
--    karena itu di atas, bukan di bawah bersama pengaturan sistem.
SELECT pasang_menu('klien',                   'Klien',                     '/klien',                                    'g-master-data', 51);
SELECT pasang_menu('procurement-supplier',    'Supplier & Vendor',         '/procurement/supplier',                     'g-master-data', 52);
SELECT pasang_menu('mandor-tukang',           'Tukang & Pekerja',          '/mandor/tukang',                            'g-master-data', 53);
SELECT pasang_menu('procurement-material',    'Katalog Material',          '/procurement/material',                     'g-master-data', 54);
SELECT pasang_menu('pengaturan-satuan',       'Satuan',                    '/pengaturan/satuan',                        'g-master-data', 55);
SELECT pasang_menu('pengaturan-kategori-pekerjaan', 'Kategori Pekerjaan',        '/pengaturan/kategori-pekerjaan',            'g-master-data', 56);
SELECT pasang_menu('pengaturan-kasbon-purposes', 'Tujuan Kasbon',             '/pengaturan/kasbon-purposes',               'g-master-data', 57);
SELECT pasang_menu('pengaturan-perusahaan',   'Badan Usaha',               '/pengaturan/perusahaan',                    'g-master-data', 58);
SELECT pasang_menu('md-wbs',                  'Template WBS',              '/master/wbs',                               'g-master-data', 61, 'rencana');
SELECT pasang_menu('md-karyawan',             'Karyawan (HR)',             '/master/karyawan',                          'g-master-data', 62, 'rencana');
SELECT pasang_menu('md-penomoran',            'Penomoran Dokumen',         '/master/penomoran',                         'g-master-data', 63, 'rencana');
SELECT pasang_menu('md-template-dok',         'Template Dokumen',          '/master/template-dokumen',                  'g-master-data', 64, 'rencana');

-- == 100 CRM & TENDER -- taksonomi §2. Sebelum proyek ada.
SELECT pasang_menu('tender',                  'Register Tender',           '/tender',                                   'g-crm-tender', 101);
SELECT pasang_menu('procurement-kualifikasi', 'Prakualifikasi Vendor',     '/procurement/kualifikasi',                  'g-crm-tender', 102);
SELECT pasang_menu('crm-lead',                'Pipeline Prospek',          '/crm/prospek',                              'g-crm-tender', 103, 'rencana');
SELECT pasang_menu('crm-proposal',            'Dokumen Penawaran',         '/crm/penawaran',                            'g-crm-tender', 104, 'rencana');

-- == 200 PROYEK
SELECT pasang_menu('proyek',                  'Daftar Proyek',             '/proyek',                                   'g-proyek', 201);
SELECT pasang_menu('proyek-keterlambatan',    'Keterlambatan',             '/proyek/keterlambatan',                     'g-proyek', 202);

-- == 300 KONTRAK
SELECT pasang_menu('kontrak',                 'Register Kontrak',          '/kontrak',                                  'g-kontrak', 301);
SELECT pasang_menu('kontrak-rfi',             'RFI',                       '/kontrak/rfi',                              'g-kontrak', 302);
SELECT pasang_menu('kontrak-asuransi',        'Asuransi & Jaminan',        '/kontrak/asuransi',                         'g-kontrak', 303);
SELECT pasang_menu('kontrak-surat',           'Surat Masuk/Keluar',        '/kontrak/surat',                            'g-kontrak', 304, 'rencana');
SELECT pasang_menu('kontrak-subkon',          'Kontrak Subkontraktor',     '/kontrak/subkon',                           'g-kontrak', 305, 'rencana');

-- == 400 PERENCANAAN & JADWAL -- taksonomi §4. Dulu anak Proyek.
SELECT pasang_menu('jadwal-cpm',              'Jalur Kritis (CPM)',        '/jadwal?bagian=cpm',                        'g-jadwal', 401);
SELECT pasang_menu('jadwal-histogram',        'Histogram Sumber Daya',     '/jadwal?bagian=histogram',                  'g-jadwal', 402);
SELECT pasang_menu('jadwal-method',           'Method Statement',          '/jadwal?bagian=method',                     'g-jadwal', 403);
SELECT pasang_menu('kalender',                'Kalender Kerja',            '/kalender',                                 'g-jadwal', 404);

-- == 500 ESTIMASI & ANGGARAN -- taksonomi §5. DIPISAH dari akuntansi.
SELECT pasang_menu('estimasi',                'Estimasi & RAB',            '/estimasi',                                 'g-anggaran', 501);
SELECT pasang_menu('keuangan-contingency',    'Contingency',               '/keuangan/contingency',                     'g-anggaran', 502);
SELECT pasang_menu('keu-cvr',                 'Cost Value Reconciliation', '/keuangan/cvr',                             'g-anggaran', 503, 'sebagian');

-- == 600 PENGADAAN
SELECT pasang_menu('procurement',             'Ringkasan Pengadaan',       '/procurement',                              'g-pengadaan', 601);
SELECT pasang_menu('procurement-permintaan',  'Permintaan Material',       '/procurement/permintaan',                   'g-pengadaan', 602);
SELECT pasang_menu('procurement-rfq',         'RFQ & Tabulasi',            '/procurement/rfq',                          'g-pengadaan', 603);
SELECT pasang_menu('procurement-pesanan',     'Purchase Order',            '/procurement/pesanan',                      'g-pengadaan', 604);
SELECT pasang_menu('procurement-penerimaan',  'Penerimaan Barang',         '/procurement/penerimaan',                   'g-pengadaan', 605);
SELECT pasang_menu('procurement-hutang',      'Utang Supplier',            '/procurement/hutang',                       'g-pengadaan', 606);
SELECT pasang_menu('pl-payung',               'Kontrak Payung',            '/procurement/lanjutan?bagian=payung',       'g-pengadaan', 607);
SELECT pasang_menu('pl-expediting',           'Expediting',                '/procurement/lanjutan?bagian=expediting',   'g-pengadaan', 608);
SELECT pasang_menu('pl-nota',                 'Nota Kredit',               '/procurement/lanjutan?bagian=nota',         'g-pengadaan', 609);
SELECT pasang_menu('procurement-riwayat-harga', 'Riwayat Harga',             '/procurement/riwayat-harga',                'g-pengadaan', 610);
SELECT pasang_menu('procurement-laporan',     'Laporan Pengadaan',         '/procurement/laporan',                      'g-pengadaan', 611);

-- == 700 GUDANG & MATERIAL
SELECT pasang_menu('gudang',                  'Ringkasan Gudang',          '/gudang',                                   'g-gudang', 701);
SELECT pasang_menu('procurement-stok',        'Stok Material',             '/procurement/stok',                         'g-gudang', 702);
SELECT pasang_menu('gudang-rekonsiliasi',     'Rekonsiliasi Material',     '/gudang/rekonsiliasi',                      'g-gudang', 703);
SELECT pasang_menu('gudang-transfer',         'Transfer Antar Proyek',     '/gudang/transfer',                          'g-gudang', 704);
SELECT pasang_menu('gudang-material-klien',   'Material Milik Klien',      '/gudang/material-klien',                    'g-gudang', 705);

-- == 800 MANDOR & SUBKON
SELECT pasang_menu('mandor',                  'Ringkasan Mandor',          '/mandor',                                   'g-mandor-subkon', 801);
SELECT pasang_menu('mandor-penugasan',        'Penugasan',                 '/mandor/penugasan',                         'g-mandor-subkon', 802);
SELECT pasang_menu('mandor-absensi',          'Absensi',                   '/mandor/absensi',                           'g-mandor-subkon', 803);
SELECT pasang_menu('mandor-upah',             'Upah',                      '/mandor/upah',                              'g-mandor-subkon', 804);
SELECT pasang_menu('mandor-kasbon',           'Kasbon Tukang',             '/mandor/kasbon',                            'g-mandor-subkon', 805);
SELECT pasang_menu('mandor-penagihan',        'Penagihan Progress',        '/mandor/penagihan',                         'g-mandor-subkon', 806);
SELECT pasang_menu('mandor-retensi',          'Retensi Subkon',            '/mandor/retensi',                           'g-mandor-subkon', 807);
SELECT pasang_menu('mandor-tender',           'Tender Subkon',             '/mandor/tender',                            'g-mandor-subkon', 808);

-- == 900 LAPANGAN
SELECT pasang_menu('lapangan',                'Ringkasan Lapangan',        '/lapangan',                                 'g-lapangan', 901);
SELECT pasang_menu('lapangan-punch-list',     'Punch List',                '/lapangan/punch-list',                      'g-lapangan', 902);
SELECT pasang_menu('lapangan-inspeksi',       'Inspeksi',                  '/lapangan/inspeksi',                        'g-lapangan', 903);
SELECT pasang_menu('lapangan-submittal',      'Submittal',                 '/lapangan/submittal',                       'g-lapangan', 904);
SELECT pasang_menu('lap-harian',              'Laporan Harian (DPR)',      '/lapangan/harian',                          'g-lapangan', 905, 'rencana');

-- == 1000 MUTU & K3
SELECT pasang_menu('mutu-ncr',                'NCR',                       '/mutu/ncr',                                 'g-mutu-kepatuhan', 1001);
SELECT pasang_menu('kep-kesiapan',            'Kesiapan & Izin Kerja',     '/kepatuhan?bagian=kesiapan',                'g-mutu-kepatuhan', 1002);
SELECT pasang_menu('kep-dokumen',             'Dokumen Kepatuhan',         '/kepatuhan?bagian=dokumen',                 'g-mutu-kepatuhan', 1003);
SELECT pasang_menu('kep-evaluasi',            'Evaluasi Subkon',           '/kepatuhan?bagian=evaluasi',                'g-mutu-kepatuhan', 1004);
SELECT pasang_menu('k3-insiden',              'Insiden & Kecelakaan',      '/mutu/insiden',                             'g-mutu-kepatuhan', 1005, 'rencana');

-- == 1100 KEUANGAN -- uang yang BERGERAK. Pencatatannya di 1200.
SELECT pasang_menu('keuangan',                'Ringkasan Keuangan',        '/keuangan',                                 'g-keuangan', 1101);
SELECT pasang_menu('keuangan-invoice',        'Invoice',                   '/keuangan/invoice',                         'g-keuangan', 1102);
SELECT pasang_menu('keuangan-pembayaran',     'Pembayaran Masuk',          '/keuangan/pembayaran',                      'g-keuangan', 1103);
SELECT pasang_menu('keuangan-ipc',            'Sertifikat IPC',            '/keuangan/ipc',                             'g-keuangan', 1104);
SELECT pasang_menu('piutang',                 'Piutang & Retensi',         '/piutang',                                  'g-keuangan', 1105);
SELECT pasang_menu('keuangan-kasbon',         'Kasbon',                    '/keuangan/kasbon',                          'g-keuangan', 1106);
SELECT pasang_menu('kas',                     'Ringkasan Kas',             '/kas',                                      'g-keuangan', 1107);
SELECT pasang_menu('kas-akun',                'Akun Kas',                  '/kas/akun',                                 'g-keuangan', 1108);
SELECT pasang_menu('kas-pengeluaran',         'Pengeluaran',               '/kas/pengeluaran',                          'g-keuangan', 1109);
SELECT pasang_menu('kas-transfer',            'Transfer',                  '/kas/transfer',                             'g-keuangan', 1110);
SELECT pasang_menu('kas-rekonsiliasi',        'Rekonsiliasi Bank',         '/kas/rekonsiliasi',                         'g-keuangan', 1111);
SELECT pasang_menu('keuangan-arus-kas',       'Arus Kas',                  '/keuangan/arus-kas',                        'g-keuangan', 1112);
SELECT pasang_menu('keuangan-profitabilitas', 'Profitabilitas',            '/keuangan/profitabilitas',                  'g-keuangan', 1113);
SELECT pasang_menu('pengaturan-keuangan',     'Konfigurasi Keuangan',      '/pengaturan/keuangan',                      'g-keuangan', 1114);

-- == 1200 AKUNTANSI -- taksonomi §14. Inti permintaan founder.
SELECT pasang_menu('akuntansi-jurnal',        'Jurnal Umum',               '/akuntansi?tab=jurnal',                     'g-akuntansi', 1201);
SELECT pasang_menu('akuntansi-akun',          'Bagan Akun (COA)',          '/akuntansi?tab=akun',                       'g-akuntansi', 1202);
SELECT pasang_menu('akuntansi-besar',         'Buku Besar',                '/akuntansi?tab=besar',                      'g-akuntansi', 1203);
SELECT pasang_menu('akuntansi-neraca',        'Neraca Saldo',              '/akuntansi?tab=neraca',                     'g-akuntansi', 1204);
SELECT pasang_menu('akuntansi-laporan',       'Neraca & Laba-Rugi',        '/akuntansi?tab=laporan',                    'g-akuntansi', 1205);
SELECT pasang_menu('akun-pajak',              'Pajak',                     '/akuntansi/pajak',                          'g-akuntansi', 1206, 'rencana');

-- == 1300 ALAT & ASET
SELECT pasang_menu('aset',                    'Aset & Alat',               '/aset',                                     'g-alat-aset', 1301);
SELECT pasang_menu('aset-operasional',        'Operasional Alat',          '/aset/operasional',                         'g-alat-aset', 1302);
SELECT pasang_menu('aset-perawatan',          'Jadwal Perawatan',          '/aset/perawatan',                           'g-alat-aset', 1303, 'rencana');

-- == 1400 DOKUMEN
SELECT pasang_menu('kd-gambar',               'Register Gambar',           '/dokumen/kendali?bagian=gambar',            'g-dokumen', 1401);
SELECT pasang_menu('kd-transmittal',          'Transmittal',               '/dokumen/kendali?bagian=transmittal',       'g-dokumen', 1402);
SELECT pasang_menu('kd-notulen',              'Notulen Rapat',             '/dokumen/kendali?bagian=notulen',           'g-dokumen', 1403);
SELECT pasang_menu('kd-jadwal',               'Laporan Terjadwal',         '/dokumen/kendali?bagian=jadwal',            'g-dokumen', 1404);

-- == 1500 PELAPORAN & BI -- dulu /laporan nyempil di Estimasi & Biaya.
SELECT pasang_menu('laporan',                 'Laporan & BI',              '/laporan',                                  'g-pelaporan', 1501);
SELECT pasang_menu('peta-modul',              'Peta Modul',                '/peta-modul',                               'g-pelaporan', 1502);

-- == 1600 ADMINISTRASI -- HANYA pengaturan SISTEM.
SELECT pasang_menu('users',                   'Pengguna & Role',           '/users',                                    'g-administrasi', 1601);
SELECT pasang_menu('pengaturan-roles',        'Matriks Izin',              '/pengaturan/roles',                         'g-administrasi', 1602);
SELECT pasang_menu('pengaturan-approval',     'Rantai Approval',           '/pengaturan/approval',                      'g-administrasi', 1603);
SELECT pasang_menu('notifications',           'Notifikasi',                '/notifications',                            'g-administrasi', 1604);
SELECT pasang_menu('pengaturan-notifikasi',   'Aturan Notifikasi',         '/pengaturan/notifikasi',                    'g-administrasi', 1605);
SELECT pasang_menu('pengaturan',              'Profil Perusahaan',         '/pengaturan',                               'g-administrasi', 1606);
SELECT pasang_menu('pengaturan-situs',        'Situs Publik',              '/pengaturan/situs',                         'g-administrasi', 1607);
SELECT pasang_menu('audit',                   'Audit Log',                 '/audit',                                    'g-administrasi', 1608);
SELECT pasang_menu('sistem',                  'Pemeliharaan Sistem',       '/sistem',                                   'g-administrasi', 1609);

DROP FUNCTION IF EXISTS pasang_menu(TEXT, TEXT, TEXT, TEXT, INT, TEXT, TEXT[]);

-- ------------------------------------------------------------
-- 4. VERIFIKASI
-- ------------------------------------------------------------
DO $$
DECLARE
  v_induk INT; v_anak INT; v_yatim INT; v_ganda TEXT; v_rencana INT;
BEGIN
  SELECT count(*) INTO v_induk FROM menu_items WHERE is_active AND parent_id IS NULL;
  SELECT count(*) INTO v_anak  FROM menu_items WHERE is_active AND parent_id IS NOT NULL;
  SELECT count(*) INTO v_rencana FROM menu_items WHERE is_active AND kesiapan = 'rencana';

  IF v_induk < 15 THEN
    RAISE EXCEPTION '241 gagal: grup induk hanya %, diharapkan >= 15', v_induk;
  END IF;

  -- Master Data WAJIB ada — itu inti perbaikan ini.
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'g-master-data' AND is_active) THEN
    RAISE EXCEPTION '241 gagal: grup Master Data tidak terbentuk';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'g-akuntansi' AND is_active) THEN
    RAISE EXCEPTION '241 gagal: grup Akuntansi tidak terbentuk';
  END IF;

  -- Akuntansi TIDAK boleh lagi berada di bawah Estimasi.
  IF EXISTS (
    SELECT 1 FROM menu_items m JOIN menu_items p ON p.id = m.parent_id
     WHERE m.key = 'akun-jurnal' AND p.key <> 'g-akuntansi') THEN
    RAISE EXCEPTION '241 gagal: Jurnal Umum masih di grup yang salah';
  END IF;

  -- Anak yatim: induknya nonaktif tapi anaknya masih aktif.
  SELECT count(*) INTO v_yatim
    FROM menu_items m JOIN menu_items p ON p.id = m.parent_id
   WHERE m.is_active AND NOT p.is_active;
  IF v_yatim > 0 THEN
    RAISE EXCEPTION '241 gagal: % menu aktif bergantung induk nonaktif', v_yatim;
  END IF;

  -- R-1 migrasi 232: satu route, satu link.
  SELECT string_agg(href, ', ') INTO v_ganda
    FROM (SELECT href FROM menu_items
           WHERE is_active AND href IS NOT NULL
           GROUP BY href HAVING count(*) > 1) s;
  IF v_ganda IS NOT NULL THEN
    RAISE EXCEPTION '241 gagal: href dipakai lebih dari satu menu aktif: %', v_ganda;
  END IF;

  RAISE NOTICE '241 OK — % induk, % anak (% berlabel rencana)', v_induk, v_anak, v_rencana;
END $$;
