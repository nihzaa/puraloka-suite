-- ============================================================================
-- 511 · Pagar tenant RESTRICTIVE untuk sembilan tabel yang tak punya
-- ============================================================================
--
-- ══════════════════════════════════════════════════════════════════════════
-- CACAT YANG DITEMUKAN — dan kenapa ia tak terlihat selama ini
-- ══════════════════════════════════════════════════════════════════════════
--
-- Diukur 2026-08-28, sesudah migrasi 510 mem-FORCE RLS, dengan admin yang
-- HANYA anggota satu tenant membaca data tenant lain:
--
--     tabel di-FORCE berisi data tenant lain : 101
--     BOCOR                                  :   1
--       document_number_series : 27 dari 27 baris terbaca PENUH
--
-- Sebabnya bukan FORCE, dan bukan kekurangan policy. Justru sebaliknya:
-- tabel itu punya EMPAT policy permissive, dan dua di antaranya
-- (`document_number_series_baca`, `..._tulis`) hanya memeriksa IZIN —
-- `has_permission('penomoran:view')` — tanpa menyebut `company_id`.
--
-- Policy PERMISSIVE digabung dengan **OR**. Jadi satu policy yang lupa
-- menyaring tenant MEMBATALKAN penyaringan yang dilakukan saudaranya
-- (`dns_select` memakai `is_member_of(company_id)` dengan benar).
-- Menambah policy justru MELONGGARKAN — intuisi yang terbalik dari
-- kebanyakan sistem izin, dan itu yang membuat cacat begini lolos review.
--
-- ── Kenapa hanya SATU tabel yang bocor, padahal polanya ada di mana-mana
--
-- Pola "policy permissive tanpa jejak tenant" terhitung **226 policy** di
-- basis ini — termasuk `qual :: true` polos pada tabel uang dan AI. Semuanya
-- terlihat mengerikan, dan hampir semuanya TIDAK berbahaya, karena:
--
--     tabel FORCE ber-company_id       : 138
--       punya RESTRICTIVE tenant_isolation : 129
--       TIDAK punya                        :   9   ← hanya ini yang rentan
--
-- Policy RESTRICTIVE digabung dengan **AND**, jadi `tenant_isolation`
-- (`company_id = auth_company_id()`, dipakai 244 tabel) menahan apa pun yang
-- diloloskan lapis permissive. Ia jaring pengaman yang bekerja diam-diam.
--
-- Sembilan tabel tanpa jaring itu bergantung SEPENUHNYA pada kedisiplinan
-- tiap policy permissive-nya — dan satu sudah terbukti gagal. Delapan sisanya
-- belum bocor hari ini hanya karena kebetulan tabelnya masih kosong atau
-- policy-nya kebetulan menyaring; itu bukan jaminan, itu keberuntungan.
--
-- Migrasi ini memasang jaring yang sama pada kesembilannya.
--
-- ══════════════════════════════════════════════════════════════════════════
-- SATU PERKECUALIAN YANG DISENGAJA — company_members
-- ══════════════════════════════════════════════════════════════════════════
--
-- `company_members` adalah tabel yang MEMBERI TAHU seorang user ia anggota
-- tenant mana. Memagarinya dengan `company_id = auth_company_id()` polos akan
-- membuat user multi-tenant tak bisa melihat keanggotaannya di tenant LAIN —
-- dan karena itulah daftar "pindah perusahaan" diisi, fitur pindah-tenant
-- mati total. Tanpa galat: daftarnya cuma jadi satu baris.
--
-- Diukur: 30 baris, dan ada user yang memang aktif di tiga company sekaligus.
--
-- Pagarnya karena itu memuat cabang kedua — baris milik user itu sendiri.
-- Itu bukan kebocoran: keanggotaan seseorang adalah datanya sendiri.
--
-- ── Kenapa RESTRICTIVE, bukan memperbaiki policy permissive-nya
--
-- Memperbaiki 226 policy satu per satu berarti tiap policy BARU di masa depan
-- harus ingat menyaring tenant lagi — dan yang lupa tak mengeluarkan galat,
-- ia hanya membocorkan. RESTRICTIVE membalik bawaannya jadi gagal-tertutup:
-- policy baru yang lupa menyaring tetap tertahan lapis ini.
--
-- Ini juga sejalan Ember [C] (isolasi tenant tak boleh bisa dikonfigurasi).
--
-- ── Aman dijalankan berulang: tiap policy di-DROP IF EXISTS dulu.
-- ── Nol baris hilang: kesembilan tabel diperiksa, `company_id` NULL = 0.
-- ============================================================================

DO $$
DECLARE
  t          text;
  n_pasang   int := 0;
  n_sisa     int;
  n_null     int;
BEGIN
  /*
    Delapan tabel berpagar bentuk kanonik — sama persis dengan yang sudah
    dipakai 244 tabel lain, supaya tak ada varian baru untuk dirawat.

    `company_members` TIDAK di sini; ia punya bentuknya sendiri di bawah.
  */
  FOREACH t IN ARRAY ARRAY[
    'document_number_series', 'klausul_kontrak', 'penawaran',
    'pengingat_asisten', 'perangkat_pengguna', 'spk_addendum',
    'struktur_elemen', 'struktur_riwayat'
  ] LOOP
    /* Baris ber-company_id NULL akan HILANG dari pandangan siapa pun.
       Diukur nol sebelum migrasi ini; diperiksa lagi di sini supaya
       migrasi yang di-replay CI di basis lain tetap aman. */
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id IS NULL', t)
      INTO n_null;
    IF n_null > 0 THEN
      RAISE EXCEPTION
        '511 batal: %.company_id NULL pada % baris — memagari tabel ini akan menyembunyikannya dari semua orang',
        t, n_null;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I AS RESTRICTIVE FOR ALL
         USING (company_id = (SELECT auth_company_id()))', t);
    n_pasang := n_pasang + 1;
  END LOOP;

  /*
    company_members — pagar yang membolehkan seseorang melihat keanggotaannya
    SENDIRI di tenant mana pun. Tanpa cabang kedua, pindah-tenant mati.
  */
  EXECUTE format('SELECT count(*) FROM public.company_members WHERE company_id IS NULL')
    INTO n_null;
  IF n_null > 0 THEN
    RAISE EXCEPTION '511 batal: company_members.company_id NULL pada % baris', n_null;
  END IF;

  DROP POLICY IF EXISTS tenant_isolation ON public.company_members;
  CREATE POLICY tenant_isolation ON public.company_members AS RESTRICTIVE FOR ALL
    USING (
      company_id = (SELECT auth_company_id())
      OR user_id = (SELECT auth_user_id())
    );
  n_pasang := n_pasang + 1;

  -- ── VERIFIKASI ────────────────────────────────────────────────────────

  /*
    Tak boleh ada tabel FORCE ber-company_id yang masih tanpa pagar tenant.

    Dinyatakan sebagai KONDISI atas keadaan basis, bukan sebagai hitungan
    tabel yang baru saja disentuh — kalau daftar di atas tak lengkap,
    pemeriksaan ini yang memberi tahu, bukan sesi berikutnya.
  */
  SELECT count(*) INTO n_sisa
    FROM pg_class cl
   WHERE cl.relnamespace = 'public'::regnamespace
     AND cl.relkind = 'r'
     AND cl.relforcerowsecurity
     AND EXISTS (SELECT 1 FROM information_schema.columns co
                  WHERE co.table_schema = 'public' AND co.table_name = cl.relname
                    AND co.column_name = 'company_id')
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = cl.relname
                        AND p.permissive = 'RESTRICTIVE'
                        AND p.qual ~ 'company_id|auth_company_id|is_member_of');
  IF n_sisa > 0 THEN
    RAISE EXCEPTION
      '511 gagal: % tabel di-FORCE masih tanpa pagar tenant RESTRICTIVE', n_sisa;
  END IF;

  RAISE NOTICE '511 OK: % pagar tenant dipasang; nol tabel FORCE tersisa tanpa pagar', n_pasang;
END $$;
