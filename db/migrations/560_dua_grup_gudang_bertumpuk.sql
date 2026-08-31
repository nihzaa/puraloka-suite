-- ============================================================================
-- 560 — DUA grup gudang bertumpuk di nomor yang sama
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- `audit-sidebar-urutan` merah sesudah migrasi 558/559:
--
--     Gudang & Material    740  ×2
--          Rencana Susut | Transfer Antar Proyek
--
-- Sekilas terbaca "dua anak berbagi nomor". Diukur, sebabnya lebih dalam:
--
--     gd-susut          sort=740   induk = g-inventory (sort 700)
--     gudang-transfer   sort=740   induk = g-gudang    (sort 700)
--
-- Anaknya di GRUP BERBEDA — yang bertumpuk INDUKNYA. Dua grup sama-sama
-- bernomor 700, jadi penjaga membacanya sebagai satu kelompok dan anaknya
-- tampak bentrok.
--
-- Migrasi 559 melewatkannya karena ia menggeser berdasarkan `created_at`
-- dalam satu induk yang sama — dan keduanya memang bukan saudara.
--
-- ── Kenapa grupnya yang digeser, bukan anaknya
--
-- Menggeser `gd-susut` ke 741 akan menutup gejalanya tanpa menyentuh
-- sebabnya: dua grup tetap bertumpuk, dan anak BERIKUTNYA yang ditambahkan
-- ke salah satunya akan bentrok lagi. Urutan tampil dua grup itu pun tetap
-- bergantung tie-break abjad, bukan niat siapa pun.
--
-- `g-inventory` yang digeser: ia lahir belakangan (grup lama `g-gudang` sudah
-- memakai 700 sejak awal), dan digeser ke celah kosong PERTAMA di atasnya —
-- dihitung dari basis, bukan dipaku. Memaku angka persis cacat migrasi 322
-- yang membusuk saat pohon menu ditata ulang.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

DO $geser_grup$
DECLARE
  r      RECORD;
  v_baru INT;
  n      INT := 0;
BEGIN
  /*
    DELAPAN pasang, bukan satu — diukur sesudah percobaan pertama gagal:

        100   g-master        | g-crm-tender
        200   g-crm           | g-proyek
        300   g-kontrak       | g-estimasi-biaya
        500   g-cost          | g-anggaran
        700   g-inventory     | g-gudang
        800   g-subkon        | g-mandor-subkon
        1200  g-alat-dokumen  | g-akuntansi
        1300  g-aset          | g-alat-aset

    Empat pasang bahkan BERLABEL SAMA (Gudang & Material, Mandor & Subkon,
    Alat & Aset) — dua generasi penamaan grup yang hidup berdampingan.

    Yang digeser: grup yang lahir BELAKANGAN (created_at lebih besar), karena
    yang lama sudah menempati nomornya sejak awal. Digeser ke celah kosong
    pertama di atasnya, dihitung dari basis.
  */
  FOR r IN
    SELECT a.id, a.key, a.sort_order
      FROM menu_items a
     WHERE a.parent_id IS NULL AND a.is_active
       AND EXISTS (
         SELECT 1 FROM menu_items b
          WHERE b.parent_id IS NULL AND b.is_active
            AND b.sort_order = a.sort_order AND b.id <> a.id
            AND b.created_at < a.created_at)
     ORDER BY a.sort_order, a.created_at
  LOOP
    SELECT min(k) INTO v_baru
      FROM generate_series(r.sort_order + 1, r.sort_order + 90) k
     WHERE NOT EXISTS (
       SELECT 1 FROM menu_items x
        WHERE x.parent_id IS NULL AND x.is_active AND x.sort_order = k);

    IF v_baru IS NULL THEN
      RAISE EXCEPTION '560 gagal: tak ada celah untuk grup %', r.key;
    END IF;

    UPDATE menu_items SET sort_order = v_baru, updated_at = now() WHERE id = r.id;
    n := n + 1;
  END LOOP;

  RAISE NOTICE '560: % grup digeser dari nomor yang bertumpuk', n;
END $geser_grup$;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_grup INT;
  n_anak INT;
BEGIN
  -- Nol grup AKAR yang berbagi nomor.
  SELECT count(*) INTO n_grup FROM (
    SELECT sort_order FROM menu_items
     WHERE parent_id IS NULL AND is_active
     GROUP BY sort_order HAVING count(*) > 1) x;
  IF n_grup > 0 THEN
    RAISE EXCEPTION '560 gagal: % nomor dipakai >1 grup akar', n_grup;
  END IF;

  -- Dan warisan 558/559 tetap: nol anak bentrok DALAM induk yang sama.
  SELECT count(*) INTO n_anak FROM (
    SELECT a.parent_id, a.sort_order
      FROM menu_items a JOIN menu_items g ON g.id = a.parent_id
     WHERE a.is_active AND g.is_active
     GROUP BY a.parent_id, a.sort_order HAVING count(*) > 1) y;
  IF n_anak > 0 THEN
    RAISE EXCEPTION '560 gagal: % anak masih bentrok dalam induknya', n_anak;
  END IF;

  RAISE NOTICE '560 OK — nol grup bertumpuk, nol anak bentrok';
END $$;
