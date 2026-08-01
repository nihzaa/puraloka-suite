-- Migration 150: policy PERMISSIVE untuk 4 tabel aset — memperbaiki 149
--
-- ══════════════════════════════════════════════════════════════════════════
-- CACAT YANG DIPERBAIKI: tabel mati total
-- ══════════════════════════════════════════════════════════════════════════
--
-- Migrasi 149 memasang `tenant_isolation` sebagai **RESTRICTIVE** pada keempat
-- tabel aset, tapi TIDAK memasang satu pun policy permissive.
--
-- Di PostgreSQL keduanya digabung sebagai:
--     (semua RESTRICTIVE) AND (ada satu PERMISSIVE yang lolos)
--
-- Himpunan permissive yang KOSONG bernilai FALSE. Jadi hasilnya:
--     restrictive AND FALSE = FALSE
--
-- Artinya keempat tabel **tak terbaca oleh siapa pun** lewat jalur non-service
-- role — bukan "kurang aman", melainkan mati total. Dan cacatnya SENYAP: API
-- tetap bekerja sempurna hari ini karena memakai `service_role` yang mem-bypass
-- RLS. Ia baru muncul saat T5c (lepas service_role) dikerjakan, dan saat itu
-- gejalanya adalah "halaman aset kosong tanpa error" — jenis kegagalan yang
-- paling lama dilacak.
--
-- Ditemukan oleh `t5a-policy-tenant.test.ts` dan `t7-exit-criteria-l2.test.ts`,
-- bukan oleh review. Keduanya memang dibangun untuk kelas cacat ini — dan ini
-- pembuktian pertamanya pada tabel yang benar-benar baru lahir.
--
-- 149 TIDAK disunting: ia sudah tercatat di `schema_migrations` dan sudah
-- dijalankan. Mengubah isinya membuat riwayat berbohong pada lingkungan yang
-- benar-benar pernah menjalankannya. Perbaikan datang sebagai migrasi maju.

BEGIN;

-- `assets` & `asset_rentals` — kategori B, dijaga langsung.
DROP POLICY IF EXISTS assets_baca ON assets;
CREATE POLICY assets_baca ON assets
  FOR SELECT TO authenticated
  USING ((SELECT has_permission('assets:view')));

DROP POLICY IF EXISTS assets_kelola ON assets;
CREATE POLICY assets_kelola ON assets
  FOR ALL TO authenticated
  USING ((SELECT has_permission('assets:manage')))
  WITH CHECK ((SELECT has_permission('assets:manage')));

DROP POLICY IF EXISTS asset_rentals_baca ON asset_rentals;
CREATE POLICY asset_rentals_baca ON asset_rentals
  FOR SELECT TO authenticated
  USING ((SELECT has_permission('assets:view')));

DROP POLICY IF EXISTS asset_rentals_kelola ON asset_rentals;
CREATE POLICY asset_rentals_kelola ON asset_rentals
  FOR ALL TO authenticated
  USING ((SELECT has_permission('assets:manage')))
  WITH CHECK ((SELECT has_permission('assets:manage')));

-- `asset_movements` & `asset_depreciation_logs` — kategori C (lewat `assets`).
-- Permission-nya sama; batas tenant sudah ditegakkan RESTRICTIVE dari 149.
DROP POLICY IF EXISTS asset_movements_baca ON asset_movements;
CREATE POLICY asset_movements_baca ON asset_movements
  FOR SELECT TO authenticated
  USING ((SELECT has_permission('assets:view')));

DROP POLICY IF EXISTS asset_movements_kelola ON asset_movements;
CREATE POLICY asset_movements_kelola ON asset_movements
  FOR ALL TO authenticated
  USING ((SELECT has_permission('assets:manage')))
  WITH CHECK ((SELECT has_permission('assets:manage')));

DROP POLICY IF EXISTS asset_dep_baca ON asset_depreciation_logs;
CREATE POLICY asset_dep_baca ON asset_depreciation_logs
  FOR SELECT TO authenticated
  USING ((SELECT has_permission('assets:view')));

DROP POLICY IF EXISTS asset_dep_kelola ON asset_depreciation_logs;
CREATE POLICY asset_dep_kelola ON asset_depreciation_logs
  FOR ALL TO authenticated
  USING ((SELECT has_permission('assets:manage')))
  WITH CHECK ((SELECT has_permission('assets:manage')));

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT; n INT;
BEGIN
  FOREACH t IN ARRAY ARRAY['assets','asset_movements','asset_depreciation_logs','asset_rentals'] LOOP
    SELECT count(*) INTO n FROM pg_policies
     WHERE tablename = t AND permissive = 'PERMISSIVE';
    IF n = 0 THEN
      RAISE EXCEPTION '150 GAGAL: % masih nol policy permissive — tabel tetap mati total', t;
    END IF;

    -- Sekaligus memastikan yang restriktif dari 149 tak ikut terhapus:
    -- permissive TANPA restrictive = batas tenant hilang, kebalikan cacatnya.
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE tablename = t AND policyname = 'tenant_isolation'
                      AND permissive = 'RESTRICTIVE') THEN
      RAISE EXCEPTION '150 GAGAL: tenant_isolation restriktif hilang dari %', t;
    END IF;
  END LOOP;

  RAISE NOTICE '150 OK: 4 tabel aset kini punya permissive + restrictive — terbaca DAN ter-scope';
END $$;

COMMIT;
