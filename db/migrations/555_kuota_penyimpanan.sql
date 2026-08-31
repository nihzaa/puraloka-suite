-- ============================================================================
-- 555 — KUOTA PENYIMPANAN: menghitung yang selama ini cuma dijanjikan
-- ============================================================================
--
-- `kuota.penyimpanan_gb` sudah ada di katalog fitur sejak migrasi 538, dijual
-- di halaman paket, dan disimpan angkanya per paket. Yang tak pernah ada:
-- satu pun pembaca. Diukur 2026-09-01 — nol pemanggil di seluruh `apps/`.
--
-- Artinya paket yang menjanjikan "5 GB" tak membatasi apa pun. Pelanggan
-- paket termurah bisa mengunggah tanpa henti, dan yang bergejala cuma tagihan
-- penyimpanan vendor yang naik tanpa ada yang tahu sebabnya.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA FUNGSI BASIS, BUKAN TABEL PENGHITUNG
-- ══════════════════════════════════════════════════════════════════════════
--
-- Godaan pertama: bikin tabel `storage_usage`, lalu tambahkan `INSERT` di
-- tiap titik unggah. Ada TUJUH titik (cash, documents, finance, mandor,
-- progress, settings, termin-payment) — jadi tujuh kesempatan lupa, dan yang
-- lupa membuat hitungannya terlalu kecil TANPA GEJALA. Penghapusan berkas
-- menambah tujuh kesempatan lagi ke arah sebaliknya.
--
-- Angka yang salah pelan-pelan lebih buruk daripada tak ada angka: ia
-- terlihat seperti bekerja.
--
-- Yang dipakai di sini: `storage.objects` — katalog Supabase Storage sendiri.
-- Ia SUDAH mencatat ukuran tiap objek (diukur: 104 objek, 21,8 MB), dan
-- selalu benar karena Storage yang memeliharanya, bukan kode kita.
--
-- ── Bagaimana objek dikaitkan ke tenant
--
-- Nama objek di bucket proyek diawali UUID proyek:
--
--     c0000000-…-0001/1781208647594_kontrak_kerja.pdf
--
-- Jadi `split_part(name,'/',1)` → `projects.id` → `projects.company_id`.
-- Diverifikasi lewat kueri nyata sebelum migrasi ini ditulis.
--
-- ⚠ Bucket yang TIDAK berpola begitu sengaja diabaikan (`situs`,
-- `company-assets`): keduanya milik vendor/perusahaan, bukan data proyek yang
-- tumbuh seiring pemakaian. Memasukkannya berarti tenant terhitung memakai
-- kuota atas berkas yang tak pernah ia unggah.

CREATE OR REPLACE FUNCTION hitung_penyimpanan_tenant(p_company_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
-- SECURITY DEFINER: `storage.objects` tak terbaca peran `authenticated`.
-- Fungsi ini hanya memulangkan ANGKA untuk satu company — tak ada nama
-- berkas, tak ada isi, jadi ia tak bisa dipakai mengintip data tenant lain.
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
  SELECT coalesce(sum((o.metadata->>'size')::bigint), 0)
    FROM storage.objects o
    JOIN public.projects p
      ON p.id = split_part(o.name, '/', 1)::uuid
   WHERE p.company_id = p_company_id
     -- Hanya bucket yang berisi data PROYEK. `situs` dan `company-assets`
     -- bukan pemakaian tenant — lihat catatan di atas.
     AND o.bucket_id IN ('project-documents', 'project-photos', 'kasbon-photos')
     -- Objek yang namanya bukan UUID akan meledakkan cast. Disaring lebih
     -- dulu: satu berkas dengan nama tak terduga tak boleh membuat SELURUH
     -- perhitungan kuota gagal — dan gagalnya akan terbaca sebagai
     -- "penyimpanan tak bisa diperiksa", lalu unggahan lolos semua.
     AND split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
$$;

COMMENT ON FUNCTION hitung_penyimpanan_tenant(UUID) IS
  'Total byte yang dipakai satu tenant, dihitung dari storage.objects (katalog Supabase Storage). BUKAN dari tabel penghitung: tujuh titik unggah berarti tujuh kesempatan lupa, dan hitungan yang salah pelan-pelan lebih buruk daripada tak ada.';

REVOKE ALL ON FUNCTION hitung_penyimpanan_tenant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hitung_penyimpanan_tenant(UUID) TO authenticated, service_role;

-- ============================================================================
-- VERIFIKASI
-- ============================================================================
DO $$
DECLARE v_ada INT; v_hasil BIGINT; v_co UUID; v_def BOOLEAN;
BEGIN
  SELECT count(*) INTO v_ada FROM pg_proc
   WHERE proname = 'hitung_penyimpanan_tenant';
  IF v_ada <> 1 THEN
    RAISE EXCEPTION '555 gagal: fungsi tak terpasang (ada %)', v_ada;
  END IF;

  -- SECURITY DEFINER wajib: tanpa itu `storage.objects` tak terbaca peran
  -- `authenticated`, fungsi memulangkan 0 untuk SEMUA orang, dan kuota
  -- tak pernah tercapai. Gagal yang paling senyap — nol terlihat seperti
  -- "tenant ini memang belum mengunggah apa-apa".
  SELECT prosecdef INTO v_def FROM pg_proc WHERE proname = 'hitung_penyimpanan_tenant';
  IF NOT v_def THEN
    RAISE EXCEPTION '555 gagal: fungsi bukan SECURITY DEFINER — akan memulangkan 0 untuk semua orang';
  END IF;

  -- DIJALANKAN, bukan sekadar dipastikan ada. Fungsi yang tak pernah
  -- dipanggil bisa saja salah sintaks di cabang yang tak tersentuh.
  SELECT id INTO v_co FROM companies LIMIT 1;
  IF v_co IS NOT NULL THEN
    SELECT hitung_penyimpanan_tenant(v_co) INTO v_hasil;
    IF v_hasil IS NULL THEN
      RAISE EXCEPTION '555 gagal: fungsi memulangkan NULL, harusnya 0 bila tak ada berkas';
    END IF;
    RAISE NOTICE '555 OK — fungsi berjalan, tenant contoh memakai % byte', v_hasil;
  ELSE
    RAISE NOTICE '555 OK — fungsi terpasang (nol company untuk diuji)';
  END IF;
END $$;
