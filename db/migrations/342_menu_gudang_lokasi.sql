-- ════════════════════════════════════════════════════════════════════════════
-- 342 — Menu Gudang & Lokasi
-- ════════════════════════════════════════════════════════════════════════════
--
-- `md-gudang` menunjuk `/procurement` (halaman pengadaan, bukan gudang) dan
-- nonaktif. Induknya `g-inventory` — grup yang juga nonaktif, jadi
-- menghidupkannya di sana akan membuat itemnya menggantung.
--
-- Dipindah ke `g-gudang`, grup yang AKTIF dan sudah berisi enam halaman
-- gudang lain.
--
-- 707, bukan 702. Versi pertama migrasi ini memakai 702 karena query
-- pengukurannya menyaring `href LIKE '/gudang%'` — dan `procurement-stok`
-- (href `/procurement/stok`) yang memakai 702 tak ikut terlihat. Verifikasi
-- di bawah menangkapnya: "2 item AKTIF ber-sort_order 702".
--
-- Pelajarannya berulang: mengukur dengan saringan yang lebih sempit daripada
-- yang dijaga membuat pengukurannya berbohong dengan percaya diri.
--
-- ── Kenapa halamannya terpisah dari `/gudang`
--
-- `/gudang` adalah IKHTISAR: berapa stok, mana yang menyentuh batas pesan
-- ulang, apa yang bergerak. `/gudang/lokasi` mengelola gudangnya sendiri —
-- kode, alamat, penanggung jawab. Menggabungkannya membuat layar ikhtisar
-- yang dibuka tiap hari penuh dengan form yang disentuh setahun sekali.
--
-- ── Izin `gudang:view`
--
-- Sudah ada dan dipakai policy RLS. Menu memakai izin BACA, bukan `manage`:
-- yang perlu melihat daftar gudang lebih banyak daripada yang berwenang
-- mengubahnya, dan menu ber-izin `manage` menyembunyikannya dari mereka.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items
   SET href = '/gudang/lokasi',
       label = 'Gudang & Lokasi',
       icon = 'Warehouse',
       is_active = TRUE,
       required_permissions = ARRAY['gudang:view']::text[],
       parent_id = (SELECT parent_id FROM menu_items WHERE key = 'gudang-rekonsiliasi' LIMIT 1),
       section = (SELECT section FROM menu_items WHERE key = 'gudang-rekonsiliasi' LIMIT 1),
       sort_order = 707
 WHERE key = 'md-gudang';

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'md-gudang',
       'Gudang & Lokasi',
       '/gudang/lokasi',
       'Warehouse',
       (SELECT parent_id FROM menu_items WHERE key = 'gudang-rekonsiliasi' LIMIT 1),
       ARRAY['gudang:view']::text[],
       707,
       (SELECT section FROM menu_items WHERE key = 'gudang-rekonsiliasi' LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'md-gudang');

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'md-gudang' AND is_active AND href = '/gudang/lokasi'
       AND 'gudang:view' = ANY(required_permissions)
  ) THEN
    RAISE EXCEPTION '342 gagal: md-gudang tak aktif, href salah, atau tanpa izin';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'gudang:view') THEN
    RAISE EXCEPTION '342 gagal: izin gudang:view tak ada';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
     WHERE p.key = 'gudang:view'
  ) THEN
    RAISE EXCEPTION '342 gagal: gudang:view tak diberikan ke peran mana pun';
  END IF;

  -- Satu rute = satu tautan (aturan 232).
  SELECT count(*) INTO n FROM menu_items WHERE is_active AND href = '/gudang/lokasi';
  IF n <> 1 THEN
    RAISE EXCEPTION '342 gagal: % menu aktif menunjuk /gudang/lokasi (harus 1)', n;
  END IF;

  -- Induk WAJIB aktif — `g-inventory` yang lama nonaktif, dan itu sebabnya
  -- menu ini dipindah.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items m JOIN menu_items p ON p.id = m.parent_id
     WHERE m.key = 'md-gudang' AND p.is_active
  ) THEN
    RAISE EXCEPTION '342 gagal: induk md-gudang nonaktif — itemnya menggantung di sidebar';
  END IF;

  -- sort_order tak bentrok DI ANTARA YANG AKTIF.
  SELECT count(*) INTO n
    FROM menu_items m
   WHERE m.is_active
     AND m.parent_id = (SELECT parent_id FROM menu_items WHERE key = 'md-gudang' LIMIT 1)
     AND m.sort_order = 707;
  IF n <> 1 THEN
    RAISE EXCEPTION '342 gagal: % item AKTIF ber-sort_order 707 di grup itu (harus 1)', n;
  END IF;

  RAISE NOTICE '342 OK — /gudang/lokasi hidup di grup g-gudang urutan 707';
END $$;
