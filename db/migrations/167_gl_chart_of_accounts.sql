-- ============================================================
-- PURALOKA SUITE — Migration 167
-- GL-1a: Chart of Accounts + Jurnal (skema)
-- ============================================================
--
-- ── Kenapa sekarang
--
-- ADR-011 (multi-tenant) menyebut GL sebagai pemicu tripwire #1: *"begitu
-- ledger berisi jurnal per-entitas, backfill `company_id` tidak lagi lossless
-- — angka gabungan dua entitas tak bisa dipisah mekanis."*
--
-- Tripwire itu sudah dijawab: T1–T7 selesai (diverifikasi 2026-08-02 — 40
-- tabel ber-`company_id`, 102 policy isolasi, company switcher hidup). Jadi GL
-- dibangun DI ATAS pondasi tenant yang sudah ada, bukan mendahuluinya.
--
-- Urutan wajib dari `ERP_MASTER_PLAN` Modul 10:
--   GL-1  CoA + jurnal manual + buku besar     ← migrasi ini
--   GL-2  auto-jurnal (kasbon, payment, PO)
--   GL-3  Balance Sheet / P&L / Cash Flow (PSAK)
--   GL-4  migrasi data historis + opening balance
--
-- ── Tiga tabel, dan kenapa dipisah begitu
--
-- `accounts`             daftar akun (CoA). Per-company: tiap badan usaha
--                        punya bagan akunnya sendiri.
-- `journal_entries`      kepala jurnal — satu transaksi, satu tanggal, satu
--                        keterangan. Nomornya per-company.
-- `journal_entry_lines`  baris debit/kredit. Satu kepala punya ≥2 baris, dan
--                        JUMLAH DEBIT WAJIB = JUMLAH KREDIT.
--
-- Pemisahan kepala/baris bukan selera: itu bentuk baku double-entry, dan satu-
-- satunya cara membuat "debit = kredit" bisa ditegakkan sebagai constraint
-- alih-alih diperiksa di kode yang bisa lupa.
--
-- ── Kategori tenancy: B (company_id LANGSUNG)
--
-- Bukan C (lewat `project_id`): jurnal adalah pembukuan BADAN USAHA, bukan
-- proyek. Satu jurnal bisa menyentuh beberapa proyek (mis. bayar gaji kantor),
-- dan sebagian tak menyentuh proyek sama sekali. `project_id` tetap ada di
-- baris jurnal sebagai DIMENSI opsional — untuk laporan per-proyek — bukan
-- sebagai jalur tenancy.
--
-- ── Yang SENGAJA belum ada di migrasi ini
--
-- Auto-jurnal (GL-2). Menulis pemicunya sekarang berarti membangun di atas CoA
-- yang belum pernah dipakai manusia — dan peta akun di ERP_MASTER_PLAN masih
-- rancangan, belum teruji terhadap transaksi nyata. GL-1 dulu, dipakai, baru
-- otomatisasinya.
-- ============================================================

-- ── 1. accounts — Chart of Accounts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  -- Kode akun ala Indonesia: 1xxx aset · 2xxx liabilitas · 3xxx ekuitas
  -- 4xxx pendapatan · 5xxx beban. Disimpan TEXT, bukan angka: nol di depan
  -- bermakna, dan sebagian kontraktor memakai sub-kode ber-titik (1112.01).
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,

  -- Tipe menentukan ARAH SALDO NORMAL dan di laporan mana ia muncul.
  -- Bukan diturunkan dari digit pertama `code`: kontraktor yang mewarisi bagan
  -- akun lama sering punya penomoran yang tak seragam, dan menebak dari digit
  -- akan salah diam-diam.
  type          TEXT NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),

  -- Hirarki: akun induk untuk pengelompokan laporan. Akun POSTING (yang boleh
  -- menerima jurnal) adalah yang tak punya anak — dijaga di lapisan API.
  parent_id     UUID REFERENCES accounts(id) ON DELETE RESTRICT,

  is_active     BOOLEAN NOT NULL DEFAULT true,
  description   TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Kode unik PER COMPANY, bukan global: dua badan usaha boleh sama-sama
  -- punya '1111 Kas Kantor'.
  CONSTRAINT accounts_code_unik_per_company UNIQUE (company_id, code),

  -- Akun tak boleh jadi induknya sendiri. Siklus yang lebih panjang dijaga
  -- di API (butuh rekursi; constraint tabel tak bisa).
  CONSTRAINT accounts_bukan_induk_sendiri CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_accounts_company ON accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_accounts_parent  ON accounts(parent_id) WHERE parent_id IS NOT NULL;

COMMENT ON TABLE accounts IS
  'Chart of Accounts per badan usaha. `type` menentukan arah saldo normal & '
  'penempatan di laporan — TIDAK diturunkan dari digit `code`, karena bagan '
  'akun warisan sering tak seragam penomorannya.';

-- ── 2. journal_entries — kepala jurnal ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  entry_number  TEXT NOT NULL,
  entry_date    DATE NOT NULL,
  description   TEXT NOT NULL,

  -- 'manual' = diinput manusia (GL-1). Nilai lain disiapkan untuk GL-2 supaya
  -- auto-jurnal tak perlu ALTER TYPE saat menyusul.
  source        TEXT NOT NULL DEFAULT 'manual'
                CHECK (source IN ('manual','kasbon','payment','purchase_order',
                                  'expense','wage','opening_balance')),

  -- Jejak ke baris asalnya, kalau jurnal ini lahir dari transaksi lain (GL-2).
  ref_type      TEXT,
  ref_id        UUID,

  -- Jurnal yang sudah di-POSTING tak boleh diubah — itu inti buku besar.
  -- Koreksi dilakukan lewat jurnal balik, bukan menyunting yang lama.
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  posted_at     TIMESTAMPTZ,
  posted_by     UUID REFERENCES users(id),

  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES users(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT je_number_unik_per_company UNIQUE (company_id, entry_number),

  -- `posted_at` dan status harus sejalan — tanpa ini, jurnal bisa berstatus
  -- posted tanpa tanggal posting, dan laporan periode ikut salah.
  CONSTRAINT je_posted_punya_tanggal
    CHECK ((status = 'posted') = (posted_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_je_company_tanggal ON journal_entries(company_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_je_status          ON journal_entries(company_id, status);
CREATE INDEX IF NOT EXISTS idx_je_ref             ON journal_entries(ref_type, ref_id)
  WHERE ref_id IS NOT NULL;

COMMENT ON TABLE journal_entries IS
  'Kepala jurnal. Status posted = tak boleh diubah (dijaga trigger di migrasi '
  '168); koreksi lewat jurnal balik, bukan menyunting yang lama.';

-- ── 3. journal_entry_lines — baris debit/kredit ─────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id      UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,

  -- DUA kolom, bukan satu kolom bertanda. Alasannya bukan gaya: laporan buku
  -- besar menampilkan kolom debit & kredit terpisah, dan menyimpannya sebagai
  -- satu angka bertanda memaksa setiap pembaca menebak konvensi tandanya.
  debit         NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit        NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Dimensi opsional untuk laporan per-proyek. BUKAN jalur tenancy — itu
  -- `company_id` di kepala jurnal.
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,

  description   TEXT,
  line_order    SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Satu baris mengisi debit ATAU kredit, tak pernah keduanya, tak pernah
  -- kosong. Ini yang membuat "debit = kredit" di tingkat jurnal bermakna.
  CONSTRAINT jel_debit_xor_credit CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  ),
  CONSTRAINT jel_tak_negatif CHECK (debit >= 0 AND credit >= 0)
);

CREATE INDEX IF NOT EXISTS idx_jel_entry   ON journal_entry_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account ON journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_jel_project ON journal_entry_lines(project_id)
  WHERE project_id IS NOT NULL;

COMMENT ON TABLE journal_entry_lines IS
  'Baris debit/kredit. Debit & kredit kolom TERPISAH (bukan satu angka '
  'bertanda) supaya buku besar tak perlu menebak konvensi tanda. '
  'Keseimbangan debit=kredit ditegakkan trigger di migrasi 168.';

-- ── 4. Tenancy: isi company_id otomatis + RLS ───────────────────────────────
-- Pola sama dengan tabel kategori B lain (migrasi 128).
DROP TRIGGER IF EXISTS trg_accounts_isi_company ON accounts;
CREATE TRIGGER trg_accounts_isi_company
  BEFORE INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();

DROP TRIGGER IF EXISTS trg_journal_entries_isi_company ON journal_entries;
CREATE TRIGGER trg_journal_entries_isi_company
  BEFORE INSERT ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();

ALTER TABLE accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;

-- Policy permissive dasar: service_role (API) bypass RLS; yang dijaga di sini
-- akses non-service-role. Pola & nama mengikuti tabel tenant lain.
-- Nama `tenant_isolation` POLOS — konvensi repo ini. Nama tabel sudah ada di
-- kolom `tablename`, dan `t7-exit-criteria-l2.test.ts` mencocokkannya persis:
-- nama yang menyimpang membuat tabel terlihat TAK PUNYA policy sama sekali.
DROP POLICY IF EXISTS tenant_isolation ON accounts;
CREATE POLICY tenant_isolation ON accounts
  FOR ALL USING (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS tenant_isolation ON journal_entries;
CREATE POLICY tenant_isolation ON journal_entries
  FOR ALL USING (company_id = (SELECT auth_company_id()));

-- Baris jurnal mewarisi tenancy dari kepalanya — tak punya `company_id`
-- sendiri, jadi tak ada dua sumber kebenaran yang bisa berselisih.
DROP POLICY IF EXISTS tenant_isolation ON journal_entry_lines;
CREATE POLICY tenant_isolation ON journal_entry_lines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM journal_entries je
       WHERE je.id = journal_entry_lines.entry_id
         AND je.company_id = (SELECT auth_company_id())
    )
  );

-- ── 5. updated_at otomatis ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at ON accounts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON journal_entries;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── Verifikasi ──────────────────────────────────────────────────────────────
-- Migrasi yang "berhasil" tanpa meninggalkan objeknya adalah kelas cacat yang
-- repo ini temui empat kali (161/162/164/166).
DO $$
DECLARE
  hilang TEXT := '';
BEGIN
  FOREACH hilang IN ARRAY ARRAY['accounts','journal_entries','journal_entry_lines'] LOOP
    IF to_regclass(current_schema() || '.' || hilang) IS NULL THEN
      RAISE EXCEPTION 'Tabel % TIDAK terbentuk sesudah migrasi 167', hilang;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE NOT tgisinternal
       AND tgname = 'trg_journal_entries_isi_company'
       AND tgrelid = to_regclass(current_schema() || '.journal_entries')
  ) THEN
    RAISE EXCEPTION 'trg_journal_entries_isi_company TIDAK terpasang sesudah migrasi 167';
  END IF;
END $$;
