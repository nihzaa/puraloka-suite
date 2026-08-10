-- ============================================================================
-- 273 — MENU "Alur Otomasi" di grup AI & Otomasi
-- ============================================================================
--
-- Halamannya sudah ada (`/otomasi/alur`, S7). Didaftarkan di commit yang sama —
-- CLAUDE.md §8a.4: halaman tanpa tautan nav hanya bisa dibuka dengan mengetik
-- URL, dan penjaga `audit-nav-yatim` memerahkannya.
--
-- ── Kenapa migrasi TERSENDIRI, bukan meregenerasi 153
--
-- `peta-menu.ts` punya generator (`gen-migrasi-menu.mjs`) yang menulis ulang
-- `153_peta_menu_penuh.sql`, dan menambah satu baris di sana TERASA benar —
-- berkasnya sendiri berkata "jangan sunting langsung, regenerasi".
--
-- Saya menempuh jalan itu 2026-08-10, dan itu KELIRU. Dua sebabnya, keduanya
-- baru terlihat setelah diukur:
--
--   1. Berkas 153 di disk sudah lama tertinggal dari sumbernya — regenerasi
--      di HEAD saja menghasilkan 106 insert/96 delete SEBELUM baris apa pun
--      ditambahkan. Satu baris niat membawa serta ratusan perubahan yang tak
--      pernah ditinjau siapa pun.
--
--   2. Lebih parah: 153 mendahului `232_sidebar_disiplin`, yang menegakkan
--      "satu route, satu link". Menerapkan ulang 153 MEMBATALKAN disiplin itu
--      — `audit-menu-berbagi-href` melompat ke 235 item berbagi 84 href, dengan
--      26 item menunjuk `/proyek` sekaligus. Penjaga itu larangan mutlak, dan
--      benar: sidebar yang menyalakan 26 baris untuk satu halaman tak lagi
--      memberi tahu pemakainya di mana ia berada.
--
-- Pulihnya dengan menerapkan ulang 232 dan seluruh migrasi menu sesudahnya.
-- Pelajarannya: berkas yang di-generate BUKAN otomatis berkas yang aman
-- di-regenerate — kalau ada migrasi lebih baru yang mengubah tabel yang sama,
-- menjalankan ulang yang lama adalah memundurkan waktu.
-- ============================================================================

DO $$
DECLARE
  grup_id UUID;
  urut    INT;
BEGIN
  SELECT id INTO grup_id FROM menu_items WHERE key = 'g-ai' AND parent_id IS NULL;
  IF grup_id IS NULL THEN
    RAISE EXCEPTION '273 gagal: grup menu g-ai tak ditemukan (migrasi 253)';
  END IF;

  SELECT coalesce(max(sort_order), 0) + 10 INTO urut
    FROM menu_items WHERE parent_id = grup_id;

  -- `otomasi:alur:lihat` (migrasi 272), bukan izin kelola: yang boleh MEMERIKSA
  -- kenapa notifikasi tak terkirim jauh lebih banyak daripada yang boleh
  -- mengubah katalognya, dan menu yang menuntut izin kelola akan menyembunyikan
  -- halaman diagnosa dari orang yang justru sedang mendiagnosa.
  INSERT INTO menu_items (key, label, href, icon, parent_id, sort_order,
                          required_permissions, kesiapan, is_active)
  VALUES ('ai-alur', 'Alur Otomasi', '/otomasi/alur',
          'Dot', grup_id, urut,
          ARRAY['otomasi:alur:lihat'], 'hidup', true)
  ON CONFLICT (key) DO UPDATE
    SET label = EXCLUDED.label,
        href = EXCLUDED.href,
        parent_id = EXCLUDED.parent_id,
        kesiapan = 'hidup',
        required_permissions = EXCLUDED.required_permissions,
        is_active = true;
END $$;

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE n int; v_href TEXT;
BEGIN
  SELECT href INTO v_href FROM menu_items WHERE key = 'ai-alur' AND is_active;
  IF v_href IS NULL THEN
    RAISE EXCEPTION '273 gagal: menu ai-alur tak aktif — halamannya jadi yatim';
  END IF;
  IF v_href <> '/otomasi/alur' THEN
    RAISE EXCEPTION '273 gagal: href ai-alur = % (harusnya /otomasi/alur)', v_href;
  END IF;

  -- Satu route satu link (disiplin migrasi 232). Kalau href ini sudah dipakai
  -- link lain, `audit-menu-berbagi-href` — LARANGAN MUTLAK — akan merah.
  SELECT count(*) INTO n FROM menu_items WHERE href = '/otomasi/alur' AND is_active;
  IF n <> 1 THEN
    RAISE EXCEPTION '273 gagal: /otomasi/alur dipakai % link aktif (harus tepat 1)', n;
  END IF;

  -- Induknya WAJIB grup AI, bukan menggantung di akar.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items a JOIN menu_items g ON g.id = a.parent_id
     WHERE a.key = 'ai-alur' AND g.key = 'g-ai') THEN
    RAISE EXCEPTION '273 gagal: ai-alur tidak berada di bawah grup g-ai';
  END IF;
END $$;
