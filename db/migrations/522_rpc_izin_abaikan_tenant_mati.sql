-- ============================================================================
-- 522 — `get_role_permissions` tak boleh membaca role milik tenant NONAKTIF
-- ============================================================================
-- Ditemukan `mitra.test.ts` 2026-08-30, dan akibatnya jauh lebih luas daripada
-- satu test yang merah.
--
-- ── Yang terjadi
--
-- RPC ini memilih SATU baris role dari beberapa yang bernama sama:
--
--     WHERE r.name = role_name
--       AND (auth_company_id() IS NULL OR r.company_id = auth_company_id()
--            OR r.company_id IS NULL)
--     ORDER BY (r.company_id IS NULL), r.company_id
--     LIMIT 1
--
-- Tanpa konteks tenant — dan API SELALU memanggilnya lewat service_role, jadi
-- `auth_company_id()` NULL — SELURUH baris bernama itu memenuhi syarat.
-- Diukur: 73 baris bernama `admin`. `ORDER BY … company_id LIMIT 1` lalu
-- memilih yang UUID-nya terkecil.
--
-- Baris yang menang: role `admin` milik **PT Uji Auth Id Null** — company
-- NONAKTIF, sisa uji, nol proyek, nol anggota.
--
-- Jadi setiap pemeriksaan izin di API dijawab dari role milik perusahaan MATI,
-- bukan perusahaan penggunanya. Selama izinnya kebetulan sama, tak ada gejala
-- apa pun. Begitu berbeda — seperti `mitra:daftar_hitam` — pengguna ditolak
-- atas izin yang sebenarnya ia punya, atau lebih buruk, DIIZINKAN atas izin
-- yang seharusnya tidak.
--
-- ── Perbaikannya
--
-- Baris milik tenant NONAKTIF dikeluarkan dari pemilihan. Template
-- (`company_id IS NULL`) TETAP ikut — ia memang cetakan bersama dan tak punya
-- company untuk dinilai aktif-tidaknya.
--
-- Urutannya TIDAK diubah: salinan tenant tetap menang atas template saat
-- konteksnya ada. Yang berubah hanya himpunan yang boleh ikut diurutkan.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_role_permissions(role_name TEXT)
RETURNS TABLE (permission_key TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.key
  FROM permissions p
  JOIN role_permissions rp ON rp.permission_id = p.id
  WHERE rp.role_id = (
    SELECT r.id FROM roles r
     LEFT JOIN companies c ON c.id = r.company_id
     WHERE r.name = role_name
       AND (
         auth_company_id() IS NULL
         OR r.company_id = auth_company_id()
         OR r.company_id IS NULL
       )
       -- Tenant NONAKTIF dikeluarkan: rolenya tak boleh menjawab pemeriksaan
       -- izin milik siapa pun. Template (company_id NULL) tetap ikut.
       AND (r.company_id IS NULL OR c.is_active)
     ORDER BY (r.company_id IS NULL), r.company_id
     LIMIT 1
  )
$$;

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_pemenang UUID; v_aktif BOOLEAN; v_n INT;
BEGIN
  -- Baris yang kini dipilih untuk `admin` tanpa konteks tenant.
  SELECT r.id, COALESCE(c.is_active, true) INTO v_pemenang, v_aktif
    FROM roles r LEFT JOIN companies c ON c.id = r.company_id
   WHERE r.name = 'admin'
     AND (r.company_id IS NULL OR c.is_active)
   ORDER BY (r.company_id IS NULL), r.company_id
   LIMIT 1;

  IF v_pemenang IS NULL THEN
    RAISE EXCEPTION '522 gagal: nol baris role `admin` yang layak dipilih';
  END IF;
  IF NOT v_aktif THEN
    RAISE EXCEPTION '522 gagal: baris terpilih masih milik tenant NONAKTIF';
  END IF;

  -- Dan RPC-nya harus tetap memulangkan izin, bukan himpunan kosong —
  -- fungsi yang "aman" tapi menolak semua orang sama rusaknya.
  SELECT count(*) INTO v_n FROM get_role_permissions('admin');
  IF v_n = 0 THEN
    RAISE EXCEPTION '522 gagal: get_role_permissions(admin) memulangkan NOL izin';
  END IF;
END $$;
