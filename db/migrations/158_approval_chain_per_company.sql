-- Migration 158: rantai approval unik PER COMPANY, bukan global
--
-- ══════════════════════════════════════════════════════════════════════════
-- CELAH YANG DITUTUP — POLA KEEMPAT KALINYA
-- ══════════════════════════════════════════════════════════════════════════
--
-- `approval_chains.company_id` sudah `NOT NULL` (T4h) — tapi keunikannya masih
-- **`UNIQUE (entity_type)` GLOBAL**. Akibatnya konkret:
--
--   Badan usaha kedua TIDAK BISA punya rantai approval sendiri.
--   `INSERT` rantai 'kasbon' untuk company B → 23505, karena company A sudah
--   memakai entity_type itu.
--
-- Ini pola yang sama persis dan sudah menggigit TIGA kali sebelumnya:
--   · `financial_config`  — migrasi 145 (2026-07-31)
--   · `feature_flags`     — migrasi 146 (2026-07-31, hari yang sama)
--   · `modules`           — migrasi 155 (2026-08-01)
--
-- Tiap kali bentuknya identik: kolom `company_id` ditambahkan, constraint
-- uniknya TIDAK ikut. Yang membuatnya lolos berulang kali adalah gejalanya nol
-- selama masih satu company — dan baru muncul pada hari tenant kedua lahir,
-- sebagai "kenapa approval-nya error 23505" yang dicari di tempat yang salah.
--
-- ── Kenapa ditemukan sekarang
--
-- Saat menyiapkan Submittal Register (ROADMAP #24c) yang ikut Workflow Engine:
-- seed rantainya per-company, dan verifikasi asumsi ke `pg_constraint` lebih
-- dulu menunjukkan `UNIQUE (entity_type)`. Tanpa memeriksa katalog, migrasi
-- Submittal akan "berhasil" hari ini dan gagal senyap pada company kedua.
--
-- ── Konsekuensi yang lebih besar daripada Submittal
--
-- `loadSteps()` membaca `.eq('entity_type', …).eq('company_id', …)` — kodenya
-- SUDAH benar dan siap per-company. Yang menahan hanyalah constraint ini.
-- Dan `steps.length === 0` bersifat FAIL-CLOSED (ADR-007): company kedua yang
-- tak bisa punya rantai berarti **nol orang bisa menyetujui apa pun di sana** —
-- kasbon, change order, pengeluaran, estimasi, semuanya beku.

BEGIN;

-- ── approval_chains ─────────────────────────────────────────────────────────
DO $$
DECLARE nama TEXT;
BEGIN
  FOR nama IN
    SELECT con.conname FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE n.nspname = current_schema() AND cl.relname = 'approval_chains'
       AND con.contype = 'u'
       AND pg_get_constraintdef(con.oid) = 'UNIQUE (entity_type)'
  LOOP
    EXECUTE format('ALTER TABLE approval_chains DROP CONSTRAINT %I', nama);
    RAISE NOTICE '158: UNIQUE global approval_chains(entity_type) dilepas (%)', nama;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_chains_company_entity
  ON approval_chains (company_id, entity_type);

-- ── approval_steps ──────────────────────────────────────────────────────────
-- `UNIQUE (chain_id, level)` SUDAH benar: `chain_id` menunjuk satu rantai yang
-- kini milik satu company, jadi keunikannya sudah ter-scope lewat induknya.
-- Diperiksa, bukan diasumsikan — dan sengaja TIDAK diubah.

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE n INT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace nn ON nn.oid = cl.relnamespace
     WHERE nn.nspname = current_schema() AND cl.relname = 'approval_chains'
       AND con.contype = 'u' AND pg_get_constraintdef(con.oid) = 'UNIQUE (entity_type)'
  ) THEN
    RAISE EXCEPTION '158 GAGAL: UNIQUE global (entity_type) masih terpasang — '
      'badan usaha kedua tetap tak bisa punya rantai approval sendiri';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = current_schema()
                    AND indexname = 'uq_approval_chains_company_entity') THEN
    RAISE EXCEPTION '158 GAGAL: indeks unik per-company tak terbentuk';
  END IF;

  -- Rantai yang SUDAH ada harus tetap utuh — ini bukan migrasi data.
  SELECT count(*) INTO n FROM approval_chains;
  IF n = 0 THEN
    RAISE EXCEPTION '158 GAGAL: seluruh rantai approval hilang';
  END IF;

  -- Tiap rantai harus punya minimal satu langkah. Rantai tanpa langkah
  -- bersifat FAIL-CLOSED: nol orang bisa menyetujui entitas itu.
  SELECT count(*) INTO n
    FROM approval_chains ac
   WHERE NOT EXISTS (SELECT 1 FROM approval_steps s WHERE s.chain_id = ac.id);
  IF n > 0 THEN
    RAISE EXCEPTION '158 GAGAL: % rantai tanpa langkah — approval-nya beku', n;
  END IF;

  RAISE NOTICE '158 OK: approval_chains unik per (company_id, entity_type)';
END $$;

COMMIT;
