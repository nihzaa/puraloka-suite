-- ============================================================================
-- 264 — RPC pencarian vektor (TJS-C2, jalur kedua)
-- ============================================================================
--
-- ── Kenapa RPC, bukan query builder
--
-- Operator jarak pgvector (`<=>`) tak bisa diungkapkan lewat PostgREST. Tanpa
-- fungsi ini, satu-satunya jalan adalah menarik SELURUH potongan ke Node lalu
-- menghitung kosinus di sana — yang berarti seluruh isi dokumen tenant lewat
-- jaringan setiap kali seseorang bertanya.
--
-- ── T-2: company_id DI DALAM fungsi, bukan dipercaya dari pemanggil
--
-- RPC melewati `TenantDb`. Kalau fungsi ini hanya memakai `p_company` apa
-- adanya untuk menyaring, satu pemanggil yang mengirim UUID tenant lain
-- mendapat isi dokumen mereka.
--
-- Karena itu fungsinya `SECURITY INVOKER` (bawaan, ditulis eksplisit) dan
-- MEMERIKSA bahwa `p_company` benar-benar company aktif pemanggil lewat
-- `auth_company_id()` — helper yang sama yang dipakai seluruh policy RLS.
-- Argumen yang tak cocok menghasilkan NOL baris, bukan galat: galat
-- membocorkan bahwa tenant itu ada.
--
-- ── Kenapa mengembalikan `isi`, dan TIDAK `file_url` (T-5)
--
-- `documents.ts:138` membuat signed URL berumur 10 TAHUN. Kalau ia sampai ke
-- WhatsApp, ia bertahan setelah hak akses dicabut, di riwayat chat yang di
-- luar kendali kita. Fungsi ini tak pernah menyentuh kolom itu.
-- ============================================================================

CREATE OR REPLACE FUNCTION rag_cari_vektor(
  p_company        UUID,
  p_embed          TEXT,           -- JSON array; di-cast ke vector di dalam
  p_jenis          TEXT[]  DEFAULT NULL,
  p_hanya_visibel  BOOLEAN DEFAULT false,
  p_batas          INT     DEFAULT 20
)
RETURNS TABLE (
  id          UUID,
  document_id UUID,
  doc_type    TEXT,
  urutan      INT,
  isi         TEXT,
  documents   JSONB
)
LANGUAGE plpgsql
SECURITY INVOKER
-- `search_path` dipaku: fungsi tanpa ini bisa dibelokkan ke skema lain yang
-- memuat tabel bernama sama.
SET search_path = public, pg_temp
AS $$
BEGIN
  /*
   * Company aktif pemanggil yang menentukan, BUKAN argumennya.
   *
   * Argumennya tetap diterima supaya pemanggil menyatakan niatnya secara
   * eksplisit (dan penjaga CI bisa memeriksa bahwa ia dikirim), tetapi kalau
   * keduanya berbeda hasilnya NOL baris.
   */
  IF p_company IS DISTINCT FROM auth_company_id() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.id, r.document_id, r.doc_type, r.urutan, r.isi,
         jsonb_build_object('title', d.title) AS documents
    FROM rag_potongan r
    JOIN documents d ON d.id = r.document_id
   WHERE r.company_id = p_company            -- T-2: di WHERE, bukan ikut skor
     AND r.embedding IS NOT NULL
     AND (p_jenis IS NULL OR r.doc_type = ANY (p_jenis))
     AND (NOT p_hanya_visibel OR r.visible_klien)
   -- `<=>` jarak kosinus: makin KECIL makin mirip.
   ORDER BY r.embedding <=> p_embed::vector
   LIMIT greatest(1, least(p_batas, 100));   -- batas atas dipaku di SQL (I-3)
END $$;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE
  n int;
  def text;
BEGIN
  IF to_regprocedure('rag_cari_vektor(uuid,text,text[],boolean,int)') IS NULL THEN
    RAISE EXCEPTION '264 gagal: fungsi tidak terbentuk';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE p.proname = 'rag_cari_vektor' AND ns.nspname = 'public';

  -- SECURITY DEFINER akan MELEWATI RLS — kebalikan dari yang dibutuhkan.
  IF def ILIKE '%security definer%' THEN
    RAISE EXCEPTION '264 gagal: fungsi SECURITY DEFINER — ia akan melewati RLS';
  END IF;

  -- Penyaring tenant WAJIB ada di badan fungsi.
  IF def NOT ILIKE '%auth_company_id()%' THEN
    RAISE EXCEPTION '264 gagal: fungsi tak memeriksa auth_company_id()';
  END IF;
  IF def NOT ILIKE '%company_id = p_company%' THEN
    RAISE EXCEPTION '264 gagal: company_id tidak ada di WHERE (T-2)';
  END IF;

  -- T-5: file_url TAK BOLEH keluar dari fungsi ini.
  IF def ILIKE '%file_url%' THEN
    RAISE EXCEPTION '264 gagal: fungsi menyentuh file_url — signed URL 10 tahun (T-5)';
  END IF;

  -- Batas atas dipaku di SQL, bukan hanya di pemanggil (I-3).
  IF def NOT ILIKE '%least(p_batas%' THEN
    RAISE EXCEPTION '264 gagal: batas baris tidak dipaku di SQL';
  END IF;
END $$;
