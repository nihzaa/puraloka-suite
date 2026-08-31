-- ============================================================================
-- 561 — Lima anak bernomor di LUAR rentang induknya
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- `audit-sidebar-urutan` merah sesudah 558/559/560:
--
--     Proyek        Jadwal & Jalur Kritis      103   (rentang sah 202–300)
--     Pengadaan     Kontrak Payung & Logistik  709   (rentang sah 601–699)
--     Mutu & K3     Kepatuhan & K3            1102   (rentang sah 1001–1099)
--     Keuangan      PPN & PPh                 1469   (rentang sah 1101–1199)
--     Administrasi  Langganan                 1700   (rentang sah 1601–1699)
--
-- Konvensi repo ini: anak bernomor `induk+1 .. induk+99`, dipatuhi SELURUH
-- grup lain. Kelima ini keluar rentang karena migrasi 560 menggeser delapan
-- grup yang bertumpuk — anaknya tak ikut bergeser.
--
-- Penjaga menjelaskan kenapa ini bukan kerapian: urutan ANTAR-grup ditentukan
-- nomor GRUPNYA, jadi hari ini tak terlihat salah. Ia menggigit saat grup
-- BERIKUTNYA lahir di rentang yang sudah ditempati anak grup lain — dan
-- tabrakan itu tak mengeluarkan galat, hanya urutan aneh yang sulit dilacak.
--
-- ── Cara memilih nomor barunya
--
-- Celah kosong PERTAMA di dalam rentang induknya, dihitung dari basis.
-- Bukan dipaku — memaku angka persis cacat migrasi 322, yang menuntut
-- `sort_order = 59` lalu membusuk begitu pohon menu ditata ulang.
--
-- Idempoten: hanya menyentuh anak yang MASIH di luar rentang.
-- Verifikasi di blok akhir (pola migrasi 142).

DO $rapikan$
DECLARE
  r      RECORD;
  v_baru INT;
  n      INT := 0;
BEGIN
  FOR r IN
    SELECT a.id, a.key, a.sort_order, g.sort_order AS induk_sort, g.key AS induk
      FROM menu_items a JOIN menu_items g ON g.id = a.parent_id
     WHERE a.is_active AND g.is_active AND g.parent_id IS NULL
       AND (a.sort_order <= g.sort_order OR a.sort_order > g.sort_order + 99)
     ORDER BY g.sort_order, a.sort_order
  LOOP
    SELECT min(k) INTO v_baru
      FROM generate_series(r.induk_sort + 1, r.induk_sort + 99) k
     WHERE NOT EXISTS (
       SELECT 1 FROM menu_items x
        WHERE x.parent_id = (SELECT parent_id FROM menu_items WHERE id = r.id)
          AND x.is_active AND x.sort_order = k);

    IF v_baru IS NULL THEN
      RAISE EXCEPTION '561 gagal: rentang % penuh untuk anak %', r.induk, r.key;
    END IF;

    UPDATE menu_items SET sort_order = v_baru, updated_at = now() WHERE id = r.id;
    n := n + 1;
  END LOOP;

  RAISE NOTICE '561: % anak dikembalikan ke rentang induknya', n;
END $rapikan$;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_luar    INT;
  n_bentrok INT;
  n_ganda   INT;
BEGIN
  SELECT count(*) INTO n_luar
    FROM menu_items a JOIN menu_items g ON g.id = a.parent_id
   WHERE a.is_active AND g.is_active AND g.parent_id IS NULL
     AND (a.sort_order <= g.sort_order OR a.sort_order > g.sort_order + 99);
  IF n_luar > 0 THEN
    RAISE EXCEPTION '561 gagal: % anak masih di luar rentang induknya', n_luar;
  END IF;

  -- Warisan 559/560 tak boleh rusak oleh penggeseran di atas.
  SELECT count(*) INTO n_bentrok FROM (
    SELECT a.parent_id, a.sort_order
      FROM menu_items a JOIN menu_items g ON g.id = a.parent_id
     WHERE a.is_active AND g.is_active
     GROUP BY a.parent_id, a.sort_order HAVING count(*) > 1) x;
  IF n_bentrok > 0 THEN
    RAISE EXCEPTION '561 gagal: % anak bentrok sesudah digeser', n_bentrok;
  END IF;

  SELECT count(*) INTO n_ganda FROM (
    SELECT href FROM menu_items WHERE is_active AND href IS NOT NULL
     GROUP BY href HAVING count(*) > 1) y;
  IF n_ganda > 0 THEN
    RAISE EXCEPTION '561 gagal: % href dipegang >1 menu aktif', n_ganda;
  END IF;

  RAISE NOTICE '561 OK — nol anak di luar rentang, nol bentrok, nol href ganda';
END $$;
