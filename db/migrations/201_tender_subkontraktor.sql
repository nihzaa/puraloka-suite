-- ════════════════════════════════════════════════════════════════════════════
-- 201 — Tender & award subkontraktor (F5 PEMBEDA)
--
-- ── Cacat yang ditutup, diukur pada data nyata
--
-- 20 lingkup kerja (`work_scopes`) bernilai Rp 15.000.000 sampai
-- Rp 280.000.000 — SELURUHNYA ber-`contract_status = 'unsigned'`, dan tak
-- satu pun punya jejak bagaimana mandornya dipilih.
--
-- Ini kesenjangan yang PERSIS SAMA dengan yang ditutup RFQ (migrasi 195),
-- tapi di sisi subkontraktor: saat auditor bertanya "kenapa mandor ini yang
-- dapat borongan Rp 280 juta", jawabannya cuma ingatan orang.
--
-- ── Kenapa memakai `workers`, bukan tabel `subcontractors` baru
--
-- Sistem ini memakai MANDOR sebagai padanan lokal subkontraktor — sudah ada
-- `workers` (3 baris), `mandor_assignments` (16), dan `work_scopes` (20)
-- dengan `borongan_value`, `retensi_pct`, `contract_signed_at`.
--
-- Membuat `subcontractors` terpisah menciptakan dua daftar orang yang sama
-- dan dua sumber kebenaran tentang siapa mengerjakan apa. Taksonomi menyebut
-- "subkon formal ber-kontrak" sebagai yang belum ada — itu urusan LAPIS
-- KONTRAK, bukan alasan menduplikasi daftar orangnya.
--
-- ── Kenapa `work_scope_id` boleh kosong
--
-- Tender terjadi SEBELUM lingkup kerja ditetapkan: yang ditenderkan adalah
-- pekerjaannya, dan `work_scopes` baru lahir saat pemenangnya ditunjuk.
-- Memaksa lingkup ada lebih dulu membalik urutan kejadian nyata.
--
-- ── Kenapa TIDAK ada kolom "pemenang" di tabel tender
--
-- Pemenangnya adalah penawaran yang ber-`status = 'menang'`. Menyimpan
-- penanda kedua di kepala tender menciptakan dua sumber kebenaran yang bisa
-- berselisih — tender bilang A menang, penawarannya atas nama B, dan laporan
-- mana pun yang membacanya berbohong tanpa satu pun galat.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS tender_subkon (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  nomor           text NOT NULL,
  judul           text NOT NULL,
  lingkup_kerja   text,

  -- Perkiraan nilai pekerjaan (owner estimate). Dipakai sebagai pembanding
  -- kewajaran penawaran — penawaran 40% di bawah OE biasanya berarti ada
  -- yang tak dihitung, dan itu muncul belakangan sebagai klaim tambah.
  nilai_perkiraan numeric(18,2),

  tanggal         date NOT NULL DEFAULT CURRENT_DATE,
  batas_masuk     date,

  -- `draft`     sedang disusun, mandor belum diundang
  -- `terkirim`  sudah diundang, menunggu penawaran
  -- `selesai`   pemenang sudah ditunjuk
  -- `batal`     dihentikan tanpa pemenang
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','terkirim','selesai','batal')),

  -- Hasil: lingkup kerja yang terbit untuk pemenangnya. Boleh kosong sampai
  -- pemenang ditunjuk.
  work_scope_id   uuid REFERENCES work_scopes(id) ON DELETE SET NULL,

  -- Alasan pemilihan. Wajib diisi lewat aplikasi saat penawar TERMURAH tidak
  -- dipilih — dan itulah seluruh gunanya modul ini.
  alasan_pilih    text,
  catatan         text,

  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tender_subkon_nomor_unik UNIQUE (nomor),
  CONSTRAINT tender_subkon_nilai_wajar CHECK (
    nilai_perkiraan IS NULL OR nilai_perkiraan > 0
  ),
  CONSTRAINT tender_subkon_batas_wajar CHECK (
    batas_masuk IS NULL OR batas_masuk >= tanggal
  )
);

CREATE INDEX IF NOT EXISTS idx_tender_subkon_proyek
  ON tender_subkon(project_id, tanggal DESC);

CREATE TRIGGER trg_tender_subkon_updated_at
  BEFORE UPDATE ON tender_subkon
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── Penawaran tiap mandor ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS penawaran_subkon (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  tender_id       uuid NOT NULL REFERENCES tender_subkon(id) ON DELETE CASCADE,

  -- MANDOR sebagai padanan subkontraktor — lihat catatan di kepala berkas.
  worker_id       uuid NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,

  -- numeric, bukan float — CLAUDE.md §5.4. Angka ini menjadi
  -- `work_scopes.borongan_value` saat menang, dan akhirnya jadi uang yang
  -- dibayarkan.
  nilai_penawaran numeric(18,2) NOT NULL,

  waktu_kerja_hari integer,

  -- Dinyatakan sebagai PENANDA, bukan sebagai nilai 0: penawaran bernilai
  -- nol akan memenangkan perbandingan sebagai "termurah", padahal artinya
  -- mandor itu tak mengajukan apa pun.
  tidak_menawar   boolean NOT NULL DEFAULT false,

  -- `diajukan` masuk, belum diputuskan
  -- `menang`   ditunjuk sebagai pelaksana
  -- `kalah`    tidak ditunjuk
  -- `gugur`    tidak memenuhi syarat (dokumen kurang, dsb.)
  status          text NOT NULL DEFAULT 'diajukan'
                  CHECK (status IN ('diajukan','menang','kalah','gugur')),

  catatan         text,

  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Nilai negatif mustahil; nol hanya sah bila mandor MENYATAKAN tak menawar.
  -- Tanpa pagar ini, "0" akan selalu menang sebagai termurah.
  CONSTRAINT penawaran_subkon_nilai_wajar CHECK (
    nilai_penawaran >= 0
    AND (tidak_menawar OR nilai_penawaran > 0)
  ),

  CONSTRAINT penawaran_subkon_waktu_wajar CHECK (
    waktu_kerja_hari IS NULL OR (waktu_kerja_hari >= 0 AND waktu_kerja_hari <= 3650)
  ),

  -- Yang MENYATAKAN tidak menawar tak boleh menang. Tanpa ini, satu salah
  -- klik menunjuk pelaksana yang tak pernah mengajukan harga.
  CONSTRAINT penawaran_subkon_tak_menawar_tak_menang CHECK (
    NOT (tidak_menawar AND status = 'menang')
  ),

  -- Satu mandor menawar SEKALI per tender. Penawaran revisi yang masuk
  -- sebagai baris kedua membuat tabulasi menghitungnya dua kali dengan dua
  -- harga berbeda.
  CONSTRAINT penawaran_subkon_unik UNIQUE (tender_id, worker_id)
);

CREATE INDEX IF NOT EXISTS idx_penawaran_subkon_tender
  ON penawaran_subkon(tender_id);

-- Satu tender hanya boleh punya SATU pemenang. Dijaga di basis, bukan hanya
-- di aplikasi: dua pemenang berarti dua kontrak untuk pekerjaan yang sama,
-- dan itu baru ketahuan saat keduanya menagih.
CREATE UNIQUE INDEX IF NOT EXISTS idx_penawaran_subkon_satu_pemenang
  ON penawaran_subkon(tender_id) WHERE status = 'menang';

CREATE TRIGGER trg_penawaran_subkon_updated_at
  BEFORE UPDATE ON penawaran_subkon
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE tender_subkon ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tender_subkon AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id()))
  WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));

CREATE POLICY tender_subkon_baca ON tender_subkon
  FOR SELECT USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

CREATE POLICY tender_subkon_kelola ON tender_subkon
  FOR ALL USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']))
  WITH CHECK ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

-- `penawaran_subkon` mewarisi tenancy lewat `tender_id`. Nilai penawaran
-- mandor adalah informasi komersial yang paling merugikan kalau bocor —
-- terutama ke sesama mandor yang sedang bersaing.
ALTER TABLE penawaran_subkon ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON penawaran_subkon AS RESTRICTIVE FOR ALL
  USING (EXISTS (
    SELECT 1 FROM tender_subkon t
     WHERE t.id = penawaran_subkon.tender_id
       AND project_company_id(t.project_id) = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM tender_subkon t
     WHERE t.id = penawaran_subkon.tender_id
       AND project_company_id(t.project_id) = (SELECT auth_company_id())));

CREATE POLICY penawaran_subkon_baca ON penawaran_subkon
  FOR SELECT USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

CREATE POLICY penawaran_subkon_kelola ON penawaran_subkon
  FOR ALL USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']))
  WITH CHECK ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

-- ── Menu ────────────────────────────────────────────────────────────────────
-- Href TETAP `/m/sk-tender` untuk sementara: halamannya belum ada karena
-- `apps/web` sedang dipegang sesi lain. Mengarahkannya sekarang membuat menu
-- menunjuk halaman yang tak ada — 404 diam-diam, persis cacat yang penjaga
-- `uji-izin-rute-lengkap.mjs` dibuat untuk mencegah.
--
-- Diarahkan di migrasi berikutnya, bersama halamannya.

COMMIT;
