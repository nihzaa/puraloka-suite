-- ════════════════════════════════════════════════════════════════════════════
-- 452 — Menu "Verifikasi Tanda Tangan": endpointnya kini punya layar
-- ════════════════════════════════════════════════════════════════════════════
--
-- `POST /kendali-dokumen/tanda-tangan/verifikasi` dibangun 2026-08-16 dan
-- sejak itu hanya bisa dipakai orang yang tahu cara memanggil API — dan mereka
-- bukan orang yang perlu memverifikasi dokumen.
--
-- Per 2026-08-17 layarnya ada (`/dokumen/verifikasi`), jadi menunya didaftarkan.
--
-- ── Kenapa menu BARU, bukan menumpang `dk-esign`
--
-- `dk-esign` menunjuk `/dokumen/kendali` — dasbor yang MENDAFTAR dokumen.
-- Verifikasi bukan pendaftaran: ia dilakukan orang yang sedang meragukan
-- sebuah dokumen, biasanya bukan orang yang mengunggahnya, dan sering pada
-- dokumen yang datang dari luar. Menyembunyikannya sebagai tab di dasbor
-- register membuat ia hanya ditemukan orang yang sudah tahu ia ada.
--
-- ── Izin: `documents:manage`, sama dengan endpointnya
--
-- Bukan `documents:view` — kunci itu TIDAK ADA di tabel `permissions`, dan
-- kunci hantu menolak SEMUA orang tanpa satu pun gejala. Diverifikasi di blok
-- di bawah, bukan dipercaya.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, parent_id,
                        required_permissions, sort_order, section, is_active, kesiapan)
SELECT 'dk-verifikasi-ttd', 'Verifikasi Tanda Tangan', '/dokumen/verifikasi', 'Dot',
       (SELECT parent_id FROM menu_items WHERE key = 'dk-esign'),
       ARRAY['documents:manage'],
       (SELECT sort_order + 1 FROM menu_items WHERE key = 'dk-esign'),
       'main', TRUE, 'hidup'
WHERE EXISTS (SELECT 1 FROM menu_items WHERE key = 'dk-esign')
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
    FROM menu_items WHERE key = 'dk-verifikasi-ttd';

  IF r IS NULL THEN
    RAISE EXCEPTION '452 gagal: menu dk-verifikasi-ttd tak terbentuk — '
      'induk dk-esign tak ditemukan?';
  END IF;

  IF r.href <> '/dokumen/verifikasi' OR NOT r.is_active THEN
    RAISE EXCEPTION '452 gagal: menu menunjuk % (aktif=%)', r.href, r.is_active;
  END IF;

  -- Menu aktif ber-izin KOSONG tampil untuk semua orang, termasuk yang
  -- halamannya akan menolak mereka.
  IF coalesce(array_length(r.required_permissions, 1), 0) = 0 THEN
    RAISE EXCEPTION '452 gagal: menu aktif TANPA izin';
  END IF;

  -- Kunci hantu menolak SEMUA orang tanpa gejala.
  SELECT count(*) INTO n FROM permissions WHERE key = ANY(r.required_permissions);
  IF n <> coalesce(array_length(r.required_permissions, 1), 0) THEN
    RAISE EXCEPTION '452 gagal: kunci izin % tak terdaftar di tabel permissions',
      r.required_permissions;
  END IF;

  -- Menu yatim tak pernah tampil: sidebar merender dari pohon.
  IF r.parent_id IS NULL THEN
    RAISE EXCEPTION '452 gagal: menu tanpa induk — takkan tampil di sidebar';
  END IF;

  RAISE NOTICE '452 OK — Verifikasi Tanda Tangan menunjuk /dokumen/verifikasi, '
    'aktif, berinduk, berizin %', r.required_permissions;
END $$;
