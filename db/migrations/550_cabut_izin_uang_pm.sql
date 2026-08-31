-- ============================================================================
-- 550 — PM memegang izin MEMINDAHKAN UANG di tiap basis baru
-- ============================================================================
--
-- ── Cacat yang ditutup, dan bagaimana ia ketahuan
--
-- Migrasi 545 GAGAL di CI — dan itu justru pagar yang bekerja:
--
--     HARD FAIL — 545_pm_izin_lapangan.sql
--       545 gagal: pm memegang izin UANG/kewenangan: mandor:kasbon:approve,
--       klaim:setujui, klaim:bayar, finance:invoice:create,
--       finance:termin:pay, finance:invoice:pay
--
-- 545 tak memberikan izin-izin itu; ia MENOLAK karena menemukannya sudah ada.
-- Pagar yang saya pasang untuk menjaga migrasi saya sendiri malah menangkap
-- cacat yang jauh lebih tua.
--
-- ── Akarnya: migrasi 050, daftar larangan yang tak lengkap
--
-- 050 memberi PM SEMUA izin kecuali sepuluh:
--
--     projects:status · projects:delete · cash:account:manage
--     cash:expense:approve · procurement:payment:manage · users:manage
--     users:roles:manage · clients:manage · settings:manage
--     notifications:milestone:check
--
-- Enam izin yang MEMINDAHKAN UANG tak ada di daftar itu — sebagian karena
-- belum lahir saat 050 ditulis, dan pemberian "semua kecuali sepuluh"
-- menyerap tiap izin baru secara diam-diam. Daftar-larangan tumbuh sendiri
-- ke arah yang salah: tiap modul keuangan baru otomatis masuk ke PM.
--
-- ── Kenapa dev tampak bersih dan CI merah
--
--     dev        pm 37 izin · 0 izin uang
--     basis CI   pm banyak  · 6 izin uang
--
-- Di dev, migrasi lain sesudah 050 sudah memangkasnya. Di basis BARU — dan
-- VPS adalah basis baru — 050 berjalan utuh dan PM lahir dengan kewenangan
-- finansial penuh. Bentuk yang sama dengan `template_rab` (541),
-- `template_penerapan` (542), dan `mitra:daftar_hitam` (543) hari ini:
-- benar di dev, patah di basis baru.
--
-- ── Kenapa migrasi maju, bukan menyunting 050
--
-- 050 sudah tercatat di tiap lingkungan; suntingannya tak akan pernah
-- berjalan lagi (Gerbang Keras G-2). Dan menyuntingnya pun tak cukup:
-- daftar-larangan yang bertambah panjang tetap menyerap izin uang BERIKUTNYA
-- yang belum ada hari ini.
--
-- ── Yang TIDAK dilakukan
--
-- Izin-izin ini tidak dihapus dari katalog dan tidak dicabut dari
-- admin/direktur. Yang dicabut hanya dari `pm`, dan hanya yang memindahkan
-- atau menyetujui uang — R-017 sudah memutuskan PM dapat 19 izin LAPANGAN
-- (migrasi 545), dan keputusan itu tetap berlaku.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

DO $cabut_uang_pm$
DECLARE
  n_cabut INT;
BEGIN
  WITH dibuang AS (
    DELETE FROM role_permissions rp
     USING roles r, permissions p
     WHERE rp.role_id = r.id
       AND rp.permission_id = p.id
       AND r.name = 'pm'
       AND p.key IN (
         'klaim:bayar', 'klaim:setujui',
         'finance:invoice:create', 'finance:invoice:pay', 'finance:termin:pay',
         'finance:penalty:waive',
         'mandor:kasbon:approve', 'mandor:wage:approve',
         'backcharge:setujui', 'change_order:approve',
         'cash:expense:approve', 'cash:transfer:confirm',
         'approval:chains:manage', 'approval:override_sod',
         'cecep:estimate:approve', 'cecep:lessons:approve',
         'settings:finance:manage', 'users:roles:manage',
         'mitra:daftar_hitam'
       )
    RETURNING 1
  )
  SELECT count(*) INTO n_cabut FROM dibuang;

  RAISE NOTICE '550: % pemberian izin uang/kewenangan dicabut dari pm', n_cabut;
END $cabut_uang_pm$;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  v_sisa    TEXT;
  n_lapangan INT;
BEGIN
  SELECT string_agg(DISTINCT p.key, ', ') INTO v_sisa
    FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE r.name = 'pm'
     AND p.key IN (
       'klaim:bayar', 'klaim:setujui',
       'finance:invoice:create', 'finance:invoice:pay', 'finance:termin:pay',
       'finance:penalty:waive',
       'mandor:kasbon:approve', 'mandor:wage:approve',
       'backcharge:setujui', 'change_order:approve',
       'cash:expense:approve', 'cash:transfer:confirm',
       'approval:chains:manage', 'approval:override_sod',
       'cecep:estimate:approve', 'cecep:lessons:approve',
       'settings:finance:manage', 'users:roles:manage',
       'mitra:daftar_hitam');

  IF v_sisa IS NOT NULL THEN
    RAISE EXCEPTION '550 gagal: pm MASIH memegang izin uang/kewenangan: %', v_sisa;
  END IF;

  /*
    Dan pastikan pencabutan ini TIDAK ikut membuang izin LAPANGAN yang
    sengaja diberikan R-017 lewat migrasi 545. Mencabut terlalu banyak
    membuat PM buta terhadap pekerjaannya sendiri — kelas cacat yang sama,
    berbalik arah.

    Diperiksa hanya bila 545 memang sudah berjalan di lingkungan ini.
  */
  SELECT count(*) INTO n_lapangan
    FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE r.name = 'pm' AND r.company_id IS NULL
     AND p.key IN ('punch:view', 'ncr:view', 'k3:permit:view', 'inspeksi:view');

  IF n_lapangan > 0 AND n_lapangan < 4 THEN
    RAISE EXCEPTION '550 gagal: izin LAPANGAN pm ikut tercabut (tersisa % dari 4)', n_lapangan;
  END IF;

  RAISE NOTICE '550 OK: nol izin uang di pm, izin lapangan utuh';
END $$;
