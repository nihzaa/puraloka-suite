-- ============================================================================
-- 363 — ROLE JADI MILIK TENANT, bukan katalog global yang dipakai bersama
-- ============================================================================
--
-- ── Yang founder tanyakan, 2026-08-14
--
--   "masa role di ERP konstruksi besar cuma segini? carikan role role apa aja
--    yang pantas atau harus ada? lalu tambahkan ke db dan sesuaikan hak
--    aksesnya"
--
-- Diukur sebelum menjawab: **5 role** (admin, direktur, pm, mandor, client)
-- terhadap **218 permission di 48 domain**. Founder benar — kosakata izinnya
-- sudah kaya, yang kurang justru rolenya.
--
-- Tapi menambah role saja akan mengulang cacat yang lebih dalam, dan itu yang
-- dikerjakan migrasi INI lebih dulu.
--
-- ── Cacat yang harus dibereskan sebelum role ditambah
--
--   roles_name_key = UNIQUE (name)      ← global
--   roles.company_id                    ← SELURUHNYA NULL
--
-- Artinya kelima role itu **dipakai bersama semua tenant**, padahal ADR-004
-- menyatakan peran adalah *data konfigurasi per-tenant*. `company_members`
-- sudah benar (company_id, user_id, role_id) dan `auth_role()` (migrasi 144)
-- sudah membaca peran per-company — tapi KATALOGnya masih satu untuk semua.
--
-- Akibatnya baru terasa saat tenant kedua berisi data nyata: PT A menambah
-- role "Manajer Proyek Senior", dan PT B ikut melihatnya di daftar rolenya
-- sendiri. Tak ada galat; hanya bocor.
--
-- Founder memilih **per-tenant sejak awal** (2026-08-14) justru karena alasan
-- itu: memperbaikinya sekarang, saat seluruh isi basis masih dummy, jauh lebih
-- murah daripada sesudah tenant kedua punya data.
--
-- ── JEBAKAN yang hampir saya lewatkan
--
--   notification_rule_targets_role_name_fkey
--     FOREIGN KEY (role_name) REFERENCES roles(name) ON UPDATE CASCADE
--
-- FK ini menunjuk ke **NAMA**, bukan id — dan ada 16 baris terisi. Membuang
-- `UNIQUE (name)` menjatuhkan FK-nya, dan aturan notifikasi kehilangan
-- targetnya TANPA satu pun galat: barisnya tetap ada, tujuannya tak lagi
-- terjamin.
--
-- Maka urutannya: FK dilepas → unique diganti → FK dipasang kembali ke bentuk
-- yang sah. Karena `roles.name` tak lagi unik sendirian, FK lama TIDAK BISA
-- dipulihkan apa adanya; penggantinya adalah CHECK lewat trigger yang menuntut
-- (company_id, role_name) benar-benar ada. Detailnya di bagian 3.
--
-- ── Yang TIDAK diubah
--
-- `users.role_id` (peran global lama) sengaja dibiarkan. Migrasi 144 sudah
-- menjadikannya fallback TERAKHIR di `auth_role()`, dan membuangnya akan
-- mengunci keluar pengguna yang belum punya baris `company_members`.
-- Mengunci orang keluar dari sistemnya sendiri adalah kegagalan yang lebih
-- besar daripada peran yang kurang presisi.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Kolom penanda: role bawaan sistem vs buatan tenant
-- ------------------------------------------------------------
-- `is_builtin` sudah ada. Yang belum ada: cara membedakan "baris template
-- global" dari "salinan milik tenant". Sesudah migrasi ini, company_id NULL
-- berarti TEMPLATE — dipakai sebagai sumber salinan, tak pernah di-assign
-- langsung ke orang.
ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.roles.is_template IS
  'true = baris katalog global (company_id NULL) yang disalin ke tiap tenant; '
  'tak pernah di-assign langsung ke pengguna.';

-- ------------------------------------------------------------
-- 2. UNIQUE per-tenant, bukan global
-- ------------------------------------------------------------
DO $$
BEGIN
  -- FK ke roles(name) dilepas DULU — ia bergantung pada unique yang akan
  -- diganti, dan Postgres akan menolak DROP-nya selama FK masih menunjuk.
  -- ⚠ SKEMA WAJIB DISEBUT. Basis ini punya `test.roles` — skema bayangan
  -- dari test isolasi tenant — dan ia punya `roles_name_key` sendiri.
  -- `pg_constraint` tanpa saringan skema melihat KEDUANYA, jadi pemeriksaan
  -- "sudah terlepas belum?" akan selamanya menjawab "belum" karena yang
  -- terbaca adalah constraint milik skema lain.
  --
  -- Saya tertipu ini sekali pada 2026-08-14: migrasi melaporkan
  -- "UNIQUE(name) global masih terpasang" padahal DROP-nya berhasil.
  IF EXISTS (
    SELECT 1 FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE con.conname = 'notification_rule_targets_role_name_fkey'
       AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.notification_rule_targets
      DROP CONSTRAINT notification_rule_targets_role_name_fkey;
    RAISE NOTICE '363: FK notification_rule_targets.role_name dilepas sementara';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE con.conname = 'roles_name_key' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.roles DROP CONSTRAINT roles_name_key;
    RAISE NOTICE '363: UNIQUE(name) global dilepas';
  END IF;
END $$;

-- Template global: satu nama sekali saja di antara baris ber-company_id NULL.
-- Partial unique index, bukan constraint — `company_id IS NULL` tak bisa
-- diungkapkan lewat UNIQUE biasa (NULL tak pernah sama dengan NULL).
CREATE UNIQUE INDEX IF NOT EXISTS roles_template_name_uniq
  ON public.roles (name) WHERE company_id IS NULL;

-- Milik tenant: satu nama sekali per company. Inilah yang membuat PT A dan
-- PT B boleh sama-sama punya "Manajer Proyek" tanpa saling melihat.
CREATE UNIQUE INDEX IF NOT EXISTS roles_company_name_uniq
  ON public.roles (company_id, name) WHERE company_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. Pengganti FK role_name — trigger, bukan FOREIGN KEY
-- ------------------------------------------------------------
-- FK tak bisa dipulihkan apa adanya: `roles.name` sendirian tak lagi unik.
-- Yang bisa dijamin adalah pasangannya — (company_id, role_name) pada baris
-- target harus benar-benar menunjuk role yang dimiliki company itu.
--
-- Ini LEBIH ketat daripada FK lama, bukan lebih longgar: dulu aturan
-- notifikasi PT A boleh menunjuk nama role yang sebenarnya milik PT B, karena
-- namanya global. Sekarang tak bisa.
CREATE OR REPLACE FUNCTION public.cek_target_role_setenant()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.role_name IS NULL THEN
    RETURN NEW;   -- target berbasis permission/pengguna, bukan peran
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.roles r
     WHERE r.name = NEW.role_name
       AND (r.company_id = NEW.company_id OR r.company_id IS NULL)
  ) THEN
    RAISE EXCEPTION
      'Peran "%" tidak ada pada badan usaha ini — aturan notifikasi tak boleh menunjuk peran milik tenant lain',
      NEW.role_name;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_target_role_setenant ON public.notification_rule_targets;
CREATE TRIGGER trg_target_role_setenant
  BEFORE INSERT OR UPDATE OF role_name, company_id ON public.notification_rule_targets
  FOR EACH ROW EXECUTE FUNCTION public.cek_target_role_setenant();

-- ------------------------------------------------------------
-- 4. Lima role lama jadi TEMPLATE
-- ------------------------------------------------------------
-- Tidak dipindah dan tidak diduplikasi ke tiap tenant di sini. 291 baris
-- `companies` di basis ini mayoritas sampah test ([UJI-*]) — menyalin katalog
-- ke semuanya akan membuat ribuan baris role sampah yang harus dibersihkan
-- lagi. Penyalinan dikerjakan migrasi 365 HANYA untuk company yang punya
-- anggota nyata.
UPDATE public.roles SET is_template = true WHERE company_id IS NULL;

-- ------------------------------------------------------------
-- 5. Verifikasi — gagal keras kalau bentuknya tidak seperti yang dimaksud
-- ------------------------------------------------------------
DO $$
DECLARE
  n_tmpl int;
  n_trg  int;
BEGIN
  -- Skema disebut — lihat catatan panjang di bagian 2 soal `test.roles`.
  IF EXISTS (
    SELECT 1 FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE con.conname = 'roles_name_key' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION '363 gagal: UNIQUE(name) global masih terpasang di public.roles';
  END IF;

  IF to_regclass('public.roles_company_name_uniq') IS NULL THEN
    RAISE EXCEPTION '363 gagal: indeks unik per-company tak terbentuk';
  END IF;

  IF to_regclass('public.roles_template_name_uniq') IS NULL THEN
    RAISE EXCEPTION '363 gagal: indeks unik template tak terbentuk';
  END IF;

  SELECT count(*) INTO n_trg
    FROM pg_trigger tg
    JOIN pg_class cl ON cl.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
   WHERE tg.tgname = 'trg_target_role_setenant'
     AND NOT tg.tgisinternal AND n.nspname = 'public';
  IF n_trg = 0 THEN
    RAISE EXCEPTION '363 gagal: pengganti FK role_name tak terpasang — '
                    'aturan notifikasi bisa menunjuk peran yang tak ada';
  END IF;

  SELECT count(*) INTO n_tmpl FROM public.roles WHERE is_template;
  IF n_tmpl < 5 THEN
    RAISE EXCEPTION '363 gagal: hanya % role jadi template, harusnya >= 5', n_tmpl;
  END IF;

  RAISE NOTICE '363: role per-tenant siap · % template · pengganti FK aktif', n_tmpl;
END $$;
