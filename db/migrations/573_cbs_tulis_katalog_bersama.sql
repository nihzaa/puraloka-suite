-- ============================================================================
-- 573 — `cbs_templates`/`cbs_nodes`: WITH CHECK migrasi 374 tak pernah berlaku
-- ============================================================================
--
-- ── Cara ini ditemukan
--
-- Dari test merah `template-wbs.test.ts:238`, yang menegaskan sesuatu yang
-- TIDAK ada penjaganya:
--
--     expect(pol[0].with_check,
--       'WITH CHECK masih mengizinkan company_id NULL — tenant mana pun bisa '
--       'membuat baris yang terlihat seluruh tenant lain')
--       .not.toMatch(/company_id IS NULL/i)
--
-- Testnya benar. Basisnya yang salah.
--
-- ── Separuh migrasi 374 berlaku, separuh tidak
--
-- Ini bentuk yang PERSIS sama dengan migrasi 372 (lihat 571): satu berkas
-- mengerjakan dua hal, satu mendarat satu tidak.
--
--     RESTRICTIVE              → BERLAKU     ✅  (kedua tabel)
--     WITH CHECK tanpa IS NULL → TIDAK       ❌  (kedua tabel)
--
-- Kepala migrasi 374 menuliskan maksudnya tanpa ruang tafsir:
--
--   > `WITH CHECK` sengaja TETAP tanpa cabang `IS NULL`: membaca katalog
--   > bersama boleh, MENULIS ke `company_id NULL` tidak — tenant tak boleh
--   > menyunting cetakan yang dipakai tenant lain.
--
-- Dan badan SQL-nya memang menulis `WITH CHECK (company_id = (SELECT
-- auth_company_id()))`. Yang ada di basis: `(company_id IS NULL OR
-- company_id = …)` — bentuk LAMA dari migrasi 131.
--
-- ── Kenapa tak ada yang tahu
--
-- Blok verifikasi 374 memeriksa DUA hal, dan keduanya lolos dengan jujur:
--
--   · policy-nya RESTRICTIVE            → benar, itu memang berlaku
--   · `qual` memuat `company_id IS NULL` → benar, dan itu MEMANG dikehendaki
--     (katalog bersama wajib tetap TERBACA)
--
-- Yang tak pernah diperiksa: `with_check`-nya sendiri — satu-satunya bagian
-- yang tak mendarat. Verifikasi yang jujur atas separuh pekerjaannya sendiri.
--
-- ⚠ Dan penjaga `audit-badan-fungsi-mutakhir.mjs` (lahir kemarin, lihat 572)
-- TIDAK bisa melihat ini, sesuai batas yang tertulis di kepalanya: ia hanya
-- membandingkan BADAN FUNGSI, dan 374 memasang policy lewat `EXECUTE
-- format(...)` — dinamis, sengaja dilewati. Cacat ini ditemukan TEST, bukan
-- penjaga. Batas yang tertulis ternyata batas yang nyata.
--
-- ── Akibatnya, dan seberapa parah — DIUKUR
--
-- `tenant_isolation` RESTRICTIVE digabung AND, jadi WITH CHECK-nya adalah
-- gerbang TULIS yang sesungguhnya. Dengan cabang `IS NULL` di sana, tenant
-- mana pun yang memegang `cecep:cbs:manage` boleh MENULIS baris
-- `company_id = NULL` — dan baris NULL terbaca SELURUH tenant (itu memang
-- guna cabang NULL di USING).
--
-- Jadi satu tenant bisa menyuntikkan cetakan WBS/CBS ke seluruh tenant lain,
-- atau menyunting cetakan bersama yang sudah ada. Bukan kebocoran BACA —
-- kebocoran TULIS, arah yang lebih jarang diperiksa orang.
--
-- Diukur 2026-09-14 sebelum berkas ini ditulis:
--
--     cbs_templates : 1 baris, 1 di antaranya company_id NULL
--
-- Baris NULL itu SAH — ia katalog bersama yang memang dipasang lewat migrasi.
-- Yang ditutup di sini bukan barisnya, melainkan JALUR yang membiarkan baris
-- seperti itu lahir dari tenant.
--
-- ── Yang TIDAK diubah
--
-- `USING` tetap memuat `company_id IS NULL`. Kepala migrasi 374 sudah
-- memperingatkan kenapa, dan peringatannya masih berlaku: menghapusnya akan
-- MENYEMBUNYIKAN seluruh template CBS bawaan dari setiap tenant — kerusakan
-- fitur yang menyamar sebagai perbaikan keamanan.
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cbs_templates', 'cbs_nodes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON public.%I
        AS RESTRICTIVE FOR ALL
        USING (company_id IS NULL OR company_id = (SELECT auth_company_id()))
        WITH CHECK (company_id = (SELECT auth_company_id()))
    $f$, t);
  END LOOP;
END $$;

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
--
-- Memeriksa KETIGA sifatnya sekaligus — termasuk yang dilewatkan 374.
-- Verifikasi yang hanya menanyakan dua dari tiga akan hijau pada keadaan
-- yang sama salahnya, dan itu persis sejarah berkas ini.
DO $$
DECLARE
  t          text;
  v_permis   text;
  v_qual     text;
  v_check    text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cbs_templates', 'cbs_nodes'] LOOP
    SELECT permissive, qual, with_check
      INTO v_permis, v_qual, v_check
      FROM pg_policies
     WHERE schemaname = current_schema()
       AND tablename = t AND policyname = 'tenant_isolation';

    IF v_permis IS NULL THEN
      RAISE EXCEPTION '573 gagal: policy tenant_isolation hilang dari %', t;
    END IF;

    -- (1) RESTRICTIVE — PERMISSIVE digabung OR, jadi ia tak menahan apa pun.
    IF v_permis <> 'RESTRICTIVE' THEN
      RAISE EXCEPTION '573 gagal: tenant_isolation pada % masih % — digabung OR '
                      'dengan policy izin, jadi tak menahan apa pun', t, v_permis;
    END IF;

    -- (2) Katalog bersama WAJIB tetap TERBACA. Kalau cabang ini hilang,
    --     seluruh cetakan CBS bawaan menghilang dari setiap tenant.
    IF v_qual NOT ILIKE '%company_id IS NULL%' THEN
      RAISE EXCEPTION '573 gagal: cabang katalog bersama (company_id IS NULL) '
                      'hilang dari USING pada % — cetakan bawaan jadi tak terbaca', t;
    END IF;

    -- (3) INTI berkas ini — yang tak pernah diperiksa 374.
    --     Membaca katalog bersama boleh; MENULISNYA tidak.
    IF v_check ILIKE '%company_id IS NULL%' THEN
      RAISE EXCEPTION '573 gagal: WITH CHECK pada % masih mengizinkan '
                      'company_id NULL — tenant mana pun bisa menulis baris '
                      'yang terlihat SELURUH tenant lain', t;
    END IF;
  END LOOP;

  RAISE NOTICE '573 OK — cbs_templates & cbs_nodes: katalog bersama TERBACA, tak bisa DITULIS tenant';
END $$;
