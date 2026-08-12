-- ============================================================================
-- 333 — satu termin, satu invoice: indeks UNIK, bukan sekadar indeks biasa
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- `idx_invoices_termin_schedule_id` sudah ada sejak lama, tetapi ia indeks
-- BIASA — mempercepat pencarian, tidak mencegah apa pun.
--
-- Penerbitan invoice termin memeriksa "sudah ada?" di aplikasi lebih dulu.
-- Pemeriksaan itu benar untuk pemanggilan berurutan, dan TIDAK CUKUP untuk
-- pemanggilan bersamaan: dua proses sama-sama membaca "belum ada", keduanya
-- menyisipkan, dan klien menerima DUA invoice untuk satu termin.
--
-- Sejak automation 5.1 ada, jalur penerbitannya menjadi dua — rute pembayaran
-- dan penjadwal yang berdenyut tiap 15 menit. Peluang keduanya berpapasan
-- bukan lagi teoretis.
--
-- ── Kenapa baru ketahuan sekarang
--
-- Test "denyut kedua tidak menerbitkan invoice kedua" HIJAU, dan tetap hijau
-- SEKALIPUN idempotensi di `lib/invoice-termin.ts` sengaja dilumpuhkan —
-- karena dedup notifikasi memotong lebih dulu, jadi lapisan yang diuji bukan
-- yang dikira. Mutation test yang menunjukkannya; tanpa itu, cacat ini lolos
-- dengan test berwarna hijau.
--
-- Pelajarannya: test yang hijau saat kodenya dirusak sedang menguji hal lain.
--
-- ── Aman dipasang: nol duplikat saat ini
--
-- Diukur sebelum menulis migrasi ini:
--   SELECT termin_schedule_id, count(*) FROM invoices
--    WHERE termin_schedule_id IS NOT NULL GROUP BY 1 HAVING count(*) > 1
--   → 0 baris
--
-- Kalau kelak ada basis yang sudah terlanjur punya duplikat, migrasi ini akan
-- GAGAL dengan galat unique violation — dan itu perilaku yang benar: duplikat
-- invoice adalah perkara uang yang harus diputuskan manusia, bukan dibereskan
-- diam-diam oleh migrasi.
--
-- ── Kenapa PARSIAL (WHERE ... IS NOT NULL)
--
-- Invoice non-termin (`invoice_type` lain) punya `termin_schedule_id` NULL.
-- Di Postgres NULL tak pernah sama dengan NULL, jadi indeks unik biasa pun
-- membolehkannya — tetapi menulis WHERE-nya eksplisit membuat maksudnya
-- terbaca, dan indeksnya lebih kecil.
-- ============================================================================

-- Indeks lama (non-unik) dibuang: fungsinya sepenuhnya digantikan yang baru.
DROP INDEX IF EXISTS idx_invoices_termin_schedule_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_termin_schedule
  ON invoices (termin_schedule_id)
  WHERE termin_schedule_id IS NOT NULL;

COMMENT ON INDEX uq_invoices_termin_schedule IS
  'Satu termin = satu invoice. UNIK, bukan sekadar indeks: pemeriksaan '
  '"sudah ada?" di aplikasi tak menahan dua penerbitan yang BERSAMAAN.';

-- ─── Verifikasi — bentuk DAN perilaku ───────────────────────────────────────

DO $$
DECLARE
  n INT;
  t UUID;
  p UUID;
  u UUID;
BEGIN
  -- 1. Indeksnya benar-benar UNIK.
  SELECT count(*) INTO n
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'invoices'
    AND indexname = 'uq_invoices_termin_schedule'
    AND indexdef ILIKE '%UNIQUE%';
  IF n <> 1 THEN
    RAISE EXCEPTION '333 gagal: indeks unik termin_schedule_id tak terpasang';
  END IF;

  -- 2. Tak ada duplikat yang tertinggal.
  SELECT count(*) INTO n FROM (
    SELECT termin_schedule_id FROM invoices
     WHERE termin_schedule_id IS NOT NULL
     GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION '333 gagal: masih ada % termin ber-invoice ganda', n;
  END IF;

  -- 3. PERILAKU: penyisipan kedua untuk termin yang sama HARUS ditolak.
  --  NOT NULL: dipinjam dari baris yang sudah ada, bukan ditebak.
  SELECT i.termin_schedule_id, i.project_id, i.created_by INTO t, p, u
  FROM invoices i WHERE i.termin_schedule_id IS NOT NULL LIMIT 1;

  IF t IS NULL THEN
    RAISE NOTICE '333: belum ada invoice termin — verifikasi perilaku dilewati';
  ELSE
    BEGIN
      INSERT INTO invoices (project_id, termin_schedule_id, invoice_number,
                            invoice_type, base_amount, tax_amount, total_amount,
                            amount_paid, amount_due, issued_date, due_date, status, created_by)
      VALUES (p, t, '[333-UJI]', 'termin_billing', 1, 0, 1, 0, 1,
              CURRENT_DATE, CURRENT_DATE + 14, 'draft', u);
      -- Sampai di sini berarti duplikat DITERIMA — indeksnya tak bekerja.
      RAISE EXCEPTION '333 gagal: invoice KEDUA untuk termin yang sama DITERIMA';
    EXCEPTION
      WHEN unique_violation THEN
        NULL; -- inilah yang diharapkan
      WHEN raise_exception THEN
        RAISE;
    END;
    RAISE NOTICE '333: penyisipan invoice kedua TERBUKTI ditolak basis';
  END IF;

  RAISE NOTICE '333 OK — satu termin, satu invoice (ditegakkan basis)';
END $$;
