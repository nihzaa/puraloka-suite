-- ============================================================================
-- 552 — MENU untuk halaman Langganan
-- ============================================================================
--
-- Halaman `/pengaturan/langganan` (portal tagihan pelanggan) dibangun tanpa
-- satu pun tautan menuju ke sana. `audit-nav-yatim.mjs` menangkapnya:
--
--     ❌ YATIM — halaman jadi tanpa satu pun tautan nav: 1
--          /pengaturan/langganan
--
-- Halaman yang hanya bisa dibuka dengan mengetik URL sama saja dengan tak
-- ada. Dan halaman INI khususnya: ia dituju dari pesan "akun dibatasi" dan
-- dari halaman modul terkunci — orang yang sampai ke sana sedang mencari
-- jalan keluar, bukan sedang menjelajah.
--
-- ── Kenapa di `g-administrasi`
--
-- Diukur ke basis: grup itu memuat Pengguna & Role, Matriks Izin, Rantai
-- Approval, Notifikasi, dan Identitas & Invoice — semuanya pengaturan tingkat
-- perusahaan. Langganan termasuk kategori yang sama.
--
-- ── Kenapa TANPA `modul_kunci`
--
-- Menu ini SENGAJA tak bermodul (migrasi 548 mengisi `modul_kunci` untuk grup
-- berbayar). Menggemboknya berarti mengunci pelanggan di luar pintu yang ia
-- bayar untuk masuk — dan halaman inilah tempat ia mencari tahu kenapa
-- sesuatu tertutup.
--
-- ── `required_permissions`
--
-- `settings:manage`, cermin `requirePermission` di rutenya. Menu yang
-- tampil untuk orang yang API-nya menolak menghasilkan 403 saat diklik —
-- pengalaman yang terbaca sebagai aplikasi rusak.

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active, kesiapan)
SELECT
  'pengaturan-langganan',
  -- 'Langganan', bukan 'Langganan & Tagihan'.
  --
  -- Diukur dari potret sidebar: label 20 karakter terpotong jadi
  -- "Langganan & Tagi…" — dan yang hilang justru kata yang membedakannya.
  -- Pemotongan itu perilaku normal sidebar (lebarnya 196px), jadi yang
  -- harus menyesuaikan labelnya.
  'Langganan',
  '/pengaturan/langganan',
  'CreditCard',
  (SELECT id FROM menu_items WHERE key = 'g-administrasi'),
  ARRAY['settings:manage'],
  -- ⚠ 1699 — dan angka itu butuh DUA koreksi sebelum benar.
  --
  --   1649  BENTROK dengan 'Situs Publik'. Urutan yang bentrok jatuh ke
  --         tie-break abjad, bukan ke niat siapa pun.
  --   1705  DI LUAR RENTANG. Anak wajib berada di induk+1..induk+99, dan
  --         `g-administrasi` ber-sort_order 1600 → batasnya 1699.
  --
  -- Keduanya ditangkap `audit-sidebar-urutan.mjs`, dan keduanya tak akan
  -- mengeluarkan galat saat dijalankan: menu tetap tersisip, cuma muncul di
  -- urutan yang tak diniatkan siapa pun.
  --
  -- Diukur: slot kelipatan-7 penuh sampai 1698 (Keamanan Akun). 1699 adalah
  -- angka sah terakhir di grup ini, dan menempatkan Langganan di paling bawah.
  1699,
  'main',
  true,
  'hidup'
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'pengaturan-langganan')
  AND EXISTS (SELECT 1 FROM menu_items WHERE key = 'g-administrasi');

-- ============================================================================
-- VERIFIKASI
-- ============================================================================
DO $$
DECLARE v_ada INT; v_induk UUID; v_modul TEXT; v_izin TEXT[];
BEGIN
  SELECT count(*) INTO v_ada FROM menu_items WHERE key = 'pengaturan-langganan';
  IF v_ada <> 1 THEN
    -- Menyisipkan tanpa induk akan membuat menu ini NAIK ke level teratas
    -- sidebar — terlihat seperti bug acak, bukan seperti kelupaan.
    RAISE EXCEPTION '552 gagal: menu pengaturan-langganan tak tersisip (ada %). Induk g-administrasi ada?', v_ada;
  END IF;

  SELECT parent_id, modul_kunci, required_permissions
    INTO v_induk, v_modul, v_izin
    FROM menu_items WHERE key = 'pengaturan-langganan';

  IF v_induk IS NULL THEN
    RAISE EXCEPTION '552 gagal: menu tanpa induk — akan muncul di level teratas sidebar';
  END IF;

  -- ⚠ WAJIB tanpa modul. Menggembok halaman langganan mengunci pelanggan di
  -- luar pintu yang ia bayar untuk masuk, dan yang ingin membayar harus
  -- menelepon (kegagalan yang sama dengan Azure invoice terkunci).
  IF v_modul IS NOT NULL THEN
    RAISE EXCEPTION '552 gagal: menu langganan bermodul (%) — jalur pemulihan tak boleh digembok', v_modul;
  END IF;

  IF NOT ('settings:manage' = ANY(v_izin)) THEN
    RAISE EXCEPTION '552 gagal: izin menu tak cocok dengan rutenya — menu yang tampil untuk yang ditolak API menghasilkan 403 saat diklik';
  END IF;

  RAISE NOTICE '552 OK — menu Langganan & Tagihan terpasang di g-administrasi';
END $$;
