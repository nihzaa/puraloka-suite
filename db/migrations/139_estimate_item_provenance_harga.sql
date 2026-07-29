-- ============================================================
-- 139 — PROVENANCE HARGA pada estimate_items
--
-- TEMUAN (2026-07-29, saat menjawab pertanyaan founder "data yang dimasukkan ke
-- DB sudah sesuai atau belum"):
--
-- Endpoint compose item MENGHITUNG HSP dari harga yang berlaku pada
-- `price_date`, lalu MENGEMBALIKAN rinciannya ke pemanggil:
--   prices[]  → price_book_entry_id, amount, effective_date, location
--   hsp       → groupTotals, subtotalD, bukAmount, hspRaw, hspRounded
--
-- Tetapi yang DISIMPAN ke `estimate_items` hanya `amount` — angka jadinya.
-- Seluruh rincian di atas lenyap begitu response HTTP ditutup.
--
-- ------------------------------------------------------------
-- KENAPA ITU MASALAH
-- ------------------------------------------------------------
-- RAB yang sudah diteken adalah dokumen yang dipertanggungjawabkan. Setahun
-- kemudian pertanyaan yang muncul selalu bentuknya sama:
--
--   "Kenapa pasangan bata di RAB ini Rp 185.000/m², padahal RAB proyek
--    sebelah Rp 160.000?"
--
-- Tanpa provenance, jawabannya hanya bisa ditebak: mungkin harganya beda,
-- mungkin BUK-nya beda, mungkin pembulatannya. Angka `amount` sendiri tidak
-- bisa menjelaskan dirinya.
--
-- Rekonstruksi juga TIDAK bisa diandalkan: harga bisa sudah expired, dan
-- `price_date` yang dipakai saat menyusun tidak tersimpan di mana pun. Jadi
-- bahkan menghitung ulang pun tak bisa memastikan hasil yang sama.
--
-- Ini beda dengan take-off yang memang sengaja dihitung on-the-fly: take-off
-- adalah PANDANGAN, sementara item RAB adalah KEPUTUSAN yang sudah diambil.
--
-- ------------------------------------------------------------
-- YANG DISIMPAN
-- ------------------------------------------------------------
-- `price_date` + `price_location`  → konteks pemilihan harga.
-- `hsp_snapshot` (JSONB)           → seluruh rincian: harga per resource
--                                    (beserta id barisnya), subtotal per grup
--                                    tenaga/bahan/alat, BUK, pembulatan.
--
-- JSONB, bukan tabel baris-per-resource, karena ini SNAPSHOT — dibaca utuh,
-- tidak pernah di-query per-baris, dan tidak boleh ikut berubah saat katalog
-- resource disunting. Tabel relasional justru akan mengikat snapshot ke
-- baris hidup, dan itu persis yang harus dihindari.
--
-- ------------------------------------------------------------
-- LINGKUP
-- ------------------------------------------------------------
-- Kolom NULLABLE, tanpa backfill. 1.350 item yang sudah ada memang tidak punya
-- provenance — dan MENGARANGKANNYA justru lebih buruk daripada mengakui
-- kosong: angka rekonstruksi yang salah terlihat persis seperti angka asli.
-- `provenance_captured` (GENERATED) membuat perbedaan itu terbaca jelas.
-- ============================================================

ALTER TABLE estimate_items
  ADD COLUMN IF NOT EXISTS price_date     DATE,
  ADD COLUMN IF NOT EXISTS price_location TEXT,
  ADD COLUMN IF NOT EXISTS hsp_snapshot   JSONB;

COMMENT ON COLUMN estimate_items.price_date IS
  'Tanggal acuan pemilihan harga saat item disusun. Menjawab "harga kapan yang '
  'dipakai" tanpa perlu menebak dari created_at.';

COMMENT ON COLUMN estimate_items.hsp_snapshot IS
  'Snapshot rincian HSP saat item disusun: harga per resource + id baris price '
  'book, subtotal per grup (tenaga/bahan/alat), BUK, pembulatan. JSONB karena '
  'dibaca utuh dan TIDAK boleh ikut berubah saat katalog disunting.';

-- Penanda eksplisit: item lama (nol provenance) vs item baru. Tanpa ini,
-- `hsp_snapshot IS NULL` mudah disalahartikan sebagai "belum sempat dimuat".
ALTER TABLE estimate_items
  ADD COLUMN IF NOT EXISTS provenance_captured BOOLEAN
    GENERATED ALWAYS AS (hsp_snapshot IS NOT NULL) STORED;

COMMENT ON COLUMN estimate_items.provenance_captured IS
  'false = item disusun sebelum migrasi 139; rincian HSP-nya memang tidak '
  'pernah tersimpan. TIDAK di-backfill: angka rekonstruksi yang salah terlihat '
  'persis seperti angka asli.';

CREATE INDEX IF NOT EXISTS idx_estimate_items_tanpa_provenance
  ON estimate_items (estimate_version_id) WHERE hsp_snapshot IS NULL;

-- ------------------------------------------------------------
-- Verifikasi.
-- ------------------------------------------------------------
DO $$
DECLARE v_lama INT;
BEGIN
  SELECT count(*) INTO v_lama FROM estimate_items WHERE NOT provenance_captured;
  RAISE NOTICE
    '139: provenance harga aktif. % item lama tanpa snapshot (sengaja tidak '
    'di-backfill — ditandai provenance_captured = false).', v_lama;
END $$;
