-- ============================================================================
-- 185 — SURAT MASUK/KELUAR (INTI #5 · triase F5-1, diratifikasi R-010)
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA BUKAN `documents` YANG SUDAH ADA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Diukur 2026-08-04, `documents` punya: project_id · title · doc_type ·
-- file_url · version · is_visible_to_client · uploaded_by.
--
-- Itu **repositori berkas**, bukan korespondensi. Yang tak ada — dan justru
-- yang membuat surat jadi BUKTI:
--
--   · dari SIAPA, ke SIAPA        (dokumen cuma tahu siapa yang mengunggah)
--   · kapan DIKIRIM vs DITERIMA   (dua tanggal berbeda, dan selisihnya penting)
--   · surat ini MEMBALAS yang mana
--   · butuh dibalas atau tidak, dan kapan batasnya
--
-- Menempelkan kolom-kolom itu ke `documents` akan membuat 90% barisnya NULL
-- (foto progres tak punya pengirim), dan tiap query dokumen menanggung kolom
-- yang tak relevan baginya. Tabel terpisah lebih jujur.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA POLANYA MENIRU `submittals` (159), BUKAN BENTUK BARU
-- ══════════════════════════════════════════════════════════════════════════
--
-- `submittals` sudah memecahkan masalah yang bentuknya HAMPIR SAMA: dokumen
-- resmi ke pihak luar, bernomor, berantai revisi, dengan tenggat keputusan.
-- Empat gagasannya dipakai ulang di sini, bukan ditemukan ulang:
--
--   1. nomor unik PER PROYEK          — itu yang tertulis di surat sungguhan
--   2. rantai `induk_id`              — di sini: surat mana yang DIBALAS
--   3. `ditujukan_ke` TEKS, bukan FK  — lawan bicara ada di luar sistem
--   4. constraint status↔tanggal      — status tanpa tanggalnya = bukti bolong
--
-- Yang BERBEDA dan sengaja: surat punya ARAH (masuk/keluar), dan arah itu
-- mengubah arti tiap tanggal. Surat KELUAR: kita yang mengirim, tanggal terima
-- sering tak pernah diketahui. Surat MASUK: kita yang menerima, dan justru
-- tanggal terima itulah yang memulai hitungan kewajiban menjawab.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA INI INTI, BUKAN KERAPIAN ADMINISTRATIF
-- ══════════════════════════════════════════════════════════════════════════
--
-- Saat sengketa, yang menentukan bukan siapa yang benar melainkan siapa yang
-- BISA MEMBUKTIKAN. Tiga pertanyaan yang selalu muncul:
--
--   "kapan kami memberi tahu Anda?"        → tanggal_kirim
--   "kapan Anda menjawab?"                 → membalas_id + tanggal_kirim balasan
--   "kenapa tak ada yang menjawab surat X?" → butuh_balasan + batas_balas
--
-- Ketiganya HARUS tercatat saat kejadian. Direkonstruksi setahun kemudian dari
-- folder email, jawabannya selalu "sepertinya sudah" — dan "sepertinya" tak
-- berlaku di hadapan pemberi kerja.
--
-- ⚠️ Waktu `timestamptz`, tanggal batas `date` (yang dipersengketakan hari).
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'surat_arah') THEN
    CREATE TYPE surat_arah AS ENUM ('masuk', 'keluar');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'surat_jenis') THEN
    -- Jenis menentukan BOBOT HUKUMNYA, bukan sekadar label untuk disaring.
    -- `teguran` dan `peringatan` sering jadi dasar pemutusan kontrak; kalau
    -- keduanya tenggelam di antara surat biasa, yang paling menentukan justru
    -- yang paling tak terlihat.
    CREATE TYPE surat_jenis AS ENUM (
      'pemberitahuan',      -- notice biasa
      'permintaan',         -- minta sesuatu (data, persetujuan, pembayaran)
      'teguran',            -- ⚠️ dasar sengketa
      'peringatan',         -- ⚠️ eskalasi dari teguran
      'klarifikasi',
      'instruksi',          -- perintah dari pemberi kerja
      'balasan',
      'lain_lain'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'surat_status') THEN
    -- `kedaluwarsa` DIPISAH dari `selesai`, sama alasannya dengan `gugur` vs
    -- `ditolak` di klaim (184): surat yang lewat batas tanpa dibalas adalah
    -- KELALAIAN yang bisa diperbaiki dengan disiplin — dan menyatukannya
    -- dengan "selesai" menghapus satu-satunya cara mengukurnya.
    CREATE TYPE surat_status AS ENUM (
      'draft', 'terkirim', 'diterima', 'dibalas', 'selesai', 'kedaluwarsa'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS project_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kategori C — tenancy lewat `projects`, konsisten `submittals`,
  -- `contract_eot`, dan `contract_claims`. Memberinya `company_id` sendiri
  -- justru membuat dua sumber kebenaran untuk hal yang sama.
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  nomor text NOT NULL,
  arah surat_arah NOT NULL,
  jenis surat_jenis NOT NULL DEFAULT 'pemberitahuan',
  perihal text NOT NULL,
  ringkasan text,

  -- Pihak LUAR = teks, bukan FK. Preseden `submittals.ditujukan_ke`: lawan
  -- bicara (owner, konsultan, dinas) tak punya akun di sistem ini, dan
  -- memaksakan FK berarti membuat baris palsu hanya agar surat bisa dicatat.
  dari_pihak text NOT NULL,
  kepada_pihak text NOT NULL,

  -- ── Dua tanggal, dan artinya bergantung ARAH ────────────────────────────
  --
  -- KELUAR : tanggal_kirim = kita mengirim · tanggal_terima sering tak
  --          pernah diketahui, dan itu SAH (NULL, bukan ditebak)
  -- MASUK  : tanggal_terima = kita menerima, dan dari sinilah hitungan
  --          kewajiban menjawab dimulai
  --
  -- Menyatukannya jadi satu kolom "tanggal" akan menghapus perbedaan yang
  -- justru paling sering dipersoalkan: surat dikirim tanggal 1, sampai
  -- tanggal 10 — kewajiban menjawab dihitung dari yang mana?
  tanggal_kirim date,
  tanggal_terima date,

  -- ── Rantai balasan ───────────────────────────────────────────────────────
  --
  -- Preseden `submittals.induk_id`. Tanpa ini, "surat kami tak pernah dibalas"
  -- hanya bisa dibantah dengan mencari manual di folder — dan yang mencari
  -- selalu menemukan apa yang ingin ditemukannya.
  membalas_id uuid REFERENCES project_letters(id) ON DELETE SET NULL,

  butuh_balasan boolean NOT NULL DEFAULT false,
  batas_balas date,

  status surat_status NOT NULL DEFAULT 'draft',

  -- Lampiran menunjuk ke `documents` yang sudah ada — berkasnya memang di sana,
  -- dan menyalinnya ke sini akan membuat dua sumber kebenaran untuk satu file.
  dokumen_id uuid REFERENCES documents(id) ON DELETE SET NULL,

  dicatat_oleh uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Nomor unik PER PROYEK — itu yang tertulis di surat sungguhan, dan dua
  -- surat bernomor sama membuat rujukan "sesuai surat 012/PP/VIII" ambigu.
  CONSTRAINT project_letters_nomor_unik UNIQUE (project_id, nomor),

  -- Surat yang sudah TERKIRIM wajib bertanggal kirim. Tanpa itu, lama-menunggu
  -- tak terhitung — dan surat yang lama tak dibalas adalah dasar klaim yang
  -- sama sahnya dengan RFI yang lama dijawab (preseden 157/159).
  CONSTRAINT project_letters_kirim_bertanggal CHECK (
    status = 'draft' OR arah = 'masuk' OR tanggal_kirim IS NOT NULL
  ),

  -- Surat MASUK wajib bertanggal terima begitu keluar dari draft: dari situlah
  -- kewajiban menjawab dihitung.
  CONSTRAINT project_letters_masuk_bertanggal CHECK (
    status = 'draft' OR arah = 'keluar' OR tanggal_terima IS NOT NULL
  ),

  -- Terima tak boleh mendahului kirim (preseden `submittal_urutan_waktu`).
  CONSTRAINT project_letters_urutan_waktu CHECK (
    tanggal_terima IS NULL OR tanggal_kirim IS NULL
    OR tanggal_terima >= tanggal_kirim
  ),

  -- Batas balas hanya bermakna bila memang butuh balasan. Batas pada surat yang
  -- tak butuh jawaban menghasilkan peringatan palsu, dan peringatan palsu
  -- melatih orang mengabaikan seluruh peringatan.
  CONSTRAINT project_letters_batas_perlu_balasan CHECK (
    batas_balas IS NULL OR butuh_balasan = true
  ),

  -- Surat tak boleh membalas dirinya sendiri — rantai melingkar membuat
  -- penelusuran berputar selamanya (preseden `submittal_induk_bukan_diri`).
  CONSTRAINT project_letters_balas_bukan_diri CHECK (
    membalas_id IS NULL OR membalas_id <> id
  )
);

COMMENT ON TABLE project_letters IS
  'Surat masuk/keluar proyek. BEDA dari `documents` (repositori berkas): surat '
  'punya pengirim, penerima, dua tanggal (kirim vs terima), dan rantai balasan '
  '— itulah yang membuatnya BUKTI saat sengketa, bukan sekadar arsip.';

COMMENT ON COLUMN project_letters.tanggal_terima IS
  'Untuk surat MASUK: kapan kita menerima — dari sinilah kewajiban menjawab '
  'dihitung. Untuk surat KELUAR: sering tak pernah diketahui, dan NULL itu SAH.';

CREATE INDEX IF NOT EXISTS idx_letters_project ON project_letters (project_id);
CREATE INDEX IF NOT EXISTS idx_letters_status ON project_letters (status);
CREATE INDEX IF NOT EXISTS idx_letters_membalas ON project_letters (membalas_id);

-- ── RLS — kategori C, pola disalin dari contract_claims (184) ───────────────
--
-- ⚠️ RESTRICTIVE SAJA MEMATIKAN TABEL (T1-F3, migrasi 131). PERMISSIVE dipasang
-- bersamanya, dan penjaga di bawah membuktikan keduanya benar-benar ada.

ALTER TABLE project_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON project_letters;
CREATE POLICY tenant_isolation ON project_letters AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = project_letters.project_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = project_letters.project_id
                    AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS project_letters_baca ON project_letters;
CREATE POLICY project_letters_baca ON project_letters
  FOR SELECT USING (true);

DROP POLICY IF EXISTS project_letters_tulis ON project_letters;
CREATE POLICY project_letters_tulis ON project_letters
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
   WHERE schemaname = current_schema() AND tablename = 'project_letters';

  IF v_restrictive = 0 THEN
    RAISE EXCEPTION '185: project_letters tanpa RESTRICTIVE — surat TERBUKA lintas tenant.';
  END IF;
  IF v_permissive = 0 THEN
    RAISE EXCEPTION '185: project_letters punya RESTRICTIVE tanpa PERMISSIVE — '
                    'tabel MATI TOTAL (lihat T1-F3, migrasi 131).';
  END IF;
END $$;
