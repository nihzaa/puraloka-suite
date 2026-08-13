-- ============================================================================
-- 369 — `roles_terpakai` DIBUANG: view salah lapisan untuk masalah ini
-- ============================================================================
--
-- ── Saya salah, dan ini catatannya
--
-- Migrasi 367 membuat view `roles_terpakai` untuk membuang role kembar dari
-- daftar (42 baris → 21). 368 memperbaiki bentuknya supaya lolos gerbang
-- tenancy. Keduanya lulus verifikasinya sendiri di dalam `psql`:
--
--     368: 21 baris, 21 nama, nol NULL, 21 lolos gerbang tenancy
--
-- Dan tetap salah. Diukur lewat jalur yang SEBENARNYA dipakai aplikasi:
--
--     GET /api/v1/roles  →  200 {"roles": []}
--
-- Sebabnya: view menyaring lewat `auth_company_id()`, yang membaca
-- `app.company_id`. Blok verifikasi migrasi menyetelnya sendiri
-- (`set_config`), jadi di sana view benar. Tetapi API membaca lewat PostgREST
-- dengan kunci service_role, dan di sana `app.company_id` TIDAK PERNAH
-- diset — dibuktikan langsung:
--
--     GET /rest/v1/roles_terpakai?select=name,company_id,dari_template
--     [{"name":"admin","company_id":null,"dari_template":true}, ...]
--
-- Company_id NULL → wrapper menambah `eq('company_id', aktif)` → nol baris.
--
-- ── Pelajaran yang lebih berharga daripada view-nya
--
-- Blok verifikasi saya MENYIAPKAN keadaan yang tak pernah terjadi di
-- produksi, lalu menyatakan lulus. Itu jenis test yang lulus sendiri —
-- persis cacat yang pernah saya catat pada test isolasi tenant yang
-- `return` lebih dulu.
--
-- Verifikasi migrasi tak boleh menyetel `app.company_id` untuk membuktikan
-- sesuatu yang dibaca service_role. Kalau sebuah objek dipakai lewat
-- PostgREST, ia harus diuji lewat PostgREST — bukan lewat psql yang
-- kebetulan punya lebih banyak konteks.
--
-- ── Perbaikan yang benar ada di lapisan API
--
-- `request.companyId` sudah tersedia di rute, eksplisit dan tak bergantung
-- pada GUC. Penyaringan "salinan tenant menang atas template" dikerjakan di
-- `roles.ts` — satu tempat, terlihat, dan diuji lewat jalur yang nyata.
--
-- View dibuang seluruhnya: meninggalkannya berarti menyimpan objek yang
-- terlihat benar di psql dan salah di aplikasi. Objek semacam itu akan
-- dipakai lagi oleh sesi berikutnya justru karena verifikasinya hijau.
-- ============================================================================

DROP VIEW IF EXISTS public.roles_terpakai;

DO $$
BEGIN
  IF to_regclass('public.roles_terpakai') IS NOT NULL THEN
    RAISE EXCEPTION '369 gagal: roles_terpakai masih ada';
  END IF;
  RAISE NOTICE '369: roles_terpakai dibuang — penyaringan pindah ke roles.ts';
END $$;
