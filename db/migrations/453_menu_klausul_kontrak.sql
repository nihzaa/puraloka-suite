-- ════════════════════════════════════════════════════════════════════════════
-- 453 — Menu "Klausul Kontrak" di Master Data
-- ════════════════════════════════════════════════════════════════════════════
--
-- Migrasi 450 memindahkan klausul kontrak dari kode ke basis. Tapi "kolom DB
-- sudah ada" BUKAN selesai (CHARTER §8): sampai 2026-08-17 sore, satu-satunya
-- cara mengubah bunyi pasal tetap SQL langsung ke basis produksi — persis yang
-- hendak dihindari saat memindahkannya dari kode.
--
-- Layarnya kini ada (`/pengaturan/klausul-kontrak`), jadi menunya didaftarkan.
--
-- ── Kenapa di Master Data, bukan di grup Kontrak
--
-- Klausul berlaku LINTAS PROYEK — ia bunyi baku perusahaan, bukan milik satu
-- kontrak. Menaruhnya di grup Kontrak (yang berisi kontrak-kontrak nyata)
-- membuat orang mencarinya di dalam sebuah kontrak, lalu menyunting yang
-- disangkanya salinan padahal ia sumbernya.
--
-- Itu pola yang sudah dipakai `md-template-dok` dan Price Book: yang dipakai
-- lintas proyek tinggal di Master Data.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, parent_id,
                        required_permissions, sort_order, section, is_active, kesiapan)
SELECT 'md-klausul-kontrak', 'Klausul Kontrak', '/pengaturan/klausul-kontrak', 'Dot',
       (SELECT parent_id FROM menu_items WHERE key = 'md-template-dok'),
       ARRAY['settings:manage'],
       (SELECT sort_order + 1 FROM menu_items WHERE key = 'md-template-dok'),
       'main', TRUE, 'hidup'
WHERE EXISTS (SELECT 1 FROM menu_items WHERE key = 'md-template-dok')
ON CONFLICT (key) DO UPDATE
  SET href = EXCLUDED.href,
      is_active = TRUE,
      required_permissions = EXCLUDED.required_permissions,
      updated_at = now();

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  n INT;
BEGIN
  SELECT href, is_active, required_permissions, parent_id INTO r
    FROM menu_items WHERE key = 'md-klausul-kontrak';

  IF r IS NULL THEN
    RAISE EXCEPTION '453 gagal: menu tak terbentuk — induk md-template-dok tak ada?';
  END IF;

  IF r.href <> '/pengaturan/klausul-kontrak' OR NOT r.is_active THEN
    RAISE EXCEPTION '453 gagal: menu menunjuk % (aktif=%)', r.href, r.is_active;
  END IF;

  IF r.parent_id IS NULL THEN
    RAISE EXCEPTION '453 gagal: menu yatim — takkan tampil di sidebar';
  END IF;

  IF coalesce(array_length(r.required_permissions, 1), 0) = 0 THEN
    RAISE EXCEPTION '453 gagal: menu aktif TANPA izin — tampil untuk semua orang';
  END IF;

  SELECT count(*) INTO n FROM permissions WHERE key = ANY(r.required_permissions);
  IF n <> coalesce(array_length(r.required_permissions, 1), 0) THEN
    RAISE EXCEPTION '453 gagal: kunci izin % tak terdaftar — kunci hantu menolak SEMUA orang',
      r.required_permissions;
  END IF;

  -- Tabel yang disuntingnya harus benar-benar ada. Menu yang menunjuk layar
  -- yang membaca tabel tak ada akan gagal saat dibuka, bukan saat dipasang.
  IF to_regclass('public.klausul_kontrak') IS NULL THEN
    RAISE EXCEPTION '453 gagal: tabel klausul_kontrak tak ada — migrasi 450 belum jalan';
  END IF;

  RAISE NOTICE '453 OK — Klausul Kontrak menunjuk /pengaturan/klausul-kontrak, '
    'aktif, berinduk, berizin %', r.required_permissions;
END $$;
