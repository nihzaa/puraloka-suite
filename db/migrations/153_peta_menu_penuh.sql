-- Migration 153: Peta menu penuh — 20 grup, 202 sub-menu
--
-- ⚠️ BERKAS INI DI-GENERATE. Jangan sunting langsung.
--    Sumber: apps/web/lib/peta-menu.ts
--    Perintah: node apps/api/scripts/gen-migrasi-menu.mjs
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA MENDAFTARKAN MENU YANG HALAMANNYA BELUM ADA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Sampai sekarang sidebar hanya memuat 26 menu — yang kebetulan sudah
-- dibangun. Akibatnya tak seorang pun bisa melihat PETA: apa yang ada, apa
-- yang belum, dan di mana sebuah fitur akan tinggal nanti. Founder memintanya
-- eksplisit: daftarkan semua yang nantinya akan ada.
--
-- Menu tanpa halaman sendiri menunjuk ke `/m/<key>` — halaman yang menjelaskan
-- APA yang akan dikerjakan di situ, KENAPA belum ada, dan KE MANA sementara
-- ini. Bukan "coming soon" seragam: "menunggu tender mensyaratkan" berbeda
-- jauh dari "belum sempat", dan menyamakannya membuat 100+ halaman terbaca
-- sebagai utang padahal sebagian adalah keputusan sadar.
--
-- ── Yang SENGAJA tidak dilakukan
--
-- Tidak menambah permission baru. Seluruh menu memakai `required_permissions`
-- kosong (terlihat semua role yang bisa masuk dashboard) KECUALI yang mewarisi
-- dari menu lamanya. Alasannya: 202 permission baru berarti 202 baris yang
-- harus di-seed ke tiap role, dan satu yang terlewat = menu hilang tanpa
-- pesan kesalahan. Pembatasan akses per-menu adalah pekerjaan tersendiri yang
-- pantas dilakukan setelah halamannya benar-benar ada.

BEGIN;

-- Menu lama yang kini jadi anak salah satu grup dinonaktifkan lebih dulu,
-- supaya tak muncul dua kali (sekali sebagai menu tingkat atas, sekali di
-- dalam grup). Data lamanya TIDAK dihapus — `is_active=false` bisa dibalik.
UPDATE menu_items SET is_active = false, updated_at = now()
 WHERE parent_id IS NULL
   AND key NOT IN (SELECT unnest(ARRAY['g-master', 'g-crm', 'g-kontrak', 'g-jadwal', 'g-cost', 'g-procurement', 'g-inventory', 'g-subkon', 'g-lapangan', 'g-qaqc', 'g-hse', 'g-hr', 'g-aset', 'g-keuangan', 'g-tagih', 'g-dokumen', 'g-risiko', 'g-laporan', 'g-sistem', 'g-mobile']));

-- Tabel sementara: memuat seluruh baris apa adanya, lalu parent-nya
-- di-resolve dari `key` ke UUID. Menulis UUID langsung mustahil — id grup
-- baru diketahui setelah baris grupnya masuk.
CREATE TEMP TABLE _menu_baru (
  key TEXT, label TEXT, href TEXT, icon TEXT,
  parent_key TEXT, sort_order INT, section TEXT
) ON COMMIT DROP;

INSERT INTO _menu_baru (key, label, href, icon, parent_key, sort_order, section) VALUES
  ('g-master', 'Master Data', NULL, 'Database', NULL, 100, 'main'),
  ('md-perusahaan', 'Badan Usaha', '/pengaturan/perusahaan', 'Dot', 'g-master', 101, 'main'),
  ('md-coa', 'Chart of Accounts', '/m/md-coa', 'Dot', 'g-master', 102, 'main'),
  ('md-cost-code', 'Cost Code / CBS', '/estimasi', 'Dot', 'g-master', 103, 'main'),
  ('md-wbs-template', 'Template WBS', '/m/md-wbs-template', 'Dot', 'g-master', 104, 'main'),
  ('md-resource', 'Master Resource', '/estimasi', 'Dot', 'g-master', 105, 'main'),
  ('md-price-book', 'Price Book', '/estimasi', 'Dot', 'g-master', 106, 'main'),
  ('md-satuan', 'Satuan', '/pengaturan/satuan', 'Dot', 'g-master', 107, 'main'),
  ('md-supplier', 'Supplier', '/procurement', 'Dot', 'g-master', 108, 'main'),
  ('md-prakualifikasi', 'Prakualifikasi Vendor', '/m/md-prakualifikasi', 'Dot', 'g-master', 109, 'main'),
  ('md-subkon', 'Subkontraktor', '/mandor', 'Dot', 'g-master', 110, 'main'),
  ('md-klien', 'Klien', '/klien', 'Dot', 'g-master', 111, 'main'),
  ('md-karyawan', 'Karyawan', '/users', 'Dot', 'g-master', 112, 'main'),
  ('md-aset', 'Aset & Alat', '/aset', 'Dot', 'g-master', 113, 'main'),
  ('md-gudang', 'Gudang & Lokasi', '/procurement', 'Dot', 'g-master', 114, 'main'),
  ('md-pajak', 'Konfigurasi Pajak', '/pengaturan/keuangan', 'Dot', 'g-master', 115, 'main'),
  ('md-kalender', 'Kalender Kerja', '/m/md-kalender', 'Dot', 'g-master', 116, 'main'),
  ('md-penomoran', 'Penomoran Dokumen', '/m/md-penomoran', 'Dot', 'g-master', 117, 'main'),
  ('md-template-dok', 'Template Dokumen', '/m/md-template-dok', 'Dot', 'g-master', 118, 'main'),
  ('g-crm', 'Pra-Konstruksi', NULL, 'Gavel', NULL, 200, 'main'),
  ('crm-lead', 'Pipeline Lead', '/tender', 'Dot', 'g-crm', 201, 'main'),
  ('crm-tender', 'Register Tender', '/tender', 'Dot', 'g-crm', 202, 'main'),
  ('crm-gonogo', 'Keputusan Go / No-Go', '/tender', 'Dot', 'g-crm', 203, 'main'),
  ('crm-prakualifikasi', 'Dokumen Prakualifikasi', '/m/crm-prakualifikasi', 'Dot', 'g-crm', 204, 'main'),
  ('crm-estimating', 'Estimating / AHSP', '/estimasi', 'Dot', 'g-crm', 205, 'main'),
  ('crm-boq', 'Quantity Takeoff / BOQ', '/estimasi', 'Dot', 'g-crm', 206, 'main'),
  ('crm-skenario', 'Skenario Penawaran', '/m/crm-skenario', 'Dot', 'g-crm', 207, 'main'),
  ('crm-markup', 'Markup & Margin', '/m/crm-markup', 'Dot', 'g-crm', 208, 'main'),
  ('crm-eskalasi', 'Eskalasi Harga', '/m/crm-eskalasi', 'Dot', 'g-crm', 209, 'main'),
  ('crm-proposal', 'Dokumen Penawaran', '/m/crm-proposal', 'Dot', 'g-crm', 210, 'main'),
  ('crm-bidbond', 'Jaminan Penawaran', '/proyek', 'Dot', 'g-crm', 211, 'main'),
  ('crm-winloss', 'Analisa Menang/Kalah', '/tender', 'Dot', 'g-crm', 212, 'main'),
  ('crm-backlog', 'Backlog / Order Book', '/tender', 'Dot', 'g-crm', 213, 'main'),
  ('g-kontrak', 'Kontrak', NULL, 'FileSignature', NULL, 300, 'main'),
  ('kt-register', 'Register Kontrak', '/proyek', 'Dot', 'g-kontrak', 301, 'main'),
  ('kt-termin', 'Termin Pembayaran', '/keuangan', 'Dot', 'g-kontrak', 302, 'main'),
  ('kt-retensi', 'Retensi', '/piutang', 'Dot', 'g-kontrak', 303, 'main'),
  ('kt-co', 'Change Order', '/proyek', 'Dot', 'g-kontrak', 304, 'main'),
  ('kt-claims', 'Claims', '/m/kt-claims', 'Dot', 'g-kontrak', 305, 'main'),
  ('kt-eot', 'Perpanjangan Waktu (EOT)', '/proyek', 'Dot', 'g-kontrak', 306, 'main'),
  ('kt-ld', 'Denda Keterlambatan', '/proyek', 'Dot', 'g-kontrak', 307, 'main'),
  ('kt-bond', 'Register Jaminan', '/proyek', 'Dot', 'g-kontrak', 308, 'main'),
  ('kt-asuransi', 'Register Asuransi', '/m/kt-asuransi', 'Dot', 'g-kontrak', 309, 'main'),
  ('kt-surat', 'Surat Masuk & Keluar', '/m/kt-surat', 'Dot', 'g-kontrak', 310, 'main'),
  ('kt-subkon', 'Kontrak Subkontraktor', '/mandor', 'Dot', 'g-kontrak', 311, 'main'),
  ('g-jadwal', 'Perencanaan', NULL, 'CalendarRange', NULL, 400, 'main'),
  ('jd-wbs', 'WBS Proyek', '/proyek', 'Dot', 'g-jadwal', 401, 'main'),
  ('jd-baseline', 'Baseline Schedule', '/m/jd-baseline', 'Dot', 'g-jadwal', 402, 'main'),
  ('jd-gantt', 'Gantt Chart', '/proyek', 'Dot', 'g-jadwal', 403, 'main'),
  ('jd-cpm', 'Jalur Kritis (CPM)', '/m/jd-cpm', 'Dot', 'g-jadwal', 404, 'main'),
  ('jd-kurva-s', 'Kurva S', '/proyek', 'Dot', 'g-jadwal', 405, 'main'),
  ('jd-histogram', 'Histogram Sumber Daya', '/m/jd-histogram', 'Dot', 'g-jadwal', 406, 'main'),
  ('jd-lookahead', 'Look-Ahead 3 Minggu', '/proyek', 'Dot', 'g-jadwal', 407, 'main'),
  ('jd-milestone', 'Milestone', '/proyek', 'Dot', 'g-jadwal', 408, 'main'),
  ('jd-evm', 'Earned Value (EVM)', '/proyek', 'Dot', 'g-jadwal', 409, 'main'),
  ('jd-delay', 'Analisa Keterlambatan', '/m/jd-delay', 'Dot', 'g-jadwal', 410, 'main'),
  ('jd-method', 'Method Statement', '/m/jd-method', 'Dot', 'g-jadwal', 411, 'main'),
  ('g-cost', 'Budget & Cost Control', NULL, 'Calculator', NULL, 500, 'main'),
  ('cc-rab', 'RAB', '/proyek', 'Dot', 'g-cost', 501, 'main'),
  ('cc-rap', 'RAP', '/estimasi', 'Dot', 'g-cost', 502, 'main'),
  ('cc-revisi', 'Revisi Anggaran', '/m/cc-revisi', 'Dot', 'g-cost', 503, 'main'),
  ('cc-commitment', 'Commitment Tracking', '/estimasi', 'Dot', 'g-cost', 504, 'main'),
  ('cc-acl', 'Actual Cost Ledger', '/estimasi', 'Dot', 'g-cost', 505, 'main'),
  ('cc-etc', 'Cost-to-Complete', '/proyek', 'Dot', 'g-cost', 506, 'main'),
  ('cc-cashflow', 'Proyeksi Kas', '/estimasi', 'Dot', 'g-cost', 507, 'main'),
  ('cc-contingency', 'Manajemen Contingency', '/m/cc-contingency', 'Dot', 'g-cost', 508, 'main'),
  ('cc-varians', 'Analisa Varians', '/estimasi', 'Dot', 'g-cost', 509, 'main'),
  ('cc-profit', 'Profitabilitas Proyek', '/laporan', 'Dot', 'g-cost', 510, 'main'),
  ('cc-wip', 'WIP / PSAK', '/laporan', 'Dot', 'g-cost', 511, 'main'),
  ('cc-cvr', 'Cost Value Reconciliation', '/m/cc-cvr', 'Dot', 'g-cost', 512, 'main'),
  ('cc-pagu-material', 'Pagu Belanja Material', '/estimasi', 'Dot', 'g-cost', 513, 'main'),
  ('cc-bac', 'Cost Baseline (BAC)', '/proyek', 'Dot', 'g-cost', 514, 'main'),
  ('g-procurement', 'Pengadaan', NULL, 'ShoppingCart', NULL, 600, 'main'),
  ('pr-mr', 'Material Request', '/procurement', 'Dot', 'g-procurement', 601, 'main'),
  ('pr-rfq', 'RFQ ke Vendor', '/m/pr-rfq', 'Dot', 'g-procurement', 602, 'main'),
  ('pr-tabulasi', 'Perbandingan Penawaran', '/m/pr-tabulasi', 'Dot', 'g-procurement', 603, 'main'),
  ('pr-po', 'Purchase Order', '/procurement', 'Dot', 'g-procurement', 604, 'main'),
  ('pr-blanket', 'Kontrak Payung', '/m/pr-blanket', 'Dot', 'g-procurement', 605, 'main'),
  ('pr-grn', 'Goods Receipt', '/procurement', 'Dot', 'g-procurement', 606, 'main'),
  ('pr-3way', '3-Way Match', '/procurement', 'Dot', 'g-procurement', 607, 'main'),
  ('pr-evaluasi', 'Evaluasi Kinerja Vendor', '/m/pr-evaluasi', 'Dot', 'g-procurement', 608, 'main'),
  ('pr-jadwal-bayar', 'Jadwal Bayar Vendor', '/procurement', 'Dot', 'g-procurement', 609, 'main'),
  ('pr-expediting', 'Expediting & Logistik', '/m/pr-expediting', 'Dot', 'g-procurement', 610, 'main'),
  ('g-inventory', 'Gudang & Material', NULL, 'Package', NULL, 700, 'main'),
  ('iv-gudang', 'Gudang Proyek', '/procurement', 'Dot', 'g-inventory', 701, 'main'),
  ('iv-mutasi', 'Stok Masuk & Keluar', '/procurement', 'Dot', 'g-inventory', 702, 'main'),
  ('iv-transfer', 'Transfer Antar Proyek', '/m/iv-transfer', 'Dot', 'g-inventory', 703, 'main'),
  ('iv-opname', 'Stock Opname', '/procurement', 'Dot', 'g-inventory', 704, 'main'),
  ('iv-minstok', 'Minimum Stok', '/procurement', 'Dot', 'g-inventory', 705, 'main'),
  ('iv-rekonsiliasi', 'Rekonsiliasi Material', '/m/iv-rekonsiliasi', 'Dot', 'g-inventory', 706, 'main'),
  ('iv-waste', 'Tracking Waste', '/m/iv-waste', 'Dot', 'g-inventory', 707, 'main'),
  ('g-subkon', 'Mandor & Subkon', NULL, 'HardHat', NULL, 800, 'main'),
  ('sk-paket', 'Paket Subkontrak', '/mandor', 'Dot', 'g-subkon', 801, 'main'),
  ('sk-tender', 'Tender Subkontraktor', '/m/sk-tender', 'Dot', 'g-subkon', 802, 'main'),
  ('sk-kontrak', 'Kontrak & BOQ Subkon', '/mandor', 'Dot', 'g-subkon', 803, 'main'),
  ('sk-wo', 'Work Order', '/mandor', 'Dot', 'g-subkon', 804, 'main'),
  ('sk-opname', 'Opname Bersama', '/proyek', 'Dot', 'g-subkon', 805, 'main'),
  ('sk-claim', 'Progress Claim', '/mandor', 'Dot', 'g-subkon', 806, 'main'),
  ('sk-retensi', 'Retensi Subkon', '/m/sk-retensi', 'Dot', 'g-subkon', 807, 'main'),
  ('sk-backcharge', 'Back-Charge', '/mandor', 'Dot', 'g-subkon', 808, 'main'),
  ('sk-evaluasi', 'Evaluasi Subkon', '/m/sk-evaluasi', 'Dot', 'g-subkon', 809, 'main'),
  ('sk-kepatuhan', 'Kepatuhan Subkon', '/m/sk-kepatuhan', 'Dot', 'g-subkon', 810, 'main'),
  ('sk-mandor', 'Manajemen Mandor', '/mandor', 'Dot', 'g-subkon', 811, 'main'),
  ('sk-kasbon', 'Kasbon', '/mandor', 'Dot', 'g-subkon', 812, 'main'),
  ('sk-upah', 'Upah Harian & Borongan', '/mandor', 'Dot', 'g-subkon', 813, 'main'),
  ('sk-settlement', 'Settlement Borongan', '/mandor', 'Dot', 'g-subkon', 814, 'main'),
  ('g-lapangan', 'Operasi Lapangan', NULL, 'ClipboardList', NULL, 900, 'main'),
  ('lp-dpr', 'Laporan Harian', '/proyek', 'Dot', 'g-lapangan', 901, 'main'),
  ('lp-tenaga', 'Log Tenaga Kerja', '/mandor', 'Dot', 'g-lapangan', 902, 'main'),
  ('lp-alat', 'Log Pemakaian Alat', '/m/lp-alat', 'Dot', 'g-lapangan', 903, 'main'),
  ('lp-cuaca', 'Log Cuaca', '/proyek', 'Dot', 'g-lapangan', 904, 'main'),
  ('lp-instruksi', 'Instruksi Lapangan', '/m/lp-instruksi', 'Dot', 'g-lapangan', 905, 'main'),
  ('lp-permit', 'Izin Kerja', '/m/lp-permit', 'Dot', 'g-lapangan', 906, 'main'),
  ('lp-rfi', 'Request for Inspection', '/m/lp-rfi', 'Dot', 'g-lapangan', 907, 'main'),
  ('lp-submittal', 'Submittal Register', '/m/lp-submittal', 'Dot', 'g-lapangan', 908, 'main'),
  ('lp-ncr', 'Non-Conformance Report', '/m/lp-ncr', 'Dot', 'g-lapangan', 909, 'main'),
  ('lp-punch', 'Punch List', '/m/lp-punch', 'Dot', 'g-lapangan', 910, 'main'),
  ('lp-foto', 'Dokumentasi Foto', '/proyek', 'Dot', 'g-lapangan', 911, 'main'),
  ('lp-serah', 'Serah Terima (PHO/FHO)', '/proyek', 'Dot', 'g-lapangan', 912, 'main'),
  ('g-qaqc', 'Mutu (QA/QC)', NULL, 'BadgeCheck', NULL, 1000, 'main'),
  ('qc-rencana', 'Rencana Mutu Proyek', '/m/qc-rencana', 'Dot', 'g-qaqc', 1001, 'main'),
  ('qc-itp', 'Inspection & Test Plan', '/m/qc-itp', 'Dot', 'g-qaqc', 1002, 'main'),
  ('qc-checklist', 'Checklist Inspeksi', '/m/qc-checklist', 'Dot', 'g-qaqc', 1003, 'main'),
  ('qc-uji', 'Hasil Uji Material', '/m/qc-uji', 'Dot', 'g-qaqc', 1004, 'main'),
  ('qc-ncr', 'Register NCR', '/m/qc-ncr', 'Dot', 'g-qaqc', 1005, 'main'),
  ('qc-capa', 'Tindakan Korektif', '/m/qc-capa', 'Dot', 'g-qaqc', 1006, 'main'),
  ('qc-audit', 'Audit Mutu', '/m/qc-audit', 'Dot', 'g-qaqc', 1007, 'main'),
  ('g-hse', 'K3 & Lingkungan', NULL, 'ShieldAlert', NULL, 1100, 'main'),
  ('hse-rk3k', 'RK3K', '/m/hse-rk3k', 'Dot', 'g-hse', 1101, 'main'),
  ('hse-jsa', 'Job Safety Analysis', '/m/hse-jsa', 'Dot', 'g-hse', 1102, 'main'),
  ('hse-induksi', 'Induksi & Pelatihan K3', '/m/hse-induksi', 'Dot', 'g-hse', 1103, 'main'),
  ('hse-apd', 'Alat Pelindung Diri', '/m/hse-apd', 'Dot', 'g-hse', 1104, 'main'),
  ('hse-inspeksi', 'Inspeksi K3', '/m/hse-inspeksi', 'Dot', 'g-hse', 1105, 'main'),
  ('hse-insiden', 'Laporan Insiden', '/m/hse-insiden', 'Dot', 'g-hse', 1106, 'main'),
  ('hse-lingkungan', 'Pengelolaan Lingkungan', '/m/hse-lingkungan', 'Dot', 'g-hse', 1107, 'main'),
  ('g-hr', 'SDM & Payroll', NULL, 'Users', NULL, 1200, 'main'),
  ('hr-karyawan', 'Data Karyawan', '/users', 'Dot', 'g-hr', 1201, 'main'),
  ('hr-rekrutmen', 'Rekrutmen', '/m/hr-rekrutmen', 'Dot', 'g-hr', 1202, 'main'),
  ('hr-absensi', 'Absensi & Timesheet', '/m/hr-absensi', 'Dot', 'g-hr', 1203, 'main'),
  ('hr-cuti', 'Cuti & Izin', '/m/hr-cuti', 'Dot', 'g-hr', 1204, 'main'),
  ('hr-payroll', 'Payroll Staf', '/m/hr-payroll', 'Dot', 'g-hr', 1205, 'main'),
  ('hr-upah', 'Upah Harian Lapangan', '/mandor', 'Dot', 'g-hr', 1206, 'main'),
  ('hr-bpjs', 'BPJS & Potongan', '/m/hr-bpjs', 'Dot', 'g-hr', 1207, 'main'),
  ('hr-pph21', 'PPh 21', '/m/hr-pph21', 'Dot', 'g-hr', 1208, 'main'),
  ('hr-sertifikasi', 'Sertifikasi & Kompetensi', '/m/hr-sertifikasi', 'Dot', 'g-hr', 1209, 'main'),
  ('hr-kinerja', 'Penilaian Kinerja', '/m/hr-kinerja', 'Dot', 'g-hr', 1210, 'main'),
  ('hr-reimburse', 'Klaim Perjalanan', '/kas', 'Dot', 'g-hr', 1211, 'main'),
  ('g-aset', 'Alat & Aset', NULL, 'Truck', NULL, 1300, 'main'),
  ('as-register', 'Register Aset', '/aset', 'Dot', 'g-aset', 1301, 'main'),
  ('as-mutasi', 'Mutasi Antar Proyek', '/aset', 'Dot', 'g-aset', 1302, 'main'),
  ('as-penyusutan', 'Penyusutan', '/aset', 'Dot', 'g-aset', 1303, 'main'),
  ('as-sewa', 'Sewa Alat', '/aset', 'Dot', 'g-aset', 1304, 'main'),
  ('as-utilisasi', 'Utilisasi', '/aset', 'Dot', 'g-aset', 1305, 'main'),
  ('as-maintenance', 'Maintenance Terjadwal', '/m/as-maintenance', 'Dot', 'g-aset', 1306, 'main'),
  ('as-opex', 'Biaya Operasional Alat', '/m/as-opex', 'Dot', 'g-aset', 1307, 'main'),
  ('as-gl', 'Penyusutan → Jurnal', '/m/as-gl', 'Dot', 'g-aset', 1308, 'main'),
  ('g-keuangan', 'Keuangan', NULL, 'Landmark', NULL, 1400, 'main'),
  ('fn-gl', 'Buku Besar', '/m/fn-gl', 'Dot', 'g-keuangan', 1401, 'main'),
  ('fn-jurnal', 'Jurnal Umum', '/m/fn-jurnal', 'Dot', 'g-keuangan', 1402, 'main'),
  ('fn-ap', 'Utang Supplier', '/procurement', 'Dot', 'g-keuangan', 1403, 'main'),
  ('fn-ar', 'Piutang Klien', '/piutang', 'Dot', 'g-keuangan', 1404, 'main'),
  ('fn-kas', 'Kas & Bank', '/kas', 'Dot', 'g-keuangan', 1405, 'main'),
  ('fn-rekonsiliasi', 'Rekonsiliasi Bank', '/m/fn-rekonsiliasi', 'Dot', 'g-keuangan', 1406, 'main'),
  ('fn-petty', 'Kas Kecil', '/kas', 'Dot', 'g-keuangan', 1407, 'main'),
  ('fn-aset-tetap', 'Aset Tetap', '/aset', 'Dot', 'g-keuangan', 1408, 'main'),
  ('fn-pajak', 'PPN & PPh', '/laporan', 'Dot', 'g-keuangan', 1409, 'main'),
  ('fn-efaktur', 'e-Faktur & e-Bupot', '/laporan', 'Dot', 'g-keuangan', 1410, 'main'),
  ('fn-laporan', 'Laporan Keuangan', '/laporan', 'Dot', 'g-keuangan', 1411, 'main'),
  ('fn-wip', 'Pengakuan Pendapatan', '/laporan', 'Dot', 'g-keuangan', 1412, 'main'),
  ('fn-tutup-buku', 'Tutup Buku', '/m/fn-tutup-buku', 'Dot', 'g-keuangan', 1413, 'main'),
  ('fn-audit', 'Audit Trail', '/audit', 'Dot', 'g-keuangan', 1414, 'main'),
  ('g-tagih', 'Penagihan', NULL, 'Receipt', NULL, 1500, 'main'),
  ('tg-progress', 'Progress Billing', '/keuangan', 'Dot', 'g-tagih', 1501, 'main'),
  ('tg-termin', 'Termin', '/keuangan', 'Dot', 'g-tagih', 1502, 'main'),
  ('tg-ipc', 'Interim Payment Certificate', '/m/tg-ipc', 'Dot', 'g-tagih', 1503, 'main'),
  ('tg-retensi', 'Pelepasan Retensi', '/piutang', 'Dot', 'g-tagih', 1504, 'main'),
  ('tg-uangmuka', 'Pemotongan Uang Muka', '/piutang', 'Dot', 'g-tagih', 1505, 'main'),
  ('tg-tambah', 'Tagihan Pekerjaan Tambah', '/keuangan', 'Dot', 'g-tagih', 1506, 'main'),
  ('tg-invoice', 'Invoice & Faktur Pajak', '/keuangan', 'Dot', 'g-tagih', 1507, 'main'),
  ('tg-followup', 'Follow-Up Penagihan', '/piutang', 'Dot', 'g-tagih', 1508, 'main'),
  ('tg-nota-kredit', 'Nota Kredit', '/m/tg-nota-kredit', 'Dot', 'g-tagih', 1509, 'main'),
  ('g-dokumen', 'Dokumen', NULL, 'FolderOpen', NULL, 1600, 'main'),
  ('dk-register', 'Register Dokumen', '/proyek', 'Dot', 'g-dokumen', 1601, 'main'),
  ('dk-transmittal', 'Transmittal', '/m/dk-transmittal', 'Dot', 'g-dokumen', 1602, 'main'),
  ('dk-gambar', 'Register Gambar', '/m/dk-gambar', 'Dot', 'g-dokumen', 1603, 'main'),
  ('dk-notulen', 'Notulen Rapat', '/m/dk-notulen', 'Dot', 'g-dokumen', 1604, 'main'),
  ('dk-approval', 'Approval Dokumen', '/pengaturan/approval', 'Dot', 'g-dokumen', 1605, 'main'),
  ('dk-distribusi', 'Matriks Distribusi', '/m/dk-distribusi', 'Dot', 'g-dokumen', 1606, 'main'),
  ('dk-esign', 'Tanda Tangan Elektronik', '/m/dk-esign', 'Dot', 'g-dokumen', 1607, 'main'),
  ('g-risiko', 'Risiko & Kepatuhan', NULL, 'AlertTriangle', NULL, 1700, 'main'),
  ('rk-register', 'Register Risiko', '/m/rk-register', 'Dot', 'g-risiko', 1701, 'main'),
  ('rk-mitigasi', 'Rencana Mitigasi', '/m/rk-mitigasi', 'Dot', 'g-risiko', 1702, 'main'),
  ('rk-perizinan', 'Perizinan', '/m/rk-perizinan', 'Dot', 'g-risiko', 1703, 'main'),
  ('rk-kepatuhan', 'Kepatuhan Regulasi', '/m/rk-kepatuhan', 'Dot', 'g-risiko', 1704, 'main'),
  ('rk-sengketa', 'Sengketa & Klaim', '/m/rk-sengketa', 'Dot', 'g-risiko', 1705, 'main'),
  ('g-laporan', 'Laporan & BI', NULL, 'BarChart3', NULL, 1800, 'main'),
  ('bi-eksekutif', 'Dashboard Eksekutif', '/dashboard', 'Dot', 'g-laporan', 1801, 'main'),
  ('bi-proyek', 'Dashboard per Proyek', '/proyek', 'Dot', 'g-laporan', 1802, 'main'),
  ('bi-biaya', 'Laporan Biaya', '/laporan', 'Dot', 'g-laporan', 1803, 'main'),
  ('bi-arus-kas', 'Laporan Arus Kas', '/laporan', 'Dot', 'g-laporan', 1804, 'main'),
  ('bi-portofolio', 'Portofolio Biaya', '/laporan', 'Dot', 'g-laporan', 1805, 'main'),
  ('bi-kpi', 'KPI Perusahaan', '/laporan', 'Dot', 'g-laporan', 1806, 'main'),
  ('bi-builder', 'Report Builder', '/m/bi-builder', 'Dot', 'g-laporan', 1807, 'main'),
  ('bi-export', 'Ekspor Excel & PDF', '/laporan', 'Dot', 'g-laporan', 1808, 'main'),
  ('bi-terjadwal', 'Laporan Terjadwal', '/m/bi-terjadwal', 'Dot', 'g-laporan', 1809, 'main'),
  ('g-sistem', 'Administrasi', NULL, 'Settings', NULL, 1900, 'main'),
  ('sy-user', 'Pengguna & Role', '/users', 'Dot', 'g-sistem', 1901, 'main'),
  ('sy-permission', 'Matriks Izin', '/pengaturan/roles', 'Dot', 'g-sistem', 1902, 'main'),
  ('sy-approval', 'Konfigurasi Approval', '/pengaturan/approval', 'Dot', 'g-sistem', 1903, 'main'),
  ('sy-notifikasi', 'Aturan Notifikasi', '/pengaturan/notifikasi', 'Dot', 'g-sistem', 1904, 'main'),
  ('sy-penomoran', 'Konfigurasi Penomoran', '/m/sy-penomoran', 'Dot', 'g-sistem', 1905, 'main'),
  ('sy-audit', 'Audit Log', '/audit', 'Dot', 'g-sistem', 1906, 'main'),
  ('sy-api', 'API & Integrasi', '/m/sy-api', 'Dot', 'g-sistem', 1907, 'main'),
  ('sy-import', 'Impor & Ekspor Data', '/estimasi', 'Dot', 'g-sistem', 1908, 'main'),
  ('sy-modul', 'Modul & Feature Flag', '/pengaturan', 'Dot', 'g-sistem', 1909, 'main'),
  ('sy-sistem', 'Pemeliharaan Sistem', '/sistem', 'Dot', 'g-sistem', 1910, 'main'),
  ('g-mobile', 'Aplikasi Lapangan', NULL, 'Smartphone', NULL, 2000, 'main'),
  ('mb-absensi', 'Absensi Lapangan', '/m/mb-absensi', 'Dot', 'g-mobile', 2001, 'main'),
  ('mb-progres', 'Input Progres Mobile', '/m/mb-progres', 'Dot', 'g-mobile', 2002, 'main'),
  ('mb-geotag', 'Foto Geotag', '/m/mb-geotag', 'Dot', 'g-mobile', 2003, 'main'),
  ('mb-offline', 'Mode Offline', '/m/mb-offline', 'Dot', 'g-mobile', 2004, 'main'),
  ('mb-notif', 'Notifikasi Perangkat', '/notifications', 'Dot', 'g-mobile', 2005, 'main');

-- 1. Grup (parent_key NULL) — harus lebih dulu supaya anaknya punya induk.
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT n.key, n.label, n.href, n.icon, NULL, ARRAY[]::text[], n.sort_order, n.section, true
  FROM _menu_baru n WHERE n.parent_key IS NULL
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, href = EXCLUDED.href, icon = EXCLUDED.icon,
      parent_id = NULL, sort_order = EXCLUDED.sort_order,
      section = EXCLUDED.section, is_active = true, updated_at = now();

-- 2. Anak — parent_id di-resolve dari key induknya.
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT n.key, n.label, n.href, n.icon, p.id, ARRAY[]::text[], n.sort_order, n.section, true
  FROM _menu_baru n
  JOIN menu_items p ON p.key = n.parent_key
 WHERE n.parent_key IS NOT NULL
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, href = EXCLUDED.href, icon = EXCLUDED.icon,
      parent_id = EXCLUDED.parent_id, sort_order = EXCLUDED.sort_order,
      section = EXCLUDED.section, is_active = true, updated_at = now();

-- ── Verifikasi — gagal BERISIK ─────────────────────────────────────────────
DO $$
DECLARE v_grup INT; v_anak INT; v_yatim INT;
BEGIN
  SELECT count(*) INTO v_grup FROM menu_items
   WHERE parent_id IS NULL AND is_active AND section = 'main'
     AND key IN (SELECT key FROM _menu_baru WHERE parent_key IS NULL);
  IF v_grup <> 20 THEN
    RAISE EXCEPTION '153 GAGAL: % grup aktif, seharusnya 20', v_grup;
  END IF;

  SELECT count(*) INTO v_anak FROM menu_items m
    JOIN _menu_baru n ON n.key = m.key
   WHERE n.parent_key IS NOT NULL AND m.is_active;
  IF v_anak <> 202 THEN
    RAISE EXCEPTION '153 GAGAL: % sub-menu aktif, seharusnya 202', v_anak;
  END IF;

  -- Anak tanpa induk tak akan muncul di sidebar sama sekali — dan itu gagal
  -- dalam diam: menunya "hilang" tanpa pesan apa pun.
  SELECT count(*) INTO v_yatim FROM menu_items m
    JOIN _menu_baru n ON n.key = m.key
   WHERE n.parent_key IS NOT NULL AND m.parent_id IS NULL;
  IF v_yatim > 0 THEN
    RAISE EXCEPTION '153 GAGAL: % sub-menu tanpa induk — takkan muncul di sidebar', v_yatim;
  END IF;

  RAISE NOTICE '153 OK: % grup + % sub-menu aktif, nol yatim', v_grup, v_anak;
END $$;

COMMIT;
