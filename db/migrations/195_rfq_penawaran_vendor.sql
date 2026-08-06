-- ════════════════════════════════════════════════════════════════════════════
-- 195 — RFQ ke vendor + perbandingan penawaran (bid tabulation)
--
-- ── Cacat yang ditutup, diukur pada data nyata
--
-- Material yang SAMA dibeli dari beberapa supplier dengan harga berbeda, dan
-- tak ada satu pun jejak KENAPA yang mahal dipilih:
--
--   Besi Beton Ø12mm SNI   3 supplier   Rp100.000 .. Rp120.000   (+20%)
--   Pasir Pasang           2 supplier   Rp185.000 .. Rp195.000
--   Besi Beton Ø10mm SNI   3 supplier   Rp 80.000 .. Rp 85.000
--
-- 5 dari 7 PO lahir langsung dari MR. Harga datang dari satu vendor langganan,
-- bukan dari perbandingan — dan saat auditor bertanya "kenapa vendor ini",
-- tak ada yang bisa dijawab selain ingatan orang.
--
-- ── Kenapa dua tabel, bukan satu
--
-- Satu RFQ dikirim ke BEBERAPA vendor, dan tiap vendor menawar BEBERAPA
-- material dengan harga masing-masing. Menaruhnya di satu tabel memaksa
-- nomor RFQ, tanggal, dan daftar materialnya berulang di tiap baris harga —
-- dan begitu satu salinan disunting, tak ada lagi yang tahu mana yang benar.
--
-- ── Kenapa TIDAK ada kolom "pemenang" di sini
--
-- Pemenangnya adalah PO yang benar-benar terbit. Menyimpan penanda pemenang
-- terpisah membuat dua sumber kebenaran yang bisa berbeda: RFQ bilang vendor
-- A menang, PO-nya atas nama vendor B, dan laporan mana pun yang membacanya
-- akan berbohong tanpa satu pun galat. `rfq.po_id` menunjuk hasilnya — satu
-- arah, tak bisa berselisih dengan dirinya sendiri.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS rfq (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  nomor           text NOT NULL,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Asal permintaan. Boleh kosong: kadang RFQ dibuat untuk kebutuhan yang
  -- belum berbentuk MR (survei harga awal), dan memaksanya ada akan membuat
  -- orang mengarang MR hanya demi bisa meminta penawaran.
  mr_id           uuid REFERENCES material_requests(id) ON DELETE SET NULL,

  tanggal         date NOT NULL DEFAULT CURRENT_DATE,
  batas_masuk     date,
  catatan         text,

  -- `draft`   — sedang disusun, vendor belum diundang
  -- `terkirim`— sudah dikirim, menunggu penawaran masuk
  -- `selesai` — sudah dibandingkan dan diputuskan
  -- `batal`   — dihentikan tanpa PO
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','terkirim','selesai','batal')),

  -- Hasilnya: PO yang benar-benar terbit. Satu-satunya penanda "siapa menang",
  -- supaya tak ada dua sumber kebenaran yang bisa berselisih.
  po_id           uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,

  -- Alasan pemilihan. WAJIB diisi lewat aplikasi saat vendor termurah TIDAK
  -- dipilih — dan itulah seluruh gunanya modul ini. Di basis ia nullable
  -- karena RFQ draft belum punya keputusan apa pun untuk dijelaskan.
  alasan_pilih    text,

  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rfq_nomor_unik UNIQUE (nomor)
);

CREATE INDEX IF NOT EXISTS idx_rfq_proyek ON rfq(project_id, tanggal DESC);

CREATE TRIGGER trg_rfq_updated_at
  BEFORE UPDATE ON rfq
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── Penawaran per vendor per material ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfq_penawaran (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  rfq_id          uuid NOT NULL REFERENCES rfq(id) ON DELETE CASCADE,
  supplier_id     uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  material_id     uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,

  qty             numeric(14,3) NOT NULL,

  -- numeric, bukan float — CLAUDE.md §5.4. Ini harga satuan yang mengalir ke
  -- PO dan akhirnya ke laporan biaya; pembulatan float di sini menjadi selisih
  -- rupiah yang tak bisa dijelaskan.
  harga_satuan    numeric(16,2) NOT NULL,

  -- Vendor kadang tak menawar sebagian item. Dinyatakan sebagai penanda,
  -- BUKAN sebagai harga 0 — harga 0 akan memenangkan perbandingan sebagai
  -- yang "termurah", padahal artinya vendor itu tak menawarkan apa pun.
  tidak_menawar   boolean NOT NULL DEFAULT false,

  waktu_kirim_hari integer,
  catatan         text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rfq_penawaran_qty_positif CHECK (qty > 0),

  -- Harga negatif mustahil; harga 0 hanya sah bila vendor menyatakan TIDAK
  -- menawar. Tanpa pagar ini, "0" akan selalu menang sebagai termurah.
  CONSTRAINT rfq_penawaran_harga_wajar CHECK (
    harga_satuan >= 0
    AND (tidak_menawar OR harga_satuan > 0)
  ),

  CONSTRAINT rfq_penawaran_kirim_wajar CHECK (
    waktu_kirim_hari IS NULL OR (waktu_kirim_hari >= 0 AND waktu_kirim_hari <= 365)
  ),

  -- Satu vendor menawar satu material SEKALI dalam satu RFQ. Tanpa ini,
  -- penawaran revisi masuk sebagai baris kedua dan tabulasinya menghitung
  -- vendor yang sama dua kali.
  CONSTRAINT rfq_penawaran_unik UNIQUE (rfq_id, supplier_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_rfq_penawaran_rfq ON rfq_penawaran(rfq_id);

CREATE TRIGGER trg_rfq_penawaran_updated_at
  BEFORE UPDATE ON rfq_penawaran
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE rfq ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON rfq AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id()))
  WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));

CREATE POLICY rfq_baca ON rfq
  FOR SELECT USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

CREATE POLICY rfq_kelola ON rfq
  FOR ALL USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']))
  WITH CHECK ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

-- `rfq_penawaran` mewarisi tenancy lewat `rfq_id` — harga penawaran vendor
-- adalah informasi komersial yang paling merugikan kalau bocor lintas tenant.
ALTER TABLE rfq_penawaran ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON rfq_penawaran AS RESTRICTIVE FOR ALL
  USING (EXISTS (
    SELECT 1 FROM rfq r
     WHERE r.id = rfq_penawaran.rfq_id
       AND project_company_id(r.project_id) = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM rfq r
     WHERE r.id = rfq_penawaran.rfq_id
       AND project_company_id(r.project_id) = (SELECT auth_company_id())));

CREATE POLICY rfq_penawaran_baca ON rfq_penawaran
  FOR SELECT USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

CREATE POLICY rfq_penawaran_kelola ON rfq_penawaran
  FOR ALL USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']))
  WITH CHECK ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

-- ── Menu ────────────────────────────────────────────────────────────────────
-- Kedua barisnya sudah ada sejak triase sub-menu; hanya href-nya yang
-- menunjuk halaman placeholder `/m/…`. Tabulasi TIDAK diberi halaman
-- tersendiri: ia bagian dari layar RFQ (perbandingan tanpa RFQ-nya adalah
-- tabel angka tanpa konteks), jadi keduanya menunjuk ke sana.
UPDATE menu_items SET href = '/procurement/rfq' WHERE key IN ('pr-rfq', 'pr-tabulasi');

COMMIT;
