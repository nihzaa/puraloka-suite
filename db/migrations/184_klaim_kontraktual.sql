-- ============================================================================
-- 184 — KLAIM KONTRAKTUAL (INTI #4 · triase F5-1, diratifikasi R-010)
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA INI BUKAN "TINGGAL PAKAI change_orders"
-- ══════════════════════════════════════════════════════════════════════════
--
-- Rantai kontrak sudah punya DUA pilar, dan keduanya sehat:
--
--   change_orders   variasi LINGKUP — pekerjaan bertambah/berkurang, nilainya
--                   berubah, dan kedua pihak menyepakatinya di depan.
--   contract_eot    perpanjangan WAKTU — tenggat bergeser, denda ikut bergeser.
--
-- Yang hilang adalah pilar ketiga: **klaim biaya tambahan yang LINGKUPNYA TIDAK
-- BERUBAH.** Kontraktor mengerjakan persis apa yang dikontrakkan, tetapi
-- biayanya membengkak karena sesuatu yang bukan salahnya:
--
--   · lahan terlambat diserahkan     → alat & orang menganggur, tetap dibayar
--   · gambar terlambat/berubah       → pekerjaan dibongkar-ulang
--   · kondisi tanah tak terduga      → metode kerja berubah, biaya naik
--   · penghentian sementara oleh owner
--
-- Memaksakannya jadi `change_orders` MENYESATKAN: change order menaikkan nilai
-- kontrak karena lingkupnya memang bertambah. Klaim tidak — lingkupnya sama,
-- yang bertambah adalah BIAYA MELAKSANAKANNYA. Mencampur keduanya membuat
-- `baseline_contract_value` berbohong, dan seluruh laporan yang berdiri di
-- atasnya (CVR, profitabilitas, WIP) ikut salah.
--
-- Memaksakannya jadi EOT juga salah: EOT murni soal HARI. Diukur 2026-08-04 —
-- `contract_eot` tak punya satu pun kolom nominal. Banyak klaim memang lahir
-- dari peristiwa yang sama dengan EOT, tapi keduanya bisa berdiri sendiri:
-- ada klaim tanpa perpanjangan waktu, dan ada EOT tanpa biaya tambahan.
--
-- ══════════════════════════════════════════════════════════════════════════
-- NILAINYA BARU TERASA SAAT SENGKETA — DAN SAAT ITU TERLAMBAT MEMBANGUNNYA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Klaim yang tak berjejak = klaim yang tak bisa dibuktikan. Yang menentukan di
-- meja perundingan bukan besarnya angka, melainkan: kapan peristiwanya terjadi,
-- kapan diberitahukan ke owner, dan apa dasarnya. Ketiganya harus tercatat
-- SAAT KEJADIAN, bukan direkonstruksi setahun kemudian dari ingatan.
--
-- Karena itu tabel ini menyimpan `event_date` dan `notified_at` TERPISAH:
-- hampir semua kontrak konstruksi punya batas waktu pemberitahuan (lazimnya
-- 14–28 hari sejak peristiwa). Klaim yang terlambat diberitahukan bisa GUGUR
-- seluruhnya betapa pun sahnya. Menyimpan satu tanggal saja menghapus
-- kemampuan menjawab pertanyaan yang justru paling menentukan.
--
-- ⚠️ SEMUA NOMINAL `numeric` — nol float (CLAUDE.md §5.4). Waktu `timestamptz`,
--    tanggal peristiwa `date` (yang dipersengketakan hari, bukan jam).
-- ============================================================================

-- ── Jenis klaim ─────────────────────────────────────────────────────────────
--
-- Enum, bukan teks bebas: jenis klaim menentukan dasar hukumnya, dan teks bebas
-- membuat laporan "klaim per jenis" mustahil dibuat konsisten. Daftar ini
-- mengikuti kategori yang lazim di kontrak konstruksi Indonesia.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'claim_type') THEN
    CREATE TYPE claim_type AS ENUM (
      'keterlambatan_lahan',      -- lahan/akses terlambat diserahkan
      'keterlambatan_gambar',     -- gambar/spesifikasi terlambat atau berubah
      'kondisi_tak_terduga',      -- kondisi tanah/lapangan di luar dugaan wajar
      'penghentian_sementara',    -- suspensi oleh pemberi kerja
      'percepatan',               -- diminta mempercepat (acceleration)
      'force_majeure',
      'lain_lain'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'claim_status') THEN
    -- `gugur` DIPISAH dari `ditolak`, sengaja. Ditolak = owner menilai
    -- klaimnya tak berdasar. Gugur = klaimnya mungkin sah, tetapi batas waktu
    -- pemberitahuan terlampaui. Menyatukannya menghapus pelajaran yang paling
    -- mahal: berapa banyak uang hilang karena TERLAMBAT MEMBERI TAHU, bukan
    -- karena klaimnya lemah.
    CREATE TYPE claim_status AS ENUM (
      'draft', 'diberitahukan', 'diajukan', 'disetujui',
      'disetujui_sebagian', 'ditolak', 'gugur'
    );
  END IF;
END $$;

-- ── Tabel klaim ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contract_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kategori C — tenancy lewat `projects`, sejalan `contract_eot` dan
  -- `change_orders` yang sudah ada. Konsisten dengan saudaranya di rantai yang
  -- sama; memberinya `company_id` sendiri justru membuat dua sumber kebenaran.
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,

  claim_number text NOT NULL,
  claim_type claim_type NOT NULL,
  title text NOT NULL,
  description text,

  -- ── Tiga tanggal, dan masing-masing menjawab pertanyaan berbeda ───────────
  --
  -- event_date    kapan peristiwanya TERJADI
  -- notified_at   kapan owner DIBERI TAHU  ← yang menentukan klaim gugur/tidak
  -- submitted_at  kapan rincian biayanya DIAJUKAN
  --
  -- Kontrak lazimnya memberi batas 14–28 hari antara peristiwa dan
  -- pemberitahuan. Menyimpan satu tanggal saja menghapus kemampuan menjawab
  -- "apakah kita memberi tahu tepat waktu?" — pertanyaan yang paling sering
  -- menggugurkan klaim yang sebenarnya sah.
  event_date date NOT NULL,
  notified_at date,
  submitted_at timestamptz,

  -- Batas hari pemberitahuan menurut kontrak proyek ini. NULL = belum
  -- diketahui/tak diatur; itu SAH dan berbeda dari 0.
  notice_days_limit integer CHECK (notice_days_limit IS NULL OR notice_days_limit >= 0),

  -- ── Nominal ───────────────────────────────────────────────────────────────
  amount_claimed numeric(15,2) NOT NULL CHECK (amount_claimed >= 0),
  amount_approved numeric(15,2) CHECK (amount_approved IS NULL OR amount_approved >= 0),

  -- Hari tambahan yang diminta BERSAMA klaim ini, bila ada. Klaim biaya dan
  -- perpanjangan waktu sering lahir dari peristiwa yang sama.
  eot_id uuid REFERENCES contract_eot(id) ON DELETE SET NULL,

  status claim_status NOT NULL DEFAULT 'draft',
  decided_at timestamptz,
  decided_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  decision_note text,

  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Nomor klaim unik PER PROYEK, bukan global: tiap proyek punya penomoran
  -- sendiri, dan itu yang tertulis di surat ke owner.
  CONSTRAINT contract_claims_nomor_unik UNIQUE (project_id, claim_number),

  -- Keputusan wajib disertai jejak SIAPA dan KAPAN. Tanpa ini, klaim bisa
  -- berstatus 'disetujui' tanpa seorang pun bertanggung jawab atasnya —
  -- dan angka yang disetujui itu masuk ke laporan keuangan.
  CONSTRAINT contract_claims_keputusan_berjejak CHECK (
    status IN ('draft', 'diberitahukan', 'diajukan')
    OR (decided_at IS NOT NULL AND decided_by IS NOT NULL)
  ),

  -- Nilai disetujui hanya bermakna pada status yang memang memutuskan.
  CONSTRAINT contract_claims_nilai_disetujui_wajar CHECK (
    (status IN ('disetujui', 'disetujui_sebagian') AND amount_approved IS NOT NULL)
    OR (status NOT IN ('disetujui', 'disetujui_sebagian') AND amount_approved IS NULL)
  )
);

COMMENT ON TABLE contract_claims IS
  'Klaim biaya tambahan yang LINGKUPNYA TIDAK berubah — beda dari change_orders '
  '(lingkup bertambah) dan contract_eot (waktu saja). Mencampurnya ke '
  'change_orders membuat baseline_contract_value berbohong dan merusak CVR, '
  'profitabilitas, serta WIP yang berdiri di atasnya.';

COMMENT ON COLUMN contract_claims.notified_at IS
  'Kapan owner DIBERI TAHU — terpisah dari event_date karena kontrak lazimnya '
  'memberi batas 14-28 hari, dan klaim yang telat diberitahukan bisa GUGUR '
  'betapa pun sahnya.';

CREATE INDEX IF NOT EXISTS idx_contract_claims_project
  ON contract_claims (project_id);
CREATE INDEX IF NOT EXISTS idx_contract_claims_status
  ON contract_claims (status);

-- Catatan: TIDAK ada trigger `updated_at` — repo ini memang tak punya fungsi
-- generiknya (diperiksa: nol migrasi mendefinisikan `update_updated_at_column`).
-- `contract_eot` dan `change_orders` pun mengandalkan pembaruan dari aplikasi.
-- Menambahkan pola baru di sini akan membuat dua kebiasaan berbeda di rantai
-- yang sama.

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Kategori C: isolasi lewat `projects`. Pola disalin PERSIS dari `contract_eot`
-- (migrasi 152 baris 184-192) — saudara terdekatnya di rantai yang sama.
-- Bentuk `EXISTS (...)`, bukan `IN (...)`: menyamai preseden lebih berharga
-- daripada preferensi gaya, karena yang membaca berikutnya membandingkannya
-- dengan tetangganya.
--
-- ⚠️ RESTRICTIVE SAJA MEMATIKAN TABEL (peringatan T1-F3, migrasi 131), jadi
-- PERMISSIVE dipasang bersamanya dan penjaga di bawah membuktikan keduanya ada.

ALTER TABLE contract_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON contract_claims;
CREATE POLICY tenant_isolation ON contract_claims AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = contract_claims.project_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = contract_claims.project_id
                    AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS contract_claims_baca ON contract_claims;
CREATE POLICY contract_claims_baca ON contract_claims
  FOR SELECT USING (true);

DROP POLICY IF EXISTS contract_claims_tulis ON contract_claims;
CREATE POLICY contract_claims_tulis ON contract_claims
  FOR ALL USING (true) WITH CHECK (true);

-- ── Penjaga: buktikan tabelnya HIDUP, bukan mati senyap ─────────────────────

DO $$
DECLARE
  v_restrictive int;
  v_permissive  int;
BEGIN
  SELECT count(*) FILTER (WHERE permissive = 'RESTRICTIVE'),
         count(*) FILTER (WHERE permissive = 'PERMISSIVE')
    INTO v_restrictive, v_permissive
    FROM pg_policies
   WHERE schemaname = current_schema() AND tablename = 'contract_claims';

  IF v_restrictive = 0 THEN
    RAISE EXCEPTION '184: contract_claims tanpa policy RESTRICTIVE — klaim '
                    'TERBUKA lintas tenant.';
  END IF;

  IF v_permissive = 0 THEN
    RAISE EXCEPTION '184: contract_claims punya RESTRICTIVE tanpa PERMISSIVE — '
                    'tabel MATI TOTAL (lihat T1-F3, migrasi 131).';
  END IF;
END $$;
