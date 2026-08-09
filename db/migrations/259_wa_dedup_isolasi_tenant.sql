-- ============================================================================
-- 259 — ISOLASI TENANT untuk `wa_pesan_masuk_dedup` (memperbaiki 258)
-- ============================================================================
--
-- ── Saya salah di 258
--
-- Migrasi 258 memberi tabel ini policy `FOR ALL USING (true) WITH CHECK (true)`
-- dan berhenti di situ. Tiga penjaga menolaknya, semuanya benar:
--
--   T5a    — tabel ber-tenant tanpa policy `tenant_isolation`
--   T5a-0  — policy permisif TANPA SYARAT pada tabel ber-`company_id`
--   T7/L2  — axis company tak terpasang
--
-- `USING (true)` pada tabel yang punya `company_id` berarti setiap tenant
-- membaca baris tenant lain. Untuk tabel ini isinya "cuma" id pesan dan nomor
-- telepon — tetapi nomor telepon karyawan perusahaan lain persis jenis data
-- yang tak boleh bocor, dan "cuma" adalah kata yang mendahului banyak kebocoran.
--
-- Migrasi 258 TIDAK diedit (§5.5). Ini migrasi maju.
--
-- ── Kenapa NULL diizinkan di sini, berbeda dari `audit_logs` (179)
--
-- 179 sengaja MENOLAK `company_id IS NULL`: jejak audit tanpa pemilik adalah
-- jejak yang tak bisa dikaitkan ke siapa pun.
--
-- Di sini kebalikannya, dan bukan kelonggaran: pesan masuk memang BELUM punya
-- tenant sampai nomornya diresolusi — itu gerbang ke-4, dua langkah setelah
-- baris ini ditulis. Memaksa `company_id` bernilai saat klaim berarti mengarang
-- pemilik; menolak baris NULL berarti dedup tak bisa bekerja sama sekali untuk
-- nomor tak dikenal, dan justru nomor tak dikenal yang paling mungkin
-- membanjiri webhook berulang kali.
--
-- Yang dilindungi tetap utuh: begitu `company_id` terisi (lewat
-- `tandaiDiproses`), barisnya hanya terlihat tenant itu.
-- ============================================================================

-- Policy permisif tanpa syarat dari 258 diganti — bukan ditumpuk. Membiarkannya
-- berarti policy restriktif di bawah tak pernah menyempitkan apa pun yang
-- terlihat lewat jalur itu.
DROP POLICY IF EXISTS wa_masuk_kelola ON wa_pesan_masuk_dedup;

-- Permissive: gerbang dasar. Tanpa satu pun policy permissive, tabel ber-RLS
-- mati total — restrictive hanya MEMPERSEMPIT, tak pernah memberi akses.
CREATE POLICY wa_masuk_dasar ON wa_pesan_masuk_dedup
  FOR ALL USING (true) WITH CHECK (true);

-- Restrictive: axis company. Inilah yang benar-benar membatasi.
DROP POLICY IF EXISTS tenant_isolation ON wa_pesan_masuk_dedup;
CREATE POLICY tenant_isolation ON wa_pesan_masuk_dedup
  AS RESTRICTIVE FOR ALL
  USING (company_id IS NULL OR company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id IS NULL OR company_id = (SELECT auth_company_id()));

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE
  n_restrictive int;
  n_permisif_telanjang int;
BEGIN
  SELECT count(*) INTO n_restrictive
    FROM pg_policies
   WHERE tablename = 'wa_pesan_masuk_dedup'
     AND policyname = 'tenant_isolation'
     AND permissive = 'RESTRICTIVE';
  IF n_restrictive <> 1 THEN
    RAISE EXCEPTION '259 gagal: tenant_isolation tidak terpasang sebagai RESTRICTIVE';
  END IF;

  -- Policy permisif TANPA syarat tak boleh jadi satu-satunya penjaga. Yang
  -- diperiksa: masih adakah `USING (true)` permissive yang TIDAK diimbangi
  -- restrictive? (Setelah blok di atas, jawabannya harus tidak.)
  SELECT count(*) INTO n_permisif_telanjang
    FROM pg_policies
   WHERE tablename = 'wa_pesan_masuk_dedup'
     AND permissive = 'PERMISSIVE'
     AND coalesce(qual, 'true') = 'true'
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies p2
        WHERE p2.tablename = 'wa_pesan_masuk_dedup'
          AND p2.permissive = 'RESTRICTIVE'
     );
  IF n_permisif_telanjang > 0 THEN
    RAISE EXCEPTION '259 gagal: masih ada policy permisif tanpa syarat yang tak diimbangi';
  END IF;

  -- Baris tanpa tenant WAJIB tetap bisa ditulis — tanpa ini, dedup untuk nomor
  -- tak dikenal mati, dan justru nomor tak dikenal yang membanjiri webhook.
  INSERT INTO wa_pesan_masuk_dedup (pesan_id, nomor, company_id)
  VALUES ('uji-259-null', '628000000002', NULL);
  DELETE FROM wa_pesan_masuk_dedup WHERE pesan_id = 'uji-259-null';
END $$;
