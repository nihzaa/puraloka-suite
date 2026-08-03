-- ============================================================================
-- 180 — F2-3 BATCH 3: isolasi tenant untuk `permission_scopes`.
--
-- ══════════════════════════════════════════════════════════════════════════
-- CELAH YANG DITUTUP
-- ══════════════════════════════════════════════════════════════════════════
--
-- `permission_scopes` menyimpan PEMBATASAN IZIN per-user: siapa boleh apa,
-- dibatasi ke lingkup mana (`scope_type`, `scope_value`). Policy-nya:
--
--     permission_scopes_read  USING (auth.role() IN ('authenticated','service_role'))
--
-- Artinya SETIAP user terautentikasi dari tenant mana pun bisa membaca
-- seluruh isinya. Bukan cuma metadata: ia memberi tahu siapa saja yang punya
-- izin apa di perusahaan lain, dan sampai mana batasnya.
--
-- Nol baris hari ini. Itu bukan alasan menunda — begitu fitur pembatasan
-- lingkup dipakai, kebocorannya lahir bersama baris pertamanya, dan tak ada
-- yang akan memeriksanya lagi saat itu.
--
-- ── Kenapa tak tertangkap klasifikasi F2-2
--
-- Alat klasifikasi menandainya kategori C lewat rantai
-- `permission_scopes → users → roles`. Rantai itu MENEMBUS `users`, yang
-- ADR-011 D5 tetapkan GLOBAL — satu orang bisa jadi anggota beberapa company.
--
-- Tenant sebuah baris karenanya TIDAK BISA disimpulkan dari siapa user-nya.
-- Alat sudah diperbaiki (rantai kini menolak lewat `users` sama sekali,
-- bukan cuma menolak berhenti di sana), dan perbaikan itu memindahkan LIMA
-- tabel lain ke rantai yang benar lewat `work_scopes` — kelimanya ternyata
-- sudah terisolasi. `permission_scopes` satu-satunya yang benar-benar telanjang.
--
-- ── Bentuk tenancy yang dipilih
--
-- `permission_scopes` TIDAK diberi `company_id`. Alasannya sama dengan yang
-- membuat rantai lewat `users` salah: pembatasan izin melekat pada
-- KEANGGOTAAN, bukan pada orang.
--
-- Yang menentukan tenant sebuah baris adalah: apakah user-nya anggota company
-- yang sedang aktif. Itu sudah punya tabelnya sendiri — `company_members`.
-- ============================================================================

DO $$
DECLARE v_permissive int;
BEGIN
  -- RESTRICTIVE sendirian MEMATIKAN tabel (T1-F3, migrasi 131).
  SELECT count(*) INTO v_permissive
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'permission_scopes'
     AND permissive = 'PERMISSIVE';

  IF v_permissive = 0 THEN
    RAISE EXCEPTION '180: permission_scopes tak punya policy PERMISSIVE. '
                    'Menambah RESTRICTIVE sekarang akan MEMATIKAN tabel.';
  END IF;
END $$;

DROP POLICY IF EXISTS tenant_isolation ON permission_scopes;

-- Baris hanya terlihat bila user-nya anggota AKTIF company yang sedang aktif.
--
-- `EXISTS` atas `company_members`, bukan kolom `company_id` sendiri: satu
-- pembatasan izin bisa relevan di beberapa company bila orangnya anggota
-- keduanya, dan menyalin barisnya per-company akan membuat pencabutan harus
-- ingat menyentuh semuanya.
--
-- WITH CHECK memakai syarat yang sama — menulis pembatasan izin untuk orang
-- di luar company aktif berarti mengubah kewenangan di perusahaan lain.
CREATE POLICY tenant_isolation ON permission_scopes
  AS RESTRICTIVE FOR ALL
  USING (EXISTS (
    SELECT 1 FROM company_members cm
     WHERE cm.user_id = permission_scopes.user_id
       AND cm.company_id = (SELECT auth_company_id())
       AND cm.is_active
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM company_members cm
     WHERE cm.user_id = permission_scopes.user_id
       AND cm.company_id = (SELECT auth_company_id())
       AND cm.is_active
  ));

DO $$ BEGIN
  RAISE NOTICE '180: permission_scopes terisolasi lewat company_members. '
               'Tenancy melekat pada KEANGGOTAAN, bukan pada orang.';
END $$;
