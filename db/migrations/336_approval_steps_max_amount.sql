-- ============================================================================
-- 336 — `approval_steps.max_amount`: PLAFON, pelengkap `min_amount` yang LANTAI
-- ============================================================================
--
-- ── Yang dibutuhkan automation 4.6 (PO Approval Fast-Track)
--
-- Katalog automation menulis: "Fast-track approval PO kecil/rutin di bawah
-- ambang tertentu". Mesin approval hari ini TIDAK BISA menyatakannya.
--
-- `approval_steps.min_amount` adalah LANTAI — "langkah ini berlaku bila nilai
-- entitas >= X" (`lib/approval-engine.ts:applicableSteps`). Dengan itu, orang
-- bisa berkata "PO di atas 50 juta butuh persetujuan direktur".
--
-- Yang TIDAK bisa dikatakan: "PO di bawah 5 juta CUKUP satu tanda tangan".
-- Untuk itu perlu PLAFON — "langkah ini berlaku bila nilai <= Y" — dan itulah
-- kolom yang ditambahkan di sini.
--
-- Ketiadaannya sudah tercatat sebelumnya: `159_submittal_register.sql:266`
-- menyebut eksplisit *"`approval_steps` does NOT have `max_amount`"*, dan
-- `260_ai_token_setujui.sql:101` membandingkan plafonnya sendiri dengan
-- `min_amount` yang "adalah LANTAI".
--
-- ── Kenapa kolom, bukan tabel aturan terpisah
--
-- Rantai approval sudah punya bentuknya: satu baris per langkah, ber-`level`,
-- ber-`required_permission`, ber-`min_amount`. Plafon adalah SIFAT langkah
-- yang sama, bukan konsep baru. Tabel terpisah berarti dua tempat yang harus
-- sepakat tentang langkah mana yang berlaku — dan yang tak sepakat gagal
-- senyap, dalam hal ini dengan MELEWATI persetujuan.
--
-- ── NULL = tanpa plafon, dan itu WAJIB jadi bawaannya
--
-- Seluruh baris yang sudah ada harus tetap berperilaku persis sama. Bawaan
-- NULL menjamin itu: `applicableSteps` memperlakukan NULL sebagai "tak ada
-- batas atas", jadi rantai yang sudah berjalan tak berubah sama sekali.
--
-- Bawaan 0 akan menjadi bencana: tiap langkah mendadak berplafon nol, dan
-- SELURUH persetujuan berhenti berlaku — mesin fail-closed akan menolak
-- semuanya.
--
-- ── CHECK: plafon tak boleh di bawah lantai
--
-- `min_amount = 10jt` dengan `max_amount = 5jt` adalah langkah yang TAK
-- PERNAH berlaku untuk nilai apa pun. Ia tak menghasilkan galat — hanya
-- langkah yang diam, dan persetujuan yang diam-diam terlewat.
-- ============================================================================

ALTER TABLE approval_steps
  ADD COLUMN IF NOT EXISTS max_amount NUMERIC;

COMMENT ON COLUMN approval_steps.max_amount IS
  'PLAFON: langkah berlaku bila nilai entitas <= ini. NULL = tanpa batas atas. '
  'Pelengkap min_amount yang LANTAI. Dipakai fast-track: PO kecil cukup satu '
  'langkah, PO besar melewati langkah itu dan naik ke level berikutnya.';

-- Plafon di bawah lantai = langkah yang tak pernah berlaku untuk nilai apa pun.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'approval_steps'::regclass
      AND conname = 'chk_approval_steps_plafon_wajar'
  ) THEN
    ALTER TABLE approval_steps
      ADD CONSTRAINT chk_approval_steps_plafon_wajar
      CHECK (
        max_amount IS NULL
        OR min_amount IS NULL
        OR max_amount >= min_amount
      );
  END IF;
END $$;

-- ─── Verifikasi: bentuk DAN perilaku ────────────────────────────────────────

DO $$
DECLARE
  n INT;
  chain UUID;
  co    UUID;
BEGIN
  -- 1. Kolomnya ada dan NULLABLE (bawaan NULL, bukan 0).
  SELECT count(*) INTO n
  FROM information_schema.columns
  WHERE table_name = 'approval_steps' AND column_name = 'max_amount'
    AND is_nullable = 'YES' AND column_default IS NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION '336 gagal: max_amount tak ada atau punya default — rantai lama bisa berubah perilaku';
  END IF;

  -- 2. Seluruh baris LAMA tetap NULL — nol perubahan perilaku.
  SELECT count(*) INTO n FROM approval_steps WHERE max_amount IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '336 gagal: % langkah sudah berplafon — migrasi ini seharusnya tak mengisi apa pun', n;
  END IF;

  -- 3. PERILAKU: plafon di bawah lantai HARUS ditolak.
  SELECT id, company_id INTO chain, co FROM approval_chains LIMIT 1;
  IF chain IS NULL THEN
    RAISE NOTICE '336: belum ada approval_chains — verifikasi perilaku dilewati';
  ELSE
    BEGIN
      INSERT INTO approval_steps (chain_id, level, required_permission,
                                  min_amount, max_amount, label, company_id)
      VALUES (chain, 9999, 'procurement:po:manage', 10000000, 5000000,
              '[336-UJI] plafon di bawah lantai', co);
      RAISE EXCEPTION '336 gagal: langkah berplafon DI BAWAH lantai DITERIMA';
    EXCEPTION
      WHEN check_violation THEN
        NULL; -- inilah yang diharapkan
      WHEN raise_exception THEN
        RAISE;
    END;
    RAISE NOTICE '336: plafon di bawah lantai TERBUKTI ditolak';
  END IF;

  RAISE NOTICE '336 OK — max_amount ada, nullable, nol baris terisi, CHECK bekerja';
END $$;
