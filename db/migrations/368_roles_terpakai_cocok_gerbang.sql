-- ============================================================================
-- 368 — `roles_terpakai` cocok dengan gerbang tenancy: company_id tak pernah NULL
-- ============================================================================
--
-- ── Cacat yang dibuat migrasi 367, dan tertangkap sebelum sampai ke founder
--
-- View `roles_terpakai` benar isinya (21 baris, nol kembar) tetapi SALAH
-- bentuknya bagi wrapper tenant. Diukur langsung di basis:
--
--     view tanpa filter        : 21
--     view + eq(company_id)    : 0        ← yang dilakukan wrapper
--     view dgn app.company_id  : 21
--
-- `gen-tenant-map.mjs` mengklasifikasikannya **B** (milik tenant), dan
-- kategori B membuat wrapper menambahkan `eq('company_id', <aktif>)`. Baris
-- template yang lolos ke view membawa `company_id NULL`, dan NULL tak pernah
-- sama dengan apa pun — jadi hasilnya NOL, dan halaman Peran & Izin kosong.
--
-- Gejalanya persis kebalikan dari cacat yang diperbaiki 367: dari 42 baris
-- kembar menjadi nol baris. Keduanya tanpa galat.
--
-- ── Kenapa VIEW yang diperbaiki, bukan kategorinya
--
-- Godaannya: paksa kategorinya jadi A (tanpa scope). Itu ditolak dua kali —
-- `gen-tenant-map.mjs` di-generate dari skema dan dijaga CI (mengeditnya
-- tangan akan merah di `check`), dan yang lebih penting: kategori A berarti
-- "katalog bersama semua tenant". Role BUKAN itu lagi sejak migrasi 363.
-- Melabelinya A untuk memuluskan satu kueri berarti berbohong pada gerbang
-- tenancy — tempat paling buruk untuk berbohong.
--
-- Yang benar: view menyajikan `company_id` yang SESUNGGUHNYA berlaku bagi
-- pembacanya. Baris template disajikan dengan `company_id` company aktif —
-- karena bagi tenant yang belum punya salinan, template itulah rolenya.
-- Bentuknya jadi cocok dengan kategori B tanpa satu pun kebohongan.
--
-- ⚠ `id` tetap id BARIS ASLI (template), bukan dikarang. Menyunting role dari
-- daftar ini akan menunjuk baris template — dan itu ditolak `roles.ts` lewat
-- gerbang `is_builtin`, bukan dibiarkan mengubah cetakan semua tenant.
-- ============================================================================

-- DROP dulu, bukan `CREATE OR REPLACE`: Postgres menolak REPLACE yang
-- menyisipkan kolom di TENGAH daftar ("cannot change name of view column
-- name to dari_template"). REPLACE hanya boleh menambah kolom di ujung.
-- Aman di-DROP — view ini lahir di migrasi 367 (sesi yang sama) dan belum
-- punya dependen selain rute daftar role.
DROP VIEW IF EXISTS public.roles_terpakai;

CREATE VIEW public.roles_terpakai AS
SELECT DISTINCT ON (r.name)
       r.id,
       -- Bagi tenant yang belum punya salinan, template inilah rolenya —
       -- jadi disajikan sebagai miliknya. Ini yang membuat bentuknya cocok
       -- dengan kategori B tanpa menyembunyikan apa pun.
       COALESCE(r.company_id, auth_company_id()) AS company_id,
       -- Dipertahankan supaya UI bisa membedakan "role tenant ini" dari
       -- "cetakan yang belum disalin" — tanpa harus menebak dari company_id
       -- yang sudah diseragamkan di atas.
       (r.company_id IS NULL) AS dari_template,
       r.name, r.label, r.description,
       r.is_builtin, r.is_template, r.portal, r.color, r.sort_order,
       r.created_at, r.updated_at
  FROM public.roles r
 WHERE r.company_id = auth_company_id() OR r.company_id IS NULL
 ORDER BY r.name, r.company_id NULLS LAST;

COMMENT ON VIEW public.roles_terpakai IS
  'Satu baris per nama role untuk company aktif — salinan tenant menang atas '
  'template. `company_id` selalu terisi (template memakai company aktif) supaya '
  'cocok dengan gerbang tenancy kategori B. `dari_template` menandai baris yang '
  'belum disalin. Dipakai DAFTAR PILIHAN di UI; sunting/hapus lewat `roles`.';

-- ------------------------------------------------------------
-- Verifikasi — termasuk BENTUK yang gagal di 367
-- ------------------------------------------------------------
DO $$
DECLARE
  n_view   int;
  n_nama   int;
  n_null   int;
  n_gerbang int;
  cid      uuid;
BEGIN
  SELECT id INTO cid FROM public.companies
   WHERE id IN (SELECT company_id FROM public.company_members) LIMIT 1;

  /*
    ⚠ Tanpa `cid`, SELURUH pembuktian di bawah menguji hal yang salah.

    `set_config('app.company_id', NULL)` tidak memasang konteks tenant apa
    pun, sehingga view `roles_terpakai` tak menyaring — dan mengembalikan 20
    baris TEMPLATE yang memang ber-`company_id` NULL. Pagar di bawah lalu
    melaporkannya sebagai kebocoran:

        368 gagal: 20 baris ber-company_id NULL — akan tersaring habis
                   oleh gerbang tenancy kategori B

    Angkanya nyata, tetapi kesimpulannya keliru: yang bocor bukan view-nya,
    melainkan konteks yang tak pernah terpasang. Di schema bersih tak ada
    company beranggota (nol user → nol company_members), jadi `cid` mustahil
    terisi.

    Diperbaiki 2026-09-04. Pagar-pagarnya TIDAK dilemahkan — di lingkungan
    yang punya tenant, ketiganya berjalan persis seperti sebelumnya.
    (kelas 245/250/252/254/316/331/365/366)
  */
  IF cid IS NULL THEN
    RAISE NOTICE '368: belum ada tenant beranggota — pembuktian view DILEWATI (schema bersih)';
    RETURN;
  END IF;

  PERFORM set_config('app.company_id', cid::text, true);

  SELECT count(*), count(DISTINCT name) INTO n_view, n_nama
    FROM public.roles_terpakai;

  IF n_view <> n_nama THEN
    RAISE EXCEPTION '368 gagal: view memuat nama kembar (% baris, % nama)', n_view, n_nama;
  END IF;

  SELECT count(*) INTO n_null FROM public.roles_terpakai WHERE company_id IS NULL;
  IF n_null > 0 THEN
    RAISE EXCEPTION '368 gagal: % baris ber-company_id NULL — akan tersaring habis '
                    'oleh gerbang tenancy kategori B', n_null;
  END IF;

  -- Inilah yang gagal di 367: meniru persis apa yang dilakukan wrapper.
  SELECT count(*) INTO n_gerbang
    FROM public.roles_terpakai WHERE company_id = cid;
  IF n_gerbang <> n_view THEN
    RAISE EXCEPTION '368 gagal: gerbang tenancy menyisakan % dari % baris',
      n_gerbang, n_view;
  END IF;

  RAISE NOTICE '368: % baris, % nama, nol NULL, % lolos gerbang tenancy',
    n_view, n_nama, n_gerbang;
END $$;
