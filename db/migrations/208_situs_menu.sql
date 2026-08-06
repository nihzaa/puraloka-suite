-- ════════════════════════════════════════════════════════════════════════════
-- 208 — Menu "Situs Publik" di bawah Pengaturan
--
-- ── Cacat yang ditutup
--
-- Halaman `/pengaturan/situs` ada di kode sejak commit sebelumnya, tapi tak ada
-- satu pun jalan menuju ke sana dari UI. Halaman yang hanya bisa dicapai dengan
-- mengetik URL secara harfiah sama dengan belum dikerjakan — dan itu persis
-- definisi "config-first" yang CLAUDE.md §8 tolak: "kolom DB sudah ada BUKAN
-- selesai; config-first berarti ada halaman pengaturannya di UI".
--
-- ── Kenapa required_permissions = situs:view, bukan situs:manage
--
-- Menu menentukan siapa yang MELIHAT pintunya; endpoint yang menentukan siapa
-- boleh mengubah isinya. Memakai `situs:manage` di sini menyembunyikan menu
-- dari orang yang berhak membaca konten tapi tidak mengeditnya — dan halaman
-- itu sendiri sudah menonaktifkan tombol simpan bila permission-nya kurang.
--
-- ── parent_id diturunkan lewat kueri, bukan uuid dipaku
--
-- uuid literal membuat migrasi ini senyap-tak-berefek di database lain
-- (menu induknya punya id berbeda di sana). Kelas cacat yang sama dengan yang
-- dicatat di header 207.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO menu_items
  (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT
  'pengaturan-situs',
  'Situs Publik',
  '/pengaturan/situs',
  'Globe',
  induk.parent_id,
  ARRAY['situs:view'],
  -- Ditaruh setelah seluruh sub-menu pengaturan yang ada, bukan di angka tetap
  -- yang bisa bertabrakan saat sub-menu lain ditambahkan nanti.
  (SELECT COALESCE(MAX(sort_order), 0) + 10
     FROM menu_items m2
    WHERE m2.parent_id = induk.parent_id),
  induk.section,
  true
FROM (
  SELECT parent_id, section
    FROM menu_items
   WHERE key = 'pengaturan-profil'
   LIMIT 1
) AS induk
ON CONFLICT (key) DO UPDATE
   SET href                 = EXCLUDED.href,
       label                = EXCLUDED.label,
       icon                 = EXCLUDED.icon,
       required_permissions = EXCLUDED.required_permissions,
       is_active            = true;

COMMIT;
