-- ════════════════════════════════════════════════════════════════════════════
-- 304 — Menu untuk baseline jadwal (G6b, lanjutan 303)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa href-nya `/proyek` dan bukan `/proyek/<id>/baseline`
--
-- Halaman baseline butuh id proyek, dan menu sidebar tak punya konteks
-- proyek yang sedang dibuka. Menu yang menunjuk rute dinamis akan menghasilkan
-- tautan mati — dan `audit-nav-yatim` justru MEMBENARKANNYA karena href-nya
-- "ada" di daftar halaman.
--
-- Yang dilakukan: menu menunjuk daftar proyek, dan tautan ke baseline muncul
-- DI DALAM halaman proyek. Pola yang sama dipakai sub-halaman proyek lain.
--
-- Karena itu migrasi ini TIDAK membuat menu baru, ia hanya memastikan izin
-- barunya sampai ke peran yang sudah boleh melihat proyek — pekerjaan yang
-- sudah dilakukan 303, dan di sini hanya diverifikasi ulang supaya
-- kegagalannya terlihat kalau 303 pernah dijalankan sebagian.
--
-- ⚠ Halaman `/proyek/[id]/baseline` adalah RUTE DINAMIS. `audit-nav-yatim`
-- mengecualikan rute dinamis dari pemeriksaan yatim (ia tak bisa ditautkan
-- dari sidebar), jadi tak ada menu yang perlu dibuat. Yang WAJIB: tautannya
-- ada di halaman proyek — dan itu bagian dari commit ini, bukan migrasi.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  n INT;
BEGIN
  -- Izin dari 303 wajib ada …
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'projects:baseline:view') THEN
    RAISE EXCEPTION '304 gagal: izin projects:baseline:view tak ada — 303 belum jalan?';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'projects:baseline:manage') THEN
    RAISE EXCEPTION '304 gagal: izin projects:baseline:manage tak ada';
  END IF;

  -- … dan benar-benar dimiliki peran. Izin yang terdaftar tetapi tak dimiliki
  -- siapa pun adalah gerbang yang selalu tertutup: halamannya jadi, dan tak
  -- ada satu orang pun yang bisa membukanya (cacat yang memakan G2b).
  SELECT count(DISTINCT rp.role_id) INTO n
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'projects:baseline:view';
  IF n = 0 THEN
    RAISE EXCEPTION '304 gagal: projects:baseline:view tak dimiliki satu peran pun';
  END IF;

  SELECT count(DISTINCT rp.role_id) INTO n
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'projects:baseline:manage';
  IF n = 0 THEN
    RAISE EXCEPTION '304 gagal: projects:baseline:manage tak dimiliki satu peran pun';
  END IF;

  -- Tak boleh ada menu yang menunjuk rute dinamis — tautannya pasti mati.
  IF EXISTS (SELECT 1 FROM menu_items WHERE is_active AND href LIKE '%/baseline') THEN
    RAISE EXCEPTION '304 gagal: ada menu aktif menunjuk rute baseline yang dinamis — '
      'tautannya akan mati karena sidebar tak tahu proyek mana';
  END IF;

  RAISE NOTICE '304 OK — izin baseline sampai ke peran, nol menu menunjuk rute dinamis';
END $$;
