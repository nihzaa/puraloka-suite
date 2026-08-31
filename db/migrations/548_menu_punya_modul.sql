-- ============================================================================
-- 548 — MENU tahu modul apa yang membukanya
-- ============================================================================
--
-- Gerbang modul (migrasi 544 + `gerbang-modul.ts`) sudah menolak permintaan API
-- dengan 402. Yang belum: pengguna tak diberi tahu APA yang tertutup dan
-- KENAPA. Ia mengklik menu, halamannya gagal memuat, dan kesimpulan yang
-- paling wajar adalah "aplikasinya rusak".
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA DIGEMBOK, BUKAN DISEMBUNYIKAN
-- ══════════════════════════════════════════════════════════════════════════
--
-- Godaannya menyembunyikan menu modul yang tertutup — layarnya jadi rapi, dan
-- tak ada yang mengklik sesuatu yang tak bisa dibuka.
--
-- Itu keliru, dan riset praktik industri (2026-08-31) menyebut sebabnya:
-- menyembunyikan membuat pengguna tak pernah TAHU fitur itu ada. Ia
-- menyimpulkan produk ini tak punya akuntansi, lalu mencari produk lain yang
-- punya. **Menyembunyikan mengubah peluang menjual jadi alasan berhenti
-- berlangganan.**
--
-- Yang benar: menunya TETAP TAMPIL, bergembok, dan mengarah ke halaman yang
-- menyebut modul apa, paket apa, dan apa gunanya.
--
-- Ini juga penting untuk basis pengguna produk ini secara khusus. CLAUDE.md
-- §8a.3 mencatat banyak pengguna berliterasi digital rendah — merekalah yang
-- paling tak mungkin menebak bahwa ada sesuatu yang tersembunyi dan bisa
-- dibeli.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA DI GRUP, BUKAN DI TIAP ITEM
-- ══════════════════════════════════════════════════════════════════════════
--
-- `menu_items` berisi 418 baris; grup induknya 29 yang aktif. Memetakan 418
-- item satu per satu berarti 418 kesempatan salah, dan yang salah tak
-- bergejala — item yang lupa dipetakan tetap terbuka meski modulnya tertutup.
--
-- Modul dijual per-grup (pelanggan membeli "Akuntansi", bukan "Jurnal Umum"),
-- jadi grup adalah satuan yang benar. Anak mewarisi induknya; kolom ini tetap
-- boleh diisi di tingkat anak untuk kasus yang menyimpang.
--
-- ⚠ Pemetaan di bawah DIUKUR ke basis (label + jumlah anak), bukan ditebak
-- dari nama. Beberapa grup punya kembaran yang sudah dinonaktifkan
-- (`g-gudang` vs `g-inventory`, `g-pengadaan` vs `g-procurement`) — memetakan
-- yang salah berarti memetakan grup yang tak pernah tampil.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS modul_kunci TEXT;

COMMENT ON COLUMN menu_items.modul_kunci IS
  'Kunci modul yang membuka menu ini (mis. modul.akuntansi). NULL = tak dijual per-modul (pondasi: master data, klien, kalender) atau jalur pemulihan. Diisi di GRUP; anak mewarisi.';

CREATE INDEX IF NOT EXISTS idx_menu_modul ON menu_items (modul_kunci)
  WHERE modul_kunci IS NOT NULL;

-- ── Pemetaan grup → modul ───────────────────────────────────────────────────
--
-- Hanya grup yang BERBAYAR yang dipetakan. Yang tak disebut di sini sengaja
-- NULL, dan itu berarti terbuka:
--
--   g-master      Master Data    pondasi — estimasi tanpa AHSP & price book
--                                bukan estimasi yang dibatasi, ia RUSAK
--   g-administrasi, g-sistem     jalur pemulihan — pelanggan yang ingin
--                                membayar harus selalu bisa membayar
--   beranda, g-mobile            selalu terbuka
--   g-proyek                     tulang punggung; menutupnya membunuh aplikasi
--   g-tagih, g-crm               penagihan & pra-konstruksi menyentuh klien
--                                dan kontrak; belum layak dijual terpisah

UPDATE menu_items SET modul_kunci = 'modul.akuntansi'     WHERE key = 'g-akuntansi';
UPDATE menu_items SET modul_kunci = 'modul.keuangan'      WHERE key = 'g-keuangan';
UPDATE menu_items SET modul_kunci = 'modul.rap'           WHERE key = 'g-cost';
UPDATE menu_items SET modul_kunci = 'modul.estimasi'      WHERE key = 'g-anggaran';
UPDATE menu_items SET modul_kunci = 'modul.kontrak'       WHERE key = 'g-kontrak';
UPDATE menu_items SET modul_kunci = 'modul.jadwal'        WHERE key = 'g-jadwal';
UPDATE menu_items SET modul_kunci = 'modul.lapangan'      WHERE key = 'g-lapangan';
UPDATE menu_items SET modul_kunci = 'modul.pengadaan'     WHERE key = 'g-procurement';
UPDATE menu_items SET modul_kunci = 'modul.gudang'        WHERE key = 'g-inventory';
UPDATE menu_items SET modul_kunci = 'modul.mandor'        WHERE key = 'g-subkon';
UPDATE menu_items SET modul_kunci = 'modul.sdm'           WHERE key = 'g-hr';
UPDATE menu_items SET modul_kunci = 'modul.alat'          WHERE key = 'g-aset';
UPDATE menu_items SET modul_kunci = 'modul.dokumen'       WHERE key = 'g-dokumen';
UPDATE menu_items SET modul_kunci = 'modul.risiko'        WHERE key = 'g-risiko';
UPDATE menu_items SET modul_kunci = 'modul.bi'            WHERE key IN ('g-laporan', 'g-pelaporan');
UPDATE menu_items SET modul_kunci = 'modul.ai'            WHERE key = 'g-ai';
UPDATE menu_items SET modul_kunci = 'modul.crm'           WHERE key = 'g-crm-tender';

-- ⚠ TIGA grup mutu, DUA modul — cermin keputusan founder 2026-08-31.
--
-- `g-qaqc` (Rencana & Uji Mutu) dan `g-mutu-kepatuhan` (Mutu & K3) sama-sama
-- ke `modul.uji_mutu`: keduanya QA/QC, dan `g-mutu-kepatuhan` isinya cuma
-- NCR + inspeksi yang SUDAH terdaftar di `g-qaqc`. Memberinya kunci berbeda
-- akan membuat satu pintu tetap terbuka saat pintu lain ditutup.
UPDATE menu_items SET modul_kunci = 'modul.uji_mutu'      WHERE key IN ('g-qaqc', 'g-mutu-kepatuhan');
UPDATE menu_items SET modul_kunci = 'modul.k3_lingkungan' WHERE key = 'g-hse';

-- ============================================================================
-- VERIFIKASI
-- ============================================================================
DO $$
DECLARE
  v_kolom INT; v_terpetakan INT; v_hantu TEXT; v_grup_hilang TEXT;
BEGIN
  SELECT count(*) INTO v_kolom FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'menu_items'
     AND column_name = 'modul_kunci';
  IF v_kolom <> 1 THEN
    RAISE EXCEPTION '548 gagal: kolom modul_kunci tak terpasang';
  END IF;

  SELECT count(*) INTO v_terpetakan FROM menu_items WHERE modul_kunci IS NOT NULL;
  IF v_terpetakan < 19 THEN
    RAISE EXCEPTION '548 gagal: cuma % menu terpetakan, harap >= 19. Grup yang key-nya salah tulis tak akan ter-UPDATE, dan diamnya berarti modul itu TAK PERNAH digembok.', v_terpetakan;
  END IF;

  -- Kunci yang tak ada di katalog akan menggembok menu selamanya: gerbang
  -- mencari kunci yang tak pernah diberikan siapa pun, dan tak ada yang bisa
  -- membukanya dari layar mana pun.
  SELECT string_agg(DISTINCT m.modul_kunci, ', ') INTO v_hantu
    FROM menu_items m
   WHERE m.modul_kunci IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM plan_features f WHERE f.key = m.modul_kunci);
  IF v_hantu IS NOT NULL THEN
    RAISE EXCEPTION '548 gagal: kunci modul tak dikenal katalog: %', v_hantu;
  END IF;

  -- Grup yang DISEBUT pemetaan tapi tak ada di basis: UPDATE-nya diam, dan
  -- modulnya tak pernah tergembok tanpa satu pun gejala.
  SELECT string_agg(k, ', ') INTO v_grup_hilang
    FROM unnest(ARRAY[
      'g-akuntansi','g-keuangan','g-cost','g-anggaran','g-kontrak','g-jadwal',
      'g-lapangan','g-procurement','g-inventory','g-subkon','g-hr','g-aset',
      'g-dokumen','g-risiko','g-laporan','g-ai','g-crm-tender','g-qaqc','g-hse'
    ]) AS k
   WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = k);
  IF v_grup_hilang IS NOT NULL THEN
    RAISE EXCEPTION '548 gagal: grup menu tak ditemukan: %', v_grup_hilang;
  END IF;

  RAISE NOTICE '548 OK — % menu bermodul, nol kunci hantu', v_terpetakan;
END $$;
