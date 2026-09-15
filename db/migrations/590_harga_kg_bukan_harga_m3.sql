-- ============================================================================
-- 590 — harga per KG disalin dari harga per M3: satu kg pasir Rp 370.200
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- `seed-harga-pokok.mjs --execute` (2026-09-16) menulis 2.779 harga dari
-- dataset SE-47. Empat pasang di antaranya membawa cacat dari SUMBERNYA:
-- bahan yang sama muncul dua kali dengan satuan berbeda — m3 dan kg — dan
-- HARGANYA IDENTIK.
--
--     AHSP-R0101  m3  Rp 370.200   Pasir beton (quarry)
--     AHSP-R0076  kg  Rp 370.200   Pasir beton              ← salin
--     AHSP-R0108  kg  Rp 370.200   Pasir beton (quarry)     ← salin
--     AHSP-R0009  m3  Rp 352.300   Kerikil
--     AHSP-R0077  kg  Rp 352.300   Kerikil                  ← salin
--     AHSP-R0603  m3  Rp 178.000   pupuk organik
--     AHSP-R0822  kg  Rp 178.000   Pupuk Organik            ← salin
--
-- Satu m³ pasir beratnya ~1.400 kg. Harga per m³ dan per kg TAK MUNGKIN
-- bertemu di angka yang sama; yang bersatuan kg salah ~1.400×.
--
-- Ditemukan `audit-harga-satuan-waras.mjs` — penjaga yang lahir justru dari
-- kelas cacat ini (header-nya mencatat 1 m³ beton terhitung Rp 626 juta,
-- menyebar ke 32 AHSP tanpa satu pun galat). Kali ini ia menangkapnya pada
-- hari harganya masuk, bukan berbulan-bulan kemudian.
--
-- ── Dampaknya kalau dibiarkan
--
-- Keempat resource kg itu dipakai 65 baris komponen. Tiap AHSP yang
-- memakainya menghitung bahan ~1.400× terlalu mahal, lalu angka itu mengalir
-- ke RAB, penawaran, dan kontrak — tanpa galat, dan tanpa apa pun di layar
-- yang menandainya.
--
-- ── Densitas yang dipakai, dan dari mana angkanya
--
-- Bukan karangan: densitas ruah (bulk density) lazim SNI/PUPR untuk agregat
-- konstruksi, dibulatkan konservatif.
--
--     pasir beton     1.400 kg/m³
--     kerikil/split   1.350 kg/m³
--     pupuk organik     700 kg/m³   (bahan organik jauh lebih ringan)
--
-- Konservatif berarti: densitas yang LEBIH KECIL menghasilkan harga per kg
-- yang LEBIH BESAR. Jadi kalau meleset, ia meleset ke arah MAHAL — RAB
-- kelebihan, bukan kekurangan. Untuk angka penawaran, itu arah yang benar.
--
-- ── Kenapa migrasi, bukan memperbaiki datasetnya
--
-- Datasetnya SETIA pada workbook — dan memang harus, sebab ia jejak "SE
-- bilang apa". Yang salah bukan pembacaannya melainkan angkanya di sumber.
-- Memperbaiki di dataset membuat ekstraksi berikutnya tak lagi cocok dengan
-- workbook, dan selisih itu akan terbaca sebagai bug ekstraktor.
--
-- Diperbaiki di HARGA, dengan alasan tercatat di `price_book_entries.supplier`
-- supaya siapa pun yang membuka baris itu tahu angkanya sudah diturunkan,
-- bukan dibaca apa adanya dari SE.
--
-- ── VERSI BARU, bukan UPDATE — dan basis yang menolaknya lebih dulu
--
-- Percobaan pertama migrasi ini meng-UPDATE `amount` di tempat. Ditolak
-- `fn_price_book_immutable`:
--
--     "Price Book Entry sudah di-verify (status=active): harga & atribut
--      inti tak bisa diubah — Estimate Item yang merujuknya tak boleh
--      berubah retroaktif. Buat entry baru (version berikutnya)."
--
-- Aturan itu BENAR, dan alasannya sama dengan pembekuan assembly: angka
-- yang sudah dipakai menyusun RAB tak boleh bergeser di belakang orang yang
-- memakainya. Jadi yang lama di-`expired` (transisi sah), yang baru lahir
-- `version_number + 1` berstatus `active`.
--
-- ── Yang SENGAJA tak disentuh, dan kenapa
--
-- Verifikasi migrasi ini menemukan DUA pasang lagi yang harganya identik
-- lintas satuan — dan keduanya BUKAN kasus yang sama:
--
--     AHSP-R0110  m3  Rp 25.000   Bentonite     · AHSP-R0031  kg  Rp 25.000
--     AHSP-R0287  m3  Rp 30.090   Paku sekrup   · AHSP-R0208  kg  Rp 30.090
--
-- Di keempat kasus di atas, yang salah jelas baris KG-nya (harga m³ tersalin
-- ke kg). Di dua ini justru sebaliknya: Rp 25.000/kg bentonite wajar, dan
-- "paku sekrup per m³" bukan satuan yang dipakai orang membeli paku — yang
-- mencurigakan baris M³-nya.
--
-- Membaginya dengan densitas karena itu akan MEMPERBURUK: ia mengoreksi
-- baris yang benar. Dan densitas bentonite/paku bukan angka yang bisa saya
-- ambil dari standar agregat — menebaknya sama saja mengarang.
--
-- Dibiarkan, dan sengaja TIDAK didiamkan: `audit-harga-satuan-waras.mjs`
-- tetap akan menyebutnya. Yang dibutuhkan keputusan manusia soal satuan mana
-- yang benar untuk kedua bahan itu, bukan rumus.
--
-- IDEMPOTEN: hanya menyentuh baris kg yang harganya MASIH identik dengan
-- pasangan m³-nya. Jalan kedua tak menemukan apa pun.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  r            RECORD;
  v_diperbaiki INT := 0;
  v_baru       NUMERIC;
BEGIN
  FOR r IN
    SELECT kg.id AS pb_id, kg.resource_id, kg.version_number, kg.effective_date,
           kg.location, kg.company_id, kg.created_by, kg.verified_by,
           res.code, res.name, kg.amount AS harga_lama, d.densitas
      FROM price_book_entries kg
      JOIN resources res ON res.id = kg.resource_id
      JOIN (VALUES
              ('AHSP-R0076', 1400.0),
              ('AHSP-R0108', 1400.0),
              ('AHSP-R0077', 1350.0),
              ('AHSP-R0822',  700.0)
           ) AS d(code, densitas) ON d.code = res.code
     WHERE kg.status = 'active'
       AND res.unit_code = 'kg'
       -- HANYA bila masih identik dengan harga m³ pasangannya: itulah tanda
       -- ia hasil salin. Harga kg yang sudah wajar tak disentuh.
       AND EXISTS (
         SELECT 1 FROM price_book_entries m3
           JOIN resources rm ON rm.id = m3.resource_id
          WHERE m3.status = 'active' AND rm.unit_code = 'm3'
            AND m3.amount = kg.amount
            AND lower(split_part(rm.name, ' (', 1)) = lower(split_part(res.name, ' (', 1)))
  LOOP
    v_baru := round(r.harga_lama / r.densitas, 2);

    -- 1. Yang lama DIPENSIUNKAN, tidak dihapus: jejak "SE bilang apa" utuh,
    --    dan RAB lama tetap menunjuk angka yang memang dipakai saat itu.
    -- HANYA `status`. `expired_date` ikut dibekukan `fn_price_book_immutable`
    -- (ia ada di daftar atribut inti), jadi menyetelnya bersamaan akan
    -- ditolak dengan galat yang sama — dan galat itu menuduh "harga tak bisa
    -- diubah" padahal yang ditolak justru penanggalannya.
    UPDATE price_book_entries
       SET status = 'expired'
     WHERE id = r.pb_id;

    -- 2. Versi berikutnya, dengan alasannya tercatat di `supplier`.
    INSERT INTO price_book_entries
      (resource_id, amount, currency, version_number, effective_date,
       location, supplier, status, company_id, created_by, verified_by,
       verified_at, confidence_level)
    VALUES
      (r.resource_id, v_baru, 'IDR', r.version_number + 1, CURRENT_DATE,
       r.location,
       format('harga m3 ÷ densitas %s kg/m3 (migrasi 590)', r.densitas),
       'active', r.company_id, r.created_by, r.verified_by,
       now(), 'medium');

    RAISE NOTICE '590: % (%) Rp % → Rp %', r.code, r.name, r.harga_lama, v_baru;
    v_diperbaiki := v_diperbaiki + 1;
  END LOOP;

  RAISE NOTICE '590: % harga per-kg dikoreksi lewat versi baru', v_diperbaiki;
END $$;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE n_sisa INT;
BEGIN
  -- Invarian: tak boleh ada lagi bahan bernama sama yang harganya IDENTIK
  -- di satuan ruah (m3) dan massa (kg). Ini pemeriksaan yang SAMA dengan
  -- `audit-harga-satuan-waras.mjs`, dinyatakan di basis supaya migrasi ini
  -- tak bisa lolos sambil meninggalkan pekerjaannya setengah.
  -- Lingkupnya KEEMPAT resource yang dikoreksi migrasi ini, bukan seluruh
  -- katalog. Alasannya di blok "Yang SENGAJA tak disentuh" di kepala berkas.
  SELECT count(*) INTO n_sisa
    FROM price_book_entries b
    JOIN resources rb ON rb.id = b.resource_id
   WHERE b.status = 'active'
     AND rb.code IN ('AHSP-R0076', 'AHSP-R0108', 'AHSP-R0077', 'AHSP-R0822')
     AND EXISTS (
       SELECT 1 FROM price_book_entries a
         JOIN resources ra ON ra.id = a.resource_id AND ra.unit_code = 'm3'
        WHERE a.status = 'active' AND a.amount = b.amount
          AND lower(split_part(ra.name, ' (', 1)) = lower(split_part(rb.name, ' (', 1)));

  IF n_sisa > 0 THEN
    RAISE EXCEPTION '590 gagal: % dari 4 harga kg masih identik dengan m3-nya', n_sisa;
  END IF;

  RAISE NOTICE '590 OK: keempat harga kg tak lagi identik dengan pasangan m3-nya';
END $$;

COMMIT;
