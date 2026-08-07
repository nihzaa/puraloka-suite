-- 211 — OPERASIONAL ALAT: pemakaian, perawatan, biaya (TUNDA kelompok B)
--
-- ════════════════════════════════════════════════════════════════════════════
-- KENAPA SEKARANG, DAN APA YANG SUDAH ADA
-- ════════════════════════════════════════════════════════════════════════════
--
-- Triase F5-1 §5 menunda keempat item ini sampai "alat milik sendiri > 5 unit".
-- Diukur 2026-08-07: `assets` **0 baris** — tabelnya sudah ada sejak migrasi
-- 045 dengan 22 kolom lengkap (termasuk `depreciation_method`,
-- `useful_life_months`, `residual_value`), tapi tak pernah terisi.
--
-- Founder memutuskan membangunnya sekarang dengan data dummy. Yang dibangun
-- di sini adalah lapis OPERASIONAL di atas `assets` yang sudah ada:
--
--   1. Log pemakaian alat         → `pemakaian_alat`
--   2. Maintenance terjadwal      → `jadwal_perawatan` + `riwayat_perawatan`
--   3. Biaya operasional per alat → `biaya_operasional_alat`
--   4. Integrasi penyusutan → GL  → `penyusutan_alat` (jurnal per periode)
--
-- ── Kenapa jam-mesin, bukan hanya tanggal
--
-- Alat berat dirawat menurut JAM OPERASI, bukan kalender: excavator yang
-- menganggur sebulan tak butuh ganti oli, yang bekerja 300 jam butuh. Jadwal
-- perawatan menyimpan keduanya (`setiap_jam` DAN `setiap_hari`) dan yang
-- lebih dulu tercapai yang menentukan.
--
-- Menyimpan tanggal saja adalah cara paling umum alat rusak lebih cepat
-- daripada seharusnya — dan biayanya bukan servisnya, melainkan proyek yang
-- berhenti.
--
-- ── Kenapa biaya operasional TERPISAH dari penyusutan
--
-- BBM dan operator adalah biaya yang keluar bulan ini; penyusutan adalah
-- pengakuan atas uang yang sudah keluar dulu. Menyatukannya membuat "biaya
-- alat per jam" mencampur kas nyata dengan alokasi akuntansi — dan angka itu
-- dipakai memutuskan sewa-atau-beli.

BEGIN;

-- ── 1. Log pemakaian alat ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pemakaian_alat (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,

  tanggal       DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Pembacaan meter, BUKAN selisih. Menyimpan selisih membuat satu entri
  -- yang salah merusak seluruh rantai sesudahnya tanpa bisa ditelusuri.
  jam_mulai     NUMERIC(10,2),
  jam_selesai   NUMERIC(10,2),
  operator_id   UUID REFERENCES workers(id) ON DELETE SET NULL,

  keperluan     TEXT,
  catatan       TEXT,

  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Meter tak pernah mundur. Jam selesai < jam mulai berarti salah catat,
  -- dan membiarkannya masuk membuat jam operasi kumulatif jadi omong kosong.
  CONSTRAINT pemakaian_jam_maju CHECK (
    jam_mulai IS NULL OR jam_selesai IS NULL OR jam_selesai >= jam_mulai
  ),
  CONSTRAINT pemakaian_jam_tak_negatif CHECK (
    (jam_mulai IS NULL OR jam_mulai >= 0) AND (jam_selesai IS NULL OR jam_selesai >= 0)
  ),
  -- Satu alat, satu catatan per hari. Dua entri di hari yang sama berarti
  -- jam operasinya terhitung dua kali.
  CONSTRAINT pemakaian_alat_unik UNIQUE (asset_id, tanggal)
);

CREATE INDEX IF NOT EXISTS idx_pemakaian_alat_asset   ON pemakaian_alat(asset_id);
CREATE INDEX IF NOT EXISTS idx_pemakaian_alat_project ON pemakaian_alat(project_id);
CREATE INDEX IF NOT EXISTS idx_pemakaian_alat_tanggal ON pemakaian_alat(tanggal);

-- ── 2. Jadwal perawatan ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jadwal_perawatan (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  nama          TEXT NOT NULL,
  jenis         TEXT NOT NULL DEFAULT 'berkala',

  -- Dua interval. Yang lebih dulu tercapai yang menentukan — excavator
  -- menganggur sebulan tak butuh ganti oli, yang bekerja 300 jam butuh.
  setiap_jam    NUMERIC(10,2),
  setiap_hari   INTEGER,

  -- Titik acuan terakhir. Diperbarui saat perawatan dicatat selesai.
  jam_terakhir     NUMERIC(10,2),
  tanggal_terakhir DATE,

  perkiraan_biaya  NUMERIC(16,2),
  aktif         BOOLEAN NOT NULL DEFAULT true,
  catatan       TEXT,

  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT jadwal_perawatan_jenis_check CHECK (
    jenis = ANY (ARRAY['berkala','preventif','kalibrasi','sertifikasi','lainnya'])
  ),
  -- Jadwal WAJIB punya minimal satu interval. Tanpa keduanya ia tak pernah
  -- jatuh tempo — dan jadwal yang tak pernah jatuh tempo adalah baris yang
  -- terlihat menjaga sesuatu tapi tidak.
  CONSTRAINT jadwal_perawatan_ada_interval CHECK (
    setiap_jam IS NOT NULL OR setiap_hari IS NOT NULL
  ),
  CONSTRAINT jadwal_perawatan_interval_positif CHECK (
    (setiap_jam IS NULL OR setiap_jam > 0) AND (setiap_hari IS NULL OR setiap_hari > 0)
  ),
  CONSTRAINT jadwal_perawatan_unik UNIQUE (asset_id, nama)
);

CREATE INDEX IF NOT EXISTS idx_jadwal_perawatan_asset ON jadwal_perawatan(asset_id);

-- ── 3. Riwayat perawatan ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS riwayat_perawatan (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jadwal_id     UUID REFERENCES jadwal_perawatan(id) ON DELETE SET NULL,
  asset_id      UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  tanggal       DATE NOT NULL DEFAULT CURRENT_DATE,
  jam_meter     NUMERIC(10,2),
  biaya         NUMERIC(16,2) NOT NULL DEFAULT 0,
  bengkel       TEXT,
  uraian        TEXT,
  -- Perawatan tak terjadwal (kerusakan mendadak) dibedakan: rasionya
  -- terhadap yang terjadwal adalah ukuran apakah preventifnya bekerja.
  tak_terjadwal BOOLEAN NOT NULL DEFAULT false,

  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT riwayat_perawatan_biaya_tak_negatif CHECK (biaya >= 0),
  CONSTRAINT riwayat_perawatan_jam_tak_negatif CHECK (jam_meter IS NULL OR jam_meter >= 0)
);

CREATE INDEX IF NOT EXISTS idx_riwayat_perawatan_asset  ON riwayat_perawatan(asset_id);
CREATE INDEX IF NOT EXISTS idx_riwayat_perawatan_jadwal ON riwayat_perawatan(jadwal_id);

-- ── 4. Biaya operasional (BBM, operator, sewa) ────────────────────────────

CREATE TABLE IF NOT EXISTS biaya_operasional_alat (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,

  tanggal       DATE NOT NULL DEFAULT CURRENT_DATE,
  jenis         TEXT NOT NULL,
  jumlah        NUMERIC(16,2) NOT NULL,
  -- Untuk BBM: liter. Dipakai menghitung konsumsi per jam — angka yang
  -- membongkar pencurian solar jauh lebih cepat daripada nominal rupiah.
  kuantitas     NUMERIC(12,2),
  satuan        TEXT,
  uraian        TEXT,

  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT biaya_alat_jenis_check CHECK (
    jenis = ANY (ARRAY['bbm','operator','sewa','pelumas','ban','retribusi','lainnya'])
  ),
  CONSTRAINT biaya_alat_jumlah_positif CHECK (jumlah > 0),
  CONSTRAINT biaya_alat_kuantitas_tak_negatif CHECK (kuantitas IS NULL OR kuantitas > 0)
);

CREATE INDEX IF NOT EXISTS idx_biaya_alat_asset   ON biaya_operasional_alat(asset_id);
CREATE INDEX IF NOT EXISTS idx_biaya_alat_tanggal ON biaya_operasional_alat(tanggal);

-- ── 5. Penyusutan per periode (jembatan ke GL) ────────────────────────────

CREATE TABLE IF NOT EXISTS penyusutan_alat (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Periode = bulan. Disimpan sebagai tanggal 1 supaya bisa diurutkan dan
  -- dibandingkan tanpa parsing string.
  periode       DATE NOT NULL,
  nilai         NUMERIC(16,2) NOT NULL,
  -- Akumulasi SAMPAI periode ini. Disimpan supaya nilai buku bisa dibaca
  -- tanpa menjumlah ulang seluruh riwayat — dan supaya koreksi di masa lalu
  -- terlihat sebagai ketidakcocokan, bukan hilang.
  akumulasi     NUMERIC(16,2) NOT NULL,

  -- Sudah dijurnal ke GL? `journal_entry_id` null = belum.
  journal_entry_id UUID,
  dijurnal_pada TIMESTAMPTZ,

  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT penyusutan_nilai_tak_negatif CHECK (nilai >= 0),
  CONSTRAINT penyusutan_akumulasi_tak_negatif CHECK (akumulasi >= 0),
  -- Akumulasi tak boleh lebih kecil dari nilai periode ini — itu berarti
  -- riwayatnya tak konsisten.
  CONSTRAINT penyusutan_akumulasi_wajar CHECK (akumulasi >= nilai),
  -- Sudah dijurnal WAJIB punya waktunya. "Dijurnal entah kapan" tak bisa
  -- direkonsiliasi dengan buku besar.
  CONSTRAINT penyusutan_jurnal_lengkap CHECK (
    journal_entry_id IS NULL OR dijurnal_pada IS NOT NULL
  ),
  -- Satu alat, satu penyusutan per periode. Dua berarti bebannya dobel.
  CONSTRAINT penyusutan_alat_unik UNIQUE (asset_id, periode)
);

CREATE INDEX IF NOT EXISTS idx_penyusutan_asset   ON penyusutan_alat(asset_id);
CREATE INDEX IF NOT EXISTS idx_penyusutan_periode ON penyusutan_alat(periode);

-- ── RLS — permission, BUKAN literal peran (ADR-004 Rule #2) ───────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pemakaian_alat','jadwal_perawatan','riwayat_perawatan',
                           'biaya_operasional_alat','penyusutan_alat']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE
         USING (company_id = (SELECT auth_company_id()))', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_baca', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT
         USING ((SELECT has_permission(''assets:view'')))', t || '_baca', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_kelola', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL
         USING ((SELECT has_permission(''assets:manage'')))
         WITH CHECK ((SELECT has_permission(''assets:manage'')))',
      t || '_kelola', t);
  END LOOP;
END $$;

-- ── Verifikasi ────────────────────────────────────────────────────────────
DO $$
DECLARE n_tabel int; n_policy int;
BEGIN
  SELECT count(*) INTO n_tabel FROM information_schema.tables
   WHERE table_schema='public'
     AND table_name IN ('pemakaian_alat','jadwal_perawatan','riwayat_perawatan',
                        'biaya_operasional_alat','penyusutan_alat');
  IF n_tabel <> 5 THEN
    RAISE EXCEPTION 'Hanya % dari 5 tabel alat terbentuk', n_tabel;
  END IF;

  SELECT count(*) INTO n_policy FROM pg_policy
   WHERE polrelid IN ('pemakaian_alat'::regclass, 'jadwal_perawatan'::regclass,
                      'riwayat_perawatan'::regclass, 'biaya_operasional_alat'::regclass,
                      'penyusutan_alat'::regclass);
  IF n_policy < 15 THEN
    RAISE EXCEPTION 'Policy kurang: % dari 15 (5 tabel x 3)', n_policy;
  END IF;

  RAISE NOTICE 'OK: 5 tabel operasional alat + % policy.', n_policy;
END $$;

COMMIT;
