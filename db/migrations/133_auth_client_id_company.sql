-- ============================================================
-- 133 — R5: `auth_client_id()` menyaring company
--
-- TEMUAN (audit T4, ditutup di sini):
--   Definisi lama (migrasi 049):
--     SELECT id FROM clients WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
--
--   Sejak migrasi 127, `clients` menjadi kategori B — satu baris `clients` per
--   company. Satu ORANG yang menjadi klien di DUA perusahaan karena itu punya
--   DUA baris `clients` dengan `user_id` yang sama.
--
--   Query di atas tidak menyaring company DAN tidak memakai LIMIT. Dalam bentuk
--   itu ia mengembalikan baris yang SEMBARANG — bukan salah secara konsisten,
--   melainkan salah secara acak, tergantung urutan baca planner. Fungsi ini
--   dipakai policy portal klien, jadi akibatnya: klien bisa melihat proyek
--   perusahaan yang keliru.
--
--   (Tanpa LIMIT, bentuk `SELECT id FROM ...` di fungsi SQL yang mengembalikan
--   UUID tunggal mengambil baris pertama yang kebetulan keluar.)
--
-- KENAPA BELUM BERGEJALA: dev hanya punya satu company, jadi "sembarang dari
-- satu" selalu benar. Ia menggigit persis di hari pelanggan kedua masuk — yaitu
-- tepat ketika isolasi tenant berhenti menjadi teori.
--
-- PERBAIKAN: saring dengan `auth_company_id()`. Dengan satu tenant hasilnya
-- IDENTIK dengan sebelumnya (behavior-preserving); dengan banyak tenant ia
-- menjadi benar. `LIMIT 1` ditambahkan supaya hasilnya deterministik walau
-- suatu saat ada dua baris dalam company yang sama — lebih baik konsisten
-- daripada berubah-ubah antar-request.
--
-- Dibungkus `(SELECT auth_company_id())` mengikuti pola InitPlan migrasi 132.
-- ============================================================

CREATE OR REPLACE FUNCTION auth_client_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT c.id
    FROM clients c
   WHERE c.user_id = (SELECT u.id FROM users u WHERE u.auth_id = auth.uid())
     AND c.company_id = (SELECT auth_company_id())
   LIMIT 1
$$;

COMMENT ON FUNCTION auth_client_id() IS
  'Baris clients milik user yang sedang login, DI DALAM company aktif. Filter '
  'company wajib sejak clients jadi kategori B (127): satu orang bisa jadi klien '
  'di lebih dari satu perusahaan (R5).';

-- ------------------------------------------------------------
-- Verifikasi: fungsi harus tetap memulangkan nilai yang sama untuk klien yang
-- ada sekarang. Kalau perbaikan ini malah membuat klien kehilangan barisnya,
-- portal klien mati — dan itu harus ketahuan di sini, bukan di produksi.
-- ------------------------------------------------------------
DO $$
DECLARE v_hilang INT;
BEGIN
  SELECT count(*) INTO v_hilang
    FROM clients c
   WHERE c.user_id IS NOT NULL
     AND c.company_id IS NULL;   -- baris klien tanpa company = tak akan pernah cocok

  IF v_hilang > 0 THEN
    RAISE EXCEPTION
      '133: ada % baris clients ber-user tapi tanpa company_id. Setelah filter '
      'company dipasang, user itu kehilangan akses portalnya. Backfill dulu '
      'company_id-nya (migrasi 127).', v_hilang;
  END IF;
  RAISE NOTICE '133: auth_client_id() kini menyaring company.';
END $$;
