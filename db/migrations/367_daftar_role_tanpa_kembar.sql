-- ============================================================================
-- 367 — Daftar role: template disembunyikan dari tenant yang sudah punya salinan
-- ============================================================================
--
-- ── Cacat yang DIBUAT migrasi 365, dan terlihat di halaman Peran & Izin
--
-- Diukur di peramban 2026-08-14 sesudah 365:
--
--     role dari API : 42
--     nama ganda    : 21  ['admin','pm','project_manager_senior', ...]
--
-- Setiap role muncul DUA KALI. `roles` berkategori "AB" di wrapper tenant,
-- artinya `.from('roles')` mengembalikan "bawaan (company_id NULL) ATAU milik
-- company ini" — aturan yang benar SEBELUM tiap tenant punya salinannya
-- sendiri, dan menghasilkan kembar sesudahnya.
--
-- Yang salah bukan wrappernya. Yang salah: sesudah 365, template TIDAK LAGI
-- untuk dipakai tenant — ia cetakan, bukan pilihan. Menampilkannya di samping
-- salinannya membuat admin harus menebak yang mana yang ia sunting, dan
-- menyunting yang salah (template) akan mengubah cetakan untuk SELURUH tenant.
--
-- ── Kenapa VIEW, bukan mengubah `roles`
--
-- Menghapus template berarti kehilangan cetakan untuk tenant berikutnya.
-- Menandainya `is_active=false` akan menyembunyikannya dari jalur provisioning
-- juga. Yang dibutuhkan hanya: *daftar yang benar untuk dipilih manusia*.
--
-- `roles_terpakai` menjawab persis itu — satu baris per nama role, milik
-- company aktif kalau ada, template hanya bila tenant belum punya salinannya
-- (tenant baru yang belum di-provision).
--
-- API tetap membaca `roles` untuk hal lain (menyunting, memeriksa is_builtin).
-- Yang pindah ke view hanya DAFTAR PILIHAN.
-- ============================================================================

CREATE OR REPLACE VIEW public.roles_terpakai AS
SELECT DISTINCT ON (r.name)
       r.id, r.company_id, r.name, r.label, r.description,
       r.is_builtin, r.is_template, r.portal, r.color, r.sort_order,
       r.created_at, r.updated_at
  FROM public.roles r
 WHERE r.company_id = auth_company_id() OR r.company_id IS NULL
 -- Salinan tenant MENANG atas template: `NULLS LAST` menaruh company_id NULL
 -- di urutan terakhir, dan `DISTINCT ON` mengambil baris pertama per nama.
 ORDER BY r.name, r.company_id NULLS LAST;

COMMENT ON VIEW public.roles_terpakai IS
  'Satu baris per nama role untuk company aktif — salinan tenant menang atas '
  'template. Dipakai DAFTAR PILIHAN di UI; sunting/hapus tetap lewat `roles`.';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n_view int;
  n_nama int;
BEGIN
  IF to_regclass('public.roles_terpakai') IS NULL THEN
    RAISE EXCEPTION '367 gagal: view roles_terpakai tak terbentuk';
  END IF;

  -- `auth_company_id()` NULL di luar request, jadi view hanya berisi template.
  -- Yang bisa dibuktikan di sini: NOL nama kembar, apa pun isinya.
  SELECT count(*), count(DISTINCT name) INTO n_view, n_nama
    FROM public.roles_terpakai;

  IF n_view <> n_nama THEN
    RAISE EXCEPTION '367 gagal: view masih memuat nama kembar (% baris, % nama)',
      n_view, n_nama;
  END IF;

  RAISE NOTICE '367: roles_terpakai siap — % baris, % nama, nol kembar', n_view, n_nama;
END $$;
