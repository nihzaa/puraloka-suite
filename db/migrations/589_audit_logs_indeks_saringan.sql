-- ============================================================================
-- 589 — indeks komposit `audit_logs` untuk daftar nilai saringan yang UTUH
-- ============================================================================
--
-- ── Cacat yang membuat migrasi ini perlu
--
-- `GET /api/v1/audit/meta` mengisi dua dropdown saringan halaman Audit Trail.
-- Sampai hari ini ia mengambilnya begini:
--
--     supabase.from('audit_logs').select('table_name')
--       .eq('company_id', cid).order('table_name')
--
-- Tanpa `.limit()`, dan justru itu masalahnya: PostgREST memulangkan
-- **maksimal 1.000 baris**, keras, ditegakkan server, TANPA galat dan TANPA
-- penanda pemotongan. `.order('table_name')` lalu memastikan seribu baris itu
-- seluruhnya milik tabel-tabel yang menang alfabetis.
--
-- Diukur di basis dev 2026-09-15 (tenant 48befb54…, 102.089 baris):
--
--     DISTINCT table_name yang SEBENARNYA ada          :  95
--     yang terlihat rute (ORDER BY table_name, 1.000)  :   3
--
-- Seorang auditor yang membuka dropdown melihat TIGA tabel dan menyimpulkan
-- tak ada yang lain pernah terjejak. Tak ada galat yang bisa membantahnya.
--
-- ── Kenapa perbaikannya butuh indeks
--
-- Rutenya kini meminta BASIS yang menyusun himpunan distinct (RPC
-- `audit_saringan_tersedia`), bukan menarik baris lalu men-`Set`-kannya di JS.
-- Itu memperbaiki kebenarannya, tetapi `SELECT DISTINCT table_name … WHERE
-- company_id = $1` di atas tabel 50 MB dikerjakan lewat **Seq Scan**: tenant
-- utama memegang 99,7% barisnya, jadi `idx_audit_logs_company` yang sudah ada
-- tak pernah dipilih planner — menyaring 99,7% baris lewat indeks lebih mahal
-- daripada membaca tabelnya sekalian.
--
-- Indeks komposit `(company_id, table_name)` mengubahnya jadi **Index Only
-- Scan**: nilai yang dicari sudah ada DI DALAM indeks, jadi tabelnya tak perlu
-- disentuh sama sekali.
--
-- Diukur di basis dev 2026-09-15 (median dari 5 jalan, lewat `pg` dari Node):
--
--                          SEBELUM        SESUDAH
--     DISTINCT table_name    69 ms          40 ms
--     DISTINCT action        80 ms          41 ms
--
-- Dan di sisi server (`EXPLAIN ANALYZE`, tanpa ongkos jaringan):
--
--     SEBELUM  Seq Scan             → Execution Time 124,4 ms
--     SESUDAH  Index Only Scan      → Execution Time  27,4 ms
--
-- Ongkosnya: 760 kB + 800 kB indeks di atas tabel 50 MB, dan build 275 ms +
-- 214 ms. Murah untuk query yang berjalan tiap kali halaman audit dibuka.
--
-- ⚠ Angka di atas berasal dari basis yang tabelnya SUDAH tercache penuh
-- (`Buffers: shared hit=6367`, nol `read`). Di basis yang dingin selisihnya
-- akan jauh lebih besar, bukan lebih kecil — Seq Scan atas 50 MB harus
-- membaca 50 MB dari disk, Index Only Scan hanya 760 kB.
--
-- ── Kenapa BUKAN `CREATE INDEX CONCURRENTLY`
--
-- `CONCURRENTLY` tak bisa berjalan di dalam transaksi, dan pelari migrasi repo
-- ini membungkus tiap berkas dalam satu transaksi. Memakainya berarti migrasi
-- gagal keras di baris pertamanya. Build-nya terukur di bawah 300 ms atas
-- 102 ribu baris pada basis dev ini, jadi kunci tulis sesingkat itu tak
-- sebanding dengan menyimpang dari pola migrasi repo.
--
-- Kalau kelak dijalankan atas basis produksi yang jauh lebih besar dan
-- kuncinya jadi soal, jalankan `CREATE INDEX CONCURRENTLY` DI LUAR migrasi
-- lebih dulu — `IF NOT EXISTS` di bawah lalu jadi no-op, dan migrasi ini tetap
-- sah untuk lingkungan lain.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. (company_id, table_name) — dropdown "Semua Tabel"
--
-- Urutan kolomnya bukan selera: `company_id` WAJIB di depan karena ia yang
-- disamakan (`=`), sementara `table_name` yang dikumpulkan. Indeks
-- `(table_name, company_id)` tak bisa dipakai untuk saringan tenant sama
-- sekali — dan `idx_audit_logs_table_name` yang sudah ada persis bentuk
-- setengahnya, yang menjelaskan kenapa ia tak menolong.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_table
  ON public.audit_logs (company_id, table_name);

-- ------------------------------------------------------------
-- 2. (company_id, action) — dropdown "Semua Action"
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_action
  ON public.audit_logs (company_id, action);

-- ------------------------------------------------------------
-- 3. Fungsi yang memulangkan HIMPUNAN DISTINCT-nya
--
-- Ini bagian yang sebenarnya menutup cacatnya. Selama daftar nilai disusun
-- dengan menarik BARIS lalu men-`Set`-kannya di JS, ia akan selalu tunduk pada
-- batas 1.000 baris PostgREST — berapa pun `.limit()` yang ditulis, karena
-- batas itu ditegakkan SERVER. Yang melewati kabel di sini bukan 102 ribu
-- baris melainkan 95 dan 129 nilai: tak ada yang bisa terpotong.
--
-- ── Kenapa `p_company_id` adalah PARAMETER, bukan `auth_company_id()`
--
-- Rute ini dipanggil lewat service-role (`utils/supabase.ts`), tempat
-- `auth_company_id()` NULL. Fungsi yang mengandalkannya akan memulangkan
-- himpunan KOSONG — dropdown kosong yang terbaca persis seperti "tenant ini
-- memang belum punya jejak audit". Penyaringan tenant tetap kewajiban
-- pemanggil, sama seperti `.eq('company_id', …)` yang digantikannya.
--
-- ── Kenapa `STABLE` dan `SECURITY INVOKER`
--
-- `STABLE`: tak menulis apa pun, dan hasilnya tetap dalam satu statement —
-- planner boleh memanggilnya sekali. `SECURITY INVOKER` (bawaan, ditulis
-- eksplisit supaya tak ada yang menebak): fungsi ini TIDAK boleh menaikkan
-- hak siapa pun. `SECURITY DEFINER` di sini akan membuatnya melewati RLS
-- `audit_logs` — persis kebocoran lintas-tenant yang komentar di `audit.ts`
-- peringatkan, hanya lewat pintu yang lebih sulit dilihat.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_saringan_tersedia(p_company_id UUID)
RETURNS TABLE (kolom TEXT, nilai TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  SELECT 'table_name'::TEXT, a.table_name::TEXT
    FROM public.audit_logs a
   WHERE a.company_id = p_company_id
     AND a.table_name IS NOT NULL
   GROUP BY a.table_name
  UNION ALL
  SELECT 'action'::TEXT, a.action::TEXT
    FROM public.audit_logs a
   WHERE a.company_id = p_company_id
     AND a.action IS NOT NULL
   GROUP BY a.action
$fn$;

COMMENT ON FUNCTION public.audit_saringan_tersedia(UUID) IS
  'Nilai DISTINCT table_name + action milik satu tenant, untuk dropdown '
  'saringan GET /api/v1/audit/meta. Ada supaya daftarnya tidak disusun dengan '
  'menarik baris ke JS — cara itu terpotong diam-diam di 1.000 baris PostgREST '
  '(migrasi 589).';

-- ------------------------------------------------------------
-- 4. Verifikasi — migrasi gagal keras kalau artefaknya tidak benar-benar ada.
--
-- Pelajaran 043/142: entri buku migrasi yang tercatat SUKSES tanpa objeknya
-- pernah terbentuk membuat siapa pun yang membaca daftar migrasi menyimpulkan
-- fitur ini sudah ada. Verdict "sudah jalan" hanya sah bila artefak fisiknya
-- terbukti (CLAUDE.md §5.5).
-- ------------------------------------------------------------
DO $$
DECLARE
  n_tabel   INT;
  n_aksi    INT;
  cid_uji   UUID;
BEGIN
  /* 1. Kedua indeks benar-benar ada. */
  IF to_regclass('public.idx_audit_logs_company_table') IS NULL THEN
    RAISE EXCEPTION '589 gagal: idx_audit_logs_company_table tidak terbentuk';
  END IF;
  IF to_regclass('public.idx_audit_logs_company_action') IS NULL THEN
    RAISE EXCEPTION '589 gagal: idx_audit_logs_company_action tidak terbentuk';
  END IF;

  /* 2. Fungsinya ada DAN bisa dipanggil. Keberadaan di `pg_proc` saja tak
        cukup — fungsi yang ada tapi galat saat dijalankan tetap membuat
        dropdown-nya kosong, dan kosong terbaca seperti "belum ada data". */
  IF to_regprocedure('public.audit_saringan_tersedia(uuid)') IS NULL THEN
    RAISE EXCEPTION '589 gagal: fungsi audit_saringan_tersedia tidak terbentuk';
  END IF;

  /* 3. Dan ia memulangkan LEBIH dari yang bisa dilihat cara lama.

        Diuji terhadap tenant yang paling banyak jejaknya. Kalau basisnya
        memang belum punya audit sama sekali, pemeriksaan ini dilewati —
        himpunan kosong tak punya pelanggar, dan memaksa migrasi gagal di
        lingkungan bersih hanya akan membuatnya tak bisa di-replay CI. */
  SELECT company_id INTO cid_uji
    FROM public.audit_logs
   GROUP BY company_id ORDER BY count(*) DESC LIMIT 1;

  IF cid_uji IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE kolom = 'table_name'),
           count(*) FILTER (WHERE kolom = 'action')
      INTO n_tabel, n_aksi
      FROM public.audit_saringan_tersedia(cid_uji);

    IF n_tabel = 0 THEN
      RAISE EXCEPTION
        '589 gagal: audit_saringan_tersedia memulangkan NOL table_name untuk '
        'tenant % yang jelas punya jejak audit', cid_uji;
    END IF;

    RAISE NOTICE
      '589 OK — indeks komposit terpasang; audit_saringan_tersedia memulangkan '
      '% table_name + % action untuk tenant %', n_tabel, n_aksi, cid_uji;
  ELSE
    RAISE NOTICE
      '589 OK — indeks + fungsi terpasang; audit_logs kosong, jadi pemeriksaan '
      'jumlah nilai dilewati (himpunan kosong tak punya pelanggar)';
  END IF;
END $$;
