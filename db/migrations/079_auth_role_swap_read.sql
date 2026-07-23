-- Migration 079: users.role enum → FK (Sub-Fase 1B.4, FASE 2 SWAP READ)
-- ⚠️ RED-LINE #1 — lanjutan DANGER GATE (Opsi A penuh).
--
-- SWAP READ: auth_role() kini resolve dari roles.name via role_id (bukan kolom enum).
-- Return value TETAP TEXT nama role yang sama → SEMUA RLS policy & get_role_permissions
-- (yang query roles.name = auth_role()) bekerja tanpa diubah. Ini titik pivot read path.
--
-- Prasyarat: FASE 1 EXPAND (078) sudah applied — setiap user punya role_id benar.
-- Rollback: re-create auth_role() versi lama (baca kolom `role` enum) — enum masih ada.

-- auth_role() sekarang baca nama role dari FK. COALESCE ke enum sebagai jaring
-- pengaman: jika role_id entah kenapa NULL (harusnya mustahil pasca-078 guard),
-- jatuh ke enum `role` — TIDAK PERNAH mengembalikan NULL yang bisa membuka/menutup
-- RLS secara tak terduga.
CREATE OR REPLACE FUNCTION auth_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(r.name, u.role::text)
  FROM users u
  LEFT JOIN roles r ON r.id = u.role_id
  WHERE u.auth_id = auth.uid()
$$;

-- auth_user_id() tidak berubah (tidak menyentuh role).
