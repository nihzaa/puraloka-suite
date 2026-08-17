-- ════════════════════════════════════════════════════════════════════════════
-- 443 — lima menu CECEP menggantung di AKAR pohon, tanpa grup induk
--
-- ── Gejalanya: ubin judul berisi TITIK, bukan lambang modul
--
-- Terlihat di tangkapan layar /estimasi/rap: ubin gradien 40px di sebelah
-- judul berisi satu titik kecil. Bandingkan /estimasi yang menampilkan
-- kalkulator.
--
-- ── Sebabnya BUKAN ikonnya
--
-- Seluruh sub-menu memang ber-ikon `Dot` sejak migrasi 360 — itu disengaja.
-- `judul-bagian.tsx` menanganinya: sub-menu ber-`Dot` memakai ikon GRUP
-- INDUKNYA, karena titik di ubin besar tak mengabarkan apa pun sedangkan
-- lambang modul menjawab "saya masih di bagian mana?".
--
-- Yang gagal adalah pencarian induknya. Diukur lewat `GET /api/v1/menu`:
--
--     /estimasi        jalur = g-anggaran > estimasi   ✓ punya induk
--     /estimasi/rap    jalur = cc-rap                  ✗ DI AKAR
--     /estimasi/varians jalur = cc-varians             ✗ DI AKAR
--
-- `parent_id` kelimanya menunjuk grup yang `is_active = false` (g-cost,
-- g-crm, g-master), sehingga rute menu membuangnya dari pohon dan anaknya
-- naik jadi node akar. Node akar tak punya induk, jadi `ikonUntuk()`
-- memulangkan null.
--
-- Ini cacat yang DIBANGUNKAN migrasi 441: sebelum itu kelimanya `is_active =
-- false` dan tak pernah dirender, jadi induk mati tak pernah jadi masalah.
-- Menyalakan anak tanpa memeriksa induknya adalah kelas cacat tersendiri.
--
-- ── Kenapa dipindah, bukan grup lamanya yang dinyalakan
--
-- Menyalakan g-cost/g-crm/g-master akan memunculkan TIGA grup baru di sidebar
-- berisi menu-menu lain yang memang sengaja dimatikan — perubahan navigasi
-- jauh lebih luas daripada cacat yang sedang diperbaiki, dan tak seorang pun
-- memintanya.
--
-- Grup tujuan dibaca dari DB (2026-08-17), bukan ditebak:
--
--     g-anggaran     aktif, ikon Calculator, sudah memuat `estimasi`
--                    → rumah yang benar untuk RAP/Kas/Varians
--     g-master-data  aktif, 3 anak /master/* yang sudah tampil benar
--                    → rumah yang benar untuk katalog AHSP + price book
--
-- `sort_order` disisipkan sesudah anggota yang ada (g-anggaran berhenti di
-- 503) supaya urutan lama tak bergeser.
--
-- ── Idempoten
--
-- `UPDATE ... WHERE key = ...` menetapkan nilai akhir. Dijalankan berapa kali
-- pun hasilnya sama.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Kerja per proyek → Estimasi & Anggaran ─────────────────────────────────
UPDATE menu_items SET parent_id = (SELECT id FROM menu_items WHERE key = 'g-anggaran'),
                      sort_order = 504
 WHERE key = 'cc-rap';
UPDATE menu_items SET parent_id = (SELECT id FROM menu_items WHERE key = 'g-anggaran'),
                      sort_order = 505
 WHERE key = 'cc-cashflow';
UPDATE menu_items SET parent_id = (SELECT id FROM menu_items WHERE key = 'g-anggaran'),
                      sort_order = 506
 WHERE key = 'cc-varians';

-- ── Master data lintas proyek → Master Data ────────────────────────────────
UPDATE menu_items SET parent_id = (SELECT id FROM menu_items WHERE key = 'g-master-data')
 WHERE key IN ('crm-estimating', 'md-price-book');

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI — migrasi ini GAGAL bila masih ada menu aktif yang yatim
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tanpa_induk text;
  v_induk_mati  text;
  v_kunci text[] := ARRAY['cc-rap','cc-cashflow','cc-varians',
                          'crm-estimating','md-price-book'];
BEGIN
  -- 1. parent_id NULL berarti node akar — persis keadaan yang diperbaiki.
  SELECT string_agg(key, ', ' ORDER BY key) INTO v_tanpa_induk
    FROM menu_items WHERE key = ANY(v_kunci) AND parent_id IS NULL;

  IF v_tanpa_induk IS NOT NULL THEN
    RAISE EXCEPTION '443 gagal: menu tanpa induk (ikon judul akan kosong): %', v_tanpa_induk;
  END IF;

  -- 2. Induk yang ADA tetapi MATI sama saja dengan tak punya induk: rute
  --    menu membuangnya dari pohon, dan anaknya naik jadi node akar lagi.
  --    Pemeriksaan (1) sendirian akan lolos pada keadaan itu — inilah cacat
  --    yang membuat migrasi ini perlu ditulis.
  SELECT string_agg(c.key || ' → ' || p.key, ', ' ORDER BY c.key) INTO v_induk_mati
    FROM menu_items c JOIN menu_items p ON p.id = c.parent_id
   WHERE c.key = ANY(v_kunci) AND c.is_active AND NOT p.is_active;

  IF v_induk_mati IS NOT NULL THEN
    RAISE EXCEPTION '443 gagal: induk tidak aktif (anak jatuh ke akar): %', v_induk_mati;
  END IF;
END $$;
