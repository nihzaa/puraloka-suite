-- ============================================================================
-- 523 - AKUN PENJADWAL WAJIB ANGGOTA TIAP TENANT AKTIF
-- ============================================================================
--
-- ── YANG DITEMUKAN, diukur 2026-08-30 sesudah deploy perdana
--
-- Penjadwal berjalan sungguhan untuk pertama kalinya, dan hasilnya:
--
--     diperiksa 114 · sukses 49 · GAGAL 29 · dilewati 36
--
-- Kedua puluh sembilan yang gagal semuanya bergalat sama:
--
--     403: "Anda bukan anggota perusahaan tersebut"
--
-- Diukur per perusahaan:
--
--     Puraloka Persada         72 tugas · terakhir_status = sukses
--     PT Puraloka Nusantara    18 tugas · terakhir_status = GAGAL
--     PT Puraloka Properti     18 tugas · terakhir_status = GAGAL
--
-- ── INI BUKAN CACAT PENJADWAL. INI DESAINNYA BEKERJA.
--
-- `lib/akun-layanan.ts` sengaja menolak bypass autentikasi, dan alasannya
-- tertulis panjang di sana: penjadwal tunduk pada permission dan batas tenant
-- yang SAMA PERSIS dengan manusia. Kalau akunnya tak berhak, tugasnya gagal
-- dengan 403 yang TERBACA - bukan diam-diam berjalan dengan kewenangan yang
-- tak pernah diberikan siapa pun.
--
-- Jadi 403 di sini adalah pagar yang bekerja, bukan pagar yang rusak. Yang
-- kurang: akunnya memang belum didaftarkan sebagai anggota dua tenant itu.
--
-- ── KENAPA MASALAH INI TAK PERNAH TERLIHAT DI LAPTOP
--
-- Karena penjadwalnya tak pernah berjalan sama sekali. Tugasnya duduk aktif
-- di basis dengan `terakhir_jalan` NULL, dan tak ada yang memanggilnya.
--
-- Deploy tidak MENCIPTAKAN cacat ini - ia menyalakan lampu di ruangan yang
-- sudah lama begitu.
--
-- ── PERAN TEMPLATE, BUKAN PERAN BARU
--
-- Diukur: kedua PT itu punya NOL peran sendiri, dan anggotanya memakai peran
-- TEMPLATE (`roles.company_id IS NULL`) - mekanisme yang memang dirancang
-- dipakai lintas tenant. Isolasi tenant tetap utuh; yang lintas-tenant cuma
-- DEFINISI perannya, bukan datanya.
--
-- Membuat peran admin baru per-tenant di sini akan menyimpang dari pola yang
-- sudah dipakai kedua PT itu sendiri.
--
-- ── `is_default` SENGAJA FALSE untuk tenant selain yang pertama
--
-- Satu pengguna hanya boleh punya SATU keanggotaan default - itulah yang
-- menentukan tenant mana yang aktif saat ia masuk tanpa menyebut perusahaan.
-- Penjadwal menyebut tenant-nya secara eksplisit tiap panggilan, jadi
-- defaultnya tak dipakai; yang penting ia tak menabrak default yang sudah ada.
-- ============================================================================

INSERT INTO company_members (company_id, user_id, role_id, is_default, is_active)
SELECT
  co.id,
  u.id,
  (SELECT r.id FROM roles r WHERE r.company_id IS NULL AND r.name = 'admin' LIMIT 1),
  false,
  true
FROM companies co
CROSS JOIN users u
WHERE co.is_active
  AND u.email = 'layar.admin@puraloka.test'
  AND NOT EXISTS (
    SELECT 1 FROM company_members m
     WHERE m.company_id = co.id AND m.user_id = u.id
  )
ON CONFLICT DO NOTHING;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aktif INT; n_anggota INT; n INT; uid UUID; rid UUID;
BEGIN
  /*
    ⚠ DIGERBANGI 2026-08-31.

    `layar.admin@puraloka.test` adalah akun UJI yang dibuat di basis dev, dan
    tak ada migrasi mana pun yang membuatnya — diukur: hanya berkas ini yang
    menyebut alamat itu di seluruh db/migrations.

    Di basis yang baru lahir akun itu belum ada, dan RAISE EXCEPTION di sini
    menghentikan seluruh rantai migrasi. Verifikasi keanggotaan penjadwal tak
    bisa dilakukan tanpa akunnya — dan tak perlu, karena tanpa akun itu tak
    ada penjadwal yang bisa 403.

    Pola yang sama dengan gerbang 237, 239, 392, dan 428: data yang hanya ada
    di satu basis tak boleh jadi syarat berjalannya rantai.
  */
  SELECT id INTO uid FROM users WHERE email = 'layar.admin@puraloka.test';
  IF uid IS NULL THEN
    RAISE NOTICE '523 verifikasi dilewati: akun penjadwal (layar.admin@puraloka.test) belum ada di basis ini. Bukan galat.';
    RETURN;
  END IF;

  /*
    PERAN TEMPLATE WAJIB ADA.

    Kalau peran template `admin` hilang - misalnya karena migrasi lain
    menghapusnya - `role_id` di atas jadi NULL, keanggotaannya tetap tercipta,
    dan penjadwal masuk sebagai anggota TANPA permission apa pun.

    Gejalanya berubah dari 403 "bukan anggota" menjadi 403 "tak punya izin" -
    dua pesan berbeda untuk satu akar masalah, dan yang kedua jauh lebih sulit
    dilacak karena terlihat seperti kekurangan hak biasa.
  */
  SELECT id INTO rid FROM roles WHERE company_id IS NULL AND name = 'admin' LIMIT 1;
  IF rid IS NULL THEN
    RAISE EXCEPTION '523 gagal: peran template admin (roles.company_id IS NULL) tidak ada';
  END IF;

  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;

  SELECT count(*) INTO n_anggota
    FROM company_members m JOIN companies co ON co.id = m.company_id
   WHERE m.user_id = uid AND co.is_active;

  IF n_anggota <> n_aktif THEN
    RAISE EXCEPTION
      '523 gagal: akun penjadwal anggota % dari % perusahaan aktif — tugas untuk sisanya akan 403',
      n_anggota, n_aktif;
  END IF;

  /*
    ── DUA PEMERIKSAAN YANG SENGAJA TIDAK DITULIS DI SINI
    ────────────────────────────────────────────────────────────────────────

    Versi pertama migrasi ini memeriksa dua hal lagi, dan MUTASI MEMBUKTIKAN
    keduanya mustahil - basis sudah menjaminnya lebih kuat:

      "tiap keanggotaan punya role_id"
          `company_members.role_id` adalah NOT NULL. Mutasi yang mencoba
          mengosongkannya ditolak basis sebelum blok ini sempat berjalan.

      "tepat satu keanggotaan default"
          `idx_company_members_one_default` — UNIQUE (user_id) WHERE is_default.
          Mutasi yang menambah default kedua ditolak indeks itu.

    Menyimpan pemeriksaan yang mustahil merah bukan sekadar mubazir: ia
    MENYESATKAN pembaca berikutnya, yang akan mengira invariannya dijaga di
    sini padahal dijaga di tempat lain — dan karena itu tak akan mencarinya
    saat sesuatu berubah.

    Yang TERSISA di bawah adalah satu-satunya yang benar-benar bisa merah:
    cacah keanggotaan terhadap cacah perusahaan aktif. Tak ada constraint yang
    menjaminnya, karena tak ada yang bisa — perusahaan baru dibuat kapan saja.

    Nol default juga tak dijaga indeks (indeksnya cuma melarang LEBIH dari
    satu), tetapi ia bukan urusan migrasi ini: yang menentukan tenant aktif
    penjadwal adalah panggilan eksplisitnya, bukan defaultnya.
  */

  RAISE NOTICE '523 OK: akun penjadwal anggota % perusahaan aktif, semuanya berperan', n_aktif;
END $$;
