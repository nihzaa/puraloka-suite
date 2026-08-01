-- ============================================================
-- 147 — BID REGISTER + BACKLOG (ROADMAP #22 · PETA #10)
--
-- ── Masalah yang diselesaikan
--
-- Dua hal yang hari ini tak terekam di mana pun:
--
--   1. **Tender yang kalah tidak dipelajari.** Kalau tak ada catatannya,
--      pertanyaan "kita kalah karena harga atau karena syarat?" hanya bisa
--      dijawab dari ingatan. Padahal jawabannya menentukan harga penawaran
--      berikutnya.
--   2. **Backlog tak terlihat saat memutuskan ambil kerja.** Nilai pekerjaan
--      yang SUDAH dimenangkan tapi belum selesai adalah beban kapasitas nyata;
--      mengambil tender baru tanpa melihatnya adalah cara paling umum
--      kontraktor kecil kelebihan muatan.
--
-- ── Kenapa RINGAN, bukan CRM penuh
--
-- `PETA-PRIORITAS-ERP.md` §"Sengaja tidak dibangun" menyebut CRM pipeline penuh
-- DICORET; yang dibutuhkan cuma register tender. Jadi ini SATU tabel, bukan
-- lead→opportunity→quote. Menambah tahapan pipeline yang tak dipakai hanya
-- membuat form panjang yang diisi asal supaya bisa lanjut.
--
-- ── Tenancy
--
-- Kategori **B** (`company_id NOT NULL`) — tender milik satu badan usaha, tak
-- pernah dipakai bersama. Konsisten dengan `projects`.
--
-- ⚠️ Constraint UNIQUE-nya menyertakan `company_id` SEJAK AWAL. Dua kali hari
-- ini (`financial_config` migrasi 145, `feature_flags` migrasi 146) ditemukan
-- tabel pra-multi-tenant yang UNIQUE-nya global lalu menghalangi badan usaha
-- kedua. Tabel baru tak boleh mengulang pola itu.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS bids (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),

  -- Nomor tender dari penyelenggara. Bukan penomoran kita sendiri: yang
  -- dipakai saat berkorespondensi adalah nomor MEREKA.
  bid_number      TEXT,
  title           TEXT NOT NULL,
  owner_name      TEXT,                 -- pemberi kerja / penyelenggara tender
  location        TEXT,

  -- Nilai yang KITA tawarkan. Nullable karena register bisa dibuat saat
  -- tender baru diumumkan, sebelum harga dihitung.
  bid_value       NUMERIC(18,2),
  -- Nilai pemenang (kalau kita kalah & angkanya diumumkan). Inilah yang
  -- membuat "kalah karena harga" bisa dibedakan dari "kalah karena syarat".
  winner_value    NUMERIC(18,2),

  submitted_at    DATE,
  decided_at      DATE,

  status          TEXT NOT NULL DEFAULT 'prospek'
                  CHECK (status IN ('prospek','go','no_go','diajukan','menang','kalah','batal')),

  -- Alasan Go/No-Go & alasan kalah — teks bebas, SENGAJA bukan enum.
  -- Enum di sini akan memaksa penyeragaman sebelum polanya diketahui;
  -- setelah 20-30 tender terkumpul barulah kategorinya pantas dibakukan.
  decision_note   TEXT,

  -- Terisi saat status='menang' dan pekerjaannya dijalankan. Inilah jembatan
  -- ke backlog: nilai kontrak yang sudah dimenangkan tapi proyeknya belum
  -- selesai. ON DELETE SET NULL — proyek boleh dihapus (soft-delete), riwayat
  -- tendernya tetap berguna dipelajari.
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,

  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Tanggal keputusan tak boleh mendahului tanggal pengajuan.
  CONSTRAINT chk_bids_tanggal CHECK (decided_at IS NULL OR submitted_at IS NULL OR decided_at >= submitted_at),
  -- Nilai negatif = salah input, bukan diskon.
  CONSTRAINT chk_bids_nilai CHECK (
    (bid_value IS NULL OR bid_value >= 0) AND (winner_value IS NULL OR winner_value >= 0))
);

-- Nomor tender unik PER-COMPANY, bukan global (lihat catatan tenancy di atas).
-- Partial index: `bid_number` boleh NULL berkali-kali — tender yang baru
-- dicatat sering belum punya nomor resmi.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bids_company_number
  ON bids (company_id, bid_number) WHERE bid_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bids_company_status ON bids (company_id, status);
CREATE INDEX IF NOT EXISTS idx_bids_project ON bids (project_id) WHERE project_id IS NOT NULL;

COMMENT ON TABLE bids IS
  'Register tender/bid ringan (147). Menjawab dua hal yang tak terekam sebelumnya: kenapa sebuah tender kalah, dan berapa backlog yang sudah dimenangkan saat memutuskan ambil kerja baru. SENGAJA satu tabel — CRM pipeline penuh dicoret di PETA-PRIORITAS.';
COMMENT ON COLUMN bids.winner_value IS
  'Nilai penawaran pemenang bila diumumkan. Selisihnya terhadap bid_value yang membedakan "kalah karena harga" dari "kalah karena syarat".';

-- ── RLS: pola yang sama dengan tabel kategori B lain ────────────────────────
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

-- ⚠️ NAMA policy WAJIB `tenant_isolation` — bukan nama bebas.
-- Dua test permanen memindai policy dengan NAMA itu untuk membuktikan setiap
-- tabel ber-tenant punya axis company (`t5a-policy-tenant.test.ts` &
-- `t7-exit-criteria-l2.test.ts`). Versi pertama migrasi ini menamainya
-- `bids_tenant`; policy-nya berfungsi, tapi kedua test langsung MERAH karena
-- klaim "seluruh tabel ber-tenant terlindungi" jadi tak bisa diverifikasi
-- secara mekanis. Konvensi di sini bukan gaya penulisan — ia yang membuat
-- jaminannya bisa dibuktikan.
--
-- `(SELECT ...)` — bentuk InitPlan, juga WAJIB. Tanpa pembungkus itu
-- `auth_company_id()` dievaluasi SEKALI PER BARIS; migrasi 132 menulis ulang
-- 173 policy karena persis kesalahan ini (3.524 ms → 5,1 ms).
DROP POLICY IF EXISTS tenant_isolation ON bids;
CREATE POLICY tenant_isolation ON bids AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS bids_baca ON bids;
CREATE POLICY bids_baca ON bids
  FOR SELECT TO authenticated
  USING ((SELECT has_permission('projects:view')));

DROP POLICY IF EXISTS bids_kelola ON bids;
CREATE POLICY bids_kelola ON bids
  FOR ALL TO authenticated
  USING ((SELECT has_permission('projects:edit')))
  WITH CHECK ((SELECT has_permission('projects:edit')));

-- ── Verifikasi: gagal berisik bila tak tercapai ─────────────────────────────
DO $$
DECLARE
  v_a UUID;
  v_b UUID;
BEGIN
  IF to_regclass('public.bids') IS NULL THEN
    RAISE EXCEPTION '147 GAGAL: tabel bids tak terbentuk';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'bids') THEN
    -- Migrasi 134 lahir dari 8 tabel yang punya policy lengkap tapi RLS-nya
    -- MATI — policy di tabel tanpa RLS tidak dievaluasi sama sekali, dan itu
    -- terbaca benar saat review.
    RAISE EXCEPTION '147 GAGAL: RLS tidak menyala di bids';
  END IF;

  SELECT id INTO v_a FROM companies ORDER BY created_at LIMIT 1;
  IF v_a IS NULL THEN
    RAISE NOTICE '147: nol company — uji fungsional dilewati';
  ELSE
    BEGIN
      INSERT INTO companies (code, name) VALUES ('uji-147', '[UJI-147] sementara')
        RETURNING id INTO v_b;

      -- Nomor tender yang SAMA boleh dipakai dua perusahaan berbeda.
      INSERT INTO bids (company_id, bid_number, title) VALUES (v_a, 'TDR-001', '[UJI] A');
      INSERT INTO bids (company_id, bid_number, title) VALUES (v_b, 'TDR-001', '[UJI] B');

      -- Dalam satu perusahaan, nomor kembar HARUS ditolak.
      BEGIN
        INSERT INTO bids (company_id, bid_number, title) VALUES (v_a, 'TDR-001', '[UJI] A2');
        RAISE EXCEPTION '147 GAGAL: nomor tender kembar dalam satu company tidak ditolak';
      EXCEPTION WHEN unique_violation THEN NULL;
      END;

      -- NULL boleh berkali-kali (tender belum bernomor).
      INSERT INTO bids (company_id, bid_number, title) VALUES (v_a, NULL, '[UJI] tanpa nomor 1');
      INSERT INTO bids (company_id, bid_number, title) VALUES (v_a, NULL, '[UJI] tanpa nomor 2');

      -- Tanggal terbalik ditolak.
      BEGIN
        INSERT INTO bids (company_id, title, submitted_at, decided_at)
          VALUES (v_a, '[UJI] tanggal', '2026-03-01', '2026-02-01');
        RAISE EXCEPTION '147 GAGAL: decided_at < submitted_at tidak ditolak';
      EXCEPTION WHEN check_violation THEN NULL;
      END;

      RAISE EXCEPTION 'UJI147_SELESAI';
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM <> 'UJI147_SELESAI' THEN RAISE; END IF;
    END;
  END IF;

  RAISE NOTICE '147 OK: bids siap — unik per-company, RLS menyala, constraint tanggal & nilai aktif';
END $$;

COMMIT;
