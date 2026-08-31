-- ============================================================================
-- 546 — Enam belas peran katalog dihidupkan; 364 berhenti melanggar dirinya
-- ============================================================================
--
-- ── Keputusan yang dijalankan (R-019, pilihan 1: DIHIDUPKAN)
--
-- Founder menyerahkan keputusannya. Yang dipilih: hidupkan, bukan hapus —
-- migrasi 364 sudah merancang izin keenam belas peran ini secara rinci
-- (273 pasangan, 143 kunci izin), dan rancangan itu memisahkan tugas dengan
-- benar: kasir mencairkan tapi tak menyetujui, akuntan mencatat tapi tak
-- mencairkan, auditor benar-benar baca-saja. Menghapusnya membuang pekerjaan
-- yang sudah matang; membiarkannya melanggar verifikasi 364 selamanya.
--
-- ── Cacat yang ditutup
--
-- 364 TERCATAT SUKSES, dan ia diakhiri tuntutan ini:
--
--     IF n_kosong > 0 THEN
--       RAISE EXCEPTION '364 gagal: % role template tanpa satu pun izin', n_kosong;
--
-- Diukur terhadap dev: n_kosong = 16. Migrasi yang tercatat sukses
-- meninggalkan basis dalam keadaan yang ia sendiri nyatakan GAGAL. CI tetap
-- hijau karena CI memutar rantai dari basis KOSONG. Bentuk yang sama dengan
-- cacat 047↔167 (CLAUDE.md §5.5).
--
-- ── Daftar di bawah DISALIN dari 364, bukan diketik ulang
--
-- Dihasilkan dengan membaca blok `WITH peta(...)` migrasi 364 langsung dari
-- berkasnya. 273 baris tulisan tangan adalah 273 peluang salah ketik pada
-- MATRIKS WEWENANG — dan salah ketik di sana membuka atau menutup akses
-- tanpa satu pun galat.
--
--     pasangan di 364 : 273
--     dikecualikan    :   1  (project_manager_senior/change_order:approve)
--     dipakai         : 272
--
-- ── Yang SENGAJA dikecualikan
--
--   change_order:approve   MENGUBAH NILAI KONTRAK, dan rutenya nol ambang
--                          nominal (diperiksa: change-orders.ts). Peran
--                          berpengguna NOL tak perlu memegangnya, dan
--                          menghidupkannya diam-diam adalah cara kewenangan
--                          finansial masuk lewat pintu belakang.
--
--   approval:override_sod · mitra:daftar_hitam
--                          Sengaja dikosongkan 539/540/543. Tak ada di
--                          katalog 364, dan verifikasi di bawah memastikan
--                          migrasi ini tak menghidupkannya kembali.
--
-- ── `k3_officer` — cacat 364 yang ikut diperbaiki
--
-- Diukur: 364 MEMBUAT `k3_officer` tapi tak memberinya satu pun izin — ia
-- satu-satunya dari enam belas yang tak muncul di katalognya sendiri. Diberi
-- izin K3 yang setara pekerjaannya, sejajar dengan `qhse_manager`, TANPA
-- `k3:permit:decide` (memutuskan izin kerja adalah kewenangan penyelia).
--
-- Idempoten (ON CONFLICT DO NOTHING). Verifikasi di blok akhir (pola 142).

/*
  ── CABUT DULU, BARU HIDUPKAN — ditambahkan 2026-09-01
  ────────────────────────────────────────────────────────────────────────
  Sama bentuknya dengan buntu di migrasi 545: verifikasi di bawah MENOLAK
  bila menemukan izin yang sengaja dikosongkan sudah dipegang seseorang,
  dan penolakan itu MEMBLOKIR migrasi ini sendiri:

      HARD FAIL — 546_hidupkan_16_peran_katalog.sql
        546 gagal: izin yang sengaja dikosongkan hidup lagi:
        project_manager_senior/change_order:approve

  Sumbernya migrasi 364: katalognya memberi `change_order:approve` ke
  `project_manager_senior`. Di basis yang sudah memutar 364, izin itu ADA
  sebelum 546 sempat jalan — jadi 546 gagal, tak tercatat, dan diulang tiap
  run tanpa pernah berhasil.

  Menyunting 546 SAH: ia belum pernah tercatat di lingkungan mana pun
  (diperiksa langsung ke buku migrasi). G-2 melarang menyunting yang SUDAH
  tercatat.

  Ketiga izin ini sengaja dikosongkan oleh 539/540/543 — dan keputusan itu
  tetap berlaku. Yang berubah cuma caranya: mencabut lebih dulu, alih-alih
  menolak dan berhenti.
*/
DELETE FROM role_permissions rp
 USING permissions p
 WHERE rp.permission_id = p.id
   AND p.key IN ('change_order:approve', 'approval:override_sod', 'mitra:daftar_hitam')
   AND rp.role_id IN (SELECT id FROM roles WHERE name NOT IN ('admin', 'direktur'));


INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM (VALUES
    ('project_manager_senior','projects:view'),
    ('project_manager_senior','projects:edit'),
    ('project_manager_senior','projects:create'),
    ('project_manager_senior','projects:status'),
    ('project_manager_senior','projects:contract'),
    ('project_manager_senior','projects:baseline:view'),
    ('project_manager_senior','projects:baseline:manage'),
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
    ('site_manager','projects:view'),
    ('site_manager','projects:baseline:view'),
    ('site_manager','progress:manage'),
    ('site_manager','milestones:manage'),
    ('site_manager','mandor:view'),
    ('site_manager','mandor:assign'),
    ('site_manager','mandor:scope:manage'),
    ('site_manager','mandor:scope:item'),
    ('site_manager','mandor:worker:manage'),
    ('site_manager','mandor:wage:create'),
    ('site_manager','opname:kelola'),
    ('site_manager','opname:verifikasi'),
    ('site_manager','spk:kelola'),
    ('site_manager','procurement:mr:manage'),
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
    ('kasir','cash:view'),
    ('kasir','cash:expense:create'),
    ('kasir','cash:transfer:create'),
    ('kasir','finance:view'),
    ('kasir','finance:invoice:pay'),
    ('kasir','finance:termin:pay'),
    ('kasir','klaim:bayar'),
    ('kasir','procurement:payment:manage'),
    ('kasir','reports:view'),
    ('penagihan','finance:view'),
    ('penagihan','finance:invoice:create'),
    ('penagihan','finance:expense:view'),
    ('penagihan','clients:view'),
    ('penagihan','projects:view'),
    ('penagihan','reports:view'),
    ('penagihan','reports:export'),
    ('procurement_officer','procurement:view'),
    ('procurement_officer','procurement:mr:manage'),
    ('procurement_officer','procurement:po:manage'),
    ('procurement_officer','procurement:supplier:manage'),
    ('procurement_officer','procurement:material:manage'),
    ('procurement_officer','gudang:view'),
    ('procurement_officer','projects:view'),
    ('procurement_officer','reports:view'),
    ('procurement_officer','reports:export'),
    ('logistik','gudang:view'),
    ('logistik','gudang:manage'),
    ('logistik','gudang:susut:view'),
    ('logistik','gudang:susut:manage'),
    ('logistik','procurement:view'),
    ('logistik','assets:view'),
    ('logistik','assets:manage'),
    ('logistik','projects:view'),
    ('logistik','reports:view'),
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
    ('payroll_officer','payroll:jalankan:view'),
    ('payroll_officer','payroll:jalankan:manage'),
    ('payroll_officer','payroll:tarif:view'),
    ('payroll_officer','sdm:pegawai:view'),
    ('payroll_officer','sdm:timesheet:view'),
    ('payroll_officer','reports:view'),
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
    ('auditor_internal','reports:export'),
    -- k3_officer: tak ada di katalog 364 (cacat migrasi itu sendiri).
    ('k3_officer','projects:view'),
    ('k3_officer','k3:insiden:view'),
    ('k3_officer','k3:insiden:manage'),
    ('k3_officer','k3:inspeksi:view'),
    ('k3_officer','k3:inspeksi:manage'),
    ('k3_officer','k3:jsa:view'),
    ('k3_officer','k3:jsa:manage'),
    ('k3_officer','k3:induksi:manage'),
    ('k3_officer','k3:permit:view'),
    ('k3_officer','k3:lingkungan:manage'),
    ('k3_officer','reports:view')
  ) AS peta(nama_peran, kunci)
  JOIN roles r ON r.name = peta.nama_peran
  JOIN permissions p ON p.key = peta.kunci
ON CONFLICT DO NOTHING;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_kosong INT;
  v_daftar TEXT;
  v_uang   TEXT;
BEGIN
  -- Tuntutan 364 yang selama ini dilanggar.
  SELECT count(*), string_agg(r.name, ', ') INTO n_kosong, v_daftar
    FROM roles r
   WHERE r.company_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id);

  IF n_kosong > 0 THEN
    RAISE EXCEPTION '546 gagal: masih % peran template tanpa izin: %', n_kosong, v_daftar;
  END IF;

  /*
    PAGAR: menghidupkan katalog TAK BOLEH mengembalikan tiga izin yang
    sengaja dikosongkan. Kalau daftar di atas suatu saat disunting
    sembarangan, yang gagal migrasi ini — bukan penjaga CI besok.
  */
  SELECT string_agg(DISTINCT r.name || '/' || p.key, ', ') INTO v_uang
    FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key IN ('change_order:approve', 'approval:override_sod', 'mitra:daftar_hitam')
     AND r.name NOT IN ('admin', 'direktur');

  IF v_uang IS NOT NULL THEN
    RAISE EXCEPTION '546 gagal: izin yang sengaja dikosongkan hidup lagi: %', v_uang;
  END IF;

  RAISE NOTICE '546 OK: nol peran template kosong · tiga izin terlarang tetap kosong';
END $$;
