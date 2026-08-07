-- ════════════════════════════════════════════════════════════════════════════
-- 229 — 13 menu mendarat di puncak halaman multi-modul
--
-- ── Cacat yang diperbaiki (sisa T-3)
--
-- Empat halaman memuat beberapa modul bertumpuk ke bawah, dan menu yang
-- menunjuknya semuanya mendarat di puncak:
--
--     /dokumen/kendali       4 modul  ← 6 item menu
--     /kepatuhan             3 modul  ← 3 item menu
--     /procurement/lanjutan  3 modul  ← 3 item menu
--     /jadwal                3 modul  ← 3 item menu
--
-- Yang mengklik "Notulen Rapat" harus menggulir melewati register gambar dan
-- transmittal — kalau ia tahu harus menggulir. Yang mengklik "Nota Kredit"
-- melewati kontrak payung dan expediting dulu.
--
-- ── Kenapa tab, bukan dipecah jadi halaman terpisah
--
-- Modul-modul itu SALING DIBACA BERSAMA: transmittal merujuk register gambar
-- yang dikirimnya; nota kredit lahir dari kiriman yang diperiksa expediting;
-- izin kerja dibaca bersama kesiapan pihaknya. Memecahnya memaksa bolak-balik,
-- dan KPI di puncak halaman kehilangan gunanya karena ia meringkas SELURUH
-- modul.
--
-- Tab memberi keduanya: satu tempat, tiap modul punya alamat sendiri.
--
-- ── Yang TIDAK ikut, dan kenapa
--
-- `/aset/operasional` (4 item menu) TIDAK diberi tab. Halaman itu punya satu
-- tabel utama "Seluruh alat" yang sudah memuat meter, perawatan terdekat, DAN
-- biaya per jam sekaligus — keempat menunya (log pemakaian · perawatan ·
-- biaya operasional · penyusutan→GL) adalah empat cara menyebut tabel yang
-- sama. Memaksa tab di situ hanya memecah satu tabel jadi empat tampilan
-- yang menyembunyikan kolom satu sama lain.
--
-- ── Nilai `bagian` dibaca dari kode, bukan ditebak
--
--   /dokumen/kendali       gambar · transmittal · notulen · jadwal
--   /kepatuhan             kesiapan · dokumen · evaluasi
--   /procurement/lanjutan  payung · expediting · nota
--   /jadwal                cpm · histogram · method
--
-- Nilai di luar daftar itu DIABAIKAN halaman (sengaja — URL datang dari luar),
-- jadi salah ketik di sini akan diam-diam membuka modul pertama. Blok
-- verifikasi di bawah yang menahannya.
--
-- ── Idempoten: UPDATE menetapkan nilai akhir.
-- ════════════════════════════════════════════════════════════════════════════

-- ── /dokumen/kendali ────────────────────────────────────────────────────────
UPDATE menu_items SET href = '/dokumen/kendali?bagian=gambar'      WHERE key = 'dk-gambar';
UPDATE menu_items SET href = '/dokumen/kendali?bagian=transmittal' WHERE key = 'dk-transmittal';
UPDATE menu_items SET href = '/dokumen/kendali?bagian=notulen'     WHERE key = 'dk-notulen';
UPDATE menu_items SET href = '/dokumen/kendali?bagian=jadwal'      WHERE key = 'bi-terjadwal';

-- ── /kepatuhan ──────────────────────────────────────────────────────────────
UPDATE menu_items SET href = '/kepatuhan?bagian=kesiapan' WHERE key = 'lp-permit';
UPDATE menu_items SET href = '/kepatuhan?bagian=dokumen'  WHERE key = 'sk-kepatuhan';
UPDATE menu_items SET href = '/kepatuhan?bagian=evaluasi' WHERE key = 'sk-evaluasi';

-- ── /procurement/lanjutan ───────────────────────────────────────────────────
UPDATE menu_items SET href = '/procurement/lanjutan?bagian=payung'     WHERE key = 'pr-blanket';
UPDATE menu_items SET href = '/procurement/lanjutan?bagian=expediting' WHERE key = 'pr-expediting';
UPDATE menu_items SET href = '/procurement/lanjutan?bagian=nota'       WHERE key = 'tg-nota-kredit';

-- ── /jadwal ─────────────────────────────────────────────────────────────────
UPDATE menu_items SET href = '/jadwal?bagian=cpm'       WHERE key = 'jd-cpm';
UPDATE menu_items SET href = '/jadwal?bagian=histogram' WHERE key = 'jd-histogram';
UPDATE menu_items SET href = '/jadwal?bagian=method'    WHERE key = 'jd-method';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_hilang TEXT;
  v_salah  TEXT;
  v_kunci  TEXT[] := ARRAY[
    'dk-gambar','dk-transmittal','dk-notulen','bi-terjadwal',
    'lp-permit','sk-kepatuhan','sk-evaluasi',
    'pr-blanket','pr-expediting','tg-nota-kredit',
    'jd-cpm','jd-histogram','jd-method'];
BEGIN
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_hilang
    FROM unnest(v_kunci) AS k
   WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.key = k);
  IF v_hilang IS NOT NULL THEN
    RAISE EXCEPTION '229 gagal: key menu tidak ada: %', v_hilang;
  END IF;

  -- Nilai `bagian` di luar daftar sah akan DIABAIKAN halaman tanpa satu pun
  -- galat, dan menunya diam-diam membuka modul pertama — persis cacat yang
  -- migrasi ini perbaiki.
  SELECT string_agg(key || ' -> ' || href, ', ' ORDER BY key) INTO v_salah
    FROM menu_items
   WHERE key = ANY(v_kunci)
     AND NOT (
       (href LIKE '/dokumen/kendali?bagian=%'      AND split_part(href, 'bagian=', 2) IN ('gambar','transmittal','notulen','jadwal'))
       OR (href LIKE '/kepatuhan?bagian=%'         AND split_part(href, 'bagian=', 2) IN ('kesiapan','dokumen','evaluasi'))
       OR (href LIKE '/procurement/lanjutan?bagian=%' AND split_part(href, 'bagian=', 2) IN ('payung','expediting','nota'))
       OR (href LIKE '/jadwal?bagian=%'            AND split_part(href, 'bagian=', 2) IN ('cpm','histogram','method')));
  IF v_salah IS NOT NULL THEN
    RAISE EXCEPTION '229 gagal: bagian di luar daftar sah: %', v_salah;
  END IF;
END $$;
