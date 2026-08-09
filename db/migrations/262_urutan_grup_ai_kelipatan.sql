-- ============================================================================
-- 262 — sort_order grup "AI & Otomasi" jadi KELIPATAN 50 (S-4)
-- ============================================================================
--
-- Migrasi 253 memberinya 185 dengan alasan yang masuk akal saat itu: "tepat
-- SEBELUM Administrasi (190)". Tapi 190 ternyata bukan urutan Administrasi
-- yang berlaku — diukur dari basis 2026-08-10, `g-administrasi` ada di 1600,
-- dan seluruh grup lain memakai kelipatan 100.
--
-- Penjaga `uji-sidebar-struktur` (aturan S-4, `STRUKTUR-SIDEBAR-ERP.md`)
-- menolak 185 dengan benar. Angka di luar kisi membuat penyisipan grup
-- berikutnya harus menebak celah, dan tebakan itu yang melahirkan urutan
-- sidebar yang perlahan tak bisa dibaca.
--
-- 150 dipilih, bukan 100 atau 200: keduanya sudah terpakai (`g-master` dan
-- `g-proyek`/`g-crm`), sementara 150 kosong DAN mempertahankan posisi yang
-- sekarang — AI & Otomasi tetap di antara Master Data dan Proyek, persis
-- seperti yang sudah dilihat di layar.
--
-- Migrasi 253 TIDAK diedit (§5.5). Ini migrasi maju.
-- ============================================================================

UPDATE menu_items SET sort_order = 150 WHERE key = 'g-ai' AND parent_id IS NULL;

DO $$
DECLARE n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'g-ai' AND sort_order = 150) THEN
    RAISE EXCEPTION '262 gagal: g-ai tidak jadi 150';
  END IF;

  /*
   * S-4 untuk GRUP — yaitu induk yang benar-benar punya anak.
   *
   * Cakupannya sengaja dibatasi begitu, dan itu hasil pengukuran: versi
   * pertama blok ini memeriksa SEMUA `parent_id IS NULL` dan langsung merah
   * karena `beranda` (sort_order 10). `beranda` bukan grup — ia menu tunggal
   * tanpa anak, dan penjaga `uji-sidebar-struktur` pun tak menghitungnya.
   *
   * Pemeriksaan yang lebih ketat dari aturannya bukan kehati-hatian; ia
   * memaksa perubahan yang tak diminta siapa pun (menggeser Beranda ke 50)
   * demi menghijaukan blok verifikasi yang salah kalibrasi.
   */
  SELECT count(*) INTO n
    FROM menu_items g
   WHERE g.parent_id IS NULL AND g.is_active
     AND EXISTS (SELECT 1 FROM menu_items a WHERE a.parent_id = g.id)
     AND g.sort_order % 50 <> 0;
  IF n > 0 THEN
    RAISE EXCEPTION '262 gagal: masih ada % grup dengan sort_order bukan kelipatan 50', n;
  END IF;

  -- Posisinya harus TETAP antara Master Data dan Proyek — perbaikan kisi tak
  -- boleh diam-diam memindahkan menu yang sudah dikenal penggunanya.
  IF NOT (
    (SELECT sort_order FROM menu_items WHERE key = 'g-master') < 150
    AND (SELECT min(sort_order) FROM menu_items WHERE key IN ('g-proyek', 'g-crm')) > 150
  ) THEN
    RAISE EXCEPTION '262 gagal: posisi g-ai bergeser dari antara Master Data dan Proyek';
  END IF;
END $$;
