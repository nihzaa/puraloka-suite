-- 210 — VIEW `v_situs_publik`: tujuh query jadi satu, dan tenancy pindah ke SQL
--
-- ════════════════════════════════════════════════════════════════════════════
-- KENAPA VIEW, BUKAN MENAIKKAN PLAFON
-- ════════════════════════════════════════════════════════════════════════════
--
-- `GET /api/v1/public/situs` memakai **tujuh query supabase mentah**. Alasannya
-- sah: endpoint publik tak punya sesi, jadi `auth_company_id()` bernilai NULL
-- dan wrapper sadar-tenant `request.db` tak punya konteks apa pun untuk
-- menyaring. Kodenya sendiri sudah benar — filter `company_id` eksplisit di
-- setiap query, kolom disebut satu per satu, tiap `error` diperiksa.
--
-- Tapi `tenancy-ratchet.test.ts` tetap merah: **373 vs plafon 366**. Plafon itu
-- `PLAFON_R011`, diratifikasi founder dengan syarat eksplisit bahwa 364→366
-- adalah satu-satunya kenaikan, dan test-nya punya tripwire yang merah kalau
-- angkanya sendiri diubah (Gerbang Keras G-5).
--
-- Jalan keluarnya sudah tertulis di header test itu sendiri:
--
--     "Bangun VIEW database yang mengagregasi + menjamin tenancy di lapisan
--      SQL, lalu baca view itu lewat `request.db`. Query mentahnya hilang sama
--      sekali, dan angka ini justru TURUN."
--
-- Founder memilih jalan ini (2026-08-07).
--
-- ── Yang didapat selain angka ratchet
--
-- 1. **Satu perjalanan ke database, bukan tujuh.** Halaman publik adalah yang
--    paling sering diminta dan paling sedikit di-cache.
--
-- 2. **Penyaringan `tampil`/`aktif` jadi bagian skema.** Sebelumnya tiap query
--    harus mengingatnya sendiri; satu yang lupa akan menerbitkan draf ke
--    publik. Di sini ia ditulis sekali.
--
-- 3. **Daftar kolom terkunci di satu tempat.** `select('*')` di endpoint tak
--    lagi berbahaya: view-lah yang menentukan apa yang publik, jadi kolom baru
--    yang ditambahkan seseorang besok TIDAK ikut terbit.
--
-- ── Yang TIDAK berubah
--
-- Pemilihan tenant tetap lewat `SITUS_COMPANY_ID` di sisi aplikasi — view ini
-- mengembalikan SATU BARIS PER COMPANY, bukan satu baris global. Menaruh
-- pemilihannya di dalam view akan menjadikan "situs milik siapa" sebagai
-- keputusan skema, dan itu salah untuk produk multi-tenant yang nantinya
-- melayani banyak situs.
--
-- ── `security_invoker = off` — disengaja, dan inilah bagian yang paling
--    mudah salah
--
-- View ini SENGAJA berjalan dengan hak pemiliknya, sehingga RLS tabel di
-- bawahnya tidak diterapkan. Kalau `security_invoker = on`, pembaca anonim
-- akan tertahan policy RESTRICTIVE (`auth_company_id()` NULL → nol baris), dan
-- halaman publik jadi kosong.
--
-- Yang membuat ini AMAN, dan bukan lubang:
--   • view hanya memuat kolom yang memang dimaksudkan publik — tak ada
--     `company_id` bocor sebagai data, tak ada kolom internal
--   • hanya baris `tampil = true` / `aktif = true` yang ikut
--   • pemanggilnya WAJIB menyaring `company_id`; tanpa itu ia mendapat
--     seluruh company, dan itu terlihat langsung sebagai konten tenant lain
--     di halaman — bukan kebocoran senyap
--   • `GRANT` di bawah hanya SELECT, hanya untuk peran baca

BEGIN;

CREATE OR REPLACE VIEW v_situs_publik
WITH (security_invoker = off) AS
SELECT
  co.id AS company_id,

  -- Konten bebas: peta kunci→nilai. Tak ada `tampil` di tabelnya — seluruh
  -- isinya memang teks halaman.
  COALESCE(
    (SELECT jsonb_object_agg(k.kunci, k.nilai)
       FROM situs_konten k WHERE k.company_id = co.id),
    '{}'::jsonb
  ) AS konten,

  COALESCE(
    (SELECT jsonb_agg(x ORDER BY x.urutan)
       FROM (SELECT g.id, g.kunci, g.judul, g.ringkasan, g.lokasi, g.lingkup, g.urutan
               FROM situs_kategori g
              WHERE g.company_id = co.id AND g.tampil) x),
    '[]'::jsonb
  ) AS kategori,

  COALESCE(
    (SELECT jsonb_agg(x ORDER BY x.urutan)
       FROM (SELECT m.kategori_id, m.path_storage, m.alt, m.lebar, m.tinggi, m.urutan
               FROM situs_media m
              WHERE m.company_id = co.id AND m.tampil) x),
    '[]'::jsonb
  ) AS media,

  COALESCE(
    (SELECT jsonb_agg(x ORDER BY x.urutan)
       FROM (SELECT ms.tahun, ms.judul, ms.keterangan, ms.urutan
               FROM situs_milestone ms
              WHERE ms.company_id = co.id AND ms.tampil) x),
    '[]'::jsonb
  ) AS milestone,

  COALESCE(
    (SELECT jsonb_agg(x ORDER BY x.urutan)
       FROM (SELECT l.kode, l.judul, l.urutan
               FROM situs_legalitas l
              WHERE l.company_id = co.id AND l.tampil) x),
    '[]'::jsonb
  ) AS legalitas,

  -- `situs_seksi` TIDAK disaring `aktif`: halaman publik perlu tahu seksi mana
  -- yang dimatikan supaya tak merendernya, dan itu berbeda dari "tak ada".
  COALESCE(
    (SELECT jsonb_agg(x ORDER BY x.urutan)
       FROM (SELECT s.kunci, s.aktif, s.urutan, s.varian
               FROM situs_seksi s
              WHERE s.company_id = co.id) x),
    '[]'::jsonb
  ) AS seksi,

  -- Merek: satu baris atau tak ada. `NULL` di sini berarti tenant belum
  -- menyetel warnanya — bukan kegagalan, dan pemanggilnya jatuh ke default.
  (SELECT to_jsonb(x)
     FROM (SELECT b.warna_utama, b.warna_aksen, b.logo_path
             FROM situs_merek b WHERE b.company_id = co.id) x
  ) AS merek

FROM companies co
WHERE co.is_active;

COMMENT ON VIEW v_situs_publik IS
  'Agregat konten situs publik per company. Dibaca lewat request.db oleh '
  'GET /api/v1/public/situs. Pemanggil WAJIB menyaring company_id. '
  'security_invoker=off disengaja — pembaca anonim tak punya auth_company_id(); '
  'yang membuatnya aman adalah daftar kolom yang terkunci di sini.';

-- Hanya SELECT, hanya untuk peran yang memang membaca.
GRANT SELECT ON v_situs_publik TO anon, authenticated, service_role;

-- ── Verifikasi: view benar-benar mengembalikan isi, bukan sekadar ada ─────
--
-- Pola migrasi 142. View yang "berhasil dibuat" tapi mengembalikan nol baris
-- akan membuat halaman publik kosong tanpa satu pun galat — persis kelas cacat
-- yang penjaga kegagalan-senyap jaga.
DO $$
DECLARE
  n_company int;
  n_konten  int;
BEGIN
  SELECT count(*) INTO n_company FROM v_situs_publik;
  IF n_company = 0 THEN
    RAISE EXCEPTION 'v_situs_publik mengembalikan NOL baris — tak ada company aktif?';
  END IF;

  SELECT count(*) INTO n_konten
    FROM v_situs_publik WHERE konten <> '{}'::jsonb;
  IF n_konten = 0 THEN
    RAISE EXCEPTION 'v_situs_publik ada, tapi TAK SATU PUN company punya konten — agregasinya tak bekerja';
  END IF;

  RAISE NOTICE 'OK: v_situs_publik % company aktif, % di antaranya berkonten.', n_company, n_konten;
END $$;

COMMIT;
