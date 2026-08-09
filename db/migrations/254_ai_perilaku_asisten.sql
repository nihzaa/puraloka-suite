-- ============================================================================
-- 254 — PERILAKU ASISTEN DARI UI: prompt, batas ronde, tool yang aktif
-- ============================================================================
--
-- Founder 2026-08-10: *"semuanya bisa dikonfigurasi di UI, gaada yang hardcode
-- di sana"*.
--
-- ── Apa yang sebelumnya dipaku, dan kenapa itu masalah
--
--   PROMPT SISTEM   `routes/v1/ai-chat.ts` — mengubah cara asisten menjawab
--                   menuntut deploy, dan SELURUH tenant ikut berubah.
--   MAKS_RONDE      `lib/ai-loop.ts` — batas 4 berlaku untuk semua, padahal
--                   tenant yang tool-nya lebih banyak wajar butuh lebih.
--   TOOL AKTIF      `lib/ai-tool.ts` — seluruh katalog selalu ditawarkan;
--                   tenant tak bisa mematikan satu tool tanpa mencabut
--                   permission yang juga dipakai halaman biasa.
--
-- Yang ketiga paling menggigit. "Matikan akses stok untuk asisten" hari ini
-- hanya bisa dilakukan dengan mencabut `gudang:view` — yang sekaligus
-- menyembunyikan halaman Gudang dari orangnya. Konfigurasi yang memaksa
-- merusak hal lain bukan konfigurasi.
--
-- ── Yang TETAP di kode, dan itu disengaja
--
-- DEFINISI tool (nama, skema, kueri) tetap di `lib/ai-tool.ts`. Yang bisa
-- diatur dari UI adalah tool mana yang AKTIF — bukan menulis kueri baru lewat
-- kotak isian. Membiarkan UI mendefinisikan pembacaan basis berarti seseorang
-- bisa mengarang tool yang membaca tabel lintas tenant, dan penjaga
-- `audit-tool-ai-read-only` tak akan pernah melihatnya (ia memindai kode,
-- bukan baris basis).
--
-- Batas [C] CLAUDE.md §5.3 tetap: sifat READ-ONLY tidak boleh bisa diubah
-- dari UI. Tak ada kolom "izinkan menulis" di sini, dan tak boleh pernah ada.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Kolom perilaku pada config yang sudah ada
--
-- Menempel di `ai_provider_config` (bukan tabel baru): kuncinya sama persis
-- (company_id, asisten), dan tabel terpisah berarti dua baca untuk satu
-- keputusan — plus kemungkinan keduanya tak sinkron.
-- ------------------------------------------------------------
ALTER TABLE ai_provider_config
  ADD COLUMN IF NOT EXISTS prompt_sistem TEXT,
  ADD COLUMN IF NOT EXISTS maks_ronde INTEGER NOT NULL DEFAULT 4,
  -- NULL = seluruh tool yang izinnya dimiliki. Array kosong = NOL tool
  -- (asisten tetap menjawab, tapi tanpa membaca data).
  --
  -- Dibedakan dengan sengaja: `{}` adalah pilihan sadar "jangan baca apa pun",
  -- sementara NULL berarti "belum diatur". Menyamakan keduanya membuat tenant
  -- yang mematikan semua tool diam-diam mendapat semuanya kembali.
  ADD COLUMN IF NOT EXISTS tool_aktif TEXT[];

ALTER TABLE ai_provider_config
  DROP CONSTRAINT IF EXISTS ai_provider_config_ronde_wajar;
ALTER TABLE ai_provider_config
  ADD CONSTRAINT ai_provider_config_ronde_wajar
  CHECK (maks_ronde BETWEEN 1 AND 12);

-- Prompt raksasa membakar token TIAP ronde — ia dikirim ulang setiap kali.
-- 8.000 karakter ≈ 2.000 token; dikali 4 ronde sudah 8.000 token hanya untuk
-- instruksi, sebelum satu pun data dibaca.
ALTER TABLE ai_provider_config
  DROP CONSTRAINT IF EXISTS ai_provider_config_prompt_wajar;
ALTER TABLE ai_provider_config
  ADD CONSTRAINT ai_provider_config_prompt_wajar
  CHECK (prompt_sistem IS NULL OR length(prompt_sistem) <= 8000);

COMMENT ON COLUMN ai_provider_config.prompt_sistem IS
  'Instruksi tambahan dari tenant. Batas READ-ONLY tetap ditegakkan di kode '
  '(tool tulis memang tak ada) dan TIDAK bisa dilonggarkan lewat kolom ini.';
COMMENT ON COLUMN ai_provider_config.tool_aktif IS
  'NULL = semua tool yang izinnya dimiliki. Array kosong = nol tool. '
  'Definisi tool tetap di kode; ini hanya memilih mana yang ditawarkan.';

-- ------------------------------------------------------------
-- 2. Permission — melihat/mengubah perilaku asisten
--
-- Memakai `settings:ai:*` yang sudah ada (migrasi 250). Menambah permission
-- baru untuk hal yang wewenangnya sama hanya menambah baris matriks izin yang
-- harus dicentang orang tanpa alasan.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3. Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE v_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_provider_config'
      AND column_name IN ('prompt_sistem', 'maks_ronde', 'tool_aktif')
    HAVING count(*) = 3
  ) THEN
    RAISE EXCEPTION '254 gagal: kolom perilaku tidak lengkap';
  END IF;

  SELECT company_id INTO v_id FROM ai_provider_config LIMIT 1;

  -- Ronde tak wajar DITOLAK. Batas yang cuma divalidasi UI bisa dilewati lewat
  -- API, dan ronde 999 berarti satu pertanyaan menghabiskan kuota sebulan.
  BEGIN
    UPDATE ai_provider_config SET maks_ronde = 99 WHERE company_id = v_id;
    RAISE EXCEPTION '254 gagal: maks_ronde 99 tidak ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE ai_provider_config SET maks_ronde = 0 WHERE company_id = v_id;
    RAISE EXCEPTION '254 gagal: maks_ronde 0 tidak ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Prompt raksasa ditolak.
  BEGIN
    UPDATE ai_provider_config SET prompt_sistem = repeat('x', 9000) WHERE company_id = v_id;
    RAISE EXCEPTION '254 gagal: prompt 9000 karakter tidak ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Array kosong HARUS bisa disimpan dan dibedakan dari NULL — itu inti
  -- "matikan semua tool" sebagai pilihan sadar.
  UPDATE ai_provider_config SET tool_aktif = '{}' WHERE company_id = v_id;
  IF (SELECT tool_aktif FROM ai_provider_config WHERE company_id = v_id LIMIT 1) IS NULL THEN
    RAISE EXCEPTION '254 gagal: array kosong tersimpan sebagai NULL';
  END IF;
  UPDATE ai_provider_config SET tool_aktif = NULL WHERE company_id = v_id;
END $$;
