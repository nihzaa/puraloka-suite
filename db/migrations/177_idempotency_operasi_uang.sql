-- ============================================================================
-- Migration 177 — IDEMPOTENCY untuk operasi yang menyentuh uang (F1-1).
-- ============================================================================
--
-- ── Masalah yang diselesaikan
--
-- `POST /finance/invoice/:id/pay` melakukan INSERT polos ke `payments`, dan
-- trigger `trg_update_cash_balance_on_payment` (migrasi 019/162) menambah saldo
-- kas dari baris itu. Tak ada satu pun constraint yang mencegah dua INSERT
-- identik — diverifikasi 2026-08-03: `payments` hanya punya `payments_pkey`,
-- nol index unik lainnya.
--
-- Artinya satu tombol yang ditekan dua kali menghasilkan **dua pembayaran dan
-- dua pergerakan kas**. Bukan skenario hipotetis: jaringan lapangan yang buruk
-- membuat pengguna menekan ulang, dan HTTP tak menjanjikan apa pun soal
-- request yang timeout — ia mungkin sudah sampai, mungkin belum.
--
-- Bentuk kerusakannya paling buruk: angka bertambah tanpa galat, tanpa log,
-- tanpa gejala. Yang menemukannya biasanya rekonsiliasi bank berminggu-minggu
-- kemudian.
--
-- ── Kenapa tabel terpisah, bukan unique constraint di `payments`
--
-- Unique pada `(invoice_id, amount_paid, paid_at)` terdengar lebih sederhana,
-- tetapi SALAH secara bisnis: dua cicilan bernilai sama pada hari yang sama
-- adalah kejadian yang sah. Menolaknya berarti menolak transaksi nyata.
--
-- Yang membedakan "pengiriman ulang" dari "pembayaran kedua" bukan isinya,
-- melainkan **niat pemanggil** — dan itu hanya bisa dinyatakan pemanggil,
-- lewat kunci yang ia buat sendiri per-aksi. Itulah `Idempotency-Key`.
--
-- ── Bentuk tabel
--
-- Kunci alaminya `(company_id, operasi, kunci)`:
--   · `company_id` — kunci milik satu perusahaan; dua tenant boleh memakai
--     kunci yang sama tanpa saling menabrak
--   · `operasi`    — kunci yang sama untuk aksi BERBEDA bukan pengulangan
--   · `kunci`      — nilai dari header `Idempotency-Key`
--
-- `hasil` menyimpan respons pertama supaya pengiriman ulang membalas hal yang
-- SAMA, bukan sekadar ditolak. Pemanggil yang kehilangan respons pertama tetap
-- mendapatkan jawabannya — itulah gunanya idempotency, bukan sekadar mencegah
-- duplikat.
--
-- ── Kategori tenancy: B (company_id LANGSUNG)
-- ============================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Nama operasi, mis. 'finance:invoice:pay'. Sengaja TEKS bebas, bukan enum:
  -- menambah operasi baru tak boleh menuntut migrasi schema.
  operasi       TEXT NOT NULL,
  kunci         TEXT NOT NULL,

  -- Siapa yang mengirim. Untuk penelusuran, BUKAN bagian dari kunci unik:
  -- pengiriman ulang dari sesi lain milik orang yang sama tetap satu operasi.
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Respons pertama, dibalas apa adanya pada pengiriman ulang.
  status_http   SMALLINT NOT NULL,
  hasil         JSONB,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT idempotency_unik UNIQUE (company_id, operasi, kunci)
);

COMMENT ON TABLE idempotency_keys IS
  'F1-1: mencegah operasi uang terjadi dua kali karena pengiriman ulang. '
  'Kunci datang dari header Idempotency-Key milik pemanggil.';

CREATE INDEX IF NOT EXISTS idx_idempotency_lookup
  ON idempotency_keys (company_id, operasi, kunci);

-- Pembersihan: kunci lama tak berguna, dan tabel ini tumbuh terus.
-- Indeks pada created_at membuat penghapusan berkala murah.
CREATE INDEX IF NOT EXISTS idx_idempotency_umur ON idempotency_keys (created_at);

-- ── Tenancy: isi company_id otomatis + RLS ──────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = current_schema() AND p.proname = 'fn_isi_company_id') THEN
    DROP TRIGGER IF EXISTS trg_idempotency_isi_company ON idempotency_keys;
    CREATE TRIGGER trg_idempotency_isi_company
      BEFORE INSERT ON idempotency_keys
      FOR EACH ROW EXECUTE FUNCTION fn_isi_company_id();
  END IF;
END $$;

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Pola KOMPOSISI (ADR-011 §7): satu policy RESTRICTIVE untuk axis COMPANY,
  -- di-AND dengan policy permissive. Tanpa permissive, restrictive di-AND
  -- dengan OR-himpunan-kosong = FALSE dan tabelnya mati total (T1-F3).
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = current_schema()
                    AND tablename = 'idempotency_keys' AND policyname = 'idempotency_service') THEN
    CREATE POLICY idempotency_service ON idempotency_keys AS PERMISSIVE FOR ALL
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = current_schema()
                    AND tablename = 'idempotency_keys' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON idempotency_keys AS RESTRICTIVE FOR ALL
      USING (company_id = (SELECT auth_company_id()))
      WITH CHECK (company_id = (SELECT auth_company_id()));
  END IF;
END $$;

-- ── Verifikasi: migrasi yang "sukses" tanpa menghasilkan apa pun adalah cacat
DO $$
BEGIN
  IF to_regclass(current_schema() || '.idempotency_keys') IS NULL THEN
    RAISE EXCEPTION '177 GAGAL: tabel idempotency_keys tak terbentuk';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'idempotency_unik'
                    AND conrelid = to_regclass(current_schema() || '.idempotency_keys')) THEN
    RAISE EXCEPTION '177 GAGAL: constraint idempotency_unik tak ada — '
                    'tanpa itu tabel ini tak mencegah apa pun';
  END IF;
  RAISE NOTICE '177: idempotency_keys siap (unik per company+operasi+kunci).';
END $$;
