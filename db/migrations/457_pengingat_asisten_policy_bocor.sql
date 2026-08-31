-- ════════════════════════════════════════════════════════════════════════════
-- 457 — `pengingat_asisten` bisa dibaca LINTAS TENANT
-- ════════════════════════════════════════════════════════════════════════════
--
-- Ditemukan 2026-08-18 oleh `t5a0-policy-dasar.test.ts` — test yang SUDAH ADA
-- dan tak pernah saya jalankan karena ia tak ada di daftar penjaga yang saya
-- pilih sendiri.
--
-- ── Cacatnya
--
-- Migrasi 414 memasang DUA policy pada tabel ini, keduanya PERMISSIVE:
--
--     pengingat_dasar    USING (true)
--     tenant_isolation   USING (company_id = auth_company_id())
--
-- Postgres meng-OR seluruh policy PERMISSIVE. Jadi:
--
--     true OR (company_id = auth_company_id())  →  SELALU true
--
-- Artinya `tenant_isolation` **tidak menyaring apa pun**. Pengingat asisten
-- satu perusahaan terbaca perusahaan lain — dan isinya justru hal yang
-- pribadi: janji, tenggat, nama orang, nominal.
--
-- Yang membuatnya bertahan: kedua policy terlihat benar SATU PER SATU. Yang
-- salah kombinasinya, dan kombinasi tak terlihat saat membaca migrasinya.
--
-- ── Kenapa `pengingat_dasar` DIHAPUS, bukan diubah jadi RESTRICTIVE
--
-- Membuatnya restrictive `USING (true)` menghasilkan policy yang tak
-- menyaring apa pun DAN tak menambah apa pun — kertas kosong yang harus
-- dibaca setiap orang yang memeriksa tabel ini kelak.
--
-- `tenant_isolation` sudah menyatakan seluruh aturannya. Yang kedua memang
-- tak punya alasan untuk ada; ia sisa dari migrasi yang memasang policy
-- "sementara" lalu lupa mencabutnya.
--
-- ── Kenapa FORCE juga dipastikan
--
-- Tanpa FORCE, pemilik tabel (service-role) melewati RLS sepenuhnya. Rute
-- yang memakai `supabase` mentah — dan repo ini punya beberapa — akan
-- membaca lintas tenant meski policy-nya benar.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS pengingat_dasar ON pengingat_asisten;

/*
  ⚠ `AS RESTRICTIVE` DITAMBAHKAN 2026-08-31.

  Versi sebelumnya membuat `tenant_isolation` tanpa kata itu — sehingga ia
  PERMISSIVE. Itu persis cacat yang kemudian ditemukan migrasi 511 dan 513
  pada tabel yang sama, dan dicatat panjang di kepala 513:

      "Keduanya SUDAH punya policy bernama `tenant_isolation`, tetapi dibuat
       tanpa `AS RESTRICTIVE` — jadi ia PERMISSIVE."

  PERMISSIVE digabung dengan OR. Selama ada satu policy permissive lain yang
  lebih longgar (`pengingat_asisten_akses` USING(true), dipasang 513), saringan
  `company_id` ini tidak menyaring apa pun — ia hanya menambah jalan masuk.

  Sesudah perbaikan ini, migrasi ini memasang pagar yang benar sejak awal, dan
  verifikasinya di bawah bisa menuntutnya. 511/513 tetap di tempatnya untuk
  basis yang sudah terlanjur.
*/
DROP POLICY IF EXISTS tenant_isolation ON pengingat_asisten;
CREATE POLICY tenant_isolation ON pengingat_asisten
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

/*
  Dan satu PERMISSIVE pemberi akses, karena himpunan permissive yang KOSONG
  bernilai FALSE — tabel yang hanya punya RESTRICTIVE tak terbaca SIAPA PUN.

  Itu bukan hipotesis: itulah yang terjadi sesudah migrasi 511, dan migrasi
  513 ada semata untuk memulihkannya. Dipasang di sini supaya lingkungan baru
  tak pernah melewati keadaan buntu itu.
*/
DROP POLICY IF EXISTS pengingat_asisten_akses ON pengingat_asisten;
CREATE POLICY pengingat_asisten_akses ON pengingat_asisten
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE pengingat_asisten ENABLE ROW LEVEL SECURITY;
ALTER TABLE pengingat_asisten FORCE ROW LEVEL SECURITY;

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_permisif_bebas INT;
  n_policy         INT;
  n_rls            INT;
BEGIN
  /*
    ⚠ DISEMPURNAKAN 2026-08-31 — cek ini melarang yang migrasi 513 pasang
    dengan SENGAJA.

    Versi sebelumnya menuduh setiap policy PERMISSIVE ber-`USING(true)`:

        457 gagal: masih ada 1 policy permisif USING(true) —
                   ia meng-OR habis saringan tenant

    Yang tertuduh `pengingat_asisten_akses`, dibuat migrasi 513 justru untuk
    MEMULIHKAN tabel yang jadi tak terbaca siapa pun: migrasi 511 mengganti
    `tenant_isolation` jadi RESTRICTIVE, dan himpunan PERMISSIVE yang kosong
    bernilai FALSE.

    Kalimat "meng-OR habis saringan tenant" benar HANYA bila tak ada pagar
    RESTRICTIVE di sebelahnya. Dengan pagar itu, PERMISSIVE digabung OR lalu
    hasilnya di-AND dengan RESTRICTIVE — `company_id` tetap menyaring.

    Diukur di basis ini:

        PERMISSIVE  pengingat_asisten_akses  USING = true
        RESTRICTIVE tenant_isolation         USING = company_id = auth_company_id()

    Jadi yang berbahaya bukan `USING(true)`-nya, melainkan `USING(true)` TANPA
    pagar. Itu yang diperiksa sekarang — pemeriksaan yang lebih tepat, bukan
    lebih longgar: ia tetap merah pada keadaan yang benar-benar bocor.
  */
  SELECT count(*) INTO n_permisif_bebas
    FROM pg_policy
   WHERE polrelid = 'pengingat_asisten'::regclass
     AND polpermissive
     AND coalesce(pg_get_expr(polqual, polrelid), 'true') = 'true'
     AND NOT EXISTS (
       SELECT 1 FROM pg_policy pagar
        WHERE pagar.polrelid = 'pengingat_asisten'::regclass
          AND NOT pagar.polpermissive
          AND coalesce(pg_get_expr(pagar.polqual, pagar.polrelid), '') LIKE '%auth_company_id%'
     );
  IF n_permisif_bebas > 0 THEN
    RAISE EXCEPTION '457 gagal: masih ada % policy permisif USING(true) — '
      'ia meng-OR habis saringan tenant', n_permisif_bebas;
  END IF;

  -- 2. Saringan tenantnya benar-benar ada.
  SELECT count(*) INTO n_policy
    FROM pg_policy
   WHERE polrelid = 'pengingat_asisten'::regclass
     AND pg_get_expr(polqual, polrelid) LIKE '%auth_company_id()%';
  IF n_policy = 0 THEN
    RAISE EXCEPTION '457 gagal: tak ada policy yang menyaring company_id';
  END IF;

  -- 3. RLS aktif DAN dipaksa — tanpa FORCE, service-role melewatinya.
  SELECT count(*) INTO n_rls FROM pg_class
   WHERE relname = 'pengingat_asisten' AND relrowsecurity AND relforcerowsecurity;
  IF n_rls <> 1 THEN
    RAISE EXCEPTION '457 gagal: RLS/FORCE tidak aktif';
  END IF;

  RAISE NOTICE '457 OK — pengingat_asisten: nol policy permisif bebas, '
    'saringan tenant ada, RLS+FORCE aktif';
END $$;
