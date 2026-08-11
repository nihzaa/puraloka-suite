-- ════════════════════════════════════════════════════════════════════════════
-- 308 — Izin report builder (G6d)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa izin BARU, bukan memakai `reports:view`
--
-- `reports:view` menjaga sembilan laporan siap-pakai yang sudah ada
-- (`/laporan`: ringkasan, keuangan, progress, pajak, WIP, cashflow, mandor,
-- pengeluaran, portofolio). Bentuknya tetap, isinya sudah ditentukan.
--
-- Report builder berbeda sifat: ia membiarkan orang MEMILIH sumber data. Yang
-- boleh melihat laporan yang sudah disiapkan belum tentu boleh menyusun
-- laporannya sendiri — dan menyamakan keduanya berarti setiap orang yang
-- pernah membuka /laporan mendadak bisa menarik daftar invoice.
--
-- ── Gerbang KEDUA tetap ada, dan itu yang sebenarnya menjaga
--
-- `reports:susun` hanya menjawab "boleh memakai fiturnya?". Apakah orangnya
-- boleh membaca SUMBER yang dipilihnya diperiksa terpisah di handler, memakai
-- izin yang dinyatakan tiap sumber (`projects:view`, `finance:view`).
--
-- Tanpa gerbang kedua, satu izin ini akan membuka seluruh sumber sekaligus.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO permissions (key, module, label, description)
VALUES
  ('reports:susun', 'reports', 'Susun laporan sendiri',
   'Menyusun laporan dari sumber data yang terdaftar — sumbernya tetap '
   'dibatasi izin masing-masing')
ON CONFLICT (key) DO NOTHING;

-- Diberikan ke peran yang sudah boleh MENGEKSPOR laporan, bukan yang sekadar
-- melihatnya: menyusun laporan sendiri lebih dekat ke mengekspor data
-- daripada ke membaca ringkasan yang sudah disiapkan.
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM role_permissions rp
  JOIN permissions px ON px.id = rp.permission_id
  CROSS JOIN permissions p
 WHERE px.key = 'reports:export'
   AND p.key = 'reports:susun'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'reports:susun') THEN
    RAISE EXCEPTION '308 gagal: izin reports:susun tak terbentuk';
  END IF;

  -- Izin yang tak dimiliki siapa pun adalah gerbang yang selalu tertutup:
  -- halamannya jadi dan tak ada satu orang pun yang bisa membukanya (G2b).
  SELECT count(DISTINCT rp.role_id) INTO n
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'reports:susun';
  IF n = 0 THEN
    RAISE EXCEPTION '308 gagal: reports:susun tak dimiliki satu peran pun';
  END IF;

  -- Dan izin sumbernya HARUS ada — handler memeriksanya, dan izin yang tak
  -- pernah terdaftar berarti sumbernya tak bisa dibaca siapa pun.
  FOR n IN
    SELECT 1 FROM unnest(ARRAY['projects:view', 'finance:view']) k
     WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE key = k)
  LOOP
    RAISE EXCEPTION '308 gagal: izin sumber laporan tak lengkap di tabel permissions';
  END LOOP;

  RAISE NOTICE '308 OK — reports:susun ada dan dimiliki peran; izin sumber lengkap';
END $$;
