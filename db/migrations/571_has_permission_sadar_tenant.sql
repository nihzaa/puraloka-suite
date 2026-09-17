-- ============================================================================
-- 571 — `has_permission` sadar tenant: migrasi 372 tercatat jalan, separuhnya
--       tak berlaku
-- ============================================================================
--
-- ── Cara ini ditemukan
--
-- Bukan dari gejala. Gejalanya TIDAK ADA. Ditemukan 2026-09-13 oleh penjaga
-- yang lahir dari cacat migrasi 111 (lihat 570):
--
--     node apps/api/scripts/audit-badan-fungsi-mutakhir.mjs
--
-- Migrasi 372 mendefinisikan DUA fungsi dengan perbaikan yang sama bentuknya:
-- `get_role_permissions` dan `has_permission`. Diukur hari ini:
--
--     get_role_permissions  → badan migrasi 372/522 ADA di basis   ✅
--     has_permission        → badan di basis versi LAMA            ❌
--
-- Satu migrasi, dua fungsi, satu berlaku satu tidak. Bentuk yang sama dengan
-- 111: buku migrasi menyatakan 372 JALAN, nama fungsinya ada, dan `ledger-
-- diff.mjs` menyatakannya TERBUKTI-FISIK — sebab ia memeriksa NAMA.
--
-- ── Yang salah pada badan yang hidup di basis
--
--     JOIN roles r ON rp.role_id = r.id
--     WHERE r.name = auth_role()          ← tanpa saringan tenant, tanpa LIMIT
--
-- `roles` bukan tabel global. Diukur 2026-09-13: **73 baris bernama `admin`**,
-- satu per tenant — dan 72 di antaranya milik perusahaan LAIN. Karena
-- pembungkusnya `EXISTS`, izin yang dipegang salinan `admin` tenant MANA PUN
-- menjawab `true` untuk admin SEMUA tenant.
--
-- Yang dimaksudkan migrasi 372 (dan yang sudah berlaku di saudaranya):
-- saring per tenant, template ikut, salinan tenant MENANG, lalu `LIMIT 1`.
--
-- ── ⚠ SEBERAPA PARAH — DIUKUR, BUKAN DITAKSIR
--
-- Pengukuran pertama saya menyimpulkan ini kebocoran izin lintas tenant yang
-- aktif. **Itu keliru, dan koreksinya penting** supaya migrasi ini tak dibaca
-- sebagai tambalan kebocoran yang sedang terjadi:
--
--     izin yang TIDAK dimiliki semua 73 salinan admin : NIHIL
--
-- Ketujuh puluh tiga salinan `admin` hari ini punya himpunan izin yang
-- IDENTIK. Selama itu benar, `EXISTS` atas 73 baris menjawab sama dengan
-- `EXISTS` atas 1 baris — jadi **tak ada eskalasi yang bisa terjadi hari
-- ini**, dan tak ada satu pun kejadian yang perlu ditelusuri.
--
-- Yang membuatnya tetap wajib ditutup: keidentikan itu bukan invarian yang
-- dijaga apa pun. Ia kebetulan — akibat semua tenant lahir dari template
-- yang sama dan belum ada yang menyesuaikan perannya. Dan MENYESUAIKAN PERAN
-- PER TENANT ADALAH FITUR PRODUK INI (ADR-004: peran = data konfigurasi
-- per-tenant, bukan konstanta).
--
-- Jadi cacat ini menunggu pemakaian yang normal dan memang dirancang: tenant
-- pertama yang mencabut satu izin dari `admin`-nya tidak akan kehilangan izin
-- itu — 72 salinan lain tetap menjawab `true` untuknya. Pencabutan yang
-- tampak berhasil di layar dan tak berlaku. Nol galat, di 350 policy RLS.
--
-- ── Kenapa verifikasi migrasi 372 sendiri tidak menangkapnya
--
-- Blok verifikasinya memanggil `get_role_permissions('admin')` — fungsi yang
-- BERHASIL diganti — dan tak pernah memanggil `has_permission`. Verifikasi
-- yang jujur atas separuh pekerjaannya sendiri. Karena itu blok di bawah
-- menguji fungsi INI, dengan data yang membedakan versi lama dari versi baru.
-- ============================================================================

CREATE OR REPLACE FUNCTION has_permission(permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM role_permissions rp
    JOIN permissions p ON rp.permission_id = p.id
    WHERE p.key = permission_key
      AND rp.role_id = (
        SELECT r.id FROM roles r
         WHERE r.name = auth_role()
           AND (
             auth_company_id() IS NULL
             OR r.company_id = auth_company_id()
             OR r.company_id IS NULL
           )
         ORDER BY (r.company_id IS NULL), r.company_id
         LIMIT 1
      )
  )
$function$;

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
--
-- Menguji BENTUK badannya, bukan keberadaan fungsinya — persis cacat yang
-- membuat 372 lolos tanpa berlaku separuhnya.
--
-- Dua penanda yang membedakan versi baru dari versi lama, dan keduanya wajib:
--   · `LIMIT 1`            — versi lama mengizinkan SELURUH baris senama;
--   · `auth_company_id()`  — versi lama tak menyebut tenant sama sekali.
--
-- ⚠ Sengaja TIDAK menuntut jumlah izin tertentu. Pelajaran tertulis di
-- migrasi 372 sendiri: ambang 100 di sana pernah HARD FAIL pada basis bersih
-- karena menuntut hasil pekerjaan migrasi berikutnya (378). Yang dijamin
-- berkas ini bentuk resolusi perannya, bukan isi katalog izin.
--
-- ⚠ `current_schema()`, BUKAN `'public'` dipaku — dan itu koreksi, bukan
-- gaya. Versi pertama berkas ini menyalin `CREATE … FUNCTION public.
-- has_permission` verbatim dari migrasi 372, dan `audit-migrasi-skema-
-- dipaku.mjs` memerahkannya. Penjaga itu benar: skema yang dipaku membuat
-- perbaikan TAK PERNAH sampai ke schema `test`, sehingga tak bisa
-- diverifikasi test apa pun — persis cacat yang diperbaiki migrasi 165 untuk
-- `fn_kasbon_approved_create_expense`, dan yang tanpa sadar saya warisi
-- dengan menyalin bentuk lamanya.
DO $$
DECLARE
  n_ok INT;
BEGIN
  SELECT count(*) INTO n_ok
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = current_schema()
     AND p.proname = 'has_permission'
     AND p.prosrc LIKE '%auth_company_id()%'
     AND p.prosrc LIKE '%LIMIT 1%';

  IF n_ok < 1 THEN
    RAISE EXCEPTION
      '571 gagal: has_permission di schema % TIDAK sadar tenant — badan masih '
      'versi lama (tanpa auth_company_id()/LIMIT 1). Izin satu tenant akan '
      'menjawab true untuk tenant lain begitu himpunan izinnya berbeda.',
      current_schema();
  END IF;

  RAISE NOTICE '571 OK — has_permission (schema %) menyaring tenant lalu LIMIT 1', current_schema();
END $$;
