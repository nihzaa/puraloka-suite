-- ============================================================================
-- 591 — TIGA harga yang satuannya salah, dikoreksi lewat VERSI BARU
--
-- Lanjutan 590. Yang itu hanya menyentuh baris kg yang harganya IDENTIK
-- dengan pasangan m3-nya — pola yang bisa dikenali tanpa menebak apa pun.
-- Ketiga di bawah lolos dari saringan itu sebab angkanya TIDAK identik
-- dengan pasangannya; yang salah tetap satuannya.
--
-- Sumber koreksinya BUKAN perhitungan: dataset SE-47 memuat baris yang sama
-- dalam satuan yang benar, dan itulah yang dipakai. Tak ada densitas yang
-- ditebak di migrasi ini.
--
--   AHSP-R0109  Agregat kasar          kg  385.000 → 285,19
--   AHSP-R0175  Ijuk                   kg   39.700 →  7.000
--   AHSP-R0465  Besi strip (0,2x2) cm  m1   15.000 →  5.000
--
-- ── Kenapa ini uang, bukan kerapian
--
-- `Agregat kasar` dipakai LIMA analisa beton siklop yang koefisiennya dalam
-- kg. Dengan harga per-m3 di baris kg:
--
--     Pembuatan 1 m3 pondasi beton siklop
--     706 kg x Rp 385.000 = Rp 271.810.000   untuk SATU m3 beton
--
-- Sesudah koreksi: 706 x 285,19 = Rp 201.341. Kelas cacat yang sama dengan
-- yang dijaga `audit-harga-satuan-waras.mjs` (1 m3 beton Rp 626 juta), dan
-- ia lolos justru karena penjaga itu mencari harga IDENTIK lintas satuan —
-- di sini angkanya cuma ada satu, jadi tak ada yang bisa dibandingkan.
--
-- Dua lainnya diverifikasi terpisah, dan keduanya konsisten secara fisik:
--
--     Agregat kasar  385.000 / 285,19  = 1.350 kg/m3  (agregat kasar wajar)
--     Besi strip     0,2x2 cm = 0,314 kg/m; 0,314 x 15.000 = 4.710 ~ 5.000
--
-- ── Yang SENGAJA tak disentuh
--
-- `AHSP-R0110 Bentonite` (m3 Rp 25.000, kg Rp 20.000.000) TIDAK dikoreksi,
-- alasan yang sama dengan blok serupa di 590: itu bukan satuan yang salah
-- melainkan dua BENTUK barang (bubur vs bubuk). Mengoreksinya akan merusak
-- baris yang benar.
--
-- ── Cara koreksinya
--
-- `fn_price_book_immutable` melarang UPDATE `amount` pada baris `active`,
-- dan aturan itu benar: angka yang sudah dipakai menyusun RAB tak boleh
-- bergeser di belakang orang yang memakainya. Jalur sahnya sama dengan 590 —
-- yang lama jadi `expired`, yang baru lahir `version_number + 1` `active`.
--
-- Jejak verifikasinya DIWARISI dari baris yang digantikan (`created_by` /
-- `verified_by` milik versi lama), sama seperti 590 — bukan dicari dari
-- "admin aktif tertua".
--
-- ⚠ Versi pertama migrasi ini MENCARI admin aktif dan `RAISE EXCEPTION` bila
-- tak ada. Itu satu-satunya migrasi di repo yang bergantung pada ADANYA baris
-- users tertentu, dan CI memutar rantai migrasi dari NOL: bila 591 kebetulan
-- replay sebelum seed pengguna, SELURUH rantai gagal — dan galatnya menuduh
-- migrasi ini, bukan urutannya. Mewarisi dari baris yang digantikan
-- menghilangkan ketergantungan itu sekaligus memberi provenance yang lebih
-- benar: versi baru menunjuk verifier ASLI harganya.
--
-- IDEMPOTEN: hanya menyentuh baris yang amount-nya MASIH nilai lama.
-- Jalan kedua tak menemukan apa pun.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  r          record;
  n_ubah     int := 0;
  n_sisa     int;
  koreksi    jsonb := jsonb_build_array(
    jsonb_build_object('code', 'AHSP-R0109', 'lama', 385000,   'baru', 285.185185185185),
    jsonb_build_object('code', 'AHSP-R0175', 'lama',  39700,   'baru', 7000),
    jsonb_build_object('code', 'AHSP-R0465', 'lama',  15000,   'baru', 5000)
  );
BEGIN
  FOR r IN SELECT * FROM jsonb_to_recordset(koreksi)
             AS x(code text, lama numeric, baru numeric)
  LOOP
    -- Yang lama: hanya status yang berubah. `expired_date` adalah atribut
    -- beku menurut trigger yang sama, jadi ia TIDAK ikut disentuh — pelajaran
    -- yang sudah dibayar sekali di sesi ini (penolakan trigger kedua).
    UPDATE price_book_entries b
       SET status = 'expired'
      FROM resources rs
     WHERE rs.id = b.resource_id
       AND rs.code = r.code
       AND b.status = 'active'
       AND b.amount = r.lama;

    IF FOUND THEN
      INSERT INTO price_book_entries
        (resource_id, amount, currency, version_number, effective_date,
         location, status, company_id, created_by, verified_by, verified_at,
         confidence_level)
      SELECT b.resource_id, r.baru, b.currency,
             (SELECT COALESCE(max(v.version_number), 0) + 1
                FROM price_book_entries v WHERE v.resource_id = b.resource_id),
             b.effective_date, b.location, 'active', b.company_id,
             b.created_by, b.verified_by, now(), b.confidence_level
        FROM price_book_entries b
        JOIN resources rs ON rs.id = b.resource_id
       WHERE rs.code = r.code AND b.status = 'expired' AND b.amount = r.lama
       ORDER BY b.version_number DESC
       LIMIT 1;

      n_ubah := n_ubah + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '591: % harga dikoreksi lewat versi baru', n_ubah;

  -- Invarian: ketiganya tak boleh lagi berharga nilai LAMA-nya di baris
  -- aktif. Dinyatakan di basis supaya migrasi ini tak bisa lolos sambil
  -- meninggalkan pekerjaannya setengah.
  SELECT count(*) INTO n_sisa
    FROM price_book_entries b
    JOIN resources rs ON rs.id = b.resource_id
    JOIN jsonb_to_recordset(koreksi) AS k(code text, lama numeric, baru numeric)
      ON k.code = rs.code
   WHERE b.status = 'active' AND b.amount = k.lama;

  IF n_sisa > 0 THEN
    RAISE EXCEPTION '591 gagal: % harga masih bernilai lama', n_sisa;
  END IF;

  RAISE NOTICE '591 OK: nol harga bersatuan salah tersisa di ketiga resource';
END $$;

COMMIT;
