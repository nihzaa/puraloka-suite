-- Migration 143 — Jejak pengiriman PO ke vendor (ROADMAP #12, Modul 9b).
--
-- ── Keadaan sebelum migrasi ini
--
-- Tombol "WA" di halaman Procurement sudah ada dan membuka `wa.me` deep-link.
-- Kolom `purchase_orders.whatsapp_sent_at` juga sudah ada. Tapi tombol itu
-- TIDAK PERNAH memanggil apa pun ke server: ia hanya `<a href>`. Akibatnya
-- `whatsapp_sent_at` terisi pada NOL dari 4 PO — kolomnya ada, jejaknya tidak.
--
-- `po_delivery_log` yang dirancang migrasi 043 juga tak pernah terbentuk:
-- korban "migrasi hantu" yang sama seperti `project_rab_materials` (lihat
-- migrasi 142 dan catatan di ROADMAP.md).
--
-- ── Kenapa jejaknya penting
--
-- PO adalah komitmen belanja. Pertanyaan "PO ini sudah dikirim ke supplier
-- belum, kapan, ke nomor siapa" tak punya jawaban hari ini — dan itulah
-- pertanyaan pertama saat barang tak kunjung datang. Tanpa jejak, satu-satunya
-- sumbernya adalah ingatan orang yang menekan tombol.
--
-- Dirancang ulang dari 043, bukan disalin: 043 memakai `po_number TEXT` dan
-- `supplier_name` terdenormalisasi karena saat itu tabel `purchase_orders`
-- belum ada. Sekarang sudah ada, jadi FK yang benar dipakai.

-- ── Menangani DUA keadaan yang berbeda antar-lingkungan ────────────────────
--
-- Di dev, 043 tak pernah membuat `po_delivery_log` (migrasi hantu). Di proyek
-- CI yang bersih, 043 dijalankan berurutan dan `CREATE TABLE IF NOT EXISTS`-nya
-- BERHASIL — menghasilkan tabel dengan skema LAMA: `po_number TEXT` +
-- `supplier_name` terdenormalisasi, tanpa `po_id`.
--
-- Akibatnya `CREATE TABLE IF NOT EXISTS` di bawah akan dilewati begitu saja di
-- CI, lalu `CREATE INDEX ... (po_id)` gagal dengan "column po_id does not
-- exist" — persis yang memerahkan run 30605128816.
--
-- Tabel versi 043 DIBUANG bila terdeteksi: ia tak pernah dipakai satu endpoint
-- pun (nol pembaca, nol penulis), jadi tak ada data yang hilang. Pemeriksaannya
-- pada KOLOM, bukan keberadaan tabel — supaya migrasi ini aman dijalankan ulang
-- dan tidak pernah membuang tabel versi baru yang sudah berisi jejak nyata.
DO $$
BEGIN
  IF to_regclass('public.po_delivery_log') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'po_delivery_log'
          AND column_name = 'po_id'
     )
  THEN
    DROP TABLE public.po_delivery_log CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS po_delivery_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  po_id            UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  -- Denormalisasi SENGAJA untuk tenancy: kategori C butuh project_id sendiri
  -- supaya penyaringan tak perlu join. Diisi dari PO saat insert.
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  channel          TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'manual')),

  -- Tujuan sesungguhnya saat dikirim. Disimpan apa adanya, bukan dibaca ulang
  -- dari `suppliers` saat ditampilkan: nomor supplier bisa berubah, dan jejak
  -- yang ikut berubah bukan lagi jejak.
  recipient        TEXT,

  -- 'sent' = pesan dibuka/dikirim; 'confirmed' = supplier membalas setuju;
  -- 'failed' = pengiriman gagal. WhatsApp deep-link tak bisa memastikan pesan
  -- benar-benar terkirim, jadi 'sent' di sini berarti "dikirimkan oleh kami",
  -- bukan "diterima supplier" — dibedakan supaya tak ada yang salah baca.
  status           TEXT NOT NULL DEFAULT 'sent'
                   CHECK (status IN ('sent', 'failed', 'confirmed')),

  notes            TEXT,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by          UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pdl_po      ON po_delivery_log(po_id);
CREATE INDEX IF NOT EXISTS idx_pdl_project ON po_delivery_log(project_id);
CREATE INDEX IF NOT EXISTS idx_pdl_sent_at ON po_delivery_log(sent_at DESC);

-- Kolom email disejajarkan dengan whatsapp yang sudah ada.
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- RLS — kategori C, permission-based (ADR-004/005), sama seperti 142.
-- ------------------------------------------------------------
ALTER TABLE po_delivery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdl_read ON po_delivery_log;
CREATE POLICY pdl_read ON po_delivery_log FOR SELECT
  USING ((SELECT has_permission('procurement:view')));
DROP POLICY IF EXISTS pdl_write ON po_delivery_log;
CREATE POLICY pdl_write ON po_delivery_log FOR ALL
  USING ((SELECT has_permission('procurement:po:manage')))
  WITH CHECK ((SELECT has_permission('procurement:po:manage')));
DROP POLICY IF EXISTS tenant_isolation ON po_delivery_log;
CREATE POLICY tenant_isolation ON po_delivery_log AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id()))
  WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));

-- ------------------------------------------------------------
-- Verifikasi — pelajaran dari 043: migrasi yang bisa "sukses" tanpa
-- menghasilkan apa pun adalah cacat desain, bukan nasib buruk.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.po_delivery_log') IS NULL THEN
    RAISE EXCEPTION '143 gagal: po_delivery_log tidak terbentuk';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'purchase_orders' AND column_name = 'email_sent_at'
  ) THEN
    RAISE EXCEPTION '143 gagal: purchase_orders.email_sent_at tidak terbentuk';
  END IF;
END $$;
