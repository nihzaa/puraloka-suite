-- ============================================================================
-- 385 — INGATAN ASISTEN: DUA LAPIS, DUA PENANDA
-- ============================================================================
--
-- Fase 2b dari rencana memori. Fase 2a (migrasi kode, commit c04b50af) membuat
-- asisten mengingat percakapan yang SEDANG berjalan. Ini yang membuatnya
-- mengingat lintas percakapan.
--
-- ══════════════════════════════════════════════════════════════════════════
-- BAHAYA YANG DIJAGA — DAN KENAPA IA TAK TERTANGKAP PENJAGA MANA PUN
-- ══════════════════════════════════════════════════════════════════════════
--
-- Ingatan bocor lewat PROMPT, bukan lewat tool. Seluruh gerbang izin di repo
-- ini menjaga jalur tool: `katalogUntuk(izin)`, `jalankanTool` yang memeriksa
-- ACL dua kali, RLS di tiap tabel. Tak satu pun melihat kalimat yang sudah
-- terlanjur disisipkan ke prompt sistem.
--
-- Contoh nyata: asisten mencatat *"proyek Cimahi marginnya tipis"* dari
-- percakapan founder. Mandor bertanya "gimana proyek Cimahi?" — dan asisten
-- yang mengingatnya ikut menyebut margin, padahal mandor tak pernah boleh
-- melihat angka itu di halaman mana pun.
--
-- ══════════════════════════════════════════════════════════════════════════
-- DUA LAPIS (keputusan founder 2026-08-14)
-- ══════════════════════════════════════════════════════════════════════════
--
--   pribadi   milik SATU orang. Kebiasaan, cara ia suka dijawab.
--   bersama   fakta pekerjaan. Milik perusahaan.
--
-- Ditegakkan CHECK, bukan hanya aplikasi: `lapis='pribadi'` WAJIB punya
-- `user_id`, dan `lapis='bersama'` WAJIB tidak punya. Kalau hanya aplikasi
-- yang menjaganya, satu insert yang lupa menyetel `user_id` menghasilkan
-- ingatan pribadi yang terbaca semua orang — tanpa satu pun galat.
--
-- ══════════════════════════════════════════════════════════════════════════
-- DUA PENANDA, BISA DIGABUNG (keputusan founder 2026-08-15)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Founder memilih menggabungkan keduanya sesudah melihat bahwa masing-masing
-- menjawab pertanyaan yang BERBEDA:
--
--   izin_minimum  menjawab RAHASIA    — siapa yang boleh tahu
--   project_id    menjawab RELEVANSI  — untuk pekerjaan yang mana
--
--   ingatan                      izin       proyek   yang melihat
--   ─────────────────────────────────────────────────────────────────────
--   "margin Cimahi tipis"        finance    Cimahi   org keuangan DI Cimahi
--   "klien minta lapor Jumat"    —          Cimahi   semua org Cimahi
--   "rapat mingguan Senin"       —          —        semua orang
--   "gaji tukang naik Juli"      finance    —        org keuangan, lintas proyek
--
-- Keduanya NULL berarti umum se-perusahaan — dan itu bawaan yang benar untuk
-- ingatan yang memang tak sensitif dan tak terikat proyek.
--
-- ── Kenapa `izin_minimum` disimpan sebagai TEKS, bukan FK ke `permissions`
--
-- Permission key adalah kontrak publik (ADR-004) dan sengaja TIDAK di-rename.
-- FK akan membuat penghapusan satu permission menghapus ingatan yang menempel
-- padanya — kehilangan data karena perubahan katalog izin. Sebagai teks,
-- izin yang hilang membuat ingatannya TAK TERBACA SIAPA PUN (fail-closed),
-- bukan lenyap.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA TIDAK ADA KOLOM "SUMBER OTOMATIS"
-- ══════════════════════════════════════════════════════════════════════════
--
-- Founder memilih: asisten MENGUSULKAN, manusia menekan tombol — plus halaman
-- untuk mengisi sendiri. Tak ada jalur di mana asisten mencatat tanpa
-- konfirmasi, jadi tak ada keadaan "ingatan yang belum disetujui" untuk
-- disimpan. Usulan hidup di token berumur pendek (pola `ai_token_tulis`),
-- bukan sebagai baris di sini.
--
-- Itu yang menahan prompt injection: kalimat di dalam dokumen bisa membujuk
-- model mengusulkan apa pun, tetapi tak bisa menekan tombol.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_ingatan (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- NULL untuk lapis `bersama`. Ditegakkan CHECK di bawah.
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,

  lapis       TEXT NOT NULL,

  /*
   * `kunci` — nama pendek yang membuat ingatan bisa DIPERBARUI, bukan
   * ditumpuk.
   *
   * Tanpa kunci, "klien Cimahi minta laporan Jumat" dan "klien Cimahi minta
   * laporan Kamis" jadi dua ingatan yang saling membantah, dan model membaca
   * keduanya. Dengan kunci, yang kedua menimpa yang pertama.
   */
  kunci       TEXT NOT NULL,
  nilai       TEXT NOT NULL,

  -- Penanda RAHASIA. NULL = tak menuntut izin khusus.
  izin_minimum TEXT,

  -- Penanda RELEVANSI. NULL = berlaku lintas proyek.
  project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,

  -- Dari percakapan mana ia lahir. `SET NULL`, bukan CASCADE: retensi
  -- percakapan (30 hari bawaan) TIDAK boleh ikut menghapus ingatannya —
  -- justru itu bedanya ingatan jangka panjang dari riwayat.
  sumber_percakapan_id UUID REFERENCES ai_percakapan(id) ON DELETE SET NULL,

  dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  dibuat_oleh     UUID REFERENCES users(id) ON DELETE SET NULL,

  CONSTRAINT ai_ingatan_lapis_sah CHECK (lapis IN ('pribadi', 'bersama')),

  /*
   * INTI pemisahan dua lapis, dijaga BASIS.
   *
   * `pribadi` wajib berpemilik, `bersama` wajib tidak. Ditulis sebagai
   * kesetaraan boolean supaya kedua arahnya tertutup sekaligus — versi
   * "pribadi ⇒ ada user_id" saja akan membiarkan ingatan bersama yang
   * diam-diam menempel pada satu orang.
   */
  CONSTRAINT ai_ingatan_pribadi_berpemilik
    CHECK ((lapis = 'pribadi') = (user_id IS NOT NULL)),

  -- Nilai kosong bukan ingatan; ia hanya menghabiskan token tiap pertanyaan.
  CONSTRAINT ai_ingatan_isi_wajar
    CHECK (length(trim(kunci)) BETWEEN 1 AND 80 AND length(trim(nilai)) BETWEEN 1 AND 500)
);

/*
 * Satu kunci sekali per pemilik.
 *
 * DUA indeks, bukan satu UNIQUE biasa: `user_id` NULL pada lapis bersama, dan
 * di Postgres NULL tak pernah sama dengan NULL — jadi UNIQUE
 * (company_id, user_id, kunci) TIDAK menahan duplikat pada lapis bersama sama
 * sekali. Itu jenis batasan yang terlihat ada dan tak pernah bekerja.
 */
CREATE UNIQUE INDEX IF NOT EXISTS ai_ingatan_unik_pribadi
  ON ai_ingatan (company_id, user_id, kunci) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_ingatan_unik_bersama
  ON ai_ingatan (company_id, kunci) WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_ingatan_baca
  ON ai_ingatan (company_id, lapis, project_id);

-- ------------------------------------------------------------
-- RLS — pola yang sama dengan migrasi 252.
--
-- Isolasi tenant di lapisan basis. Penyaringan izin & proyek TIDAK dikerjakan
-- di sini melainkan di aplikasi: RLS tak tahu permission apa yang dipegang
-- penanya (ia hanya tahu company & role), sementara `izin_minimum` menuntut
-- irisan dengan permission efektif yang sudah diresolusi request.
-- ------------------------------------------------------------
ALTER TABLE ai_ingatan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON ai_ingatan;
CREATE POLICY tenant_isolation ON ai_ingatan AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS ai_ingatan_kelola ON ai_ingatan;
CREATE POLICY ai_ingatan_kelola ON ai_ingatan FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- Sentuh `diperbarui_pada` — fungsi yang sama dengan `ai_percakapan`.
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_ai_ingatan_sentuh ON ai_ingatan;
CREATE TRIGGER trg_ai_ingatan_sentuh BEFORE UPDATE ON ai_ingatan
  FOR EACH ROW EXECUTE FUNCTION fn_ai_sentuh();

-- ------------------------------------------------------------
-- Permission
--
-- `ai:ingatan:kelola` DIPISAH dari `ai:chat`: memberi seseorang akses asisten
-- tak boleh diam-diam memberinya kuasa mengubah apa yang diingat SELURUH
-- perusahaan. Alasan yang sama memisahkan `ai:tulis` dari `ai:chat` (269).
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description)
VALUES
  ('ai:ingatan:lihat',  'ai', 'Lihat ingatan asisten',
   'Melihat catatan yang diingat asisten — miliknya sendiri dan milik bersama yang boleh ia lihat'),
  ('ai:ingatan:kelola', 'ai', 'Kelola ingatan asisten',
   'Menyetujui usulan catatan asisten, menyunting, dan menghapus ingatan bersama')
ON CONFLICT (key) DO NOTHING;

-- WAJIB ikut: migrasi 271 ada semata-mata untuk memperbaiki izin yang dibuat
-- tanpa pernah diberikan kepada siapa pun. Izin yatim = fitur mati senyap.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key IN ('ai:ingatan:lihat', 'ai:ingatan:kelola')
   AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi — artefak fisik, bukan catatan di buku migrasi.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.ai_ingatan') IS NULL THEN
    RAISE EXCEPTION '385 gagal: tabel ai_ingatan tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_ingatan_pribadi_berpemilik'
  ) THEN
    RAISE EXCEPTION '385 gagal: CHECK pemisah dua lapis tidak terpasang';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'ai_ingatan' AND indexname = 'ai_ingatan_unik_bersama'
  ) THEN
    RAISE EXCEPTION '385 gagal: indeks unik lapis bersama tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'ai_ingatan' AND n.nspname = 'public' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION '385 gagal: RLS ai_ingatan tidak aktif';
  END IF;

  -- Izin yang dibuat tetapi tak dipegang siapa pun adalah fitur yang mati
  -- tanpa mengumumkan kematiannya (pelajaran migrasi 271).
  IF NOT EXISTS (
    SELECT 1 FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
     WHERE p.key = 'ai:ingatan:kelola'
  ) THEN
    RAISE EXCEPTION '385 gagal: ai:ingatan:kelola tidak dipegang role mana pun';
  END IF;
END $$;
