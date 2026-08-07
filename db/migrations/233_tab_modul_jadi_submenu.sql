-- ════════════════════════════════════════════════════════════════════════════
-- 233 — Tab yang isinya MODUL TERPISAH diangkat jadi sub-menu
--
-- ── Pertanyaan founder
--
--   "jadi yg tab tab ituu dijadiin sub menu kah?"
--
-- Migrasi 232 menghapus seluruh `?tab=`/`?bagian=` dari sidebar demi disiplin
-- satu route satu link. Akibat sampingannya: **26 tab di 8 halaman kehilangan
-- jalan masuk dari sidebar**. Orang yang mencari "Notulen Rapat" tak akan
-- menemukannya — ia harus tahu lebih dulu bahwa notulen hidup di dalam
-- "Kendali Dokumen".
--
-- ── Garisnya bisa diuji, bukan selera
--
-- Pertanyaannya: **kalau aplikasi ini dipecah jadi produk terpisah, apakah tab
-- ini ikut pindah utuh?**
--
--   YA  → ia modul terpisah yang kebetulan satu halaman karena DIBACA BERSAMA.
--         Punya tabel DB sendiri, punya namanya sendiri di taksonomi.
--         "Transmittal" dan "Notulen Rapat" bukan dua cara melihat hal sama.
--
--   TIDAK → ia satu hal dilihat dari sudut berbeda, dan tak punya arti di luar
--         halamannya. Sembilan tab `/laporan` semuanya laporan proyek yang
--         sama dengan potongan berbeda; "Arus Kas" di sana butuh seluruh data
--         laporan untuk ada.
--
-- ── Yang diangkat (18 tab → sub-menu)
--
--   /dokumen/kendali      Register Gambar · Transmittal · Notulen · Laporan Terjadwal
--   /kepatuhan            Kesiapan & Izin · Dokumen Kepatuhan · Evaluasi Subkon
--   /procurement/lanjutan Kontrak Payung · Expediting · Nota Kredit
--   /jadwal               Jalur Kritis · Histogram Sumber Daya · Method Statement
--   /akuntansi            Jurnal · Bagan Akun · Neraca Saldo · Buku Besar · Neraca & L/R
--
-- ── Yang TIDAK diangkat, dan kenapa
--
--   /laporan   9 tab   satu laporan, sembilan potongan
--   /estimasi  6 tab   satu alur estimasi, enam langkahnya
--   /aset      2 tab   satu daftar aset, disaring kepemilikan
--
-- Mengangkatnya akan menambah 17 item sidebar yang seluruhnya berbunyi
-- "laporan X" — dan sidebar yang penuh nama mirip lebih sulit dipakai daripada
-- sidebar yang menyerahkan pemilahan itu ke halamannya.
--
-- ── Aturan "satu route satu link" TETAP UTUH
--
-- `?bagian=notulen` dan `?bagian=gambar` adalah dua alamat berbeda, jadi tiap
-- link tetap punya tujuan sendiri. Yang dilarang migrasi 232 adalah dua link ke
-- alamat yang SAMA — dan itu tetap nol.
--
-- Menu induk halamannya (mis. `dokumen-kendali` → `/dokumen/kendali` tanpa
-- query) DIHAPUS: ia akan jadi link kelima yang membuka tab pertama, dan itu
-- persis duplikat yang baru saja diberantas.
--
-- ── Idempoten: nonaktifkan induk lalu ON CONFLICT untuk anak-anaknya.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Induk lama dinonaktifkan (bukan dihapus — company_menu_settings) ────────
UPDATE menu_items SET is_active = false
 WHERE key IN ('dokumen-kendali', 'kepatuhan', 'procurement-lanjutan', 'jadwal', 'akuntansi');

-- ── /jadwal → kelompok Proyek (sort 103-105) ────────────────────────────────
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active) VALUES
  ('jadwal-cpm',       'Jalur Kritis (CPM)',      '/jadwal?bagian=cpm',       'Dot', 103, 'main', (SELECT id FROM menu_items WHERE key='g-proyek'), true),
  ('jadwal-histogram', 'Histogram Sumber Daya',   '/jadwal?bagian=histogram', 'Dot', 104, 'main', (SELECT id FROM menu_items WHERE key='g-proyek'), true),
  ('jadwal-method',    'Method Statement',        '/jadwal?bagian=method',    'Dot', 105, 'main', (SELECT id FROM menu_items WHERE key='g-proyek'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;

-- ── /akuntansi → kelompok Estimasi & Biaya (sort 302-306) ───────────────────
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active) VALUES
  ('akuntansi-jurnal',  'Jurnal Umum',        '/akuntansi?tab=jurnal',  'Dot', 302, 'main', (SELECT id FROM menu_items WHERE key='g-estimasi-biaya'), true),
  ('akuntansi-akun',    'Bagan Akun',         '/akuntansi?tab=akun',    'Dot', 303, 'main', (SELECT id FROM menu_items WHERE key='g-estimasi-biaya'), true),
  ('akuntansi-neraca',  'Neraca Saldo',       '/akuntansi?tab=neraca',  'Dot', 304, 'main', (SELECT id FROM menu_items WHERE key='g-estimasi-biaya'), true),
  ('akuntansi-besar',   'Buku Besar',         '/akuntansi?tab=besar',   'Dot', 305, 'main', (SELECT id FROM menu_items WHERE key='g-estimasi-biaya'), true),
  ('akuntansi-laporan', 'Neraca & Laba-Rugi', '/akuntansi?tab=laporan', 'Dot', 306, 'main', (SELECT id FROM menu_items WHERE key='g-estimasi-biaya'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;

-- ── /procurement/lanjutan → kelompok Pengadaan (sort 709-711) ───────────────
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active) VALUES
  ('pl-payung',     'Kontrak Payung', '/procurement/lanjutan?bagian=payung',     'Dot', 709, 'main', (SELECT id FROM menu_items WHERE key='g-pengadaan'), true),
  ('pl-expediting', 'Expediting',     '/procurement/lanjutan?bagian=expediting', 'Dot', 710, 'main', (SELECT id FROM menu_items WHERE key='g-pengadaan'), true),
  ('pl-nota',       'Nota Kredit',    '/procurement/lanjutan?bagian=nota',       'Dot', 711, 'main', (SELECT id FROM menu_items WHERE key='g-pengadaan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;

-- ── /kepatuhan → kelompok Mutu & Kepatuhan (sort 1102-1104) ─────────────────
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active) VALUES
  ('kep-kesiapan', 'Kesiapan & Izin Kerja', '/kepatuhan?bagian=kesiapan', 'Dot', 1102, 'main', (SELECT id FROM menu_items WHERE key='g-mutu-kepatuhan'), true),
  ('kep-dokumen',  'Dokumen Kepatuhan',     '/kepatuhan?bagian=dokumen',  'Dot', 1103, 'main', (SELECT id FROM menu_items WHERE key='g-mutu-kepatuhan'), true),
  ('kep-evaluasi', 'Evaluasi Subkon',       '/kepatuhan?bagian=evaluasi', 'Dot', 1104, 'main', (SELECT id FROM menu_items WHERE key='g-mutu-kepatuhan'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;

-- ── /dokumen/kendali → kelompok Alat & Dokumen (sort 1203-1206) ─────────────
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active) VALUES
  ('kd-gambar',      'Register Gambar',   '/dokumen/kendali?bagian=gambar',      'Dot', 1203, 'main', (SELECT id FROM menu_items WHERE key='g-alat-dokumen'), true),
  ('kd-transmittal', 'Transmittal',       '/dokumen/kendali?bagian=transmittal', 'Dot', 1204, 'main', (SELECT id FROM menu_items WHERE key='g-alat-dokumen'), true),
  ('kd-notulen',     'Notulen Rapat',     '/dokumen/kendali?bagian=notulen',     'Dot', 1205, 'main', (SELECT id FROM menu_items WHERE key='g-alat-dokumen'), true),
  ('kd-jadwal',      'Laporan Terjadwal', '/dokumen/kendali?bagian=jadwal',      'Dot', 1206, 'main', (SELECT id FROM menu_items WHERE key='g-alat-dokumen'), true)
ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href, icon=EXCLUDED.icon,
  sort_order=EXCLUDED.sort_order, section='main', parent_id=EXCLUDED.parent_id, is_active=true;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_ganda  TEXT;
  v_induk  TEXT;
  v_salah  TEXT;
  v_jml    INT;
BEGIN
  -- Aturan pokok migrasi 232 tetap berlaku: satu alamat, satu link.
  SELECT string_agg(href || ' (' || n || ')', ', ' ORDER BY href) INTO v_ganda
    FROM (SELECT href, count(*) n FROM menu_items
           WHERE is_active AND href IS NOT NULL
           GROUP BY href HAVING count(*) > 1) x;
  IF v_ganda IS NOT NULL THEN
    RAISE EXCEPTION '233 gagal: href dipakai lebih dari satu link: %', v_ganda;
  END IF;

  -- Induk lama WAJIB mati. Kalau ia hidup, ia jadi link tambahan yang membuka
  -- tab pertama — duplikat yang tak terdeteksi pemeriksaan href di atas karena
  -- alamatnya memang berbeda (tanpa query).
  SELECT string_agg(key, ', ' ORDER BY key) INTO v_induk
    FROM menu_items
   WHERE is_active AND key IN ('dokumen-kendali','kepatuhan','procurement-lanjutan','jadwal','akuntansi');
  IF v_induk IS NOT NULL THEN
    RAISE EXCEPTION '233 gagal: induk lama masih aktif: %', v_induk;
  END IF;

  -- Tiap sub-menu baru WAJIB punya query — tanpa itu ia menunjuk halaman
  -- induknya dan membuka tab pertama, apa pun labelnya.
  SELECT string_agg(key || '=' || href, ', ' ORDER BY key) INTO v_salah
    FROM menu_items
   WHERE is_active AND key IN (
     'jadwal-cpm','jadwal-histogram','jadwal-method',
     'akuntansi-jurnal','akuntansi-akun','akuntansi-neraca','akuntansi-besar','akuntansi-laporan',
     'pl-payung','pl-expediting','pl-nota',
     'kep-kesiapan','kep-dokumen','kep-evaluasi',
     'kd-gambar','kd-transmittal','kd-notulen','kd-jadwal')
     AND href NOT LIKE '%?%';
  IF v_salah IS NOT NULL THEN
    RAISE EXCEPTION '233 gagal: sub-menu tanpa query: %', v_salah;
  END IF;

  -- 88 - 5 induk + 18 anak = 101
  SELECT count(*) INTO v_jml FROM menu_items WHERE is_active;
  IF v_jml <> 101 THEN
    RAISE EXCEPTION '233 gagal: menu aktif %, seharusnya 101', v_jml;
  END IF;
END $$;
