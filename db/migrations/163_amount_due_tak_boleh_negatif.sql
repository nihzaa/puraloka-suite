-- ============================================================
-- PURALOKA SUITE — Migration 163
-- `invoices.amount_due` tak boleh NEGATIF saat klien lebih bayar.
-- ============================================================
--
-- ── Apa yang salah
--
-- `trigger_calc_invoice_amount_due()` (migrasi 010) menghitung:
--
--     NEW.amount_due = NEW.total_amount - NEW.amount_paid;
--
-- Tanpa batas bawah. Klien yang membayar Rp 2.500.000 untuk tagihan
-- Rp 2.000.000 menghasilkan `amount_due = -500.000`.
--
-- ── Kenapa itu berbahaya, dan kenapa tak terlihat
--
-- Dua pembaca `amount_due` menanganinya dengan cara BERBEDA:
--
--   `lib/ar-register.ts:71`  — memfilter `amount_due > 0`, jadi invoice
--                              lebih bayar HILANG dari rekap aging.
--   `routes/v1/clients.ts:78`, `routes/v1/dashboard.ts:190`
--                            — menjumlahkan apa adanya, jadi angka minus
--                              MENGURANGI total piutang.
--
-- Yang kedua yang menggigit: satu klien kelebihan bayar Rp 500.000 membuat
-- total piutang seluruh perusahaan terlihat Rp 500.000 lebih kecil —
-- menutupi tunggakan klien LAIN. Tak ada error, tak ada peringatan; angka
-- di dashboard hanya salah sedikit, dan salah sedikit pada piutang adalah
-- jenis salah yang tak pernah dipertanyakan.
--
-- ── Kenapa lebih bayar itu wajar, bukan kesalahan input
--
-- Pembulatan transfer, klien membayar dua kali karena mengira yang pertama
-- gagal, atau melunasi dengan angka bulat. Menolaknya lewat CHECK constraint
-- akan menggagalkan pencatatan pembayaran yang uangnya SUNGGUH masuk — itu
-- lebih buruk daripada angka yang perlu ditafsirkan.
--
-- ── Yang dilakukan migrasi ini
--
-- `amount_due` dibatasi minimum NOL. Kelebihannya tetap terekam penuh di
-- `amount_paid` — jadi tak ada uang yang hilang dari catatan, dan selisihnya
-- selalu bisa dihitung ulang (`amount_paid - total_amount`).
--
-- Sisa tagihan menjawab "berapa yang masih harus ditagih". Jawabannya saat
-- klien sudah lebih bayar adalah nol, bukan angka minus.
--
-- ── Dampak ke data yang sudah ada: NOL
--
-- Diverifikasi 2026-08-02 lewat koneksi langsung ke dev:
--   invoice ber-`amount_due` negatif  : 0
--   invoice `amount_paid > total_amount` : 0
--
-- Jadi tak ada baris yang perlu diperbaiki. Fungsi ini hanya mengubah
-- perhitungan untuk baris yang ditulis SESUDAHNYA.
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_calc_invoice_amount_due()
RETURNS TRIGGER AS $$
BEGIN
  -- GREATEST(0, …) — lihat header: lebih bayar menghasilkan sisa NOL,
  -- bukan angka minus yang mengurangi total piutang perusahaan.
  NEW.amount_due = GREATEST(0, NEW.total_amount - NEW.amount_paid);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trigger_calc_invoice_amount_due() IS
  'Hitung sisa tagihan = total - dibayar, minimum NOL. Batas bawah ditambahkan '
  'di migrasi 163: tanpa itu klien yang lebih bayar menghasilkan sisa negatif '
  'yang mengurangi total piutang perusahaan dan menutupi tunggakan klien lain.';

-- ── Verifikasi: fungsinya benar-benar memuat batas bawah ─────────────────────
-- Migrasi yang "berhasil" tanpa efek adalah kelas cacat yang sedang ditutup.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'trigger_calc_invoice_amount_due'
      AND prosrc ILIKE '%GREATEST(0,%'
  ) THEN
    RAISE EXCEPTION 'trigger_calc_invoice_amount_due masih tanpa batas bawah sesudah migrasi 163';
  END IF;
END $$;
