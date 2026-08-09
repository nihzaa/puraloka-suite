-- ============================================================================
-- 260 — TOKEN PREVIEW→SETUJUI + batas nominal AI per PENGGUNA (TJS-E1)
-- ============================================================================
--
-- ── Apa yang dibangun
--
-- Asisten boleh MENYIAPKAN sebuah persetujuan (menghitung dampaknya, menampilkan
-- nominalnya) lalu memberi manusia satu token untuk MENYETUJUINYA. Asisten
-- sendiri tak pernah menyetujui apa pun — ia hanya menyiapkan.
--
-- Pembagian itu yang membuat fitur ini boleh ada sama sekali: tool AI tetap
-- read-only (I-1), dan satu-satunya hal yang berubah adalah manusia tak perlu
-- membuka dashboard untuk menekan tombol yang sudah ia putuskan.
--
-- ── P-3: token DIKLAIM ATOMIK, bukan diperiksa lalu dipakai
--
-- `dipakai_pada` diisi lewat `UPDATE ... WHERE dipakai_pada IS NULL`, dan
-- pemanggil membaca `rowCount`. Nol baris = sudah pernah dipakai → 409.
--
-- Bukan `SELECT` lalu `UPDATE`: dua permintaan bersamaan sama-sama melihat
-- "belum dipakai", dan keduanya menyetujui. Untuk kasbon itu berarti uang
-- keluar dua kali, dan tak ada galat yang menunjukkannya.
--
-- ── P-4: batas melekat pada PENGGUNA, bukan nomor atau kanal (perbaikan C-2)
--
-- `ai_batas_setujui.user_id`, bukan `nomor`. TJS mengikat batasnya ke nomor
-- WhatsApp; orang yang sama lewat kanal lain jadi tak berbatas, dan mendaftarkan
-- nomor kedua sudah cukup untuk melipatgandakan plafon sendiri.
--
-- Batas milik orang. Kanalnya tak mengubah siapa dia.
--
-- ── Kenapa nominal disimpan di token
--
-- Supaya yang disetujui adalah yang DILIHAT. Kalau nominalnya dihitung ulang
-- saat eksekusi, dokumen yang berubah di antara preview dan approve akan
-- disetujui pada angka yang tak pernah ditampilkan kepada siapa pun.
-- Perbandingannya dilakukan di kode (P-6, dicek DUA KALI).
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_token_setujui (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Token yang dikirim ke pengguna. UNIQUE: tebakan yang kebetulan bertabrakan
  -- tak boleh menemukan token orang lain.
  token        TEXT NOT NULL UNIQUE,

  -- Siapa yang boleh memakainya. Token milik orang, bukan milik percakapan —
  -- meneruskannya ke orang lain tidak memindahkan wewenang.
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  jenis        TEXT NOT NULL,   -- sama dengan approval_chains.entity_type
  entity_id    UUID NOT NULL,

  /*
   * Nominal SAAT PREVIEW. `numeric`, bukan float (§5.4).
   *
   * NULL berarti TAK DIKETAHUI, dan di kode itu diperlakukan sebagai Infinity
   * — melampaui semua ambang (konvensi `lib/mr-amount.ts:18`). Tiga dari tujuh
   * jenis entitas memang tak punya kolom nominal, dan justru merekalah yang
   * paling mudah lolos kalau ketiadaan angka dibaca sebagai nol.
   */
  nominal      NUMERIC,

  kanal        TEXT NOT NULL DEFAULT 'web',
  kedaluwarsa  TIMESTAMPTZ NOT NULL,
  dipakai_pada TIMESTAMPTZ,
  dibuat_pada  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_token_user ON ai_token_setujui(user_id, dibuat_pada DESC);

COMMENT ON COLUMN ai_token_setujui.nominal IS
  'Nominal saat preview. NULL = tak diketahui → diperlakukan Infinity di kode '
  '(melampaui semua ambang), mengikuti konvensi lib/mr-amount.ts.';

-- ── Batas nominal per PENGGUNA (P-4) ────────────────────────────────────────
--
-- Tabel sendiri, bukan kolom di `users`: batas ini per-tenant. Satu orang bisa
-- jadi anggota dua perusahaan dengan plafon berbeda, dan kolom di `users`
-- (tabel global, kategori D5) tak bisa menyatakan itu.
CREATE TABLE IF NOT EXISTS ai_batas_setujui (
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  /*
   * Plafon. NULL berarti "belum diatur" → di kode dibaca sebagai NOL, bukan
   * tak terbatas.
   *
   * Fail-closed, dan sengaja: gerbang uang yang bawaannya "boleh semua" hanya
   * terlihat salah setelah ada yang menyetujui sesuatu yang besar. Yang ingin
   * memberi plafon melakukannya sadar, dari UI.
   */
  batas_idr    NUMERIC,
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);

COMMENT ON COLUMN ai_batas_setujui.batas_idr IS
  'Plafon persetujuan lewat asisten. NULL/tak ada baris = NOL (fail-closed), '
  'bukan tak terbatas. Berbeda dari approval_steps.min_amount yang LANTAI.';

-- ── RLS: pola yang sama dengan 259, restrictive yang benar-benar membatasi ──
ALTER TABLE ai_token_setujui ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_batas_setujui ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_token_dasar ON ai_token_setujui;
CREATE POLICY ai_token_dasar ON ai_token_setujui FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tenant_isolation ON ai_token_setujui;
CREATE POLICY tenant_isolation ON ai_token_setujui
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

DROP POLICY IF EXISTS ai_batas_dasar ON ai_batas_setujui;
CREATE POLICY ai_batas_dasar ON ai_batas_setujui FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tenant_isolation ON ai_batas_setujui;
CREATE POLICY tenant_isolation ON ai_batas_setujui
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- ── Permission (ADR-004) ────────────────────────────────────────────────────
-- `label` NOT NULL (diukur dari information_schema, bukan ditebak) — ia yang
-- muncul di halaman Peran. Permission tanpa label tak bisa diberikan lewat UI,
-- dan permission yang tak bisa diberikan sama saja dengan tak ada.
INSERT INTO permissions (key, label, description, module, sort_order)
VALUES
  ('ai:setujui', 'Setujui lewat Asisten',
   'Menyetujui dokumen lewat asisten AI (token sekali-pakai)', 'ai', 30),
  ('settings:ai:batas', 'Atur Plafon Asisten',
   'Mengatur plafon persetujuan lewat asisten per pengguna', 'settings', 90)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  IF to_regclass('public.ai_token_setujui') IS NULL
     OR to_regclass('public.ai_batas_setujui') IS NULL THEN
    RAISE EXCEPTION '260 gagal: tabel tidak terbentuk';
  END IF;

  -- Nominal WAJIB numeric — float pada gerbang uang adalah §5.4.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name IN ('ai_token_setujui', 'ai_batas_setujui')
     AND column_name IN ('nominal', 'batas_idr')
     AND data_type <> 'numeric';
  IF n > 0 THEN
    RAISE EXCEPTION '260 gagal: ada kolom nominal yang bukan numeric';
  END IF;

  -- Token ganda WAJIB ditolak.
  PERFORM 1;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'ai_token_setujui' AND indexdef ILIKE '%UNIQUE%token%'
  ) THEN
    RAISE EXCEPTION '260 gagal: kolom token tidak UNIQUE — tabrakan bisa menemukan token orang lain';
  END IF;

  -- Kedua permission harus benar-benar ada; menu/route yang menyaring
  -- permission tak dikenal tak pernah terlihat siapa pun.
  SELECT count(*) INTO n FROM permissions WHERE key IN ('ai:setujui', 'settings:ai:batas');
  IF n <> 2 THEN
    RAISE EXCEPTION '260 gagal: permission ai:setujui / settings:ai:batas tidak lengkap';
  END IF;

  -- Isolasi tenant terpasang sebagai RESTRICTIVE di KEDUA tabel.
  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename IN ('ai_token_setujui', 'ai_batas_setujui')
     AND policyname = 'tenant_isolation' AND permissive = 'RESTRICTIVE';
  IF n <> 2 THEN
    RAISE EXCEPTION '260 gagal: tenant_isolation belum RESTRICTIVE di kedua tabel';
  END IF;
END $$;
