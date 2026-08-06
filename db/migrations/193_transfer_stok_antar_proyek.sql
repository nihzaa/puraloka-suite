-- ════════════════════════════════════════════════════════════════════════════
-- 193 — Transfer stok antar proyek (F5 PEMBEDA)
--
-- ── Cacat yang ditutup
--
-- `stock_movements` punya `project_id` — SATU proyek. Material yang pindah
-- dari proyek A ke proyek B hanya bisa dicatat sebagai dua baris yang tak
-- saling mengenal. Tak ada yang menghubungkan keduanya, tak ada yang menjamin
-- keduanya sama besar, dan tak ada yang mencegah salah satunya hilang.
--
-- Akibatnya terlihat di layar yang baru dibangun (`/gudang/rekonsiliasi`):
-- material yang PINDAH muncul sebagai **susut tak terjelaskan di proyek asal**.
-- Laporan itu menuduh orang atas barang yang sebenarnya masih ada — hanya di
-- proyek sebelah.
--
-- ── Yang SUDAH ada, dan tidak diulang
--
-- `movement_type` sudah memuat `transfer_in` dan `transfer_out` di CHECK-nya
-- sejak awal (diperiksa `pg_constraint` 2026-08-06) — keduanya nol baris,
-- tak pernah dipakai. Jadi kosakatanya sudah ada; yang belum ada adalah
-- KEPALA yang mengikat dua sisinya jadi satu peristiwa.
--
-- ── Kenapa kepala, bukan sekadar kolom `project_tujuan_id`
--
-- Menambah kolom lawan-proyek ke `stock_movements` membuat setiap baris
-- pemakaian dan penerimaan ikut memikul kolom yang selalu NULL, dan tetap
-- tak menjamin sisi lawannya ada. Kepala memberi satu tempat untuk menaruh
-- invariannya: satu transfer, dua sisi, jumlah sama.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS stock_transfers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kedua sisi WAJIB ada. Transfer tanpa tujuan bukan transfer — itu
  -- pengeluaran barang yang belum diakui siapa pun.
  project_asal_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_tujuan_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  material_id     uuid NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,

  -- numeric, bukan float — CLAUDE.md §5.4. Kuantitas material ikut masuk
  -- perhitungan nilai rupiah lewat harga satuan, dan pembulatan float di
  -- sana menjadi selisih uang yang tak bisa dijelaskan.
  qty             numeric(14,3) NOT NULL,

  tanggal         date NOT NULL DEFAULT CURRENT_DATE,
  alasan          text,

  -- Jejak dua sisi. Diisi endpoint setelah kedua baris mutasi tertulis;
  -- keduanya NULL berarti transfer tercatat tapi stoknya belum bergerak —
  -- keadaan yang TIDAK boleh ada, dan dijaga di lapis aplikasi + uji invarian.
  movement_keluar_id uuid REFERENCES stock_movements(id) ON DELETE SET NULL,
  movement_masuk_id  uuid REFERENCES stock_movements(id) ON DELETE SET NULL,

  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Kuantitas nol atau negatif bukan transfer. Negatif akan MENAMBAH stok di
  -- asal dan menguranginya di tujuan — persis kebalikan dari yang tertulis di
  -- layar, tanpa satu pun pesan galat.
  CONSTRAINT stock_transfers_qty_positif CHECK (qty > 0),

  -- Pindah ke diri sendiri tak memindahkan apa pun, tapi menghasilkan dua
  -- baris mutasi yang saling meniadakan di proyek yang sama — kartu stok jadi
  -- ramai tanpa ada barang yang bergerak.
  CONSTRAINT stock_transfers_beda_proyek CHECK (project_asal_id <> project_tujuan_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_asal   ON stock_transfers(project_asal_id, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_tujuan ON stock_transfers(project_tujuan_id, tanggal DESC);

CREATE TRIGGER trg_stock_transfers_updated_at
  BEFORE UPDATE ON stock_transfers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Tabel ini menyentuh DUA proyek, jadi isolasinya harus memeriksa KEDUANYA.
-- Memeriksa hanya `project_asal_id` membuat tenant A bisa mendorong material
-- ke proyek tenant B: barangnya hilang dari kartu stok A dengan alasan yang
-- terlihat sah, dan muncul di tenant lain yang tak pernah memintanya.
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON stock_transfers AS RESTRICTIVE FOR ALL
  USING (
    project_company_id(project_asal_id)   = (SELECT auth_company_id())
    AND project_company_id(project_tujuan_id) = (SELECT auth_company_id())
  )
  WITH CHECK (
    project_company_id(project_asal_id)   = (SELECT auth_company_id())
    AND project_company_id(project_tujuan_id) = (SELECT auth_company_id())
  );

-- PERMISSIVE: siapa yang boleh melihat & mengelola. Di-AND dengan RESTRICTIVE
-- di atas, jadi ini hanya bisa MEMPERSEMPIT, tak pernah memperluas tenant.
CREATE POLICY stock_transfers_baca ON stock_transfers
  FOR SELECT USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

CREATE POLICY stock_transfers_kelola ON stock_transfers
  FOR ALL USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']))
  WITH CHECK ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

-- ── Menu ────────────────────────────────────────────────────────────────────
-- Barisnya sudah ada sejak triase sub-menu; hanya href-nya yang menunjuk
-- halaman placeholder `/m/…`.
UPDATE menu_items
   SET href = '/gudang/transfer'
 WHERE key = 'iv-transfer';

COMMIT;
