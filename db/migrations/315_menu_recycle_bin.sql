-- ════════════════════════════════════════════════════════════════════════════
-- 315 — Menu untuk /sistem/recycle-bin (TJS-P1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Halaman tanpa tautan nav hanya bisa dibuka dengan mengetik URL — sama saja
-- dengan tidak ada. Menu dibuat bersamaan dengan halamannya sejak migrasi 300.
--
-- ── Kenapa TANPA `required_permissions`
--
-- Berbeda dari menu lain di repo ini, item ini sengaja tak menuntut izin
-- tertentu. Sebabnya: recycle bin berisi BANYAK jenis data, masing-masing
-- dengan izinnya sendiri, dan halamannya hanya menampilkan yang boleh dilihat
-- orangnya (dicek `hasPermission` per-entri di handler).
--
-- Menuntut satu izin di menu akan salah ke dua arah sekaligus: yang punya izin
-- lain tak melihat menunya sama sekali, sementara yang punya izin itu tetapi
-- tak punya izin jenis lain melihat menu yang isinya kosong.
--
-- Yang menjaga tetap ada — di handler, per jenis. Menu hanyalah pintu.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'sys-recycle-bin',
       'Recycle Bin',
       '/sistem/recycle-bin',
       'Trash2',
       (SELECT parent_id FROM menu_items WHERE href = '/sistem' AND is_active LIMIT 1),
       ARRAY[]::text[],
       COALESCE((SELECT sort_order + 1 FROM menu_items
                  WHERE href = '/sistem' AND is_active LIMIT 1), 990),
       (SELECT section FROM menu_items WHERE href = '/sistem' AND is_active LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'sys-recycle-bin');

UPDATE menu_items
   SET href = '/sistem/recycle-bin', is_active = TRUE,
       required_permissions = ARRAY[]::text[]
 WHERE key = 'sys-recycle-bin';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'sys-recycle-bin' AND is_active AND href = '/sistem/recycle-bin'
  ) THEN
    RAISE EXCEPTION '315 gagal: menu sys-recycle-bin tak terbentuk atau tak aktif';
  END IF;

  -- Aturan 232: satu rute = satu tautan sidebar.
  SELECT count(*) INTO n FROM menu_items
   WHERE is_active AND href = '/sistem/recycle-bin';
  IF n <> 1 THEN
    RAISE EXCEPTION '315 gagal: % menu aktif menunjuk /sistem/recycle-bin (harus 1)', n;
  END IF;

  -- Punya parent — menu tanpa parent melayang di akar dan tak terlihat.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items WHERE key = 'sys-recycle-bin' AND parent_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION '315 gagal: sys-recycle-bin tak punya parent — tak akan muncul di sidebar';
  END IF;

  RAISE NOTICE '315 OK — /sistem/recycle-bin punya menunya sendiri, tanpa izin '
    '(dijaga per-jenis di handler)';
END $$;
