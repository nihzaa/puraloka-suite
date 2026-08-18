-- ════════════════════════════════════════════════════════════════════════════
-- 455 — `sort_order` menu Klausul Kontrak bentrok dengan tetangganya
-- ════════════════════════════════════════════════════════════════════════════
--
-- Migrasi 453 memberi `md-klausul-kontrak` nilai `sort_order + 1` dari
-- `md-template-dok` (64) → **65**. Yang tak saya periksa: 65 SUDAH dipakai
-- `crm-estimating`.
--
-- ── Kenapa ini bukan cacat kosmetik
--
-- Dua item ber-`sort_order` sama membuat urutan tampilnya jatuh ke tie-break
-- `key` secara abjad. Akibatnya urutan sidebar berubah begitu ada menu baru
-- yang kebetulan namanya lebih kecil — dan yang mengubahnya bukan siapa pun
-- yang memutuskan urutan.
--
-- Orang menghafal LETAK menu, bukan namanya. Menu yang berpindah tempat
-- tanpa ada yang memindahkannya membuat orang mengira fiturnya hilang.
--
-- ── Kenapa disisipkan di 64.5, bukan menggeser seluruh sisanya
--
-- Menggeser `crm-estimating` dan `md-price-book` menyentuh dua baris yang
-- tidak bermasalah, dan tiap pergeseran adalah kesempatan baru untuk
-- bentrok. Kolomnya INTEGER, jadi "64.5" mustahil — yang dipakai: klausul
-- ditaruh TEPAT SESUDAH template dokumen dengan menggeser dua yang di
-- bawahnya satu langkah. Itu tetap perubahan minimum yang menghasilkan
-- urutan yang bisa dijelaskan (template dokumen → klausul kontrak
-- berdampingan, karena keduanya soal bunyi dokumen).
--
-- ── Kenapa penjaganya tak menangkap ini saat 453 dijalankan
--
-- `audit-sidebar-urutan.mjs` ADA dan berjalan di CI — saya tak
-- menjalankannya. Yang saya jalankan hanya penjaga yang saya kira relevan,
-- dan "yang saya kira relevan" bukan ukuran. Pelajaran yang sama dengan
-- pembuka CLAUDE.md, dalam bentuk lain.
-- ════════════════════════════════════════════════════════════════════════════

-- Geser yang di bawah lebih dulu, dari yang PALING BESAR — kalau dari yang
-- kecil, pergeserannya sendiri bertabrakan di tengah jalan.
UPDATE menu_items SET sort_order = 67, updated_at = now()
 WHERE key = 'md-price-book' AND sort_order = 66;

UPDATE menu_items SET sort_order = 66, updated_at = now()
 WHERE key = 'crm-estimating' AND sort_order = 65;

UPDATE menu_items SET sort_order = 65, updated_at = now()
 WHERE key = 'md-klausul-kontrak';

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_bentrok INT;
  v_induk   UUID;
  r         RECORD;
BEGIN
  SELECT parent_id INTO v_induk FROM menu_items WHERE key = 'md-klausul-kontrak';
  IF v_induk IS NULL THEN
    RAISE EXCEPTION '455 gagal: md-klausul-kontrak tak ada atau yatim';
  END IF;

  -- 1. Nol bentrok di SELURUH pohon, bukan cuma di grup ini. Memperbaiki satu
  --    grup sambil membiarkan grup lain bentrok berarti penjaga tetap merah
  --    dan tak ada yang tahu sebabnya berpindah.
  SELECT count(*) INTO n_bentrok FROM (
    SELECT parent_id, sort_order FROM menu_items
     WHERE is_active AND parent_id IS NOT NULL
     GROUP BY parent_id, sort_order HAVING count(*) > 1
  ) x;
  IF n_bentrok > 0 THEN
    RAISE EXCEPTION '455 gagal: masih ada % sort_order bentrok di pohon menu', n_bentrok;
  END IF;

  -- 2. Klausul TEPAT sesudah template dokumen — itu maksud penempatannya,
  --    dan tanpa memeriksanya "nol bentrok" bisa dicapai dengan urutan yang
  --    tak seorang pun inginkan.
  SELECT (SELECT sort_order FROM menu_items WHERE key = 'md-template-dok') AS tpl,
         (SELECT sort_order FROM menu_items WHERE key = 'md-klausul-kontrak') AS kls
    INTO r;
  IF r.kls <> r.tpl + 1 THEN
    RAISE EXCEPTION '455 gagal: klausul (%) tidak tepat sesudah template dokumen (%)', r.kls, r.tpl;
  END IF;

  RAISE NOTICE '455 OK — nol sort_order bentrok, klausul tepat sesudah template dokumen';
END $$;
