-- Migration 078: users.role enum → FK (Sub-Fase 1B.4, FASE 1 EXPAND)
-- ⚠️ RED-LINE #1 — DANGER GATE disetujui founder (Opsi A penuh, 2026-07-23).
--
-- FASE 1 EXPAND (reversible): tambah role_id FK + backfill dari enum. Read path
-- (auth_role/auth.ts/RPC) TETAP baca kolom `role` enum di fase ini — NOL perubahan
-- behavior. Kolom `role` enum tetap sumber kebenaran sampai FASE 2 SWAP.
--
-- Rollback fase ini: DROP COLUMN role_id — enum `role` masih hidup, nol data hilang.
--
-- Tujuan akhir (setelah SWAP+CONTRACT): role custom (mis. 'direktur' yang sudah ada
-- di tabel `roles` tapi tak bisa di-assign karena enum menolak) menjadi bisa dipakai.

-- 1. Tambah kolom FK nullable (additive, tidak mengganggu apa pun).
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);

-- 2. Backfill: petakan setiap users.role (enum text) → roles.id via roles.name.
UPDATE users u
SET role_id = r.id
FROM roles r
WHERE r.name = u.role::text
  AND u.role_id IS NULL;

-- 3. Index untuk join read path (dipakai mulai FASE 2 SWAP).
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- 4. Guard integritas: setiap user WAJIB punya role_id setelah backfill.
--    Jika ada user dengan role enum yang tak punya padanan di roles → gagal keras
--    (lebih baik migration gagal daripada user tanpa role_id diam-diam).
DO $$
DECLARE missing_count INT;
BEGIN
  SELECT count(*) INTO missing_count FROM users WHERE role_id IS NULL;
  IF missing_count > 0 THEN
    RAISE EXCEPTION 'EXPAND gagal: % user tanpa role_id (roles.name tidak cocok dengan users.role enum). Periksa tabel roles.', missing_count;
  END IF;
END $$;

COMMENT ON COLUMN users.role_id IS 'FK ke roles (Sub-Fase 1B.4 EXPAND). Read path pindah ke sini di FASE 2 SWAP; kolom role enum di-drop di FASE 3 CONTRACT.';

-- CATATAN: dual-write (kode yang set role menulis role + role_id) ditangani di
-- layer aplikasi (routes/v1/auth.ts register + users.ts update role) pada commit
-- yang sama — bukan di trigger DB, agar eksplisit & mudah di-review.
