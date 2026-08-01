-- Migration 152: Rantai Kontrak — EOT, LD arah kontraktor, register jaminan
-- ROADMAP #16 · Lima Pembeda #5
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA BUKAN "TINGGAL PAKAI penalty engine 091"
-- ══════════════════════════════════════════════════════════════════════════
--
-- 091 membangun denda untuk KLIEN yang telat MEMBAYAR invoice. Yang dibutuhkan
-- tender pemerintah adalah kebalikannya: *liquidated damages* untuk KONTRAKTOR
-- yang telat MENYELESAIKAN pekerjaan. Arah uangnya berlawanan, dan dasar
-- perhitungannya berbeda secara mendasar:
--
--   091 : dari `invoices.due_date` — tanggal jatuh tempo, TETAP
--   152 : dari `projects.end_date` — yang BISA BERGESER secara sah lewat EOT
--
-- EOT (*extension of time*) adalah perpanjangan waktu karena hal di luar
-- kendali kontraktor: cuaca ekstrem, keterlambatan penyerahan lahan, perubahan
-- lingkup dari pemberi kerja. Menghitung LD dari `end_date` mentah berarti
-- menagih denda atas keterlambatan yang **sudah dimaafkan secara kontraktual**
-- — bukan sekadar angka salah, melainkan tagihan yang tak bisa dipertahankan.
--
-- Itulah kenapa EOT dan LD lahir di migrasi yang sama: memisahkannya berarti
-- ada jendela waktu ketika LD hidup tanpa EOT, dan setiap angka yang keluar di
-- jendela itu salah.
--
-- ── DEFAULT OFF, mengikuti pola 091
--
-- Puraloka saat ini tak menerapkan denda ke arah mana pun (klien mayoritas
-- perorangan, hubungan personal — DOMAIN.md §Denda). Mesin dibangun supaya bisa
-- DINYALAKAN tanpa deploy saat ikut tender pemerintah. Default OFF = nol
-- perubahan perilaku hari ini.
--
-- ── Kategori tenancy
--
-- `contract_eot` & `contract_bonds` = **C** (lewat `project_id NOT NULL`).
-- Bukan B: keduanya melekat pada satu proyek, dan proyek sudah jadi ANCHOR
-- tenancy. Menambah `company_id` di sini menciptakan dua sumber kebenaran yang
-- bisa berbeda — persis yang dihindari di `asset_movements` (149).

BEGIN;

-- ── 1. Syarat LD global (financial_config, effective-dated) ─────────────────
-- Reuse mesin config 086 + EXCLUDE anti-overlap per-company (145). Semua
-- parameter = config, bukan konstanta — syarat #1 founder di 091.
-- Nilai fraksi 0..1: 0.001 = 1‰/hari, 0.05 = 5% (praktik Perpres 12/2021).
-- Konvensi kunci & `value_type` DIVERIFIKASI ke baris `penalty.*` yang sudah
-- ada, bukan diasumsikan: pemisah TITIK (bukan underscore), `value` bertipe
-- JSON (boolean ditulis `false`, bukan '0'), dan `value_type` NOT NULL tanpa
-- default. Menebak salah satunya membuat seed ini lolos tapi tak pernah
-- terbaca pembacanya — nilai default diam-diam dipakai selamanya.
INSERT INTO financial_config (company_id, key, value, value_type, effective_from, note)
SELECT c.id, k.key, k.val::jsonb, k.tipe, DATE '1970-01-01',
       'Seed LD kontraktor (migrasi 152) — DEFAULT OFF, dinyalakan lewat UI'
  FROM companies c
  CROSS JOIN (VALUES
    ('ld.enabled',      'false',           'boolean'),   -- DEFAULT OFF
    ('ld.basis',        '"nilai_kontrak"', 'string'),
    ('ld.rate_per_day', '0.001',           'number'),    -- 1‰/hari
    ('ld.cap_pct',      '0.05',            'number'),    -- maksimum 5%
    ('ld.grace_days',   '0',               'number')
  ) AS k(key, val, tipe)
ON CONFLICT DO NOTHING;

-- ── 2. Override per proyek (null = pakai global efektif) ────────────────────
-- Denda = syarat KONTRAK, beda per pemberi kerja. Pola sama `retensi_pct` &
-- `penalty_*` (091).
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS ld_enabled       BOOLEAN,
  ADD COLUMN IF NOT EXISTS ld_basis         TEXT,
  ADD COLUMN IF NOT EXISTS ld_rate_per_day  NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS ld_cap_pct       NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS ld_grace_days    INTEGER,
  -- Pemutihan LD — butuh capability + alasan + audit, sama seperti waiver 091.
  ADD COLUMN IF NOT EXISTS ld_waived        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ld_waived_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_ld_basis') THEN
    ALTER TABLE projects ADD CONSTRAINT chk_projects_ld_basis
      CHECK (ld_basis IS NULL OR ld_basis IN ('nilai_kontrak','sisa_pekerjaan'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_ld_rate') THEN
    -- Tarif negatif = kontraktor DIBAYAR karena telat. Batas atas 10%/hari
    -- jauh di atas praktik mana pun, jadi apa pun di atasnya = salah ketik.
    ALTER TABLE projects ADD CONSTRAINT chk_projects_ld_rate
      CHECK (ld_rate_per_day IS NULL OR (ld_rate_per_day >= 0 AND ld_rate_per_day <= 0.1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_projects_ld_cap') THEN
    ALTER TABLE projects ADD CONSTRAINT chk_projects_ld_cap
      CHECK (ld_cap_pct IS NULL OR (ld_cap_pct >= 0 AND ld_cap_pct <= 1));
  END IF;
END $$;

COMMENT ON COLUMN projects.ld_enabled IS
  'Override LD (denda kontraktor telat selesai) per proyek. NULL = pakai financial_config global. JANGAN tertukar dengan penalty_* (091) yang arahnya klien telat BAYAR.';

-- ── 3. EOT — perpanjangan waktu ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_eot (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Nomor dari pemberi kerja bila ada; penomoran kita sendiri tak dipakai
  -- karena yang dirujuk saat berkorespondensi adalah nomor MEREKA.
  eot_number     TEXT,
  days_requested INTEGER NOT NULL CHECK (days_requested >= 0),
  -- Hari yang benar-benar DISETUJUI — sering lebih kecil dari yang diajukan.
  -- Memakai days_requested untuk menggeser tanggal berarti kontraktor
  -- menentukan tenggatnya sendiri.
  days_approved  INTEGER CHECK (days_approved IS NULL OR days_approved >= 0),

  reason         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'diajukan'
                 CHECK (status IN ('diajukan','disetujui','ditolak')),

  submitted_at   DATE NOT NULL DEFAULT CURRENT_DATE,
  decided_at     DATE,
  decided_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  decision_note  TEXT,

  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_eot_tanggal CHECK (decided_at IS NULL OR decided_at >= submitted_at),
  -- Yang sudah diputus WAJIB punya tanggal keputusan; tanpa ini "disetujui"
  -- bisa muncul tanpa jejak kapan dan oleh siapa.
  CONSTRAINT chk_eot_diputus CHECK (
    status = 'diajukan' OR decided_at IS NOT NULL),
  -- Yang disetujui WAJIB menyebut berapa hari yang disetujui — NULL di sini
  -- akan diam-diam dibaca sebagai nol hari oleh lapisan mana pun yang lupa.
  CONSTRAINT chk_eot_hari_disetujui CHECK (
    status <> 'disetujui' OR days_approved IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_eot_project ON contract_eot (project_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_eot_project_number
  ON contract_eot (project_id, eot_number) WHERE eot_number IS NOT NULL;

-- ── 4. Register jaminan (bond) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_bonds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Jaminan PENAWARAN terbit sebelum proyek ada, jadi nullable + bid_id.
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  bid_id        UUID REFERENCES bids(id) ON DELETE SET NULL,
  company_id    UUID NOT NULL REFERENCES companies(id),

  bond_type     TEXT NOT NULL
                CHECK (bond_type IN ('penawaran','pelaksanaan','uang_muka','pemeliharaan')),
  bond_number   TEXT,
  issuer        TEXT,                 -- bank / asuransi penerbit
  amount        NUMERIC(18,2) NOT NULL CHECK (amount >= 0),

  issued_date   DATE NOT NULL,
  expiry_date   DATE NOT NULL,

  status        TEXT NOT NULL DEFAULT 'aktif'
                CHECK (status IN ('aktif','dikembalikan','dicairkan','kadaluarsa')),
  released_at   DATE,
  notes         TEXT,

  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_bond_tanggal CHECK (expiry_date >= issued_date),
  -- Jaminan harus melekat pada SESUATU. Tanpa ini ia jadi baris yatim yang
  -- tak muncul di layar mana pun — uang yang hilang dari pandangan.
  CONSTRAINT chk_bond_induk CHECK (project_id IS NOT NULL OR bid_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_bond_company_status ON contract_bonds (company_id, status);
CREATE INDEX IF NOT EXISTS idx_bond_expiry ON contract_bonds (expiry_date)
  WHERE status = 'aktif';
CREATE INDEX IF NOT EXISTS idx_bond_project ON contract_bonds (project_id)
  WHERE project_id IS NOT NULL;

-- ── 5. RLS ──────────────────────────────────────────────────────────────────
-- Nama policy WAJIB `tenant_isolation` (dijaga t5a/t7), dan RESTRICTIVE WAJIB
-- didampingi PERMISSIVE — himpunan permissive kosong bernilai FALSE, sehingga
-- tabelnya mati total. Cacat itu terjadi kemarin di migrasi 149 dan hanya
-- tertangkap penjaga; di sini keduanya dipasang sekaligus.
ALTER TABLE contract_eot   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_bonds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON contract_eot;
CREATE POLICY tenant_isolation ON contract_eot AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = contract_eot.project_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = contract_eot.project_id
                    AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON contract_bonds;
CREATE POLICY tenant_isolation ON contract_bonds AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS contract_eot_baca ON contract_eot;
CREATE POLICY contract_eot_baca ON contract_eot
  FOR SELECT TO authenticated USING ((SELECT has_permission('projects:view')));

DROP POLICY IF EXISTS contract_eot_kelola ON contract_eot;
CREATE POLICY contract_eot_kelola ON contract_eot
  FOR ALL TO authenticated
  USING ((SELECT has_permission('projects:edit')))
  WITH CHECK ((SELECT has_permission('projects:edit')));

DROP POLICY IF EXISTS contract_bonds_baca ON contract_bonds;
CREATE POLICY contract_bonds_baca ON contract_bonds
  FOR SELECT TO authenticated USING ((SELECT has_permission('projects:view')));

DROP POLICY IF EXISTS contract_bonds_kelola ON contract_bonds;
CREATE POLICY contract_bonds_kelola ON contract_bonds
  FOR ALL TO authenticated
  USING ((SELECT has_permission('projects:edit')))
  WITH CHECK ((SELECT has_permission('projects:edit')));

-- ── 6. Capability pemutihan LD ──────────────────────────────────────────────
-- Sengaja TERPISAH dari `finance:penalty:waive` (091): memutihkan denda yang
-- kita TERIMA dan denda yang kita BAYAR adalah dua wewenang berbeda, dan
-- menyatukannya berarti siapa pun yang boleh memaafkan klien otomatis boleh
-- memaafkan denda perusahaan sendiri.
INSERT INTO permissions (key, module, label, description) VALUES
  ('contract:ld:waive', 'contract', 'Putihkan denda LD',
   'Memutihkan denda keterlambatan penyelesaian (LD) — wajib disertai alasan & tercatat di audit')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'contract:ld:waive'
   AND EXISTS (SELECT 1 FROM role_permissions rp
                 JOIN permissions p2 ON p2.id = rp.permission_id
                WHERE rp.role_id = r.id AND p2.key = 'finance:penalty:waive')
ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS trg_protect_eot_created_at ON contract_eot;
CREATE TRIGGER trg_protect_eot_created_at BEFORE UPDATE ON contract_eot
  FOR EACH ROW EXECUTE FUNCTION protect_created_at_generik();

DROP TRIGGER IF EXISTS trg_protect_bonds_created_at ON contract_bonds;
CREATE TRIGGER trg_protect_bonds_created_at BEFORE UPDATE ON contract_bonds
  FOR EACH ROW EXECUTE FUNCTION protect_created_at_generik();

-- ── 7. Verifikasi — gagal BERISIK ───────────────────────────────────────────
DO $$
DECLARE v_p UUID; t TEXT; n INT;
BEGIN
  FOREACH t IN ARRAY ARRAY['contract_eot','contract_bonds'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '152 GAGAL: tabel % tak terbentuk', t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = t) THEN
      RAISE EXCEPTION '152 GAGAL: RLS tidak menyala di %', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE tablename = t AND policyname = 'tenant_isolation'
                      AND permissive = 'RESTRICTIVE') THEN
      RAISE EXCEPTION '152 GAGAL: tenant_isolation restriktif tak ada di %', t;
    END IF;
    -- Pelajaran 149/150: RESTRICTIVE tanpa PERMISSIVE = tabel mati total.
    SELECT count(*) INTO n FROM pg_policies
     WHERE tablename = t AND permissive = 'PERMISSIVE';
    IF n = 0 THEN
      RAISE EXCEPTION '152 GAGAL: % nol policy permissive — tabel akan mati total', t;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'contract:ld:waive') THEN
    RAISE EXCEPTION '152 GAGAL: capability contract:ld:waive tak terbentuk';
  END IF;

  -- LD WAJIB default OFF — kalau tidak, 15 proyek yang ada langsung punya
  -- denda berjalan tanpa seorang pun memutuskannya.
  IF NOT EXISTS (SELECT 1 FROM financial_config WHERE key = 'ld.enabled') THEN
    RAISE EXCEPTION '152 GAGAL: seed ld.enabled tak masuk — konvensi kunci/tipe salah';
  END IF;
  IF EXISTS (SELECT 1 FROM financial_config
              WHERE key = 'ld.enabled' AND value::text <> 'false') THEN
    RAISE EXCEPTION '152 GAGAL: ld.enabled tidak default OFF';
  END IF;

  SELECT id INTO v_p FROM projects WHERE is_deleted IS NOT TRUE ORDER BY created_at LIMIT 1;
  IF v_p IS NULL THEN
    RAISE NOTICE '152: nol proyek — uji fungsional dilewati';
  ELSE
    BEGIN
      -- EOT 'disetujui' tanpa days_approved harus DITOLAK.
      BEGIN
        INSERT INTO contract_eot (project_id, days_requested, reason, status, decided_at)
          VALUES (v_p, 30, '[UJI] tanpa hari disetujui', 'disetujui', CURRENT_DATE);
        RAISE EXCEPTION '152 GAGAL: EOT disetujui tanpa days_approved tidak ditolak';
      EXCEPTION WHEN check_violation THEN NULL;
      END;

      -- EOT 'disetujui' tanpa decided_at harus DITOLAK.
      BEGIN
        INSERT INTO contract_eot (project_id, days_requested, days_approved, reason, status)
          VALUES (v_p, 30, 30, '[UJI] tanpa tanggal keputusan', 'disetujui');
        RAISE EXCEPTION '152 GAGAL: EOT disetujui tanpa decided_at tidak ditolak';
      EXCEPTION WHEN check_violation THEN NULL;
      END;

      -- Yang benar harus LOLOS — constraint yang menolak semuanya juga cacat.
      INSERT INTO contract_eot (project_id, days_requested, days_approved, reason, status, decided_at)
        VALUES (v_p, 30, 21, '[UJI] cuaca ekstrem', 'disetujui', CURRENT_DATE);

      -- Jaminan tanpa induk (project & bid keduanya NULL) harus DITOLAK.
      BEGIN
        INSERT INTO contract_bonds (company_id, bond_type, amount, issued_date, expiry_date)
          SELECT p.company_id, 'pelaksanaan', 1000, CURRENT_DATE, CURRENT_DATE + 30
            FROM projects p WHERE p.id = v_p;
        RAISE EXCEPTION '152 GAGAL: jaminan tanpa induk tidak ditolak';
      EXCEPTION WHEN check_violation THEN NULL;
      END;

      -- Kadaluarsa sebelum terbit harus DITOLAK.
      BEGIN
        INSERT INTO contract_bonds (project_id, company_id, bond_type, amount, issued_date, expiry_date)
          SELECT p.id, p.company_id, 'pelaksanaan', 1000, CURRENT_DATE, CURRENT_DATE - 1
            FROM projects p WHERE p.id = v_p;
        RAISE EXCEPTION '152 GAGAL: expiry_date < issued_date tidak ditolak';
      EXCEPTION WHEN check_violation THEN NULL;
      END;

      RAISE EXCEPTION 'UJI152_SELESAI';
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM <> 'UJI152_SELESAI' THEN RAISE; END IF;
    END;
  END IF;

  RAISE NOTICE '152 OK: EOT + register jaminan siap, LD default OFF, constraint aktif';
END $$;

COMMIT;
