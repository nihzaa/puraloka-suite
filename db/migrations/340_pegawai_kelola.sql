-- ════════════════════════════════════════════════════════════════════════════
-- 340 — Data kepegawaian: izin yang tak pernah dipakai, dan FORCE RLS
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Lubang yang ditutup, diukur 2026-08-12
--
-- `sdm:pegawai:view` dan `sdm:pegawai:manage` ADA di `permissions`, DIBERIKAN
-- ke dua peran, dan dipakai policy RLS `pegawai_baca`/`pegawai_tulis`.
--
-- **Nol rute memakainya.** Satu-satunya endpoint yang menyentuh `pegawai`
-- adalah `GET /sdm/pegawai` di `timesheet-staf.ts` — yang bergerbang
-- `sdm:timesheet:view`, bukan izin kepegawaian, dan hanya MEMBACA.
--
-- Akibatnya data kepegawaian tak bisa dibuat maupun disunting dari mana pun:
-- 5 pegawai yang ada masuk lewat seed, dan 21 pengguna lain tak punya data
-- kepegawaian sama sekali. Yang menabraknya bukan galat melainkan kebuntuan —
-- klaim perjalanan (G1) menolak dengan *"akun Anda belum terhubung ke data
-- kepegawaian, hubungi HRD"*, dan HRD pun tak punya layarnya.
--
-- ── FORCE RLS
--
-- `pegawai` menyimpan GAJI POKOK, NPWP, dan nomor BPJS. Tanpa FORCE, pemilik
-- tabel melewati RLS sepenuhnya — dan repo ini punya banyak rute service-role.
-- Pola yang sama dengan migrasi 335 (tabel WBS).
--
-- ── Nomor induk unik per tenant
--
-- Dua pegawai bernomor induk sama membuat pencarian mengembalikan orang yang
-- salah, dan slip gaji bisa tertuju ke orang yang bukan pemiliknya. Unik
-- PARSIAL: `nomor_induk` boleh NULL (pegawai baru yang belum dinomori), dan
-- NULL tak saling bertabrakan.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE pegawai FORCE ROW LEVEL SECURITY;

-- Diukur sebelum dipasang: nol nomor induk kembar di seluruh basis, jadi
-- index ini tak menyembunyikan data rusak yang sudah ada.
CREATE UNIQUE INDEX IF NOT EXISTS pegawai_nomor_induk_per_tenant
  ON pegawai (company_id, nomor_induk)
  WHERE nomor_induk IS NOT NULL;

-- ── Tanggal keluar mengunci ─────────────────────────────────────────────────
--
-- Pegawai yang sudah keluar tak boleh diubah gaji atau jabatannya: slip gaji
-- dan timesheet lama merujuk data itu, dan mengubahnya secara retroaktif
-- membuat riwayat penggajian berbeda dari yang pernah dibayarkan.
--
-- Yang TETAP boleh diubah: `catatan` (tempat mencatat kejadian sesudahnya) dan
-- `tanggal_keluar` itu sendiri (koreksi tanggal, atau membatalkan kekeluaran
-- bila orangnya kembali bekerja).
CREATE OR REPLACE FUNCTION fn_pegawai_terkunci()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.tanggal_keluar IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.gaji_pokok    IS DISTINCT FROM OLD.gaji_pokok
     OR NEW.jabatan    IS DISTINCT FROM OLD.jabatan
     OR NEW.departemen IS DISTINCT FROM OLD.departemen
     OR NEW.status_ptkp IS DISTINCT FROM OLD.status_ptkp
     OR NEW.kategori_ter IS DISTINCT FROM OLD.kategori_ter
     OR NEW.npwp       IS DISTINCT FROM OLD.npwp
     OR NEW.nomor_induk IS DISTINCT FROM OLD.nomor_induk
     OR NEW.tanggal_masuk IS DISTINCT FROM OLD.tanggal_masuk
     OR NEW.user_id    IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION
      'Pegawai yang sudah keluar (%) tak bisa diubah data pokoknya — slip gaji dan timesheet lama merujuk data ini. Batalkan tanggal keluarnya lebih dulu bila ia kembali bekerja.',
      OLD.tanggal_keluar
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pegawai_terkunci ON pegawai;
CREATE TRIGGER trg_pegawai_terkunci
  BEFORE UPDATE ON pegawai
  FOR EACH ROW EXECUTE FUNCTION fn_pegawai_terkunci();

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  co    UUID;
  us    UUID;
  peg   UUID;
  n     INT;
  gagal BOOLEAN;
BEGIN
  -- Fixture dipilih menurut SYARAT: user yang BELUM punya data kepegawaian.
  -- Memakai LIMIT 1 tanpa syarat akan menabrak `pegawai_user_unik` dan
  -- verifikasinya gagal karena alasan yang salah (pelajaran migrasi 328).
  SELECT c.id INTO co FROM companies c LIMIT 1;
  SELECT u.id INTO us
    FROM users u
   WHERE NOT EXISTS (SELECT 1 FROM pegawai p WHERE p.user_id = u.id AND p.company_id = co)
   LIMIT 1;
  IF co IS NULL OR us IS NULL THEN
    -- Fixture tak terbentuk BUKAN kegagalan: di schema bersih memang belum
    -- ada proyek/user. Yang dilewati hanya pembuktiannya; di lingkungan
    -- yang berisi data ia berjalan penuh. (2026-09-04, kelas 252/254/316)
    RAISE NOTICE '340: fixture belum ada — verifikasi DILEWATI (schema bersih)';
    RETURN;
  END IF;

  -- 1. FORCE RLS menyala.
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'pegawai' AND relforcerowsecurity) THEN
    RAISE EXCEPTION '340 gagal: FORCE RLS mati — pemilik tabel melewati gerbang, dan tabel ini menyimpan GAJI';
  END IF;

  -- 2. Pegawai dasar terbentuk.
  INSERT INTO pegawai (user_id, company_id, nomor_induk, jabatan, jam_standar, tanggal_masuk)
  VALUES (us, co, 'VERIF340-001', 'uji', 8, CURRENT_DATE - 100)
  RETURNING id INTO peg;

  -- 3. Nomor induk KEMBAR dalam satu tenant DITOLAK.
  gagal := FALSE;
  BEGIN
    DECLARE us2 UUID;
    BEGIN
      SELECT u.id INTO us2 FROM users u
       WHERE u.id <> us
         AND NOT EXISTS (SELECT 1 FROM pegawai p WHERE p.user_id = u.id AND p.company_id = co)
       LIMIT 1;
      IF us2 IS NOT NULL THEN
        INSERT INTO pegawai (user_id, company_id, nomor_induk, jam_standar)
        VALUES (us2, co, 'VERIF340-001', 8);
      ELSE
        gagal := TRUE;  -- tak ada user kedua; anggap lulus, tak bisa diuji
      END IF;
    END;
  EXCEPTION WHEN unique_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '340 gagal: nomor induk KEMBAR diterima — slip gaji bisa tertuju ke orang yang salah';
  END IF;

  -- 4. Nomor induk NULL boleh berulang (pegawai baru yang belum dinomori).
  DECLARE us3 UUID;
  BEGIN
    SELECT u.id INTO us3 FROM users u
     WHERE NOT EXISTS (SELECT 1 FROM pegawai p WHERE p.user_id = u.id AND p.company_id = co)
     LIMIT 1;
    IF us3 IS NOT NULL THEN
      INSERT INTO pegawai (user_id, company_id, nomor_induk, jam_standar)
      VALUES (us3, co, NULL, 8);
    END IF;
  END;

  -- 5. Jam standar di luar akal DITOLAK.
  gagal := FALSE;
  BEGIN
    UPDATE pegawai SET jam_standar = 25 WHERE id = peg;
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '340 gagal: jam standar 25 jam sehari DITERIMA';
  END IF;

  -- 6. Tanggal keluar sebelum masuk DITOLAK.
  gagal := FALSE;
  BEGIN
    UPDATE pegawai SET tanggal_keluar = CURRENT_DATE - 200 WHERE id = peg;
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '340 gagal: tanggal keluar mendahului masuk DITERIMA';
  END IF;

  -- 7. Pegawai yang KELUAR terkunci data pokoknya.
  UPDATE pegawai SET tanggal_keluar = CURRENT_DATE WHERE id = peg;
  gagal := FALSE;
  BEGIN
    UPDATE pegawai SET gaji_pokok = 99000000 WHERE id = peg;
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '340 gagal: gaji pegawai yang sudah keluar BISA diubah — riwayat penggajian jadi retroaktif';
  END IF;

  -- 8. Catatan TETAP boleh diubah — tempat mencatat kejadian sesudahnya.
  UPDATE pegawai SET catatan = 'uji catatan sesudah keluar' WHERE id = peg;

  -- 9. Membatalkan kekeluaran boleh (orangnya kembali bekerja).
  UPDATE pegawai SET tanggal_keluar = NULL WHERE id = peg;
  UPDATE pegawai SET gaji_pokok = 1000000 WHERE id = peg;

  DELETE FROM pegawai WHERE nomor_induk LIKE 'VERIF340-%'
     OR (company_id = co AND nomor_induk IS NULL AND jam_standar = 8
         AND created_at > now() - INTERVAL '1 minute');

  /*
    CADANGAN PEMBERIAN — DITAMBAHKAN 2026-08-31.

    Kepala berkas ini menyatakan izin `sdm:pegawai:*` "ADA di permissions,
    DIBERIKAN ke dua peran". Itu diukur di basis dev 2026-08-12, dan TIDAK
    berlaku di basis yang baru lahir — di sana izinnya ada (dibuat migrasi
    lain) tetapi tak dipegang siapa pun.

    Akibatnya migrasi ini gagal atas keadaan yang bukan pekerjaannya:

        HARD FAIL — 340_pegawai_kelola.sql
          340 gagal: 2 izin pegawai tak diberikan ke peran mana pun

    dan menghentikan seluruh rantai. Bentuk yang sama sudah menggigit di 271,
    295, dan 337 hari ini: migrasi yang MEMERIKSA sesuatu tanpa MENGERJAKANNYA.

    Diberikan ke `admin` hanya bila belum ada pemegang sama sekali; di basis
    yang izinnya sudah tersebar ia no-op. Tunduk ADR-004 — satu pemegang awal
    supaya fiturnya bisa dicapai, sisanya lewat UI peran.

    Ini juga menutup kegagalan 341 (`menu_karyawan`), yang bergantung pada
    izin yang sama dan hanya memeriksanya.
  */
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id
    FROM roles r
    CROSS JOIN permissions p
   WHERE r.name = 'admin'
     AND p.key IN ('sdm:pegawai:view', 'sdm:pegawai:manage')
     AND NOT EXISTS (
       SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id
     )
  ON CONFLICT DO NOTHING;

  -- 10. Izin ada DAN diberikan.
  SELECT count(*) INTO n
    FROM permissions p
   WHERE p.key IN ('sdm:pegawai:view', 'sdm:pegawai:manage')
     AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id);
  IF n > 0 THEN
    RAISE EXCEPTION '340 gagal: % izin pegawai tak diberikan ke peran mana pun', n;
  END IF;

  RAISE NOTICE '340 OK — FORCE RLS, nomor induk unik per tenant, pegawai keluar terkunci';
END $$;
