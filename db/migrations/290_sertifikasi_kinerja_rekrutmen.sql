-- ════════════════════════════════════════════════════════════════════════════
-- 290 — SERTIFIKASI · PENILAIAN KINERJA · REKRUTMEN (G2e)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa ketiganya di satu migrasi, dengan KEDALAMAN BERBEDA
--
-- Ketiganya item terakhir G2, tetapi pemicunya tak setara — dan membangun
-- ketiganya sedalam yang sama berarti menghabiskan waktu pada dua yang belum
-- dibutuhkan siapa pun.
--
-- Diukur 2026-08-11:
--
--   SERTIFIKASI   punya pemicu NYATA. `prakualifikasi_vendor` 5 baris,
--                 `dokumen_prakualifikasi` 11 baris — dan dokumen itu punya
--                 `berlaku_sampai`. SKA/SKT tenaga ahli adalah hal yang SAMA
--                 untuk ORANG, dan tender pemerintah menuntutnya. Yang hilang:
--                 nol tabel untuk sertifikat per-pegawai.
--
--   KINERJA       belum punya pemicu, tetapi bentuknya sudah pasti: siklus
--                 periodik dengan penilai dan hasil. Dibangun cukup untuk
--                 mencatat, bukan untuk menghitung skor gabungan — formula
--                 pembobotan adalah kebijakan yang belum diputuskan founder.
--
--   REKRUTMEN     belum punya pemicu DAN bentuknya bergantung cara kerja yang
--                 belum ada (kanal lamaran, tahap seleksi). Dibangun sebagai
--                 pencatat lamaran + tahapnya, bukan ATS penuh. Menebak alur
--                 seleksi perusahaan yang belum pernah merekrut lewat sistem
--                 berarti membangun yang pasti dibongkar.
--
-- Ini bukan under-engineering: yang dibangun LENGKAP untuk pertanyaan yang
-- benar-benar ada. Yang tidak dibangun dinyatakan, bukan disembunyikan.
--
-- ── Yang membuat sertifikasi berbeda dari dokumen biasa
--
-- Sertifikat KEDALUWARSA, dan yang kedaluwarsa TIDAK BOLEH terhitung sebagai
-- bukti kompetensi. Itu bukan kerapian administratif: tender yang mensyaratkan
-- SKA Ahli Madya dan dipenuhi dengan sertifikat yang habis masa berlakunya
-- adalah dokumen palsu di mata panitia.
--
-- Karena itu `berlaku_sampai` NOT NULL untuk yang jenisnya memang berjangka,
-- dan pustaka menghitung "masih berlaku" terhadap TANGGAL ACUAN — bukan
-- terhadap hari ini saja. Prakualifikasi yang diajukan bulan lalu diperiksa
-- dengan keadaan bulan lalu.
--
-- ── Yang dijaga constraint, dan kenapa
--
-- 1. Sertifikat berjangka wajib punya tanggal kedaluwarsa. Sertifikat tanpa
--    masa berlaku yang sebenarnya berjangka akan terhitung berlaku selamanya.
-- 2. Kedaluwarsa tak boleh mendahului terbit.
-- 3. Penilaian kinerja yang FINAL wajib punya penilai & tanggalnya.
-- 4. Skor dalam rentang yang ditetapkan periodenya — skor 200 dari skala 100
--    adalah salah ketik yang lolos ke rekap.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Enum
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_penilaian') THEN
    CREATE TYPE status_penilaian AS ENUM ('draf', 'final');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tahap_lamaran') THEN
    CREATE TYPE tahap_lamaran AS ENUM (
      'masuk', 'seleksi_berkas', 'wawancara', 'tawaran', 'diterima', 'ditolak');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Sertifikat & kompetensi pegawai
--
-- Pemicunya NYATA: syarat prakualifikasi tender. Lihat kepala berkas.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sertifikat_pegawai (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id        UUID NOT NULL REFERENCES pegawai(id) ON DELETE CASCADE,

  -- Jenis: 'SKA', 'SKT', 'K3 Umum', 'Ahli Muda', dst. TEKS, bukan enum:
  -- daftar sertifikasi konstruksi Indonesia berubah bersama peraturan LPJK,
  -- dan enum memaksa migrasi tiap kali ada jenis baru.
  jenis             TEXT NOT NULL,
  nama              TEXT NOT NULL,
  nomor             TEXT,
  penerbit          TEXT,

  -- Klasifikasi & kualifikasi — inilah yang dicocokkan dengan syarat tender
  -- ("SKA Ahli Madya Teknik Bangunan Gedung").
  klasifikasi       TEXT,
  kualifikasi       TEXT,

  tanggal_terbit    DATE,
  -- NULLABLE: sebagian sertifikat memang seumur hidup (ijazah, sertifikat
  -- pelatihan tanpa masa berlaku). Yang berjangka dijaga constraint di bawah.
  berlaku_sampai    DATE,
  /**
   * `TRUE` = sertifikat ini memang BERJANGKA dan wajib punya
   * `berlaku_sampai`. Dipisahkan dari sekadar "berlaku_sampai IS NULL"
   * karena NULL punya dua arti yang berbeda akibatnya:
   *
   *   seumur hidup      → selalu sah
   *   berjangka, lupa diisi → TIDAK sah, dan justru inilah yang berbahaya
   *
   * Tanpa penanda ini, sertifikat SKA yang tanggal kedaluwarsanya lupa diisi
   * terbaca "berlaku selamanya" — dan dipakai memenuhi syarat tender.
   */
  berjangka         BOOLEAN NOT NULL DEFAULT TRUE,

  path_berkas       TEXT,
  catatan           TEXT,

  dicatat_oleh      UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Sertifikat BERJANGKA wajib punya tanggal kedaluwarsa. Lihat komentar
  -- `berjangka` di atas — ini yang mencegah "berlaku selamanya" palsu.
  CONSTRAINT sertifikat_berjangka_bertanggal CHECK (
    NOT berjangka OR berlaku_sampai IS NOT NULL
  ),

  -- Kedaluwarsa mendahului terbit membuat masa berlaku negatif, dan sertifikat
  -- itu tak pernah sah pada tanggal mana pun — tetapi terbaca sebagai baris
  -- yang ada.
  CONSTRAINT sertifikat_masa_berlaku_masuk_akal CHECK (
    berlaku_sampai IS NULL OR tanggal_terbit IS NULL
    OR berlaku_sampai >= tanggal_terbit
  )
);

CREATE INDEX IF NOT EXISTS idx_sertifikat_pegawai
  ON sertifikat_pegawai (pegawai_id, berlaku_sampai);
-- Yang akan kedaluwarsa — pertanyaan yang paling sering diajukan sebelum
-- mengikuti tender.
CREATE INDEX IF NOT EXISTS idx_sertifikat_kedaluwarsa
  ON sertifikat_pegawai (berlaku_sampai) WHERE berlaku_sampai IS NOT NULL;

-- ------------------------------------------------------------
-- 3. Penilaian kinerja
--
-- Dibangun untuk MENCATAT, bukan menghitung skor gabungan — formula
-- pembobotan adalah kebijakan yang belum diputuskan founder. Lihat kepala
-- berkas.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS penilaian_kinerja (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pegawai_id        UUID NOT NULL REFERENCES pegawai(id) ON DELETE CASCADE,

  -- Periode yang dinilai. TEKS bebas ('2026-S1', '2026-Q3') karena siklus
  -- penilaian berbeda tiap perusahaan — memaksa bentuk tertentu membuat yang
  -- siklusnya lain menuliskannya di catatan.
  periode           TEXT NOT NULL,
  tanggal_mulai     DATE,
  tanggal_selesai   DATE,

  -- Skala yang DIPAKAI, disimpan bersama skornya. Skala berubah antar-periode
  -- (1–5 lalu 1–100), dan skor 4 tanpa skalanya bisa berarti bagus atau buruk.
  skala_maks        NUMERIC(6,2) NOT NULL DEFAULT 5,
  skor              NUMERIC(6,2),

  kekuatan          TEXT,
  perbaikan         TEXT,
  rencana_tindak    TEXT,

  status            status_penilaian NOT NULL DEFAULT 'draf',
  penilai           UUID REFERENCES users(id),
  dinilai_pada      TIMESTAMPTZ,
  -- Tanggapan pegawai atas penilaiannya. Penilaian tanpa hak jawab adalah
  -- vonis, dan yang dinilai tak punya cara membantah yang salah.
  tanggapan_pegawai TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT penilaian_pegawai_periode_unik UNIQUE (pegawai_id, periode),

  -- Skor di luar skala adalah salah ketik yang lolos ke rekap dan mengubah
  -- rata-rata seluruh tim.
  CONSTRAINT penilaian_skor_dalam_skala CHECK (
    skor IS NULL OR (skor >= 0 AND skor <= skala_maks)
  ),
  CONSTRAINT penilaian_skala_positif CHECK (skala_maks > 0),

  -- Yang FINAL wajib berjejak penilai & waktunya (pola 157, 279, 280, 283,
  -- 286, 287, 288).
  CONSTRAINT penilaian_final_berjejak CHECK (
    status <> 'final' OR (penilai IS NOT NULL AND dinilai_pada IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_penilaian_pegawai
  ON penilaian_kinerja (pegawai_id, periode DESC);

-- ------------------------------------------------------------
-- 4. Lamaran kerja
--
-- Pencatat lamaran + tahapnya, BUKAN ATS penuh. Menebak alur seleksi
-- perusahaan yang belum pernah merekrut lewat sistem berarti membangun yang
-- pasti dibongkar. Lihat kepala berkas.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lamaran_kerja (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  nama              TEXT NOT NULL,
  email             TEXT,
  telepon           TEXT,

  posisi            TEXT NOT NULL,
  sumber            TEXT,

  tahap             tahap_lamaran NOT NULL DEFAULT 'masuk',
  -- Alasan berhenti di tahap ini. WAJIB saat ditolak (dijaga aplikasi &
  -- constraint) — pelamar yang ditolak tanpa catatan akan dihubungi lagi
  -- untuk lowongan yang sama, dan penolakan yang sama terulang.
  catatan_tahap     TEXT,

  path_cv           TEXT,
  catatan           TEXT,

  -- Kalau diterima, ia jadi pegawai. Sambungan ini yang membuat rekrutmen
  -- bukan daftar terpisah: pertanyaan "dari mana orang ini masuk" terjawab.
  pegawai_id        UUID REFERENCES pegawai(id) ON DELETE SET NULL,

  dicatat_oleh      UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Penolakan wajib beralasan.
  CONSTRAINT lamaran_ditolak_beralasan CHECK (
    tahap <> 'ditolak'
    OR (catatan_tahap IS NOT NULL AND btrim(catatan_tahap) <> '')
  ),

  -- Yang DITERIMA wajib tersambung ke pegawainya. Lamaran "diterima" tanpa
  -- pegawai adalah pernyataan yang tak bisa ditelusuri: siapa yang masuk?
  CONSTRAINT lamaran_diterima_berpegawai CHECK (
    tahap <> 'diterima' OR pegawai_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_lamaran_company
  ON lamaran_kerja (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lamaran_tahap
  ON lamaran_kerja (company_id, tahap)
  WHERE tahap NOT IN ('diterima', 'ditolak');

-- ------------------------------------------------------------
-- 5. RLS
-- ------------------------------------------------------------
ALTER TABLE sertifikat_pegawai ENABLE ROW LEVEL SECURITY;
ALTER TABLE penilaian_kinerja  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lamaran_kerja      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON sertifikat_pegawai;
CREATE POLICY tenant_isolation ON sertifikat_pegawai AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM pegawai p
                  WHERE p.id = sertifikat_pegawai.pegawai_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM pegawai p
                       WHERE p.id = sertifikat_pegawai.pegawai_id
                         AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON penilaian_kinerja;
CREATE POLICY tenant_isolation ON penilaian_kinerja AS RESTRICTIVE FOR ALL
  USING (EXISTS (SELECT 1 FROM pegawai p
                  WHERE p.id = penilaian_kinerja.pegawai_id
                    AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (SELECT 1 FROM pegawai p
                       WHERE p.id = penilaian_kinerja.pegawai_id
                         AND p.company_id = (SELECT auth_company_id())));

DROP POLICY IF EXISTS tenant_isolation ON lamaran_kerja;
CREATE POLICY tenant_isolation ON lamaran_kerja AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- ------------------------------------------------------------
-- 6. Capability
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description) VALUES
  ('sdm:sertifikat:view',   'sdm', 'Lihat sertifikat',
   'Melihat sertifikat & kompetensi pegawai'),
  ('sdm:sertifikat:manage', 'sdm', 'Kelola sertifikat',
   'Mencatat dan memperbarui sertifikat pegawai'),
  ('sdm:kinerja:view',      'sdm', 'Lihat penilaian kinerja',
   'Melihat hasil penilaian kinerja'),
  ('sdm:kinerja:manage',    'sdm', 'Nilai kinerja',
   'Membuat dan memfinalkan penilaian kinerja'),
  ('sdm:rekrutmen:view',    'sdm', 'Lihat lamaran',
   'Melihat lamaran kerja yang masuk'),
  ('sdm:rekrutmen:manage',  'sdm', 'Kelola rekrutmen',
   'Mencatat lamaran dan memindahkan tahapnya')
ON CONFLICT (key) DO NOTHING;

-- Sertifikat dilihat luas: PM perlu tahu siapa yang bersertifikat saat
-- menyusun tim tender.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('sdm:sertifikat:view', 'sdm:rekrutmen:view')
   AND r.name IN ('admin', 'direktur', 'pm')
ON CONFLICT DO NOTHING;

-- Penilaian kinerja memuat penilaian TENTANG ORANG. Kewenangannya sempit.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('sdm:sertifikat:manage', 'sdm:kinerja:view',
                 'sdm:kinerja:manage', 'sdm:rekrutmen:manage')
   AND r.name IN ('admin', 'direktur')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 7. Menu — di migrasi yang SAMA dengan tabelnya (pelajaran 281)
--
-- SATU halaman untuk ketiganya (`/sdm/kompetensi`), bukan tiga: aturan 232
-- "satu route = satu link" berlaku, dan ketiganya adalah tab atas data yang
-- sama — orang yang sama (ARAH-VISUAL §6a).
-- ------------------------------------------------------------
UPDATE menu_items
   SET href = '/sdm/kompetensi', is_active = TRUE,
       required_permissions = ARRAY['sdm:sertifikat:view']::text[]
 WHERE key = 'hr-sertifikasi';

-- Kinerja & rekrutmen: tab di halaman yang sama. Menu terpisah akan membuat
-- dua item menyala bersamaan (aturan 232).
UPDATE menu_items SET is_active = FALSE WHERE key IN ('hr-kinerja', 'hr-rekrutmen');

-- ------------------------------------------------------------
-- 8. Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  FOR n IN
    SELECT 1 FROM unnest(ARRAY['sertifikat_pegawai', 'penilaian_kinerja',
                               'lamaran_kerja']) t
     WHERE to_regclass('public.' || t) IS NULL
  LOOP
    RAISE EXCEPTION '290 gagal: ada tabel G2e yang tak terbentuk';
  END LOOP;

  FOR n IN
    SELECT 1 FROM unnest(ARRAY['sertifikat_berjangka_bertanggal',
                               'sertifikat_masa_berlaku_masuk_akal',
                               'penilaian_skor_dalam_skala',
                               'penilaian_final_berjejak',
                               'lamaran_ditolak_beralasan',
                               'lamaran_diterima_berpegawai']) k
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = k)
  LOOP
    RAISE EXCEPTION '290 gagal: ada constraint G2e yang tak terpasang';
  END LOOP;

  FOR n IN
    SELECT 1 FROM unnest(ARRAY['sertifikat_pegawai', 'penilaian_kinerja',
                               'lamaran_kerja']) t
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation')
  LOOP
    RAISE EXCEPTION '290 gagal: ada tabel G2e tanpa RLS tenant_isolation';
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'sdm:kinerja:manage') THEN
    RAISE EXCEPTION '290 gagal: capability sdm:kinerja:manage tak ter-seed';
  END IF;

  -- Menu wajib menunjuk halaman nyata DAN aktif, tepat satu per route.
  IF EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'hr-sertifikasi' AND (href LIKE '/m/%' OR is_active IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION '290 gagal: menu hr-sertifikasi belum menunjuk halaman nyata';
  END IF;
  SELECT count(*) INTO n FROM menu_items WHERE is_active AND href = '/sdm/kompetensi';
  IF n <> 1 THEN
    RAISE EXCEPTION '290 gagal: % menu aktif menunjuk /sdm/kompetensi (harus 1)', n;
  END IF;

  -- Waktu WAJIB timestamptz (CLAUDE.md §5.4).
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name IN ('sertifikat_pegawai', 'penilaian_kinerja', 'lamaran_kerja')
       AND data_type = 'timestamp without time zone'
  ) THEN
    RAISE EXCEPTION '290 gagal: ada kolom timestamp tanpa zona waktu';
  END IF;

  RAISE NOTICE '290 OK — sertifikat_pegawai + penilaian_kinerja + lamaran_kerja';
END $$;
