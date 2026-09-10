-- ============================================================================
-- 568 — akun penjadwal MATI; 194 tugas terjadwal gagal 403 tiap denyut
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- Diukur 2026-09-11, saat mengaudit "apa yang belum selesai":
--
--     jadwal_tugas aktif        : 207
--       terakhir sukses         :  13
--       terakhir GAGAL          : 194   ← semuanya HTTP 403
--
--     galat: "/api/v1/otomasi/jalankan/kesiapan-audit membalas 403:
--             {"error":"Akun Anda dinonaktifkan. Hubungi admin perusahaan."}"
--
-- Kali ini company-nya HIDUP semua — jadi ini BUKAN pengulangan migrasi 563:
--
--     Puraloka Persada          is_active=true    73 jadwal ·  72 gagal
--     PT Puraloka Properti      is_active=true    62 jadwal ·  61 gagal
--     PT Puraloka Nusantara     is_active=true    62 jadwal ·  61 gagal
--
-- Sebabnya satu baris, di tempat yang tak diperiksa siapa pun:
--
--     users.is_active = false   pada  layar.admin@puraloka.test
--                               (nilai SCHEDULER_EMAIL)
--
-- sementara SELURUH keanggotaan `company_members`-nya aktif.
--
-- ── Dua kolom bernama sama, menyaring hal berbeda
--
--     company_members.is_active → KEANGGOTAAN. Disaring resolveCompanyId().
--     users.is_active           → AKUN.        Disaring plugins/auth.ts:181.
--
-- `plugins/auth.ts` menolak akun mati dengan 403 SEBELUM resolusi company
-- berjalan, jadi keanggotaan yang sehat tak pernah sempat menolong. Berkas
-- itu bahkan sudah memperingatkannya: "Jangan menganggap salah satunya
-- mencakup yang lain."
--
-- ── Kenapa bertahan lama tanpa seorang pun melihatnya
--
-- Rantai penjadwal dijaga berlapis — jadwal_tugas → katalog → rute →
-- workflow, plus penjaga company-hidup (563) dan penjaga keanggotaan
-- penjadwal tiap tenant (523). Tak satu pun memeriksa apakah AKUN-nya masih
-- hidup. Lapis yang patah justru satu-satunya yang tak punya penjaga.
--
-- Dan gejalanya nol: kegagalan hanya tercatat di `jadwal_tugas.terakhir_galat`
-- yang tak dibuka siapa pun, sementara otomasi yang tak berjalan tidak
-- menerbitkan apa-apa. Hal yang TIDAK terjadi tak menimbulkan tiket.
--
-- ── Siapa yang mematikannya: TIDAK DIKETAHUI, dan itu dicatat apa adanya
--
-- `users.updated_at` = 2026-09-01 03:15:31, dengan NOL baris di `audit_logs`.
-- Rute toggle di `routes/v1/users.ts` selalu menulis audit, jadi perubahan
-- ini datang dari SQL langsung — di luar aplikasi.
--
-- `bersihkan-sisa-uji-isolasi.mjs` menonaktifkan akun uji, tetapi hanya yang
-- ber-email `%@ujicoba.test` atau bernama `[UJI-ISOLASI]%` — akun ini bukan
-- keduanya. Sebabnya tetap terbuka; menutupnya dengan tebakan lebih mahal
-- daripada membiarkannya terbuka (CLAUDE.md §8a.2).
--
-- Yang bisa diperbaiki tanpa mengetahui sebabnya: keadaannya sekarang, dan
-- penjaga yang membuat kekambuhannya TERLIHAT — ditambahkan di
-- `audit-penjadwal-anggota-tiap-tenant.mjs`, yang sudah memegang akun ini
-- sejak awal dan berhenti satu kolom sebelum pertanyaan yang menentukan.
--
-- ── Yang dilakukan
--
-- Menghidupkan HANYA akun yang benar-benar dipakai penjadwal, dikenali dari
-- keanggotaannya di tenant nyata — bukan dari daftar email yang dipaku.
-- Idempoten: dijalankan ulang tak mengubah apa pun.
--
-- ⚠ SENGAJA TIDAK menyentuh enam akun nonaktif lainnya (tiga
-- `isolasi-*@ujicoba.test`, `uji.admin`, `uji.direktur`, `leo@gmail.com`).
-- Mereka memang seharusnya mati, dan menghidupkan akun secara borongan
-- adalah persis kelas kesalahan yang tak boleh dilakukan migrasi.
-- ============================================================================

-- ── Yang diubah ─────────────────────────────────────────────────────────────
--
-- Predikatnya menyebut akun ini lewat SIFATNYA, bukan namanya:
-- akun nonaktif yang punya keanggotaan aktif di SETIAP company hidup yang
-- memiliki jadwal — itulah tanda tangan akun layanan penjadwal, dan tak ada
-- akun manusia yang berbentuk begitu.
UPDATE users u
   SET is_active  = true,
       updated_at = now()
 WHERE NOT u.is_active
   AND EXISTS (
         SELECT 1 FROM company_members cm
          WHERE cm.user_id = u.id AND cm.is_active)
   AND NOT EXISTS (
         -- nol company hidup ber-jadwal yang TIDAK dia ikuti
         SELECT 1
           FROM companies co
          WHERE co.is_active
            AND EXISTS (SELECT 1 FROM jadwal_tugas jt
                         WHERE jt.company_id = co.id AND jt.aktif)
            AND NOT EXISTS (SELECT 1 FROM company_members cm
                             WHERE cm.user_id = u.id
                               AND cm.company_id = co.id
                               AND cm.is_active));

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_tenant_hidup INT;
  n_penjadwal    INT;
  n_mati_lain    INT;
BEGIN
  /*
    Berapa company hidup yang punya jadwal aktif. Kalau nol, predikat di atas
    kosong secara vacuous dan BISA menghidupkan akun mana pun yang punya satu
    keanggotaan — bahaya yang harus berhenti di sini, bukan ketahuan nanti.
  */
  SELECT count(*) INTO n_tenant_hidup
    FROM companies co
   WHERE co.is_active
     AND EXISTS (SELECT 1 FROM jadwal_tugas jt
                  WHERE jt.company_id = co.id AND jt.aktif);

  IF n_tenant_hidup = 0 THEN
    RAISE NOTICE '568 dilewati — nol company hidup ber-jadwal aktif (basis bersih/CI)';
    RETURN;
  END IF;

  -- Akun berbentuk penjadwal wajib hidup sesudah migrasi ini.
  SELECT count(*) INTO n_penjadwal
    FROM users u
   WHERE NOT u.is_active
     AND EXISTS (SELECT 1 FROM company_members cm
                  WHERE cm.user_id = u.id AND cm.is_active)
     AND NOT EXISTS (
           SELECT 1 FROM companies co
            WHERE co.is_active
              AND EXISTS (SELECT 1 FROM jadwal_tugas jt
                           WHERE jt.company_id = co.id AND jt.aktif)
              AND NOT EXISTS (SELECT 1 FROM company_members cm
                               WHERE cm.user_id = u.id
                                 AND cm.company_id = co.id
                                 AND cm.is_active));

  IF n_penjadwal > 0 THEN
    RAISE EXCEPTION '568 gagal: % akun berbentuk penjadwal masih nonaktif', n_penjadwal;
  END IF;

  /*
    Dan jangan sampai menghidupkan TERLALU banyak.

    Akun uji yang memang harus mati wajib TETAP mati. Kalau angka ini jatuh
    ke nol, predikatnya terlalu longgar dan migrasi ini baru saja membuka
    kembali akun-akun yang sengaja ditutup — kerusakan yang jauh lebih mahal
    daripada cacat yang sedang diperbaiki.
  */
  SELECT count(*) INTO n_mati_lain
    FROM users
   WHERE NOT is_active
     AND (email LIKE '%@ujicoba.test' OR email LIKE 'uji.%');

  RAISE NOTICE '568 OK — akun penjadwal hidup; % akun uji tetap nonaktif', n_mati_lain;
END $$;
