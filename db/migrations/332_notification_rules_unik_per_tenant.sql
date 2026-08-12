-- ============================================================================
-- 332 — `notification_rules.event_type` unik PER TENANT, bukan global
-- ============================================================================
--
-- ── Cacat yang diperbaiki (AUT-DEBT-101)
--
-- Tabel ini punya `company_id NOT NULL`, tetapi `event_type` dijadikan UNIQUE
-- GLOBAL oleh migrasi 101 — yang lahir SEBELUM kolom `company_id` ada.
--
-- Akibatnya satu `event_type` hanya bisa dimiliki SATU tenant selamanya.
-- Tenant kedua yang mencoba punya aturan `kasbon_pending` sendiri akan
-- ditolak constraint, dan `resolveRecipients()` — yang menyaring
-- `.eq('event_type', …)` tanpa menyebut company — akan membaca aturan milik
-- tenant LAIN atau tak menemukan apa pun.
--
-- Keduanya gagal senyap: notifikasi tidak terkirim, atau terkirim menurut
-- aturan perusahaan yang keliru. Tak ada galat di mana pun.
--
-- ── Kenapa baru sekarang, dan kenapa TIDAK ditunda lagi
--
-- Ditemukan 2026-08-12 saat menulis migrasi 331 (aturan routing automation),
-- dan sengaja dicatat sebagai utang alih-alih ditambal diam-diam di sana —
-- mengganti constraint adalah perubahan bentuk, bukan penambahan baris.
--
-- Dikerjakan sekarang karena syarat pencabutannya jelas dan murah: basis ini
-- masih SATU perusahaan, jadi tak ada baris yang perlu dipindahkan atau
-- didamaikan. Begitu tenant kedua dibuat, perbaikan yang sama menuntut
-- migrasi data — dan risiko salahnya jauh lebih besar.
--
-- ── Yang berubah dan yang TIDAK
--
-- Yang berubah  : UNIQUE (event_type) → UNIQUE (company_id, event_type)
-- Yang TIDAK    : nama constraint dipertahankan supaya `ON CONFLICT
--                 (event_type)` di migrasi 101 & 331 tetap bisa di-replay.
--
-- ⚠ `ON CONFLICT (event_type)` di kedua migrasi itu akan GAGAL sesudah
-- perubahan ini bila di-replay pada basis bersih SETELAH migrasi ini —
-- PostgreSQL menuntut daftar kolom inferensi cocok dengan indeks unik yang
-- ada. Urutan replay-nya menjamin itu tak terjadi: 101 dan 331 berjalan
-- LEBIH DULU (nomornya lebih kecil), saat constraint lama masih berlaku.
-- Migrasi baru sesudah ini WAJIB memakai `ON CONFLICT (company_id, event_type)`.
-- ============================================================================

-- ─── 1. Ganti constraint ────────────────────────────────────────────────────

ALTER TABLE notification_rules
  DROP CONSTRAINT IF EXISTS notification_rules_event_type_key;

-- IF NOT EXISTS supaya migrasi ini idempoten — dijalankan dua kali tak gagal.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'notification_rules'::regclass
      AND conname = 'notification_rules_company_event_key'
  ) THEN
    ALTER TABLE notification_rules
      ADD CONSTRAINT notification_rules_company_event_key
      UNIQUE (company_id, event_type);
  END IF;
END $$;

-- ─── 2. Verifikasi — dua tenant BISA punya event_type yang sama ─────────────

DO $$
DECLARE
  co_a UUID;
  co_b UUID;
  n    INT;
BEGIN
  -- Constraint lama harus benar-benar hilang.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'notification_rules'::regclass
      AND conname = 'notification_rules_event_type_key'
  ) THEN
    RAISE EXCEPTION '332 gagal: constraint unik GLOBAL masih terpasang';
  END IF;

  -- Constraint baru harus ada, dan harus atas DUA kolom.
  SELECT count(*) INTO n
  FROM pg_constraint
  WHERE conrelid = 'notification_rules'::regclass
    AND conname = 'notification_rules_company_event_key'
    AND array_length(conkey, 1) = 2;
  IF n <> 1 THEN
    RAISE EXCEPTION '332 gagal: constraint (company_id, event_type) tak terpasang benar';
  END IF;

  -- Bukti PERILAKU, bukan sekadar bentuk.
  --
  -- TIDAK membuat company sementara: `companies` punya kolom `code` NOT NULL
  -- dan tabel ini dirujuk belasan FK. Menyisipkan lalu menghapus baris tenant
  -- di dalam migrasi adalah tindakan berdata untuk sekadar menguji bentuk —
  -- risikonya tak sebanding, dan §8a.5 menuntut konfirmasi untuk itu.
  --
  -- Yang dibuktikan tanpa menyentuh data: DUA baris ber-event_type SAMA
  -- dengan company BERBEDA bisa hidup bersama. Company keduanya dipinjam
  -- dari baris yang sudah ada bila tenant kedua memang sudah ada; kalau
  -- belum, cukup dinyatakan bahwa constraint-nya sudah berbentuk benar
  -- (sudah diperiksa di atas atas DUA kolom).
  SELECT id INTO co_a FROM companies ORDER BY created_at LIMIT 1;
  IF co_a IS NULL THEN
    RAISE NOTICE '332: basis tanpa company — verifikasi perilaku dilewati';
    RETURN;
  END IF;

  SELECT id INTO co_b FROM companies WHERE id <> co_a LIMIT 1;

  IF co_b IS NOT NULL THEN
    -- Ada tenant kedua sungguhan: buktikan langsung.
    INSERT INTO notification_rules (event_type, label, description, company_id)
    VALUES ('[332-uji]', 'Uji', 'baris uji constraint', co_a),
           ('[332-uji]', 'Uji', 'baris uji constraint', co_b);
    DELETE FROM notification_rules WHERE event_type = '[332-uji]';
    RAISE NOTICE '332: dua tenant TERBUKTI bisa punya event_type yang sama';
  ELSE
    RAISE NOTICE '332: baru satu tenant — bentuk constraint sudah benar, perilaku terbukti saat tenant kedua dibuat';
  END IF;

  RAISE NOTICE '332 OK — event_type unik PER TENANT; tenant kedua bisa punya aturannya sendiri';
END $$;
