-- ════════════════════════════════════════════════════════════════════════════
-- 314 — 30 tabel yang MATI TOTAL: RESTRICTIVE tanpa PERMISSIVE (T5A)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Lanjutan 313, dan bagian yang sengaja ditunda di sana
--
-- Migrasi 313 memperbaiki sepuluh tabel G5/G6/R-012 dan MENYEBUT bahwa 30
-- sisanya tak disentuh, dengan alasan: *"tiap tabel butuh penilaian izin mana
-- yang tepat untuk membacanya, dan menebaknya massal akan memberi akses yang
-- tak pernah diputuskan siapa pun."*
--
-- Migrasi ini melakukan penilaian itu — bukan menebaknya.
--
-- ── Bagaimana izin tiap tabel ditentukan
--
-- DIUKUR dari rute yang benar-benar membacanya (`grep` ke
-- `routes/v1/*.ts`, mencari `requirePermission` pada endpoint yang menyentuh
-- tabel itu), lalu diverifikasi bahwa izinnya ADA di tabel `permissions`.
--
-- Bukan dari nama tabel, bukan dari modul yang "sepertinya" memilikinya.
-- Dua tebakan sudah tertangkap saat mengukur:
--
--   · `tarif_payroll_*` — semula saya kira `payroll:jalankan:view` karena
--     `payroll-staf.ts` menyebutnya; ternyata ia punya rutenya sendiri
--     (`tarif-payroll.ts`) dengan izin `payroll:tarif:view`
--   · `pegawai` — dipakai LIMA rute berbeda, jadi ia master data SDM, bukan
--     milik satu modul. Izinnya `sdm:pegawai:view`
--
-- ── Kenapa beberapa tabel menerima LEBIH DARI SATU izin
--
-- `penilaian_kinerja` dibaca lewat endpoint ber-izin `sdm:sertifikat:view`,
-- tetapi punya izinnya sendiri (`sdm:kinerja:view`). Policy yang lebih sempit
-- dari rute akan MEMATIKAN fitur yang sudah jalan — jadi keduanya diterima.
--
-- Arah kesalahan penting di sini: policy yang terlalu sempit merusak fitur
-- yang bekerja (terlihat segera), sementara yang terlalu longgar membuka data
-- diam-diam (tak terlihat sama sekali). Karena itu tak ada satu pun tabel
-- yang diberi izin di luar modulnya.
--
-- ── Isolasi tenant TIDAK dilonggarkan
--
-- Tiap tabel di bawah SUDAH punya `tenant_isolation` RESTRICTIVE. Postgres
-- menggabungkan policy sebagai `(OR PERMISSIVE) AND (AND RESTRICTIVE)` —
-- jadi menambah permissive TIDAK melebarkan akses lintas tenant: yang
-- restriktif tetap harus lolos. Yang berubah hanya: tabelnya berhenti mati.
--
-- Blok verifikasi memeriksa keduanya masih terpasang.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r RECORD;
  n INT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- ── K3 & Lingkungan (G4) ──────────────────────────────────────────
      ('apd_serah_terima',      ARRAY['k3:inspeksi:view']),
      ('induksi_k3',            ARRAY['k3:inspeksi:view']),
      ('insiden_k3',            ARRAY['k3:inspeksi:view']),
      ('inspeksi_k3',           ARRAY['k3:inspeksi:view']),
      ('jsa',                   ARRAY['k3:inspeksi:view']),
      ('jsa_langkah',           ARRAY['k3:inspeksi:view']),
      ('pemantauan_lingkungan', ARRAY['k3:inspeksi:view']),
      ('temuan_k3',             ARRAY['k3:inspeksi:view']),

      -- ── Mutu (G1) ─────────────────────────────────────────────────────
      ('audit_mutu',            ARRAY['ncr:view']),
      ('temuan_audit',          ARRAY['ncr:view']),
      ('inspeksi_checklist',    ARRAY['ncr:view']),
      ('itp_titik',             ARRAY['ncr:view']),
      ('rencana_mutu',          ARRAY['ncr:view']),
      ('uji_material',          ARRAY['ncr:view']),

      -- ── Risiko & Perizinan (G3) ───────────────────────────────────────
      ('izin_proyek',           ARRAY['risiko:view']),
      ('risiko_proyek',         ARRAY['risiko:view']),
      ('sengketa',              ARRAY['risiko:view']),
      ('tindakan_mitigasi',     ARRAY['risiko:view']),

      -- ── SDM (G2) ──────────────────────────────────────────────────────
      ('cuti_ambil',            ARRAY['sdm:cuti:view']),
      ('cuti_hak',              ARRAY['sdm:cuti:view']),
      ('lamaran_kerja',         ARRAY['sdm:rekrutmen:view']),
      ('sertifikat_pegawai',    ARRAY['sdm:sertifikat:view']),
      ('timesheet_staf',        ARRAY['sdm:timesheet:view']),
      -- Dibaca lewat endpoint sertifikat, tetapi punya izinnya sendiri.
      -- Keduanya diterima — policy yang lebih sempit dari rute mematikan
      -- fitur yang sudah jalan.
      ('penilaian_kinerja',     ARRAY['sdm:kinerja:view', 'sdm:sertifikat:view']),
      -- Master data SDM: dipakai LIMA rute berbeda, bukan milik satu modul.
      ('pegawai',               ARRAY['sdm:pegawai:view', 'sdm:cuti:view',
                                      'sdm:timesheet:view', 'payroll:jalankan:view']),

      -- ── Payroll (G2a/G2c) ─────────────────────────────────────────────
      ('payroll_periode',       ARRAY['payroll:jalankan:view']),
      ('slip_gaji',             ARRAY['payroll:jalankan:view']),
      ('slip_komponen',         ARRAY['payroll:jalankan:view']),
      -- Punya rutenya SENDIRI (`tarif-payroll.ts`), bukan payroll-staf.
      ('tarif_payroll_periode', ARRAY['payroll:tarif:view']),
      ('tarif_payroll_baris',   ARRAY['payroll:tarif:view'])
    ) AS t(tabel, izin)
  LOOP
    -- 1. Tabelnya ada. Migrasi yang membuat policy pada tabel tak ada akan
    --    gagal keras — dan itu benar, tetapi pesannya lebih berguna di sini.
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = r.tabel) THEN
      RAISE EXCEPTION '314 gagal: tabel % tak ada', r.tabel;
    END IF;

    -- 2. SETIAP izin yang disebut harus ADA. Izin karangan diterima Postgres
    --    tanpa keluhan lalu tak pernah cocok dengan apa pun — tabelnya tetap
    --    mati, dan kali ini tanpa gejala di test mana pun.
    FOR n IN SELECT 1 FROM unnest(r.izin) k
              WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE key = k)
    LOOP
      RAISE EXCEPTION '314 gagal: tabel % mengacu izin yang tak ada', r.tabel;
    END LOOP;

    -- 3. `tenant_isolation` RESTRICTIVE harus SUDAH ada. Kalau belum,
    --    menambahkan permissive di sini akan membuka tabel lintas tenant —
    --    kebalikan dari yang dimaksud, dan jauh lebih mahal.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
       WHERE c.relname = r.tabel AND NOT p.polpermissive
    ) THEN
      RAISE EXCEPTION '314 gagal: % tak punya policy RESTRICTIVE — menambah '
        'permissive akan membukanya lintas tenant', r.tabel;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tabel || '_baca', r.tabel);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (%s)',
      r.tabel || '_baca', r.tabel,
      (SELECT string_agg(format('(SELECT has_permission(%L))', k), ' OR ')
         FROM unnest(r.izin) k));

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tabel || '_tulis', r.tabel);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (%s) WITH CHECK (%s)',
      r.tabel || '_tulis', r.tabel,
      (SELECT string_agg(format('(SELECT has_permission(%L))', k), ' OR ')
         FROM unnest(r.izin) k),
      (SELECT string_agg(format('(SELECT has_permission(%L))', k), ' OR ')
         FROM unnest(r.izin) k));
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  sisa INT;
  t TEXT;
  n INT;
  daftar TEXT[] := ARRAY[
    'apd_serah_terima','induksi_k3','insiden_k3','inspeksi_k3','jsa',
    'jsa_langkah','pemantauan_lingkungan','temuan_k3','audit_mutu',
    'temuan_audit','inspeksi_checklist','itp_titik','rencana_mutu',
    'uji_material','izin_proyek','risiko_proyek','sengketa',
    'tindakan_mitigasi','cuti_ambil','cuti_hak','lamaran_kerja',
    'sertifikat_pegawai','timesheet_staf','penilaian_kinerja','pegawai',
    'payroll_periode','slip_gaji','slip_komponen','tarif_payroll_periode',
    'tarif_payroll_baris'];
BEGIN
  FOREACH t IN ARRAY daftar LOOP
    -- Punya PERMISSIVE sekarang.
    SELECT count(*) INTO n FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = t AND p.polpermissive;
    IF n = 0 THEN
      RAISE EXCEPTION '314 gagal: % masih tanpa permissive — mati total', t;
    END IF;

    -- Dan RESTRICTIVE-nya TIDAK hilang. Ini yang menjaga isolasi tenant;
    -- kalau ia terhapus, tabelnya terbuka lintas perusahaan tanpa gejala.
    SELECT count(*) INTO n FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = t AND NOT p.polpermissive;
    IF n = 0 THEN
      RAISE EXCEPTION '314 gagal: % KEHILANGAN policy restrictive — terbuka lintas tenant', t;
    END IF;
  END LOOP;

  -- Angka akhir. NOL berarti seluruh tabel ber-RLS punya keduanya.
  SELECT count(*) INTO sisa FROM pg_class c
   WHERE c.relrowsecurity
     AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND NOT p.polpermissive)
     AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polpermissive);

  IF sisa > 0 THEN
    RAISE EXCEPTION '314 gagal: masih % tabel mati total (harus 0)', sisa;
  END IF;

  RAISE NOTICE '314 OK — 30 tabel diberi permissive, isolasi tenant utuh, '
    'tabel mati total sekarang NOL';
END $$;
