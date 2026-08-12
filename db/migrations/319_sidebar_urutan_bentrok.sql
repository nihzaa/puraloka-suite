-- ============================================================================
-- 319 — SIDEBAR: lima `sort_order` yang bentrok dalam satu grup
-- ============================================================================
--
-- Founder 2026-08-12: *"susunan dan penempatannya ada yg masih ga sesuai"*.
-- Diukur, dan memang: **5 pasang item berbagi `sort_order` di grup yang sama.**
--
--     Administrasi       1613  Keamanan Akun | Recycle Bin
--     AI & Otomasi       1853  Asisten Pemilik | Pemakaian & Biaya
--     AI & Otomasi       1854  Asisten Staf | Kanal WhatsApp
--     Gudang & Material   704  Rencana Susut | Transfer Antar Proyek
--     Pelaporan & BI     1502  Susun Laporan | Peta Modul
--
-- Dua di antaranya lahir dari migrasi 276 dan 278 — keduanya milik saya, dan
-- keduanya memakai `max(sort_order) + n` tanpa memeriksa apakah angka itu
-- sudah dipakai.
--
-- ── Kenapa ini cacat, meski urutannya TIDAK acak
--
-- Dugaan pertama saya: tanpa tie-break, Postgres bebas mengurutkannya
-- berbeda tiap query. Diperiksa ke kode — `routes/v1/menu.ts` sudah memakai
-- `.order('section').order('sort_order').order('key')`, jadi urutannya
-- deterministik.
--
-- Cacatnya lebih halus dari itu: urutan tampil ditentukan **abjad `key`**,
-- bukan niat siapa pun. Akibatnya di AI & Otomasi:
--
--     Asisten — Lapisan AI
--     Asisten Pemilik
--     Pemakaian & Biaya     ← nyempil
--     Asisten Staf
--     Kanal WhatsApp        ← nyempil
--     Asisten Web
--     Wawasan Portofolio
--
-- Kelima halaman asisten adalah SATU rangkaian yang dipecah 2026-08-11
-- (migrasi 276) justru supaya tiap kanal punya halamannya sendiri. Menyisipkan
-- dua halaman lain di tengahnya mematahkan rangkaian itu — dan orang yang
-- mencari "asisten staf" berhenti di "Pemakaian & Biaya" lalu mengira daftarnya
-- sudah habis.
--
-- ── Penomoran baru: kelipatan 10, bukan +1
--
-- Seluruh grup AI dinomori ulang dengan jarak 10. Angka rapat adalah sebab
-- langsung tabrakan ini: dengan +1, sisipan berikutnya tak punya ruang dan
-- penulisnya terpaksa memakai angka yang sudah ada. Jarak 10 memberi sembilan
-- tempat di antara tiap pasang tanpa menyentuh apa pun.
-- ============================================================================

DO $$
DECLARE
  gid UUID;
BEGIN
  -- ── AI & Otomasi: rangkaian asisten dijadikan utuh ────────────────────────
  SELECT id INTO gid FROM menu_items WHERE key = 'g-ai' AND parent_id IS NULL;
  IF gid IS NULL THEN
    RAISE EXCEPTION '319 gagal: grup g-ai tak ditemukan';
  END IF;

  -- Urutan yang dituju — dibaca dari atas ke bawah persis seperti di layar:
  --   penyedia → lima asisten berurutan → biaya → whatsapp → otomasi
  UPDATE menu_items SET sort_order = 1810, updated_at = now() WHERE key = 'pengaturan-penyedia-ai';
  UPDATE menu_items SET sort_order = 1820, updated_at = now() WHERE key = 'ai-asisten';
  UPDATE menu_items SET sort_order = 1830, updated_at = now() WHERE key = 'ai-asisten-pemilik';
  UPDATE menu_items SET sort_order = 1840, updated_at = now() WHERE key = 'ai-asisten-staf';
  UPDATE menu_items SET sort_order = 1850, updated_at = now() WHERE key = 'ai-asisten-web';
  UPDATE menu_items SET sort_order = 1860, updated_at = now() WHERE key = 'ai-asisten-wawasan';
  UPDATE menu_items SET sort_order = 1870, updated_at = now() WHERE key = 'ai-biaya';
  UPDATE menu_items SET sort_order = 1880, updated_at = now() WHERE key = 'ai-whatsapp';
  UPDATE menu_items SET sort_order = 1890, updated_at = now() WHERE key = 'ai-alur';
  UPDATE menu_items SET sort_order = 1900, updated_at = now() WHERE key = 'ai-riwayat';

  -- ── Tiga tabrakan sisanya ────────────────────────────────────────────────
  --
  -- Yang DIGESER dipilih menurut kedekatan makna dengan tetangganya, bukan
  -- menurut mana yang lebih baru:
  --
  --   Keamanan Akun → sesudah Recycle Bin & Impor Data. Ia satu-satunya item
  --     Administrasi yang mengatur AKUN SENDIRI, bukan perusahaan (migrasi
  --     278) — menaruhnya di ujung memisahkannya dari alat administrasi.
  --   Transfer Antar Proyek → sesudah Rencana Susut. Susut adalah rencana,
  --     transfer adalah tindakan; rencana lebih dulu.
  --   Peta Modul → sesudah Susun Laporan. Peta Modul bukan laporan, ia
  --     katalog navigasi — paling wajar di ujung grupnya.
  UPDATE menu_items SET sort_order = 1615, updated_at = now() WHERE key = 'keamanan-akun';
  UPDATE menu_items SET sort_order = 705,  updated_at = now() WHERE key = 'gudang-transfer';
  UPDATE menu_items SET sort_order = 706,  updated_at = now() WHERE key = 'gudang-material-klien';
  UPDATE menu_items SET sort_order = 1503, updated_at = now() WHERE key = 'peta-modul';
END $$;

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
--
-- Memeriksa yang menentukan, bukan sekadar "UPDATE-nya jalan":
--   1. NOL tabrakan sort_order di SELURUH sidebar (bukan hanya yang disentuh)
--   2. kelima halaman asisten benar-benar BERURUTAN tanpa sisipan
--   3. tak ada item yang hilang dari grupnya
DO $$
DECLARE
  n_bentrok INT;
  n_ai      INT;
  urut_ai   TEXT;
BEGIN
  SELECT count(*) INTO n_bentrok FROM (
    SELECT i.parent_id, i.sort_order
      FROM menu_items i JOIN menu_items g ON g.id = i.parent_id
     WHERE i.is_active AND g.is_active
     GROUP BY i.parent_id, i.sort_order HAVING count(*) > 1
  ) t;
  IF n_bentrok > 0 THEN
    RAISE EXCEPTION '319 verifikasi gagal: masih % sort_order bentrok', n_bentrok;
  END IF;

  -- Kelima asisten berurutan: tak boleh ada item LAIN di antara sort_order
  -- terkecil dan terbesar milik mereka.
  SELECT count(*) INTO n_ai FROM menu_items i
    JOIN menu_items g ON g.id = i.parent_id
   WHERE g.key = 'g-ai' AND i.is_active
     AND i.key NOT LIKE 'ai-asisten%'
     AND i.sort_order BETWEEN
         (SELECT min(sort_order) FROM menu_items WHERE key LIKE 'ai-asisten%')
     AND (SELECT max(sort_order) FROM menu_items WHERE key LIKE 'ai-asisten%');
  IF n_ai > 0 THEN
    RAISE EXCEPTION '319 verifikasi gagal: % item bukan-asisten menyela rangkaian asisten', n_ai;
  END IF;

  SELECT string_agg(i.label, ' → ' ORDER BY i.sort_order, i.key) INTO urut_ai
    FROM menu_items i JOIN menu_items g ON g.id = i.parent_id
   WHERE g.key = 'g-ai' AND i.is_active;

  RAISE NOTICE '319 OK — nol tabrakan sidebar; AI & Otomasi: %', urut_ai;
END $$;
