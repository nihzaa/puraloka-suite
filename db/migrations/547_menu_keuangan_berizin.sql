-- ============================================================================
-- 547 — Sembilan menu KEUANGAN tampil ke semua orang, termasuk klien
-- ============================================================================
--
-- ── Keputusan yang dijalankan (R-020, tahap 1 dari beberapa)
--
-- Founder menyerahkan keputusannya. Yang dipilih: **isi izinnya bertahap
-- per modul**, dimulai dari yang paling menyinggung bila dibuka klien —
-- BUKAN membalik kebijakan bawaan sidebar.
--
-- Alasannya bisa diukur. Membalik `sidebar.tsx:616` (kosong = sembunyikan)
-- akan menutup 116 menu sekaligus — termasuk dari admin yang berhak,
-- sampai ke-116 selesai diisi. Gejalanya "menu saya hilang" tanpa satu pun
-- galat, dan itu lebih buruk daripada pintu buntu yang sedang diperbaiki.
--
-- ── Cacat yang ditutup
--
-- `apps/web/components/sidebar.tsx:616`:
--
--     if (!node.required_permissions || node.required_permissions.length === 0)
--       return true;
--
-- Daftar izin KOSONG berarti "tampilkan ke semua". Diukur:
--
--     menu aktif                    191
--     TANPA required_permissions    116
--     klien (8 izin) MELIHAT        121 dari 191
--
-- ⚠ DATANYA AMAN — yang bocor PINTU, bukan isi. Diperiksa sebelum
-- disimpulkan: `finance.ts` memagari rutenya dengan
-- `requirePermission('finance:view:all')`, dan klien tak memegangnya. Klien
-- yang menekan menu itu DITOLAK API.
--
-- Tapi pintu yang tampil lalu menolak mengajari orang bahwa aplikasinya
-- memang suka gagal — dan saat suatu hari ada rute yang LUPA dipagari, tak
-- seorang pun menyadarinya karena menu buntu sudah jadi hal biasa.
--
-- ── Izin diambil dari GERBANG rutenya, bukan ditebak
--
-- Diukur dari `requirePermission` di rute API:
--
--     finance.ts       finance:view:all (4) · finance:invoice:create (4)
--     cash.ts          cash:view · cash:account:manage
--     gl.ts            gl:view (7)
--     procurement.ts   procurement:view (11)
--
-- Yang dipakai izin PALING LONGGAR di modulnya (`:view` bila ada), sengaja.
-- Menu adalah PINTU, bukan gerbang — gerbangnya tetap di rute. Izin menu
-- yang terlalu ketat MENGHILANGKAN menu dari orang yang berhak membukanya,
-- dan gejalanya "menu saya kok tidak ada" tanpa satu pun galat: kelas cacat
-- yang sama dengan yang diperbaiki, hanya berbalik arah.
--
-- Diukur: `finance:view` dipegang admin + direktur (template) — cukup untuk
-- menutup pintu dari klien, tanpa menutupnya dari yang berhak.
--
-- ── Yang TIDAK dikerjakan di sini
--
-- Sisa ~107 menu (lapangan, mutu, sistem) menyusul di migrasi berikutnya.
-- Sengaja bertahap: satu modul per migrasi bisa diperiksa mata manusia,
-- 116 sekaligus tidak.
--
-- Idempoten — hanya menyentuh baris yang MASIH kosong. Verifikasi di blok
-- akhir (pola migrasi 142).

UPDATE menu_items SET required_permissions = v.izin
  FROM (VALUES
    ('/keuangan/arus-kas',        ARRAY['finance:view']),
    ('/keuangan/contingency',     ARRAY['finance:view']),
    ('/keuangan/cvr',             ARRAY['finance:view']),
    ('/keuangan/ipc',             ARRAY['finance:view']),
    ('/keuangan/kasbon',          ARRAY['finance:view', 'mandor:kasbon:create']),
    ('/keuangan/pembayaran',      ARRAY['finance:view']),
    ('/keuangan/profitabilitas',  ARRAY['finance:view:all']),
    ('/piutang',                  ARRAY['finance:view:all']),
    ('/procurement/hutang',       ARRAY['procurement:view'])
  ) AS v(jalur, izin)
 WHERE menu_items.href = v.jalur
   AND (menu_items.required_permissions IS NULL
     OR array_length(menu_items.required_permissions, 1) IS NULL);

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_sisa   INT;
  n_hantu  INT;
  v_hantu  TEXT;
  n_klien  INT;
BEGIN
  -- Kesembilan menu harus terisi (bila menunya memang ada di basis ini).
  SELECT count(*) INTO n_sisa
    FROM menu_items
   WHERE is_active
     AND href IN ('/keuangan/arus-kas','/keuangan/contingency','/keuangan/cvr',
                  '/keuangan/ipc','/keuangan/kasbon','/keuangan/pembayaran',
                  '/keuangan/profitabilitas','/piutang','/procurement/hutang')
     AND (required_permissions IS NULL OR array_length(required_permissions,1) IS NULL);

  IF n_sisa > 0 THEN
    RAISE EXCEPTION '547 gagal: % menu keuangan masih tanpa izin', n_sisa;
  END IF;

  /*
    Kunci izin HANTU menolak SEMUA orang tanpa gejala — pelajaran migrasi
    531 dan penjaga `audit-izin-benar-ada`. Diperiksa di sini supaya yang
    merah migrasi ini, bukan halaman kosong di layar orang besok.
  */
  SELECT count(*), string_agg(DISTINCT x.p, ', ') INTO n_hantu, v_hantu
    FROM (SELECT unnest(required_permissions) AS p FROM menu_items
           WHERE href IN ('/keuangan/arus-kas','/keuangan/contingency','/keuangan/cvr',
                          '/keuangan/ipc','/keuangan/kasbon','/keuangan/pembayaran',
                          '/keuangan/profitabilitas','/piutang','/procurement/hutang')) x
   WHERE NOT EXISTS (SELECT 1 FROM permissions pp WHERE pp.key = x.p);

  IF n_hantu > 0 THEN
    RAISE EXCEPTION '547 gagal: % kunci izin HANTU: %', n_hantu, v_hantu;
  END IF;

  -- Yang sesungguhnya dituju: klien tak lagi melihat kesembilan pintu itu.
  SELECT count(*) INTO n_klien
    FROM menu_items m
   WHERE m.is_active
     AND m.href IN ('/keuangan/arus-kas','/keuangan/contingency','/keuangan/cvr',
                    '/keuangan/ipc','/keuangan/kasbon','/keuangan/pembayaran',
                    '/keuangan/profitabilitas','/piutang','/procurement/hutang')
     AND EXISTS (
       SELECT 1 FROM unnest(m.required_permissions) k
        WHERE k IN (SELECT p.key FROM roles r
                      JOIN role_permissions rp ON rp.role_id = r.id
                      JOIN permissions p ON p.id = rp.permission_id
                     WHERE r.name = 'client' AND r.company_id IS NULL));

  IF n_klien > 0 THEN
    RAISE EXCEPTION '547 gagal: klien MASIH melihat % menu keuangan', n_klien;
  END IF;

  RAISE NOTICE '547 OK: 9 menu keuangan berizin · nol kunci hantu · klien nol pintu';
END $$;
