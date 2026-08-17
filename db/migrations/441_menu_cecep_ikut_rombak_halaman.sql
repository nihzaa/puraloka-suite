-- ════════════════════════════════════════════════════════════════════════════
-- 441 — menu CECEP masih menunjuk `?tab=`, sesudah tabnya jadi halaman
--
-- ── Cacat yang diperbaiki
--
-- Rombak UI CECEP (`feat/cecep-ui-rombak`) memecah `/estimasi` 4.070 baris jadi
-- lima halaman, dan memindahkan dua master data ke `/master`:
--
--     /estimasi?tab=katalog   →  /master/ahsp      (katalog AHSP nasional)
--     /estimasi?tab=harga     →  /master/harga     (price book perusahaan)
--     /estimasi?tab=rap       →  /estimasi/rap
--     /estimasi?tab=cashflow  →  /estimasi/kas
--     /estimasi?tab=varians   →  /estimasi/varians
--
-- `apps/web/lib/peta-menu.ts` SUDAH diperbarui menunjuk alamat baru. Tetapi
-- sidebar tidak membaca berkas itu — ia membaca `menu_items` di BASIS. Jadi
-- seluruh menu masih mengirim orang ke `?tab=` yang tak lagi punya penerima.
--
-- Akibatnya `/master/ahsp` dan `/master/harga` menjadi YATIM: halaman jadi,
-- lengkap, tetapi tak bisa dicapai kecuali dengan mengetik URL. Ditemukan
-- `audit-nav-yatim.mjs` — penjaga yang lahir dari migrasi 220 untuk kelas cacat
-- yang persis sama.
--
-- Bahwa cacat yang sama terulang sesudah punya penjaganya menunjukkan satu hal:
-- penjaga hanya bekerja kalau DIJALANKAN. Ia hijau di checkout utama dan merah
-- di worktree ini sejak commit pertama rombak.
--
-- ── Key dibaca dari DB, bukan ditebak
--
-- Migrasi 220 mencatat jebakannya: `UPDATE ... WHERE key = <tebakan>` mengenai
-- NOL baris tanpa galat, lalu migrasi melapor sukses sementara menunya tetap
-- salah. Ketujuh key di bawah dibaca lewat SELECT ke `menu_items` (2026-08-17),
-- bukan diturunkan dari nama halaman. Blok verifikasi di akhir membuktikannya.
--
-- ── Idempoten
--
-- `UPDATE ... WHERE key = ...` menetapkan nilai akhir, bukan menambah.
-- Dijalankan berapa kali pun hasilnya sama.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Master data lintas proyek: pindah ke /master ────────────────────────────
--
-- Katalog AHSP dan price book BUKAN pekerjaan per proyek — keduanya master
-- yang disiapkan sekali lalu dipakai seluruh estimasi. `peta-menu.ts` sudah
-- menggolongkannya `md-*` (master data) sejak lama; pemindahan ini
-- menyelaraskan alamat dengan taksonomi yang sudah ada.
UPDATE menu_items SET href = '/master/ahsp'  WHERE key = 'crm-estimating';
UPDATE menu_items SET href = '/master/ahsp'  WHERE key = 'md-resource';
UPDATE menu_items SET href = '/master/harga' WHERE key = 'md-price-book';

-- ── Kerja per proyek: tab jadi halaman sendiri ──────────────────────────────
UPDATE menu_items SET href = '/estimasi/rap'     WHERE key = 'cc-rap';
UPDATE menu_items SET href = '/estimasi/kas'     WHERE key = 'cc-cashflow';
UPDATE menu_items SET href = '/estimasi/varians' WHERE key = 'cc-varians';
UPDATE menu_items SET href = '/estimasi/varians' WHERE key = 'md-cost-code';

-- ── Menunya DINYALAKAN — href benar saja tidak cukup ────────────────────────
--
-- Ketujuh menu ini `is_active = false`, dan href yang benar tidak menolong
-- menu yang tak pernah dirender. `/master/ahsp` + `/master/harga` tetap yatim
-- sesudah blok UPDATE di atas — itulah yang membuat `audit-nav-yatim` MASIH
-- merah pada percobaan pertama migrasi ini.
--
-- Kenapa mereka mati sejak awal: seluruh isi CECEP dulu hidup sebagai TAB di
-- dalam satu halaman `/estimasi`, jadi tak satu pun butuh entri sidebar
-- sendiri. Begitu tabnya jadi halaman, entri itu berubah dari mubazir jadi
-- satu-satunya jalan masuk.
--
-- Ini BUKAN mencabut kurasi orang lain. Diukur 2026-08-17: tetangga sesama
-- master data di section yang sama — `md-wbs`, `md-karyawan`, `md-penomoran` —
-- ketiganya `is_active = true`. Yang mati justru hanya kelompok CECEP, dan
-- persis karena sejarah tab di atas. 206 menu tak-aktif lainnya TIDAK
-- disentuh: sebagian memang belum punya halaman, dan menyalakannya massal
-- akan mengirim orang ke 404.
UPDATE menu_items SET is_active = true
 WHERE key IN ('crm-estimating','md-resource','md-price-book',
               'cc-rap','cc-cashflow','cc-varians','md-cost-code');

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI — migrasi ini GAGAL bila hasilnya tidak seperti yang dimaksud
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_key_hilang        text;
  v_masih_tab         text;
  v_masih_mati        text;
  v_kunci             text[] := ARRAY[
    'crm-estimating','md-resource','md-price-book',
    'cc-rap','cc-cashflow','cc-varians','md-cost-code'];
BEGIN
  -- 1. Key karangan mengenai nol baris TANPA galat (pelajaran migrasi 220).
  --    Tanpa pemeriksaan ini, migrasi melapor sukses sementara menunya utuh
  --    menunjuk alamat mati.
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_key_hilang
    FROM unnest(v_kunci) AS k
   WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.key = k);

  IF v_key_hilang IS NOT NULL THEN
    RAISE EXCEPTION '441 gagal: key menu tidak ada di menu_items: %', v_key_hilang;
  END IF;

  -- 2. Tak satu pun boleh tersisa menunjuk `?tab=` — halaman penerimanya
  --    sudah tidak ada, jadi yang tersisa adalah 404 yang terlihat sah.
  SELECT string_agg(key || ' -> ' || href, ', ' ORDER BY key)
    INTO v_masih_tab
    FROM menu_items
   WHERE is_active AND href LIKE '/estimasi?tab=%';

  IF v_masih_tab IS NOT NULL THEN
    RAISE EXCEPTION '441 gagal: masih menunjuk tab lama: %', v_masih_tab;
  END IF;

  -- 3. Href benar pada menu yang mati sama saja dengan tidak ada menunya.
  --    Percobaan pertama migrasi ini lolos (1) dan (2) sementara
  --    `/master/ahsp` tetap yatim — pemeriksaan inilah yang menangkapnya.
  SELECT string_agg(key, ', ' ORDER BY key) INTO v_masih_mati
    FROM menu_items
   WHERE key = ANY(v_kunci) AND NOT is_active;

  IF v_masih_mati IS NOT NULL THEN
    RAISE EXCEPTION '441 gagal: menu masih tak aktif (halaman tetap yatim): %', v_masih_mati;
  END IF;
END $$;
