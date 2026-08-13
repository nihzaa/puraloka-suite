-- ============================================================================
-- 370 — `otomasi:umpan:baca` didaftarkan: izin yang DIPAKAI tapi tak pernah ada
-- ============================================================================
--
-- ── Ketahuan saat mencoba membuat kunci API kedua, 2026-08-14
--
--     POST /api/v1/api-key { izin: ['otomasi:umpan:baca'] }
--     → 400 "Izin tidak dikenal: otomasi:umpan:baca. Izin karangan lolos
--            tersimpan lalu tak pernah cocok dengan apa pun..."
--
-- Penjaganya benar, dan pesannya tepat. Yang mengejutkan: kunci LAMA
-- (`n8n-otomasi`) sudah memegang izin itu, dipakai **11 kali**, terakhir
-- kemarin — dan rute `/api/v1/otomasi/umpan/:jenis` dijaga
-- `requireApiKey('otomasi:umpan:baca')`.
--
-- Jadi izin ini nyata dipakai di produksi tanpa pernah terdaftar di katalog.
--
-- ── Kenapa ia tetap berfungsi (dan kenapa itu bukan alasan membiarkannya)
--
-- `requireApiKey` mencocokkan string di kolom `api_key.izin`, bukan menoleh ke
-- tabel `permissions`. Jadi kunci lama lolos apa adanya.
--
-- Yang rusak bukan hari ini, melainkan:
--
--   1. Kunci BARU dengan izin yang sama DITOLAK — jadi kunci yang hilang atau
--      kedaluwarsa tak bisa dibuat ulang. Untuk kunci berumur 365 hari,
--      itu berarti otomasi mati setahun lagi dan penyebabnya sulit ditebak.
--   2. Halaman Matriks Izin tak pernah menampilkannya, jadi tak ada yang bisa
--      menjawab "kunci ini boleh apa" dari layar.
--   3. Ia tak bisa diberikan ke role mana pun.
--
-- ── Kenapa TIDAK melonggarkan validatornya
--
-- Godaan yang lebih cepat: buang pemeriksaan katalog di `api-key.ts`. Itu
-- membuang satu-satunya hal yang mencegah salah ketik jadi izin permanen —
-- dan pesan galatnya sendiri sudah menjelaskan kenapa itu buruk. Yang kurang
-- adalah barisnya, bukan penjaganya.
-- ============================================================================

-- `module`, `label`, `sort_order` WAJIB (NOT NULL) — diperiksa ke
-- information_schema lebih dulu, bukan ditebak. Insert yang kurang kolomnya
-- akan gagal keras di sini, tapi menebak kolomnya berarti migrasi ditulis dua
-- kali; yang kedua selalu lebih mahal.
INSERT INTO public.permissions (key, module, label, description, sort_order)
VALUES (
  'otomasi:umpan:baca',
  'otomasi',
  'Baca umpan otomasi',
  'Membaca umpan terjadwal otomasi (/api/v1/otomasi/umpan/:jenis). Hanya untuk kunci API mesin otomasi — BUKAN untuk role manusia.',
  -- Ditaruh di ujung modulnya, bukan menyisip di tengah: sort_order yang
  -- bertabrakan membuat urutan daftar berubah-ubah antar-muat.
  COALESCE((SELECT max(sort_order) + 1 FROM public.permissions WHERE module = 'otomasi'), 900)
)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- SENGAJA TIDAK diberikan ke role mana pun, termasuk admin.
--
-- Ini izin MESIN. Satu-satunya pemakainya adalah kunci API n8n, dan rutenya
-- dijaga `requireApiKey` — bukan `requirePermission`, jadi sesi manusia tak
-- pernah melewatinya. Memberikannya ke `admin` hanya menambah baris yang tak
-- pernah diperiksa siapa pun, dan membuat matriks izin berbohong tentang apa
-- yang sebenarnya bisa dilakukan seorang admin lewat UI.
-- ------------------------------------------------------------

DO $$
DECLARE
  n_role int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE key = 'otomasi:umpan:baca') THEN
    RAISE EXCEPTION '370 gagal: izin otomasi:umpan:baca tak tersimpan';
  END IF;

  SELECT count(*) INTO n_role
    FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
   WHERE p.key = 'otomasi:umpan:baca';
  IF n_role > 0 THEN
    RAISE EXCEPTION '370 gagal: izin mesin diberikan ke % role — ia hanya untuk kunci API', n_role;
  END IF;

  RAISE NOTICE '370: otomasi:umpan:baca terdaftar · nol role memegangnya (izin mesin)';
END $$;
