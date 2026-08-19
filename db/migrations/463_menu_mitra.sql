-- ════════════════════════════════════════════════════════════════════════════
-- 463 — Menu Mitra: entri `md-subkon` akhirnya menunjuk halaman yang ada
-- ════════════════════════════════════════════════════════════════════════════
--
-- Migrasi 461 membuat tabel `mitra`, 462 memasang izinnya, dan layar
-- `/mandor/mitra` sudah dibangun. Yang tersisa: pintu masuknya.
--
-- ── Kenapa MENGUBAH `md-subkon`, bukan membuat entri baru
--
-- `md-subkon` sudah ada sejak 2026-08-01, tetapi:
--
--   href       = '/mandor'    ← bukan halamannya sendiri, cuma modul induknya
--   is_active  = false        ← tak pernah muncul di menu siapa pun
--
-- Ia entri yang menjanjikan "Subkontraktor" lalu mengantar orang ke daftar
-- mandor. Itu persis keluhan yang membuat entri ini bernilai `sebagian` di
-- Peta Modul, dan membuat entri BARU akan meninggalkan yang lama tetap
-- berbohong sambil menambah baris kedua tentang hal yang sama.
--
-- ── Kenapa `required_permissions` diisi
--
-- Diukur 2026-08-19: seluruh entri `menu_items` yang ada ber-array KOSONG,
-- artinya menu tampil untuk siapa pun yang bisa masuk. Untuk layar ini itu
-- tak memadai — ia memuat tombol yang MELARANG pihak lain berbisnis, dan
-- menampilkannya kepada orang yang tak punya izinnya menghasilkan 403 yang
-- terbaca seperti kerusakan.
--
-- `mitra:view` saja yang dituntut: yang tak punya `mitra:daftar_hitam` tetap
-- boleh MELIHAT daftarnya — tombolnya yang akan menolak, dan itu benar.
--
-- Idempoten.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items
   SET href = '/mandor/mitra',
       label = 'Mitra & Subkontraktor',
       required_permissions = ARRAY['mitra:view'],
       is_active = true,
       kesiapan = 'hidup',
       updated_at = now()
 WHERE key = 'md-subkon';

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_href text; v_aktif boolean; v_izin text[];
BEGIN
  SELECT href, is_active, required_permissions
    INTO v_href, v_aktif, v_izin
    FROM menu_items WHERE key = 'md-subkon';

  IF v_href IS NULL THEN
    RAISE EXCEPTION '463 gagal: entri menu md-subkon tak ada';
  END IF;

  IF v_href <> '/mandor/mitra' THEN
    RAISE EXCEPTION '463 gagal: md-subkon masih menunjuk % — menu yang menjanjikan '
      'Subkontraktor lalu mengantar ke tempat lain', v_href;
  END IF;

  IF NOT v_aktif THEN
    RAISE EXCEPTION '463 gagal: md-subkon tak aktif — halaman yang dibangun tapi '
      'tak punya pintu masuk sama saja dengan tak ada';
  END IF;

  -- Izin yang dituntut WAJIB benar-benar ada. Kunci hantu di
  -- `required_permissions` menyembunyikan menu dari SEMUA orang tanpa gejala —
  -- kegagalan yang sama bentuknya dengan `requirePermission` bercacat.
  IF EXISTS (
    SELECT 1 FROM unnest(v_izin) k
     WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = k)
  ) THEN
    RAISE EXCEPTION '463 gagal: required_permissions memuat kunci yang tak ada di '
      'tabel permissions — menunya hilang dari SEMUA orang tanpa satu pun galat';
  END IF;

  RAISE NOTICE '463 OK — md-subkon menunjuk /mandor/mitra, aktif, izin % terbukti ada',
    v_izin;
END $$;
