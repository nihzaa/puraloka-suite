-- ════════════════════════════════════════════════════════════════════════════
-- 238 — GUDANG sebagai LOKASI: tempat barang KEMBALI, bukan tempat barang lewat
--
-- ── Apa yang founder gambarkan, dan kenapa itu mengubah rancangannya
--
-- Founder 2026-08-09: *"sekarang belum ada gudang, tapi nanti setelah proyek
-- selesai, nantinya semua barang, alat-alat akan disimpan lagi ke gudang."*
--
-- Itu BUKAN gudang seperti referensi BuildAxis "Material Management", yang
-- memodelkan alur MASUK: beli → gudang → kirim ke proyek. Di Puraloka arahnya
-- terbalik — material dibeli langsung ke lokasi proyek, dan gudang adalah
-- tempat SISA dan ALAT kembali sesudah pekerjaan selesai.
--
-- Perbedaan itu menentukan bentuk tabelnya. Gudang-distribusi butuh stok
-- per-gudang yang berubah tiap hari, reorder point, dan lead time. Gudang-
-- pengembalian butuh satu hal: **di mana barang ini sekarang.**
--
-- ── Sebagian besar sudah ada, dan itu diperiksa lebih dulu
--
-- Diaudit sebelum menulis migrasi ini. Yang SUDAH siap dan tak disentuh:
--
--   asset_movements.movement_type  sudah punya nilai 'kembali'
--   asset_movements.condition_before/after  kondisi saat pergi vs pulang
--   assets.status                  sudah punya 'tersedia' (= tak di proyek)
--   stock_movements.movement_type  sudah punya 'return'
--
-- Jadi migrasi ini TIDAK membangun ulang apa pun. Ia hanya menambah satu hal
-- yang benar-benar hilang: **identitas tempatnya.**
--
-- ── Kenapa tabel, bukan sekadar teks bebas
--
-- Founder memilih menyiapkan tabel lokasi dari sekarang meski gudangnya baru
-- satu. Saya sempat menyarankan sebaliknya (kolom yang tak pernah bervariasi
-- cenderung tak pernah diisi benar), tetapi alasannya kuat: gudangnya rencana
-- NYATA, bukan spekulasi, dan pengembalian pertama sudah punya tempat begitu
-- terjadi.
--
-- Yang dijaga supaya kekhawatiran saya tak terwujud: kolomnya NULLABLE dan
-- bermakna. `gudang_id IS NULL` berarti "tidak di gudang" — bukan "belum
-- diisi". Aset di proyek memang harus NULL. Jadi kolomnya bervariasi sejak
-- hari pertama.
--
-- ── Idempoten
--
-- IF NOT EXISTS di seluruh DDL, ON CONFLICT pada seed. Dijalankan dua kali
-- menghasilkan keadaan yang sama.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. TABEL GUDANG
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gudang (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  kode        TEXT NOT NULL,
  nama        TEXT NOT NULL,
  alamat      TEXT,
  -- Penanggung jawab. `users`, bukan teks: gudang tanpa orang yang
  -- bertanggung jawab adalah tempat barang menghilang tanpa ada yang bisa
  -- ditanya.
  penjaga_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Gudang bisa ditutup tanpa dihapus: riwayat pergerakan yang menunjuk ke
  -- sana harus tetap terbaca. Menghapusnya akan memutus jejak barang.
  aktif       BOOLEAN NOT NULL DEFAULT true,
  catatan     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Kode unik PER COMPANY, bukan global: dua tenant boleh sama-sama punya
  -- gudang berkode "GD-01".
  CONSTRAINT gudang_kode_unik_per_company UNIQUE (company_id, kode),
  CONSTRAINT gudang_kode_tak_kosong CHECK (length(trim(kode)) > 0),
  CONSTRAINT gudang_nama_tak_kosong CHECK (length(trim(nama)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_gudang_company ON gudang(company_id);
CREATE INDEX IF NOT EXISTS idx_gudang_aktif ON gudang(company_id, aktif);

-- ------------------------------------------------------------
-- 2. ASET BISA BERADA DI GUDANG
--
-- `assets` sudah punya `current_project_id` (di proyek mana). Yang hilang:
-- di gudang mana kalau TIDAK sedang di proyek.
--
-- Keduanya sengaja tidak digabung jadi satu kolom polimorfik ("lokasi_tipe +
-- lokasi_id"). Kolom polimorfik tak bisa diberi foreign key, dan FK itulah
-- yang mencegah aset menunjuk gudang yang sudah dihapus.
-- ------------------------------------------------------------
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS gudang_id UUID REFERENCES gudang(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assets_gudang ON assets(gudang_id)
  WHERE gudang_id IS NOT NULL;

/*
  ATURAN POKOK: aset tak boleh berada di dua tempat sekaligus.

  Ini invarian, bukan preferensi — aset yang tercatat di gudang DAN di proyek
  membuat pertanyaan "di mana barang ini" tak punya jawaban, dan itu persis
  pertanyaan yang gudang ada untuk menjawabnya.

  Ditegakkan constraint, bukan hanya di kode: pintu masuk data ke tabel ini
  ada lebih dari satu (route, migrasi, perbaikan manual), dan aturan yang
  hanya hidup di satu pintu akan dilanggar lewat pintu lain.
*/
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_lokasi_tunggal;
ALTER TABLE assets ADD CONSTRAINT assets_lokasi_tunggal
  CHECK (NOT (gudang_id IS NOT NULL AND current_project_id IS NOT NULL));

-- ------------------------------------------------------------
-- 3. PERGERAKAN ASET MENCATAT GUDANG ASAL/TUJUAN
--
-- `asset_movements` sudah punya from_project_id/to_project_id. Pengembalian
-- ke gudang selama ini hanya bisa ditulis sebagai "to_project = NULL", yang
-- berarti "entah ke mana".
-- ------------------------------------------------------------
ALTER TABLE asset_movements
  ADD COLUMN IF NOT EXISTS from_gudang_id UUID REFERENCES gudang(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_gudang_id   UUID REFERENCES gudang(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_asset_mov_to_gudang ON asset_movements(to_gudang_id)
  WHERE to_gudang_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4. STOK MATERIAL DI GUDANG
--
-- `project_stocks` mencatat sisa material PER PROYEK. Yang kembali ke gudang
-- butuh tabel sendiri: kuncinya (gudang, material), bukan (proyek, material).
--
-- Sengaja TIDAK menambah kolom gudang_id ke `project_stocks` — kolom itu akan
-- membuat kunci uniknya ambigu (satu material bisa ada di proyek A dan di
-- gudang sekaligus, dan keduanya baris yang sah).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gudang_stok (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gudang_id    UUID NOT NULL REFERENCES gudang(id) ON DELETE CASCADE,
  material_id  UUID NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  qty          NUMERIC NOT NULL DEFAULT 0,
  -- Dari proyek mana material ini kembali. NULL = pembelian langsung ke
  -- gudang (belum terjadi hari ini, tetapi sah).
  asal_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gudang_stok_unik UNIQUE (gudang_id, material_id),
  -- Stok negatif berarti pencatatan salah, bukan keadaan nyata.
  CONSTRAINT gudang_stok_tak_negatif CHECK (qty >= 0)
);

CREATE INDEX IF NOT EXISTS idx_gudang_stok_gudang ON gudang_stok(gudang_id);
CREATE INDEX IF NOT EXISTS idx_gudang_stok_material ON gudang_stok(material_id);

-- ------------------------------------------------------------
-- 5. RLS
--
-- `gudang` kategori B (punya company_id sendiri). `gudang_stok` kategori C —
-- mewarisi tenancy dari induknya, tak punya company_id sendiri. Pola yang
-- sama dengan `rekening_koran_baris` (migrasi 234) dan `journal_entry_lines`
-- (167): dua sumber kebenaran yang bisa berselisih lebih berbahaya daripada
-- satu subquery.
-- ------------------------------------------------------------
ALTER TABLE gudang      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gudang      FORCE  ROW LEVEL SECURITY;
ALTER TABLE gudang_stok ENABLE ROW LEVEL SECURITY;
ALTER TABLE gudang_stok FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON gudang;
CREATE POLICY tenant_isolation ON gudang
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS tenant_isolation ON gudang_stok;
CREATE POLICY tenant_isolation ON gudang_stok
  USING (EXISTS (SELECT 1 FROM gudang g
                  WHERE g.id = gudang_id AND g.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM gudang g
                       WHERE g.id = gudang_id AND g.company_id = (SELECT auth_company_id())));

-- ------------------------------------------------------------
-- 6. PERMISSION
--
-- Diberikan ke role yang SUDAH punya permission setara secara makna
-- (`assets:manage`), bukan ke nama jabatan — ADR-004.
-- ------------------------------------------------------------
-- `module`, `label`, dan `sort_order` WAJIB — `module` NOT NULL, dan dua
-- lainnya dipakai halaman Matriks Izin untuk mengelompokkan serta mengurutkan.
-- Percobaan pertama hanya mengisi key+description dan ditolak Postgres.
--
-- `module = 'assets'` karena gudang adalah tempat aset berada; mengelompokkannya
-- terpisah akan membuat orang mencari izin gudang di kategori yang salah.
INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('gudang:view',   'assets', 'Lihat gudang',   'Melihat isi gudang dan riwayat pergerakannya', 820),
  ('gudang:manage', 'assets', 'Kelola gudang',  'Mencatat barang masuk/keluar gudang', 821)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM role_permissions rp
  JOIN permissions setara ON setara.id = rp.permission_id AND setara.key = 'assets:manage'
  CROSS JOIN permissions p
 WHERE p.key IN ('gudang:view', 'gudang:manage')
ON CONFLICT DO NOTHING;

-- Yang boleh MELIHAT aset, boleh melihat gudang. Membaca lokasi barang tak
-- lebih sensitif daripada membaca daftar barangnya.
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM role_permissions rp
  JOIN permissions setara ON setara.id = rp.permission_id AND setara.key = 'assets:view'
  CROSS JOIN permissions p
 WHERE p.key = 'gudang:view'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 7. SEED: satu gudang per company yang punya aset
--
-- Founder: gudangnya "belum ada" hari ini. Tetapi tanpa satu baris pun,
-- halaman gudang akan kosong dan tak bisa dinilai — dan kolom `gudang_id`
-- tak akan pernah terisi sehingga constraint di atas tak pernah teruji.
--
-- Satu gudang bertanda jelas, boleh diganti namanya lewat UI kelak.
-- ------------------------------------------------------------
INSERT INTO gudang (id, company_id, kode, nama, alamat, catatan)
SELECT
  ('e0000000-0000-4000-8000-' || substr(replace(c.id::text, '-', ''), 1, 12))::uuid,
  c.id, 'GD-01', 'Gudang Pusat',
  NULL,
  'Dibuat otomatis migrasi 238. Tempat alat dan sisa material kembali sesudah proyek selesai.'
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM assets a WHERE a.company_id = c.id)
ON CONFLICT (company_id, kode) DO NOTHING;

-- Aset yang berstatus 'tersedia' dan TIDAK di proyek mana pun memang sedang
-- di gudang — itulah arti "tersedia". Ditempatkan, bukan dibiarkan NULL:
-- kolom yang tak pernah terisi tak pernah teruji.
UPDATE assets a
   SET gudang_id = g.id, updated_at = now()
  FROM gudang g
 WHERE g.company_id = a.company_id
   AND g.kode = 'GD-01'
   AND a.status = 'tersedia'
   AND a.current_project_id IS NULL
   AND a.gudang_id IS NULL;

-- ------------------------------------------------------------
-- 8. VERIFIKASI — gagal keras kalau artefaknya tak benar-benar terbentuk.
--
-- Pelajaran migrasi 043/142: migrasi bisa tercatat sukses tanpa pernah
-- membuat apa pun.
-- ------------------------------------------------------------
DO $$
DECLARE
  n_gudang INT;
  n_aset_gudang INT;
BEGIN
  IF to_regclass('public.gudang') IS NULL THEN
    RAISE EXCEPTION '238 gagal: tabel gudang tidak terbentuk';
  END IF;
  IF to_regclass('public.gudang_stok') IS NULL THEN
    RAISE EXCEPTION '238 gagal: tabel gudang_stok tidak terbentuk';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'assets' AND column_name = 'gudang_id') THEN
    RAISE EXCEPTION '238 gagal: assets.gudang_id tidak terbentuk';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'asset_movements' AND column_name = 'to_gudang_id') THEN
    RAISE EXCEPTION '238 gagal: asset_movements.to_gudang_id tidak terbentuk';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_lokasi_tunggal') THEN
    RAISE EXCEPTION '238 gagal: constraint assets_lokasi_tunggal tidak terpasang';
  END IF;

  -- RLS wajib menyala. Tabel baru tanpa RLS adalah kebocoran tenant yang
  -- tak menimbulkan gejala apa pun sampai ada tenant kedua.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'gudang'::regclass) THEN
    RAISE EXCEPTION '238 gagal: RLS gudang tidak aktif';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'gudang_stok'::regclass) THEN
    RAISE EXCEPTION '238 gagal: RLS gudang_stok tidak aktif';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'gudang:view') THEN
    RAISE EXCEPTION '238 gagal: permission gudang:view tidak ter-seed';
  END IF;

  SELECT count(*) INTO n_gudang FROM gudang;
  SELECT count(*) INTO n_aset_gudang FROM assets WHERE gudang_id IS NOT NULL;
  RAISE NOTICE '238 OK — gudang=% aset_di_gudang=%', n_gudang, n_aset_gudang;
END $$;
