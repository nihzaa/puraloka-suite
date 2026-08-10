-- ============================================================================
-- 265 — `rag_cari_vektor`: bukti tenant yang BEKERJA di jalur nyata
-- ============================================================================
--
-- ── Saya salah di 264
--
-- Fungsi itu menolak permintaan yang `p_company`-nya berbeda dari
-- `auth_company_id()`. Niatnya benar; jalurnya tidak.
--
-- `auth_company_id()` (migrasi 126) membaca GUC `app.company_id` atau jatuh ke
-- keanggotaan `auth_user_id()`. KEDUANYA kosong pada klien service-role — dan
-- itulah klien yang dipakai `TenantDb.raw`, satu-satunya jalan memanggil RPC
-- di repo ini. `TenantDb` menegakkan tenancy di QUERY BUILDER, tak pernah lewat
-- session GUC (diukur: nol `set_config` di `utils/tenant-db.ts`).
--
-- Akibatnya fungsi 264 mengembalikan NOL BARIS untuk SETIAP pemanggilan yang
-- sah. Bukan kebocoran — kebalikannya: fitur yang mati total.
--
-- Yang membuatnya nyaris lolos: test isolasinya HIJAU. Ia hijau karena tak ada
-- yang bisa dikembalikan, bukan karena saringannya bekerja. Mutasi yang
-- menemukannya — mencabut `auth_company_id()` dari fungsi 264 tetap hijau.
-- "Nol baris karena aman" dan "nol baris karena rusak" terlihat identik dari
-- luar, dan hanya assertion `> 0` pada jalur SAH yang bisa memisahkannya.
--
-- ── Bukti tenant yang dipakai sekarang
--
-- `p_user` + `p_company` diperiksa terhadap `company_members`: pemanggil wajib
-- ANGGOTA AKTIF perusahaan yang ia klaim. Itu sumber kebenaran yang sama yang
-- dipakai login web dan sesi WhatsApp (`wa-sesi.ts`) — satu pencabutan
-- keanggotaan menutup semua jalur sekaligus.
--
-- Ia tetap tak memercayai argumen begitu saja: `p_company` sendirian tak cukup,
-- ia harus BERPASANGAN dengan user yang benar-benar anggotanya.
-- ============================================================================

DROP FUNCTION IF EXISTS rag_cari_vektor(uuid, text, text[], boolean, int);

CREATE OR REPLACE FUNCTION rag_cari_vektor(
  p_company        UUID,
  p_user           UUID,
  p_embed          TEXT,
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
SET search_path = public, pg_temp
AS $$
BEGIN
  /*
   * Keanggotaan AKTIF wajib dibuktikan. Nol baris kalau tidak — bukan galat:
   * galat memberi tahu penyerang bahwa tenant itu ada.
   */
  IF NOT EXISTS (
    SELECT 1 FROM company_members cm
     WHERE cm.company_id = p_company
       AND cm.user_id = p_user
       AND cm.is_active
  ) THEN
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
   ORDER BY r.embedding <=> p_embed::vector
   LIMIT greatest(1, least(p_batas, 100));   -- batas atas dipaku di SQL (I-3)
END $$;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE
  def text;
  v_comp UUID;
  v_user UUID;
  n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE p.proname = 'rag_cari_vektor' AND ns.nspname = 'public';

  IF def IS NULL THEN
    RAISE EXCEPTION '265 gagal: fungsi tidak terbentuk';
  END IF;
  IF def ILIKE '%security definer%' THEN
    RAISE EXCEPTION '265 gagal: SECURITY DEFINER akan melewati RLS';
  END IF;
  IF def NOT ILIKE '%company_members%' THEN
    RAISE EXCEPTION '265 gagal: keanggotaan tidak dibuktikan';
  END IF;
  IF def NOT ILIKE '%company_id = p_company%' THEN
    RAISE EXCEPTION '265 gagal: company_id tidak ada di WHERE (T-2)';
  END IF;
  IF def ILIKE '%file_url%' THEN
    RAISE EXCEPTION '265 gagal: fungsi menyentuh file_url (T-5)';
  END IF;

  -- `auth_company_id()` TIDAK BOLEH kembali: ia kosong di klien service-role,
  -- dan itulah yang mematikan fungsi 264.
  IF def ILIKE '%auth_company_id%' THEN
    RAISE EXCEPTION '265 gagal: auth_company_id() kembali — ia kosong di jalur RPC nyata';
  END IF;

  -- ── Bukan-anggota WAJIB mendapat NOL baris ────────────────────────────────
  SELECT c.id INTO v_comp FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1;
  SELECT u.id INTO v_user FROM users u
   WHERE NOT EXISTS (
     SELECT 1 FROM company_members m WHERE m.user_id = u.id AND m.company_id = v_comp
   ) LIMIT 1;

  IF v_comp IS NOT NULL AND v_user IS NOT NULL THEN
    SELECT count(*) INTO n FROM rag_cari_vektor(
      v_comp, v_user, (SELECT '[' || string_agg('0', ',') || ']'
                         FROM generate_series(1, 1536)), NULL, false, 5);
    IF n <> 0 THEN
      RAISE EXCEPTION '265 gagal: bukan-anggota mendapat % baris', n;
    END IF;
  END IF;
END $$;
