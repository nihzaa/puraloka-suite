-- ════════════════════════════════════════════════════════════════════════════
-- 236 — Ritme terang-gelap situs publik: kolom `nada` di `situs_seksi`.
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa kolom BARU, bukan menumpang `varian`
--
-- Founder 2026-08-08: situs terasa "terlalu generik". Diukur: seluruh halaman
-- 8.380px berlatar navy tanpa satu pun penanda pindah bagian.
--
-- Percobaan pertama menumpangkan nilai 'terang' ke kolom `varian`, dan
-- CHECK constraint `situs_seksi_varian_dikenal` MENOLAKNYA. Constraint itu
-- benar, dan penolakannya menyelamatkan rancangan yang salah:
--
--     varian  = BENTUK   (baku | grid | carousel | split)
--     nada    = WARNA    (navy | terang)
--
-- Keduanya sumbu ortogonal. Seksi portofolio bisa 'grid' DAN 'terang'
-- sekaligus; memaksakannya ke satu kolom berarti tiap kombinasi butuh
-- nilainya sendiri ('grid-terang', 'carousel-terang', ...) dan daftarnya
-- tumbuh berlipat tiap sumbu baru ditambahkan.
--
-- ── Kenapa dua seksi ini yang terang
--
-- portofolio  Foto konstruksi didominasi beton abu, baja, dan langit. Di atas
--             navy pekat semuanya terbaca sebagai bidang gelap-di-atas-gelap.
--             Latar terang membuat fotonya yang bicara, dan foto itulah
--             barang jualan kontraktor.
-- legalitas   13 baris kode KBLI. Daftar teknis paling terbaca di latar
--             terang, dan ia memang bukan bagian yang harus "berkesan".
--
-- hero, proses, kontak TETAP navy: navy adalah warna merek dan harus tetap
-- memimpin. Yang dibangun di sini ritme DI DALAM satu tema, bukan dua tema
-- yang bergantian.
--
-- ── Aksen kuning tak perlu diatur di sini
--
-- `--aksen: #ffd600` hanya 1,30:1 di atas kanvas terang (dihitung
-- `apps/web-publik/scripts/kontras-situs.mjs`, dan penjaga itu MENUNTUT ia
-- tetap gagal). Jadi kuning mustahil dipakai di seksi terang tanpa penjaga
-- CI merah lebih dulu. Kelangkaannya dijaga fisika warna.
--
-- Idempoten: aman dijalankan berulang.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Kolom
-- ------------------------------------------------------------
ALTER TABLE situs_seksi
  ADD COLUMN IF NOT EXISTS nada text NOT NULL DEFAULT 'navy';

-- Pilihan diskrit yang SUDAH dirancang, bukan teks bebas — alasan yang sama
-- dengan `situs_seksi_varian_dikenal` (migrasi 205): tanpa CHECK, admin bisa
-- mengetik nada yang tak punya kelas CSS, dan seksinya kehilangan warna tanpa
-- satu pun pesan galat.
ALTER TABLE situs_seksi DROP CONSTRAINT IF EXISTS situs_seksi_nada_dikenal;
ALTER TABLE situs_seksi ADD CONSTRAINT situs_seksi_nada_dikenal
  CHECK (nada IN ('navy', 'terang'));

COMMENT ON COLUMN situs_seksi.nada IS
  'Nada latar seksi: navy (merek) atau terang (kanvas). Sumbu WARNA, terpisah dari `varian` yang mengatur BENTUK. Kelas CSS-nya `.seksi-terang` di apps/web-publik/app/globals.css.';

-- ------------------------------------------------------------
-- 2. Nilai awal
-- ------------------------------------------------------------
UPDATE situs_seksi SET nada = 'terang'
 WHERE kunci IN ('portofolio', 'legalitas');

-- ------------------------------------------------------------
-- 3. View publik HARUS ikut menerbitkan kolomnya.
--
-- `v_situs_publik` memilih kolomnya satu per satu, dan komentar di
-- `routes/v1/situs.ts` sudah memperingatkan konsekuensinya: *"kolom baru
-- besok TIDAK ikut terbit"*. Diukur, dan benar — sesudah kolom `nada`
-- ditambahkan, view masih hanya memilih `varian`.
--
-- Ini bentuk kegagalan yang paling sulit dilihat: kolomnya ADA, nilainya
-- BENAR, migrasi tercatat SUKSES, dan halaman tetap navy seluruhnya tanpa
-- satu pun galat. Karena itu view-nya dibangun ulang di migrasi yang sama,
-- bukan di migrasi menyusul yang bisa lupa dibuat.
-- ------------------------------------------------------------
-- Ditulis ULANG UTUH, bukan ditambal lewat manipulasi teks definisinya.
--
-- Percobaan pertama memakai `pg_get_viewdef()` lalu `replace('s.varian', …)`.
-- Itu bekerja hari ini dan akan pecah senyap besok: begitu ada kolom lain
-- bernama mirip, atau formatnya berubah antar versi Postgres, hasilnya SQL
-- yang salah atau view yang gagal dibangun. Definisi view adalah kode, dan
-- kode disalin apa adanya, bukan disunting dengan pencarian teks.
--
-- Sumbernya migrasi 209. Satu-satunya perbedaan: `s.nada` ikut dipilih.
CREATE OR REPLACE VIEW v_situs_publik
WITH (security_invoker = off) AS
SELECT
  co.id AS company_id,

  COALESCE(
    (SELECT jsonb_object_agg(k.kunci, k.nilai)
       FROM situs_konten k WHERE k.company_id = co.id),
    '{}'::jsonb
  ) AS konten,

  COALESCE(
    (SELECT jsonb_agg(x ORDER BY x.urutan)
       FROM (SELECT g.id, g.kunci, g.judul, g.ringkasan, g.lokasi, g.lingkup, g.urutan
               FROM situs_kategori g
              WHERE g.company_id = co.id AND g.tampil) x),
    '[]'::jsonb
  ) AS kategori,

  COALESCE(
    (SELECT jsonb_agg(x ORDER BY x.urutan)
       FROM (SELECT m.kategori_id, m.path_storage, m.alt, m.lebar, m.tinggi, m.urutan
               FROM situs_media m
              WHERE m.company_id = co.id AND m.tampil) x),
    '[]'::jsonb
  ) AS media,

  COALESCE(
    (SELECT jsonb_agg(x ORDER BY x.urutan)
       FROM (SELECT ms.tahun, ms.judul, ms.keterangan, ms.urutan
               FROM situs_milestone ms
              WHERE ms.company_id = co.id AND ms.tampil) x),
    '[]'::jsonb
  ) AS milestone,

  COALESCE(
    (SELECT jsonb_agg(x ORDER BY x.urutan)
       FROM (SELECT l.kode, l.judul, l.urutan
               FROM situs_legalitas l
              WHERE l.company_id = co.id AND l.tampil) x),
    '[]'::jsonb
  ) AS legalitas,

  -- `situs_seksi` TIDAK disaring `aktif`: halaman publik perlu tahu seksi mana
  -- yang dimatikan supaya tak merendernya, dan itu berbeda dari "tak ada".
  -- `s.nada` DITAMBAHKAN 2026-08-08 — inilah seluruh alasan view ini ditulis
  -- ulang di migrasi 236.
  COALESCE(
    (SELECT jsonb_agg(x ORDER BY x.urutan)
       FROM (SELECT s.kunci, s.aktif, s.urutan, s.varian, s.nada
               FROM situs_seksi s
              WHERE s.company_id = co.id) x),
    '[]'::jsonb
  ) AS seksi,

  (SELECT to_jsonb(x)
     FROM (SELECT b.warna_utama, b.warna_aksen, b.logo_path
             FROM situs_merek b WHERE b.company_id = co.id) x
  ) AS merek

FROM companies co
WHERE co.is_active;

GRANT SELECT ON v_situs_publik TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 4. Verifikasi — migrasi gagal keras kalau hasilnya tidak benar-benar ada.
--
-- Pelajaran dari 043 (tercatat sukses tanpa pernah membuat tabelnya): buku
-- migrasi yang berbohong membuat migrasi dilewati senyap selamanya.
-- ------------------------------------------------------------
DO $$
DECLARE
  n_terang integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'situs_seksi' AND column_name = 'nada'
  ) THEN
    RAISE EXCEPTION '236 gagal: kolom situs_seksi.nada tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'situs_seksi_nada_dikenal'
  ) THEN
    RAISE EXCEPTION '236 gagal: constraint situs_seksi_nada_dikenal tidak terpasang';
  END IF;

  SELECT count(*) INTO n_terang FROM situs_seksi WHERE nada = 'terang';
  IF n_terang = 0 THEN
    RAISE EXCEPTION '236 gagal: nol seksi bernada terang; ritmenya tak akan terlihat';
  END IF;

  -- Yang PALING mudah terlewat: kolomnya ada, nilainya benar, dan view
  -- publiknya tak pernah menerbitkannya. Halaman tetap navy seluruhnya tanpa
  -- satu pun galat, dan migrasi tercatat sukses.
  IF pg_get_viewdef('v_situs_publik'::regclass, true) NOT LIKE '%nada%' THEN
    RAISE EXCEPTION '236 gagal: v_situs_publik tidak menerbitkan kolom nada';
  END IF;

  -- Dan yang lebih keras lagi: view-nya benar-benar MENGEMBALIKAN nilainya.
  -- Definisi yang memuat kata "nada" belum tentu menghasilkan datanya.
  IF NOT EXISTS (
    SELECT 1 FROM v_situs_publik v,
      LATERAL jsonb_array_elements(v.seksi) s
     WHERE s ->> 'nada' = 'terang'
  ) THEN
    RAISE EXCEPTION '236 gagal: v_situs_publik tak mengembalikan satu pun seksi bernada terang';
  END IF;
END $$;
