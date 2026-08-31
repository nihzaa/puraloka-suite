-- ============================================================================
-- 559 — Dua sisa dari migrasi 558: menu tanpa halaman & urutan bentrok
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- Migrasi 558 menghidupkan 66 menu supaya 36 halaman tak lagi yatim. Dua
-- penjaga lalu merah — keduanya akibat langsung, dan keduanya nyata:
--
--     audit-menu-punya-halaman   menu aktif tanpa halaman : 2
--     audit-sidebar-urutan       sort_order bentrok       : 5
--
-- 558 memeriksa href GANDA dan anak MENGGANTUNG, tapi tidak memeriksa apakah
-- halamannya benar-benar ada, dan tidak memeriksa bentrok urutan di antara
-- menu yang baru dinyalakan. Dua celah itu ditutup di sini.
--
-- ── (A) Dua menu menunjuk halaman yang BELUM dibangun
--
-- Diperiksa langsung ke disk:
--
--     /akuntansi/pajak            akun-pajak       → page.tsx TAK ADA
--     /master/template-dokumen    md-template-dok  → page.tsx TAK ADA
--
-- Dimatikan, bukan dibiarkan. Menu yang mengundang klik lalu mendarat di 404
-- membuat orang berhenti memercayai SELURUH sidebar — dan itu lebih mahal
-- daripada satu fitur yang belum terlihat.
--
-- Halaman lain di kedua modul tetap terjangkau: `/akuntansi` dan
-- `/master/*` punya menunya sendiri. Begitu layarnya dibangun, menu ini
-- tinggal dinyalakan lagi.
--
-- ── (B) Empat nomor urut bentrok
--
--     g-administrasi  1699   pengaturan-langganan | sistem
--     g-ai             281   ai-plafon-setujui    | ai-whatsapp
--     g-akuntansi     1260   gl-peta-akun         | akun-pajak
--     g-pelaporan     1520   lap-susun            | peta-modul
--
-- Dua item bernomor sama membuat urutan sidebar bergantung pada urutan baris
-- yang dipulangkan basis — berubah-ubah tanpa sebab yang terlihat.
--
-- Yang digeser: item yang BARU dinyalakan 558, bukan yang sudah lama menempati
-- nomornya. Digeser ke celah kosong PERTAMA di atas nomor itu, dihitung dari
-- basis — bukan dipaku, supaya tak mengulang cacat migrasi 322 yang memaku
-- angka 59 lalu membusuk saat pohon menu ditata ulang.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

-- ── (A) Matikan menu yang halamannya belum ada ──────────────────────────────
UPDATE menu_items
   SET is_active = FALSE, updated_at = now()
 WHERE is_active
   AND href IN ('/akuntansi/pajak', '/master/template-dokumen');

-- ── (B) Geser yang bentrok ke celah kosong terdekat ─────────────────────────
DO $geser$
DECLARE
  r        RECORD;
  v_baru   INT;
BEGIN
  FOR r IN
    /*
      Untuk tiap (induk, sort_order) yang dipakai >1 item aktif, sisakan yang
      TERTUA (id terkecil menurut created_at) dan geser sisanya. Yang lama
      menempati nomornya lebih dulu; yang baru dinyalakan yang mengalah.
    */
    SELECT a.id, a.parent_id, a.sort_order
      FROM menu_items a
      JOIN menu_items g ON g.id = a.parent_id
     WHERE a.is_active AND g.is_active
       AND EXISTS (
         SELECT 1 FROM menu_items b
          WHERE b.is_active AND b.parent_id = a.parent_id
            AND b.sort_order = a.sort_order AND b.id <> a.id
            AND b.created_at < a.created_at)
     ORDER BY a.parent_id, a.sort_order, a.created_at
  LOOP
    SELECT min(kandidat) INTO v_baru
      FROM generate_series(r.sort_order + 1, r.sort_order + 60) AS kandidat
     WHERE NOT EXISTS (
       SELECT 1 FROM menu_items x
        WHERE x.parent_id = r.parent_id AND x.is_active
          AND x.sort_order = kandidat);

    IF v_baru IS NULL THEN
      RAISE EXCEPTION '559 gagal: tak ada celah untuk menu % di grupnya', r.id;
    END IF;

    UPDATE menu_items SET sort_order = v_baru, updated_at = now() WHERE id = r.id;
  END LOOP;
END $geser$;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_bentrok INT;
  n_ganda   INT;
  n_gantung INT;
BEGIN
  SELECT count(*) INTO n_bentrok FROM (
    SELECT a.parent_id, a.sort_order
      FROM menu_items a JOIN menu_items g ON g.id = a.parent_id
     WHERE a.is_active AND g.is_active
     GROUP BY a.parent_id, a.sort_order HAVING count(*) > 1) x;
  IF n_bentrok > 0 THEN
    RAISE EXCEPTION '559 gagal: % sort_order masih bentrok', n_bentrok;
  END IF;

  -- Warisan 558 tak boleh rusak oleh penggeseran di atas.
  SELECT count(*) INTO n_ganda FROM (
    SELECT href FROM menu_items WHERE is_active AND href IS NOT NULL
     GROUP BY href HAVING count(*) > 1) y;
  IF n_ganda > 0 THEN
    RAISE EXCEPTION '559 gagal: % href dipegang >1 menu aktif', n_ganda;
  END IF;

  SELECT count(*) INTO n_gantung
    FROM menu_items a JOIN menu_items g ON g.id = a.parent_id
   WHERE a.is_active AND NOT g.is_active;
  IF n_gantung > 0 THEN
    RAISE EXCEPTION '559 gagal: % menu aktif di bawah induk padam', n_gantung;
  END IF;

  RAISE NOTICE '559 OK — nol bentrok urutan, nol href ganda, nol anak menggantung';
END $$;
