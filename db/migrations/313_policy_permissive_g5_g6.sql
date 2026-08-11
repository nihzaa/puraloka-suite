-- ════════════════════════════════════════════════════════════════════════════
-- 313 — Policy PERMISSIVE untuk 10 tabel G5/G6/R-012 yang tanpanya mati total
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Cacat yang ditemukan test invarian, bukan oleh saya
--
-- Migrasi 312 memberi `tenant_isolation` RESTRICTIVE pada tujuh tabel G6 yang
-- sebelumnya nol policy. Itu perlu, tetapi **belum cukup**.
--
-- Postgres menggabungkan policy begini:
--
--     (OR seluruh PERMISSIVE) AND (AND seluruh RESTRICTIVE)
--
-- `OR` atas himpunan kosong adalah FALSE. Jadi tabel yang HANYA punya
-- RESTRICTIVE tetap **mati total**: nol baris terbaca siapa pun yang tunduk
-- RLS, betapa pun benar predikat restriktifnya.
--
-- Itu tepat yang dicek `t5a-policy-tenant`: *"restrictive AND (OR himpunan
-- kosong) = FALSE → tabel tak terbaca siapa pun"*.
--
-- ── Kenapa ini tak ketahuan lewat pengujian saya
--
-- Seluruh alur UI yang saya jalankan memakai koneksi service-role yang
-- MELEWATI RLS. Layarnya jalan, datanya tersimpan, angkanya benar — dan
-- tabelnya tetap mati bagi siapa pun yang masuk lewat jalur biasa.
--
-- Bentuk kegagalan yang sama dengan yang berulang di sesi ini: yang terlihat
-- di layar tidak membuktikan yang terjadi di basis.
--
-- ── Yang DIPERBAIKI di sini, dan yang TIDAK
--
-- Diukur: **40 tabel** ber-RLS punya RESTRICTIVE tanpa PERMISSIVE. Sepuluh
-- di antaranya dibangun di G5/G6/R-012 — itu yang diperbaiki migrasi ini.
--
-- **Tiga puluh sisanya utang lama** (`insiden_k3`, `audit_mutu`, `cuti_hak`,
-- dan seterusnya — sebagian dari G3/G4 sesi sebelumnya). Mereka TIDAK
-- disentuh, dan itu keputusan sadar: tiap tabel butuh penilaian izin mana
-- yang tepat untuk membacanya, dan menebaknya massal akan memberi akses yang
-- tak pernah diputuskan siapa pun — persis kesalahan yang lebih mahal
-- daripada tabel yang terlalu tertutup.
--
-- Angkanya disebut di sini supaya tak terbaca sebagai "sudah beres".
--
-- ── Pola
--
-- `has_permission('<izin baca modul itu>')` — sama dengan `invoices_manage_v2`
-- dan policy permissive lain yang sudah ada.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tabel yang punya izin bacanya sendiri ───────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('peta_akun_jurnal',          'gl:peta-akun:view'),
      ('periode_akuntansi',         'gl:periode:view'),
      ('periode_akuntansi_riwayat', 'gl:periode:view'),
      ('markup_periode',            'cecep:markup:view'),
      ('baseline_jadwal',           'projects:baseline:view'),
      ('baseline_jadwal_item',      'projects:baseline:view'),
      ('api_key',                   'settings:apikey:view'),
      ('api_key_pakai',             'settings:apikey:view'),
      ('peta_resource_material',    'gudang:susut:view'),
      ('rencana_susut_material',    'gudang:susut:view')
    ) AS t(tabel, izin)
  LOOP
    -- Izin yang disebut HARUS ada. Policy yang mengacu izin karangan akan
    -- diterima Postgres tanpa keluhan lalu tak pernah cocok dengan apa pun —
    -- tabelnya tetap mati, dan kali ini tanpa gejala di test mana pun.
    IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = r.izin) THEN
      RAISE EXCEPTION '313 gagal: izin % tak ada di tabel permissions', r.izin;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tabel || '_baca', r.tabel);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT
         USING ((SELECT has_permission(%L)))',
      r.tabel || '_baca', r.tabel, r.izin);

    -- Menulis dijaga izin `:manage`-nya lewat rute; di lapisan RLS cukup
    -- satu policy tulis yang tunduk pada RESTRICTIVE tenant. Tanpa policy
    -- tulis, INSERT/UPDATE ditolak seluruhnya — dan itu akan mematikan
    -- fitur yang baru saja dibangun.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tabel || '_tulis', r.tabel);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL
         USING ((SELECT has_permission(%L)))
         WITH CHECK ((SELECT has_permission(%L)))',
      r.tabel || '_tulis', r.tabel, r.izin, r.izin);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  n INT;
  sisa INT;
  daftar TEXT[] := ARRAY[
    'peta_akun_jurnal', 'periode_akuntansi', 'periode_akuntansi_riwayat',
    'markup_periode', 'baseline_jadwal', 'baseline_jadwal_item',
    'api_key', 'api_key_pakai', 'peta_resource_material',
    'rencana_susut_material'];
BEGIN
  FOREACH t IN ARRAY daftar LOOP
    -- 1. Punya PERMISSIVE — tanpanya `OR himpunan kosong` = FALSE.
    SELECT count(*) INTO n FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = t AND p.polpermissive;
    IF n = 0 THEN
      RAISE EXCEPTION '313 gagal: % masih tanpa policy permissive — mati total', t;
    END IF;

    -- 2. RESTRICTIVE tenant TETAP ada. Menambah permissive tanpa menjaga
    --    yang restriktif berarti membuka isolasi tenant — kebalikan dari
    --    yang dimaksud, dan jauh lebih mahal.
    SELECT count(*) INTO n FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = t AND p.polname = 'tenant_isolation' AND NOT p.polpermissive;
    IF n = 0 THEN
      RAISE EXCEPTION '313 gagal: % kehilangan tenant_isolation RESTRICTIVE', t;
    END IF;
  END LOOP;

  -- 3. Angka utang lama disebut, bukan disembunyikan. Kalau ia TURUN kelak,
  --    catatan ini yang jadi pembandingnya.
  SELECT count(*) INTO sisa FROM pg_class c
   WHERE c.relrowsecurity
     AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND NOT p.polpermissive)
     AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polpermissive);

  RAISE NOTICE '313 OK — 10 tabel G5/G6/R-012 punya permissive + restrictive. '
    'Tabel lain yang masih tanpa permissive: % (utang lama, TIDAK disentuh — '
    'tiap tabel butuh penilaian izin bacanya sendiri).', sisa;
END $$;
