-- ============================================================================
-- 581 — `approval_chain_template` RLS aktif tapi NOL policy; tabelnya BUTA
-- ============================================================================
--
-- ── Cacat yang ditutup, dan ini cacat SAYA SENDIRI
--
-- Migrasi 580 (R-010) membuat `approval_chain_template` — katalog bersama 13
-- jenis rantai approval yang dipasang trigger ke tiap tenant baru. RLS-nya
-- dinyalakan; **policy-nya tak pernah ditulis**.
--
-- Himpunan PERMISSIVE yang kosong bernilai FALSE. Jadi tabel itu tak terbaca
-- SIAPA PUN lewat klien ber-token pengguna — bukan "terbatas", melainkan nol
-- baris untuk semua.
--
-- Nol gejala selama sepuluh hari, dan sebabnya masuk akal: satu-satunya
-- pembacanya adalah TRIGGER `trg_company_rantai_approval`, yang berjalan
-- SECURITY DEFINER dan karena itu menembus RLS. Tenant baru tetap lahir
-- dengan 13 rantai — benar — sementara tabel sumbernya tak bisa dilihat
-- aplikasi sama sekali. Yang akan menemukannya: halaman pengaturan pertama
-- yang mencoba menampilkan katalognya, dan ia akan melapor "belum ada data"
-- alih-alih galat.
--
-- Ditemukan `t5a0-policy-dasar.test.ts` pada suite penuh 2026-09-14:
--
--     expected [ 'approval_chain_template' ] to deeply equal []
--
-- Penjaganya sudah ada dan bekerja. Yang gagal: saya tak menjalankannya
-- sesudah 580.
--
-- ── Kenapa POLA `permissions`, bukan pola tenant
--
-- Tabel ini **tak punya `company_id`** — 13 baris yang sama untuk semua
-- tenant (kategori C). Jadi tak ada yang bisa disaring per-tenant; yang perlu
-- dijaga justru arah TULIS.
--
-- Pola yang disalin sudah hidup di basis ini untuk kasus yang sama persis
-- (`permissions`, diverifikasi ke `pg_policies`, bukan dikarang):
--
--     baca  : authenticated OR service_role
--     tulis : service_role SAJA
--
-- ⚠ Arah tulis itu bukan kehati-hatian berlebih. Katalog bersama yang bisa
-- ditulis tenant adalah cacat yang sudah dibayar SEKALI di repo ini: migrasi
-- 573 menutup `cbs_catalog` yang WITH CHECK-nya tak pernah mendarat, dan di
-- sana satu tenant bisa mengubah katalog yang dipakai SEMUA tenant. Di tabel
-- ini akibatnya lebih tajam lagi — ia menentukan alur persetujuan yang lahir
-- di tiap pelanggan BARU.
--
-- Idempoten: DROP IF EXISTS + CREATE. Verifikasi di blok akhir (pola 142).

DO $policy_katalog_rantai$
BEGIN
  IF to_regclass('public.approval_chain_template') IS NULL THEN
    RAISE NOTICE '581 dilewati: tabel approval_chain_template tak ada di basis ini';
    RETURN;
  END IF;

  /*
    RLS DINYALAKAN DI SINI — ditambahkan 2026-09-15, dan ketiadaannya adalah
    cacat kedua saya dengan bentuk yang SAMA PERSIS seperti migrasi 579.

    Migrasi 580 membuat tabel ini tanpa `ENABLE ROW LEVEL SECURITY`, dan 581
    (versi pertama) hanya memasang policy. Di dev tabelnya ber-RLS — entah
    dinyalakan tangan atau oleh jalur lain — jadi keduanya terlihat benar dan
    `t5a0-policy-dasar` hijau.

    Di basis BERSIH, replay 580+581 meninggalkan tabel **RLS MATI dengan dua
    policy yang tak berlaku apa-apa**, dan tripwire F2-6 memerahkan SELURUH
    ENAM SHARD:

        ❌ 1 tabel dengan RLS MATI.
           Itu Ember [C] — RLS aktif/mati tidak boleh dikonfigurasi.

    Policy tanpa RLS lebih buruk daripada tak ada policy: ia TERBACA seperti
    perlindungan yang terpasang. Siapa pun yang memeriksa `pg_policies`
    melihat dua baris dan menyimpulkan tabelnya berpagar.

    Pelajaran yang sama dengan 579, dua kali dalam satu sesi: **satu
    lingkungan bukan bukti.** Yang saya lakukan — menjalankan migrasi ke dev,
    melihat NOTICE-nya, lalu menyatakannya selesai — tak pernah menguji
    keadaan yang dihadapi basis baru.

    Idempoten: `ENABLE` atas tabel yang sudah ber-RLS adalah no-op.
  */
  ALTER TABLE public.approval_chain_template ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS approval_chain_template_read  ON public.approval_chain_template;
  DROP POLICY IF EXISTS approval_chain_template_write ON public.approval_chain_template;

  -- BACA: katalog bersama, sah dilihat tiap pengguna yang sudah masuk.
  CREATE POLICY approval_chain_template_read
    ON public.approval_chain_template
    FOR SELECT
    USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

  -- TULIS: service_role saja. Tenant TAK boleh mengubah katalog yang
  -- menentukan rantai approval pelanggan lain (lihat migrasi 573).
  CREATE POLICY approval_chain_template_write
    ON public.approval_chain_template
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
END $policy_katalog_rantai$;

-- ── Verifikasi (pola 142) ────────────────────────────────────────────────
DO $verifikasi_581$
DECLARE
  n_policy int;
  n_baca   int;
  n_tulis_terbuka int;
BEGIN
  IF to_regclass('public.approval_chain_template') IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO n_policy
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'approval_chain_template';

  IF n_policy = 0 THEN
    RAISE EXCEPTION '581 gagal: approval_chain_template MASIH nol policy — '
      'himpunan permissive kosong bernilai FALSE, tabelnya tak terbaca siapa pun';
  END IF;

  -- RLS MATI + policy ADA = perlindungan yang cuma terlihat terpasang.
  -- Dituntut eksplisit supaya cacat yang memerahkan enam shard tak kambuh.
  IF NOT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.approval_chain_template'::regclass) THEN
    RAISE EXCEPTION
      '581 gagal: RLS MATI di approval_chain_template — policy-nya tak berlaku '
      'apa-apa, dan tabelnya TERBACA seperti berpagar (Ember [C])';
  END IF;

  SELECT count(*) INTO n_baca
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'approval_chain_template'
     AND cmd = 'SELECT';

  IF n_baca = 0 THEN
    RAISE EXCEPTION '581 gagal: tak ada policy SELECT — katalog tetap buta';
  END IF;

  -- Arah TULIS: tak boleh ada policy tulis yang mengizinkan selain service_role.
  SELECT count(*) INTO n_tulis_terbuka
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'approval_chain_template'
     AND cmd <> 'SELECT'
     AND coalesce(with_check, qual) NOT LIKE '%service_role%';

  IF n_tulis_terbuka > 0 THEN
    RAISE EXCEPTION '581 gagal: % policy tulis mengizinkan selain service_role — '
      'katalog bersama yang bisa ditulis tenant (kelas cacat migrasi 573)', n_tulis_terbuka;
  END IF;

  RAISE NOTICE '581 OK: approval_chain_template % policy (baca=%, tulis service_role saja)',
    n_policy, n_baca;
END $verifikasi_581$;
