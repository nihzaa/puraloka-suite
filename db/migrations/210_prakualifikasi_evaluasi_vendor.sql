-- 210 — PRAKUALIFIKASI & EVALUASI KINERJA VENDOR (TUNDA kelompok A, 3 item)
--
-- ════════════════════════════════════════════════════════════════════════════
-- KENAPA SEKARANG, PADAHAL PEMICUNYA BELUM MENYALA
-- ════════════════════════════════════════════════════════════════════════════
--
-- Triase F5-1 §5 menunda ketiga item ini sampai "vendor > 30". Diukur
-- 2026-08-07: baru 5 supplier. Founder memutuskan membangunnya sekarang
-- dengan data dummy, karena basis ini belum operasional sama sekali.
--
-- Yang berubah karena keputusan itu: bentuknya diturunkan dari PRAKTIK
-- pengadaan konstruksi, bukan dari kasus nyata di basis. Konsekuensinya
-- dicatat terang-terangan — begitu vendor nyata masuk, bentuk ini WAJIB
-- ditinjau ulang terhadap kebutuhan sebenarnya.
--
-- ── Tiga item, satu tabel induk
--
--   1. Prakualifikasi vendor    → `prakualifikasi_vendor` (penilaian awal)
--   2. Dokumen prakualifikasi   → `dokumen_prakualifikasi` (SIUP, NIB, dst)
--   3. Evaluasi kinerja vendor  → `evaluasi_vendor` (penilaian berkala)
--
-- Prakualifikasi dan evaluasi SENGAJA dipisah, meski keduanya "menilai
-- vendor". Yang pertama menjawab *"boleh ikut tender?"* sekali di depan;
-- yang kedua *"masih layak dipakai lagi?"* berulang sesudah tiap pekerjaan.
-- Menyatukannya berarti satu skor yang menjawab dua pertanyaan berbeda — dan
-- vendor yang lulus prakualifikasi lalu mengecewakan akan terlihat sama
-- dengan vendor yang belum pernah dinilai.
--
-- ── Skor: 0–100 dengan bobot, bukan bintang
--
-- Bintang 1–5 terlihat ramah tapi tak bisa dipertanggungjawabkan saat vendor
-- bertanya kenapa ia kalah. Empat dimensi berbobot bisa: "mutu 30, waktu 30,
-- harga 25, layanan 15" adalah angka yang bisa ditunjukkan.

BEGIN;

-- ── 1. Prakualifikasi ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prakualifikasi_vendor (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  tanggal         DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Berlaku sampai kapan. Prakualifikasi yang tak pernah kedaluwarsa
  -- membuat vendor yang izinnya sudah mati tetap terlihat lolos.
  berlaku_sampai  DATE,

  -- Empat dimensi, masing-masing 0–100. Bobotnya di kolom terpisah supaya
  -- bisa berbeda per-tenant tanpa mengubah skema.
  skor_legalitas  NUMERIC(5,2) NOT NULL DEFAULT 0,
  skor_keuangan   NUMERIC(5,2) NOT NULL DEFAULT 0,
  skor_teknis     NUMERIC(5,2) NOT NULL DEFAULT 0,
  skor_pengalaman NUMERIC(5,2) NOT NULL DEFAULT 0,

  status          TEXT NOT NULL DEFAULT 'draft',
  catatan         TEXT,
  -- Alasan WAJIB saat ditolak — vendor yang ditolak tanpa sebab akan
  -- bertanya, dan "tak ada catatannya" bukan jawaban.
  alasan_tolak    TEXT,

  dinilai_oleh    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT prakualifikasi_status_check CHECK (
    status = ANY (ARRAY['draft','lolos','ditolak','kedaluwarsa'])
  ),
  CONSTRAINT prakualifikasi_skor_wajar CHECK (
    skor_legalitas  BETWEEN 0 AND 100 AND
    skor_keuangan   BETWEEN 0 AND 100 AND
    skor_teknis     BETWEEN 0 AND 100 AND
    skor_pengalaman BETWEEN 0 AND 100
  ),
  -- Ditolak WAJIB beralasan. Tanpa ini, kolom alasan jadi hiasan yang
  -- selalu kosong justru pada kasus yang paling perlu dijelaskan.
  CONSTRAINT prakualifikasi_tolak_beralasan CHECK (
    status <> 'ditolak' OR (alasan_tolak IS NOT NULL AND length(btrim(alasan_tolak)) >= 5)
  ),
  CONSTRAINT prakualifikasi_masa_berlaku CHECK (
    berlaku_sampai IS NULL OR berlaku_sampai >= tanggal
  ),
  -- Satu prakualifikasi HIDUP per vendor. Dua yang aktif berarti dua
  -- jawaban berbeda untuk "boleh ikut tender?".
  CONSTRAINT prakualifikasi_unik UNIQUE (supplier_id, tanggal)
);

CREATE INDEX IF NOT EXISTS idx_prakualifikasi_supplier ON prakualifikasi_vendor(supplier_id);
CREATE INDEX IF NOT EXISTS idx_prakualifikasi_status   ON prakualifikasi_vendor(status);

-- ── 2. Dokumen prakualifikasi ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dokumen_prakualifikasi (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prakualifikasi_id UUID NOT NULL REFERENCES prakualifikasi_vendor(id) ON DELETE CASCADE,
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  jenis            TEXT NOT NULL,
  nomor            TEXT,
  -- Kadaluarsa dokumen adalah alasan utama prakualifikasi perlu ditinjau.
  -- NIB tak kedaluwarsa; SIUJK dan SBU kedaluwarsa.
  berlaku_sampai   DATE,
  path_berkas      TEXT,
  terverifikasi    BOOLEAN NOT NULL DEFAULT false,
  catatan          TEXT,

  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT dokumen_prakual_jenis_check CHECK (
    jenis = ANY (ARRAY['nib','siujk','sbu','npwp','akta','domisili','iso','k3','lainnya'])
  ),
  CONSTRAINT dokumen_prakual_unik UNIQUE (prakualifikasi_id, jenis, nomor)
);

CREATE INDEX IF NOT EXISTS idx_dokumen_prakual_induk ON dokumen_prakualifikasi(prakualifikasi_id);

-- ── 3. Evaluasi kinerja vendor ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS evaluasi_vendor (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Dinilai ATAS pekerjaan apa. Evaluasi tanpa konteks pesanan tak bisa
  -- ditelusuri kembali saat vendor mempersoalkan nilainya.
  po_id         UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,

  periode       DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Empat dimensi berbobot. Totalnya DIHITUNG, tidak disimpan — kolom skor
  -- total yang basi adalah cara paling sunyi memilih vendor yang salah.
  skor_mutu     NUMERIC(5,2) NOT NULL DEFAULT 0,
  skor_waktu    NUMERIC(5,2) NOT NULL DEFAULT 0,
  skor_harga    NUMERIC(5,2) NOT NULL DEFAULT 0,
  skor_layanan  NUMERIC(5,2) NOT NULL DEFAULT 0,

  -- Kejadian yang menurunkan nilai — angka saja tak menjelaskan apa pun
  -- enam bulan kemudian.
  catatan       TEXT,
  -- `true` = vendor ini jangan dipakai lagi. Ditandai TERPISAH dari skor
  -- rendah: skor 40 karena sekali telat berbeda dari vendor yang mengirim
  -- barang palsu.
  masuk_daftar_hitam BOOLEAN NOT NULL DEFAULT false,
  alasan_daftar_hitam TEXT,

  dinilai_oleh  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT evaluasi_vendor_skor_wajar CHECK (
    skor_mutu    BETWEEN 0 AND 100 AND
    skor_waktu   BETWEEN 0 AND 100 AND
    skor_harga   BETWEEN 0 AND 100 AND
    skor_layanan BETWEEN 0 AND 100
  ),
  -- Daftar hitam WAJIB beralasan. Ini keputusan yang menutup pintu rezeki
  -- orang; "tak ada catatannya" tak bisa dipertanggungjawabkan.
  CONSTRAINT evaluasi_daftar_hitam_beralasan CHECK (
    NOT masuk_daftar_hitam OR
    (alasan_daftar_hitam IS NOT NULL AND length(btrim(alasan_daftar_hitam)) >= 10)
  ),
  CONSTRAINT evaluasi_vendor_unik UNIQUE (supplier_id, periode, po_id)
);

CREATE INDEX IF NOT EXISTS idx_evaluasi_vendor_supplier ON evaluasi_vendor(supplier_id);
CREATE INDEX IF NOT EXISTS idx_evaluasi_vendor_periode  ON evaluasi_vendor(periode);

-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- Permission, BUKAN literal peran (ADR-004 Rule #2 — pelajaran migrasi 202).
-- Key disalin dari `requirePermission` di rute procurement yang sudah ada.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prakualifikasi_vendor','dokumen_prakualifikasi','evaluasi_vendor']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE
         USING (company_id = (SELECT auth_company_id()))', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_baca', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT
         USING ((SELECT has_permission(''procurement:view'')))', t || '_baca', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_kelola', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL
         USING ((SELECT has_permission(''procurement:po:manage'')))
         WITH CHECK ((SELECT has_permission(''procurement:po:manage'')))',
      t || '_kelola', t);
  END LOOP;
END $$;

-- ── Verifikasi — gagal KERAS bila artefaknya tak terbentuk ────────────────
DO $$
DECLARE n_tabel int; n_policy int;
BEGIN
  SELECT count(*) INTO n_tabel FROM information_schema.tables
   WHERE table_schema='public'
     AND table_name IN ('prakualifikasi_vendor','dokumen_prakualifikasi','evaluasi_vendor');
  IF n_tabel <> 3 THEN
    RAISE EXCEPTION 'Hanya % dari 3 tabel terbentuk', n_tabel;
  END IF;

  SELECT count(*) INTO n_policy FROM pg_policy
   WHERE polrelid IN ('prakualifikasi_vendor'::regclass,
                      'dokumen_prakualifikasi'::regclass,
                      'evaluasi_vendor'::regclass);
  IF n_policy < 9 THEN
    RAISE EXCEPTION 'Policy kurang: % dari 9 (3 tabel x tenant/baca/kelola)', n_policy;
  END IF;

  RAISE NOTICE 'OK: 3 tabel vendor + % policy.', n_policy;
END $$;

COMMIT;
