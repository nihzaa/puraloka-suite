-- ════════════════════════════════════════════════════════════════════════════
-- 225 — Satu halaman, dua nama berbeda di dua navigasi yang tampil bersamaan
--
-- ── Cacat yang diperbaiki (T-4)
--
-- Delapan halaman punya nama berbeda di sidebar dan di tab-bagian — dan
-- keduanya tampil di layar yang SAMA:
--
--     halaman                sidebar                     tab
--     /kontrak/rfi           Request for Information     RFI
--     /lapangan/inspeksi     Request for Inspection      Inspeksi
--     /lapangan/submittal    Submittal Register          Submittal
--     /kontrak/asuransi      Register Asuransi           Asuransi
--     /mandor/retensi        Retensi Subkon              Retensi
--     /mandor/tender         Tender Subkontraktor        Tender
--     /mandor/absensi        Absensi Lapangan            Absensi
--     /keuangan/contingency  Manajemen Contingency       Contingency
--
-- Orang yang diberi tahu "buka RFI" mencarinya di sidebar dan menemukan
-- "Request for Information" — kalau ia tahu singkatannya. Kalau tidak, ia
-- menyimpulkan RFI tak ada. Nama yang tak disepakati membuat aplikasi terasa
-- seperti dua produk yang ditempel.
--
-- ── Arah perbaikan: sidebar mengikuti tab, bukan sebaliknya
--
-- Tab hidup DI DALAM bagiannya, jadi "Retensi" di bawah judul Mandor sudah
-- lengkap maknanya — menambahkan "Subkon" hanya mengulang konteks yang sudah
-- terbaca. Sidebar memang tak punya konteks itu, tapi ia punya KELOMPOK:
-- "Retensi" berada di bawah kelompok "Mandor & Subkon". Konteksnya ada, hanya
-- di tempat lain.
--
-- Dan nama panjang punya biaya nyata di sidebar: lebarnya tetap ~200px, jadi
-- "Request for Information" terpotong jadi "Request for Informat…" — nama
-- panjang yang tak pernah terbaca utuh adalah nama panjang yang sia-sia.
--
-- ── Yang TIDAK diubah
--
-- "Punch List" dan "Supplier" sudah sama di kedua sisi. "Absensi Lapangan"
-- (mb-absensi, kelompok Aplikasi Lapangan) dibiarkan panjang: ia BUKAN halaman
-- yang sama dengan sk-absensi, dan justru butuh pembeda.
--
-- ── Key dibaca dari DB, bukan ditebak dari nama halaman
--
-- Versi pertama menebak `qc-inspeksi`/`qc-submittal` dari nama kelompok Mutu.
-- Keduanya TAK ADA: key sebenarnya `lp-rfi` dan `lp-submittal` (kelompok
-- Lapangan). Blok verifikasi menangkapnya sebelum migrasi dijalankan — dan
-- tanpa pemeriksaan itu, UPDATE mengenai nol baris tanpa satu pun galat.
--
-- ── Idempoten: UPDATE menetapkan nilai akhir.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items SET label = 'RFI'          WHERE key = 'kt-rfi';
UPDATE menu_items SET label = 'Inspeksi'     WHERE key = 'lp-rfi';
UPDATE menu_items SET label = 'Submittal'    WHERE key = 'lp-submittal';
UPDATE menu_items SET label = 'Asuransi'     WHERE key = 'kt-asuransi';
UPDATE menu_items SET label = 'Retensi'      WHERE key = 'sk-retensi';
UPDATE menu_items SET label = 'Tender'       WHERE key = 'sk-tender';
UPDATE menu_items SET label = 'Contingency'  WHERE key = 'cc-contingency';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_hilang TEXT;
  v_beda   TEXT;
  -- key -> label yang WAJIB terpasang, sama persis dengan label tab-nya.
  v_key   TEXT[] := ARRAY['kt-rfi','lp-rfi','lp-submittal','kt-asuransi',
                          'sk-retensi','sk-tender','cc-contingency'];
  v_label TEXT[] := ARRAY['RFI','Inspeksi','Submittal','Asuransi',
                          'Retensi','Tender','Contingency'];
BEGIN
  SELECT string_agg(k, ', ' ORDER BY k) INTO v_hilang
    FROM unnest(v_key) AS k
   WHERE NOT EXISTS (SELECT 1 FROM menu_items mi WHERE mi.key = k);
  IF v_hilang IS NOT NULL THEN
    RAISE EXCEPTION '225 gagal: key menu tidak ada: %', v_hilang;
  END IF;

  SELECT string_agg(k || '=' || COALESCE(mi.label, '(null)'), ', ' ORDER BY k)
    INTO v_beda
    FROM unnest(v_key, v_label) AS t(k, l)
    JOIN menu_items mi ON mi.key = t.k
   WHERE mi.label IS DISTINCT FROM t.l;
  IF v_beda IS NOT NULL THEN
    RAISE EXCEPTION '225 gagal: label tidak seperti yang dimaksud: %', v_beda;
  END IF;
END $$;
