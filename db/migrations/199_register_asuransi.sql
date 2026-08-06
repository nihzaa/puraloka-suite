-- ════════════════════════════════════════════════════════════════════════════
-- 199 — Register Asuransi (F5 PEMBEDA)
--
-- ── Cacat yang ditutup
--
-- Diukur 2026-08-06: NOL tabel dan NOL kolom asuransi di seluruh basis.
-- Kontrak konstruksi hampir selalu mensyaratkan polis (CAR/TPL/Jamsostek),
-- dan saat klaim terjadi yang ditanya pertama adalah nomor polis + masa
-- berlakunya. Tanpa register, jawabannya ada di map fisik seseorang.
--
-- ── Kenapa TIDAK memakai `contract_bonds`
--
-- Tabel itu polanya mirip (issuer, amount, issued_date, expiry_date, status)
-- tapi isinya JAMINAN BANK — CHECK-nya membatasi `bond_type` ke
-- penawaran/pelaksanaan/uang_muka/pemeliharaan. Asuransi berbeda pihaknya
-- (perusahaan asuransi, bukan bank), berbeda gunanya (menanggung kerugian,
-- bukan menjamin kewajiban), dan berbeda yang ditanyakan saat klaim.
--
-- Memaksa polis ke sana berarti melonggarkan CHECK jaminan — dan sesudah itu
-- tak ada lagi yang membedakan "jaminan pelaksanaan cair" dari "polis CAR
-- kadaluarsa" pada laporan mana pun.
--
-- ── Kenapa `periode_mulai`/`periode_selesai`, bukan sekadar `expiry_date`
--
-- Polis yang terbit hari ini tapi baru berlaku bulan depan TIDAK menanggung
-- apa pun hari ini. `projects.start_date`/`end_date` sudah ada, jadi celah
-- pertanggungan bisa dihitung: polis yang mulai SESUDAH proyek jalan, atau
-- berakhir SEBELUM proyek selesai, meninggalkan hari-hari tanpa penanggung.
--
-- Itulah yang membuat register ini berguna, bukan sekadar tempat menyimpan
-- nomor.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS polis_asuransi (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- `car`        Contractor's All Risk — kerusakan pekerjaan & material
  -- `tpl`        Third Party Liability — kerugian pihak ketiga
  -- `jamsostek`  BPJS Ketenagakerjaan pekerja proyek
  -- `car_tpl`    polis gabungan (lazim di Indonesia)
  -- `lainnya`    di luar keempatnya — `jenis_lain` menjelaskan
  jenis           text NOT NULL
                  CHECK (jenis IN ('car','tpl','jamsostek','car_tpl','lainnya')),
  jenis_lain      text,

  nomor_polis     text NOT NULL,
  penerbit        text NOT NULL,

  -- Nilai pertanggungan. numeric, bukan float — CLAUDE.md §5.4.
  nilai_pertanggungan numeric(18,2),
  premi           numeric(18,2),

  -- MASA BERLAKU, bukan sekadar tanggal kadaluarsa. Polis yang terbit hari
  -- ini tapi baru berlaku bulan depan tak menanggung apa pun hari ini.
  periode_mulai   date NOT NULL,
  periode_selesai date NOT NULL,

  tertanggung     text,
  catatan         text,
  dokumen_url     text,

  status          text NOT NULL DEFAULT 'aktif'
                  CHECK (status IN ('aktif','kadaluarsa','dibatalkan')),

  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Periode terbalik membuat seluruh perhitungan celah pertanggungan
  -- menghasilkan angka negatif yang terbaca sebagai "lebih dari cukup".
  CONSTRAINT polis_periode_wajar CHECK (periode_selesai >= periode_mulai),

  CONSTRAINT polis_nilai_wajar CHECK (
    (nilai_pertanggungan IS NULL OR nilai_pertanggungan >= 0)
    AND (premi IS NULL OR premi >= 0)
  ),

  -- `jenis_lain` hanya boleh terisi bila jenisnya memang `lainnya`. Kolom
  -- yang terisi pada baris tak relevan akan dibaca laporan berikutnya
  -- sebagai fakta.
  CONSTRAINT polis_jenis_lain_konsisten CHECK (
    (jenis = 'lainnya') OR jenis_lain IS NULL
  ),

  -- Satu nomor polis dari satu penerbit tak boleh tercatat dua kali pada
  -- proyek yang sama — salinan kedua membuat nilai pertanggungan terhitung
  -- ganda.
  CONSTRAINT polis_nomor_unik UNIQUE (project_id, penerbit, nomor_polis)
);

CREATE INDEX IF NOT EXISTS idx_polis_proyek
  ON polis_asuransi(project_id, periode_selesai DESC);

CREATE TRIGGER trg_polis_updated_at
  BEFORE UPDATE ON polis_asuransi
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE polis_asuransi ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON polis_asuransi AS RESTRICTIVE FOR ALL
  USING (project_company_id(project_id) = (SELECT auth_company_id()))
  WITH CHECK (project_company_id(project_id) = (SELECT auth_company_id()));

CREATE POLICY polis_baca ON polis_asuransi
  FOR SELECT USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

CREATE POLICY polis_kelola ON polis_asuransi
  FOR ALL USING ((SELECT auth_role()) = ANY (ARRAY['admin','pm']))
  WITH CHECK ((SELECT auth_role()) = ANY (ARRAY['admin','pm']));

-- ── Menu ────────────────────────────────────────────────────────────────────
UPDATE menu_items SET href = '/kontrak/asuransi' WHERE key = 'kt-asuransi';

COMMIT;
