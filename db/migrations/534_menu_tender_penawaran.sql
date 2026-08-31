-- ============================================================================
-- 534 — Satu halaman yatim terakhir: /tender/penawaran
-- ============================================================================
--
-- ── Cacat yang ditutup
--
--     ❌ YATIM — halaman jadi tanpa satu pun tautan nav: 1
--          /tender/penawaran
--
-- Halamannya ADA (`app/(dashboard)/tender/penawaran/page.tsx`), dan tak satu
-- pun menu menunjuknya. Tiga menu yang namanya berdekatan — `crm-tender`,
-- `crm-lead`, `crm-proposal` — semuanya NONAKTIF dan semuanya menunjuk
-- `/tender`, bukan sub-halamannya.
--
-- ── Kenapa menu baru, bukan menghidupkan yang lama
--
-- Menghidupkan ketiganya akan melahirkan tiga menu ber-href SAMA (`/tender`),
-- dan `audit-menu-berbagi-href.mjs` adalah LARANGAN MUTLAK sejak migrasi 231:
-- nol href boleh dipakai lebih dari satu link. Ketiganya juga tak menunjuk
-- halaman yang jadi masalah di sini.
--
-- Yang dibutuhkan cuma satu tautan ke `/tender/penawaran`, di grup yang sudah
-- hidup (`g-crm`, Pra-Konstruksi).
--
-- ── `kesiapan` = rencana, sama dengan migrasi 531
--
-- Halamannya ada; saya tak memverifikasi isinya lengkap. `rencana` jujur —
-- menunya muncul, orang bisa mencapainya, dan statusnya tak berbohong.
--
-- ── `sort_order` diambil dari celah, pola migrasi 531
--
-- Migrasi 530 menomori ulang seluruh pohon berjarak, jadi celahnya ada. Memaku
-- angka di sini akan menabrak saudara yang sudah menempatinya.
--
-- Idempoten — `ON CONFLICT (key)`. Verifikasi di blok akhir (pola 142).

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active, kesiapan)
SELECT 'yt-tender-penawaran', 'Penawaran Tender', '/tender/penawaran', 'Dot',
       g.id,
       ARRAY['projects:view'],
       (
         SELECT min(kandidat)
           FROM generate_series(g.sort_order + 1, g.sort_order + 99) AS kandidat
          WHERE NOT EXISTS (
            SELECT 1 FROM menu_items x
             WHERE x.parent_id = g.id AND x.is_active AND x.sort_order = kandidat)
       ),
       'main', true, 'rencana'
  FROM menu_items g
 WHERE g.key = 'g-crm' AND g.parent_id IS NULL AND g.is_active
ON CONFLICT (key) DO NOTHING;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_hantu   INT;
  n_bentrok INT;
  n_luar    INT;
BEGIN
  /*
    Grup induknya harus ada — kalau tidak, menunya tak tersisip dan itu bukan
    kegagalan melainkan basis yang pohon menunya belum terbentuk.
  */
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'yt-tender-penawaran') THEN
    RAISE NOTICE '534 dilewati: grup g-crm belum ada/aktif di basis ini. Bukan galat.';
    RETURN;
  END IF;

  -- Kunci izin HANTU menolak semua orang tanpa gejala — pelajaran migrasi 531.
  SELECT count(*) INTO n_hantu
    FROM (SELECT unnest(required_permissions) p FROM menu_items WHERE key = 'yt-tender-penawaran') x
   WHERE NOT EXISTS (SELECT 1 FROM permissions pp WHERE pp.key = x.p);
  IF n_hantu > 0 THEN
    RAISE EXCEPTION '534 gagal: % kunci izin HANTU di menu baru', n_hantu;
  END IF;

  SELECT count(*) INTO n_bentrok FROM (
    SELECT a.parent_id, a.sort_order
      FROM menu_items a JOIN menu_items i ON i.id = a.parent_id
     WHERE a.is_active AND i.is_active AND i.parent_id IS NULL
     GROUP BY a.parent_id, a.sort_order HAVING count(*) > 1) x;
  IF n_bentrok > 0 THEN
    RAISE EXCEPTION '534 gagal: % sort_order bentrok sesudah menu disisipkan', n_bentrok;
  END IF;

  SELECT count(*) INTO n_luar
    FROM menu_items a JOIN menu_items i ON i.id = a.parent_id
   WHERE a.is_active AND i.is_active AND i.parent_id IS NULL
     AND (a.sort_order <= i.sort_order OR a.sort_order > i.sort_order + 99);
  IF n_luar > 0 THEN
    RAISE EXCEPTION '534 gagal: % anak di luar rentang sesudah menu disisipkan', n_luar;
  END IF;

  -- Href-nya tak boleh kembar: larangan mutlak sejak migrasi 231.
  IF (SELECT count(*) FROM menu_items WHERE is_active AND href = '/tender/penawaran') > 1 THEN
    RAISE EXCEPTION '534 gagal: /tender/penawaran dipakai lebih dari satu menu aktif';
  END IF;

  RAISE NOTICE '534 OK: /tender/penawaran punya tautan nav, nol izin hantu, nol bentrok';
END $$;
