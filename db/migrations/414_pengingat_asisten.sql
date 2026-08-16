-- ============================================================================
-- 414 — PENGINGAT ASISTEN: "ingatkan saya tagih Pak Andi hari Jumat"
-- ============================================================================
--
-- ── Kenapa tabel baru, bukan menumpang `notifications`
--
-- `notifications` mencatat peristiwa yang SUDAH terjadi ("kasbon diajukan").
-- Pengingat adalah kebalikannya: janji tentang MASA DEPAN yang belum punya
-- peristiwa. Menumpangkannya di sana berarti tiap pembaca notifikasi harus
-- ingat menyaring baris yang "belum waktunya" — dan yang lupa akan
-- menampilkan pengingat besok sebagai kabar hari ini.
--
-- Diukur sebelum memutuskan: `notifications` sudah memuat 8.054 baris dengan
-- 8.049 belum dibaca. Menambah jenis baru ke tumpukan yang sudah tak terbaca
-- adalah cara paling pasti membuat pengingatnya ikut hilang.
--
-- ── Yang TIDAK dibuat di sini
--
-- Nol kolom "berulang" (harian/mingguan). Pengingat berulang menuntut aturan
-- kalender, zona waktu, dan penanganan hari libur — dan tiga hal itu sudah
-- punya rumahnya sendiri di `jadwal_tugas` + `hari_libur`. Pengingat sekali
-- pakai menjawab permintaan founder apa adanya; yang berulang adalah otomasi,
-- dan otomasi punya jalurnya sendiri.
--
-- ── Kenapa `dikirim_pada`, bukan boolean `sudah_dikirim`
--
-- Boolean hanya menjawab "sudah?", timestamp menjawab "kapan?". Saat seseorang
-- bertanya "kok saya tidak diingatkan", yang dibutuhkan jam pengirimannya —
-- dan boolean tak bisa memulihkan informasi yang tak pernah disimpan.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pengingat_asisten (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Pengingat milik ORANG, bukan milik perusahaan. Meneruskannya tak
  -- memindahkan janji — pola yang sama dengan `ai_token_tulis`.
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  /** Kalimat yang akan dibacakan kembali, apa adanya dari pengguna. */
  isi           TEXT NOT NULL CHECK (length(trim(isi)) >= 3),

  /** Kapan diingatkan. Boleh masa lalu — tugas berkalanya yang menyapu. */
  jatuh_pada    TIMESTAMPTZ NOT NULL,

  /** Proyek terkait, kalau pengingatnya menempel pada sesuatu. */
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Kapan benar-benar terkirim. NULL = belum. Lihat kepala berkas.
  dikirim_pada  TIMESTAMPTZ,

  -- Dibatalkan pengguna sebelum sempat terkirim.
  dibatalkan_pada TIMESTAMPTZ,

  /** Dari percakapan mana janji ini lahir — jejak niat ke pengingat. */
  sumber_percakapan_id UUID,

  dibuat_pada   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Yang dicari tugas berkala: milik siapa pun, jatuh tempo, belum terkirim,
-- belum dibatalkan. Indeks parsial supaya ia tak ikut membesar oleh pengingat
-- lama yang sudah selesai.
CREATE INDEX IF NOT EXISTS idx_pengingat_jatuh_tempo
  ON pengingat_asisten (jatuh_pada)
  WHERE dikirim_pada IS NULL AND dibatalkan_pada IS NULL;

CREATE INDEX IF NOT EXISTS idx_pengingat_pemilik
  ON pengingat_asisten (user_id, jatuh_pada DESC);

COMMENT ON TABLE pengingat_asisten IS
  'Janji sekali-pakai yang dititipkan pengguna ke asisten. Bukan notifikasi '
  '(peristiwa lampau) dan bukan jadwal_tugas (otomasi berulang).';

-- ── RLS: mengikuti pola tabel tenant lain ───────────────────────────────────
ALTER TABLE pengingat_asisten ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pengingat_dasar ON pengingat_asisten;
CREATE POLICY pengingat_dasar ON pengingat_asisten FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation ON pengingat_asisten;
CREATE POLICY tenant_isolation ON pengingat_asisten
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- ── Verifikasi — migrasi gagal KERAS kalau objeknya tak benar-benar ada ─────
--
-- Pelajaran migrasi 043: ia tercatat sukses tanpa pernah membuat tabelnya.
DO $$
DECLARE
  contoh_company UUID;
  contoh_user    UUID;
  id_uji         UUID;
BEGIN
  IF to_regclass('public.pengingat_asisten') IS NULL THEN
    RAISE EXCEPTION '414 gagal: pengingat_asisten tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'pengingat_asisten' AND policyname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION '414 gagal: policy tenant_isolation tidak terpasang';
  END IF;

  -- CHECK isi minimal benar-benar menahan — bukan sekadar tertulis.
  SELECT c.id, u.id INTO contoh_company, contoh_user
    FROM companies c
    JOIN company_members m ON m.company_id = c.id
    JOIN users u ON u.id = m.user_id
   LIMIT 1;

  IF contoh_company IS NOT NULL THEN
    BEGIN
      INSERT INTO pengingat_asisten (company_id, user_id, isi, jatuh_pada)
      VALUES (contoh_company, contoh_user, '  ', now())
      RETURNING id INTO id_uji;

      RAISE EXCEPTION '414 gagal: isi kosong LOLOS CHECK — pengingat tanpa kalimat tak berguna';
    EXCEPTION
      WHEN check_violation THEN NULL;  -- yang diharapkan
    END;

    -- Dan yang sah memang masuk.
    INSERT INTO pengingat_asisten (company_id, user_id, isi, jatuh_pada)
    VALUES (contoh_company, contoh_user, '[uji-414] pengingat percobaan', now())
    RETURNING id INTO id_uji;

    DELETE FROM pengingat_asisten WHERE id = id_uji;
  END IF;
END $$;
