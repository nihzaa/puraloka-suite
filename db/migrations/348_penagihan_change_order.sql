-- ════════════════════════════════════════════════════════════════════════════
-- 348 — Change order punya jalur tagihannya sendiri, dan `billing_mode` dibaca
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Lubang yang ditutup, diukur 2026-08-13
--
-- `change_orders.billing_mode` ada sejak migrasi 053 dengan tiga nilai:
--
--     include_termin   ditagih menyatu dengan termin berjalan
--     separate_co      ditagih sebagai tagihan TERSENDIRI
--     final_account    ditagih di perhitungan akhir
--
-- Rutenya menulisnya (`change-orders.ts:190`, `:240`) dan formulir mengisinya.
-- Disisir 2026-08-13 di seluruh `apps/api/src`, `apps/web/app`, `apps/web/lib`:
-- ketiga nilai itu **hanya muncul sekali di seluruh repo**, yaitu di CHECK
-- constraint migrasi 053 yang mendefinisikannya.
--
-- Tak satu pun baris kode membacanya.
--
-- ── Kenapa itu bukan sekadar "fitur belum jalan"
--
-- Saat CO disetujui, `change-orders.ts:736` menaikkan `projects.contract_value`
-- sebesar `total_amount_delta` — TANPA memandang `billing_mode`. Lalu
-- `sertifikat-ipc.ts:163` membekukan `contract_value` itu dan menagih
-- progres × nilai kontrak.
--
-- Jadi CO bertanda `separate_co` — yang artinya justru "JANGAN tagih lewat
-- termin" — tetap ikut tertagih lewat termin. Bila tagihan terpisahnya juga
-- terbit, pekerjaan yang sama tertagih DUA KALI, dan tak ada satu pun galat
-- yang muncul: kedua angka benar menurut jalurnya masing-masing.
--
-- Kelas cacat yang sama dengan `kasbons.settled_at` (dibaca keuangan, tak
-- pernah ditulis) dan `sdm:pegawai:*` (permission ada, rute nol).
--
-- ── Yang dilakukan berkas ini
--
-- 1. `invoice_type` dapat nilai baru `change_order_billing`.
-- 2. `invoices.change_order_id` — tagihan CO menunjuk CO-nya.
-- 3. Satu tagihan aktif per CO (partial unique) — tagihan ganda ditolak basis,
--    bukan hanya oleh rute.
-- 4. Trigger: tagihan bertipe CO wajib punya `change_order_id`, dan CO-nya
--    wajib sudah `approved` DAN ber-`billing_mode` yang memang ditagih
--    terpisah. Menagih CO yang sudah masuk `contract_value` = tagihan ganda.
--
-- ── Yang TIDAK dilakukan
--
-- CO lama tidak ditebak `billing_mode`-nya. NULL berarti "belum diputuskan",
-- bukan "include_termin" — menebaknya persis kesalahan yang menyembunyikan
-- lubang ini selama ini. Diukur: 1 CO approved ber-`include_termin`, dan
-- `contract_value` proyeknya memang sudah naik (520jt → 570jt), jadi data
-- lama konsisten dan tak perlu disentuh.
--
-- Idempoten; verifikasi GAGAL KERAS.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Tipe tagihan baru ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'invoice_type' AND e.enumlabel = 'change_order_billing'
  ) THEN
    ALTER TYPE invoice_type ADD VALUE 'change_order_billing';
  END IF;
END $$;

-- ── 2. Tagihan menunjuk CO-nya ──────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS change_order_id UUID
    REFERENCES change_orders(id) ON DELETE RESTRICT;

COMMENT ON COLUMN invoices.change_order_id IS
  'Change order yang ditagih tagihan ini. Hanya untuk invoice_type = '
  '''change_order_billing''. ON DELETE RESTRICT: CO yang sudah ditagih tak '
  'boleh lenyap dari bawah tagihannya.';

CREATE INDEX IF NOT EXISTS idx_invoices_change_order
  ON invoices (change_order_id) WHERE change_order_id IS NOT NULL;

-- ── 3. Satu tagihan AKTIF per change order ──────────────────────────────────
--
-- Parsial: yang dibatalkan boleh berulang. Tanpa ini, CO yang sama bisa
-- ditagih dua kali dan selisihnya baru ketahuan saat klien protes.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_satu_tagihan_per_co
  ON invoices (change_order_id)
  WHERE change_order_id IS NOT NULL AND status <> 'cancelled';

-- ── 4. Tagihan CO hanya sah bila CO-nya memang ditagih terpisah ─────────────
CREATE OR REPLACE FUNCTION fn_invoice_co_sah()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
  v_mode   TEXT;
  v_nomor  TEXT;
BEGIN
  -- Tipe CO wajib menunjuk CO-nya.
  IF NEW.invoice_type = 'change_order_billing' AND NEW.change_order_id IS NULL THEN
    RAISE EXCEPTION
      'Tagihan bertipe change order wajib menunjuk change order yang ditagih. '
      'Tanpa itu, tak ada yang bisa memeriksa apakah pekerjaannya sudah tertagih lewat termin.';
  END IF;

  -- Sebaliknya: menunjuk CO tapi tipenya lain akan luput dari seluruh
  -- pemeriksaan di bawah, dan itu jalan masuk tagihan ganda yang paling sunyi.
  IF NEW.change_order_id IS NOT NULL AND NEW.invoice_type <> 'change_order_billing' THEN
    RAISE EXCEPTION
      'Tagihan yang menunjuk change order harus bertipe change_order_billing.';
  END IF;

  IF NEW.change_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status, billing_mode, co_number
    INTO v_status, v_mode, v_nomor
    FROM change_orders WHERE id = NEW.change_order_id;

  IF v_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION
      'Change order % berstatus % — hanya yang sudah disetujui boleh ditagih.',
      COALESCE(v_nomor, '?'), COALESCE(v_status, 'tidak ditemukan');
  END IF;

  IF v_mode IS NULL THEN
    RAISE EXCEPTION
      'Change order % belum menentukan cara penagihannya. Tetapkan dulu: menyatu '
      'dengan termin, tagihan tersendiri, atau perhitungan akhir.',
      v_nomor;
  END IF;

  -- INTI berkas ini. `include_termin` berarti nilainya SUDAH masuk
  -- `contract_value`, jadi IPC menagihnya lewat progres. Menagihnya lagi
  -- lewat tagihan tersendiri = pekerjaan yang sama tertagih dua kali, dan
  -- kedua angkanya benar menurut jalurnya masing-masing.
  IF v_mode = 'include_termin' THEN
    RAISE EXCEPTION
      'Change order % ditandai menyatu dengan termin — nilainya sudah masuk nilai '
      'kontrak dan tertagih lewat IPC. Menagihnya terpisah berarti menagih pekerjaan '
      'yang sama dua kali.', v_nomor;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_co_sah ON invoices;
CREATE TRIGGER trg_invoice_co_sah
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION fn_invoice_co_sah();

-- ── 5. Verifikasi ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_enum  INT;
  v_kolom INT;
  v_idx   INT;
  v_trg   INT;
BEGIN
  SELECT count(*) INTO v_enum FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
   WHERE t.typname = 'invoice_type' AND e.enumlabel = 'change_order_billing';
  IF v_enum <> 1 THEN
    RAISE EXCEPTION '348: invoice_type belum punya change_order_billing';
  END IF;

  SELECT count(*) INTO v_kolom FROM information_schema.columns
   WHERE table_name = 'invoices' AND column_name = 'change_order_id';
  IF v_kolom <> 1 THEN
    RAISE EXCEPTION '348: invoices.change_order_id tidak terbentuk';
  END IF;

  -- Diperiksa berdasarkan BENTUK, bukan nama — pelajaran migrasi 347, di mana
  -- indeks bernama lain dengan bentuk sama sudah ada sejak 201.
  SELECT count(*) INTO v_idx FROM pg_indexes
   WHERE tablename = 'invoices'
     AND indexdef ILIKE '%UNIQUE%'
     AND indexdef ILIKE '%(change_order_id)%';
  IF v_idx <> 1 THEN
    RAISE EXCEPTION '348: ada % indeks unik satu-tagihan-per-CO (harus tepat 1)', v_idx;
  END IF;

  SELECT count(*) INTO v_trg FROM pg_trigger
   WHERE tgname = 'trg_invoice_co_sah' AND NOT tgisinternal;
  IF v_trg <> 1 THEN
    RAISE EXCEPTION '348: trigger trg_invoice_co_sah tidak terpasang';
  END IF;

  RAISE NOTICE '348 OK — tipe tagihan CO, kolom penunjuk, satu tagihan aktif per CO, trigger terpasang';
END $$;
