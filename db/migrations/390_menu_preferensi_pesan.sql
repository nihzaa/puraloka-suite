-- ============================================================================
-- 390 — MENU "PREFERENSI PESAN"
-- ============================================================================
--
-- Halaman tempat tiap orang mengatur jam tenang, kuota harian, dan tombol
-- berhenti — prasyarat proaktivitas (migrasi 389).
--
-- ── Kenapa `required_permissions` KOSONG
--
-- Tiap orang berhak mematikan pesan yang mengganggunya TANPA meminta izin
-- siapa pun. Opt-out yang butuh permission bukan opt-out; ia jadi permohonan,
-- dan permohonan bisa ditolak.
--
-- Array kosong berarti menu tampil untuk SEMUA anggota — `canSee()` di sidebar
-- memperlakukannya begitu (`required_permissions.length === 0 → true`). Yang
-- butuh izin hanya mengubah preferensi ORANG LAIN, dan itu dijaga rutenya
-- (`notifikasi:preferensi:kelola`), bukan menunya.
--
-- ── `is_active` ditulis EKSPLISIT
--
-- Pelajaran migrasi 384: empat sub-menu Asisten mati diam-diam selama empat
-- hari karena kolom ini tak pernah dinyalakan. Halamannya hidup, rutenya
-- jalan, dan sidebar tak menampilkan apa pun.
-- ============================================================================

DO $$
DECLARE
  grup_id UUID;
  urut    INT;
BEGIN
  SELECT id INTO grup_id FROM menu_items WHERE key = 'g-ai' AND parent_id IS NULL;
  IF grup_id IS NULL THEN
    RAISE EXCEPTION '390 gagal: grup menu g-ai tak ditemukan (migrasi 253)';
  END IF;

  SELECT coalesce(max(sort_order), 0) + 10 INTO urut
    FROM menu_items WHERE parent_id = grup_id;

  INSERT INTO menu_items (key, label, href, icon, parent_id, sort_order,
                          required_permissions, kesiapan, is_active)
  VALUES ('preferensi-pesan', 'Preferensi Pesan', '/pengaturan/preferensi-pesan',
          'Dot', grup_id, urut,
          ARRAY[]::TEXT[], 'hidup', true)
  ON CONFLICT (key) DO UPDATE
    SET label = EXCLUDED.label,
        href = EXCLUDED.href,
        parent_id = EXCLUDED.parent_id,
        kesiapan = 'hidup',
        required_permissions = EXCLUDED.required_permissions,
        is_active = true;
END $$;

DO $$
DECLARE
  n INT;
  v_href TEXT;
BEGIN
  SELECT href INTO v_href FROM menu_items WHERE key = 'preferensi-pesan' AND is_active;
  IF v_href IS DISTINCT FROM '/pengaturan/preferensi-pesan' THEN
    RAISE EXCEPTION '390 gagal: menu preferensi-pesan tak aktif / href salah (%)', v_href;
  END IF;

  -- Satu route satu link (disiplin 232).
  SELECT count(*) INTO n FROM menu_items
   WHERE href = '/pengaturan/preferensi-pesan' AND is_active;
  IF n <> 1 THEN
    RAISE EXCEPTION '390 gagal: % link aktif ke halaman preferensi, harus 1', n;
  END IF;
END $$;
