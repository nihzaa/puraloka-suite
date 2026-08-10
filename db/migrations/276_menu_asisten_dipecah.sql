-- ============================================================================
-- 276 — MENU: "Perilaku Asisten" dipecah jadi empat halaman
-- ============================================================================
--
-- Founder 2026-08-11: *"tetap ikuti TJS biar lebih enak"*. TJS memisah asisten
-- sejak awal (`settings/owner-ai`, `settings/staff-ai`, `settings/web-ai`);
-- Puraloka menggabungnya di satu halaman setinggi **4.566 px** — hampir lima
-- layar. Untuk mengubah asisten web, orang harus menggulir melewati tiga
-- asisten lain, dan tak ada tautan yang bisa dikirim ke salah satunya.
--
-- ── Kenapa item SEJAJAR, bukan bersarang di bawah "Perilaku Asisten"
--
-- Diukur sebelum menulis migrasi ini: sidebar hanya punya DUA tingkat
-- (19 grup akar + 111 anak, nol cucu). Mendaftarkan anak di bawah item
-- tingkat-2 menciptakan tingkat ketiga yang **tidak dirender sidebar** —
-- menunya ada di basis data, tak pernah muncul di layar, dan tak ada satu pun
-- galat yang menyebutnya.
--
-- Pola yang benar sudah dipakai `/kas` dan `/keuangan`: sub-halaman didaftar
-- sebagai item tingkat-2 sejajar induknya. Migrasi ini menyalinnya.
--
-- ── Izin: TIDAK ada yang baru
--
-- Keempat halaman memakai `settings:ai:manage` yang sudah dipegang item
-- induknya. Membuat izin baru di sini akan melahirkan izin yatim — persis
-- cacat yang migrasi 271 perbaiki (izin tanpa pemegang) dan 274 catat dari
-- arah sebaliknya (pemegang tanpa pembaca).
--
-- ── Pola migrasi maju, bukan meregenerasi 153
--
-- Meregenerasi `153_peta_menu_penuh.sql` MEMBATALKAN `232_sidebar_disiplin`
-- (153 mendahuluinya) — 235 item berbagi 84 href. Alasan lengkapnya di 273.
-- ============================================================================

DO $$
DECLARE
  grup_id   UUID;
  induk_id  UUID;
  urut      INT;
BEGIN
  SELECT parent_id, id INTO grup_id, induk_id
    FROM menu_items WHERE key = 'ai-asisten';

  IF induk_id IS NULL THEN
    RAISE EXCEPTION '276 gagal: menu ai-asisten tak ditemukan';
  END IF;

  -- Label induk diperjelas: ia kini hanya memuat saklar & retensi tenant,
  -- bukan seluruh perilaku. Membiarkannya "Perilaku Asisten" akan membuat
  -- orang membukanya lalu bertanya ke mana instruksinya pergi.
  UPDATE menu_items
     SET label = 'Asisten — Lapisan AI', updated_at = now()
   WHERE id = induk_id;

  SELECT sort_order INTO urut FROM menu_items WHERE id = induk_id;

  -- Sejajar induknya (parent = grup), berurutan tepat sesudahnya.
  -- `sort_order` induk 1852; anak-anaknya 1853..1856 supaya tak menggeser
  -- item lain yang sudah punya urutan sendiri.
  INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active, kesiapan)
  VALUES
    ('ai-asisten-pemilik', 'Asisten Pemilik',    '/pengaturan/asisten/pemilik', 'Dot', grup_id, ARRAY['settings:ai:manage'], urut + 1, 'main', true, 'hidup'),
    ('ai-asisten-staf',    'Asisten Staf',       '/pengaturan/asisten/staf',    'Dot', grup_id, ARRAY['settings:ai:manage'], urut + 2, 'main', true, 'hidup'),
    ('ai-asisten-web',     'Asisten Web',        '/pengaturan/asisten/web',     'Dot', grup_id, ARRAY['settings:ai:manage'], urut + 3, 'main', true, 'hidup'),
    ('ai-asisten-wawasan', 'Wawasan Portofolio', '/pengaturan/asisten/wawasan', 'Dot', grup_id, ARRAY['settings:ai:manage'], urut + 4, 'main', true, 'hidup')
  ON CONFLICT (key) DO UPDATE
    SET label = EXCLUDED.label,
        href = EXCLUDED.href,
        parent_id = EXCLUDED.parent_id,
        required_permissions = EXCLUDED.required_permissions,
        sort_order = EXCLUDED.sort_order,
        is_active = true,
        kesiapan = 'hidup',
        updated_at = now();
END $$;

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
--
-- Memeriksa TIGA hal, bukan hanya "barisnya ada":
--   1. keempatnya terdaftar dan aktif
--   2. tak ada yang jadi tingkat KETIGA (sidebar tak merendernya)
--   3. izinnya benar-benar dipegang minimal satu peran — izin yatim adalah
--      fitur mati yang tak mengeluarkan galat
DO $$
DECLARE
  n_menu     INT;
  n_tingkat3 INT;
  n_pemegang INT;
BEGIN
  SELECT count(*) INTO n_menu FROM menu_items
   WHERE key IN ('ai-asisten-pemilik','ai-asisten-staf','ai-asisten-web','ai-asisten-wawasan')
     AND is_active;
  IF n_menu <> 4 THEN
    RAISE EXCEPTION '276 verifikasi gagal: % dari 4 sub-menu asisten aktif', n_menu;
  END IF;

  SELECT count(*) INTO n_tingkat3
    FROM menu_items a
    JOIN menu_items b ON b.id = a.parent_id
   WHERE a.key LIKE 'ai-asisten-%' AND b.parent_id IS NOT NULL;
  IF n_tingkat3 > 0 THEN
    RAISE EXCEPTION '276 verifikasi gagal: % sub-menu berada di tingkat KETIGA — sidebar tak merendernya', n_tingkat3;
  END IF;

  SELECT count(*) INTO n_pemegang
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'settings:ai:manage';
  IF n_pemegang = 0 THEN
    RAISE EXCEPTION '276 verifikasi gagal: settings:ai:manage tak dipegang peran mana pun';
  END IF;

  RAISE NOTICE '276 OK — 4 sub-menu asisten, tingkat 2, izin dipegang % peran', n_pemegang;
END $$;
