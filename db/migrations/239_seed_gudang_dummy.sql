-- ════════════════════════════════════════════════════════════════════════════
-- 239 — SEED GUDANG: aset, riwayat pergerakan, sisa material yang kembali
--
-- ── Kenapa ada
--
-- Migrasi 238 membangun tempatnya; berkas ini mengisinya supaya dashboard
-- gudang bisa dinilai. Diaudit sebelum menulis:
--
--   assets              4 baris   (1 tersedia, 3 dipakai)
--   asset_movements     0 baris   ← riwayat pergerakan kosong sama sekali
--   gudang_stok         0 baris   ← belum ada material yang kembali
--
-- Empat aset untuk 15 proyek adalah angka yang tak masuk akal bagi kontraktor
-- yang menjalankan 11 proyek sekaligus.
--
-- ── Yang dimodelkan: SIKLUS PENGEMBALIAN, bukan siklus distribusi
--
-- Founder 2026-08-09: *"setelah proyek selesai, nantinya semua barang, alat-
-- alat akan disimpan lagi ke gudang."*
--
-- Jadi riwayatnya dibuat mengikuti alur nyata itu:
--
--   gudang → proyek        (movement_type 'pindah', to_project_id terisi)
--   proyek → gudang        (movement_type 'kembali', to_gudang_id terisi)
--   kondisi menurun        condition_before 'baik' → condition_after 'cukup'
--
-- Kondisi yang MENURUN itu disengaja dan penting: alat yang kembali selalu
-- sama baiknya dengan saat pergi adalah keadaan yang tak pernah terjadi, dan
-- kartu "kondisi alat" di dashboard tak akan pernah bisa diuji pada keadaan
-- yang justru jadi alasan kartunya ada.
--
-- ── Tunduk CLAUDE.md §8a.5
--
-- Hanya MENAMBAH. Empat aset lama tidak diubah nilainya; yang disentuh hanya
-- `gudang_id` pada aset yang memang berstatus 'tersedia' (migrasi 238).
--
-- Idempoten: id tetap + ON CONFLICT DO NOTHING.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. ASET TAMBAHAN — 14 unit, total jadi 18
--
-- Campuran kategori yang lazim di kontraktor renovasi/rumah tinggal: alat
-- ringan mendominasi, alat berat sedikit. Menyalin komposisi proyek highrise
-- (banyak crane dan excavator) akan membuat dashboard berbohong tentang
-- skala usaha.
--
-- Harga perolehan diisi supaya kartu "nilai inventori" punya bahan, dan
-- `useful_life_months` supaya penyusutan bisa dihitung.
-- ------------------------------------------------------------
INSERT INTO assets (
  id, company_id, asset_code, name, category, ownership, brand,
  purchase_date, purchase_price, residual_value, useful_life_months,
  depreciation_method, status, condition, gudang_id, current_project_id
)
SELECT
  ('e1000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  g.company_id,
  'AST-' || lpad((100 + i)::text, 4, '0'),
  t.nama, t.kategori, 'milik', t.merek,
  (CURRENT_DATE - ((300 + i * 47) || ' days')::interval)::date,
  t.harga::numeric,
  (t.harga * 0.1)::numeric,
  t.umur,
  'garis_lurus',
  t.status,
  t.kondisi,
  -- Yang 'tersedia' ditaruh di gudang; yang 'dipakai'/'perawatan' tidak.
  -- Constraint `assets_lokasi_tunggal` (238) menolak keduanya terisi.
  CASE WHEN t.status = 'tersedia' THEN g.id ELSE NULL END,
  NULL
FROM generate_series(1, 14) AS i
CROSS JOIN LATERAL (
  SELECT gg.id, gg.company_id
    FROM gudang gg
   WHERE gg.kode = 'GD-01'
   ORDER BY gg.created_at
   LIMIT 1
) g
CROSS JOIN LATERAL (
  SELECT
    (ARRAY[
      'Molen Beton 350L','Vibrator Beton','Scaffolding Set 20 Frame','Bar Bender 32mm',
      'Bar Cutter 32mm','Genset 5 kVA','Mesin Las Listrik 250A','Bor Beton Rotary',
      'Gerinda Tangan 4"','Compactor Stamper','Pompa Air Submersible','Theodolite Digital',
      'Waterpass Otomatis','Pick Up Bak Terbuka'
    ])[i] AS nama,
    (ARRAY[
      'alat_ringan','alat_ringan','scaffolding','alat_ringan',
      'alat_ringan','alat_ringan','alat_ringan','perlengkapan',
      'perlengkapan','alat_ringan','alat_ringan','perlengkapan',
      'perlengkapan','kendaraan'
    ])[i] AS kategori,
    (ARRAY[
      'Tiger','Dynamic','Lokal','Toyo','Toyo','Honda','Lakoni','Bosch',
      'Makita','Mikasa','Shimizu','Nikon','Topcon','Suzuki'
    ])[i] AS merek,
    (ARRAY[
      12500000, 3200000, 18000000, 8500000, 7800000, 9500000, 4200000, 2800000,
      1200000, 15000000, 2400000, 22000000, 9800000, 145000000
    ])[i] AS harga,
    (ARRAY[60,48,120,60,60,60,48,36,24,60,36,84,84,96])[i] AS umur,
    -- ~60% tersedia (di gudang), sisanya dipakai/perawatan. Semua-tersedia
    -- membuat kartu "berapa alat sedang di lapangan" selalu nol.
    (ARRAY[
      'tersedia','dipakai','tersedia','tersedia','dipakai','tersedia','perawatan','tersedia',
      'tersedia','dipakai','tersedia','tersedia','rusak','dipakai'
    ])[i] AS status,
    (ARRAY[
      'baik','cukup','cukup','baik','baik','cukup','buruk','baik',
      'cukup','baik','baik','baik','buruk','cukup'
    ])[i] AS kondisi
) t
ON CONFLICT (id) DO NOTHING;

-- Aset berstatus 'dipakai' ditempatkan ke proyek AKTIF — tanpa ini kartu
-- "di lapangan" tahu jumlahnya tetapi tak tahu di mana.
UPDATE assets a
   SET current_project_id = p.id, updated_at = now()
  FROM (
    SELECT id, row_number() OVER (ORDER BY created_at) AS n
      FROM projects WHERE status = 'active' AND is_deleted = false
  ) p
 WHERE a.status = 'dipakai'
   AND a.current_project_id IS NULL
   AND a.gudang_id IS NULL
   AND p.n = 1 + (abs(hashtext(a.id::text)) % GREATEST(
        (SELECT count(*) FROM projects WHERE status='active' AND is_deleted=false), 1));

-- ------------------------------------------------------------
-- 2. RIWAYAT PERGERAKAN — siklus keluar-masuk gudang
--
-- Dua jenis baris per aset yang pernah keluar:
--   'pindah'  gudang → proyek
--   'kembali' proyek → gudang, dengan kondisi yang bisa menurun
--
-- `chk_movement_tanggal` menuntut `returned_at >= moved_at`; tanggalnya
-- dihitung supaya selalu memenuhi itu.
-- ------------------------------------------------------------
INSERT INTO asset_movements (
  id, asset_id, from_gudang_id, to_project_id, movement_type,
  moved_at, condition_before, condition_after, notes
)
SELECT
  ('e2000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  a.id, g.id, p.id, 'pindah',
  now() - ((60 + i * 3) || ' days')::interval,
  'baik', NULL,
  'Dikirim ke lokasi proyek'
FROM generate_series(1, 12) AS i
CROSS JOIN LATERAL (
  SELECT gg.id FROM gudang gg WHERE gg.kode = 'GD-01' ORDER BY gg.created_at LIMIT 1
) g
CROSS JOIN LATERAL (
  SELECT aa.id FROM assets aa ORDER BY aa.asset_code
   OFFSET (i % GREATEST((SELECT count(*) FROM assets), 1)) LIMIT 1
) a
CROSS JOIN LATERAL (
  SELECT pp.id FROM projects pp WHERE pp.is_deleted = false ORDER BY pp.created_at
   OFFSET (i % GREATEST((SELECT count(*) FROM projects WHERE is_deleted=false), 1)) LIMIT 1
) p
ON CONFLICT (id) DO NOTHING;

INSERT INTO asset_movements (
  id, asset_id, from_project_id, to_gudang_id, movement_type,
  moved_at, returned_at, condition_before, condition_after, notes
)
SELECT
  ('e3000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  a.id, p.id, g.id, 'kembali',
  now() - ((30 + i * 2) || ' days')::interval,
  now() - ((30 + i * 2) || ' days')::interval,
  'baik',
  -- Kondisi MENURUN pada sebagian: itulah keadaan yang membuat kartu
  -- kondisi ada gunanya.
  (ARRAY['baik','cukup','baik','cukup','buruk','baik','cukup','baik'])[1 + (i % 8)],
  'Proyek selesai, alat ditarik kembali ke gudang'
FROM generate_series(1, 8) AS i
CROSS JOIN LATERAL (
  SELECT gg.id FROM gudang gg WHERE gg.kode = 'GD-01' ORDER BY gg.created_at LIMIT 1
) g
CROSS JOIN LATERAL (
  SELECT aa.id FROM assets aa ORDER BY aa.asset_code
   OFFSET (i % GREATEST((SELECT count(*) FROM assets), 1)) LIMIT 1
) a
CROSS JOIN LATERAL (
  SELECT pp.id FROM projects pp WHERE pp.is_deleted = false ORDER BY pp.created_at
   OFFSET ((i + 3) % GREATEST((SELECT count(*) FROM projects WHERE is_deleted=false), 1)) LIMIT 1
) p
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 3. SISA MATERIAL YANG KEMBALI KE GUDANG
--
-- Inilah bagian yang paling menggambarkan kasus Puraloka: proyek selesai,
-- material sisa ditarik. `asal_project_id` merekam dari mana ia datang —
-- tanpa itu, sisa material jadi tumpukan tanpa riwayat.
-- ------------------------------------------------------------
INSERT INTO gudang_stok (id, gudang_id, material_id, qty, asal_project_id)
SELECT
  ('e4000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  g.id, m.id,
  (5 + (i * 7) % 40)::numeric,
  p.id
FROM generate_series(1, 8) AS i
CROSS JOIN LATERAL (
  SELECT gg.id FROM gudang gg WHERE gg.kode = 'GD-01' ORDER BY gg.created_at LIMIT 1
) g
CROSS JOIN LATERAL (
  SELECT mm.id FROM materials mm ORDER BY mm.id
   OFFSET (i % GREATEST((SELECT count(*) FROM materials), 1)) LIMIT 1
) m
CROSS JOIN LATERAL (
  SELECT pp.id FROM projects pp
   WHERE pp.status = 'completed' AND pp.is_deleted = false
   ORDER BY pp.created_at
  OFFSET (i % GREATEST(
    (SELECT count(*) FROM projects WHERE status='completed' AND is_deleted=false), 1)) LIMIT 1
) p
ON CONFLICT (gudang_id, material_id) DO NOTHING;

-- ------------------------------------------------------------
-- 4. VERIFIKASI
-- ------------------------------------------------------------
DO $$
DECLARE
  n_aset INT; n_gudang INT; n_lapangan INT;
  n_pindah INT; n_kembali INT; n_stok INT; n_kondisi INT;
BEGIN
  SELECT count(*) INTO n_aset FROM assets;
  SELECT count(*) INTO n_gudang FROM assets WHERE gudang_id IS NOT NULL;
  SELECT count(*) INTO n_lapangan FROM assets WHERE current_project_id IS NOT NULL;
  SELECT count(*) INTO n_pindah FROM asset_movements WHERE movement_type = 'pindah';
  SELECT count(*) INTO n_kembali FROM asset_movements WHERE movement_type = 'kembali';
  SELECT count(*) INTO n_stok FROM gudang_stok;

  IF n_aset < 16 THEN
    RAISE EXCEPTION '239 gagal: assets hanya %, diharapkan >= 16', n_aset;
  END IF;
  IF n_gudang < 5 THEN
    RAISE EXCEPTION '239 gagal: aset di gudang hanya %, diharapkan >= 5', n_gudang;
  END IF;
  IF n_pindah < 5 OR n_kembali < 4 THEN
    RAISE EXCEPTION '239 gagal: riwayat pergerakan kurang (pindah=% kembali=%)', n_pindah, n_kembali;
  END IF;
  IF n_stok < 4 THEN
    RAISE EXCEPTION '239 gagal: gudang_stok hanya %, diharapkan >= 4', n_stok;
  END IF;

  -- Kondisi WAJIB bertingkat. Kalau seluruh alat kembali dalam kondisi
  -- 'baik', kartu kondisi di dashboard tak pernah bisa diuji pada keadaan
  -- yang justru jadi alasan kartunya ada.
  SELECT count(DISTINCT condition_after) INTO n_kondisi
    FROM asset_movements WHERE condition_after IS NOT NULL;
  IF n_kondisi < 2 THEN
    RAISE EXCEPTION '239 gagal: kondisi kembali tak bertingkat (% nilai)', n_kondisi;
  END IF;

  -- Invarian 238: tak ada aset di dua tempat sekaligus.
  IF EXISTS (SELECT 1 FROM assets
              WHERE gudang_id IS NOT NULL AND current_project_id IS NOT NULL) THEN
    RAISE EXCEPTION '239 gagal: ada aset tercatat di gudang DAN di proyek';
  END IF;

  RAISE NOTICE '239 OK — aset=% (gudang=% lapangan=%) pindah=% kembali=% stok_gudang=%',
    n_aset, n_gudang, n_lapangan, n_pindah, n_kembali, n_stok;
END $$;
