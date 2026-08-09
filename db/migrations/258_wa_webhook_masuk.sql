-- ============================================================================
-- 258 — DEDUP PESAN MASUK + kolom pendukung webhook
-- ============================================================================
--
-- ── Rujukan TJS, dan celah ketiganya
--
-- `automation-tjs/.../lib/wa/inbound/evolution-inbound.ts` punya deduplikasi
-- pesan masuk (baris 113: "tanpa ID tidak bisa dideduplikasi"). Itu ditiru.
--
-- Yang TIDAK ada di sana: verifikasi bahwa webhook-nya memang dari penyedia.
-- Diperiksa 2026-08-10 — nol `signature`, nol `hmac`, nol pemeriksaan apikey
-- di seluruh 158 baris berkas itu.
--
-- Akibatnya siapa pun yang tahu URL webhook bisa mengirim pesan PALSU atas
-- nama nomor mana pun yang terdaftar. Untuk asisten read-only itu berarti
-- membaca data orang lain; kalau kelak ada jalur tulis, jauh lebih buruk.
--
-- Di sini rahasia webhook diperiksa sebelum apa pun diproses, dan pesan yang
-- ditolak tetap DICATAT — percobaan yang tak terlihat berarti pola serangan
-- tak pernah muncul.
--
-- ── Kenapa tabel dedup terpisah dari `wa_kirim_idempotensi`
--
-- Arahnya berbeda dan kuncinya berbeda. Keluar memakai kunci yang DITENTUKAN
-- pemanggil dari peristiwa bisnis; masuk memakai id pesan dari PENYEDIA.
-- Menggabungkannya berarti satu id penyedia bisa bertabrakan dengan satu
-- kunci peristiwa, dan tabrakan itu menelan pesan yang sah.
-- ============================================================================

CREATE TABLE IF NOT EXISTS wa_pesan_masuk_dedup (
  -- Id pesan dari penyedia. PRIMARY KEY: itulah yang membuat pemeriksaan
  -- "sudah pernah?" jadi atomik — dua webhook bersamaan tak bisa keduanya
  -- lolos.
  pesan_id    TEXT PRIMARY KEY,
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  nomor       TEXT NOT NULL,
  diproses    BOOLEAN NOT NULL DEFAULT false,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_masuk_waktu ON wa_pesan_masuk_dedup(dibuat_pada DESC);

COMMENT ON TABLE wa_pesan_masuk_dedup IS
  'Dedup pesan MASUK dari id penyedia. Terpisah dari wa_kirim_idempotensi: '
  'arah dan sumber kuncinya berbeda, dan menggabungkannya membuat id penyedia '
  'bisa bertabrakan dengan kunci peristiwa bisnis.';

-- company_id boleh NULL: pesan dari nomor tak dikenal belum punya tenant, dan
-- memaksanya bernilai berarti mengarang pemilik.
ALTER TABLE wa_pesan_masuk_dedup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_masuk_kelola ON wa_pesan_masuk_dedup;
CREATE POLICY wa_masuk_kelola ON wa_pesan_masuk_dedup FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.wa_pesan_masuk_dedup') IS NULL THEN
    RAISE EXCEPTION '258 gagal: tabel dedup tidak terbentuk';
  END IF;

  -- Id ganda WAJIB ditolak — itu seluruh gunanya.
  INSERT INTO wa_pesan_masuk_dedup (pesan_id, nomor) VALUES ('uji-258', '628000000000');
  BEGIN
    INSERT INTO wa_pesan_masuk_dedup (pesan_id, nomor) VALUES ('uji-258', '628000000000');
    RAISE EXCEPTION '258 gagal: pesan_id ganda tidak ditolak';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  DELETE FROM wa_pesan_masuk_dedup WHERE pesan_id = 'uji-258';

  -- company_id NULL harus boleh: pesan dari nomor tak dikenal belum bertenant.
  INSERT INTO wa_pesan_masuk_dedup (pesan_id, nomor, company_id)
  VALUES ('uji-258-null', '628000000001', NULL);
  DELETE FROM wa_pesan_masuk_dedup WHERE pesan_id = 'uji-258-null';

  -- Tabel ini TIDAK boleh menyimpan isi pesan.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wa_pesan_masuk_dedup'
      AND column_name IN ('isi', 'pesan', 'teks', 'body', 'content')
  ) THEN
    RAISE EXCEPTION '258 gagal: tabel dedup punya kolom isi pesan';
  END IF;
END $$;
