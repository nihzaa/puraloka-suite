-- ============================================================================
-- 364 — KATALOG ROLE KONTRAKTOR: 5 → 17, dengan pemisahan wewenang yang tegas
-- ============================================================================
--
-- Founder, 2026-08-14: *"masa role di ERP konstruksi besar cuma segini?"*
--
-- Diukur: 5 role terhadap 218 permission di 48 domain. Beberapa domain utuh
-- **tak punya satu pun role** yang memakainya — `k3:*` (11 izin) salah satunya,
-- padahal K3 wajib untuk proyek bersertifikasi SMK3. Izinnya sudah ditulis,
-- rolenya tak pernah dibuat, jadi satu-satunya cara memakainya adalah memberi
-- orang itu `admin`. Itu bukan konfigurasi; itu menyerah.
--
-- ── Tiga keputusan founder yang membentuk daftar ini (2026-08-14)
--
--   1. Role per-tenant sejak awal          → dikerjakan migrasi 363
--   2. SoD "pisah tegas"                   → membentuk 4 role keuangan
--   3. Keempat peran lapangan dipisah      → pelaksana, QA/QC, K3, logistik
--
-- ── Kenapa SoD bisa dibuat TANPA menambah satu izin pun
--
-- Katalog izinnya ternyata SUDAH dirancang terpisah, hanya belum ada yang
-- memakainya secara terpisah:
--
--     finance:invoice:create   ≠  finance:invoice:pay
--     cash:expense:create      ≠  cash:expense:approve
--     cash:transfer:create     ≠  cash:transfer:confirm
--     mandor:wage:create       ≠  mandor:wage:approve
--     klaim:kelola             ≠  klaim:setujui   ≠  klaim:bayar
--
-- Jadi "yang membuat tagihan ≠ yang menyetujui ≠ yang membayar" tinggal
-- disusun, bukan dibangun. Nol izin baru di migrasi ini — dan itu disengaja:
-- izin baru berarti gerbang baru di kode, dan gerbang yang tak dipanggil
-- siapa pun adalah keamanan yang cuma ada di atas kertas.
--
-- ── Yang TIDAK diubah pada role lama, dan kenapa
--
-- `direktur` dan `pm` memegang izin MEMBUAT dan MENYETUJUI sekaligus. Penjaga
-- versi pertama migrasi ini memerah karenanya, dan saya hampir menyimpulkan
-- "role lama melanggar SoD". Diukur lebih jauh: **tidak**.
--
-- `apps/api/src/lib/sod.ts` sudah menegakkan pemisahan di RUNTIME — pengaju
-- tak bisa menyetujui pengajuannya sendiri, siapa pun rolenya, dan override-nya
-- selalu meninggalkan jejak. Yang dilarang adalah ORANG YANG SAMA pada SATU
-- DOKUMEN, bukan role yang memegang kedua izin.
--
-- Mencabut salah satu izin dari `direktur` tak menambah keamanan apa pun
-- (penjagaannya ada di lapisan yang benar) tetapi akan menghentikan pekerjaan
-- nyata pada hari direktur satu-satunya sedang cuti. Role lama dibiarkan.
--
-- ── Aturan yang saya pegang saat menyusun
--
--   • Tak ada role selain `admin` yang memegang `settings:credentials:*`
--     (nilai kredensial tak pernah boleh keluar server — penjaga CI ambang NOL)
--   • Tak ada role selain `admin` yang memegang `approval:override_sod` —
--     wewenang untuk MELANGGAR pemisahan tak boleh ikut tersebar saat
--     pemisahannya baru dibuat
--   • `gl:periode:reopen` dan `gl:void` hanya Manajer Keuangan ke atas:
--     membuka periode yang sudah ditutup adalah cara termudah mengubah
--     angka yang sudah dilaporkan
--   • Peran lapangan TIDAK memegang izin uang mana pun, sekalipun terasa
--     praktis. Orang yang menilai pekerjaan tak boleh sekaligus mencairkan
--     bayarannya.
--
-- ── Bentuknya: TEMPLATE (company_id NULL), disalin per-tenant oleh 365
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Role baru sebagai template
-- ------------------------------------------------------------
INSERT INTO public.roles (name, label, description, is_builtin, is_template, portal, sort_order)
VALUES
  -- ── Pimpinan & proyek ──────────────────────────────────────────────────
  ('project_manager_senior', 'Manajer Proyek Senior',
   'Mengawasi beberapa proyek sekaligus; menyetujui perubahan lingkup dan klaim antar-proyek.',
   true, true, 'dashboard', 21),
  ('site_manager', 'Manajer Lapangan / Pelaksana',
   'Kepala lapangan satu proyek: mengatur mandor, meminta material, memverifikasi opname. Tidak memegang wewenang uang.',
   true, true, 'dashboard', 22),

  -- ── Estimasi & kontrak ─────────────────────────────────────────────────
  ('estimator', 'Estimator / Quantity Surveyor',
   'Menyusun RAB, analisa harga satuan, dan volume pekerjaan. Membuat angka, tidak menyetujuinya.',
   true, true, 'dashboard', 23),
  ('kontrak_admin', 'Administrasi Kontrak',
   'Register kontrak, adendum, jaminan, surat-menyurat resmi, dan RFI ke pemberi kerja.',
   true, true, 'dashboard', 24),

  -- ── Keuangan: EMPAT peran terpisah (keputusan founder: pisah tegas) ─────
  ('manajer_keuangan', 'Manajer Keuangan',
   'Menyetujui pengeluaran, menutup periode akuntansi, dan melihat seluruh angka perusahaan.',
   true, true, 'dashboard', 25),
  ('akuntan', 'Akuntan',
   'Menjurnal, merekonsiliasi, dan menyusun laporan keuangan. Mencatat, tidak mencairkan.',
   true, true, 'dashboard', 26),
  ('kasir', 'Kasir / Bendahara',
   'Mencairkan pembayaran yang SUDAH disetujui. Tidak membuat dan tidak menyetujui tagihan.',
   true, true, 'dashboard', 27),
  ('penagihan', 'Penagihan / Billing',
   'Menerbitkan invoice dan termin ke pemberi kerja, serta memantau piutang.',
   true, true, 'dashboard', 28),

  -- ── Rantai pasok ───────────────────────────────────────────────────────
  ('procurement_officer', 'Staf Pengadaan',
   'Permintaan material, pesanan pembelian, dan hubungan dengan supplier.',
   true, true, 'dashboard', 29),
  ('logistik', 'Logistik & Gudang',
   'Penerimaan barang, stok, transfer antar proyek, dan opname gudang.',
   true, true, 'dashboard', 30),

  -- ── Mutu, K3, kepatuhan ────────────────────────────────────────────────
  ('qaqc', 'QA/QC & Surveyor',
   'Inspeksi mutu, NCR, punch list, submittal, dan pengukuran opname bersama.',
   true, true, 'dashboard', 31),
  ('k3_officer', 'Petugas K3 / HSE',
   'Izin kerja, JSA, induksi, insiden, dan inspeksi keselamatan serta lingkungan.',
   true, true, 'dashboard', 32),
  ('qhse_manager', 'Manajer QHSE',
   'Menyetujui rencana mutu, memutuskan disposisi NCR, dan memutuskan izin kerja berisiko.',
   true, true, 'dashboard', 33),

  -- ── SDM ────────────────────────────────────────────────────────────────
  ('hrd', 'HRD / SDM',
   'Data pegawai, rekrutmen, sertifikasi, cuti, dan timesheet staf.',
   true, true, 'dashboard', 34),
  ('payroll_officer', 'Staf Payroll',
   'Menjalankan penggajian staf berdasarkan tarif dan timesheet yang sudah disetujui.',
   true, true, 'dashboard', 35),

  -- ── Pengawasan ─────────────────────────────────────────────────────────
  ('auditor_internal', 'Auditor Internal',
   'Membaca seluruh catatan dan jejak audit tanpa bisa mengubah apa pun.',
   true, true, 'dashboard', 36)
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 2. Hak akses — disusun dari izin yang SUDAH ADA, nol izin baru
-- ------------------------------------------------------------
-- Ditulis sebagai satu tabel (role, izin) supaya bisa dibaca sebagai matriks,
-- bukan tersebar di 17 blok INSERT yang tak bisa dibandingkan satu sama lain.
WITH peta(role_name, perm_key) AS (VALUES
  -- ═══ MANAJER PROYEK SENIOR — lintas proyek, menyetujui perubahan ═══
  ('project_manager_senior','projects:view'),
  ('project_manager_senior','projects:edit'),
  ('project_manager_senior','projects:create'),
  ('project_manager_senior','projects:status'),
  ('project_manager_senior','projects:contract'),
  ('project_manager_senior','projects:baseline:view'),
  ('project_manager_senior','projects:baseline:manage'),
  ('project_manager_senior','change_order:approve'),
  ('project_manager_senior','milestones:manage'),
  ('project_manager_senior','progress:manage'),
  ('project_manager_senior','reports:view'),
  ('project_manager_senior','reports:progress'),
  ('project_manager_senior','reports:export'),
  ('project_manager_senior','reports:susun'),
  ('project_manager_senior','risiko:view'),
  ('project_manager_senior','risiko:manage'),
  ('project_manager_senior','sengketa:view'),
  ('project_manager_senior','sengketa:manage'),
  ('project_manager_senior','backcharge:kelola'),
  ('project_manager_senior','backcharge:setujui'),
  ('project_manager_senior','serah_terima:view'),
  ('project_manager_senior','serah_terima:kelola'),
  ('project_manager_senior','clients:view'),
  ('project_manager_senior','documents:manage'),
  ('project_manager_senior','mandor:view'),
  ('project_manager_senior','mandor:assign'),
  ('project_manager_senior','opname:verifikasi'),
  ('project_manager_senior','finance:view'),
  ('project_manager_senior','procurement:view'),
  ('project_manager_senior','gudang:view'),

  -- ═══ MANAJER LAPANGAN — menjalankan pekerjaan, TIDAK menyentuh uang ═══
  ('site_manager','projects:view'),
  ('site_manager','projects:baseline:view'),
  ('site_manager','progress:manage'),
  ('site_manager','milestones:manage'),
  ('site_manager','mandor:view'),
  ('site_manager','mandor:assign'),
  ('site_manager','mandor:scope:manage'),
  ('site_manager','mandor:scope:item'),
  ('site_manager','mandor:worker:manage'),
  ('site_manager','mandor:wage:create'),   -- membuat; yang menyetujui PM/keuangan
  ('site_manager','opname:kelola'),
  ('site_manager','opname:verifikasi'),
  ('site_manager','spk:kelola'),
  ('site_manager','procurement:mr:manage'),  -- meminta material
  ('site_manager','procurement:view'),
  ('site_manager','gudang:view'),
  ('site_manager','inspeksi:manage'),
  ('site_manager','inspeksi:view'),
  ('site_manager','punch:view'),
  ('site_manager','punch:manage'),
  ('site_manager','submittal:view'),
  ('site_manager','submittal:manage'),
  ('site_manager','k3:permit:view'),
  ('site_manager','k3:jsa:view'),
  ('site_manager','serah_terima:view'),
  ('site_manager','reports:progress'),
  ('site_manager','reports:view'),
  ('site_manager','documents:manage'),

  -- ═══ ESTIMATOR — menyusun angka, TIDAK menyetujuinya ═══
  ('estimator','projects:view'),
  ('estimator','cecep:wbs:manage'),
  ('estimator','cecep:assembly:manage'),
  ('estimator','cecep:formula:manage'),
  ('estimator','cecep:resource:manage'),
  ('estimator','cecep:productivity:manage'),
  ('estimator','cecep:cost_code:manage'),
  ('estimator','cecep:cost_map:manage'),
  ('estimator','cecep:refdata:manage'),
  ('estimator','cecep:price:manage'),
  ('estimator','cecep:markup:manage'),
  ('estimator','cecep:lessons:manage'),
  ('estimator','procurement:material:manage'),
  ('estimator','procurement:view'),
  ('estimator','units:manage'),
  ('estimator','work_categories:manage'),
  ('estimator','reports:view'),
  ('estimator','reports:export'),

  -- ═══ ADMINISTRASI KONTRAK ═══
  ('kontrak_admin','projects:view'),
  ('kontrak_admin','projects:contract'),
  ('kontrak_admin','clients:view'),
  ('kontrak_admin','clients:manage'),
  ('kontrak_admin','documents:manage'),
  ('kontrak_admin','penomoran:kelola'),
  ('kontrak_admin','penomoran:view'),
  ('kontrak_admin','sengketa:view'),
  ('kontrak_admin','serah_terima:view'),
  ('kontrak_admin','kepatuhan:view'),
  ('kontrak_admin','kepatuhan:manage'),
  ('kontrak_admin','reports:view'),

  -- ═══ MANAJER KEUANGAN — MENYETUJUI, dan hanya dia yang boleh buka periode ═══
  ('manajer_keuangan','finance:view'),
  ('manajer_keuangan','finance:view:all'),
  ('manajer_keuangan','finance:manage'),
  ('manajer_keuangan','finance:tax:view'),
  ('manajer_keuangan','finance:tax:submit'),
  ('manajer_keuangan','cash:view'),
  ('manajer_keuangan','cash:manage'),
  ('manajer_keuangan','cash:account:manage'),
  ('manajer_keuangan','cash:expense:approve'),
  ('manajer_keuangan','cash:transfer:confirm'),
  ('manajer_keuangan','gl:view'),
  ('manajer_keuangan','gl:manage'),
  ('manajer_keuangan','gl:post'),
  ('manajer_keuangan','gl:void'),
  ('manajer_keuangan','gl:periode:view'),
  ('manajer_keuangan','gl:periode:manage'),
  ('manajer_keuangan','gl:periode:reopen'),
  ('manajer_keuangan','gl:peta-akun:view'),
  ('manajer_keuangan','gl:peta-akun:manage'),
  ('manajer_keuangan','rekonsiliasi:view'),
  ('manajer_keuangan','rekonsiliasi:manage'),
  ('manajer_keuangan','rekonsiliasi:lock'),
  ('manajer_keuangan','mandor:kasbon:approve'),
  ('manajer_keuangan','mandor:wage:approve'),
  ('manajer_keuangan','klaim:setujui'),
  ('manajer_keuangan','klaim:view'),
  ('manajer_keuangan','payroll:jalankan:view'),
  ('manajer_keuangan','payroll:tarif:view'),
  ('manajer_keuangan','payroll:tarif:manage'),
  ('manajer_keuangan','reports:view'),
  ('manajer_keuangan','reports:export'),
  ('manajer_keuangan','reports:susun'),
  ('manajer_keuangan','projects:view'),
  ('manajer_keuangan','audit:view'),

  -- ═══ AKUNTAN — MENCATAT, tidak mencairkan, tidak membuka periode ═══
  ('akuntan','finance:view'),
  ('akuntan','finance:view:all'),
  ('akuntan','finance:tax:view'),
  ('akuntan','gl:view'),
  ('akuntan','gl:jurnalkan'),
  ('akuntan','gl:post'),
  ('akuntan','gl:peta-akun:view'),
  ('akuntan','gl:periode:view'),
  ('akuntan','rekonsiliasi:view'),
  ('akuntan','rekonsiliasi:manage'),
  ('akuntan','cash:view'),
  ('akuntan','assets:view'),
  ('akuntan','assets:manage'),
  ('akuntan','reports:view'),
  ('akuntan','reports:export'),
  ('akuntan','reports:susun'),
  ('akuntan','projects:view'),

  -- ═══ KASIR — MENCAIRKAN yang sudah disetujui. Tak membuat, tak menyetujui ═══
  ('kasir','cash:view'),
  ('kasir','cash:expense:create'),
  ('kasir','cash:transfer:create'),
  ('kasir','finance:view'),
  ('kasir','finance:invoice:pay'),
  ('kasir','finance:termin:pay'),
  ('kasir','klaim:bayar'),
  ('kasir','procurement:payment:manage'),
  ('kasir','reports:view'),

  -- ═══ PENAGIHAN — menerbitkan tagihan keluar ═══
  ('penagihan','finance:view'),
  ('penagihan','finance:invoice:create'),
  ('penagihan','finance:expense:view'),
  ('penagihan','clients:view'),
  ('penagihan','projects:view'),
  ('penagihan','reports:view'),
  ('penagihan','reports:export'),

  -- ═══ STAF PENGADAAN ═══
  ('procurement_officer','procurement:view'),
  ('procurement_officer','procurement:mr:manage'),
  ('procurement_officer','procurement:po:manage'),
  ('procurement_officer','procurement:supplier:manage'),
  ('procurement_officer','procurement:material:manage'),
  ('procurement_officer','gudang:view'),
  ('procurement_officer','projects:view'),
  ('procurement_officer','reports:view'),
  ('procurement_officer','reports:export'),

  -- ═══ LOGISTIK & GUDANG ═══
  ('logistik','gudang:view'),
  ('logistik','gudang:manage'),
  ('logistik','gudang:susut:view'),
  ('logistik','gudang:susut:manage'),
  ('logistik','procurement:view'),
  ('logistik','assets:view'),
  ('logistik','assets:manage'),
  ('logistik','projects:view'),
  ('logistik','reports:view'),

  -- ═══ QA/QC & SURVEYOR ═══
  ('qaqc','projects:view'),
  ('qaqc','inspeksi:view'),
  ('qaqc','inspeksi:manage'),
  ('qaqc','inspeksi:periksa'),
  ('qaqc','punch:view'),
  ('qaqc','punch:manage'),
  ('qaqc','punch:verify'),
  ('qaqc','submittal:view'),
  ('qaqc','submittal:manage'),
  ('qaqc','ncr:view'),
  ('qaqc','ncr:manage'),
  ('qaqc','ncr:verify'),
  ('qaqc','mutu:uji:view'),
  ('qaqc','mutu:uji:manage'),
  ('qaqc','mutu:rmp:view'),
  ('qaqc','mutu:audit:view'),
  ('qaqc','opname:kelola'),
  ('qaqc','opname:verifikasi'),
  ('qaqc','serah_terima:view'),
  ('qaqc','reports:view'),
  ('qaqc','documents:manage'),

  -- ═══ PETUGAS K3 — domain yang selama ini TAK PUNYA role sama sekali ═══
  ('k3_officer','projects:view'),
  ('k3_officer','k3:permit:view'),
  ('k3_officer','k3:permit:manage'),
  ('k3_officer','k3:jsa:view'),
  ('k3_officer','k3:jsa:manage'),
  ('k3_officer','k3:induksi:manage'),
  ('k3_officer','k3:insiden:view'),
  ('k3_officer','k3:insiden:manage'),
  ('k3_officer','k3:inspeksi:view'),
  ('k3_officer','k3:inspeksi:manage'),
  ('k3_officer','k3:lingkungan:manage'),
  ('k3_officer','sdm:sertifikat:view'),
  ('k3_officer','reports:view'),
  ('k3_officer','documents:manage'),

  -- ═══ MANAJER QHSE — yang MEMUTUSKAN di mutu & K3 ═══
  ('qhse_manager','projects:view'),
  ('qhse_manager','mutu:rmp:view'),
  ('qhse_manager','mutu:rmp:manage'),
  ('qhse_manager','mutu:rmp:approve'),
  ('qhse_manager','mutu:audit:view'),
  ('qhse_manager','mutu:audit:manage'),
  ('qhse_manager','mutu:uji:view'),
  ('qhse_manager','mutu:uji:manage'),
  ('qhse_manager','ncr:view'),
  ('qhse_manager','ncr:manage'),
  ('qhse_manager','ncr:verify'),
  ('qhse_manager','ncr:disposisi'),
  ('qhse_manager','inspeksi:view'),
  ('qhse_manager','inspeksi:periksa'),
  ('qhse_manager','punch:view'),
  ('qhse_manager','punch:verify'),
  ('qhse_manager','submittal:view'),
  ('qhse_manager','submittal:decide'),
  ('qhse_manager','k3:permit:view'),
  ('qhse_manager','k3:permit:decide'),
  ('qhse_manager','k3:insiden:view'),
  ('qhse_manager','k3:inspeksi:view'),
  ('qhse_manager','kepatuhan:view'),
  ('qhse_manager','kepatuhan:manage'),
  ('qhse_manager','risiko:view'),
  ('qhse_manager','risiko:manage'),
  ('qhse_manager','reports:view'),
  ('qhse_manager','reports:export'),

  -- ═══ HRD ═══
  ('hrd','sdm:pegawai:view'),
  ('hrd','sdm:pegawai:manage'),
  ('hrd','sdm:rekrutmen:view'),
  ('hrd','sdm:rekrutmen:manage'),
  ('hrd','sdm:sertifikat:view'),
  ('hrd','sdm:sertifikat:manage'),
  ('hrd','sdm:cuti:view'),
  ('hrd','sdm:cuti:manage'),
  ('hrd','sdm:cuti:approve'),
  ('hrd','sdm:cuti:hak'),
  ('hrd','sdm:timesheet:view'),
  ('hrd','sdm:timesheet:manage'),
  ('hrd','sdm:timesheet:approve'),
  ('hrd','sdm:kinerja:view'),
  ('hrd','sdm:kinerja:manage'),
  ('hrd','klaim:view'),
  ('hrd','klaim:kelola'),
  ('hrd','reports:view'),

  -- ═══ STAF PAYROLL — menjalankan, tarifnya ditetapkan manajer keuangan ═══
  ('payroll_officer','payroll:jalankan:view'),
  ('payroll_officer','payroll:jalankan:manage'),
  ('payroll_officer','payroll:tarif:view'),
  ('payroll_officer','sdm:pegawai:view'),
  ('payroll_officer','sdm:timesheet:view'),
  ('payroll_officer','reports:view'),

  -- ═══ AUDITOR INTERNAL — MEMBACA SAJA, nol izin :manage ═══
  ('auditor_internal','audit:view'),
  ('auditor_internal','projects:view'),
  ('auditor_internal','finance:view'),
  ('auditor_internal','finance:view:all'),
  ('auditor_internal','finance:tax:view'),
  ('auditor_internal','cash:view'),
  ('auditor_internal','gl:view'),
  ('auditor_internal','gl:periode:view'),
  ('auditor_internal','gl:peta-akun:view'),
  ('auditor_internal','rekonsiliasi:view'),
  ('auditor_internal','procurement:view'),
  ('auditor_internal','gudang:view'),
  ('auditor_internal','mandor:view'),
  ('auditor_internal','mutu:audit:view'),
  ('auditor_internal','mutu:rmp:view'),
  ('auditor_internal','ncr:view'),
  ('auditor_internal','k3:insiden:view'),
  ('auditor_internal','k3:inspeksi:view'),
  ('auditor_internal','kepatuhan:view'),
  ('auditor_internal','risiko:view'),
  ('auditor_internal','sengketa:view'),
  ('auditor_internal','klaim:view'),
  ('auditor_internal','payroll:jalankan:view'),
  ('auditor_internal','sdm:pegawai:view'),
  ('auditor_internal','assets:view'),
  ('auditor_internal','reports:view'),
  ('auditor_internal','reports:export')
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM peta
  JOIN public.roles r ON r.name = peta.role_name AND r.company_id IS NULL
  JOIN permissions p ON p.key = peta.perm_key
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 3. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n_role    int;
  n_kosong  int;
  n_langgar text;
BEGIN
  /*
    AMBANG 21 -> 20, DIPERBAIKI 2026-08-31.

    "5 lama" adalah asumsi yang salah, dan asumsi yang SAMA baru diperbaiki di
    migrasi 363 satu putaran CI sebelumnya. Migrasi 050 — satu-satunya sumber
    role di basis yang baru lahir — membuat tepat EMPAT: admin, pm, mandor,
    client. Role kelima yang terhitung di basis dev lahir dari pemakaian, bukan
    dari migrasi.

    Diukur langsung, bukan ditebak: dengan role tambahan dihapus lebih dulu,
    basis punya 4 sebelum migrasi ini dan 20 sesudahnya. Empat plus enam belas.

        HARD FAIL — 364_katalog_role_konstruksi.sql
          364 gagal: template role hanya 20, harusnya 5 lama + 16 baru

    Angka 20 di pesan galatnya adalah jawabannya sendiri.
  */
  SELECT count(*) INTO n_role FROM public.roles WHERE company_id IS NULL;
  IF n_role < 20 THEN
    RAISE EXCEPTION '364 gagal: template role hanya %, harusnya 4 lama (migrasi 050) + 16 baru', n_role;
  END IF;

  /*
    PEMULIHAN PEMBERIAN DASAR — DITAMBAHKAN 2026-08-31.

    Cek di bawah benar dan penting: role tanpa satu pun izin adalah nama
    kosong. Tapi di basis yang baru lahir ia menuduh dua role yang BUKAN
    buatan migrasi ini:

        HARD FAIL — 364_katalog_role_konstruksi.sql
          364 gagal: 2 role template tanpa satu pun izin   (client, mandor)

    Keduanya lahir dari migrasi 050, yang memang memberi mereka izin — 10
    untuk mandor, 3 untuk client. Diukur: kesepuluh kunci itu ADA di tabel
    `permissions`, jadi yang hilang pemberiannya, bukan izinnya.

    Migrasi ini tak bisa tahu kapan hilangnya. Yang bisa ia lakukan: memulihkan
    pemberian dasar itu sebelum menuntut keberadaannya — sesuai daftar yang
    sama persis dengan migrasi 050, tanpa menambah kewenangan apa pun.

    Bentuk yang sama dengan 271, 295, 337, 340, dan 363 hari ini: migrasi yang
    MEMERIKSA sesuatu tanpa MENGERJAKANNYA. Bedanya di sini yang dituntut
    memang pantas ada — jadi yang benar mengerjakannya, bukan melonggarkan
    pemeriksaannya.
  */
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id
    FROM public.roles r
    CROSS JOIN public.permissions p
   WHERE r.company_id IS NULL
     AND (
       (r.name = 'mandor' AND p.key IN (
          'projects:view', 'finance:view', 'mandor:view', 'mandor:worker:manage',
          'mandor:wage:create', 'mandor:kasbon:create', 'procurement:view',
          'procurement:mr:manage', 'reports:view', 'reports:progress'))
       OR
       (r.name = 'client' AND p.key IN (
          'projects:view', 'finance:view', 'reports:progress'))
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id
     )
  ON CONFLICT DO NOTHING;

  -- Role tanpa satu pun izin adalah nama kosong — persis cacat yang sedang
  -- diperbaiki, dibuat ulang dalam bentuk baru.
  SELECT count(*) INTO n_kosong
    FROM public.roles r
   WHERE r.company_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id);
  IF n_kosong > 0 THEN
    RAISE EXCEPTION '364 gagal: % role template tanpa satu pun izin', n_kosong;
  END IF;

  -- SoD: tak boleh ada role yang sekaligus MEMBUAT dan MENYETUJUI
  -- pengeluaran kas. Kalau ini merah, pemisahannya cuma ada di komentar.
  /*
    SoD DIPERIKSA HANYA PADA ROLE BARU — dan saya salah sekali sebelum ini.

    Versi pertama penjaga ini memerah untuk `direktur` dan `pm`, dan saya
    hampir menyimpulkan role lama "melanggar SoD". Diukur lebih jauh: TIDAK.

    `apps/api/src/lib/sod.ts` sudah menegakkan pemisahan di RUNTIME — orang
    yang mengajukan tak bisa menyetujui pengajuannya sendiri, siapa pun
    rolenya. Yang dilarang adalah ORANG YANG SAMA pada SATU DOKUMEN, bukan
    role yang memegang kedua izin.

    Direktur memang harus bisa keduanya: menyetujui pengeluaran orang lain,
    dan sesekali membuat pengeluaran yang disetujui orang lain. Mencabut
    salah satunya tak menambah keamanan apa pun — penjagaannya ada di lapisan
    yang benar — tapi akan menghentikan pekerjaan nyata.

    Jadi yang diperiksa di sini bukan "adakah role berizin ganda", melainkan
    "apakah role BARU yang saya buat sudah disusun dengan pemisahan itu".
    Kasir tak boleh menyetujui, akuntan tak boleh mencairkan, dan seterusnya —
    karena itulah alasan keempat role keuangan dipisah.

    `string_agg`, bukan `FOR ... LOOP`: loop yang tak pernah beriterasi
    meninggalkan variabel record tanpa nilai, dan menyebut `r.name` sesudahnya
    melempar "record r is not assigned yet" — galat yang menyamar sebagai
    kegagalan migrasi padahal pemeriksaannya justru LULUS.
  */
  SELECT string_agg(ro.name, ', ') INTO n_langgar
    FROM public.roles ro
   WHERE ro.company_id IS NULL
     AND ro.name IN ('kasir', 'akuntan', 'penagihan', 'estimator',
                     'qaqc', 'k3_officer', 'logistik', 'payroll_officer',
                     'procurement_officer', 'site_manager', 'auditor_internal')
     AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
                  WHERE rp.role_id=ro.id AND p.key='cash:expense:create')
     AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
                  WHERE rp.role_id=ro.id AND p.key='cash:expense:approve');
  IF n_langgar IS NOT NULL THEN
    RAISE EXCEPTION '364 gagal: role baru % membuat DAN menyetujui pengeluaran', n_langgar;
  END IF;

  -- Kasir mencairkan, TIDAK menyetujui. Kalau ini merah, pemisahan keuangan
  -- yang jadi alasan empat role dibuat justru tak terwujud.
  IF EXISTS (
    SELECT 1 FROM public.roles ro
      JOIN role_permissions rp ON rp.role_id = ro.id
      JOIN permissions p ON p.id = rp.permission_id
     WHERE ro.name = 'kasir' AND ro.company_id IS NULL
       AND p.key IN ('cash:expense:approve', 'mandor:kasbon:approve',
                     'mandor:wage:approve', 'klaim:setujui')
  ) THEN
    RAISE EXCEPTION '364 gagal: kasir memegang izin MENYETUJUI — ia hanya mencairkan';
  END IF;

  -- Akuntan mencatat, TIDAK mencairkan.
  IF EXISTS (
    SELECT 1 FROM public.roles ro
      JOIN role_permissions rp ON rp.role_id = ro.id
      JOIN permissions p ON p.id = rp.permission_id
     WHERE ro.name = 'akuntan' AND ro.company_id IS NULL
       AND p.key IN ('finance:invoice:pay', 'finance:termin:pay',
                     'klaim:bayar', 'procurement:payment:manage')
  ) THEN
    RAISE EXCEPTION '364 gagal: akuntan memegang izin MENCAIRKAN — ia hanya mencatat';
  END IF;

  -- Auditor wajib benar-benar read-only.
  IF EXISTS (
    SELECT 1 FROM public.roles ro
      JOIN public.role_permissions rp ON rp.role_id = ro.id
      JOIN permissions p ON p.id = rp.permission_id
     WHERE ro.name = 'auditor_internal' AND ro.company_id IS NULL
       AND (p.key LIKE '%:manage' OR p.key LIKE '%:approve'
            OR p.key LIKE '%:create' OR p.key LIKE '%:pay'
            OR p.key LIKE '%:setujui' OR p.key LIKE '%:kelola')
  ) THEN
    RAISE EXCEPTION '364 gagal: auditor_internal memegang izin yang mengubah data';
  END IF;

  -- Kredensial: NOL role selain admin.
  IF EXISTS (
    SELECT 1 FROM public.roles ro
      JOIN public.role_permissions rp ON rp.role_id = ro.id
      JOIN permissions p ON p.id = rp.permission_id
     WHERE ro.name <> 'admin' AND p.key LIKE 'settings:credentials%'
  ) THEN
    RAISE EXCEPTION '364 gagal: ada role non-admin memegang izin kredensial';
  END IF;

  RAISE NOTICE '364: % role template · nol role kosong · SoD terjaga', n_role;
END $$;
