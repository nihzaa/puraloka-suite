-- ════════════════════════════════════════════════════════════════════════════
-- 332 — Menu Serah Terima PHO/FHO (E2)
-- ════════════════════════════════════════════════════════════════════════════
--
-- `lp-serah` sudah ada sejak lama: `is_active = false`, `href = '/proyek'`.
-- Halaman yang dijanjikannya tak pernah dibuat — pola yang sama dengan
-- `sk-opname` (D1) dan `sk-wo` (E1).
--
-- ── Kenapa sort_order 906, bukan 912
--
-- Grup ini punya DUA generasi entri yang hidup berdampingan: yang aktif
-- (901-905, ber-href halaman nyata) dan yang nonaktif (901-912, warisan
-- rancangan lama). `lp-serah` memakai 912 dari generasi nonaktif.
--
-- Menyalakannya di 912 membuat ia muncul jauh di bawah, terpisah dari
-- saudara-saudaranya yang aktif — dan sidebar yang urutannya tak masuk akal
-- membuat orang mengira menunya tak ada. 906 melanjutkan deret yang AKTIF.
--
-- Diukur, bukan ditebak: 906 kosong di antara entri aktif grup ini.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items
   SET href = '/lapangan/serah-terima',
       label = 'Serah Terima (PHO/FHO)',
       icon = 'ClipboardCheck',
       is_active = TRUE,
       -- Izin BACA, bukan kelola: yang perlu melihat kapan masa pemeliharaan
       -- berakhir jauh lebih banyak daripada yang berwenang menandatangani.
       required_permissions = ARRAY['serah_terima:view']::text[],
       parent_id = (SELECT parent_id FROM menu_items WHERE key = 'lapangan-punch-list' LIMIT 1),
       section = (SELECT section FROM menu_items WHERE key = 'lapangan-punch-list' LIMIT 1),
       sort_order = 906
 WHERE key = 'lp-serah';

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'lp-serah',
       'Serah Terima (PHO/FHO)',
       '/lapangan/serah-terima',
       'ClipboardCheck',
       (SELECT parent_id FROM menu_items WHERE key = 'lapangan-punch-list' LIMIT 1),
       ARRAY['serah_terima:view']::text[],
       906,
       (SELECT section FROM menu_items WHERE key = 'lapangan-punch-list' LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'lp-serah');

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  -- href NOT NULL. Item aktif ber-href null dirender sidebar sebagai tautan
  -- yang diam saat diklik — tak ada galat, tak ada 404, hanya "fitur rusak".
  -- Ini persis yang terjadi pada `sk-opname` sesudah migrasi 326 lulus.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'lp-serah' AND is_active AND href = '/lapangan/serah-terima'
  ) THEN
    RAISE EXCEPTION '332 gagal: menu lp-serah tak aktif atau href-nya salah';
  END IF;

  -- Induk WAJIB aktif (pelajaran 326: dua grup berlabel sama, satu mati).
  IF NOT EXISTS (
    SELECT 1 FROM menu_items m
      JOIN menu_items p ON p.id = m.parent_id
     WHERE m.key = 'lp-serah' AND p.is_active
  ) THEN
    RAISE EXCEPTION '332 gagal: induk menu nonaktif — itemnya menggantung di sidebar';
  END IF;

  -- Satu rute = satu tautan (aturan 232).
  SELECT count(*) INTO n FROM menu_items
   WHERE is_active AND href = '/lapangan/serah-terima';
  IF n <> 1 THEN
    RAISE EXCEPTION '332 gagal: % menu aktif menunjuk /lapangan/serah-terima (harus 1)', n;
  END IF;

  -- sort_order tak boleh bentrok DI ANTARA YANG AKTIF. Yang nonaktif boleh
  -- berbagi angka — mereka tak dirender, dan generasi lama grup ini memang
  -- memakai deret yang sama.
  SELECT count(*) INTO n
    FROM menu_items m
   WHERE m.is_active
     AND m.parent_id = (SELECT parent_id FROM menu_items WHERE key = 'lp-serah' LIMIT 1)
     AND m.sort_order = 906;
  IF n <> 1 THEN
    RAISE EXCEPTION '332 gagal: % item AKTIF ber-sort_order 906 di grup itu (harus 1)', n;
  END IF;

  -- Izin yang dirujuk menu WAJIB ada — menu yang menuntut izin hantu tak
  -- pernah terlihat siapa pun, dan tak ada galat yang menandainya.
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'serah_terima:view') THEN
    RAISE EXCEPTION '332 gagal: izin serah_terima:view tak ada — jalankan migrasi 331 lebih dulu';
  END IF;

  RAISE NOTICE '332 OK — /lapangan/serah-terima punya menunya di urutan 906';
END $$;
