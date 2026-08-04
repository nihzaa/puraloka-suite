-- ============================================================================
-- SHIM `auth.*` — untuk Postgres TANPA Supabase (R-009 opsi C)
--
-- ⚠️ BELUM DIPAKAI. Disimpan karena SUDAH TERBUKTI, bukan karena sudah perlu.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA BERKAS INI ADA PADAHAL BELUM DIPAKAI
-- ══════════════════════════════════════════════════════════════════════════
--
-- Catatan Fase 0 menolak "Postgres lokal per shard" dengan alasan *"butuh shim
-- `auth.*`"* — dan alasan itu diterima bertahun tanpa pernah diukur.
--
-- Diukur 2026-08-04:
--
--   auth.role()   60x di migrasi, HANYA dibandingkan dengan 'authenticated'
--                 dan 'service_role'
--   auth.uid()    13x
--   auth.users    NOL query — hanya disebut di komentar
--
-- Permukaannya DUA FUNGSI. Seluruh pembungkus repo ini (`auth_role()`,
-- `auth_user_id()`, `auth_company_id()`) bermuara ke `auth.uid()` saja.
--
-- Yang mahal ternyata BUKAN shim-nya, melainkan datanya: 32 berkas test
-- bergantung pada user seed nyata. Itu sebabnya opsi C ditunda — bukan karena
-- shim-nya sulit. Perbedaan itu penting, dan sekarang tercatat.
--
-- ══════════════════════════════════════════════════════════════════════════
-- DUA CACAT YANG KETAHUAN KARENA DIUJI, BUKAN DIBACA
-- ══════════════════════════════════════════════════════════════════════════
--
-- 1. `''::json` MELEMPAR GALAT. Saat klaim kosong (kasus anon),
--    `current_setting(...)::json` gagal — bukan mengembalikan NULL. Jadi
--    `NULLIF(..., '')` harus DULU, baru `::json`.
--
-- 2. `current_setting('role')` mengembalikan **'none'**, bukan NULL, saat tak
--    disetel. Tanpa ditangani, `auth.role() = 'authenticated'` putus dan
--    SELURUH policy menolak — tabel terlihat kosong tanpa satu pun galat.
--
-- Hasil uji terhadap Postgres nyata:
--
--   impersonasi : uid OK · role OK
--   anon        : uid NULL OK · role = anon
--
-- ══════════════════════════════════════════════════════════════════════════
-- CARA MEMAKAI (saat pemicunya tiba)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Jalankan SEBELUM replay migrasi, di database Postgres polos:
--
--   psql "$URL" -f apps/api/src/test-utils/auth-shim.sql
--
-- Pemicu yang disepakati (RATIFIKASI R-009): antrean CI melewati 30 menit,
-- ATAU dua orang mengerjakan repo ini bersamaan.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS auth;

-- Membaca `request.jwt.claims` (JSON) — bentuk yang dipakai `rls-harness.ts`
-- DAN Supabase sungguhan. Bentuk lama `request.jwt.claim.sub` tetap didukung
-- sebagai cadangan supaya harness lama tak putus.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(
    COALESCE(
      -- NULLIF DULU, baru ::json — string kosong bukan JSON yang sah (cacat #1).
      NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
      current_setting('request.jwt.claim.sub', true)
    ), ''
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'role', ''),
    -- 'none' = tak disetel, dan itu berarti anon (cacat #2).
    NULLIF(NULLIF(current_setting('role', true), ''), 'none'),
    'anon'
  )
$$;

COMMENT ON FUNCTION auth.uid() IS
  'Shim untuk Postgres tanpa Supabase. Lihat header auth-shim.sql — dua cacat '
  'yang ketahuan hanya karena diuji tercatat di sana.';
