-- ════════════════════════════════════════════════════════════════════════════
-- 310 — Jembatan resource (AHSP) ↔ material (gudang), dan rencana susut (G6e)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Yang diukur, dan kenapa kesimpulannya berubah
--
-- `F5-1` §"Kemajuan & satu penundaan" (2026-08-06) menunda "rencana susut vs
-- susut nyata" dengan pemicu tertulis: *"waste_factor terisi pada bagian
-- berarti dari assembly yang dipakai proyek nyata, DAN ada relasi
-- assembly→material."*
--
-- Diukur ulang 2026-08-12 — pemicunya BELUM menyala, dan angkanya identik:
--
--     assemblies                        3.043 baris
--       waste_factor > 0                    1 baris   ← masih 1 dari 3.043
--     tabel ber-assembly_id + material_id  (tak ada)
--
-- Tetapi pengukuran yang lebih dalam menunjukkan sebab yang berbeda dari yang
-- dicatat. Jalur assembly→material bukan "belum dibuat" — ia **tak mungkin
-- dibuat tanpa keputusan manusia**:
--
--     resources  2.830 baris   kodenya  AHSP-SEMEN-PC, AHSP-BATA-MERAH, …
--     materials     24 baris   kodenya  MAT-001, MAT-002, …
--     kode cocok PERSIS: 0
--
-- Dua penomoran yang tak pernah dirancang untuk bertemu. Menyambungkannya
-- lewat pencocokan nama ("Semen portland (PC)" ≈ "Semen Portland 50kg")
-- adalah TEBAKAN — dan tebakan di sini menghasilkan angka susut yang menuduh
-- orang atas material yang tak pernah mereka pegang.
--
-- ── Karena itu: jembatannya jadi DATA, bukan tebakan
--
-- Hanya yang mengelola gudang yang tahu `AHSP-SEMEN-PC` itu `MAT-001` atau
-- bukan — dan bahwa satu sak 50 kg bukan satu kilogram. Faktor konversi ikut,
-- karena satuan AHSP dan satuan gudang jarang sama.
--
-- Nol baris ter-seed: pemetaan yang ditebak migrasi akan terlihat resmi dan
-- tak pernah dipertanyakan.
--
-- ── Dan rencana susut ditaruh di tempat yang BISA diisi
--
-- `assemblies.waste_factor` yang sudah ada tetap dipakai kalau terisi. Tetapi
-- ia kosong pada 3.042 dari 3.043 baris, dan mengisinya menuntut menyunting
-- katalog AHSP nasional — pekerjaan yang tak sepadan.
--
-- `rencana_susut_material` menaruhnya per MATERIAL: satu angka untuk semen,
-- satu untuk besi. Itu yang sebenarnya diketahui orang gudang, dan jumlahnya
-- puluhan, bukan ribuan.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Jembatan resource ↔ material
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS peta_resource_material (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  resource_id  UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  material_id  UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,

  -- Berapa satuan MATERIAL untuk satu satuan RESOURCE.
  --
  -- AHSP menghitung semen dalam kg; gudang menyimpannya dalam sak 50 kg.
  -- Tanpa angka ini, 500 kg semen menurut AHSP akan dibandingkan dengan 10
  -- sak di gudang dan menghasilkan "susut 98%" — angka yang menuduh orang
  -- atas kesalahan satuan.
  --
  -- Bawaan 1: banyak material memang bersatuan sama. Tetapi NOL dilarang —
  -- pembagian dengan nol, atau perkalian yang menghapus seluruh kebutuhan.
  faktor       NUMERIC(14,6) NOT NULL DEFAULT 1,

  catatan      TEXT,

  dipetakan_oleh UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_peta_faktor_positif CHECK (faktor > 0),

  -- Satu resource → satu material. Dua pemetaan berarti "berapa kebutuhan
  -- semen?" punya dua jawaban, dan yang dipakai laporan jadi kebetulan.
  CONSTRAINT uq_peta_resource UNIQUE (company_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_peta_material
  ON peta_resource_material (company_id, material_id);

ALTER TABLE peta_resource_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE peta_resource_material FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. Rencana susut per material
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rencana_susut_material (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  material_id  UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,

  -- FRAKSI (0.05 = 5%), sama bentuknya dengan `assemblies.waste_factor`.
  -- Menyimpan persen lalu membagi 100 di beberapa tempat adalah cara paling
  -- mudah kehilangan faktor 100 — pelajaran yang sama dengan markup (G6a).
  susut_fraksi NUMERIC(6,4) NOT NULL,

  -- Kenapa angkanya segini. Susut yang tak bisa dijelaskan akan dibantah
  -- orang lapangan begitu ia dipakai menilai mereka — dan bantahan itu
  -- benar kalau tak ada dasarnya.
  dasar        TEXT,
  catatan      TEXT,

  ditetapkan_oleh UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 0 sah (material yang memang tak menyusut, mis. barang jadi).
  -- Batas atas 1 menangkap "5" yang dimaksud 5% — susut 500% berarti
  -- kebutuhan enam kali lipat, dan itu terlihat sah di layar mana pun.
  CONSTRAINT chk_susut_wajar CHECK (susut_fraksi >= 0 AND susut_fraksi <= 1),
  CONSTRAINT uq_susut_material UNIQUE (company_id, material_id)
);

ALTER TABLE rencana_susut_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE rencana_susut_material FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3. Izin
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description)
VALUES
  ('gudang:susut:view',   'assets', 'Lihat rencana susut',
   'Melihat pemetaan AHSP↔gudang dan rencana susut per material'),
  ('gudang:susut:manage', 'assets', 'Kelola rencana susut',
   'Memetakan resource AHSP ke material gudang dan menetapkan rencana susut')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM role_permissions rp
  JOIN permissions px ON px.id = rp.permission_id
  CROSS JOIN permissions p
 WHERE px.key = 'gudang:manage'
   AND p.key IN ('gudang:susut:view', 'gudang:susut:manage')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM role_permissions rp
  JOIN permissions px ON px.id = rp.permission_id
  CROSS JOIN permissions p
 WHERE px.key = 'gudang:view'
   AND p.key = 'gudang:susut:view'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
  v_co UUID;
  v_res UUID;
  v_mat UUID;
  v_lolos BOOLEAN := FALSE;
BEGIN
  -- 1. Nol baris ter-seed — pemetaan yang ditebak migrasi terlihat resmi dan
  --    tak pernah dipertanyakan.
  SELECT count(*) INTO n FROM peta_resource_material;
  IF n > 0 THEN
    RAISE EXCEPTION '310 gagal: % pemetaan ter-seed. Hanya orang gudang yang '
      'tahu AHSP-SEMEN-PC itu MAT-001 atau bukan.', n;
  END IF;
  SELECT count(*) INTO n FROM rencana_susut_material;
  IF n > 0 THEN
    RAISE EXCEPTION '310 gagal: % rencana susut ter-seed', n;
  END IF;

  SELECT company_id INTO v_co FROM projects WHERE company_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_res FROM resources LIMIT 1;
  SELECT id INTO v_mat FROM materials LIMIT 1;

  IF v_co IS NOT NULL AND v_res IS NOT NULL AND v_mat IS NOT NULL THEN
    INSERT INTO peta_resource_material (company_id, resource_id, material_id, faktor, catatan)
    VALUES (v_co, v_res, v_mat, 0.02, '[310-VERIFIKASI]');

    -- 2. Faktor NOL ditolak — pembagian dengan nol, atau perkalian yang
    --    menghapus seluruh kebutuhan.
    BEGIN
      UPDATE peta_resource_material SET faktor = 0 WHERE catatan = '[310-VERIFIKASI]';
      v_lolos := TRUE;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    IF v_lolos THEN
      DELETE FROM peta_resource_material WHERE catatan LIKE '[310-%';
      RAISE EXCEPTION '310 gagal: faktor 0 LOLOS';
    END IF;

    -- 3. Resource yang sama dipetakan DUA KALI ditolak.
    v_lolos := FALSE;
    BEGIN
      INSERT INTO peta_resource_material (company_id, resource_id, material_id, catatan)
      VALUES (v_co, v_res, v_mat, '[310-GANDA]');
      v_lolos := TRUE;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    IF v_lolos THEN
      DELETE FROM peta_resource_material WHERE catatan LIKE '[310-%';
      RAISE EXCEPTION '310 gagal: satu resource bisa dipetakan ke DUA material — '
        '"berapa kebutuhan semen?" jadi punya dua jawaban';
    END IF;

    DELETE FROM peta_resource_material WHERE catatan LIKE '[310-%';

    -- 4. Susut di atas 1 (=100%) ditolak.
    v_lolos := FALSE;
    BEGIN
      INSERT INTO rencana_susut_material (company_id, material_id, susut_fraksi, catatan)
      VALUES (v_co, v_mat, 5, '[310-VERIFIKASI]');
      v_lolos := TRUE;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    IF v_lolos THEN
      DELETE FROM rencana_susut_material WHERE catatan LIKE '[310-%';
      RAISE EXCEPTION '310 gagal: susut 5 (=500%%) LOLOS — kebutuhan enam kali lipat '
        'akan terlihat sah di layar mana pun';
    END IF;

    -- 5. Susut NOL diterima — material yang memang tak menyusut.
    INSERT INTO rencana_susut_material (company_id, material_id, susut_fraksi, catatan)
    VALUES (v_co, v_mat, 0, '[310-VERIFIKASI]');
    DELETE FROM rencana_susut_material WHERE catatan LIKE '[310-%';
  END IF;

  -- 6. Izin sampai ke peran.
  SELECT count(DISTINCT rp.role_id) INTO n
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'gudang:susut:manage';
  IF n = 0 THEN
    RAISE EXCEPTION '310 gagal: inventory:susut:manage tak dimiliki satu peran pun';
  END IF;

  SELECT count(*) INTO n FROM peta_resource_material;
  IF n > 0 THEN RAISE EXCEPTION '310 gagal: % baris verifikasi tertinggal', n; END IF;

  RAISE NOTICE '310 OK — jembatan & rencana susut config-first, nol ter-seed, '
    'faktor 0 & susut 500%% ditolak, satu resource satu material';
END $$;
