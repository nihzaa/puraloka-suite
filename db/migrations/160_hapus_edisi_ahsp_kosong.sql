-- Migration 160: hapus edisi AHSP yang tak punya isi — keputusan founder
--
-- ══════════════════════════════════════════════════════════════════════════
-- KEPUTUSAN
-- ══════════════════════════════════════════════════════════════════════════
--
-- ROADMAP #20 (laporan perbandingan antar-edisi) TERBLOKIR karena dari tiga
-- edisi di `ahsp_editions`, hanya SATU yang berisi:
--   SE-47-2026  → 2.620 analisa
--   SE-68-2024  → 0
--   SNI-2013    → 0
--
-- Founder menyatakan (2026-08-01, verbatim): **"workbook AHSP SE-68-2024 /
-- SNI-2013 gapunya, hapus aja"**.
--
-- Dua baris kosong itu bukan sekadar tak berguna — ia AKTIF MENYESATKAN.
-- Halaman estimasi menampilkan dropdown edisi dari tabel ini, jadi seseorang
-- bisa memilih "SNI-2013", menyimpan estimasi, lalu heran kenapa tak ada satu
-- pun analisa yang muncul. Bukti bahwa itu bukan kekhawatiran teoretis: DUA
-- `estimate_versions` sudah terlanjur menunjuk keduanya.
--
-- ══════════════════════════════════════════════════════════════════════════
-- YANG IKUT TERHAPUS — diperiksa satu per satu, bukan diasumsikan
-- ══════════════════════════════════════════════════════════════════════════
--
-- `estimate_versions` yang merujuk kedua edisi itu (diukur 2026-08-01):
--   SE-68-2024 → 1 versi · status `draft` · total Rp 0 · dibuat 31 Jul 2026
--   SNI-2013   → 1 versi · status `draft` · total Rp 0 · dibuat 31 Jul 2026
--
-- Keduanya draft bernilai NOL, dibuat saat membangun sumbu edisi — residu
-- percobaan, bukan pekerjaan siapa pun. Kalau salah satunya bernilai > 0 atau
-- berstatus selain draft, migrasi ini MENOLAK jalan (lihat blok verifikasi):
-- menghapus estimasi yang pernah dipakai orang bukan keputusan yang boleh
-- diambil migrasi.
--
-- ── Kenapa migrasi, bukan `DELETE` sekali-pakai
--
-- Karena penghapusannya harus punya jejak dan syarat. Skrip sekali-pakai
-- `DELETE FROM` tanpa syarat adalah persis cacat yang ditemukan hari ini di
-- `cleanup-cecep-residue.mjs` — ia benar saat ditulis lalu berbahaya enam
-- bulan kemudian. Di sini syaratnya ditegakkan tiap kali migrasi dijalankan.

BEGIN;

-- ── Penjaga: hanya boleh menghapus yang BENAR-BENAR kosong & tak terpakai ───
DO $$
DECLARE n INT; rec RECORD;
BEGIN
  -- 1. Edisi yang mau dihapus harus benar-benar NOL analisa. Kalau workbook-nya
  --    ternyata sudah diimpor belakangan, migrasi ini tak boleh menghapusnya.
  SELECT count(*) INTO n
    FROM ahsp_editions e
   WHERE e.code IN ('SE-68-2024', 'SNI-2013')
     AND EXISTS (SELECT 1 FROM assemblies a WHERE a.edition_id = e.id);
  IF n > 0 THEN
    RAISE EXCEPTION '160 TOLAK: % edisi target ternyata SUDAH BERISI analisa. '
      'Workbook-nya rupanya sudah diimpor — jangan hapus.', n;
  END IF;

  -- 2. Estimasi yang merujuk harus draft DAN bernilai nol. Estimasi yang pernah
  --    dipakai orang tak boleh hilang karena membersihkan edisi.
  FOR rec IN
    SELECT ev.id, ev.status, ev.total_amount, e.code
      FROM estimate_versions ev
      JOIN ahsp_editions e ON e.id = ev.edition_id
     WHERE e.code IN ('SE-68-2024', 'SNI-2013')
       AND (ev.status <> 'draft' OR COALESCE(ev.total_amount, 0) <> 0)
  LOOP
    RAISE EXCEPTION '160 TOLAK: estimate_version % (edisi %) berstatus % bernilai % '
      '— bukan residu. Pindahkan dulu ke edisi lain sebelum menghapus.',
      rec.id, rec.code, rec.status, rec.total_amount;
  END LOOP;
END $$;

-- ── Hapus ───────────────────────────────────────────────────────────────────
-- Urutan FK-safe: item → versi → edisi.
DELETE FROM estimate_items
 WHERE estimate_version_id IN (
   SELECT ev.id FROM estimate_versions ev
     JOIN ahsp_editions e ON e.id = ev.edition_id
    WHERE e.code IN ('SE-68-2024', 'SNI-2013'));

DELETE FROM estimate_versions
 WHERE edition_id IN (SELECT id FROM ahsp_editions WHERE code IN ('SE-68-2024', 'SNI-2013'));

DELETE FROM ahsp_editions WHERE code IN ('SE-68-2024', 'SNI-2013');

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM ahsp_editions WHERE code IN ('SE-68-2024', 'SNI-2013');
  IF n > 0 THEN
    RAISE EXCEPTION '160 GAGAL: % edisi kosong masih tersisa', n;
  END IF;

  -- Edisi yang BERISI harus tetap utuh — ini bukan pembersihan menyeluruh.
  SELECT count(*) INTO n FROM assemblies a
    JOIN ahsp_editions e ON e.id = a.edition_id WHERE e.code = 'SE-47-2026';
  IF n < 2600 THEN
    RAISE EXCEPTION '160 GAGAL: analisa SE-47-2026 tinggal % (harusnya ~2.620) '
      '— ada yang ikut terhapus', n;
  END IF;

  SELECT count(*) INTO n FROM ahsp_editions;
  IF n <> 1 THEN
    RAISE EXCEPTION '160 GAGAL: tersisa % edisi (harusnya tepat 1)', n;
  END IF;

  RAISE NOTICE '160 OK: 2 edisi kosong dihapus; SE-47-2026 utuh';
END $$;

COMMIT;
