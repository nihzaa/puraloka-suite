-- ============================================================================
-- 545 — PM diberi 19 izin LAPANGAN. Nol yang menyentuh uang.
-- ============================================================================
--
-- ── Keputusan yang dijalankan (R-017 bentuk 1, diperluas)
--
-- Founder menyerahkan keputusannya ("ikut rekomendasimu"). Yang dipilih:
-- **bentuk paling sempit yang benar-benar menutup gejala**, bukan bentuk 2
-- atau 3 yang menyentuh keuangan.
--
-- ── Yang diukur lebih dulu
--
-- Peran `pm` memegang 37 dari 230 izin. Migrasi 050 seharusnya memberinya
-- semua kecuali sepuluh larangan, dan `projects:view` TAK ADA di daftar
-- larangan itu — jadi hilangnya memang cacat, bukan kebijakan.
--
-- Tapi 183 izin yang "bisa dipulihkan" memuat `klaim:bayar`,
-- `finance:invoice:create`/`:pay`, `backcharge:setujui`,
-- `mandor:kasbon:approve`, `approval:chains:manage`. Memulihkan semuanya
-- memberi PM kewenangan finansial penuh — dan itu bertabrakan langsung
-- dengan sepuluh spek `authz-endpoints.test.ts` yang sengaja ditulis
-- `deny: 'pm'`.
--
-- Migrasi ini TIDAK memulihkan semuanya. Ia memberi 19 izin yang:
--   · policy-nya benar-benar MEMBACA izin (bukan literal peran), dan
--   · nol di antaranya memindahkan, menyetujui, atau menerbitkan uang.
--
-- ── Kenapa `projects:view` tetap diberikan meski policy tak membacanya
--
-- Diukur: `projects` tak punya satu pun policy yang memeriksa
-- `projects:view` — PM melihat proyek lewat `pm_id`. Jadi izin ini TIDAK
-- mengubah apa yang terlihat hari ini.
--
-- Ia tetap diberikan karena dua alasan yang bisa diukur:
--   1. Migrasi 156 (punch) dan 189 (NCR) MENGASUMSIKAN pm memilikinya —
--      komentarnya menulis "admin, pm, mandor, client, direktur".
--   2. `client` (pihak LUAR) memegangnya sementara PM tidak. Ketimpangan
--      itu akan terbaca sebagai cacat oleh siapa pun yang memeriksanya
--      nanti, dan memicu perbaikan yang salah arah.
--
-- ── Yang SENGAJA TIDAK diberikan
--
--   change_order:approve   MENGUBAH NILAI KONTRAK, dan rutenya nol ambang
--                          nominal (diperiksa: `change-orders.ts`). Ini
--                          satu-satunya dari sepuluh spek deny yang akan
--                          jadi salah bila diberikan.
--   klaim:*, finance:*     memindahkan uang
--   mandor:kasbon:approve  menyetujui uang muka
--   approval:chains:manage mengubah siapa menyetujui apa
--
-- Dengan begitu **nol dari sepuluh spek `deny: 'pm'` menjadi salah** —
-- diperiksa satu per satu, bukan diasumsikan.
--
-- Idempoten (`ON CONFLICT DO NOTHING`). Verifikasi di blok akhir (pola 142).
--
-- Berlaku untuk peran `pm` di SEMUA company, bukan hanya template — tenant
-- yang sudah berdiri juga menderita cacat yang sama.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.key IN (
    'projects:view',
    'punch:view',       'punch:manage',       'punch:verify',
    'ncr:view',         'ncr:manage',         'ncr:verify',      'ncr:disposisi',
    'k3:permit:view',   'k3:permit:manage',   'k3:permit:decide',
    'inspeksi:view',    'inspeksi:manage',    'inspeksi:periksa',
    'mutu:rmp:view',    'mutu:rmp:manage',    'mutu:rmp:approve',
    'mutu:uji:view',    'mutu:uji:manage'
  )
 WHERE r.name = 'pm'
ON CONFLICT DO NOTHING;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_pm      INT;
  n_kurang  INT;
  v_uang    TEXT;
BEGIN
  SELECT count(*) INTO n_pm
    FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
   WHERE r.name = 'pm' AND r.company_id IS NULL;

  -- Ke-19 izin harus BENAR-BENAR terpasang di template.
  SELECT count(*) INTO n_kurang
    FROM (VALUES
      ('projects:view'),('punch:view'),('punch:manage'),('punch:verify'),
      ('ncr:view'),('ncr:manage'),('ncr:verify'),('ncr:disposisi'),
      ('k3:permit:view'),('k3:permit:manage'),('k3:permit:decide'),
      ('inspeksi:view'),('inspeksi:manage'),('inspeksi:periksa'),
      ('mutu:rmp:view'),('mutu:rmp:manage'),('mutu:rmp:approve'),
      ('mutu:uji:view'),('mutu:uji:manage')
    ) AS w(k)
   WHERE NOT EXISTS (
     SELECT 1 FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE r.name = 'pm' AND r.company_id IS NULL AND p.key = w.k);

  IF n_kurang > 0 THEN
    RAISE EXCEPTION '545 gagal: % dari 19 izin lapangan tak terpasang di pm', n_kurang;
  END IF;

  /*
    PAGAR TERPENTING: pm tak boleh mendapat izin UANG sebagai efek samping.

    Kalau daftar di atas suatu saat disunting sembarangan, yang gagal
    migrasi ini — bukan test authz besok, di tempat yang jauh dari sebabnya.
  */
  SELECT string_agg(p.key, ', ') INTO v_uang
    FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE r.name = 'pm'
     AND p.key IN ('change_order:approve', 'klaim:bayar', 'klaim:setujui',
                   'finance:invoice:create', 'finance:invoice:pay',
                   'finance:termin:pay', 'backcharge:setujui',
                   'mandor:kasbon:approve', 'approval:chains:manage',
                   'approval:override_sod', 'mitra:daftar_hitam');

  IF v_uang IS NOT NULL THEN
    RAISE EXCEPTION '545 gagal: pm memegang izin UANG/kewenangan: %', v_uang;
  END IF;

  RAISE NOTICE '545 OK: pm template % izin · 19 izin lapangan terpasang · nol izin uang', n_pm;
END $$;
