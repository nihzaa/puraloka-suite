-- ════════════════════════════════════════════════════════════════════════════
-- 317 — Menu untuk /sistem/impor (TJS-P3)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Halaman tanpa tautan nav hanya bisa dibuka dengan mengetik URL. Menu dibuat
-- bersamaan dengan halamannya sejak migrasi 300.
--
-- ── TANPA `required_permissions`, sama alasannya dengan recycle bin (315)
--
-- Importer melayani BANYAK skema, masing-masing menulis ke tabel berbeda
-- dengan izinnya sendiri (`gudang:manage` untuk material, dan seterusnya).
-- Izin per-skema dicek DI HANDLER `commit`, bukan di menu.
--
-- Menuntut satu izin di menu akan salah ke dua arah: yang punya izin skema
-- lain tak melihat menunya, sementara yang punya izin itu tetapi tak punya
-- izin skema lain melihat menu yang separuh isinya menolak.
--
-- Tahap 1–3 (unggah, petakan, pratinjau) memang tak menulis apa pun, jadi
-- membukanya tanpa izin tulis tidak berbahaya. Yang dijaga: tahap 4.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'sys-impor',
       'Impor Data',
       '/sistem/impor',
       'Upload',
       (SELECT parent_id FROM menu_items WHERE key = 'sys-recycle-bin' LIMIT 1),
       ARRAY[]::text[],
       COALESCE((SELECT sort_order + 1 FROM menu_items WHERE key = 'sys-recycle-bin' LIMIT 1), 991),
       (SELECT section FROM menu_items WHERE key = 'sys-recycle-bin' LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'sys-impor');

UPDATE menu_items
   SET href = '/sistem/impor', is_active = TRUE,
       required_permissions = ARRAY[]::text[]
 WHERE key = 'sys-impor';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items WHERE key = 'sys-impor' AND is_active AND href = '/sistem/impor'
  ) THEN
    RAISE EXCEPTION '317 gagal: menu sys-impor tak terbentuk atau tak aktif';
  END IF;

  SELECT count(*) INTO n FROM menu_items WHERE is_active AND href = '/sistem/impor';
  IF n <> 1 THEN
    RAISE EXCEPTION '317 gagal: % menu aktif menunjuk /sistem/impor (harus 1)', n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'sys-impor' AND parent_id IS NOT NULL) THEN
    RAISE EXCEPTION '317 gagal: sys-impor tak punya parent — tak akan muncul di sidebar';
  END IF;

  -- Izin yang menjaga TULISAN harus ada — kalau tidak, tahap 4 menolak
  -- semua orang dan wizard-nya berakhir buntu di langkah terakhir.
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'gudang:manage') THEN
    RAISE EXCEPTION '317 gagal: izin gudang:manage tak ada — commit impor akan buntu';
  END IF;

  RAISE NOTICE '317 OK — /sistem/impor punya menunya sendiri; izin dijaga per-skema di handler';
END $$;
