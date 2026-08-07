-- ════════════════════════════════════════════════════════════════════════════
-- 232 — SIDEBAR DIROMBAK: satu route, satu link, tanpa pengecualian
--
-- ── Kenapa dirombak, bukan ditambal lagi
--
-- Sepanjang 2026-08-07 menu diperbaiki bertahap dari 144 item berbagi href
-- menjadi 23. Sisa 23 itu dipertahankan dengan alasan yang masuk akal: "staf HR
-- mencari upah di kelompok SDM, pelaksana di kelompok Mandor."
--
-- Alasan itu benar, tapi menyelesaikan masalah yang salah. Founder menunjuk ke
-- akarnya:
--
--   "ketika 1 halaman dibuka, link di sidebarnya harus aktif dan menu induknya
--    terbuka, tapi kalo link sidebar yg aktifnya 2 kan jadi aneh."
--
-- Selama satu route bisa dicapai dari dua tempat, penanda aktif TAK PUNYA
-- jawaban tunggal — dan `menu-berbagi-href.ts` hanya memilih salah satu untuk
-- disorot sambil meredupkan yang lain. Itu menyembunyikan gejala.
--
-- ── Tiga aturan, tanpa pengecualian
--
--   R-1  satu route = tepat satu link. Tidak ada sinonim lintas-kelompok.
--   R-2  kelompok adalah WADAH: `href` NULL, mengkliknya buka/tutup saja.
--   R-3  menu hanya untuk halaman yang ADA. Yang belum dibangun tidak muncul.
--
-- ── Angkanya
--
--   sebelum   228 item aktif · 100 ke halaman nyata (88 href unik) · 108 ke /m/
--   sesudah    88 item aktif ·  75 ke halaman nyata (75 href unik) · 0 ke /m/
--                              13 kelompok wadah
--
-- Sidebar menyusut 228 → 88, dan yang hilang SELURUHNYA janji, bukan fitur.
--
-- ── Ke mana 108 menu "belum dibangun" itu pergi
--
-- Ke halaman baru `/peta-modul`: seluruh modul beserta keadaannya (hidup ·
-- sebagian · rencana · gerbang · eksternal) dalam satu layar. Rencananya tetap
-- terbaca — yang berubah cara menyampaikannya. Satu halaman yang menjawab
-- "apa yang sudah bisa saya pakai" mengalahkan 108 item yang masing-masing
-- mengecewakan saat diklik.
--
-- Halaman `/m/<key>` TETAP HIDUP dan tetap bisa dibuka; ia hanya tak lagi
-- ditaut dari sidebar.
--
-- ── Cara kerja migrasi ini
--
-- 1. NONAKTIFKAN seluruh menu (bukan hapus — `company_menu_settings.menu_key`
--    bisa memuat acuannya, dan menghapus meninggalkan pengaturan yang
--    menunjuk sesuatu yang tak ada)
-- 2. AKTIFKAN + setel ulang 88 entri taksonomi baru lewat `ON CONFLICT`
-- 3. Verifikasi keras: href unik, kelompok tanpa href, nol /m/, tiap href
--    punya halamannya
--
-- Idempoten: langkah 1 menyapu bersih, langkah 2 menetapkan nilai akhir.
-- Dijalankan berapa kali pun hasilnya sama.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Sapu bersih ──────────────────────────────────────────────────────────
UPDATE menu_items SET is_active = false;

-- ── 2. Taksonomi baru ───────────────────────────────────────────────────────
--
-- Ikon anak SERAGAM (`Dot`), dan itu disengaja — konvensi yang sudah ditetapkan
-- di `sidebar.tsx`: "202 ikon berbeda justru menghapus fungsi ikon sebagai
-- penanda; saat semuanya bergambar, tak ada yang menonjol." Yang membedakan
-- anak adalah LABELNYA; ikon hanya penanda tingkat.
--
-- Nilai selain yang terdaftar di `ICONS` (sidebar.tsx) jatuh ke `FolderKanban`
-- tanpa satu pun galat — versi pertama migrasi ini memakai `Circle` yang tak
-- terdaftar, dan ke-74 anak muncul bergambar folder.
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('g-proyek', 'Proyek', NULL, 'FolderKanban', 100, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=NULL, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=NULL, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('g-kontrak', 'Kontrak', NULL, 'FileSignature', 200, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=NULL, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=NULL, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('g-estimasi-biaya', 'Estimasi & Biaya', NULL, 'Calculator', 300, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=NULL, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=NULL, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('g-keuangan', 'Keuangan', NULL, 'Landmark', 400, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=NULL, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=NULL, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('g-kas-bank', 'Kas & Bank', NULL, 'Wallet', 500, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=NULL, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=NULL, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('g-piutang', 'Piutang', NULL, 'HandCoins', 600, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=NULL, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=NULL, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('g-pengadaan', 'Pengadaan', NULL, 'ShoppingCart', 700, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=NULL, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=NULL, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('g-gudang', 'Gudang', NULL, 'Package', 800, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=NULL, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=NULL, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('g-mandor-subkon', 'Mandor & Subkon', NULL, 'HardHat', 900, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=NULL, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=NULL, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('g-lapangan', 'Lapangan', NULL, 'ClipboardList', 1000, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=NULL, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=NULL, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('g-mutu-kepatuhan', 'Mutu & Kepatuhan', NULL, 'ShieldCheck', 1100, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=NULL, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=NULL, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('g-alat-dokumen', 'Alat & Dokumen', NULL, 'Wrench', 1200, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=NULL, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=NULL, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('g-administrasi', 'Administrasi', NULL, 'Settings', 1300, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=NULL, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=NULL, is_active=true;

INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('beranda', 'Beranda', '/dashboard', 'LayoutDashboard', 10, 'main', NULL, true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('proyek', 'Daftar Proyek', '/proyek', 'Dot', 101, 'main', (SELECT id FROM menu_items WHERE key = 'g-proyek'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('proyek-keterlambatan', 'Keterlambatan', '/proyek/keterlambatan', 'Dot', 102, 'main', (SELECT id FROM menu_items WHERE key = 'g-proyek'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('jadwal', 'Jadwal & Jalur Kritis', '/jadwal', 'Dot', 103, 'main', (SELECT id FROM menu_items WHERE key = 'g-proyek'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('kalender', 'Kalender Kerja', '/kalender', 'Dot', 104, 'main', (SELECT id FROM menu_items WHERE key = 'g-proyek'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('klien', 'Klien', '/klien', 'Dot', 105, 'main', (SELECT id FROM menu_items WHERE key = 'g-proyek'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('kontrak', 'Register Kontrak', '/kontrak', 'Dot', 201, 'main', (SELECT id FROM menu_items WHERE key = 'g-kontrak'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('kontrak-rfi', 'RFI', '/kontrak/rfi', 'Dot', 202, 'main', (SELECT id FROM menu_items WHERE key = 'g-kontrak'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('kontrak-asuransi', 'Asuransi', '/kontrak/asuransi', 'Dot', 203, 'main', (SELECT id FROM menu_items WHERE key = 'g-kontrak'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('tender', 'Tender', '/tender', 'Dot', 204, 'main', (SELECT id FROM menu_items WHERE key = 'g-kontrak'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('estimasi', 'Estimasi & RAB', '/estimasi', 'Dot', 301, 'main', (SELECT id FROM menu_items WHERE key = 'g-estimasi-biaya'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('akuntansi', 'Akuntansi', '/akuntansi', 'Dot', 302, 'main', (SELECT id FROM menu_items WHERE key = 'g-estimasi-biaya'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('laporan', 'Laporan & BI', '/laporan', 'Dot', 303, 'main', (SELECT id FROM menu_items WHERE key = 'g-estimasi-biaya'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('keuangan', 'Ringkasan Keuangan', '/keuangan', 'Dot', 401, 'main', (SELECT id FROM menu_items WHERE key = 'g-keuangan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('keuangan-invoice', 'Invoice', '/keuangan/invoice', 'Dot', 402, 'main', (SELECT id FROM menu_items WHERE key = 'g-keuangan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('keuangan-pembayaran', 'Pembayaran Masuk', '/keuangan/pembayaran', 'Dot', 403, 'main', (SELECT id FROM menu_items WHERE key = 'g-keuangan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('keuangan-ipc', 'Sertifikat IPC', '/keuangan/ipc', 'Dot', 404, 'main', (SELECT id FROM menu_items WHERE key = 'g-keuangan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('keuangan-kasbon', 'Kasbon', '/keuangan/kasbon', 'Dot', 405, 'main', (SELECT id FROM menu_items WHERE key = 'g-keuangan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('keuangan-arus-kas', 'Arus Kas', '/keuangan/arus-kas', 'Dot', 406, 'main', (SELECT id FROM menu_items WHERE key = 'g-keuangan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('keuangan-profitabilitas', 'Profitabilitas', '/keuangan/profitabilitas', 'Dot', 407, 'main', (SELECT id FROM menu_items WHERE key = 'g-keuangan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('keuangan-contingency', 'Contingency', '/keuangan/contingency', 'Dot', 408, 'main', (SELECT id FROM menu_items WHERE key = 'g-keuangan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('kas', 'Ringkasan Kas', '/kas', 'Dot', 501, 'main', (SELECT id FROM menu_items WHERE key = 'g-kas-bank'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('kas-akun', 'Akun Kas', '/kas/akun', 'Dot', 502, 'main', (SELECT id FROM menu_items WHERE key = 'g-kas-bank'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('kas-pengeluaran', 'Pengeluaran', '/kas/pengeluaran', 'Dot', 503, 'main', (SELECT id FROM menu_items WHERE key = 'g-kas-bank'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('kas-transfer', 'Transfer', '/kas/transfer', 'Dot', 504, 'main', (SELECT id FROM menu_items WHERE key = 'g-kas-bank'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('piutang', 'Piutang & Retensi', '/piutang', 'Dot', 601, 'main', (SELECT id FROM menu_items WHERE key = 'g-piutang'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('procurement', 'Ringkasan Pengadaan', '/procurement', 'Dot', 701, 'main', (SELECT id FROM menu_items WHERE key = 'g-pengadaan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('procurement-permintaan', 'Permintaan Material', '/procurement/permintaan', 'Dot', 702, 'main', (SELECT id FROM menu_items WHERE key = 'g-pengadaan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('procurement-pesanan', 'Purchase Order', '/procurement/pesanan', 'Dot', 703, 'main', (SELECT id FROM menu_items WHERE key = 'g-pengadaan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('procurement-penerimaan', 'Penerimaan Barang', '/procurement/penerimaan', 'Dot', 704, 'main', (SELECT id FROM menu_items WHERE key = 'g-pengadaan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('procurement-supplier', 'Supplier', '/procurement/supplier', 'Dot', 705, 'main', (SELECT id FROM menu_items WHERE key = 'g-pengadaan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('procurement-kualifikasi', 'Kualifikasi Vendor', '/procurement/kualifikasi', 'Dot', 706, 'main', (SELECT id FROM menu_items WHERE key = 'g-pengadaan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('procurement-rfq', 'RFQ & Tabulasi', '/procurement/rfq', 'Dot', 707, 'main', (SELECT id FROM menu_items WHERE key = 'g-pengadaan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('procurement-riwayat-harga', 'Riwayat Harga', '/procurement/riwayat-harga', 'Dot', 708, 'main', (SELECT id FROM menu_items WHERE key = 'g-pengadaan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('procurement-lanjutan', 'Kontrak Payung & Logistik', '/procurement/lanjutan', 'Dot', 709, 'main', (SELECT id FROM menu_items WHERE key = 'g-pengadaan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('procurement-hutang', 'Utang Supplier', '/procurement/hutang', 'Dot', 710, 'main', (SELECT id FROM menu_items WHERE key = 'g-pengadaan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('procurement-material', 'Pagu Material', '/procurement/material', 'Dot', 711, 'main', (SELECT id FROM menu_items WHERE key = 'g-pengadaan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('procurement-stok', 'Stok', '/procurement/stok', 'Dot', 712, 'main', (SELECT id FROM menu_items WHERE key = 'g-pengadaan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('procurement-laporan', 'Laporan Pengadaan', '/procurement/laporan', 'Dot', 713, 'main', (SELECT id FROM menu_items WHERE key = 'g-pengadaan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('gudang-rekonsiliasi', 'Rekonsiliasi Material', '/gudang/rekonsiliasi', 'Dot', 801, 'main', (SELECT id FROM menu_items WHERE key = 'g-gudang'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('gudang-transfer', 'Transfer Antar Proyek', '/gudang/transfer', 'Dot', 802, 'main', (SELECT id FROM menu_items WHERE key = 'g-gudang'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('gudang-material-klien', 'Material Milik Klien', '/gudang/material-klien', 'Dot', 803, 'main', (SELECT id FROM menu_items WHERE key = 'g-gudang'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('mandor', 'Ringkasan Mandor', '/mandor', 'Dot', 901, 'main', (SELECT id FROM menu_items WHERE key = 'g-mandor-subkon'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('mandor-penugasan', 'Penugasan', '/mandor/penugasan', 'Dot', 902, 'main', (SELECT id FROM menu_items WHERE key = 'g-mandor-subkon'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('mandor-tukang', 'Daftar Tukang', '/mandor/tukang', 'Dot', 903, 'main', (SELECT id FROM menu_items WHERE key = 'g-mandor-subkon'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('mandor-absensi', 'Absensi', '/mandor/absensi', 'Dot', 904, 'main', (SELECT id FROM menu_items WHERE key = 'g-mandor-subkon'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('mandor-upah', 'Upah', '/mandor/upah', 'Dot', 905, 'main', (SELECT id FROM menu_items WHERE key = 'g-mandor-subkon'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('mandor-kasbon', 'Kasbon Tukang', '/mandor/kasbon', 'Dot', 906, 'main', (SELECT id FROM menu_items WHERE key = 'g-mandor-subkon'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('mandor-penagihan', 'Penagihan Progress', '/mandor/penagihan', 'Dot', 907, 'main', (SELECT id FROM menu_items WHERE key = 'g-mandor-subkon'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('mandor-retensi', 'Retensi Subkon', '/mandor/retensi', 'Dot', 908, 'main', (SELECT id FROM menu_items WHERE key = 'g-mandor-subkon'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('mandor-tender', 'Tender Subkon', '/mandor/tender', 'Dot', 909, 'main', (SELECT id FROM menu_items WHERE key = 'g-mandor-subkon'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('lapangan', 'Ringkasan Lapangan', '/lapangan', 'Dot', 1001, 'main', (SELECT id FROM menu_items WHERE key = 'g-lapangan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('lapangan-punch-list', 'Punch List', '/lapangan/punch-list', 'Dot', 1002, 'main', (SELECT id FROM menu_items WHERE key = 'g-lapangan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('lapangan-inspeksi', 'Inspeksi', '/lapangan/inspeksi', 'Dot', 1003, 'main', (SELECT id FROM menu_items WHERE key = 'g-lapangan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('lapangan-submittal', 'Submittal', '/lapangan/submittal', 'Dot', 1004, 'main', (SELECT id FROM menu_items WHERE key = 'g-lapangan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('mutu-ncr', 'NCR', '/mutu/ncr', 'Dot', 1101, 'main', (SELECT id FROM menu_items WHERE key = 'g-mutu-kepatuhan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('kepatuhan', 'Kepatuhan & K3', '/kepatuhan', 'Dot', 1102, 'main', (SELECT id FROM menu_items WHERE key = 'g-mutu-kepatuhan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('aset', 'Aset & Alat', '/aset', 'Dot', 1201, 'main', (SELECT id FROM menu_items WHERE key = 'g-alat-dokumen'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('aset-operasional', 'Operasional Alat', '/aset/operasional', 'Dot', 1202, 'main', (SELECT id FROM menu_items WHERE key = 'g-alat-dokumen'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('dokumen-kendali', 'Kendali Dokumen', '/dokumen/kendali', 'Dot', 1203, 'main', (SELECT id FROM menu_items WHERE key = 'g-alat-dokumen'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('users', 'Pengguna & Role', '/users', 'Dot', 1301, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('pengaturan-roles', 'Matriks Izin', '/pengaturan/roles', 'Dot', 1302, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('peta-modul', 'Peta Modul', '/peta-modul', 'Dot', 1303, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('notifications', 'Notifikasi', '/notifications', 'Dot', 1304, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('audit', 'Audit Log', '/audit', 'Dot', 1305, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('sistem', 'Pemeliharaan Sistem', '/sistem', 'Dot', 1306, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('pengaturan', 'Profil Perusahaan', '/pengaturan', 'Dot', 1307, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('pengaturan-perusahaan', 'Badan Usaha', '/pengaturan/perusahaan', 'Dot', 1308, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('pengaturan-keuangan', 'Konfigurasi Keuangan', '/pengaturan/keuangan', 'Dot', 1309, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('pengaturan-satuan', 'Satuan', '/pengaturan/satuan', 'Dot', 1310, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('pengaturan-kategori-pekerjaan', 'Kategori Pekerjaan', '/pengaturan/kategori-pekerjaan', 'Dot', 1311, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('pengaturan-kasbon-purposes', 'Tujuan Kasbon', '/pengaturan/kasbon-purposes', 'Dot', 1312, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('pengaturan-approval', 'Rantai Approval', '/pengaturan/approval', 'Dot', 1313, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('pengaturan-notifikasi', 'Aturan Notifikasi', '/pengaturan/notifikasi', 'Dot', 1314, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active)
VALUES ('pengaturan-situs', 'Situs Publik', '/pengaturan/situs', 'Dot', 1315, 'main', (SELECT id FROM menu_items WHERE key = 'g-administrasi'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;

-- ------------------------------------------------------------
-- 3. Verifikasi — inilah yang membuat aturannya mengikat, bukan sekadar niat
-- ------------------------------------------------------------
DO $$
DECLARE
  v_ganda   TEXT;
  v_grup    TEXT;
  v_comingsoon TEXT;
  v_yatim   TEXT;
  v_jml     INT;
BEGIN
  -- R-1: satu route = satu link. Ini aturan pokoknya; kalau ini lolos,
  -- seluruh rombakan ini kehilangan alasannya.
  SELECT string_agg(href || ' (' || n || ')', ', ' ORDER BY href) INTO v_ganda
    FROM (SELECT href, count(*) n FROM menu_items
           WHERE is_active AND href IS NOT NULL
           GROUP BY href HAVING count(*) > 1) x;
  IF v_ganda IS NOT NULL THEN
    RAISE EXCEPTION '232 gagal: href dipakai lebih dari satu link: %', v_ganda;
  END IF;

  -- R-2: kelompok tak punya tujuan sendiri.
  --
  -- Diukur dari STRUKTUR (punya anak), bukan dari nama key. Versi pertama
  -- memakai `key LIKE 'g-%'`, dan uji mutasinya LOLOS — bukan karena aturannya
  -- salah, melainkan karena `ON CONFLICT DO UPDATE` di atas menyetel href=NULL
  -- secara paksa, jadi mutasi apa pun pada baris kelompok terhapus sendiri.
  -- Pemeriksaan yang bergantung pada konvensi penamaan juga akan diam kalau
  -- kelak ada kelompok bernama lain.
  SELECT string_agg(p.key || '=' || p.href, ', ' ORDER BY p.key) INTO v_grup
    FROM menu_items p
   WHERE p.is_active AND p.href IS NOT NULL
     AND EXISTS (SELECT 1 FROM menu_items c WHERE c.parent_id = p.id AND c.is_active);
  IF v_grup IS NOT NULL THEN
    RAISE EXCEPTION '232 gagal: kelompok punya href: %', v_grup;
  END IF;

  -- R-3: nol menu menunjuk halaman "segera hadir".
  SELECT string_agg(key, ', ' ORDER BY key) INTO v_comingsoon
    FROM menu_items WHERE is_active AND href LIKE '/m/%';
  IF v_comingsoon IS NOT NULL THEN
    RAISE EXCEPTION '232 gagal: masih menunjuk /m/: %', v_comingsoon;
  END IF;

  -- Tiap item WAJIB punya induk kecuali Beranda. Anak berinduk mati akan
  -- naik ke root dan mencampur dua tingkat hierarki (cacat migrasi 222).
  SELECT string_agg(c.key, ', ' ORDER BY c.key) INTO v_yatim
    FROM menu_items c LEFT JOIN menu_items p ON p.id = c.parent_id
   WHERE c.is_active AND c.href IS NOT NULL AND c.key <> 'beranda'
     AND (p.id IS NULL OR NOT p.is_active);
  IF v_yatim IS NOT NULL THEN
    RAISE EXCEPTION '232 gagal: item tanpa induk aktif: %', v_yatim;
  END IF;

  -- Jumlahnya harus persis seperti yang dimaksud — kalau satu pernyataan
  -- INSERT hilang saat disunting, ini yang menangkapnya.
  SELECT count(*) INTO v_jml FROM menu_items WHERE is_active;
  IF v_jml <> 88 THEN
    RAISE EXCEPTION '232 gagal: menu aktif % , seharusnya 88', v_jml;
  END IF;
END $$;
