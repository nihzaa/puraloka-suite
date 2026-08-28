-- ============================================================================
-- 510 · T5c LANGKAH 1 — FORCE ROW LEVEL SECURITY
-- ============================================================================
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA MIGRASI INI ADA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Diukur 2026-08-27, sebelum migrasi ini:
--
--     koneksi API sebagai        : postgres  ·  bypassrls = TRUE
--     pemilik seluruh 291 tabel  : postgres
--     RLS aktif                  : 295 tabel
--     RLS DIPAKSA (force)        : 60 tabel
--     ber-company_id, aktif, TAK dipaksa : 95 tabel
--
-- Dua hal sekaligus membuat 775 policy RLS **tak pernah dievaluasi**:
--
--   1. Peran koneksi ber-`bypassrls` — RLS dilewati sepenuhnya.
--   2. Bahkan tanpa itu, PEMILIK tabel melewati RLS kecuali tabelnya
--      di-`FORCE`. Dan pemilik seluruh tabel adalah peran yang sama.
--
-- Akibatnya isolasi antar-tenant hari ini bergantung SEPENUHNYA pada disiplin
-- kode (`request.db`), bukan pada basis data. Untuk satu perusahaan itu tak
-- apa-apa — dan memang begitu rancangannya (ROADMAP: T5c "lepas
-- service_role", pemicunya "perusahaan kedua di-onboard").
--
-- Yang berubah begitu ada pelanggan kedua: satu rute yang lupa memakai
-- `request.db` berarti data PT A terlihat oleh PT B, TANPA SATU PUN GALAT.
--
-- ── Kenapa FORCE dulu, peran DB belakangan
--
-- Migrasi ini mengerjakan separuh yang AMAN dan bisa diverifikasi hari ini:
-- memaksa RLS pada tabel yang sudah punya policy. Ia belum mengubah peran
-- koneksi — itu langkah kedua yang menyentuh kredensial dan penyebaran, dan
-- menggabungkan keduanya membuat kegagalan mana pun sulit ditelusuri.
--
-- Sesudah migrasi ini, `FORCE` sudah terpasang tetapi belum menggigit (peran
-- API masih bypass). Begitu peran barunya dipakai, isolasinya langsung
-- ditegakkan basis data — tanpa migrasi lain.
--
-- ══════════════════════════════════════════════════════════════════════════
-- ENAM TABEL SENGAJA DIKECUALIKAN — dan ini yang paling penting
-- ══════════════════════════════════════════════════════════════════════════
--
-- Keenamnya ber-`company_id` dan RLS-nya aktif, tetapi punya **NOL POLICY**:
--
--     company_saas_meta · saas_invoices · subscriptions
--     template_rab · tenant_feature_overrides · tenant_usage_counters
--
-- Di PostgreSQL, RLS tanpa policy permissive berarti **nol baris terbaca** —
-- himpunan permissive yang kosong bernilai FALSE. Mem-`FORCE` mereka akan
-- mematikan tabelnya TOTAL.
--
-- Itu persis cacat yang sudah terjadi di repo ini: migrasi 149 memasang
-- policy RESTRICTIVE tanpa satu pun PERMISSIVE, dan empat tabel jadi tak
-- terbaca siapa pun. ROADMAP mencatat gejalanya — "halaman aset kosong tanpa
-- error", kegagalan yang paling lama dilacak.
--
-- Keenamnya juga BUKAN kelalaian yang sama: lima di antaranya tabel SaaS
-- (langganan, tagihan, kuota) yang memang diakses konsol vendor LINTAS tenant,
-- jadi policy-nya perlu dirancang bersama admin-saas — bukan disalin dari pola
-- tenant biasa. `template_rab` (9 baris) perlu diputuskan tersendiri: katalog
-- bersama atau milik tenant.
--
-- Mereka dicatat di sini sebagai utang yang TERUKUR, bukan dilewati diam-diam.
--
-- ── Idempoten
--
-- `FORCE ROW LEVEL SECURITY` aman dijalankan berulang; menjalankannya pada
-- tabel yang sudah dipaksa tak mengubah apa pun.
-- ============================================================================

DO $$
DECLARE
  t             text;
  n_dipaksa     int := 0;
  n_dilewati    int := 0;
  n_akhir       int;
  n_tanpa_policy int;
BEGIN
  /*
    Sasaran: ber-`company_id`, RLS aktif, BELUM dipaksa, DAN punya minimal satu
    policy permissive.

    Syarat terakhir itu yang menahan cacat 149 terulang — dinyatakan sebagai
    kondisi, bukan sebagai daftar nama tabel. Daftar nama membusuk; kondisi
    tetap benar saat tabel baru ditambahkan.
  */
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity
       AND NOT c.relforcerowsecurity
       AND EXISTS (
         SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public'
            AND col.table_name = c.relname
            AND col.column_name = 'company_id')
       AND EXISTS (
         SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public'
            AND p.tablename = c.relname
            AND p.permissive = 'PERMISSIVE')
     ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    n_dipaksa := n_dipaksa + 1;
  END LOOP;

  /* Yang sengaja dilewati — dihitung supaya angkanya bisa diperiksa. */
  SELECT count(*) INTO n_dilewati
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND c.relrowsecurity
     AND NOT c.relforcerowsecurity
     AND EXISTS (
       SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.relname
          AND col.column_name = 'company_id');

  -- ── VERIFIKASI ────────────────────────────────────────────────────────

  /*
    1. Tak boleh ada tabel ber-policy-permissive yang tertinggal.

    Kalau ada, loop di atas tak menyentuh semuanya — dan itu berarti
    kondisinya salah, bukan pekerjaannya selesai.
  */
  SELECT count(*) INTO n_akhir
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relrowsecurity AND NOT c.relforcerowsecurity
     AND EXISTS (SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema='public' AND col.table_name=c.relname
                    AND col.column_name='company_id')
     AND EXISTS (SELECT 1 FROM pg_policies p
                  WHERE p.schemaname='public' AND p.tablename=c.relname
                    AND p.permissive='PERMISSIVE');
  IF n_akhir > 0 THEN
    RAISE EXCEPTION
      '510 gagal: % tabel ber-policy masih belum di-FORCE', n_akhir;
  END IF;

  /*
    2. Tak boleh ada tabel yang di-FORCE TANPA policy permissive.

    Ini penjaga terhadap cacat 149: tabel semacam itu tak terbaca siapa pun,
    dan diamnya bukan galat — ia halaman kosong tanpa pesan.
  */
  SELECT count(*) INTO n_tanpa_policy
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relforcerowsecurity
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname='public' AND p.tablename=c.relname
                        AND p.permissive='PERMISSIVE');
  IF n_tanpa_policy > 0 THEN
    RAISE EXCEPTION
      '510 gagal: % tabel DIPAKSA tanpa policy permissive — tabelnya jadi tak terbaca siapa pun (cacat 149 terulang)',
      n_tanpa_policy;
  END IF;

  RAISE NOTICE
    '510 OK: % tabel di-FORCE RLS; % dilewati (nol policy permissive — utang tercatat di kepala berkas)',
    n_dipaksa, n_dilewati;
END $$;
