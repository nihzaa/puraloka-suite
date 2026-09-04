-- ============================================================================
-- 245 — JADWAL HANYA UNTUK TENANT YANG PUNYA ANGGOTA (koreksi 244)
-- ============================================================================
--
-- Migrasi 244 menyemai jadwal untuk SETIAP baris di `companies` — 26 tenant ×
-- 2 tugas = 52 jadwal. Saat pemicunya dijalankan pertama kali, hasilnya:
--
--     2 sukses, 50 gagal
--     "/api/v1/notifications/check-milestones membalas 403:
--      Anda bukan anggota perusahaan tersebut"
--
-- Kegagalannya BENAR — batas tenant memang ditegakkan, dan akun layanan
-- memang hanya anggota satu perusahaan. Yang salah adalah SEED-nya.
--
-- ── Kenapa ini bukan sekadar berisik
--
-- 50 baris berstatus `gagal` yang SELALU gagal melatih mata mengabaikan kolom
-- status. Begitu kebiasaan itu terbentuk, kegagalan ke-51 — yang nyata —
-- tenggelam di antaranya. Alarm yang selalu berbunyi sama saja dengan tak ada
-- alarm.
--
-- Diukur sebelum memutuskan:
--     Puraloka Persada     26 anggota, 15 proyek
--     [UJI] Tenant Kedua    0 anggota,  0 proyek
--     [UJI] Tenant F7-1     0 anggota,  0 proyek   (dan 22 lainnya serupa)
--
-- 25 dari 26 adalah sisa tenant uji. Menjadwalkan tugas untuk tenant tanpa
-- anggota dan tanpa proyek tak menghasilkan apa pun selain baris gagal.
--
-- ── Kenapa DIHAPUS, bukan dinonaktifkan
--
-- Jadwal nonaktif tetap muncul di halaman pengaturan, dan tiap barisnya
-- menuntut penjelasan ("kenapa ini mati?"). Tenant tanpa anggota tak butuh
-- jadwal sama sekali — dan kalau kelak ia punya anggota, jadwalnya dibuat
-- saat itu, bukan disiapkan bertahun-tahun sebelumnya.
--
-- Aman: `jadwal_tugas` baru lahir di migrasi 244 pada sesi yang sama, dan
-- yang dihapus hanyalah baris yang belum pernah berhasil sekali pun.
-- ============================================================================

DELETE FROM jadwal_tugas jt
WHERE NOT EXISTS (
  SELECT 1 FROM company_members cm WHERE cm.company_id = jt.company_id
);

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_yatim   INT;
  v_sisa    INT;
  v_anggota INT;
BEGIN
  SELECT count(*) INTO v_yatim
  FROM jadwal_tugas jt
  WHERE NOT EXISTS (
    SELECT 1 FROM company_members cm WHERE cm.company_id = jt.company_id
  );

  IF v_yatim > 0 THEN
    RAISE EXCEPTION '245 gagal: masih ada % jadwal untuk tenant tanpa anggota', v_yatim;
  END IF;

  SELECT count(*) INTO v_sisa FROM jadwal_tugas;

  /*
    ⚠ "Semua terhapus" HANYA salah bila memang ADA anggota — diperbaiki
    2026-09-04 (preseden 212 & 016).

    Versi pertama menggagalkan migrasi begitu `jadwal_tugas` kosong, dengan
    alasan yang benar untuk basis berisi data: kalau masih ada tenant
    beranggota tetapi jadwalnya habis, predikatnya pasti keliru.

    Di schema BERSIH alasan itu tak berlaku. Rantai diputar dari nol tanpa
    satu pun `users`, dan migrasi 126 mengisi `company_members` DARI tabel
    users (`SELECT … FROM users WHERE role_id IS NOT NULL`) — jadi nol user
    berarti nol anggota, dan menghapus SEMUA jadwal adalah hasil yang BENAR.

    Diukur di CI 2026-09-04: 244 migrasi lolos, lalu 245 menggagalkan replay
    dengan pesan yang menuduh predikatnya. Predikatnya tak pernah salah;
    yang salah adalah pagar yang membaca "kosong" sebagai "rusak".

    Syaratnya kini menyebut sebabnya: gagal bila jadwal habis PADAHAL ada
    anggota. Di basis berisi data perlindungannya persis sama — di sana
    `company_members` tak pernah kosong.
  */
  SELECT count(*) INTO v_anggota FROM company_members;
  IF v_sisa = 0 AND v_anggota > 0 THEN
    RAISE EXCEPTION
      '245 gagal: seluruh jadwal terhapus padahal ada % anggota — predikat keanggotaan keliru',
      v_anggota;
  END IF;

  IF v_sisa = 0 THEN
    RAISE NOTICE '245: nol jadwal tersisa — basis belum punya anggota (schema bersih), ini benar';
  END IF;

  RAISE NOTICE '245: % jadwal tersisa (hanya tenant beranggota)', v_sisa;
END $$;
