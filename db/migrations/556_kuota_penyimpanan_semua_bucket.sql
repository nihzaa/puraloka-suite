-- ============================================================================
-- 556 — KUOTA PENYIMPANAN: tiga bucket yang terlewat, dan DUA pola jalur
-- ============================================================================
--
-- Migrasi 555 menghitung pemakaian dari tiga bucket: `project-documents`,
-- `project-photos`, `kasbon-photos`. Diukur ke KODE sesudahnya, titik unggah
-- sebenarnya menulis ke ENAM bucket:
--
--     cash.ts           expense-receipts     ← terlewat
--     documents.ts      project-documents
--     finance.ts        payment-proofs       ← terlewat
--     mandor.ts         kasbon-photos
--     progress.ts       project-photos
--     settings.ts       company-assets       ← terlewat
--     termin-payment.ts payment-proofs       ← terlewat
--
-- Berkas di tiga bucket yang terlewat TAK PERNAH TERHITUNG. Kuota lalu
-- terlihat bekerja — ia menolak saat penuh — sambil melewatkan sebagian
-- pemakaian, jadi batas 5 GB sebenarnya entah berapa. Hitungan yang meleset
-- pelan-pelan lebih buruk daripada tak ada hitungan.
--
-- ══════════════════════════════════════════════════════════════════════════
-- DUA POLA JALUR, dan kenapa itu bukan detail
-- ══════════════════════════════════════════════════════════════════════════
--
-- Diukur dari kode yang menyusun nama objeknya:
--
--     <uuid PROYEK>/…      project-documents · project-photos · kasbon-photos
--     <uuid COMPANY>/…     expense-receipts · payment-proofs · company-assets
--
--       cash.ts:469      `${request.companyId}/receipts/…`
--       finance.ts:1280  `${request.companyId}/invoices/${id}/…`
--       settings.ts:607  `${request.companyId}/logo/…`
--
-- Fungsi 555 hanya mengenal pola pertama. Kalau tiga bucket itu ditambahkan
-- begitu saja ke daftar, JOIN-nya ke `projects` tak pernah cocok — objeknya
-- tetap tak terhitung, dan daftarnya cuma terlihat lebih lengkap.
--
-- Jadi keduanya dihitung terpisah lalu dijumlahkan.
--
-- ⚠ `company-assets` IKUT dihitung meski ia logo perusahaan, bukan data
-- proyek: ia diunggah pelanggan lewat layar pengaturan, jadi ia pemakaian
-- pelanggan. Yang tetap dikecualikan cuma `situs` — bucket situs publik yang
-- isinya diunggah vendor, bukan tenant.

CREATE OR REPLACE FUNCTION hitung_penyimpanan_tenant(p_company_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
  SELECT
    -- Pola A: nama objek diawali UUID PROYEK.
    coalesce((
      SELECT sum((o.metadata->>'size')::bigint)
        FROM storage.objects o
        JOIN public.projects p
          ON p.id = split_part(o.name, '/', 1)::uuid
       WHERE p.company_id = p_company_id
         AND o.bucket_id IN ('project-documents', 'project-photos', 'kasbon-photos')
         AND split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ), 0)
    +
    -- Pola B: nama objek diawali UUID COMPANY. Tak perlu JOIN — companynya
    -- ada langsung di jalurnya.
    coalesce((
      SELECT sum((o.metadata->>'size')::bigint)
        FROM storage.objects o
       WHERE o.bucket_id IN ('expense-receipts', 'payment-proofs', 'company-assets')
         AND split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND split_part(o.name, '/', 1)::uuid = p_company_id
    ), 0);
$$;

COMMENT ON FUNCTION hitung_penyimpanan_tenant(UUID) IS
  'Total byte yang dipakai satu tenant, dari ENAM bucket dengan DUA pola jalur (diawali uuid proyek, atau diawali uuid company). Dihitung dari storage.objects — bukan tabel penghitung, karena tujuh titik unggah berarti tujuh kesempatan lupa.';

REVOKE ALL ON FUNCTION hitung_penyimpanan_tenant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hitung_penyimpanan_tenant(UUID) TO authenticated, service_role;

-- ============================================================================
-- VERIFIKASI
-- ============================================================================
DO $$
DECLARE
  v_def BOOLEAN; v_src TEXT; v_co UUID; v_hasil BIGINT; v_kurang TEXT;
BEGIN
  SELECT prosecdef, prosrc INTO v_def, v_src
    FROM pg_proc WHERE proname = 'hitung_penyimpanan_tenant';

  IF v_def IS NULL THEN
    RAISE EXCEPTION '556 gagal: fungsi tak ada';
  END IF;
  IF NOT v_def THEN
    RAISE EXCEPTION '556 gagal: bukan SECURITY DEFINER — storage.objects tak terbaca, fungsi memulangkan 0 untuk SEMUA orang';
  END IF;

  -- Keenam bucket WAJIB disebut. Bucket yang hilang membuat berkasnya tak
  -- pernah terhitung — dan kuota yang melewatkan sebagian pemakaian terlihat
  -- persis seperti kuota yang bekerja.
  SELECT string_agg(b, ', ') INTO v_kurang
    FROM unnest(ARRAY[
      'project-documents','project-photos','kasbon-photos',
      'expense-receipts','payment-proofs','company-assets'
    ]) AS b
   WHERE position(b IN v_src) = 0;
  IF v_kurang IS NOT NULL THEN
    RAISE EXCEPTION '556 gagal: bucket tak terhitung: %', v_kurang;
  END IF;

  -- Dijalankan sungguhan — fungsi yang tak pernah dipanggil bisa salah di
  -- cabang yang tak tersentuh.
  SELECT id INTO v_co FROM companies LIMIT 1;
  IF v_co IS NOT NULL THEN
    SELECT hitung_penyimpanan_tenant(v_co) INTO v_hasil;
    IF v_hasil IS NULL THEN
      RAISE EXCEPTION '556 gagal: memulangkan NULL, harusnya 0 bila tak ada berkas';
    END IF;
    RAISE NOTICE '556 OK — 6 bucket, 2 pola jalur; tenant contoh % byte', v_hasil;
  ELSE
    RAISE NOTICE '556 OK — 6 bucket terhitung (nol company untuk diuji)';
  END IF;
END $$;
