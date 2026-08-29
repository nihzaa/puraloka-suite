-- ============================================================================
-- 521 — `amount_paid` tak boleh melebihi `total_amount`
-- ============================================================================
-- Ditemukan `keuangan-ikhtisar.test.ts` & `ai-tool-ikhtisar.test.ts`:
-- invarian pembukuan "terbayar ≤ tertagih" PECAH sebesar Rp 1.005.000.
--
-- Tiga invoice ditandai LUNAS dengan nominal LEBIH BESAR dari tagihannya, dan
-- nol baris `payments` yang mendukungnya:
--
--     INV/PRL/2026/016   total 96.900.000   paid 97.200.000   (+300.000)
--     INV/PRL/2026/019   total 15.300.000   paid 15.600.000   (+300.000)
--     INV/PRL/2026/022   total  7.395.000   paid  7.800.000   (+405.000)
--
-- ── Kenapa ini bisa terjadi
--
-- `chk_invoice_amount_paid` hanya menuntut `amount_paid >= 0`. Tak ada yang
-- menahan batas ATASNYA. Jadi baris yang menyatakan "dibayar lebih dari
-- tagihannya" sah menurut basis — dan angkanya mengalir ke dasbor keuangan,
-- ikhtisar, dan tool AI sebagai kelebihan bayar yang tak pernah terjadi.
--
-- Nol jalur kode menulis kolom ini (diperiksa: tak ada update/insert
-- `amount_paid` di luar pembuatan invoice bernilai 0), jadi ketiganya berasal
-- dari data contoh. Tetapi CHECK-nya tetap dipasang: yang membuat data itu
-- bisa masuk bukan penulisnya, melainkan ketiadaan pagar.
--
-- ── Kenapa DIKOREKSI ke total_amount, bukan ke nol
--
-- Ketiganya berstatus `paid` dengan `amount_due = 0` — maksudnya jelas: invoice
-- ini lunas. Yang salah cuma nominalnya. Menolkannya akan mengubah invoice
-- lunas jadi belum-dibayar dan MERUSAK arti datanya; membatasinya ke
-- `total_amount` mempertahankan maksudnya sambil membuat angkanya benar.
--
-- Selisih Rp 1.005.000 memang hilang dari "terbayar" — dan itu memang yang
-- diinginkan: uang itu tak pernah ada.
-- ============================================================================

-- ── Koreksi data ────────────────────────────────────────────────────────────
UPDATE invoices
   SET amount_paid = total_amount
 WHERE amount_paid > total_amount;

-- ── Pagar ───────────────────────────────────────────────────────────────────
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoice_paid_tak_lebih;
ALTER TABLE invoices ADD CONSTRAINT chk_invoice_paid_tak_lebih
  CHECK (amount_paid <= total_amount);

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_lebih INT; v_check INT;
BEGIN
  SELECT count(*) INTO v_lebih FROM invoices WHERE amount_paid > total_amount;
  IF v_lebih <> 0 THEN
    RAISE EXCEPTION '521 gagal: % invoice masih ber-amount_paid > total_amount', v_lebih;
  END IF;

  -- Pagar yang tak terpasang tak menahan apa pun, dan tabelnya tetap tampak
  -- baik-baik saja sampai baris berikutnya masuk.
  SELECT count(*) INTO v_check FROM pg_constraint
   WHERE conrelid = 'invoices'::regclass AND conname = 'chk_invoice_paid_tak_lebih';
  IF v_check <> 1 THEN
    RAISE EXCEPTION '521 gagal: CHECK chk_invoice_paid_tak_lebih tak terpasang';
  END IF;
END $$;
