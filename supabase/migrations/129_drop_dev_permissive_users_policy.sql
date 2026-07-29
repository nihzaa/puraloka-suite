-- ============================================================
-- 129 — HAPUS policy dev permisif pada `users` (prasyarat T5)
--
-- Temuan schema-diff 4a: policy `"Allow all access on users"` ada di dev TANPA
-- migrasi pembuatnya — artinya ia dibuat manual dan tak pernah tercatat.
--
-- KENAPA BERBAHAYA, dan kenapa harus dibuang SEBELUM T5:
--   Definisinya `FOR ALL USING (true)` — permisif tanpa syarat. Postgres
--   meng-OR seluruh policy PERMISSIVE, jadi ia MENELAN empat policy `users`
--   yang benar (users_admin, users_pm_mandor_select, users_self_select,
--   users_self_update). Selama ia ada, keempatnya tidak berpengaruh apa pun.
--
--   Hari ini efeknya tak terasa karena API memakai service_role (RLS di-bypass
--   total). Ia baru menggigit persis di T5c — saat service_role dilepas dan RLS
--   akhirnya dievaluasi. Di titik itu `users` akan terbuka penuh untuk siapa
--   pun yang terautentikasi, LINTAS company, dan kelihatannya "RLS sudah aktif".
--
-- Aman & reversibel: hanya membuang satu policy yang memang tak pernah
-- dimaksudkan ada. Empat policy sah di bawahnya tetap utuh dan langsung
-- berlaku. Kalau ternyata ada yang bergantung padanya, gejalanya muncul di
-- T5b (test isolasi) — bukan diam-diam.
-- ============================================================

DROP POLICY IF EXISTS "Allow all access on users" ON users;

-- Verifikasi: `users` harus tetap punya policy (RLS aktif + nol policy =
-- tabel mati total — kelas kegagalan T1-F3 yang sudah terbukti empiris).
DO $$
DECLARE v_sisa INT;
BEGIN
  SELECT count(*) INTO v_sisa FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'users';
  IF v_sisa = 0 THEN
    RAISE EXCEPTION
      '129: `users` kehilangan SELURUH policy. RLS aktif tanpa policy permissive '
      '= tabel tak terbaca sama sekali (T1-F3). Migrasi dibatalkan.';
  END IF;
  RAISE NOTICE '129: policy dev dibuang; % policy sah tersisa di users.', v_sisa;
END $$;
