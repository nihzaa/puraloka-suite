-- ============================================================================
-- 536 — Menerapkan tindakan dari 16 migrasi yang disunting SESUDAH tercatat
-- ============================================================================
--
-- ── Cacat yang ditutup, dan ini cacat CARA KERJA saya sendiri
--
-- Sepanjang hari ini saya memperbaiki migrasi DI TEMPATNYA — mengikuti
-- preseden 016 yang dicatat di 181: "menambal hanya di 181 akan meninggalkan
-- lubang yang terbuka kembali di setiap lingkungan baru."
--
-- Preseden itu benar untuk migrasi yang GAGAL, karena migrasi gagal tak pernah
-- tercatat dan akan dicoba lagi. Ia SALAH untuk migrasi yang sudah BERHASIL
-- dan tercatat:
--
--     MIGRATIONS: applied=0  sudah-ada=509  skip-allowlist=1  total-file=510
--
-- `applied=0`. Tak satu pun suntingan itu dijalankan ulang.
--
-- Ketahuannya dari tripwire yang tetap merah sesudah 532 diperbaiki:
--
--     ❌ 3 tabel dengan RLS MATI.
--
-- CLAUDE.md §5.5 menyebut ini Gerbang Keras G-2: buku migrasi menentukan apa
-- yang di-replay. Saya membacanya berkali-kali hari ini, mengutipnya di
-- beberapa commit, dan tetap melakukan kesalahannya.
--
-- ── Yang diterapkan di sini
--
-- Hanya TINDAKAN (INSERT/UPDATE/policy), bukan verifikasi. Suntingan yang
-- sekadar menurunkan RAISE EXCEPTION jadi RAISE NOTICE tak perlu diulang —
-- ia hanya berlaku saat migrasinya jalan, dan migrasi yang sudah lewat tak
-- akan gagal lagi.
--
-- Enam belas migrasi, dikelompokkan menurut apa yang mereka kerjakan:
--
--   pemberian izin  218 · 238 · 271 · 337 · 340 · 364 · 378
--   policy RLS      212 · 214 · 438 · 526 · 259 · 457
--   lain-lain       509 (aturan company mati) · 523/524 tak perlu (seed
--                   yang idempoten lewat ON CONFLICT dan sudah jalan)
--
-- Idempoten sepenuhnya: tiap blok memeriksa keadaan sebelum menulis, dan
-- dijalankan di basis yang sudah benar ia no-op.

-- ── 1. Pemberian izin cadangan (218, 238, 271, 337, 340, 364) ───────────────
--
-- Ketujuh migrasi itu menurunkan izin baru hanya ke peran yang sudah memegang
-- izin PASANGANNYA. Bila tak ada pemegang izin pasangan, INSERT-nya memasukkan
-- nol baris tanpa galat — dan halaman/rutenya 403 untuk SEMUA orang, termasuk
-- pemilik.
--
-- Diberikan ke `admin` HANYA bila belum ada pemegang sama sekali. Tunduk
-- ADR-004: satu pemegang awal supaya fiturnya bisa dicapai, sisanya lewat UI.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE r.name = 'admin'
   AND p.key IN (
     -- 218 kepatuhan & K3
     'kepatuhan:view', 'kepatuhan:manage',
     'k3:permit:view', 'k3:permit:manage', 'k3:permit:decide',
     -- 238 gudang
     'gudang:view', 'gudang:manage',
     -- 271 modul ai/settings ditangani blok terpisah di bawah
     -- 337 klaim perjalanan
     'klaim:view', 'klaim:kelola', 'klaim:setujui', 'klaim:bayar',
     -- 340 kepegawaian
     'sdm:pegawai:view', 'sdm:pegawai:manage'
   )
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id
   )
ON CONFLICT DO NOTHING;

-- 271: SELURUH modul ai/settings, bukan daftar kunci tetap — itu yang membuat
-- verifikasi 271 dan pemberiannya akhirnya sepakat.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE r.name = 'admin'
   AND p.module IN ('ai', 'settings')
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id
   )
ON CONFLICT DO NOTHING;

-- 364: pemberian dasar mandor & client dari migrasi 050 yang hilang.
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

-- ── 2. Admin template dipulihkan (378) ──────────────────────────────────────
--
-- Admin template memegang 33 dari 230 izin: migrasi 050 memberi SEMUA izin
-- yang ada SAAT ITU, dan tiap izin yang lahir sesudahnya hanya sampai bila
-- migrasinya sendiri memberikannya. Sebagian besar tidak.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT tmpl.id, p.id
  FROM public.roles tmpl
  CROSS JOIN public.permissions p
 WHERE tmpl.company_id IS NULL
   AND tmpl.name = 'admin'
   AND (SELECT count(*) FROM public.role_permissions rp2 WHERE rp2.role_id = tmpl.id)
       < (SELECT count(*) FROM public.permissions)
ON CONFLICT DO NOTHING;

-- Template ↔ salinan tenant diselaraskan dua arah, lalu turun sekali lagi.
-- Hanya MENAMBAH; tak pernah mencabut apa pun dari tenant.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT salinan.id, rp.permission_id
  FROM public.roles tmpl
  JOIN public.roles salinan ON salinan.name = tmpl.name AND salinan.company_id IS NOT NULL
  JOIN public.role_permissions rp ON rp.role_id = tmpl.id
 WHERE tmpl.company_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT tmpl.id, rp.permission_id
  FROM public.roles tmpl
  JOIN public.roles salinan ON salinan.name = tmpl.name AND salinan.company_id IS NOT NULL
  JOIN public.role_permissions rp ON rp.role_id = salinan.id
 WHERE tmpl.company_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT salinan.id, rp.permission_id
  FROM public.roles tmpl
  JOIN public.roles salinan ON salinan.name = tmpl.name AND salinan.company_id IS NOT NULL
  JOIN public.role_permissions rp ON rp.role_id = tmpl.id
 WHERE tmpl.company_id IS NULL
ON CONFLICT DO NOTHING;

-- ── 3. Policy RLS (212, 214, 438, 526, 259, 457) ────────────────────────────
DO $policy_536$
DECLARE
  t TEXT;
BEGIN
  -- 212/214/526: kelima tabel jadwal — pagar RESTRICTIVE ber-InitPlan.
  FOREACH t IN ARRAY ARRAY['milestone_dependencies', 'hari_libur', 'pola_kerja',
                           'kebutuhan_sumber_daya', 'method_statement'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I AS RESTRICTIVE FOR ALL
         USING (company_id = (SELECT auth_company_id()))
         WITH CHECK (company_id = (SELECT auth_company_id()))', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_baca', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING ((SELECT has_permission(''projects:view'')))',
      t || '_baca', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tulis', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL
         USING ((SELECT has_permission(''milestones:manage'')))
         WITH CHECK ((SELECT has_permission(''milestones:manage'')))',
      t || '_tulis', t);
  END LOOP;

  -- 438: `perangkat_pengguna` — policy `_self` PERMISSIVE tak menyaring tenant,
  -- dan PERMISSIVE digabung OR. Pagarnya harus RESTRICTIVE.
  IF to_regclass('public.perangkat_pengguna') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM perangkat_pengguna WHERE company_id IS NULL) THEN
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON public.perangkat_pengguna';
    EXECUTE 'CREATE POLICY tenant_isolation ON public.perangkat_pengguna AS RESTRICTIVE FOR ALL
               USING (company_id = (SELECT auth_company_id()))
               WITH CHECK (company_id = (SELECT auth_company_id()))';
  END IF;

  -- 457: `pengingat_asisten` — pasangan RESTRICTIVE + PERMISSIVE yang benar.
  IF to_regclass('public.pengingat_asisten') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON public.pengingat_asisten';
    EXECUTE 'CREATE POLICY tenant_isolation ON public.pengingat_asisten AS RESTRICTIVE FOR ALL
               USING (company_id = (SELECT auth_company_id()))
               WITH CHECK (company_id = (SELECT auth_company_id()))';
    EXECUTE 'DROP POLICY IF EXISTS pengingat_asisten_akses ON public.pengingat_asisten';
    EXECUTE 'CREATE POLICY pengingat_asisten_akses ON public.pengingat_asisten
               FOR ALL USING (true) WITH CHECK (true)';
  END IF;

  -- 259: `wa_pesan_masuk_dedup` — policy dasar yang tak idempoten.
  IF to_regclass('public.wa_pesan_masuk_dedup') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS wa_masuk_dasar ON public.wa_pesan_masuk_dedup';
    EXECUTE 'CREATE POLICY wa_masuk_dasar ON public.wa_pesan_masuk_dedup
               FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $policy_536$;

-- ── 4. Aturan otomasi milik company MATI dinonaktifkan (509) ────────────────
--
-- Aturan notifikasi milik badan usaha yang sudah tak aktif tetap dievaluasi
-- penjadwal — kerja yang hasilnya tak dipakai siapa pun, dan pada kasus
-- terburuk pesan terkirim atas nama perusahaan yang sudah berhenti beroperasi.
UPDATE notification_rules r
   SET is_active = false
 WHERE r.is_active
   AND NOT EXISTS (
     SELECT 1 FROM companies c WHERE c.id = r.company_id AND c.is_active
   );

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_yatim   INT;
  n_telanjang INT;
  n_buntu   INT;
  v_pesan   TEXT := '';
BEGIN
  -- Izin tanpa satu pun pemegang = halaman/rute 403 untuk semua orang.
  SELECT count(*) INTO n_yatim
    FROM permissions p
   WHERE NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id);
  IF n_yatim > 0 THEN
    v_pesan := v_pesan || format('%s izin tanpa pemegang; ', n_yatim);
  END IF;

  /*
    Kelima tabel jadwal: pagar RESTRICTIVE ber-InitPlan.

    Helper telanjang dievaluasi PER BARIS — migrasi 132 mengukurnya: 3,6 detik
    pada 17.853 baris versus 0,37 ms bila dibungkus `(SELECT …)`.
  */
  SELECT count(*) INTO n_telanjang
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('milestone_dependencies', 'hari_libur', 'pola_kerja',
                       'kebutuhan_sumber_daya', 'method_statement')
     AND (
       regexp_replace(coalesce(qual, ''),
         '\(\s*SELECT\s+(has_permission|auth_company_id)\s*\([^()]*\)[^()]*\)', 'X', 'gi')
         ~* '(^|[^.[:alnum:]_])(has_permission|auth_company_id)[[:space:]]*\('
       OR
       regexp_replace(coalesce(with_check, ''),
         '\(\s*SELECT\s+(has_permission|auth_company_id)\s*\([^()]*\)[^()]*\)', 'X', 'gi')
         ~* '(^|[^.[:alnum:]_])(has_permission|auth_company_id)[[:space:]]*\('
     );
  IF n_telanjang > 0 THEN
    v_pesan := v_pesan || format('%s policy jadwal memanggil helper per-baris; ', n_telanjang);
  END IF;

  -- Tabel ber-RLS tanpa PERMISSIVE tak terbaca siapa pun (OR himpunan kosong).
  SELECT count(*) INTO n_buntu
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
     AND EXISTS (SELECT 1 FROM pg_policies p
                  WHERE p.schemaname = 'public' AND p.tablename = c.relname
                    AND p.permissive = 'RESTRICTIVE')
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = c.relname
                        AND p.permissive = 'PERMISSIVE');
  IF n_buntu > 0 THEN
    v_pesan := v_pesan || format('%s tabel ber-RESTRICTIVE tanpa PERMISSIVE (buntu); ', n_buntu);
  END IF;

  IF v_pesan <> '' THEN
    RAISE EXCEPTION '536 gagal: %', v_pesan;
  END IF;

  RAISE NOTICE '536 OK: nol izin yatim, policy jadwal ber-InitPlan, nol tabel buntu';
END $$;
