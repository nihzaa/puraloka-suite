-- ════════════════════════════════════════════════════════════════════════════
-- 200 — Manajemen Contingency (F5 PEMBEDA)
--
-- ── Cacat yang ditutup
--
-- Diukur 2026-08-07: NOL kolom contingency di seluruh basis (satu-satunya
-- yang mendekati, `project_stocks.qty_reserved`, urusan stok bukan uang).
--
-- Cadangan risiko adalah bagian nilai kontrak yang SENGAJA disisihkan untuk
-- hal tak terduga. Tanpa dilacak, ia tak hilang — ia terpakai diam-diam, dan
-- baru ketahuan habis saat dibutuhkan.
--
-- Buktinya sudah ada di basis: CO-001 disetujui Rp 50.000.000 pada proyek
-- berkontrak Rp 570.000.000. Uang itu keluar tanpa satu pun catatan tentang
-- cadangan mana yang berkurang.
--
-- ── Dua tabel, bukan satu kolom
--
-- Godaannya menaruh `contingency_amount` di `projects`. Itu hanya menjawab
-- "berapa disisihkan", bukan "berapa sisanya" — dan pertanyaan kedua yang
-- menentukan apakah proyek masih punya bantalan.
--
--   pos_contingency          berapa disisihkan, atas dasar apa
--   penggunaan_contingency   tiap penarikan, untuk apa, atas persetujuan siapa
--
-- Sisa DIHITUNG, tidak disimpan: kolom sisa yang disimpan bisa basi diam-diam
-- saat satu penggunaan disunting, dan angka "cadangan masih aman" yang basi
-- lebih berbahaya daripada tak ada angka sama sekali.
--
-- ── Kenapa `sumber_change_order_id` boleh kosong
--
-- Tak semua penarikan berasal dari CO resmi. Pekerjaan darurat sering
-- dikerjakan dulu dan diadministrasikan belakangan; memaksa CO lebih dulu
-- membuat orang mencatatnya sebagai "biaya lain-lain" — persis kebocoran
-- yang modul ini tutup.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS pos_contingency (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  nama            text NOT NULL,

  -- Nilai cadangan. numeric, bukan float — CLAUDE.md §5.4. Angka ini
  -- mengalir ke laporan sisa cadangan dan akhirnya ke keputusan
  -- "boleh ambil atau tidak".
  nilai           numeric(18,2) NOT NULL,

  -- `persen_kontrak` boleh diisi sebagai DASAR penetapan, bukan sebagai
  -- sumber nilai. Nilai rupiahnya tetap yang mengikat: kontrak bisa berubah
  -- lewat CO, dan cadangan yang ikut bergeser diam-diam membuat sisa
  -- kemarin tak bisa dibandingkan dengan sisa hari ini.
  persen_kontrak  numeric(6,3),

  dasar           text,
  catatan         text,

  status          text NOT NULL DEFAULT 'aktif'
                  CHECK (status IN ('aktif','ditutup')),

  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Cadangan negatif atau nol bukan cadangan.
  CONSTRAINT pos_contingency_nilai_positif CHECK (nilai > 0),
  CONSTRAINT pos_contingency_persen_wajar CHECK (
    persen_kontrak IS NULL OR (persen_kontrak > 0 AND persen_kontrak <= 100)
  ),
  CONSTRAINT pos_contingency_nama_unik UNIQUE (project_id, nama)
);

CREATE INDEX IF NOT EXISTS idx_pos_contingency_proyek
  ON pos_contingency(project_id) WHERE status = 'aktif';

CREATE TRIGGER trg_pos_contingency_updated_at
  BEFORE UPDATE ON pos_contingency
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── Tiap penarikan tercatat ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS penggunaan_contingency (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  pos_id          uuid NOT NULL REFERENCES pos_contingency(id) ON DELETE CASCADE,

  nilai           numeric(18,2) NOT NULL,
  tanggal         date NOT NULL DEFAULT CURRENT_DATE,

  -- WAJIB. Cadangan yang terpakai tanpa alasan tertulis adalah persis
  -- "hilang ke biaya lain-lain" yang modul ini dibuat untuk mengakhiri.
  alasan          text NOT NULL,

  -- Boleh kosong: tak semua penarikan berasal dari CO resmi. Pekerjaan
  -- darurat sering dikerjakan dulu dan diadministrasikan belakangan.
  sumber_change_order_id uuid REFERENCES change_orders(id) ON DELETE SET NULL,

  disetujui_oleh  uuid REFERENCES users(id) ON DELETE SET NULL,
  catatan         text,

  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Penarikan nol tak mengubah apa pun; negatif adalah pengembalian, dan
  -- itu peristiwa berbeda yang butuh alasannya sendiri.
  CONSTRAINT penggunaan_contingency_nilai_positif CHECK (nilai > 0),
  CONSTRAINT penggunaan_contingency_alasan_terisi CHECK (length(btrim(alasan)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_penggunaan_contingency_pos
  ON penggunaan_contingency(pos_id, tanggal DESC);

CREATE TRIGGER trg_penggunaan_contingency_updated_at
  BEFORE UPDATE ON penggunaan_contingency
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE pos_contingency ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON pos_contingency AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id()))
  WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));

CREATE POLICY pos_contingency_baca ON pos_contingency
  FOR SELECT USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

CREATE POLICY pos_contingency_kelola ON pos_contingency
  FOR ALL USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']))
  WITH CHECK ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

-- `penggunaan_contingency` mewarisi tenancy lewat `pos_id`. Nilai penarikan
-- cadangan adalah informasi komersial: ia menunjukkan seberapa dekat proyek
-- dengan kehabisan bantalan.
ALTER TABLE penggunaan_contingency ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON penggunaan_contingency AS RESTRICTIVE FOR ALL
  USING (EXISTS (
    SELECT 1 FROM pos_contingency p
     WHERE p.id = penggunaan_contingency.pos_id
       AND project_company_id(p.project_id) = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM pos_contingency p
     WHERE p.id = penggunaan_contingency.pos_id
       AND project_company_id(p.project_id) = (SELECT auth_company_id())));

CREATE POLICY penggunaan_contingency_baca ON penggunaan_contingency
  FOR SELECT USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

CREATE POLICY penggunaan_contingency_kelola ON penggunaan_contingency
  FOR ALL USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']))
  WITH CHECK ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

-- ── Menu ────────────────────────────────────────────────────────────────────
UPDATE menu_items SET href = '/keuangan/contingency' WHERE key = 'cc-contingency';

COMMIT;
