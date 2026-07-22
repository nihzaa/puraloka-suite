-- Migration 062: has_permission() SQL function — sumber kebenaran otorisasi
-- tunggal yang dibaca RLS (Epic 4) dengan pola yang sama seperti requirePermission
-- di API layer (get_role_permissions RPC). ADR-004: RLS berhenti mengenal literal
-- nama role, hanya permission.
--
-- Menutup gap terbesar Phase 1A: RLS (migration 049) selama ini NOL referensi ke
-- role_permissions (migration 050). Setelah ini, role kustom yang dibuat via
-- POST /api/v1/roles otomatis mendapat cakupan RLS yang benar (tidak lagi nol).
--
-- Purely additive: hanya CREATE FUNCTION, tidak menyentuh policy manapun di sini.
-- Policy per tabel dimigrasikan bertahap (expand-contract) di migration berikutnya.

CREATE OR REPLACE FUNCTION has_permission(permission_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM role_permissions rp
    JOIN roles r       ON rp.role_id = r.id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE r.name = auth_role()      -- role user saat ini (dari JWT via auth.uid())
      AND p.key = permission_key
  )
$$;

COMMENT ON FUNCTION has_permission(TEXT) IS
  'RLS authorization: TRUE jika role user saat ini (auth_role()) punya permission_key di role_permissions. Fail-closed: FALSE untuk key tak dikenal (ADR-004). STABLE + SECURITY DEFINER, dibaca RLS policy menggantikan literal role check.';
