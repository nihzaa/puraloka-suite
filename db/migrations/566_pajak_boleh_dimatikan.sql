-- ============================================================================
-- 566 — proyek boleh TIDAK kena pajak
-- ============================================================================
--
-- ── Yang diminta
--
-- Founder 2026-09-04: "pas bikin proyek juga bisa gapake pajak … kan pas bikin
-- proyek ada pilihan ppn perorangan atau ppn biasa, nah ada saklar on off nya".
--
-- Diukur sebelum migrasi ini:
--
--     enum tax_scheme : pph_final, ppn          ← hanya DUA, keduanya "kena"
--     dipakai         : pph_final 27 proyek
--
-- Tak ada cara menyatakan "proyek ini tidak dikenai pajak". Untuk borongan
-- kecil dan pekerjaan perorangan itu keadaan yang WAJAR, dan memaksa memilih
-- salah satu skema membuat angka RAB/invoice memuat pajak yang tak pernah
-- ditagihkan.
--
-- ── Yang dilakukan
--
-- Menambah nilai `tanpa_pajak` ke enum. BUKAN membuat kolom boolean baru:
--
--   · satu kolom, satu kebenaran. Kolom `kena_pajak` di samping `tax_scheme`
--     melahirkan keadaan mustahil (`kena_pajak=false` + `tax_scheme='ppn'`),
--     dan tiap pembaca harus tahu mana yang menang — persis bentuk cacat
--     yang berulang di repo ini (dua tabel, satu dibaca kode).
--   · pembaca lama tetap benar: 27 proyek `pph_final` tak tersentuh, dan
--     kode yang membandingkan `=== 'ppn'` tetap memulangkan false.
--
-- ⚠ `ALTER TYPE ... ADD VALUE` TIDAK bisa dijalankan di dalam transaksi pada
-- PostgreSQL < 12. Basis ini 17.6 (diukur `introspect.mjs identity`), jadi
-- aman. `IF NOT EXISTS` membuatnya idempoten.
--
-- Nilai lama TIDAK diubah dan TIDAK dihapus — menghapus nilai enum menuntut
-- membuat tipe baru dan menulis ulang seluruh kolom yang memakainya, dan
-- tak ada yang menuntut itu di sini.

ALTER TYPE tax_scheme ADD VALUE IF NOT EXISTS 'tanpa_pajak';

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_nilai INT;
  n_lama  INT;
BEGIN
  SELECT count(*) INTO n_nilai
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
   WHERE t.typname = 'tax_scheme' AND e.enumlabel = 'tanpa_pajak';
  IF n_nilai <> 1 THEN
    RAISE EXCEPTION '566 gagal: nilai tanpa_pajak tak terpasang di enum tax_scheme';
  END IF;

  /*
    Dan yang lama WAJIB masih ada. Menambah nilai tak boleh menghilangkan
    yang sudah dipakai 27 proyek — kalau ini nol, sesuatu yang jauh lebih
    besar terjadi, dan diamnya akan terbaca seperti keberhasilan.
  */
  SELECT count(*) INTO n_lama
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
   WHERE t.typname = 'tax_scheme' AND e.enumlabel IN ('pph_final', 'ppn');
  IF n_lama <> 2 THEN
    RAISE EXCEPTION '566 gagal: nilai lama hilang (pph_final/ppn tersisa %)', n_lama;
  END IF;

  RAISE NOTICE '566 OK — tax_scheme kini: pph_final, ppn, tanpa_pajak';
END $$;
