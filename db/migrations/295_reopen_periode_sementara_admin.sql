-- ════════════════════════════════════════════════════════════════════════════
-- 295 — `gl:periode:reopen` SEMENTARA juga untuk admin (G5, lanjutan 294)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Cacat yang ditemukan test, bukan oleh membaca kode
--
-- Migrasi 294 memberikan `gl:periode:reopen` HANYA kepada peran `direktur`,
-- dengan alasan yang masih benar: membuka periode tertutup mengubah angka
-- yang mungkin sudah dikirim ke bank atau dipakai menghitung pajak, dan yang
-- menandatanganinya direktur.
--
-- Yang tidak saya ukur: **tak ada satu pun pengguna berperan `direktur`** di
-- basis ini. Diukur 2026-08-12:
--
--   admin     2 pengguna aktif ber-auth_id
--   client    3
--   direktur  0     ← perannya ada, penggunanya tidak
--   mandor    4
--   pm        1
--
-- Akibatnya capability itu tak bisa dipakai siapa pun. Dan akibat dari
-- akibatnya jauh lebih buruk daripada "fitur tak jalan": saat koreksi
-- benar-benar diperlukan, orang akan mengubah basis lewat SQL langsung —
-- yang persis keadaan tanpa jejak yang dilarang §4 migrasi 294.
--
-- Penguncian yang tak punya jalan keluar yang sah mendorong jalan keluar
-- yang tak sah.
--
-- ── Kenapa capability-nya TIDAK digabung ke `gl:periode:manage`
--
-- Menggabungkannya akan menghapus pembedaannya selamanya, dan pembedaan itu
-- benar: menutup periode adalah pekerjaan rutin akhir bulan; membuka kembali
-- adalah keputusan yang mengubah laporan yang sudah keluar.
--
-- Yang dilakukan di sini hanya MEMPERLUAS pemegangnya, bukan menghapus
-- pemisahannya. Begitu ada pengguna berperan direktur, pencabutannya satu
-- baris — dan `RATIFIKASI.md` mencatatnya sebagai keputusan founder.
--
-- SYARAT PENCABUTAN: ada pengguna aktif berperan `direktur`.
--   node scripts/db/introspect.mjs  → atau:
--   SELECT count(*) FROM users u JOIN roles r ON r.id=u.role_id
--    WHERE r.name='direktur' AND u.is_active AND u.auth_id IS NOT NULL;
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'gl:periode:reopen'
   AND r.name = 'admin'
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n
    FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'gl:periode:reopen';

  /*
    DIPERIKSA APA YANG MIGRASI INI KERJAKAN, BUKAN APA YANG 294 KERJAKAN.

    ⚠ Versi sebelumnya menuntut `n >= 2` — admin DAN direktur. Yang kedua
    datang dari migrasi 294, dan 294 memberikannya lewat `r.name =
    'direktur'`. Kalau peran itu belum ada, pemberiannya nol baris, tanpa
    galat.

    Di CI itulah yang terjadi:

        HARD FAIL — 295_reopen_periode_sementara_admin.sql
          gl:periode:reopen dipegang 1 peran (harus admin + direktur)

    Migrasi ini lalu gagal atas pekerjaan migrasi LAIN yang tak ia kendalikan,
    dan menghentikan seluruh rantai di belakangnya. Bentuk cacat yang sama
    dengan 271 hari ini: verifikasi yang memeriksa lebih luas daripada yang
    dikerjakannya sendiri.

    Yang menjadi tanggung jawab migrasi ini: `admin` memegang izin itu, supaya
    fitur reopen bisa dicapai di lingkungan yang belum punya direktur — dan
    itulah seluruh alasan berkas ini ada (§1 di kepala berkas).

    Keberadaan `direktur` diperiksa terpisah di bawah, sebagai CATATAN, bukan
    sebagai syarat: peran adalah data konfigurasi per-tenant (ADR-004), dan
    migrasi tak boleh menuntut peran tertentu ada.
  */
  IF NOT EXISTS (
    SELECT 1 FROM role_permissions rp
      JOIN roles r ON r.id = rp.role_id
      JOIN permissions p ON p.id = rp.permission_id
     WHERE p.key = 'gl:periode:reopen' AND r.name = 'admin'
  ) THEN
    RAISE EXCEPTION '295 gagal: admin tak memegang gl:periode:reopen — '
                    'fitur reopen tak bisa dicapai siapa pun';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM roles WHERE name = 'direktur') THEN
    RAISE NOTICE '295: peran direktur belum ada di basis ini — '
                 'hanya admin yang memegang reopen. Bukan galat.';
  END IF;

  -- Pemisahan capability HARUS tetap ada. Kalau `reopen` hilang atau
  -- digabung, seluruh alasan §1 migrasi 294 batal.
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'gl:periode:reopen') THEN
    RAISE EXCEPTION '295 gagal: capability gl:periode:reopen tak ada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'gl:periode:manage') THEN
    RAISE EXCEPTION '295 gagal: capability gl:periode:manage tak ada';
  END IF;

  RAISE NOTICE '295 OK — reopen dipegang % peran; syarat pencabutan tertulis di kepala berkas', n;
END $$;
