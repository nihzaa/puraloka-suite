-- ============================================================================
-- 517 · `template_penerapan` — RLS aktif, NOL policy, nol pagar tenant
-- ============================================================================
--
-- Ditemukan `audit-tabel-force-berpagar` 2026-08-29, sesudah peta tenancy
-- di-regenerate (269 → 294 tabel). Regenerasi itu menaikkan jumlah tabel
-- kategori C dari 117 ke 118, dan yang ke-118 inilah yang tak berpagar.
--
-- Keadaannya sebelum migrasi ini:
--
--     RLS       : aktif
--     FORCE     : tidak
--     policy    : NOL
--     baris     : 5
--
-- Dua akibat, dan keduanya buruk dengan cara berbeda:
--
--   · Tanpa FORCE, pemilik tabel melewati RLS — jadi hari ini isinya
--     bergantung sepenuhnya pada disiplin kode, sama seperti seluruh basis
--     sebelum migrasi 510.
--   · Kalau kelak ada yang mem-FORCE-nya (mis. sapuan berikutnya), tabelnya
--     langsung TAK TERBACA SIAPA PUN — himpunan policy kosong bernilai FALSE.
--     Itu cacat 149/511 yang menunggu giliran.
--
-- `template_penerapan` mencatat penerapan template RAB ke sebuah versi
-- estimasi: template mana, versi berapa, nilai input, siapa yang menerapkan.
-- Bocor lintas tenant berarti perusahaan lain melihat template apa yang
-- dipakai pesaingnya dan dengan angka apa.
--
-- ── Rantai tenancy-nya
--
-- Peta menyatakan `lewat: 'estimate_version_id'`, dan rantainya:
--
--     template_penerapan.estimate_version_id
--       → estimate_versions.scenario_id → scenarios.project_id → projects.company_id
--
-- Sudah ada fungsi pembantu untuk hop itu — `t5_company_dari_estimate_version`,
-- yang dipakai `estimate_items` dan (sejak 515) `takeoff_dimensi`. Dipakai
-- ulang di sini alih-alih menulis join sendiri: satu bentuk untuk satu rantai,
-- supaya perubahan rantai tak perlu dikejar di banyak tempat.
--
-- ── Dua policy, dua tugas
--
--   PERMISSIVE  memberi akses (digabung OR) — tanpa ini tabel jadi buntu
--   RESTRICTIVE menyaring tenant (digabung AND) — ini pagarnya
--
-- Pemberi aksesnya `true` polos, bukan pemeriksaan izin. Alasannya sama dengan
-- migrasi 513: tabel ini SEBELUMNYA tak punya gerbang izin sama sekali, jadi
-- menambahkan pemeriksaan izin di sini bukan memulihkan keadaan melainkan
-- mengubah perilaku — dan perubahan otorisasi harus lahir dari keputusan,
-- bukan dari perbaikan cacat.
--
-- ── Idempoten: DROP IF EXISTS sebelum tiap CREATE.
-- ============================================================================

DO $$
DECLARE
  n_sisa int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class
                  WHERE relnamespace = 'public'::regnamespace
                    AND relkind = 'r' AND relname = 'template_penerapan') THEN
    RAISE NOTICE '517 dilewati: tabel template_penerapan belum ada';
    RETURN;
  END IF;

  ALTER TABLE public.template_penerapan ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.template_penerapan FORCE  ROW LEVEL SECURITY;

  /* Pemberi akses — tanpa ini FORCE membuatnya tak terbaca siapa pun. */
  DROP POLICY IF EXISTS template_penerapan_akses ON public.template_penerapan;
  CREATE POLICY template_penerapan_akses ON public.template_penerapan
    FOR ALL USING (true) WITH CHECK (true);

  /* Pagar tenant — kategori C, telusuri induk sampai company. */
  DROP POLICY IF EXISTS tenant_isolation ON public.template_penerapan;
  CREATE POLICY tenant_isolation ON public.template_penerapan AS RESTRICTIVE FOR ALL
    USING (
      t5_company_dari_estimate_version(estimate_version_id)
        = (SELECT auth_company_id()))
    WITH CHECK (
      t5_company_dari_estimate_version(estimate_version_id)
        = (SELECT auth_company_id()));

  -- ── VERIFIKASI ────────────────────────────────────────────────────────

  SELECT count(*) INTO n_sisa
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'template_penerapan'
     AND permissive = 'RESTRICTIVE';
  IF n_sisa = 0 THEN
    RAISE EXCEPTION '517 gagal: pagar RESTRICTIVE tak terpasang';
  END IF;

  SELECT count(*) INTO n_sisa
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'template_penerapan'
     AND permissive = 'PERMISSIVE';
  IF n_sisa = 0 THEN
    RAISE EXCEPTION
      '517 gagal: nol policy PERMISSIVE — tabel di-FORCE tanpa pemberi akses, tak terbaca siapa pun';
  END IF;

  RAISE NOTICE '517 OK: template_penerapan berpagar tenant dan tetap terbaca';
END $$;
