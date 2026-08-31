-- ════════════════════════════════════════════════════════════════════════════
-- 322 — Menu untuk /pengaturan/field-tambahan (TJS-P5)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Halaman tanpa tautan nav hanya bisa dibuka dengan mengetik URL. Menu dibuat
-- bersamaan dengan halamannya sejak migrasi 300.
--
-- ── Induk: Master Data, bukan Sistem
--
-- Field tambahan MENDEFINISIKAN bentuk data master (proyek, pemasok, material,
-- pegawai, klien) — ia tetangga "Satuan" dan "Kategori Pekerjaan", bukan
-- tetangga "Recycle Bin". Yang mencarinya akan mencari di dekat data yang
-- dibentuknya.
--
-- ── `sort_order` 59: celah yang DIUKUR, bukan ditebak
--
-- Grup `g-master-data` terisi 51–58 lalu 61–64. 59 dan 60 kosong, dan 59
-- menempatkannya persis sesudah kelompok `pengaturan-*` yang sekerabat.
--
-- Diukur karena pada 2026-08-12 sesi lain baru memperbaiki LIMA pasang
-- `sort_order` yang bentrok dalam satu grup (migrasi 319). Menebak angka di
-- sini akan menambah pasangan keenam pada hari yang sama.
--
-- ── `required_permissions`: view, bukan manage
--
-- Menu muncul untuk yang boleh MELIHAT; halamannya sendiri menyembunyikan
-- kontrol ubah bagi yang tak punya `manage`. Menuntut `manage` di menu berarti
-- staf yang mengisi field tak pernah bisa membuka daftarnya untuk tahu field
-- apa saja yang ada.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'md-field-tambahan',
       'Field Tambahan',
       '/pengaturan/field-tambahan',
       'SlidersHorizontal',
       (SELECT id FROM menu_items WHERE key IN ('g-master','g-master-data')
          ORDER BY key LIMIT 1),
       ARRAY['settings:customfield:view']::text[],
       59,
       (SELECT section FROM menu_items WHERE key = 'pengaturan-satuan' LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'md-field-tambahan');

UPDATE menu_items
   SET href = '/pengaturan/field-tambahan',
       is_active = TRUE,
       required_permissions = ARRAY['settings:customfield:view']::text[]
 WHERE key = 'md-field-tambahan';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'md-field-tambahan' AND is_active AND href = '/pengaturan/field-tambahan'
  ) THEN
    RAISE EXCEPTION '322 gagal: menu md-field-tambahan tak terbentuk atau tak aktif';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'md-field-tambahan' AND parent_id IS NOT NULL) THEN
    RAISE EXCEPTION '322 gagal: md-field-tambahan tak punya induk — tak akan muncul di sidebar';
  END IF;

  -- Satu rute = satu tautan (aturan 232).
  SELECT count(*) INTO n FROM menu_items WHERE is_active AND href = '/pengaturan/field-tambahan';
  IF n <> 1 THEN
    RAISE EXCEPTION '322 gagal: % menu aktif menunjuk /pengaturan/field-tambahan (harus 1)', n;
  END IF;

  -- ── Kenapa angka 59 dihapus (2026-09-01)
  --
  -- Versi asli memaku sort_order = 59 — celah kosong di g-master-data saat
  -- migrasi ini ditulis (terisi 51-58 lalu 61-64).
  --
  -- Angka itu MEMBUSUK begitu migrasi 530 menomori ulang seluruh pohon menu
  -- berjarak. Diukur ke basis 2026-09-01:
  --
  --     md-field-tambahan   ADA, sort_order = 164, aktif = false
  --
  -- Menunya ada; nomornya yang berpindah. Verifikasi lama menuntut 59,
  -- menemukan nol, lalu gagal — dan MENGHENTIKAN seluruh rantai:
  --
  --     x 322  0 item aktif ber-sort_order 59 di g-master-data (harus 1)
  --       BERHENTI - sisa 116 tak pernah dijalankan
  --
  -- Nomor urut MEMANG ditata ulang dari waktu ke waktu. Memakunya di
  -- verifikasi migrasi berarti melarang penataan itu selamanya.
  --
  -- Bentrokan sort_order tetap dijaga penjaga sidebar di CI, dengan daftar
  -- yang dibaca dari basis - tak membeku seperti angka di sini.
  --
  -- Nama GRUP pun tak dipaku — diukur 2026-09-01, induknya `g-master`,
  -- bukan `g-master-data` seperti yang ditulis migrasi ini. Grupnya
  -- dinamai ulang belakangan, dan itu sebabnya INSERT di atas dulu tak
  -- pernah menemukan induknya.
  --
  -- Menyunting 322 sah: diperiksa ke buku migrasi, BELUM PERNAH tercatat.
  -- Yang diperiksa: menunya ADA di grupnya — BUKAN angka sort_order.
  --
  SELECT count(*) INTO n
    FROM menu_items m
   WHERE m.key = 'md-field-tambahan'
     AND m.parent_id = (SELECT id FROM menu_items WHERE key IN ('g-master','g-master-data')
                         ORDER BY key LIMIT 1);
  --
  IF n <> 1 THEN
    RAISE EXCEPTION '322 gagal: md-field-tambahan tak ada di grup Master (ketemu %)', n;
  END IF;

  -- Izin yang menjaga menunya harus ADA, kalau tidak menu tak pernah tampil
  -- untuk siapa pun dan halamannya jadi tak terjangkau.
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'settings:customfield:view') THEN
    RAISE EXCEPTION '322 gagal: izin settings:customfield:view tak ada — menu tak akan tampil';
  END IF;

  RAISE NOTICE '322 OK — /pengaturan/field-tambahan punya menunya sendiri di Master Data (sort 59)';
END $$;
