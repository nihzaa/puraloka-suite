-- ════════════════════════════════════════════════════════════════════════════
-- 326 — Menu untuk /mandor/opname (D1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Menu `sk-opname` SUDAH ADA sejak lama, tetapi:
--
--   is_active = false     tak pernah muncul di sidebar
--   href = '/mandor'      menunjuk halaman induk, bukan modulnya
--
-- Halaman yang dijanjikannya tak pernah dibuat — sama seperti tabelnya.
-- Sekarang keduanya ada, jadi menunya diarahkan ke jalur yang benar dan
-- dihidupkan.
--
-- ── `required_permissions`: view, bukan kelola
--
-- Menu muncul untuk yang boleh MELIHAT; halamannya sendiri menyembunyikan
-- tombol verifikasi bagi yang tak punya `opname:verifikasi`. Menuntut izin
-- kelola di menu berarti penyetuju — yang justru paling perlu membuka
-- halaman ini — tak pernah melihat menunya.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items
   SET href = '/mandor/opname',
       label = 'Opname Bersama',
       is_active = TRUE,
       required_permissions = ARRAY['mandor:view']::text[],
       icon = 'ClipboardCheck'
 WHERE key = 'sk-opname';

-- Bila entrinya tak ada sama sekali (basis yang lebih baru), dibuat.
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'sk-opname',
       'Opname Bersama',
       '/mandor/opname',
       'ClipboardCheck',
       (SELECT parent_id FROM menu_items WHERE key = 'mandor-penugasan' LIMIT 1),
       ARRAY['mandor:view']::text[],
       -- 809: DIUKUR, bukan ditebak. Grup ini terisi 801-808 (mandor,
       -- penugasan, absensi, upah, kasbon, penagihan, retensi, tender).
       -- Versi pertama memakai 804 dan bentrok dengan `mandor-upah` —
       -- ditangkap blok verifikasi migrasi ini sendiri.
       809,
       (SELECT section FROM menu_items WHERE key = 'mandor-penugasan' LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'sk-opname');

-- ── Induk dipindahkan ke grup yang HIDUP ────────────────────────────────────
--
-- `sk-opname` lama menempel di `g-subkon` yang `is_active = false`. Ada DUA
-- grup berlabel "Mandor & Subkon": `g-subkon` (mati) dan `g-mandor-subkon`
-- (hidup) — sisa penataan ulang sidebar yang tak menyapu entri nonaktif.
--
-- Item aktif di bawah grup mati tetap dirender sidebar (penyaringnya
-- per-BARIS, bukan per-POHON), jadi ia muncul MENGGANTUNG tanpa induk,
-- nyantol di bawah grup terakhir yang kebetulan berdekatan. Penjaga
-- `audit-sidebar-urutan` menabrak versi pertama migrasi ini karena itu.
--
-- Induknya diambil dari `mandor-penugasan` — tetangga terdekat yang sudah
-- terbukti hidup, bukan ditebak namanya.
UPDATE menu_items
   SET parent_id = (SELECT parent_id FROM menu_items WHERE key = 'mandor-penugasan' LIMIT 1),
       -- `sort_order` lama (801) ikut diganti, bukan dipertahankan: ia milik
       -- grup LAIN yang mati, dan di grup baru ia bentrok dengan `mandor`.
       sort_order = 809
 WHERE key = 'sk-opname';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'sk-opname' AND is_active AND href = '/mandor/opname'
  ) THEN
    RAISE EXCEPTION '326 gagal: menu sk-opname tak aktif atau href-nya salah';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'sk-opname' AND parent_id IS NOT NULL) THEN
    RAISE EXCEPTION '326 gagal: sk-opname tak punya induk — tak akan muncul di sidebar';
  END IF;

  -- Induk WAJIB aktif. Item aktif di bawah grup mati tetap dirender sidebar
  -- dan muncul menggantung tanpa induk — persis yang terjadi pada versi
  -- pertama migrasi ini.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items m JOIN menu_items p ON p.id = m.parent_id
     WHERE m.key = 'sk-opname' AND p.is_active
  ) THEN
    RAISE EXCEPTION '326 gagal: induk sk-opname NONAKTIF — itemnya akan menggantung di sidebar';
  END IF;

  -- Satu rute = satu tautan (aturan 232).
  SELECT count(*) INTO n FROM menu_items WHERE is_active AND href = '/mandor/opname';
  IF n <> 1 THEN
    RAISE EXCEPTION '326 gagal: % menu aktif menunjuk /mandor/opname (harus 1)', n;
  END IF;

  -- `sort_order` tak boleh bentrok dalam satu grup — migrasi 319 baru
  -- memperbaiki lima bentrokan hari ini.
  SELECT count(*) INTO n
    FROM menu_items m
   WHERE m.is_active
     AND m.parent_id = (SELECT parent_id FROM menu_items WHERE key = 'sk-opname' LIMIT 1)
     AND m.sort_order = (SELECT sort_order FROM menu_items WHERE key = 'sk-opname' LIMIT 1);
  IF n <> 1 THEN
    RAISE EXCEPTION '326 gagal: % item aktif ber-sort_order sama di grup itu (harus 1)', n;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'opname:verifikasi') THEN
    RAISE EXCEPTION '326 gagal: izin opname:verifikasi tak ada — jalankan migrasi 325 lebih dulu';
  END IF;

  RAISE NOTICE '326 OK — /mandor/opname punya menunya; sk-opname dihidupkan dari nonaktif';
END $$;
