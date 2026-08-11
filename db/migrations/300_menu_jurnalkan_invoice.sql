-- ════════════════════════════════════════════════════════════════════════════
-- 300 — Menu untuk /akuntansi/jurnalkan (R-012)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Ditemukan oleh penjaga, bukan oleh saya
--
-- `audit-nav-yatim.mjs` merahkan `/akuntansi/jurnalkan`: halamannya jadi,
-- endpoint-nya jalan, tetapi TAK ADA satu pun tautan yang menuju ke sana.
-- Halaman seperti itu hanya bisa dibuka dengan mengetik URL — artinya bagi
-- pengguna ia tidak ada.
--
-- Ini pola yang berulang di repo ini dan sudah dicatat CLAUDE.md §8a.4: kode
-- selesai lebih dulu dari jalan menuju kode itu. Yang membedakan kali ini,
-- penjaganya menangkapnya di menit yang sama, bukan berbulan kemudian.
--
-- ── Kenapa menu SENDIRI, bukan tab di halaman peta akun
--
-- ARAH-VISUAL-2026 §6a: tab = data yang sama dilihat dari sudut lain; halaman
-- = entitas yang berbeda. Peta akun adalah PENGATURAN (jarang disentuh, sekali
-- ditetapkan), jurnalkan invoice adalah PEKERJAAN HARIAN. Menjadikannya tab
-- akan menyembunyikan pekerjaan harian di balik halaman pengaturan.
--
-- ── Izin
--
-- `gl:jurnalkan` — sama dengan yang dijaga endpoint-nya. Memberi menu izin
-- yang lebih longgar dari endpoint menghasilkan menu yang terlihat lalu
-- menampilkan 403: pengguna menyimpulkan aplikasi rusak, padahal ia memang
-- tak berhak.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'gl-jurnalkan',
       'Jurnalkan Invoice',
       '/akuntansi/jurnalkan',
       'BookUp',
       (SELECT parent_id FROM menu_items WHERE key = 'gl-peta-akun' LIMIT 1),
       ARRAY['gl:jurnalkan']::text[],
       COALESCE((SELECT sort_order + 1 FROM menu_items WHERE key = 'gl-peta-akun' LIMIT 1), 901),
       (SELECT section FROM menu_items WHERE key = 'gl-peta-akun' LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'gl-jurnalkan');

-- Idempoten: bila migrasi diulang, pastikan nilainya tetap benar.
UPDATE menu_items
   SET href = '/akuntansi/jurnalkan', is_active = TRUE,
       required_permissions = ARRAY['gl:jurnalkan']::text[]
 WHERE key = 'gl-jurnalkan';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
  v_parent UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'gl-jurnalkan' AND is_active AND href = '/akuntansi/jurnalkan'
  ) THEN
    RAISE EXCEPTION '300 gagal: menu gl-jurnalkan tak terbentuk atau tak aktif';
  END IF;

  -- Aturan 232: satu rute = satu tautan sidebar.
  SELECT count(*) INTO n FROM menu_items
   WHERE is_active AND href = '/akuntansi/jurnalkan';
  IF n <> 1 THEN
    RAISE EXCEPTION '300 gagal: % menu aktif menunjuk /akuntansi/jurnalkan (harus 1)', n;
  END IF;

  -- Izin menu HARUS sama dengan yang dijaga endpoint. Menu yang lebih longgar
  -- menghasilkan 403 yang terbaca sebagai aplikasi rusak.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'gl-jurnalkan' AND required_permissions = ARRAY['gl:jurnalkan']::text[]
  ) THEN
    RAISE EXCEPTION '300 gagal: izin menu gl-jurnalkan tidak sama dengan izin endpoint';
  END IF;

  -- Ia harus duduk di grup yang sama dengan peta akun — bukan melayang di
  -- akar, tempat menu tak bergrup jadi tak terlihat di sidebar.
  SELECT parent_id INTO v_parent FROM menu_items WHERE key = 'gl-jurnalkan';
  IF v_parent IS DISTINCT FROM (SELECT parent_id FROM menu_items WHERE key = 'gl-peta-akun') THEN
    RAISE EXCEPTION '300 gagal: gl-jurnalkan tidak segrup dengan gl-peta-akun';
  END IF;

  RAISE NOTICE '300 OK — /akuntansi/jurnalkan punya menunya sendiri, segrup dengan peta akun';
END $$;
