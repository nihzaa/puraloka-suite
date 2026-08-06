-- ════════════════════════════════════════════════════════════════════════════
-- 194 — Material milik klien (free issue)
--
-- ── Cacat yang ditutup
--
-- Diukur 2026-08-06: NOL penanda kepemilikan di seluruh tabel material.
-- `materials`, `project_stocks`, `goods_receipts`, `goods_receipt_items` —
-- tak satu pun membedakan "barang kita" dari "barang owner".
--
-- Pada kontrak konstruksi, owner sering memasok sendiri material tertentu
-- (keramik, sanitair, lift) dan kontraktor hanya memasangnya. Barang itu
-- masuk gudang proyek, dipakai, dan tersisa — persis seperti material sendiri.
--
-- ── Kenapa itu merusak angka, bukan sekadar kurang rapi
--
-- `/gudang/rekonsiliasi` menghitung "dibeli" dari `goods_receipt_items` pada
-- GR ber-status `confirmed`. Material owner yang masuk lewat jalur itu akan:
--
--   1. menggelembungkan penyebut susut — 100 sak milik owner membuat susut
--      8 sak dari 100 sak MILIK KITA terbaca sebagai 4% dari 200, bukan 8%
--   2. muncul sebagai `lebih_beli` terhadap RAB — perusahaan tampak memborong
--      material yang tak pernah ia beli sesen pun
--
-- ── Kenapa TABEL SENDIRI, bukan penanda di `goods_receipts`
--
-- Percobaan pertama migrasi ini menambahkan `milik_klien` ke `goods_receipts`.
-- Itu SALAH, dan uji invariannya yang membuktikannya: `po_id` dan
-- `supplier_id` di tabel itu **NOT NULL**. Material owner tak punya keduanya
-- (ia tidak dibeli), jadi jalur itu menuntut `DROP NOT NULL` pada tabel
-- berisi data finansial hidup — Gerbang Keras G-2, dan `supplier-invoices`
-- sudah membandingkan `gr.supplier_id` sehingga null di sana merambat.
--
-- Saya sempat menyatakan "GR tanpa PO sudah mungkin secara struktur" setelah
-- membaca definisi FK-nya. Definisi FK tidak menyatakan nullability; saya
-- menyimpulkan yang tak tertulis. Uji invarian menangkapnya sebelum satu baris
-- pun ditulis.
--
-- Tabel tersendiri tak menyentuh satu pun kolom yang sudah ada, tak butuh
-- gerbang, dan lebih jujur: penerimaan material owner memang BUKAN penerimaan
-- pembelian — ia tak punya PO, tak punya supplier, dan tak pernah dibayar.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS penerimaan_material_klien (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  material_id     uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,

  -- numeric, bukan float — CLAUDE.md §5.4.
  qty             numeric(14,3) NOT NULL,

  tanggal         date NOT NULL DEFAULT CURRENT_DATE,

  -- Nama pemasok di sisi klien — teks bebas, BUKAN FK ke `suppliers`.
  -- Owner bukan supplier kita: ia tak punya baris di sana dan tak boleh
  -- dipaksa punya, sebab itu mencemari daftar supplier dengan pihak yang
  -- tak pernah kita bayar dan tak pernah kita nilai.
  pemasok         text,

  -- Nomor surat jalan dari owner — satu-satunya bukti serah terima yang ada
  -- pada penerimaan tanpa PO.
  nomor_surat_jalan text,
  catatan         text,

  -- Jejak ke kartu stok. Diisi endpoint setelah mutasi tertulis; NULL berarti
  -- penerimaan tercatat tapi stoknya belum bertambah — keadaan yang dijaga
  -- di lapis aplikasi dan bisa ditemukan lewat kueri.
  movement_id     uuid REFERENCES stock_movements(id) ON DELETE SET NULL,

  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Kuantitas nol atau negatif bukan penerimaan. Negatif akan MENGURANGI
  -- stok lewat jalur yang tertulis "penerimaan" — kebalikan dari yang
  -- terbaca di layar, tanpa satu pun galat.
  CONSTRAINT penerimaan_klien_qty_positif CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_penerimaan_klien_proyek
  ON penerimaan_material_klien(project_id, tanggal DESC);

CREATE TRIGGER trg_penerimaan_klien_updated_at
  BEFORE UPDATE ON penerimaan_material_klien
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE penerimaan_material_klien ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON penerimaan_material_klien AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id()))
  WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));

CREATE POLICY penerimaan_klien_baca ON penerimaan_material_klien
  FOR SELECT USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

CREATE POLICY penerimaan_klien_kelola ON penerimaan_material_klien
  FOR ALL USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']))
  WITH CHECK ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

-- ── Menu ────────────────────────────────────────────────────────────────────
-- Belum ada barisnya sama sekali. `parent_id` diambil dari saudara
-- sekelompoknya, bukan dipaku: id di lingkungan lain berbeda.
INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'iv-free-issue', 'Material Milik Klien', '/gudang/material-klien', 'Dot',
       parent_id, '{}', 708, section, true
  FROM menu_items WHERE key = 'iv-rekonsiliasi'
ON CONFLICT (key) DO UPDATE SET href = EXCLUDED.href;

COMMIT;
