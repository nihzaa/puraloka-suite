-- Migration 121: Guard 3-way match supplier invoice (PO–GR–Invoice)
-- Konteks: PETA-PRIORITAS-ERP §3 item #2 — tutup celah invoice dobel di lapis DB.
-- Additive-only: dua partial unique index, nol perubahan objek existing.
--
-- (a) Satu GR = maksimal satu supplier invoice. Auto-invoice saat GR confirm
--     (procurement.ts) dan invoice manual ber-link GR tidak bisa dobel — index
--     ini backstop race-safe di bawah cek API-layer.
-- (b) Nomor faktur supplier unik per supplier — bon fisik yang sama tidak bisa
--     dientri dua kali. NULL invoice_number (auto-invoice) tidak terdampak.
--
-- Prasyarat diverifikasi 2026-07-27 di dev: nol duplikat pada kedua kombinasi
-- (query GROUP BY ... HAVING count(*) > 1 = 0 baris), jadi index aman dibuat.

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoices_gr
  ON supplier_invoices (goods_receipt_id)
  WHERE goods_receipt_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoices_supplier_number
  ON supplier_invoices (supplier_id, invoice_number)
  WHERE invoice_number IS NOT NULL;
