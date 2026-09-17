-- ============================================================================
-- 577 — `progress:create` — izin MENCATAT progres, terpisah dari MENGELOLA
-- ============================================================================
--
-- ── Kenapa izin BARU, bukan memakai yang ada
--
-- `POST /projects/:id/progress-logs` adalah satu-satunya rute TULIS yang
-- tersisa tanpa gerbang peran (R-023). Memasang `progress:manage` di sana
-- terlihat seperti jawabannya, dan itu SALAH — diukur 2026-09-14:
--
--     siapa yang MENCATAT progres     pm 249 · mandor 24 · admin 1
--     pemegang `progress:manage`      admin · direktur ·
--                                     project_manager_senior · site_manager
--
-- `pm` dan `mandor` — yang mengerjakan 273 dari 274 pencatatan — TIDAK
-- memegangnya. Memasangnya akan memutus hampir seluruh pemakaian nyata, dan
-- gejalanya *"kok saya tak bisa lapor progres"* tanpa satu pun galat yang
-- menyebut izin.
--
-- Itu arah gagal yang persis diperingatkan R-020, hanya berbalik: izin yang
-- terlalu KETAT menghilangkan fungsi dari orang yang berhak, dan itu sama
-- mahalnya dengan gerbang yang bocor.
--
-- ── Kenapa MENCATAT dan MENGELOLA harus terpisah
--
-- `progress:manage` juga mengizinkan MENGHAPUS log (`DELETE
-- /progress-logs/:logId` memeriksanya). Dua kewenangan yang berbeda sifat:
--
--   mencatat  → menambah fakta lapangan; salah catat bisa dikoreksi dengan
--               catatan berikutnya
--   menghapus → membuang fakta yang sudah masuk bubble-up rab_items →
--               kategori → proyek → Kurva S → EVM (SPI/CPI)
--
-- Menyatukannya berarti tiap mandor yang boleh melapor juga boleh menghapus
-- laporan orang lain.
--
-- ── Yang diberikan, dan kenapa TIDAK ke semua peran
--
-- `progress:create` diberikan ke peran yang memang mencatat progres
-- (`pm`, `mandor`) DAN ke pemegang `progress:manage` yang sudah ada —
-- supaya tak ada yang KEHILANGAN kemampuan yang hari ini ia punya.
--
-- `client` sengaja TIDAK diberi: ia tak pernah mencatat progres satu kali
-- pun, dan angka progres yang bisa ditulis pihak luar adalah angka yang
-- dipakai menagih termin.
--
-- ⚠ Diberikan ke SELURUH tenant, bukan hanya template. Diukur: 438 baris
-- `roles` bernama peran-peran itu. Memberi hanya ke template berarti tenant
-- yang sudah berjalan tak mendapatkannya, dan gerbangnya menolak mereka
-- semua — kegagalan yang muncul hanya di produksi.
-- ============================================================================

INSERT INTO public.permissions (key, module, label, description, sort_order)
VALUES (
  'progress:create',
  'reports',
  'Catat Progress Log',
  'Mencatat progres lapangan. Terpisah dari progress:manage yang juga '
    || 'mengizinkan MENGHAPUS log — menghapus membuang fakta yang sudah masuk '
    || 'Kurva S dan EVM.',
  39
)
ON CONFLICT (key) DO NOTHING;

/*
  Diberikan ke peran yang MENCATAT hari ini + pemegang `progress:manage`.
  `ON CONFLICT DO NOTHING` membuatnya idempoten, dan tak menyentuh peran lain.
*/
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.roles r
  CROSS JOIN public.permissions p
 WHERE p.key = 'progress:create'
   AND (
     r.name IN ('pm', 'mandor', 'admin', 'direktur',
                'project_manager_senior', 'site_manager')
     OR EXISTS (
       SELECT 1 FROM public.role_permissions rp
         JOIN public.permissions pm2 ON pm2.id = rp.permission_id
        WHERE rp.role_id = r.id AND pm2.key = 'progress:manage'
     )
   )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
--
-- Memeriksa DUA arah. Yang pertama saja tak cukup: izin yang ADA tetapi tak
-- dipegang siapa pun adalah kunci hantu — ia menolak SEMUA orang tanpa gejala
-- (kelas yang dijaga `audit-izin-benar-ada.mjs`).
DO $$
DECLARE
  n_izin    INT;
  n_pm      INT;
  n_mandor  INT;
  n_client  INT;
BEGIN
  SELECT count(*) INTO n_izin FROM public.permissions WHERE key = 'progress:create';
  IF n_izin <> 1 THEN
    RAISE EXCEPTION '577 gagal: kunci progress:create tak terbentuk';
  END IF;

  SELECT count(*) INTO n_pm
    FROM public.roles r
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
   WHERE r.name = 'pm' AND p.key = 'progress:create';

  SELECT count(*) INTO n_mandor
    FROM public.roles r
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
   WHERE r.name = 'mandor' AND p.key = 'progress:create';

  IF n_pm = 0 OR n_mandor = 0 THEN
    RAISE EXCEPTION
      '577 gagal: pm (%) / mandor (%) tak memegang progress:create — '
      'gerbangnya akan menolak 273 dari 274 pencatatan progres yang nyata.',
      n_pm, n_mandor;
  END IF;

  /* client TAK BOLEH memegangnya — angka progres dipakai menagih termin. */
  SELECT count(*) INTO n_client
    FROM public.roles r
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
   WHERE r.name = 'client' AND p.key = 'progress:create';

  IF n_client > 0 THEN
    RAISE EXCEPTION
      '577 gagal: % peran `client` memegang progress:create — angka progres '
      'yang bisa ditulis pihak luar adalah angka yang dipakai menagih termin.',
      n_client;
  END IF;

  RAISE NOTICE '577 OK — progress:create: pm % · mandor % · client 0', n_pm, n_mandor;
END $$;
