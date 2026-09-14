-- ============================================================================
-- 578 — R-020 gelombang 1: sembilan menu UANG & HR kini menuntut izin LIHAT
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- `apps/web/components/sidebar.tsx` memperlakukan daftar izin KOSONG sebagai
-- "tampilkan ke semua":
--
--     if (!node.required_permissions || node.required_permissions.length === 0)
--       return true
--
-- Diukur 2026-09-14: dari 205 menu aktif, 116 tanpa izin, dan peran `client`
-- (8 izin) MELIHAT 122 di antaranya — termasuk pintu ke kas, pajak, upah, dan
-- kasbon.
--
-- ── ⚠ Ini cacat PENGALAMAN, bukan kebocoran data
--
-- Dinyatakan supaya tak dibaca lebih gawat daripada yang sebenarnya: rutenya
-- berpagar `requirePermission`, jadi klien yang menekan menu itu DITOLAK API.
-- Datanya tak pernah keluar.
--
-- Yang dirusaknya kepercayaan: 116 pintu yang tampil lalu menolak mengajari
-- orang bahwa aplikasi ini memang suka gagal — dan saat suatu hari ada satu
-- rute yang LUPA dipagari, tak seorang pun menyadarinya, sebab menu buntu
-- sudah jadi hal biasa.
--
-- (Arah yang lebih berbahaya — API yang TIDAK menolak — ditutup R-023.)
--
-- ── Kenapa izin ini DIPILIH, bukan diturunkan otomatis
--
-- R-020 mencatat percobaan menurunkan izin dari gerbang rute API, dan
-- hasilnya tak layak pakai. Diukur ulang hari ini, usul otomatisnya:
--
--     /kas/akun        → cash:account:manage   MANAGE untuk halaman LIHAT
--     /mandor/kasbon   → mandor:assign         izin MENUGASKAN, bukan melihat
--     /kas/pengeluaran → 4 izin campur, termasuk approve
--
-- Izin yang terlalu KETAT menghilangkan menu dari orang yang berhak, dan
-- gejalanya "menu saya kok tidak ada" tanpa satu pun galat — kelas cacat yang
-- sama dengan yang sedang diperbaiki, hanya berbalik arah.
--
-- Yang dipasang di bawah izin LIHAT yang memang ada di katalog, dipilih
-- per-menu. Pemegangnya diperiksa lebih dulu (5–9 peran template masing-
-- masing, termasuk yang jelas berhak), dan **`client` tak memegang satu pun**
-- — itu yang membuat kesembilan pintu ini tertutup baginya.
--
-- ⚠ Hanya menu UANG & HR di gelombang ini. Sisanya (107) menunggu, sebab tiap
-- menu butuh pemilihan tersendiri dan sembilan cukup kecil untuk diperiksa
-- satu per satu.
-- ============================================================================

DO $$
DECLARE
  pasangan CONSTANT text[][] := ARRAY[
    ARRAY['/kas',                     'cash:view'],
    ARRAY['/kas/akun',                'cash:view'],
    ARRAY['/kas/pengeluaran',         'cash:view'],
    ARRAY['/kas/rekonsiliasi',        'rekonsiliasi:view'],
    ARRAY['/kas/transfer',            'cash:view'],
    ARRAY['/laporan?tab=pajak',       'finance:tax:view'],
    ARRAY['/mandor/kasbon',           'mandor:view'],
    ARRAY['/mandor/upah',             'mandor:view'],
    ARRAY['/procurement/kualifikasi', 'procurement:view']
  ];
  i INT;
BEGIN
  FOR i IN 1 .. array_length(pasangan, 1) LOOP
    /*
      Hanya menu yang BELUM punya izin yang disentuh. Menu yang sudah
      dikonfigurasi seseorang tak boleh ditimpa migrasi.
    */
    UPDATE public.menu_items
       SET required_permissions = ARRAY[pasangan[i][2]]
     WHERE href = pasangan[i][1]
       AND (required_permissions IS NULL
            OR array_length(required_permissions, 1) IS NULL);
  END LOOP;
END $$;

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
--
-- Memeriksa DUA arah, dan yang kedua yang menjaga maksud berkas ini.
--
-- Arah pertama saja (menu punya izin) akan hijau bahkan bila izinnya salah
-- pilih — dan izin yang salah menghilangkan menu dari orang yang berhak.
DO $$
DECLARE
  n_kosong  INT;
  n_klien   INT;
  n_hantu   INT;
BEGIN
  /* 1. Kesembilan menu itu WAJIB sudah berizin. */
  SELECT count(*) INTO n_kosong
    FROM public.menu_items
   WHERE href IN ('/kas','/kas/akun','/kas/pengeluaran','/kas/rekonsiliasi',
                  '/kas/transfer','/laporan?tab=pajak','/mandor/kasbon',
                  '/mandor/upah','/procurement/kualifikasi')
     AND is_active
     AND (required_permissions IS NULL
          OR array_length(required_permissions, 1) IS NULL);

  IF n_kosong > 0 THEN
    RAISE EXCEPTION '578 gagal: % menu uang/HR masih tanpa izin', n_kosong;
  END IF;

  /* 2. Kunci yang dipasang WAJIB ada di katalog izin — kunci hantu menolak
        SEMUA orang tanpa gejala (kelas `audit-izin-benar-ada.mjs`). */
  SELECT count(*) INTO n_hantu
    FROM public.menu_items m
    CROSS JOIN LATERAL unnest(m.required_permissions) AS k(kunci)
   WHERE m.href IN ('/kas','/kas/akun','/kas/pengeluaran','/kas/rekonsiliasi',
                    '/kas/transfer','/laporan?tab=pajak','/mandor/kasbon',
                    '/mandor/upah','/procurement/kualifikasi')
     AND NOT EXISTS (SELECT 1 FROM public.permissions p WHERE p.key = k.kunci);

  IF n_hantu > 0 THEN
    RAISE EXCEPTION '578 gagal: % kunci izin tak terdaftar di katalog', n_hantu;
  END IF;

  /* 3. INTI — `client` tak boleh lagi melihat satu pun dari kesembilannya. */
  SELECT count(*) INTO n_klien
    FROM public.menu_items m
   WHERE m.href IN ('/kas','/kas/akun','/kas/pengeluaran','/kas/rekonsiliasi',
                    '/kas/transfer','/laporan?tab=pajak','/mandor/kasbon',
                    '/mandor/upah','/procurement/kualifikasi')
     AND m.is_active
     AND m.required_permissions && (
       SELECT coalesce(array_agg(p.key), ARRAY[]::text[])
         FROM public.roles r
         JOIN public.role_permissions rp ON rp.role_id = r.id
         JOIN public.permissions p ON p.id = rp.permission_id
        WHERE r.name = 'client' AND r.company_id IS NULL
     );

  IF n_klien > 0 THEN
    RAISE EXCEPTION
      '578 gagal: `client` masih melihat % menu uang/HR — izin yang dipilih '
      'ternyata dipegangnya.', n_klien;
  END IF;

  RAISE NOTICE '578 OK — 9 menu uang/HR berizin, nol kunci hantu, client tak melihatnya';
END $$;
