-- ============================================================================
-- 382 — MODE BICARA ASISTEN + PLAFON BIAYA PINDAH KE TENANT
-- ============================================================================
--
-- Dua perubahan yang sengaja disatukan dalam satu migrasi, karena keduanya
-- lahir dari satu keputusan founder (2026-08-14): "asisten harus bisa memberi
-- saran dan diajak bicara, bukan cuma menjawab dari data" — dan menghidupkan
-- watak per-kanal membuka lubang biaya yang harus ditutup di saat yang sama.
--
-- ── 1. `mode_bicara` — watak, bukan pelonggaran pagar
--
-- Sampai hari ini `PROMPT_DASAR` mencampur DUA larangan yang berbeda sifatnya:
--
--   "jangan mengarang ANGKA"     → pertahanan anti-halusinasi, harus MUTLAK
--   "jangan berpendapat"          → pilihan gaya, dan inilah yang dilonggarkan
--
-- Karena tercampur, melonggarkan yang kedua berarti ikut mencabut yang pertama.
-- Kolom ini memisahkan keduanya: mode mengatur GAYA, sementara pagar fakta
-- ikut di setiap mode tanpa bisa dimatikan dari mana pun — termasuk dari
-- `prompt_sistem` milik tenant.
--
-- Bawaannya `pelapor`, yaitu perilaku hari ini. Migrasi ini TIDAK mengubah
-- perilaku satu tenant pun sampai ada yang sadar memilih mode lain dari UI.
--
-- ── 2. Plafon biaya pindah dari per-asisten ke per-tenant
--
-- `ai-jalankan.ts` sengaja memaksa WhatsApp memakai ember `staff` yang sama
-- dengan web, dengan alasan yang ditulis di sana:
--
--   "batas biaya milik TENANT, bukan milik kanal. Ember terpisah berarti
--    tenant yang membatasi Rp 500rb bisa menghabiskan dua kali lipat hanya
--    dengan berpindah kanal."
--
-- Konsekuensinya: asisten `owner` dan `web` punya baris konfigurasi, halaman
-- UI, dan kolom plafon sendiri — tetapi tak pernah dipanggil sama sekali.
-- Menghidupkan keduanya (supaya watak bisa beda per kanal) akan membuka
-- persis lubang yang komentar itu cegah, selama plafon masih per-baris.
--
-- Maka plafonnya dinaikkan satu tingkat ke `ai_pengaturan_tenant`, tempat
-- `ai_aktif` dan `retensi_hari` sudah tinggal — sesamanya, yang juga milik
-- tenant. Yang tetap per-asisten: penyedia, model, prompt, mode bicara,
-- maks ronde, tool aktif. Yang jadi milik tenant: berapa rupiah sebulan.
--
-- ── Kenapa nilai lama DIPINDAHKAN, bukan dibiarkan
--
-- Tenant yang sudah menyetel Rp 500rb di baris `staff` tidak boleh bangun
-- besok tanpa plafon sama sekali. Yang diambil adalah nilai TERBESAR di antara
-- baris-baris tenant itu, dan `mode_batas` 'blokir' menang atas 'peringatkan'
-- — dua-duanya memilih sisi yang lebih aman, karena menebak terlalu longgar
-- berarti tagihan, sementara menebak terlalu ketat hanya berarti satu
-- keluhan yang gampang diperbaiki dari UI.
--
-- Kolom lama TIDAK di-drop di migrasi ini. Menghapus kolom yang masih dibaca
-- kode lama adalah cara paling cepat membuat rollback jadi mustahil; ia
-- dipensiunkan lewat komentar dan dibersihkan setelah kode barunya stabil.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. mode_bicara pada ai_provider_config
-- ------------------------------------------------------------
ALTER TABLE ai_provider_config
  ADD COLUMN IF NOT EXISTS mode_bicara TEXT NOT NULL DEFAULT 'pelapor';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_provider_mode_bicara_sah'
  ) THEN
    ALTER TABLE ai_provider_config
      ADD CONSTRAINT ai_provider_mode_bicara_sah
      CHECK (mode_bicara IN ('pelapor', 'penasihat', 'teman'));
  END IF;
END $$;

COMMENT ON COLUMN ai_provider_config.mode_bicara IS
  'Watak asisten: pelapor (hanya angka bersumber) | penasihat (boleh menyarankan, '
  'wajib menandai opini) | teman (boleh basa-basi). Pagar fakta ikut di SEMUA mode '
  'dan tak bisa dimatikan dari sini maupun dari prompt_sistem.';

-- ------------------------------------------------------------
-- 2. Plafon biaya pada ai_pengaturan_tenant
-- ------------------------------------------------------------
ALTER TABLE ai_pengaturan_tenant
  ADD COLUMN IF NOT EXISTS batas_bulanan_idr NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS mode_batas TEXT NOT NULL DEFAULT 'peringatkan';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_tenant_mode_batas_sah'
  ) THEN
    ALTER TABLE ai_pengaturan_tenant
      ADD CONSTRAINT ai_tenant_mode_batas_sah
      CHECK (mode_batas IN ('blokir', 'peringatkan'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_tenant_batas_wajar'
  ) THEN
    ALTER TABLE ai_pengaturan_tenant
      ADD CONSTRAINT ai_tenant_batas_wajar
      CHECK (batas_bulanan_idr IS NULL OR batas_bulanan_idr >= 0);
  END IF;
END $$;

COMMENT ON COLUMN ai_pengaturan_tenant.batas_bulanan_idr IS
  'Plafon biaya AI sebulan untuk SELURUH kanal tenant ini. Milik tenant, bukan '
  'per-asisten: ember terpisah membuat plafon bisa dilipatgandakan dengan pindah kanal.';

-- ------------------------------------------------------------
-- 3. Pindahkan nilai lama — yang paling aman yang menang
-- ------------------------------------------------------------
-- Tenant yang punya baris pengaturan: ambil plafon terbesar dari baris
-- asistennya. NULL (tanpa batas) pada salah satu baris berarti tenant itu
-- memang tak pernah membatasi kanal tersebut, jadi MAX mengabaikannya —
-- dan hasil NULL total berarti memang tak ada plafon untuk dipindah.
UPDATE ai_pengaturan_tenant t
   SET batas_bulanan_idr = s.batas,
       mode_batas        = s.mode
  FROM (
        SELECT company_id,
               MAX(batas_bulanan_idr) AS batas,
               -- 'blokir' menang: memilih sisi yang lebih ketat saat ragu.
               CASE WHEN bool_or(mode_batas = 'blokir') THEN 'blokir'
                    ELSE 'peringatkan' END AS mode
          FROM ai_provider_config
         GROUP BY company_id
       ) s
 WHERE t.company_id = s.company_id
   AND t.batas_bulanan_idr IS NULL      -- jangan menimpa yang sudah diisi
   AND s.batas IS NOT NULL;

-- Tenant yang PUNYA plafon di config tapi BELUM punya baris pengaturan sama
-- sekali. Tanpa ini, plafon mereka hilang tanpa jejak saat kode baru membaca
-- dari tabel tenant.
INSERT INTO ai_pengaturan_tenant (company_id, batas_bulanan_idr, mode_batas)
SELECT s.company_id, s.batas, s.mode
  FROM (
        SELECT company_id,
               MAX(batas_bulanan_idr) AS batas,
               CASE WHEN bool_or(mode_batas = 'blokir') THEN 'blokir'
                    ELSE 'peringatkan' END AS mode
          FROM ai_provider_config
         GROUP BY company_id
       ) s
 WHERE s.batas IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM ai_pengaturan_tenant t WHERE t.company_id = s.company_id
       )
ON CONFLICT (company_id) DO NOTHING;

COMMENT ON COLUMN ai_provider_config.batas_bulanan_idr IS
  'DIPENSIUNKAN oleh migrasi 382 — plafon kini milik ai_pengaturan_tenant. '
  'Belum di-drop supaya rollback tetap mungkin; hapus setelah kode baru stabil.';

-- ------------------------------------------------------------
-- 4. Verifikasi — gagal keras kalau artefaknya tidak benar-benar ada.
--
-- Pelajaran migrasi 043 (dan 047↔167): buku migrasi bisa mencatat "sukses"
-- tanpa satu pun objek terbentuk. Yang membuat verdict layak dipercaya adalah
-- artefak fisiknya, bukan barisnya di buku.
-- ------------------------------------------------------------
DO $$
DECLARE
  n_bocor INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'ai_provider_config' AND column_name = 'mode_bicara'
  ) THEN
    RAISE EXCEPTION '382 gagal: ai_provider_config.mode_bicara tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'ai_pengaturan_tenant' AND column_name = 'batas_bulanan_idr'
  ) THEN
    RAISE EXCEPTION '382 gagal: ai_pengaturan_tenant.batas_bulanan_idr tidak terbentuk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_provider_mode_bicara_sah'
  ) THEN
    RAISE EXCEPTION '382 gagal: CHECK mode_bicara tidak terpasang';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_tenant_mode_batas_sah'
  ) THEN
    RAISE EXCEPTION '382 gagal: CHECK mode_batas tenant tidak terpasang';
  END IF;

  -- Tak boleh ada tenant yang plafonnya tertinggal di config tanpa salinan di
  -- tenant. Kalau ada, pemindahan di atas bocor dan seseorang akan kehilangan
  -- batas biayanya tanpa pernah diberi tahu.
  SELECT count(*) INTO n_bocor
    FROM (SELECT company_id, MAX(batas_bulanan_idr) AS b
            FROM ai_provider_config GROUP BY company_id) s
    LEFT JOIN ai_pengaturan_tenant t ON t.company_id = s.company_id
   WHERE s.b IS NOT NULL
     AND (t.company_id IS NULL OR t.batas_bulanan_idr IS NULL);

  IF n_bocor > 0 THEN
    RAISE EXCEPTION '382 gagal: % tenant kehilangan plafon saat dipindahkan', n_bocor;
  END IF;
END $$;
