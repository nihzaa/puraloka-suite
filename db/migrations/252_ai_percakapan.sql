-- ============================================================================
-- 252 — PERCAKAPAN AI: riwayat, blok tool, retensi, saklar mati (TJS-C1)
-- ============================================================================
--
-- ── Kenapa blok tool IKUT disimpan (perbaikan C-5 TJS)
--
-- TJS hanya menyimpan teks user/assistant. Akibatnya tiap pesan baru mulai
-- tanpa konteks tool ronde sebelumnya, dan percakapan yang wajar di konstruksi
-- jadi mustahil:
--
--     "cek stok besi D16"        -> tool mengembalikan 240 batang
--     "cukup untuk lantai 3?"    -> model tak lagi tahu angka 240
--
-- Karena itu `ai_pesan.blok` menyimpan SELURUH blok — teks, `tool_use`, dan
-- `tool_result` — bukan hanya teksnya.
--
-- ── Kenapa `jsonb`, bukan kolom terpisah per jenis blok
--
-- Bentuk blok berbeda antar penyedia dan berubah saat penyedia menambah jenis
-- baru. Kolom bertipe tetap akan menuntut migrasi tiap kali itu terjadi, dan
-- migrasi yang tertunda berarti blok jenis baru DIBUANG diam-diam.
--
-- Yang TIDAK diserahkan ke jsonb: peran, urutan, dan penanda kesalahan —
-- ketiganya kolom sungguhan karena dipakai untuk menyaring dan mengurutkan.
--
-- ── Retensi per tenant (kriteria B1 yang tertunda, kini bisa dikerjakan)
--
-- Bawaannya 30 hari, bukan selamanya. Percakapan AI memuat kutipan data
-- operasional — nama klien, nilai kontrak, catatan lapangan — dan menyimpannya
-- tanpa batas berarti satu kebocoran basis membuka riwayat bertahun-tahun.
--
-- Retensinya kolom, bukan konstanta, karena tenant yang diaudit mungkin wajib
-- menyimpan lebih lama, dan yang tidak lebih memilih sesingkat mungkin.
--
-- ── Saklar mati per tenant (§5.5)
--
-- `ai_aktif` di `ai_pengaturan_tenant`. Mematikan AI TIDAK boleh menyentuh
-- modul lain — karena itu ia baris konfigurasi, bukan feature flag global atau
-- pencabutan permission (mencabut permission juga menyembunyikan halaman
-- pengaturannya, sehingga tenant tak bisa menyalakannya kembali sendiri).
--
-- Semua waktu `timestamptz` (CLAUDE.md §5.4).
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Pengaturan lapisan AI per tenant — saklar mati + retensi
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_pengaturan_tenant (
  company_id  UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,

  -- Saklar mati (§5.5). Satu baris, satu tenant, nol dampak ke modul lain.
  ai_aktif    BOOLEAN NOT NULL DEFAULT true,

  -- Hari. NULL = simpan selamanya, dan itu HARUS pilihan sadar.
  retensi_hari INTEGER DEFAULT 30,

  dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_oleh UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT ai_pengaturan_retensi_wajar
    CHECK (retensi_hari IS NULL OR retensi_hari BETWEEN 1 AND 3650)
);

COMMENT ON TABLE ai_pengaturan_tenant IS
  'Saklar mati lapisan AI + retensi percakapan, per tenant. Mematikan AI di '
  'sini tak menyentuh modul lain — itu sebabnya bukan feature flag global.';

-- ------------------------------------------------------------
-- 2. Percakapan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_percakapan (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  asisten     TEXT NOT NULL,
  judul       TEXT,
  kanal       TEXT NOT NULL DEFAULT 'web',

  -- SATU GILIRAN PER USER (kriteria C-4). Dipegang di basis, bukan di memori
  -- proses: dua instance API akan punya dua memori yang tak saling tahu, dan
  -- dua pesan bersamaan tetap saling menimpa.
  giliran_terkunci_pada TIMESTAMPTZ,

  dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ai_percakapan_asisten_sah
    CHECK (asisten IN ('insight', 'owner', 'staff', 'web')),
  CONSTRAINT ai_percakapan_kanal_sah
    CHECK (kanal IN ('web', 'ai_whatsapp', 'api'))
);

CREATE INDEX IF NOT EXISTS idx_ai_percakapan_company_waktu
  ON ai_percakapan(company_id, diperbarui_pada DESC);
CREATE INDEX IF NOT EXISTS idx_ai_percakapan_user
  ON ai_percakapan(user_id, diperbarui_pada DESC);

-- ------------------------------------------------------------
-- 3. Pesan — termasuk blok tool (C-5)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_pesan (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  percakapan_id  UUID NOT NULL REFERENCES ai_percakapan(id) ON DELETE CASCADE,

  peran   TEXT NOT NULL,
  urutan  INTEGER NOT NULL,

  -- Teks datar, untuk ditampilkan. NULL pada pesan yang isinya murni tool.
  teks    TEXT,

  -- SELURUH blok apa adanya, termasuk tool_use & tool_result (C-5).
  -- Inilah yang membuat "cek stok" -> "cukup untuk lantai 3?" tetap nyambung.
  blok    JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Ronde ke berapa dalam satu giliran tool-calling.
  ronde   INTEGER NOT NULL DEFAULT 1,

  -- Ditandai bila pesan ini membawa hasil tool yang GAGAL (C-6). Kolom, bukan
  -- hanya di dalam jsonb, supaya "berapa sering tool gagal" bisa ditanyakan
  -- tanpa membongkar jsonb tiap baris.
  ada_galat_tool BOOLEAN NOT NULL DEFAULT false,

  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ai_pesan_peran_sah CHECK (peran IN ('user', 'assistant', 'tool')),
  CONSTRAINT ai_pesan_urutan_positif CHECK (urutan >= 0),
  CONSTRAINT ai_pesan_unik_urutan UNIQUE (percakapan_id, urutan)
);

CREATE INDEX IF NOT EXISTS idx_ai_pesan_percakapan
  ON ai_pesan(percakapan_id, urutan);
CREATE INDEX IF NOT EXISTS idx_ai_pesan_company_waktu
  ON ai_pesan(company_id, dibuat_pada DESC);

COMMENT ON COLUMN ai_pesan.blok IS
  'SELURUH blok termasuk tool_use/tool_result (perbaikan C-5 TJS: riwayat yang '
  'hanya menyimpan teks membuat tiap pesan baru kehilangan hasil tool ronde '
  'sebelumnya).';

-- ------------------------------------------------------------
-- 4. Tenancy — kategori B
-- ------------------------------------------------------------
ALTER TABLE ai_pengaturan_tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_percakapan        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_pesan             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON ai_pengaturan_tenant;
CREATE POLICY tenant_isolation ON ai_pengaturan_tenant AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS ai_pengaturan_tenant_kelola ON ai_pengaturan_tenant;
CREATE POLICY ai_pengaturan_tenant_kelola ON ai_pengaturan_tenant FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation ON ai_percakapan;
CREATE POLICY tenant_isolation ON ai_percakapan AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS ai_percakapan_kelola ON ai_percakapan;
CREATE POLICY ai_percakapan_kelola ON ai_percakapan FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation ON ai_pesan;
CREATE POLICY tenant_isolation ON ai_pesan AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS ai_pesan_kelola ON ai_pesan;
CREATE POLICY ai_pesan_kelola ON ai_pesan FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION fn_ai_sentuh()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.diperbarui_pada := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ai_pengaturan_sentuh ON ai_pengaturan_tenant;
CREATE TRIGGER trg_ai_pengaturan_sentuh
  BEFORE UPDATE ON ai_pengaturan_tenant
  FOR EACH ROW EXECUTE FUNCTION fn_ai_sentuh();

DROP TRIGGER IF EXISTS trg_ai_percakapan_sentuh ON ai_percakapan;
CREATE TRIGGER trg_ai_percakapan_sentuh
  BEFORE UPDATE ON ai_percakapan
  FOR EACH ROW EXECUTE FUNCTION fn_ai_sentuh();

-- ------------------------------------------------------------
-- 5. Permission
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description, sort_order)
VALUES
  ('ai:chat', 'ai', 'Memakai asisten AI',
   'Bertanya kepada asisten. Asisten hanya MEMBACA — tak ada tool yang menulis.', 940),
  ('ai:history:view', 'ai', 'Melihat riwayat percakapan AI',
   'Membaca percakapan AI miliknya sendiri.', 941)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE p.key IN ('ai:chat', 'ai:history:view') AND r.name IN ('admin', 'pm')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 6. Seed pengaturan untuk tenant yang punya anggota
--
-- Hanya yang beranggota — pelajaran migrasi 245: menyemai untuk tenant uji
-- kosong menghasilkan barisan mati yang melatih mata mengabaikan tabelnya.
-- ------------------------------------------------------------
INSERT INTO ai_pengaturan_tenant (company_id, ai_aktif, retensi_hari)
SELECT DISTINCT c.id, true, 30
FROM companies c
WHERE EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = c.id)
ON CONFLICT (company_id) DO NOTHING;

-- ------------------------------------------------------------
-- 7. Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE v_n INT;
BEGIN
  FOR v_n IN
    SELECT 1 FROM (VALUES ('ai_pengaturan_tenant'), ('ai_percakapan'), ('ai_pesan')) t(n)
    WHERE to_regclass('public.' || t.n) IS NULL
  LOOP
    RAISE EXCEPTION '252 gagal: ada tabel yang tidak terbentuk';
  END LOOP;

  FOR v_n IN
    SELECT 1 FROM (VALUES ('ai_pengaturan_tenant'), ('ai_percakapan'), ('ai_pesan')) t(n)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = t.n AND policyname = 'tenant_isolation' AND permissive = 'RESTRICTIVE'
    )
  LOOP
    RAISE EXCEPTION '252 gagal: ada tabel tanpa tenant_isolation RESTRICTIVE';
  END LOOP;

  /*
    ⚠ Seed di atas disaring `WHERE EXISTS (company_members)` — pagar ini
    memakai syarat yang SAMA. Diperbaiki 2026-09-04, sama seperti 245 dan 250.

    Di schema bersih nol user → nol anggota (migrasi 126 mengisi
    `company_members` dari tabel users) → nol seed. Itu hasil yang BENAR,
    bukan kegagalan. Pola `IF … IS NOT NULL` yang setara sudah dipakai
    migrasi 270.
  */
  SELECT count(*) INTO v_n FROM ai_pengaturan_tenant;
  IF v_n = 0 AND EXISTS (SELECT 1 FROM company_members) THEN
    RAISE EXCEPTION
      '252 gagal: pengaturan tenant tidak ter-seed padahal ada tenant beranggota';
  END IF;

  /*
    Blok tool WAJIB bisa disimpan — inilah perbaikan C-5, dan migrasi yang
    membuat kolomnya tapi tak membuktikannya bisa diisi tak membuktikan apa pun.

    ⚠ Pembuktiannya butuh SATU user sungguhan (`JOIN users u ON u.id = …`).
    Di schema BERSIH tak ada satu pun user, jadi INSERT-nya menghasilkan NOL
    baris, pesannya tak pernah tersimpan, dan pagarnya menyala atas keadaan
    yang bukan kegagalan.

    Diukur di CI 2026-09-04: replay bersih lolos 251 migrasi lalu tumbang di
    sini. Yang dilewati bukan pembuktiannya — hanya keadaan di mana ia tak
    bisa dijalankan sama sekali. Di lingkungan mana pun yang punya user
    (dev, staging, produksi) pembuktian C-5 tetap berjalan penuh.

    Pola `IF … IS NOT NULL THEN` yang setara sudah dipakai migrasi 270.
  */
  IF EXISTS (SELECT 1 FROM users) AND EXISTS (SELECT 1 FROM companies) THEN
  BEGIN
    INSERT INTO ai_percakapan (id, company_id, user_id, asisten)
    SELECT '00000000-0000-0000-0000-0000000000c5', c.id, u.id, 'staff'
    FROM companies c JOIN users u ON u.id = (SELECT id FROM users LIMIT 1)
    LIMIT 1;

    INSERT INTO ai_pesan (company_id, percakapan_id, peran, urutan, blok, ada_galat_tool)
    SELECT company_id, id, 'assistant', 0,
           '[{"type":"tool_use","id":"t1","name":"cekStok","input":{"kode":"D16"}}]'::jsonb,
           false
    FROM ai_percakapan WHERE id = '00000000-0000-0000-0000-0000000000c5';

    IF NOT EXISTS (
      SELECT 1 FROM ai_pesan
      WHERE percakapan_id = '00000000-0000-0000-0000-0000000000c5'
        AND blok @> '[{"type":"tool_use"}]'::jsonb
    ) THEN
      RAISE EXCEPTION '252 gagal: blok tool_use tidak tersimpan (C-5 tak terbukti)';
    END IF;

    -- Bersihkan baris ujinya sendiri.
    DELETE FROM ai_percakapan WHERE id = '00000000-0000-0000-0000-0000000000c5';
  END;
  END IF;

  /*
    Retensi tak masuk akal ditolak.

    ⚠ Dijaga dengan alasan yang sama: `UPDATE … WHERE company_id = (SELECT …
    LIMIT 1)` atas tabel KOSONG meng-update nol baris, tak melanggar CHECK
    apa pun, lalu `RAISE EXCEPTION` di bawahnya menyala — melaporkan
    "retensi 0 tidak ditolak" padahal tak ada baris yang pernah diuji.

    Cacat yang sama bentuknya dengan blok C-5 di atas, dan sama tak
    terlihatnya: keduanya melapor kegagalan pembuktian, bukan ketiadaan
    bahan untuk membuktikan.
  */
  IF EXISTS (SELECT 1 FROM ai_pengaturan_tenant) THEN
  BEGIN
    UPDATE ai_pengaturan_tenant SET retensi_hari = 0
    WHERE company_id = (SELECT company_id FROM ai_pengaturan_tenant LIMIT 1);
    RAISE EXCEPTION '252 gagal: retensi 0 tidak ditolak';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
  END IF;
END $$;
