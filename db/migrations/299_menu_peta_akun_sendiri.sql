-- ════════════════════════════════════════════════════════════════════════════
-- 299 — Peta akun jurnal dapat MENUNYA SENDIRI (R-012, koreksi 297)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kesalahan yang dikoreksi
--
-- Migrasi 297 mengarahkan menu `akun-pajak` ("Pajak") ke
-- `/akuntansi/peta-akun`. Itu MEMBAJAK menu yang artinya lain: peta akun
-- jurnal bukan pajak — ia pemetaan seluruh transaksi ke bagan akun, dan pajak
-- hanya dua dari tujuh barisnya.
--
-- Akibatnya nyata: orang yang mencari pengaturan pajak akan menemukan
-- halaman pemetaan akun, dan orang yang mencari pemetaan akun tak akan
-- menemukannya sama sekali — karena tak ada menu bernama itu.
--
-- Ini bentuk lain dari cacat yang sudah berulang di repo ini: label yang
-- tak cocok dengan isinya. Yang membedakan, kali ini saya yang membuatnya
-- dan menemukannya sendiri sebelum founder melihat.
--
-- ── Yang dilakukan
--
-- 1. `akun-pajak` dikembalikan ke keadaan semula (nonaktif, href `/m/…`).
-- 2. Menu BARU `gl-peta-akun` dibuat di bawah grup Akuntansi.
--
-- Menu baru dibuat lewat INSERT, bukan mengubah yang ada — dan `sort_order`
-- diletakkan sesudah item akuntansi yang sudah ada supaya urutannya wajar.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Kembalikan `akun-pajak` ke keadaan sebelum 297.
UPDATE menu_items
   SET href = '/m/akun-pajak', is_active = FALSE, required_permissions = ARRAY[]::text[]
 WHERE key = 'akun-pajak';

-- 2. Menu sendiri, di grup yang sama dengan item akuntansi lain.
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'gl-peta-akun',
       'Peta Akun Jurnal',
       '/akuntansi/peta-akun',
       'Link2',
       (SELECT parent_id FROM menu_items WHERE key = 'akuntansi-jurnal' LIMIT 1),
       ARRAY['gl:peta-akun:view']::text[],
       COALESCE((SELECT max(sort_order) + 1 FROM menu_items
                  WHERE key IN ('akuntansi-akun','akuntansi-jurnal','akuntansi-besar',
                                'akuntansi-neraca','akuntansi-laporan')), 900),
       (SELECT section FROM menu_items WHERE key = 'akuntansi-jurnal' LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'gl-peta-akun');

-- Bila sudah ada (migrasi dijalankan ulang), pastikan nilainya benar.
UPDATE menu_items
   SET href = '/akuntansi/peta-akun', is_active = TRUE,
       required_permissions = ARRAY['gl:peta-akun:view']::text[]
 WHERE key = 'gl-peta-akun';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  -- Menu peta akun wajib ada, aktif, dan menunjuk halaman nyata.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'gl-peta-akun' AND is_active AND href = '/akuntansi/peta-akun'
  ) THEN
    RAISE EXCEPTION '299 gagal: menu gl-peta-akun tak terbentuk atau tak aktif';
  END IF;

  -- Tepat SATU menu aktif per route (aturan 232).
  SELECT count(*) INTO n FROM menu_items
   WHERE is_active AND href = '/akuntansi/peta-akun';
  IF n <> 1 THEN
    RAISE EXCEPTION '299 gagal: % menu aktif menunjuk /akuntansi/peta-akun (harus 1)', n;
  END IF;

  -- `akun-pajak` TIDAK boleh lagi menunjuk halaman peta akun.
  IF EXISTS (
    SELECT 1 FROM menu_items WHERE key = 'akun-pajak' AND href = '/akuntansi/peta-akun'
  ) THEN
    RAISE EXCEPTION '299 gagal: akun-pajak masih membajak halaman peta akun';
  END IF;

  RAISE NOTICE '299 OK — gl-peta-akun punya menunya sendiri, akun-pajak dikembalikan';
END $$;
