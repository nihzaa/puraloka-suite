-- ============================================================================
-- 542 — `template_penerapan` hidup di dev tanpa satu pun migrasi membuatnya
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- CI shard 3:
--
--     Tabel ber-tenant tanpa policy tenant_isolation = data terbaca LINTAS
--     company. Kalau ini tabel baru, tambahkan policy-nya (pola: migration 131).
--       expected [ "template_penerapan", "template_rab" ] to deeply equal []
--
-- `template_rab` sudah ditutup migrasi 541. Yang tersisa `template_penerapan`,
-- dan sebabnya berbeda: **tak satu pun migrasi membuatnya.** Diukur dengan
-- memindai seluruh `CREATE TABLE` di db/migrations — nol kecocokan.
--
-- Migrasi 532 membuat TIGA tabel template (`template_rab`, `template_input`,
-- `template_item`) dari bentuk yang diukur di dev. Tabel keempat ini terlewat.
--
-- ── Kenapa 517 tak menolongnya di basis baru
--
-- 517 memang memagari tabel ini, tapi ia melewati dirinya sendiri:
--
--     IF NOT EXISTS (... relname = 'template_penerapan') THEN
--       RAISE NOTICE '517 dilewati: tabel template_penerapan belum ada';
--
-- Di basis baru tabelnya tak pernah ada, jadi 517 selalu dilewati dan 518
-- juga. Pagar yang menunggu tabel yang tak akan pernah datang.
--
-- ── Akibatnya di VPS, dan kenapa ini bukan sekadar kerapian
--
-- `apps/api/src/utils/tenant-map.generated.ts` MENDAFTARKANNYA sebagai tabel
-- kategori C:
--
--     'template_penerapan': { kategori: 'C', lewat: 'estimate_version_id' }
--
-- Jadi kode menganggapnya ada. Di basis baru ia tidak ada — dan penerapan
-- template RAB (5 baris di dev) tak punya tempat untuk dicatat.
--
-- Bentuk yang sama dengan `template_rab` (541) dan dengan dua sektor take-off
-- yang tercatat di RATIFIKASI: artefak yang lahir di luar jalur migrasi hidup
-- nyaman di dev dan HILANG di tiap basis baru.
--
-- ── Bentuk diambil dari basis, bukan dikarang
--
--     id                   uuid        NOT NULL DEFAULT gen_random_uuid()
--     template_id          uuid        NOT NULL → template_rab(id) ON DELETE RESTRICT
--     template_versi       integer     NOT NULL
--     estimate_version_id  uuid        NOT NULL → estimate_versions(id) ON DELETE CASCADE
--     nilai_input          jsonb       NOT NULL DEFAULT '{}'  CHECK jsonb_typeof = 'object'
--     jumlah_item          integer     NOT NULL DEFAULT 0
--     diterapkan_pada      timestamptz NOT NULL DEFAULT now()
--     diterapkan_oleh      uuid        NULL
--
-- Tanpa `company_id` — sengaja, sama dengan dev. Tenancy-nya lewat
-- `estimate_version_id` (kategori C), persis yang didaftarkan tenant-map.
--
-- Idempoten (`IF NOT EXISTS`). Verifikasi di blok akhir (pola migrasi 142).

CREATE TABLE IF NOT EXISTS public.template_penerapan (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id         uuid        NOT NULL,
  template_versi      integer     NOT NULL,
  estimate_version_id uuid        NOT NULL,
  nilai_input         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  jumlah_item         integer     NOT NULL DEFAULT 0,
  diterapkan_pada     timestamptz NOT NULL DEFAULT now(),
  diterapkan_oleh     uuid
);

/*
  FK dipasang TERPISAH dan bersyarat.

  `template_rab` dibuat migrasi 532 dan `estimate_versions` jauh lebih awal —
  tapi keduanya bisa absen di basis yang dipangkas. FK yang gagal MEMBATALKAN
  seluruh transaksi migrasi, jadi tabel di atas ikut hilang: kegagalan yang
  menuduh migrasi ini padahal sebabnya tabel lain.
*/
DO $fk_penerapan$
BEGIN
  IF to_regclass('public.template_rab') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conname = 'template_penerapan_template_id_fkey') THEN
    ALTER TABLE public.template_penerapan
      ADD CONSTRAINT template_penerapan_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES public.template_rab(id) ON DELETE RESTRICT;
  END IF;

  IF to_regclass('public.estimate_versions') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conname = 'template_penerapan_estimate_version_id_fkey') THEN
    ALTER TABLE public.template_penerapan
      ADD CONSTRAINT template_penerapan_estimate_version_id_fkey
      FOREIGN KEY (estimate_version_id) REFERENCES public.estimate_versions(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'template_penerapan_nilai_input_objek') THEN
    ALTER TABLE public.template_penerapan
      ADD CONSTRAINT template_penerapan_nilai_input_objek
      CHECK (jsonb_typeof(nilai_input) = 'object');
  END IF;
END $fk_penerapan$;

/*
  Pagar dipasang DI SINI, tidak menunggu 517.

  517 sudah tercatat di buku migrasi, jadi ia tak akan berjalan lagi di basis
  yang sudah memutarnya — dan di basis baru ia berjalan SEBELUM tabel ini ada,
  lalu melewati dirinya sendiri. Dua-duanya berakhir tanpa pagar.

  Bentuknya sama persis dengan yang 517 pasang.
*/
ALTER TABLE public.template_penerapan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_penerapan_akses ON public.template_penerapan;
CREATE POLICY template_penerapan_akses ON public.template_penerapan
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation ON public.template_penerapan;
CREATE POLICY tenant_isolation ON public.template_penerapan AS RESTRICTIVE FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.estimate_versions ev
        JOIN public.scenarios sc ON sc.id = ev.scenario_id
        JOIN public.projects p   ON p.id = sc.project_id
       WHERE ev.id = template_penerapan.estimate_version_id
         AND p.company_id = (SELECT auth_company_id())
    )
  );

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_rest INT;
  n_perm INT;
  b_rls  BOOLEAN;
BEGIN
  IF to_regclass('public.template_penerapan') IS NULL THEN
    RAISE EXCEPTION '542 gagal: tabel tak terbentuk';
  END IF;

  SELECT c.relrowsecurity INTO b_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'template_penerapan';
  IF NOT b_rls THEN
    RAISE EXCEPTION '542 gagal: RLS mati di template_penerapan';
  END IF;

  SELECT count(*) FILTER (WHERE permissive = 'RESTRICTIVE'),
         count(*) FILTER (WHERE permissive = 'PERMISSIVE')
    INTO n_rest, n_perm
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'template_penerapan';

  IF n_rest = 0 THEN
    RAISE EXCEPTION '542 gagal: tanpa pagar RESTRICTIVE — terbaca lintas tenant';
  END IF;

  -- Himpunan permissive KOSONG bernilai FALSE: tabel tak terbaca siapa pun.
  IF n_perm = 0 THEN
    RAISE EXCEPTION '542 gagal: tanpa satu pun PERMISSIVE — buntu bagi semua orang';
  END IF;

  RAISE NOTICE '542 OK: template_penerapan ada & berpagar (% restrictive, % permissive)',
    n_rest, n_perm;
END $$;
