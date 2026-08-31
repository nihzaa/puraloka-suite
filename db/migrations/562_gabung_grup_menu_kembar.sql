-- ============================================================================
-- 562 — Empat grup induk KEMBAR: "Master Data" muncul dua kali di sidebar
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- Ditemukan sesi `puraloka-suite-61` dari TANGKAPAN LAYAR sidebar, bukan dari
-- penjaga — "Master Data" dan "Gudang & Mater…" tampil dua kali berturut-turut.
-- Tak satu pun penjaga menangkapnya: kunci dan href-nya berbeda, jadi
-- `audit-menu-berbagi-href` dan `audit-sidebar-urutan` sama-sama hijau.
--
-- Diukur:
--
--     Alat & Aset        g-aset(1300)      | g-alat-aset(1301)
--     Gudang & Material  g-inventory(700)  | g-gudang(701)
--     Mandor & Subkon    g-subkon(800)     | g-mandor-subkon(801)
--     Master Data        g-master(100)     | g-master-data(50)
--
-- Dua generasi penamaan grup hidup berdampingan, dan ANAKNYA TERBAGI di
-- antara keduanya. Pemakai harus menebak "Master Data" yang mana isinya.
--
-- ── Ini akibat migrasi 558 — pekerjaan saya sendiri
--
-- 558 menghidupkan grup mana pun yang punya anak aktif, supaya 36 halaman tak
-- lagi yatim. Ia benar untuk tujuannya, tapi tak memeriksa apakah grup yang
-- dinyalakan KEMBAR dengan yang sudah hidup. Migrasi 560 lalu menggeser
-- nomornya supaya tak bertumpuk — yang justru membuat keduanya terlihat rapi
-- berdampingan, bukan menyatu.
--
-- ── Cara memilih yang bertahan: MAYORITAS anak aktif
--
--     g-alat-aste      3 anak aktif  ✓   g-aset        1
--     g-gudang         6             ✓   g-inventory   1
--     g-mandor-subkon 10             ✓   g-subkon      1
--     g-master-data   12             ✓   g-master      4
--
-- Yang menang bukan yang lebih tua atau namanya lebih rapi, melainkan yang
-- SUDAH dipakai lebih banyak menu — memindahkan 1 anak jauh lebih kecil
-- risikonya daripada memindahkan 12.
--
-- Tujuh anak dipindah, empat grup minoritas dimatikan. Nol menu hilang: yang
-- berpindah tetap terlihat, hanya di bawah induk yang lain.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

DO $gabung$
DECLARE
  p        RECORD;
  a        RECORD;
  v_baru   INT;
  n_pindah INT := 0;
  n_matikan INT := 0;
BEGIN
  FOR p IN
    /*
      Pasangan ditentukan dari LABEL, bukan daftar kunci yang dipaku —
      supaya migrasi ini tetap benar bila kelak ada pasangan kembar lain.
      Pelajaran migrasi 322: memaku nama membuat verifikasi membusuk.
    */
    SELECT label,
           (array_agg(id ORDER BY jml DESC, created_at))[1] AS induk_menang,
           (array_agg(id ORDER BY jml ASC,  created_at DESC))[1] AS induk_kalah
      FROM (
        SELECT g.id, g.label, g.created_at,
               (SELECT count(*) FROM menu_items x
                 WHERE x.parent_id = g.id AND x.is_active) AS jml
          FROM menu_items g
         WHERE g.parent_id IS NULL AND g.is_active) t
     GROUP BY label HAVING count(*) > 1
  LOOP
    -- Anak AKTIF di grup kalah dipindah ke grup menang, satu per satu supaya
    -- nomornya bisa dicarikan celah masing-masing.
    FOR a IN
      SELECT id, key FROM menu_items
       WHERE parent_id = p.induk_kalah AND is_active
       ORDER BY sort_order, key
    LOOP
      SELECT min(k) INTO v_baru
        FROM generate_series(
               (SELECT sort_order + 1 FROM menu_items WHERE id = p.induk_menang),
               (SELECT sort_order + 99 FROM menu_items WHERE id = p.induk_menang)) k
       WHERE NOT EXISTS (
         SELECT 1 FROM menu_items x
          WHERE x.parent_id = p.induk_menang AND x.is_active AND x.sort_order = k);

      IF v_baru IS NULL THEN
        RAISE EXCEPTION '562 gagal: rentang induk penuh untuk anak %', a.key;
      END IF;

      UPDATE menu_items
         SET parent_id = p.induk_menang, sort_order = v_baru, updated_at = now()
       WHERE id = a.id;
      n_pindah := n_pindah + 1;
    END LOOP;

    -- Grup kalah dimatikan HANYA sesudah anaknya pindah.
    UPDATE menu_items SET is_active = FALSE, updated_at = now()
     WHERE id = p.induk_kalah;
    n_matikan := n_matikan + 1;
  END LOOP;

  RAISE NOTICE '562: % anak dipindah, % grup kembar dimatikan', n_pindah, n_matikan;
END $gabung$;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_kembar  INT;
  v_kembar  TEXT;
  n_gantung INT;
  n_bentrok INT;
  n_luar    INT;
BEGIN
  SELECT count(*), string_agg(label, ', ') INTO n_kembar, v_kembar
    FROM (SELECT label FROM menu_items
           WHERE parent_id IS NULL AND is_active
           GROUP BY label HAVING count(*) > 1) x;
  IF n_kembar > 0 THEN
    RAISE EXCEPTION '562 gagal: % grup masih kembar: %', n_kembar, v_kembar;
  END IF;

  -- Nol anak aktif tertinggal di grup yang dimatikan.
  SELECT count(*) INTO n_gantung
    FROM menu_items a JOIN menu_items g ON g.id = a.parent_id
   WHERE a.is_active AND NOT g.is_active;
  IF n_gantung > 0 THEN
    RAISE EXCEPTION '562 gagal: % menu aktif di bawah induk padam', n_gantung;
  END IF;

  -- Warisan 559/560/561 tak boleh rusak oleh pemindahan di atas.
  SELECT count(*) INTO n_bentrok FROM (
    SELECT a.parent_id, a.sort_order
      FROM menu_items a JOIN menu_items g ON g.id = a.parent_id
     WHERE a.is_active AND g.is_active
     GROUP BY a.parent_id, a.sort_order HAVING count(*) > 1) y;
  IF n_bentrok > 0 THEN
    RAISE EXCEPTION '562 gagal: % anak bentrok sesudah dipindah', n_bentrok;
  END IF;

  SELECT count(*) INTO n_luar
    FROM menu_items a JOIN menu_items g ON g.id = a.parent_id
   WHERE a.is_active AND g.is_active AND g.parent_id IS NULL
     AND (a.sort_order <= g.sort_order OR a.sort_order > g.sort_order + 99);
  IF n_luar > 0 THEN
    RAISE EXCEPTION '562 gagal: % anak di luar rentang induk barunya', n_luar;
  END IF;

  RAISE NOTICE '562 OK — nol grup kembar, nol anak menggantung, nol bentrok';
END $$;
