-- ============================================================================
-- 186 — INSTRUKSI LAPANGAN (INTI #6 · triase F5-1, diratifikasi R-010)
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA BUKAN `project_letters` (185) YANG BARU SAJA DIBUAT
-- ══════════════════════════════════════════════════════════════════════════
--
-- Pertanyaan ini saya periksa lebih dulu, dan hampir menjawabnya "sudah
-- tercakup": `surat_jenis` memang sudah punya nilai `instruksi`.
--
-- Yang membedakan ada di kalimat triase F5-1 sendiri:
--
--   > "Perintah LISAN tak berjejak; dasar klaim biaya tambahan hilang"
--
-- Surat mengandaikan **ada dokumennya**. Instruksi lapangan justru lahir dari
-- perintah yang **tak pernah tertulis**: pengawas owner datang ke lokasi,
-- menyuruh membongkar pekerjaan yang sudah jadi, dan pergi. Tak ada surat, tak
-- ada nomor, tak ada tanda tangan.
--
-- Enam bulan kemudian, saat kontraktor menagih biaya bongkar-pasang itu,
-- jawabannya: *"kami tidak pernah menyuruh."*
--
-- Karena itu tabel ini punya satu kolom yang TIDAK ADA di surat, dan justru
-- kolom itulah seluruh alasannya:
--
--   `bentuk_perintah`  lisan · tertulis · telepon · rapat · whatsapp
--
-- Dan satu alur yang tak dimiliki surat:
--
--   perintah lisan dicatat  →  DIKONFIRMASI ke pemberi perintah  →  berjejak
--
-- Konfirmasi itulah produknya. Tanpa langkah itu, catatan sepihak kontraktor
-- bukan bukti — ia cuma versi kita.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA `berdampak_biaya` DAN `berdampak_waktu` DIPISAH
-- ══════════════════════════════════════════════════════════════════════════
--
-- Keduanya memicu jalur yang BERBEDA:
--
--   biaya  → klaim (`contract_claims`, 184) atau change order
--   waktu  → EOT (`contract_eot`, 152)
--
-- Satu instruksi bisa memicu keduanya, salah satunya, atau tak satu pun.
-- Menyatukannya jadi `berdampak: boolean` memaksa penerima menebak jalur mana
-- yang harus ditempuh — dan tebakan yang salah berarti klaim tak pernah
-- diajukan atau EOT tak pernah dimintakan.
--
-- ⚠️ Waktu `timestamptz`, tanggal peristiwa `date` (yang dipersengketakan hari).
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'instruksi_bentuk') THEN
    -- BENTUK PERINTAH — inti keberadaan tabel ini.
    --
    -- `lisan` dan `telepon` adalah yang paling sering disangkal belakangan,
    -- dan justru itu yang paling perlu dicatat SAAT KEJADIAN. Menyediakan
    -- pilihannya secara eksplisit membuat pencatatnya sadar: yang ini butuh
    -- konfirmasi, yang tertulis tidak.
    CREATE TYPE instruksi_bentuk AS ENUM (
      'lisan', 'telepon', 'whatsapp', 'rapat', 'tertulis'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'instruksi_status') THEN
    -- `disangkal` DIPISAH dari `ditolak`, dan bukan sinonim:
    --   ditolak   = pemberi perintah menarik/membatalkan instruksinya
    --   disangkal = pemberi perintah menyatakan TAK PERNAH memberikannya
    --
    -- Yang kedua adalah keadaan sengketa, dan ia harus terlihat berbeda —
    -- kalau disamakan, tak ada cara mengukur berapa sering perintah lisan
    -- berakhir disangkal. Angka itu persis yang membenarkan disiplin
    -- "konfirmasi tertulis dalam 24 jam".
    CREATE TYPE instruksi_status AS ENUM (
      'dicatat', 'dikonfirmasi', 'dilaksanakan', 'ditolak', 'disangkal'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS field_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kategori C — tenancy lewat `projects`, konsisten seluruh saudara di
  -- rantai lapangan (`submittals`, `punch_items`, `project_letters`).
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  nomor text NOT NULL,

  -- ── Siapa yang memerintah ────────────────────────────────────────────────
  --
  -- TEKS, bukan FK: pengawas owner/konsultan tak punya akun di sistem ini
  -- (preseden `submittals.ditujukan_ke`, `project_letters.dari_pihak`).
  -- Memaksakan FK berarti membuat baris palsu hanya agar perintah bisa dicatat
  -- — dan yang malas membuat baris palsu akan memilih tidak mencatat.
  pemberi_nama text NOT NULL,
  pemberi_jabatan text,
  pemberi_pihak text NOT NULL,

  bentuk_perintah instruksi_bentuk NOT NULL,
  isi_instruksi text NOT NULL,
  lokasi text,

  diterima_pada timestamptz NOT NULL,
  penerima_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- ── Dampak: dua jalur berbeda, sengaja dipisah ───────────────────────────
  berdampak_biaya boolean NOT NULL DEFAULT false,
  berdampak_waktu boolean NOT NULL DEFAULT false,
  estimasi_biaya numeric(15,2) CHECK (estimasi_biaya IS NULL OR estimasi_biaya >= 0),
  estimasi_hari integer CHECK (estimasi_hari IS NULL OR estimasi_hari >= 0),

  -- ── Konfirmasi: alasan seluruh tabel ini ada ─────────────────────────────
  --
  -- Perintah lisan yang dicatat sepihak bukan bukti — ia versi kita. Yang
  -- membuatnya berjejak adalah konfirmasi BALIK ke pemberi perintah, dan
  -- tanggalnya menentukan apakah konfirmasi itu dilakukan segera atau setelah
  -- sengketa muncul (yang kedua nyaris tak berguna).
  dikonfirmasi_pada timestamptz,
  dikonfirmasi_via text,          -- "surat 012/PP/VIII", "email", "BA rapat"
  surat_id uuid REFERENCES project_letters(id) ON DELETE SET NULL,

  status instruksi_status NOT NULL DEFAULT 'dicatat',
  catatan text,

  -- Kaitan OPSIONAL ke jalur tindak lanjut. Preseden `submittals.rab_item_id`:
  -- mewajibkannya memaksa pencatat menebak, dan tebakan salah lebih buruk
  -- daripada kosong.
  klaim_id uuid REFERENCES contract_claims(id) ON DELETE SET NULL,
  work_scope_id uuid REFERENCES work_scopes(id) ON DELETE SET NULL,

  dicatat_oleh uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT field_instructions_nomor_unik UNIQUE (project_id, nomor),

  -- Isi instruksi tak boleh sekadar "bongkar". Setahun kemudian, yang membaca
  -- harus bisa tahu APA yang diperintahkan tanpa bertanya ke siapa pun.
  CONSTRAINT field_instructions_isi_bermakna CHECK (
    length(trim(isi_instruksi)) >= 10
  ),

  -- Status `dikonfirmasi` WAJIB bertanggal konfirmasi. Tanpa itu, "sudah
  -- dikonfirmasi" adalah klaim tanpa bukti — persis keadaan yang tabel ini
  -- dibuat untuk menghindarinya.
  CONSTRAINT field_instructions_konfirmasi_bertanggal CHECK (
    status <> 'dikonfirmasi' OR dikonfirmasi_pada IS NOT NULL
  ),

  -- Konfirmasi tak boleh mendahului perintahnya.
  CONSTRAINT field_instructions_urutan_waktu CHECK (
    dikonfirmasi_pada IS NULL OR dikonfirmasi_pada >= diterima_pada
  ),

  -- Estimasi hanya bermakna bila dampaknya memang ditandai. Angka biaya pada
  -- instruksi yang "tak berdampak biaya" akan ikut terhitung di laporan
  -- sebagai potensi klaim yang tak pernah ada.
  CONSTRAINT field_instructions_estimasi_perlu_dampak CHECK (
    (estimasi_biaya IS NULL OR berdampak_biaya = true)
    AND (estimasi_hari IS NULL OR berdampak_waktu = true)
  )
);

COMMENT ON TABLE field_instructions IS
  'Instruksi lapangan — terutama PERINTAH LISAN. Beda dari project_letters '
  '(185) yang mengandaikan ada dokumennya: tabel ini mencatat perintah yang '
  'TAK PERNAH tertulis, lalu melacak konfirmasi baliknya. Tanpa konfirmasi, '
  'catatan sepihak bukan bukti — ia cuma versi kita.';

COMMENT ON COLUMN field_instructions.bentuk_perintah IS
  'Lisan/telepon adalah yang paling sering disangkal belakangan — dan justru '
  'itu yang paling perlu dikonfirmasi tertulis segera.';

COMMENT ON COLUMN field_instructions.status IS
  '`disangkal` BUKAN sinonim `ditolak`: ditolak = pemberi menarik perintahnya; '
  'disangkal = pemberi menyatakan TAK PERNAH memberikannya. Yang kedua adalah '
  'sengketa, dan frekuensinya membenarkan disiplin konfirmasi 24 jam.';

CREATE INDEX IF NOT EXISTS idx_field_instructions_project
  ON field_instructions (project_id);
CREATE INDEX IF NOT EXISTS idx_field_instructions_status
  ON field_instructions (status);
-- Perintah lisan yang BELUM dikonfirmasi = utang bukti. Index ini melayani
-- pertanyaan yang paling sering ditanyakan ke tabel ini.
CREATE INDEX IF NOT EXISTS idx_field_instructions_belum_konfirmasi
  ON field_instructions (project_id, bentuk_perintah)
  WHERE dikonfirmasi_pada IS NULL;

-- ── RLS — kategori C, pola disalin dari project_letters (185) ───────────────
--
-- ⚠️ RESTRICTIVE SAJA MEMATIKAN TABEL (T1-F3, migrasi 131).

ALTER TABLE field_instructions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON field_instructions;
CREATE POLICY tenant_isolation ON field_instructions AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = field_instructions.project_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = field_instructions.project_id
                    AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS field_instructions_baca ON field_instructions;
CREATE POLICY field_instructions_baca ON field_instructions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS field_instructions_tulis ON field_instructions;
CREATE POLICY field_instructions_tulis ON field_instructions
  FOR ALL USING (true) WITH CHECK (true);

DO $$
DECLARE
  v_restrictive int;
  v_permissive  int;
BEGIN
  SELECT count(*) FILTER (WHERE permissive = 'RESTRICTIVE'),
         count(*) FILTER (WHERE permissive = 'PERMISSIVE')
    INTO v_restrictive, v_permissive
    FROM pg_policies
   WHERE schemaname = current_schema() AND tablename = 'field_instructions';

  IF v_restrictive = 0 THEN
    RAISE EXCEPTION '186: field_instructions tanpa RESTRICTIVE — instruksi '
                    'TERBUKA lintas tenant.';
  END IF;
  IF v_permissive = 0 THEN
    RAISE EXCEPTION '186: field_instructions punya RESTRICTIVE tanpa PERMISSIVE '
                    '— tabel MATI TOTAL (lihat T1-F3, migrasi 131).';
  END IF;
END $$;
