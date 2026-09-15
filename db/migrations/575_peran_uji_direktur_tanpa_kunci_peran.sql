-- ============================================================================
-- 575 — R-022: peran uji `direktur_uji` — punya izin uang, TANPA kunci peran
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- Dua berkas test menuntut SATU akun (`uji.direktur@puraloka.test`) dalam
-- keadaan BERLAWANAN, dan keduanya benar:
--
--   `anti-lockout-wiring`  menuntut `users:roles:manage` dipegang TEPAT SATU
--                          role ber-user aktif — skenario "pemegang terakhir",
--                          satu-satunya keadaan yang membuat uji lockout
--                          bermakna
--   `authz-endpoints`      menuntut ADA pengguna aktif ber-peran `direktur`,
--                          untuk menguji gerbang tiga endpoint UANG
--
-- Role `direktur` memegang `users:roles:manage` (diukur ke `role_permissions`,
-- bukan ditebak dari nama jabatan). Jadi:
--
--     akun AKTIF    → pemegang jadi 2 → `anti-lockout` gagal prasyarat
--     akun NONAKTIF → `authz-endpoints` gagal, tiga endpoint uang tak teruji
--
-- Hari ini ia NONAKTIF, dan itulah sebabnya `authz-endpoints` merah.
--
-- ── Kenapa peran BARU, bukan salah satu jalan yang lebih pendek
--
-- Dua jalan yang lebih pendek dan keduanya ditolak:
--
-- 1. **Menaikkan izin `pm`** supaya spek-nya tak butuh `direktur`. Ditolak,
--    dan alasannya sudah tertulis di kepala `authz-endpoints.test.ts` sendiri:
--    *"`finance:invoice:pay` memindahkan uang, dan memperluas kewenangan demi
--    kehijauan test menukar pengendalian internal dengan kenyamanan."*
--
-- 2. **Mencabut `users:roles:manage` dari `direktur`.** Itu mengubah
--    kewenangan NYATA sebuah jabatan di seluruh tenant — keputusan produk,
--    bukan efek samping perbaikan test.
--
-- Yang dikerjakan di sini tak menyentuh keduanya: peran BARU yang hanya
-- dipakai test, memegang izin yang sama dengan `direktur` KECUALI
-- `users:roles:manage`.
--
-- ⚠ Kenapa menyalin SELURUH izin `direktur`, bukan cuma tiga yang dipakai
-- spek hari ini: `authz-endpoints` tumbuh — 2026-08-31 tiga spek dipindah ke
-- `direktur` dan daftar peran yang ditulis tangan langsung tertinggal.
-- Peran yang cuma punya tiga izin akan memaksa migrasi baru tiap kali spek
-- bertambah. Yang disalin adalah "direktur, minus satu kunci".
--
-- ── Kenapa ini tak melemahkan `anti-lockout`
--
-- Prasyaratnya menghitung role yang memegang `users:roles:manage` DAN punya
-- user aktif. `direktur_uji` sengaja TIDAK memegangnya, jadi berapa pun akun
-- aktif yang memakainya, hitungan itu tak bergerak.
--
-- Dijaga blok verifikasi di bawah: kalau suatu saat seseorang menyalin ulang
-- izin `direktur` tanpa mengecualikan kuncinya, migrasi ini gagal keras.
-- ============================================================================

DO $$
DECLARE
  v_company  UUID;
  v_sumber   UUID;
  v_baru     UUID;
  n_izin     INT;
BEGIN
  /*
    Dipasang HANYA di company tempat akun uji peran hidup. Menyalin peran ini
    ke seluruh tenant berarti menaburkan peran uji ke data pelanggan.
  */
  SELECT r.company_id, r.id INTO v_company, v_sumber
    FROM public.roles r
    JOIN public.companies co ON co.id = r.company_id
   WHERE r.name = 'direktur' AND co.code = 'puraloka-persada'
   LIMIT 1;

  IF v_sumber IS NULL THEN
    RAISE NOTICE '575: role `direktur` di tenant utama tak ada — DILEWATI (schema bersih)';
    RETURN;
  END IF;

  /*
    ⚠ Predikat `WHERE company_id IS NOT NULL` WAJIB disebut. Keunikannya
    adalah index PARSIAL (`roles_company_name_uniq`), dan `ON CONFLICT
    (company_id, name)` polos TIDAK cocok dengannya — Postgres menolak dengan
    "no unique or exclusion constraint matching". Kelas yang sama dengan
    predikat `ON CONFLICT (ref_id) WHERE ref_id IS NOT NULL` di migrasi 100.
  */
  /*
    Bentuk barisnya DISALIN dari `direktur` (portal, warna, urutan), bukan
    ditulis tangan: `label` NOT NULL dan `portal` menentukan di mana peran itu
    muncul. Menebak nilainya berarti peran uji tampil di tempat yang salah —
    dan `is_builtin` sengaja `false` supaya `protect_builtin_roles` tak
    menahannya bila kelak dihapus.
  */
  INSERT INTO public.roles (company_id, name, label, description, portal, color, sort_order, is_builtin)
  SELECT v_company, 'direktur_uji', r.label || ' (uji)',
         '[UJI] Salinan direktur TANPA users:roles:manage — R-022. '
         'Dipakai authz-endpoints.test.ts supaya anti-lockout-wiring tetap '
         'punya pemegang TERAKHIR. Jangan diberikan ke pengguna nyata.',
         r.portal, r.color, r.sort_order, false
    FROM public.roles r WHERE r.id = v_sumber
  ON CONFLICT (company_id, name) WHERE company_id IS NOT NULL DO NOTHING;

  SELECT id INTO v_baru FROM public.roles
   WHERE company_id = v_company AND name = 'direktur_uji';

  /*
    Izin disalin dari `direktur`, MINUS kunci peran. Idempoten: jalan kedua
    tak menambah apa pun, dan izin yang ditambahkan ke `direktur` kelak tak
    ikut tersalin — itu disengaja, supaya peran uji tak diam-diam tumbuh.
  */
  /*
    ⚠ `company_id` sengaja TIDAK diisi — mengikuti kenyataan, bukan intuisi.
    Diukur 2026-09-14: SELURUH 60.736 baris `role_permissions` ber-`company_id
    NULL`, dan tenancy-nya diturunkan lewat `roles.company_id`. Mengisi kolom
    itu di sini akan membuat baris ini satu-satunya yang berbeda bentuk, dan
    `tenant_isolation` pada tabel ini memperlakukan NULL sebagai milik-bersama
    (migrasi 131 §AB) — jadi nilai yang "lebih benar" justru menyimpang.
  */
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_baru, rp.permission_id
    FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
   WHERE rp.role_id = v_sumber
     AND p.key <> 'users:roles:manage'
  ON CONFLICT (role_id, permission_id) DO NOTHING;

  SELECT count(*) INTO n_izin
    FROM public.role_permissions WHERE role_id = v_baru;

  RAISE NOTICE '575: direktur_uji siap — % izin (direktur minus users:roles:manage)', n_izin;
END $$;

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
--
-- Memeriksa DUA hal, dan yang kedua yang menjaga maksud berkas ini: peran uji
-- ini TAK BOLEH memegang kunci peran. Verifikasi yang hanya memastikan
-- perannya ADA akan hijau pada keadaan yang justru merusak `anti-lockout`.
DO $$
DECLARE
  v_baru   UUID;
  n_kunci  INT;
  n_uang   INT;
BEGIN
  SELECT r.id INTO v_baru
    FROM public.roles r JOIN public.companies co ON co.id = r.company_id
   WHERE r.name = 'direktur_uji' AND co.code = 'puraloka-persada';

  IF v_baru IS NULL THEN
    RAISE NOTICE '575: direktur_uji tak dibuat (tenant utama tak ada) — verifikasi dilewati';
    RETURN;
  END IF;

  SELECT count(*) INTO n_kunci
    FROM public.role_permissions rp JOIN public.permissions p ON p.id = rp.permission_id
   WHERE rp.role_id = v_baru AND p.key = 'users:roles:manage';

  IF n_kunci > 0 THEN
    RAISE EXCEPTION
      '575 gagal: direktur_uji MEMEGANG users:roles:manage — prasyarat '
      'anti-lockout-wiring (pemegang TERAKHIR) langsung rusak begitu akun uji '
      'memakainya. Itu justru yang berkas ini hindari.';
  END IF;

  SELECT count(*) INTO n_uang
    FROM public.role_permissions rp JOIN public.permissions p ON p.id = rp.permission_id
   WHERE rp.role_id = v_baru
     AND p.key IN ('finance:invoice:create', 'finance:invoice:pay', 'mandor:kasbon:approve');

  IF n_uang <> 3 THEN
    RAISE EXCEPTION
      '575 gagal: direktur_uji cuma memegang % dari 3 izin uang yang diuji '
      'authz-endpoints — spek-nya akan 403 atas gerbang yang bekerja benar.', n_uang;
  END IF;

  RAISE NOTICE '575 OK — direktur_uji: 3 izin uang ADA, kunci peran TIDAK';
END $$;
