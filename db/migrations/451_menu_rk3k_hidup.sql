-- ════════════════════════════════════════════════════════════════════════════
-- 451 — Menu RK3K dinyalakan: halamannya sudah ada
-- ════════════════════════════════════════════════════════════════════════════
--
-- `hse-rk3k` selama ini `is_active = false` dengan `href = '/m/hse-rk3k'` —
-- jalur singgah untuk menu yang belum punya halaman (aturan 232).
--
-- Per 2026-08-17 halamannya ADA (`/k3/rk3k`) beserta pencetak PDF-nya
-- (`GET /proyek/:id/k3/rk3k.pdf`), jadi syarat singgahnya gugur.
--
-- ── Kenapa izinnya diisi, bukan dibiarkan kosong
--
-- `required_permissions` masih `[]`. Menu ber-izin kosong tampil untuk SEMUA
-- orang, termasuk yang halamannya sendiri akan menolak mereka — dan yang
-- ditolak sesudah mengklik menyimpulkan aplikasinya rusak, bukan bahwa ia
-- memang tak berhak.
--
-- Kuncinya disamakan dengan yang DIPAKAI endpoint-nya (`k3:inspeksi:view`),
-- bukan kunci baru. Kunci `requirePermission` yang tak ada di tabel
-- `permissions` menolak SEMUA orang tanpa gejala — dijaga
-- `audit-izin-benar-ada.mjs`, dan menciptakan kunci di sini akan
-- memerahkannya.
--
-- ── Kenapa idempoten lewat `key`, bukan `id`
--
-- `id` berbeda antar lingkungan (dev/CI/produksi). `key` adalah kontrak yang
-- sama di semuanya.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE menu_items
   SET href = '/k3/rk3k',
       is_active = TRUE,
       required_permissions = ARRAY['k3:inspeksi:view'],
       updated_at = now()
 WHERE key = 'hse-rk3k';

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
  n INT;
BEGIN
  SELECT href, is_active, required_permissions INTO r
    FROM menu_items WHERE key = 'hse-rk3k';

  IF r IS NULL THEN
    RAISE EXCEPTION '451 gagal: menu hse-rk3k tak ditemukan';
  END IF;

  IF r.href <> '/k3/rk3k' OR NOT r.is_active THEN
    RAISE EXCEPTION '451 gagal: menu RK3K masih menunjuk % (aktif=%)', r.href, r.is_active;
  END IF;

  -- Izin kosong = menu tampil untuk semua orang, termasuk yang akan ditolak
  -- halamannya. Yang ditolak sesudah mengklik menyimpulkan aplikasinya rusak.
  IF coalesce(array_length(r.required_permissions, 1), 0) = 0 THEN
    RAISE EXCEPTION '451 gagal: menu RK3K aktif TANPA izin — tampil untuk semua orang';
  END IF;

  -- Kunci izinnya harus BENAR-BENAR ADA. Kunci hantu menolak semua orang
  -- tanpa satu pun gejala.
  SELECT count(*) INTO n FROM permissions
   WHERE key = ANY(r.required_permissions);
  IF n <> coalesce(array_length(r.required_permissions, 1), 0) THEN
    RAISE EXCEPTION '451 gagal: kunci izin menu RK3K tak terdaftar di tabel permissions';
  END IF;

  RAISE NOTICE '451 OK — menu RK3K menunjuk /k3/rk3k, aktif, berizin %',
    r.required_permissions;
END $$;
