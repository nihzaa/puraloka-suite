-- ============================================================================
-- 266 — REGISTRY PENYEDIA UNIVERSAL: AI, WhatsApp, dan apa pun sesudahnya
-- ============================================================================
--
-- ── Permintaan founder (2026-08-10)
--
-- "penyedia api wa nya bisa punya beberapa penyedia dan bisa dipilih, dan semua
--  penyedia api baik ai, wa dan apapun itu api nya bisa diinput di ui jadi
--  ngga hardcode"
--
-- ── Ini MELAMPAUI TJS, bukan menyamainya — dan bedanya nyata
--
-- `automation-tjs/.../lib/ai/registry.ts` diukur 2026-08-10. Kepalanya sendiri
-- menulis cara menambah penyedia:
--
--     1. buat lib/ai/providers/<nama>.ts
--     2. isi capabilities SESUAI KENYATAAN
--     3. tambahkan satu baris di PENYEDIA di bawah
--
-- Artinya penyedia TJS adalah KODE: menambahnya butuh deploy. Yang bisa diisi
-- dari UI hanya nilainya (alamat, kunci), bukan penyedianya.
--
-- Di sini penyedianya DATA. Baris di tabel ini, diisi dari UI, tanpa deploy.
-- Adaptornya tetap kode (bentuk muatan HTTP memang tak bisa dikarang), tetapi
-- penyedia baru yang memakai bentuk yang sudah dikenal cukup satu baris.
--
-- ── Kenapa SATU tabel untuk AI dan WA, bukan dua
--
-- Godaan pertama: `ai_provider_config` sudah ada, tinggal buat
-- `wa_provider_config` yang mirip. Ditolak, karena keduanya akan menyimpang —
-- satu mendapat kolom "status kesehatan", satunya tidak, lalu halaman UI-nya
-- bercabang, lalu penjaga CI harus memeriksa dua tempat.
--
-- Yang membedakan AI dan WA hanya `jenis` dan isi `konfigurasi` (JSONB).
-- Segalanya yang lain — kunci, aktif/tidak, prioritas, kesehatan, jejak uji —
-- identik. Tabel ini menyimpan yang identik dan membiarkan yang berbeda di
-- JSONB.
--
-- `ai_provider_config` (migrasi 250) TIDAK dihapus: ia menyimpan pilihan
-- MODEL per asisten, yang memang urusan berbeda. Registry ini soal SAMBUNGAN.
--
-- ── Kunci API tidak disimpan di sini
--
-- Kolomnya sengaja tak ada. Kredensial tinggal di `app_credentials` yang
-- sudah tersandi dan sudah dijaga `audit-kredensial-tak-bocor.mjs` (ambang
-- NOL). Menyalinnya ke tabel kedua berarti dua tempat yang bisa bocor, dan
-- penjaga itu hanya melihat satu.
--
-- Yang disimpan: NAMA kunci di katalog kredensial (`kunci_kredensial`).
-- ============================================================================

CREATE TABLE IF NOT EXISTS penyedia_layanan (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- 'ai' | 'wa' | (apa pun sesudahnya — sengaja TEXT, bukan enum)
  --
  -- Enum menuntut migrasi tiap kali jenis baru muncul, dan itu persis
  -- "hardcode" yang diminta hilang. CHECK-nya pun tak dipakai: jenis yang
  -- salah ketik akan terlihat sebagai penyedia yang tak pernah dipakai
  -- adaptor mana pun, bukan sebagai kebocoran.
  jenis       TEXT NOT NULL,

  /*
   * `adaptor` menunjuk BENTUK MUATAN HTTP yang dikenali kode.
   *
   * Inilah satu-satunya bagian yang memang harus kode: bentuk request
   * Evolution berbeda dari Fonnte, dan tak ada cara mengarangnya dari UI.
   * Penyedia baru yang memakai bentuk yang SUDAH dikenal (mis. semua yang
   * kompatibel OpenAI) cukup satu baris di tabel ini.
   */
  adaptor     TEXT NOT NULL,

  nama        TEXT NOT NULL,
  aktif       BOOLEAN NOT NULL DEFAULT false,

  /*
   * Urutan pemakaian saat satu jenis punya beberapa penyedia AKTIF.
   *
   * Kecil = didahulukan. Bukan "penyedia cadangan otomatis" — pemilihan
   * tetap sadar; ini hanya menentukan mana yang jadi bawaan di UI dan mana
   * yang dicoba lebih dulu kalau kelak ada failover.
   */
  prioritas   INT NOT NULL DEFAULT 100,

  /*
   * Konfigurasi non-rahasia: base_url, instance, region, dsb.
   *
   * JSONB karena bentuknya BERBEDA per adaptor dan akan terus bertambah.
   * Kolom tetap untuk tiap kemungkinan berarti migrasi tiap penyedia baru —
   * lagi-lagi bentuk hardcode yang diminta hilang.
   *
   * Yang RAHASIA tidak di sini. Lihat kepala berkas.
   */
  konfigurasi JSONB NOT NULL DEFAULT '{}'::jsonb,

  /** Nama kunci di `app_credentials`, BUKAN nilainya. */
  kunci_kredensial TEXT,

  -- ── Status kesehatan ──────────────────────────────────────────────────────
  --
  -- Diperiksa: TJS TIDAK PUNYA INI. `grep -rl "health|kesehatan|status_check"`
  -- di seluruh `app/dashboard/settings/` menghasilkan NOL berkas.
  --
  -- Ia layak ada justru karena kegagalan penyedia SENYAP: WhatsApp yang
  -- instance-nya mati tetap menerima permintaan dan mengembalikan 200 dengan
  -- badan galat; asisten yang kuncinya kedaluwarsa menjawab "sedang tak bisa
  -- dihubungi" tanpa menyebut kenapa. Tanpa halaman ini, satu-satunya cara
  -- tahu adalah menunggu seseorang mengeluh.
  kesehatan       TEXT NOT NULL DEFAULT 'belum_diuji',
  kesehatan_pesan TEXT,
  kesehatan_pada  TIMESTAMPTZ,
  /** Milidetik respons uji terakhir — tren lebih berguna dari satu angka. */
  kesehatan_ms    INT,

  dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Satu tenant tak boleh punya dua penyedia bernama sama untuk satu jenis;
  -- daftar yang memuat dua "Evolution" membuat orang memilih yang salah.
  UNIQUE (company_id, jenis, nama)
);

CREATE INDEX IF NOT EXISTS idx_penyedia_pilih
  ON penyedia_layanan (company_id, jenis, aktif, prioritas);

COMMENT ON TABLE penyedia_layanan IS
  'Registry penyedia layanan luar (AI, WhatsApp, dst). Penyedianya DATA, bukan '
  'kode — melampaui TJS yang menuntut berkas baru + deploy per penyedia. '
  'Kunci API TIDAK di sini: ia tinggal di app_credentials yang tersandi.';

COMMENT ON COLUMN penyedia_layanan.kesehatan IS
  'belum_diuji | sehat | gagal. TJS tak punya konsep ini (diukur 2026-08-10) — '
  'ia ada karena kegagalan penyedia SENYAP.';

-- ── Jejak uji koneksi: log aktivitas, bukan hanya status terakhir ───────────
--
-- Status terakhir menjawab "sekarang bagaimana". Yang tak terjawab: "sejak
-- kapan", "sering tidaknya", "apakah membaik". Penyedia yang gagal 3 dari 10
-- percobaan adalah masalah yang berbeda dari yang gagal 10 dari 10, dan
-- keduanya terlihat sama di kolom status.
CREATE TABLE IF NOT EXISTS penyedia_uji_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  penyedia_id UUID NOT NULL REFERENCES penyedia_layanan(id) ON DELETE CASCADE,
  hasil       TEXT NOT NULL,          -- 'sehat' | 'gagal'
  pesan       TEXT,
  durasi_ms   INT,
  oleh        UUID REFERENCES users(id) ON DELETE SET NULL,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_penyedia_log
  ON penyedia_uji_log (penyedia_id, dibuat_pada DESC);

-- ── RLS: pola yang sama dengan 259/260/263 ─────────────────────────────────
ALTER TABLE penyedia_layanan ENABLE ROW LEVEL SECURITY;
ALTER TABLE penyedia_uji_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS penyedia_dasar ON penyedia_layanan;
CREATE POLICY penyedia_dasar ON penyedia_layanan FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tenant_isolation ON penyedia_layanan;
CREATE POLICY tenant_isolation ON penyedia_layanan
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS penyedia_log_dasar ON penyedia_uji_log;
CREATE POLICY penyedia_log_dasar ON penyedia_uji_log FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tenant_isolation ON penyedia_uji_log;
CREATE POLICY tenant_isolation ON penyedia_uji_log
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- ── Permission ─────────────────────────────────────────────────────────────
INSERT INTO permissions (key, label, description, module, sort_order)
VALUES
  ('settings:penyedia:view', 'Lihat Penyedia Layanan',
   'Melihat daftar penyedia AI/WhatsApp dan status kesehatannya', 'settings', 40),
  ('settings:penyedia:manage', 'Kelola Penyedia Layanan',
   'Menambah, mengubah, dan menguji koneksi penyedia layanan', 'settings', 41)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE n int; v_comp UUID;
BEGIN
  IF to_regclass('public.penyedia_layanan') IS NULL
     OR to_regclass('public.penyedia_uji_log') IS NULL THEN
    RAISE EXCEPTION '266 gagal: tabel tidak terbentuk';
  END IF;

  -- Kunci API TIDAK BOLEH punya kolom di sini — ia milik app_credentials.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'penyedia_layanan'
       AND column_name IN ('api_key', 'kunci', 'secret', 'token', 'nilai_enc')
  ) THEN
    RAISE EXCEPTION '266 gagal: registry punya kolom rahasia — kredensial hanya di app_credentials';
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename IN ('penyedia_layanan', 'penyedia_uji_log')
     AND policyname = 'tenant_isolation' AND permissive = 'RESTRICTIVE';
  IF n <> 2 THEN
    RAISE EXCEPTION '266 gagal: tenant_isolation belum RESTRICTIVE di kedua tabel';
  END IF;

  SELECT count(*) INTO n FROM permissions
   WHERE key IN ('settings:penyedia:view', 'settings:penyedia:manage');
  IF n <> 2 THEN
    RAISE EXCEPTION '266 gagal: permission tidak lengkap';
  END IF;

  -- Nama ganda per jenis WAJIB ditolak.
  SELECT c.id INTO v_comp FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1;
  IF v_comp IS NOT NULL THEN
    INSERT INTO penyedia_layanan (company_id, jenis, adaptor, nama)
    VALUES (v_comp, 'uji266', 'uji', 'Ganda');
    BEGIN
      INSERT INTO penyedia_layanan (company_id, jenis, adaptor, nama)
      VALUES (v_comp, 'uji266', 'uji', 'Ganda');
      RAISE EXCEPTION '266 gagal: nama ganda per jenis tidak ditolak';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    DELETE FROM penyedia_layanan WHERE jenis = 'uji266';
  END IF;
END $$;
