-- ============================================================================
-- 183 — RETENSI SUBKONTRAK (INTI #3 · triase F5-1, diratifikasi R-010)
--
-- ══════════════════════════════════════════════════════════════════════════
-- KEBOCORAN YANG DITUTUP
-- ══════════════════════════════════════════════════════════════════════════
--
-- Retensi (jaminan pemeliharaan) sudah dijalankan rapi di sisi KLIEN:
-- `invoices.retensi_pct`/`retensi_amount`, `projects.retention_pct`, register
-- pencairan lewat `invoice_type='retention_release'`, dan jadwal termin
-- `on_retention`.
--
-- Sisi MANDOR/SUBKON: NOL. Diukur 2026-08-04 — `work_scopes` punya kolom
-- kontrak lengkap (`contract_pdf_url`, `contract_signed_at`, dua tanda tangan)
-- tetapi tak satu pun kolom retensi. Di `mandor.ts`, pembayaran progres:
--
--     net_payment = gross_payment                          (saat pengajuan)
--     net_payment = (actual ?? gross) - deducted_kasbon     (saat konfirmasi)
--
-- Tak ada suku retensi di mana pun.
--
-- Akibatnya kontraktor MENAHAN retensi dari owner tetapi MEMBAYAR PENUH ke
-- mandor. Selisihnya ia tanggung sendiri sampai masa pemeliharaan lewat — dan
-- ketika ada cacat yang harus diperbaiki mandor, tak ada uang tertahan untuk
-- memaksanya kembali. Itu justru seluruh guna retensi.
--
-- Arah satunya sama nyatanya: tanpa catatan, retensi yang SUDAH dipotong bisa
-- tak pernah dicairkan. Mandor dirugikan diam-diam.
--
-- ══════════════════════════════════════════════════════════════════════════
-- BENTUK YANG DIPILIH
-- ══════════════════════════════════════════════════════════════════════════
--
--   work_scopes.retensi_pct        kesepakatan per scope (bukan per proyek)
--   progress_payments.retensi_amount  yang ditahan pada satu pembayaran
--   subcontract_retention_releases    register pencairan
--
-- Kenapa PER SCOPE, bukan per proyek: satu proyek bisa punya beberapa mandor
-- dengan kesepakatan berbeda — tukang batu 5%, instalatir listrik 0% karena
-- garansinya dari pabrik. Menaruhnya di proyek memaksa semuanya sama.
--
-- Kenapa TABEL TERPISAH untuk pencairan, bukan kolom `sudah_cair` di
-- `progress_payments`: satu pencairan bisa mencakup beberapa pembayaran, dan
-- sebaliknya satu pembayaran bisa dicairkan bertahap. Kolom tunggal memaksa
-- 1:1 yang tidak benar, dan menghapus riwayat siapa mencairkan kapan.
--
-- ⚠️ SEMUA NOMINAL `numeric` — nol float (CLAUDE.md §5.4). Waktu `timestamptz`.
-- ============================================================================

-- ── 1. Kesepakatan retensi per scope ────────────────────────────────────────
--
-- DEFAULT NULL, bukan 0: keduanya berarti "tak ada retensi" hari ini, tetapi
-- NULL berarti "belum pernah diputuskan" sedangkan 0 berarti "diputuskan tidak
-- ada". Membedakannya penting saat mengaudit kontrak lama.

ALTER TABLE work_scopes
  ADD COLUMN IF NOT EXISTS retensi_pct numeric(5,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_scopes_retensi_pct_wajar'
  ) THEN
    ALTER TABLE work_scopes
      ADD CONSTRAINT work_scopes_retensi_pct_wajar
      CHECK (retensi_pct IS NULL OR (retensi_pct >= 0 AND retensi_pct <= 100));
  END IF;
END $$;

COMMENT ON COLUMN work_scopes.retensi_pct IS
  'Persen retensi yang disepakati untuk scope ini. NULL = belum diputuskan, '
  '0 = diputuskan tidak ada retensi. Dipakai lib/retensi-subkontrak.ts.';

-- ── 2. Retensi yang ditahan pada tiap pembayaran progres ────────────────────
--
-- DEFAULT 0 di sini (beda dari kolom di atas, sengaja): sebuah pembayaran yang
-- sudah terjadi PASTI punya nilai retensi, walaupun nilainya nol. Tak ada
-- keadaan "belum diputuskan" untuk transaksi yang sudah tercatat.

ALTER TABLE progress_payments
  ADD COLUMN IF NOT EXISTS retensi_amount numeric(15,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'progress_payments_retensi_tak_negatif'
  ) THEN
    ALTER TABLE progress_payments
      ADD CONSTRAINT progress_payments_retensi_tak_negatif
      CHECK (retensi_amount >= 0);
  END IF;
END $$;

COMMENT ON COLUMN progress_payments.retensi_amount IS
  'Retensi yang DITAHAN pada pembayaran ini. Dihitung dari gross_payment '
  '(bukan dari nilai sesudah kasbon) — lihat header lib/retensi-subkontrak.ts.';

-- ── 3. Register pencairan retensi ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subcontract_retention_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenancy kategori B — kolom langsung, sejalan ADR-011 §5 untuk tabel yang
  -- jadi sumber laporan uang. `work_scopes` sendiri bertenancy lewat rantai
  -- FK, tetapi register ini dibaca langsung per-company di laporan retensi,
  -- dan menempuh rantai tiap kali membuat query laporannya mahal & rapuh.
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,

  work_scope_id uuid NOT NULL REFERENCES work_scopes(id) ON DELETE RESTRICT,

  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  released_at date NOT NULL DEFAULT CURRENT_DATE,

  cash_account_id uuid REFERENCES cash_accounts(id) ON DELETE RESTRICT,
  notes text,

  released_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE subcontract_retention_releases IS
  'Pencairan retensi subkontrak ke mandor. Tabel terpisah (bukan kolom di '
  'progress_payments) karena satu pencairan bisa mencakup beberapa pembayaran '
  'dan satu pembayaran bisa dicairkan bertahap — kolom tunggal memaksa 1:1 '
  'yang tidak benar dan menghapus riwayat siapa mencairkan kapan.';

CREATE INDEX IF NOT EXISTS idx_retention_releases_scope
  ON subcontract_retention_releases (work_scope_id);
CREATE INDEX IF NOT EXISTS idx_retention_releases_company
  ON subcontract_retention_releases (company_id);

-- ── 4. RLS — isolasi tenant ─────────────────────────────────────────────────
--
-- Pola mengikuti ADR-011 §7 (komposisi RESTRICTIVE + PERMISSIVE). RESTRICTIVE
-- SENDIRIAN MEMBUNUH TABEL — peringatan T1-F3 di migrasi 131. Karena itu
-- keduanya dipasang.

ALTER TABLE subcontract_retention_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON subcontract_retention_releases;
CREATE POLICY tenant_isolation ON subcontract_retention_releases
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS retention_releases_baca ON subcontract_retention_releases;
CREATE POLICY retention_releases_baca ON subcontract_retention_releases
  FOR SELECT USING (true);

DROP POLICY IF EXISTS retention_releases_tulis ON subcontract_retention_releases;
CREATE POLICY retention_releases_tulis ON subcontract_retention_releases
  FOR INSERT WITH CHECK (true);

-- Sengaja TIDAK ada policy UPDATE/DELETE.
--
-- Pencairan retensi adalah peristiwa uang yang sudah terjadi. Menyuntingnya
-- setelah tercatat sama dengan menulis ulang riwayat pembayaran — dan sisa
-- retensi dihitung dari SELISIH ditahan−dicairkan, jadi menyunting satu baris
-- diam-diam mengubah berapa yang masih boleh cair. Koreksi dilakukan dengan
-- pencairan baru bertanda, bukan dengan menghapus yang lama.

-- ── 5. Penjaga: buktikan tabelnya HIDUP, bukan mati senyap ──────────────────
--
-- Migrasi ini membuat RESTRICTIVE dan PERMISSIVE sekaligus, jadi seharusnya
-- aman. "Seharusnya" tidak cukup untuk tabel uang: bila urutan pernyataan
-- kelak diubah, atau salah satu policy gagal dibuat tanpa memerahkan migrasi,
-- tabelnya MATI TOTAL dan gejalanya baru muncul saat ada yang mencoba
-- mencairkan retensi.
--
-- Preseden persisnya ada di repo ini (T1-F3, migrasi 131). Penjaga di bawah
-- membuat kegagalan itu memerahkan MIGRASINYA, bukan produksi.

DO $$
DECLARE
  v_restrictive int;
  v_permissive  int;
BEGIN
  SELECT count(*) FILTER (WHERE permissive = 'RESTRICTIVE'),
         count(*) FILTER (WHERE permissive = 'PERMISSIVE')
    INTO v_restrictive, v_permissive
    FROM pg_policies
   WHERE schemaname = current_schema()
     AND tablename  = 'subcontract_retention_releases';

  IF v_restrictive = 0 THEN
    RAISE EXCEPTION '183: subcontract_retention_releases tanpa policy RESTRICTIVE '
                    '— tabel retensi TERBUKA lintas tenant.';
  END IF;

  IF v_permissive = 0 THEN
    RAISE EXCEPTION '183: subcontract_retention_releases punya RESTRICTIVE tanpa '
                    'PERMISSIVE — tabel MATI TOTAL (lihat T1-F3, migrasi 131).';
  END IF;
END $$;
