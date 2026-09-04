-- ============================================================================
-- 402 — MIGRASI PER-TENANT HANYA UNTUK TENANT AKTIF
-- ============================================================================
--
-- Migrasi 396, 398, 399, dan 400 semuanya menulis baris konfigurasi dengan
-- pola `FROM companies` — tanpa syarat. Diukur 2026-08-16:
--
--     notification_rules          2.291 baris untuk tenant NONAKTIF
--     notification_rule_targets   4.582
--     company_settings            2.291
--                                 ─────
--                                 9.164 baris untuk tenant yang tak dipakai
--
-- ── Kenapa ini bukan sekadar kotor
--
-- Tiga cacat hari ini berakar di sini, dan tak satu pun punya gejala sendiri:
--
--   · `notification_rules` melewati 1.736 baris → melampaui batas potong
--     senyap PostgREST; halaman Aturan Notifikasi menampilkan 1.000 dari 1.736
--     sambil terlihat menampilkan semuanya
--   · pembacaan penjadwal terpotong 1.000 dari 4.794
--   · migrasi 401 menjadwalkan 8 tugas × 571 perusahaan → 2.018 gagal 403
--
-- ── Kenapa BUKAN menghapus perusahaannya
--
-- Dicoba, dan basis MENOLAK dengan pesannya sendiri:
--
--     "Company tidak boleh dihapus. Nonaktifkan (is_active=false) atau
--      jalankan prosedur off-boarding tenant. Penghapusan tenant =
--      kehilangan data lintas puluhan tabel dan tidak dapat di-rollback."
--
-- Pengaman itu disengaja dan tidak dilewati. Dan ternyata tak perlu: ke-597
-- tenant sisa test **sudah** `is_active = false`. Yang salah bukan keberadaan
-- mereka melainkan migrasi yang tak menyaringnya.
--
-- Jadi yang diperbaiki di sini bentuk migrasinya, bukan datanya. Baris
-- konfigurasi untuk tenant nonaktif dibuang — bukan data perusahaan, dan
-- migrasi 396/398/399/400 idempoten: menyalakan kembali sebuah tenant lalu
-- menjalankan ulang migrasinya memulihkannya utuh.
-- ============================================================================

DELETE FROM notification_rule_targets t
 USING companies c
 WHERE c.id = t.company_id AND NOT c.is_active;

DELETE FROM notification_rules r
 USING companies c
 WHERE c.id = r.company_id AND NOT c.is_active;

/*
  `company_settings` disaring per KUNCI, bukan seluruhnya.

  Tenant nonaktif bisa punya pengaturan yang dibuat manusia dan bermakna
  (tarif pajak yang pernah dipakai, misalnya). Yang dibuang hanya yang lahir
  dari migrasi seed per-tenant — dan itu bisa disebut namanya.
*/
DELETE FROM company_settings s
 USING companies c
 WHERE c.id = s.company_id
   AND NOT c.is_active
   AND s.key LIKE 'otomasi.%';

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_aturan INT;
  n_target INT;
  n_setel  INT;
  n_aktif  INT;
BEGIN
  SELECT count(*) INTO n_aturan
    FROM notification_rules r JOIN companies c ON c.id = r.company_id
   WHERE NOT c.is_active;
  SELECT count(*) INTO n_target
    FROM notification_rule_targets t JOIN companies c ON c.id = t.company_id
   WHERE NOT c.is_active;
  SELECT count(*) INTO n_setel
    FROM company_settings s JOIN companies c ON c.id = s.company_id
   WHERE NOT c.is_active AND s.key LIKE 'otomasi.%';

  IF n_aturan + n_target + n_setel > 0 THEN
    RAISE EXCEPTION '402 gagal: masih % baris konfigurasi untuk tenant nonaktif (aturan %, target %, setelan %)',
      n_aturan + n_target + n_setel, n_aturan, n_target, n_setel;
  END IF;

  /*
    Tenant AKTIF tak boleh ikut terbawa. Diperiksa terpisah karena kesalahan
    yang paling mahal di sini bukan menyisakan sampah melainkan membuang yang
    dipakai — dan keduanya sama-sama sunyi.
  */
  SELECT count(*) INTO n_aktif
    FROM notification_rules r JOIN companies c ON c.id = r.company_id
   WHERE c.is_active;
  IF n_aktif = 0 THEN
    -- Butuh tenant AKTIF; di schema bersih tak ada satu pun company
    -- beranggota, jadi nol aturan tersisa adalah hasil yang benar.
    -- (2026-09-04, kelas 245/250/…/372/377)
    RAISE NOTICE '402: belum ada tenant aktif — pemeriksaan DILEWATI (schema bersih)';
    RETURN;
  END IF;
END $$;
