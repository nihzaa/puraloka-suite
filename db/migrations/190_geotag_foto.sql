-- 190 — Geotag foto lapangan · INTI #8
--
-- ══════════════════════════════════════════════════════════════════════════
-- Kenapa koordinat pada foto
-- ══════════════════════════════════════════════════════════════════════════
--
-- Foto progres tanpa lokasi hanya bisa dipercaya kalau yang mengunggahnya
-- dipercaya. Dengan koordinat, foto jadi BUKTI: "diambil di titik ini, pada
-- jam ini" — dan itu yang membedakan dokumentasi proyek dari album.
--
-- Yang berubah karenanya, secara nyata:
--
--   · klaim progres bisa diperiksa tanpa datang ke lapangan
--   · foto yang diambil di lokasi lain (atau diunggah ulang dari galeri)
--     terlihat, bukan karena curiga tapi karena jaraknya terukur
--   · sengketa "pekerjaan ini belum dikerjakan" punya bukti berkoordinat
--
-- ── Kenapa akurasi ikut disimpan
--
-- GPS ponsel di dalam gedung bisa meleset ratusan meter. Menyimpan koordinat
-- TANPA akurasinya membuat titik yang meleset 300 m terlihat sama pastinya
-- dengan titik yang meleset 5 m — dan orang akan menarik kesimpulan dari
-- keduanya dengan keyakinan yang sama.
--
-- Dengan `akurasi_m`, UI bisa mengatakan "±180 m" alih-alih menampilkan pin
-- yang seolah tepat.
--
-- ── Kenapa `sumber_lokasi`, bukan sekadar koordinat
--
-- Ada tiga cara koordinat bisa sampai ke sini, dan ketiganya punya derajat
-- kepercayaan berbeda:
--
--   'perangkat' — GPS saat foto diambil. Paling kuat.
--   'exif'      — dibaca dari metadata berkas. Bisa dari foto lama.
--   'manual'    — diketik orang. Bukan bukti, hanya keterangan.
--
-- Menyamakan ketiganya membuat koordinat yang diketik terlihat sekuat GPS.
--
-- ── Kenapa NULLABLE, dan tetap begitu
--
-- Sinyal GPS tidak selalu ada — basement, gudang berdinding beton, daerah
-- terpencil. Memaksa koordinat berarti foto tak bisa diunggah sama sekali di
-- tempat yang justru paling perlu didokumentasikan.
--
-- Yang benar: catat kalau ada, tandai kalau tidak. UI menampilkan "tanpa
-- lokasi" apa adanya — itu informasi, bukan kegagalan.

-- ── Enum sumber ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE sumber_lokasi AS ENUM ('perangkat', 'exif', 'manual');
EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$;

-- ── Kolom geotag pada tiga tabel foto ───────────────────────────────────
--
-- Ditambahkan ke SEMUANYA, bukan hanya `project_photos`. Foto punch list dan
-- NCR justru yang paling butuh bukti lokasi: keduanya dipakai dalam
-- sengketa mutu, dan "di mana persisnya" adalah pertanyaan pertama.
--
-- `numeric(10,7)`, bukan float: 7 desimal ≈ 1,1 cm di khatulistiwa — jauh
-- lebih presisi daripada GPS mana pun, dan bebas dari galat pembulatan biner
-- yang membuat dua koordinat yang sama tak lagi sama setelah dibaca-tulis
-- (CLAUDE.md §5.4 melarang float untuk nilai yang dibandingkan).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['project_photos', 'punch_item_photos', 'ncr_photos'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS lintang NUMERIC(10,7)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS bujur   NUMERIC(10,7)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS akurasi_m NUMERIC(8,2)', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS sumber_lokasi sumber_lokasi', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS lokasi_dicatat_pada TIMESTAMPTZ', t);

    -- Koordinat harus MASUK AKAL, bukan sekadar ada.
    --
    -- Lintang di luar ±90 dan bujur di luar ±180 mustahil secara geografis;
    -- keduanya biasanya berarti nilai tertukar (bujur diisi ke lintang) —
    -- kesalahan yang menghasilkan titik di tengah laut tanpa satu pun galat.
    EXECUTE format($f$
      ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I;
      ALTER TABLE %I ADD CONSTRAINT %I CHECK (
        (lintang IS NULL AND bujur IS NULL)
        OR (lintang BETWEEN -90 AND 90 AND bujur BETWEEN -180 AND 180)
      )
    $f$, t, t || '_koordinat_masuk_akal', t, t || '_koordinat_masuk_akal');

    -- Lintang dan bujur harus BERPASANGAN. Satu tanpa yang lain bukan lokasi
    -- — dan menyimpannya membuat query "foto yang ada lokasinya" memulangkan
    -- baris yang tak bisa dipetakan.
    EXECUTE format($f$
      ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I;
      ALTER TABLE %I ADD CONSTRAINT %I CHECK (
        (lintang IS NULL) = (bujur IS NULL)
      )
    $f$, t, t || '_koordinat_berpasangan', t, t || '_koordinat_berpasangan');

    -- Ada koordinat berarti ada sumbernya. Tanpa ini, koordinat yang diketik
    -- manual tak bisa dibedakan dari GPS — dan yang pertama bukan bukti.
    EXECUTE format($f$
      ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I;
      ALTER TABLE %I ADD CONSTRAINT %I CHECK (
        lintang IS NULL OR sumber_lokasi IS NOT NULL
      )
    $f$, t, t || '_koordinat_bersumber', t, t || '_koordinat_bersumber');
  END LOOP;
END $$;

-- Indeks parsial: hanya foto BER-koordinat yang perlu dicari menurut lokasi,
-- dan itu minoritas. Indeks penuh akan memuat ribuan baris NULL yang tak
-- pernah dicari.
CREATE INDEX IF NOT EXISTS idx_project_photos_geo
  ON project_photos (project_id, lintang, bujur) WHERE lintang IS NOT NULL;

-- ── Titik acuan proyek ──────────────────────────────────────────────────
--
-- Koordinat foto baru berguna kalau ada pembandingnya. Tanpa titik acuan
-- proyek, "300 m dari lokasi" tak bisa dihitung — dan itu justru angka yang
-- menentukan apakah foto ini bukti atau bukan.
--
-- Nullable: proyek lama tak punya, dan memaksa mengisinya akan menghalangi
-- pekerjaan yang tak ada hubungannya dengan foto.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lintang NUMERIC(10,7);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bujur   NUMERIC(10,7);
-- Radius wajar lokasi proyek, meter. Di luar ini, foto ditandai "jauh dari
-- lokasi" — ditandai, BUKAN ditolak: bisa saja fotonya memang di gudang
-- material yang letaknya terpisah.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS radius_lokasi_m INTEGER DEFAULT 500;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_koordinat_masuk_akal;
ALTER TABLE projects ADD CONSTRAINT projects_koordinat_masuk_akal CHECK (
  (lintang IS NULL AND bujur IS NULL)
  OR (lintang BETWEEN -90 AND 90 AND bujur BETWEEN -180 AND 180)
);

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_koordinat_berpasangan;
ALTER TABLE projects ADD CONSTRAINT projects_koordinat_berpasangan CHECK (
  (lintang IS NULL) = (bujur IS NULL)
);

-- Radius nol atau negatif tak punya arti — dan radius nol akan menandai
-- SETIAP foto sebagai "jauh dari lokasi", membuat penandanya tak berguna.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_radius_positif;
ALTER TABLE projects ADD CONSTRAINT projects_radius_positif CHECK (
  radius_lokasi_m IS NULL OR radius_lokasi_m > 0
);

COMMENT ON COLUMN projects.radius_lokasi_m IS
  'Radius wajar lokasi proyek dalam meter. Foto di luar radius DITANDAI, bukan ditolak.';
COMMENT ON COLUMN project_photos.akurasi_m IS
  'Akurasi GPS dalam meter. NULL = tak diketahui. Koordinat tanpa akurasi tak boleh ditampilkan sebagai titik pasti.';
