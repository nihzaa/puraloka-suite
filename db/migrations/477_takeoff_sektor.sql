-- ============================================================================
-- 465 — Take-off SEKTOR: bukaan, kemiringan atap, dan cacah titik
-- ============================================================================
--
-- ── Apa yang kurang
--
-- Migrasi 431 memberi `takeoff_dimensi` empat metode generik — volume, luas,
-- dinding, panjang (p × l × t × jumlah × faktor). Itu benar untuk galian,
-- urugan, dan dinding polos, dan TIDAK diganti di sini.
--
-- Yang tak bisa dijawabnya, dan ketiganya berujung rupiah:
--
--   1. **Bukaan tak pernah dikurangi.** Dinding 4×3 m dengan satu pintu
--      0,9×2,1 dan satu jendela 1,2×1,2 dihitung 12 m² penuh, padahal yang
--      diplester 8,67 m². Kelebihan 28%, di sektor yang paling banyak
--      barisnya: plesteran, acian, cat.
--
--   2. **Kemiringan atap tak ada.** Luas atap BUKAN luas denah. Atap 30°
--      seluas 100 m² denah berukuran 115,47 m². Estimator yang memakai luas
--      denah kekurangan 15% genteng, dan kekurangannya baru ketahuan saat
--      pemasangan berhenti.
--
--   3. **Yang dihitung per TITIK.** Sanitair dan titik MEP volumenya cacah,
--      bukan ukuran — tetapi tetap perlu tercatat per ruangan supaya bisa
--      ditelusuri seperti sektor lain.
--
-- ── Kenapa MEMPERLUAS, bukan tabel baru
--
-- Kolom yang dibutuhkan hanya empat, dan seluruh alur di sekitarnya sudah ada:
-- FK ke `estimate_items`, jejak penerapan (`volume_diterapkan`/`diterapkan_pada`
-- /`diterapkan_oleh`), rute baca-tulis, dan izin `cecep:takeoff:*`. Tabel kedua
-- berarti dua tempat yang harus dibaca setiap kali orang bertanya "volume ini
-- dari mana" — dan yang kedua akan terlupa.
--
-- ── Bukaan disimpan sebagai JSONB, bukan tabel anak
--
-- Bukaan tak punya kehidupan sendiri: ia tak dirujuk apa pun, tak diedit
-- terpisah, dan selalu dibaca bersama barisnya. Tabel anak menambah satu join
-- pada setiap pembacaan demi keleluasaan yang tak pernah dipakai. Bentuknya
-- tetap dijaga CHECK supaya tak jadi tempat pembuangan.
--
-- ── Idempoten
--
-- `ADD COLUMN IF NOT EXISTS` + constraint dijatuhkan lebih dulu bila sudah ada.
-- ============================================================================

BEGIN;

ALTER TABLE takeoff_dimensi
  ADD COLUMN IF NOT EXISTS sektor              text,
  ADD COLUMN IF NOT EXISTS lokasi              text,
  ADD COLUMN IF NOT EXISTS kemiringan_derajat  numeric,
  ADD COLUMN IF NOT EXISTS cacah               numeric,
  ADD COLUMN IF NOT EXISTS bukaan              jsonb;

COMMENT ON COLUMN takeoff_dimensi.sektor IS
  'Sektor pekerjaan (atap/plafon/dinding/…). NULL = baris metode generik 431.';
COMMENT ON COLUMN takeoff_dimensi.lokasi IS
  'Ruangan atau zona — supaya angkanya bisa ditelusuri kembali ke gambar.';
COMMENT ON COLUMN takeoff_dimensi.kemiringan_derajat IS
  'Kemiringan atap. Luas atap = luas denah ÷ cos(kemiringan); 30° = 1,1547×.';
COMMENT ON COLUMN takeoff_dimensi.cacah IS
  'Cacah langsung untuk sanitair & titik MEP — volumenya hitungan barang.';
COMMENT ON COLUMN takeoff_dimensi.bukaan IS
  'Array bukaan yang dikurangkan dari luas dinding: [{nama,lebarM,tinggiM,jumlah}].';

-- ── Sektor yang sah ────────────────────────────────────────────────────────
-- Daftar TERTUTUP, kembaran `SEKTOR_SAH` di `lib/takeoff-sektor.ts`. Sektor
-- karangan yang lolos ke basis membuat baris tak terjangkau kode mana pun,
-- tanpa satu pun galat.
ALTER TABLE takeoff_dimensi DROP CONSTRAINT IF EXISTS takeoff_sektor_sah;
ALTER TABLE takeoff_dimensi ADD CONSTRAINT takeoff_sektor_sah CHECK (
  sektor IS NULL OR sektor = ANY (ARRAY[
    'atap', 'plafon', 'dinding', 'lantai', 'kusen', 'daun',
    'sanitair', 'mep_pipa', 'mep_titik',
    -- Dua sektor STRUKTUR ditambahkan 2026-09-01.
    --
    -- Migrasi 553 menambahkannya lewat jalur maju, tapi 477 berjalan LEBIH
    -- DULU dan CHECK sembilan-sektornya menolak baris yang sudah ada:
    --
    --     check constraint "takeoff_sektor_sah" is violated by some row
    --
    -- Basis memang punya baris bored_pile & baja_profil, dan kode sudah
    -- menghitung volumenya. Satuannya dari AHSP resmi (SE Bina Konstruksi
    -- No. 47/2026 di _source/ahsp/): bored_pile per m-panjang, baja_profil
    -- per kg. 553 tetap ada dan jadi no-op di sini.
    'bored_pile', 'baja_profil'
  ])
);

-- ── Kemiringan dalam rentang yang masuk akal ───────────────────────────────
-- Di atas 60° bukan atap melainkan dinding. Pada 89° faktornya 57×, yang
-- mengubah 100 m² denah jadi 5.730 m² genteng tanpa satu pun galat.
ALTER TABLE takeoff_dimensi DROP CONSTRAINT IF EXISTS takeoff_kemiringan_wajar;
ALTER TABLE takeoff_dimensi ADD CONSTRAINT takeoff_kemiringan_wajar CHECK (
  kemiringan_derajat IS NULL
  OR (kemiringan_derajat >= 0 AND kemiringan_derajat <= 60)
);

ALTER TABLE takeoff_dimensi DROP CONSTRAINT IF EXISTS takeoff_cacah_positif;
ALTER TABLE takeoff_dimensi ADD CONSTRAINT takeoff_cacah_positif CHECK (
  cacah IS NULL OR cacah > 0
);

-- ── Bentuk bukaan dijaga ───────────────────────────────────────────────────
-- JSONB tanpa CHECK adalah tempat pembuangan: bentuk yang salah tersimpan
-- diam-diam dan baru meledak saat dibaca, jauh dari tempat ia ditulis.
--
-- Lewat FUNGSI, bukan subquery langsung: PostgreSQL menolak subquery di dalam
-- CHECK (`cannot use subquery in check constraint`), dan memeriksa array JSONB
-- memang butuh iterasi. Fungsinya IMMUTABLE — ia hanya membaca argumennya.
CREATE OR REPLACE FUNCTION fn_bukaan_berbentuk(b jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT b IS NULL
      OR (
        jsonb_typeof(b) = 'array'
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(b) x
           WHERE jsonb_typeof(x) <> 'object'
              OR x->>'nama' IS NULL
              OR jsonb_typeof(x->'lebarM')  <> 'number'
              OR jsonb_typeof(x->'tinggiM') <> 'number'
              OR jsonb_typeof(x->'jumlah')  <> 'number'
              OR (x->>'lebarM')::numeric  <= 0
              OR (x->>'tinggiM')::numeric <= 0
              OR (x->>'jumlah')::numeric  <= 0
        )
      );
$fn$;

COMMENT ON FUNCTION fn_bukaan_berbentuk(jsonb) IS
  'Bentuk sah array bukaan take-off: [{nama,lebarM,tinggiM,jumlah}] semua > 0.';

ALTER TABLE takeoff_dimensi DROP CONSTRAINT IF EXISTS takeoff_bukaan_berbentuk;
ALTER TABLE takeoff_dimensi ADD CONSTRAINT takeoff_bukaan_berbentuk
  CHECK (fn_bukaan_berbentuk(bukaan));

-- ── Kolom sektor tak boleh nyasar ke metode generik ────────────────────────
-- Kemiringan pada baris `luas` biasa, atau cacah pada baris `volume`, berarti
-- salah satu dari dua hal: salah isi, atau rumusnya tak dipakai. Keduanya
-- menghasilkan volume yang tak sesuai dengan kolom yang tersimpan — dan
-- kolomnya justru satu-satunya yang bisa diperiksa orang belakangan.
ALTER TABLE takeoff_dimensi DROP CONSTRAINT IF EXISTS takeoff_sektor_konsisten;
ALTER TABLE takeoff_dimensi ADD CONSTRAINT takeoff_sektor_konsisten CHECK (
  (sektor IS NOT NULL)
  OR (kemiringan_derajat IS NULL AND cacah IS NULL AND bukaan IS NULL)
);

-- ── Dimensi wajib: per SEKTOR bila ada, per METODE bila tidak ──────────────
--
-- CHECK asli (431) menuntut dimensi berdasarkan `metode`: `luas` wajib punya
-- panjang DAN lebar. Itu benar untuk baris generik, dan SALAH untuk baris
-- sektor — `sanitair` volumenya cacah, `kusen` diukur dari lebar+tinggi
-- bukaannya, `mep_pipa` cukup panjangnya saja.
--
-- Terbukti saat diuji: baris sektor yang SAH pun ditolak
-- `takeoff_dimensi_dimensi_wajib`. Kalau dibiarkan, satu-satunya jalan keluar
-- adalah mengisi kolom dimensi dengan angka karangan supaya lolos — dan angka
-- karangan di kolom yang justru dibaca orang untuk memeriksa volume adalah
-- kerusakan yang lebih besar daripada constraint yang menolak.
--
-- Aturan lama TIDAK dilemahkan: baris tanpa `sektor` tetap tunduk padanya
-- persis seperti sebelumnya.
ALTER TABLE takeoff_dimensi DROP CONSTRAINT IF EXISTS takeoff_dimensi_dimensi_wajib;
ALTER TABLE takeoff_dimensi ADD CONSTRAINT takeoff_dimensi_dimensi_wajib CHECK (
  CASE
    WHEN sektor IS NULL THEN
      CASE metode
        WHEN 'volume'  THEN panjang_m IS NOT NULL AND lebar_m IS NOT NULL AND tinggi_m IS NOT NULL
        WHEN 'luas'    THEN panjang_m IS NOT NULL AND lebar_m IS NOT NULL
        WHEN 'dinding' THEN panjang_m IS NOT NULL AND tinggi_m IS NOT NULL
        WHEN 'panjang' THEN panjang_m IS NOT NULL
        ELSE NULL::boolean
      END
    ELSE
      CASE sektor
        -- cacah barang: tak punya dimensi sama sekali
        WHEN 'sanitair'  THEN cacah IS NOT NULL
        WHEN 'mep_titik' THEN cacah IS NOT NULL
        -- keliling bukaan ATAU panjang jaringan
        WHEN 'kusen'     THEN (lebar_m IS NOT NULL AND tinggi_m IS NOT NULL) OR panjang_m IS NOT NULL
        WHEN 'mep_pipa'  THEN (lebar_m IS NOT NULL AND tinggi_m IS NOT NULL) OR panjang_m IS NOT NULL
        -- luas tegak: panjang × tinggi, bukaan dikurangkan
        WHEN 'dinding'   THEN panjang_m IS NOT NULL AND tinggi_m IS NOT NULL
        -- luas datar: panjang × lebar
        WHEN 'atap'      THEN panjang_m IS NOT NULL AND lebar_m IS NOT NULL
        WHEN 'plafon'    THEN panjang_m IS NOT NULL AND lebar_m IS NOT NULL
        WHEN 'lantai'    THEN panjang_m IS NOT NULL AND lebar_m IS NOT NULL
        WHEN 'daun'      THEN panjang_m IS NOT NULL AND lebar_m IS NOT NULL
        ELSE NULL::boolean
      END
  END
);

-- ── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'takeoff_dimensi'
     AND column_name IN ('sektor', 'lokasi', 'kemiringan_derajat', 'cacah', 'bukaan');
  IF n <> 5 THEN RAISE EXCEPTION 'Kolom sektor tak lengkap: % dari 5', n; END IF;

  SELECT count(*) INTO n FROM pg_constraint
   WHERE conrelid = 'takeoff_dimensi'::regclass
     AND conname IN ('takeoff_sektor_sah', 'takeoff_kemiringan_wajar',
                     'takeoff_cacah_positif', 'takeoff_bukaan_berbentuk',
                     'takeoff_sektor_konsisten', 'takeoff_dimensi_dimensi_wajib');
  IF n <> 6 THEN RAISE EXCEPTION 'Constraint sektor tak lengkap: % dari 6', n; END IF;

  RAISE NOTICE 'OK — take-off sektor terpasang (5 kolom, 6 constraint)';
END $$;

COMMIT;
