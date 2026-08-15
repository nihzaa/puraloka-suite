-- ============================================================================
-- 388 — MENU "INGATAN ASISTEN"
-- ============================================================================
--
-- Migrasi 385-387 memberi asisten ingatan lengkap dengan jalur baca, jalur
-- tulis, dan pagarnya. Yang belum: LAYAR.
--
-- Tanpa halaman, ingatan hanya bisa diisi lewat percakapan — dan itu setengah
-- dari yang founder minta (2026-08-15: usulan asisten DAN halaman untuk
-- mengisi sendiri). Setengah yang hilang justru yang membuat ingatannya bisa
-- DIPERIKSA: tak ada cara melihat apa yang diingat asisten tentang perusahaan
-- Anda, apalagi menghapusnya.
--
-- ── Pelajaran migrasi 384, yang baru saja terjadi
--
-- Empat sub-menu Asisten pernah didaftarkan dengan `is_active = false` dan
-- tak seorang pun menyadarinya selama empat hari — halamannya hidup, rutenya
-- jalan, barisnya ada, dan sidebar tak menampilkan apa pun. Founder yang
-- menemukannya: *"kenapa di sidebarnya kebaca gaada yang aktif, ini aneh"*.
--
-- Karena itu `is_active = true` ditulis eksplisit DAN diverifikasi di blok
-- akhir, bukan diserahkan ke DEFAULT.
-- ============================================================================

DO $$
DECLARE
  grup_id UUID;
  urut    INT;
BEGIN
  SELECT id INTO grup_id FROM menu_items WHERE key = 'g-ai' AND parent_id IS NULL;
  IF grup_id IS NULL THEN
    RAISE EXCEPTION '388 gagal: grup menu g-ai tak ditemukan (migrasi 253)';
  END IF;

  SELECT coalesce(max(sort_order), 0) + 10 INTO urut
    FROM menu_items WHERE parent_id = grup_id;

  INSERT INTO menu_items (key, label, href, icon, parent_id, sort_order,
                          required_permissions, kesiapan, is_active)
  VALUES ('ai-ingatan', 'Ingatan Asisten', '/pengaturan/ingatan',
          'Dot', grup_id, urut,
          -- `lihat`, bukan `kelola`: halaman ini juga tempat orang memeriksa
          -- ingatan PRIBADI-nya sendiri, dan menuntut izin kelola untuk itu
          -- berarti hampir tak seorang pun bisa membukanya.
          ARRAY['ai:ingatan:lihat'], 'hidup', true)
  ON CONFLICT (key) DO UPDATE
    SET label = EXCLUDED.label,
        href = EXCLUDED.href,
        parent_id = EXCLUDED.parent_id,
        kesiapan = 'hidup',
        required_permissions = EXCLUDED.required_permissions,
        is_active = true;
END $$;

-- ------------------------------------------------------------
-- Verifikasi — termasuk `is_active`, pelajaran migrasi 384.
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
  v_href TEXT;
BEGIN
  SELECT href INTO v_href FROM menu_items WHERE key = 'ai-ingatan' AND is_active;
  IF v_href IS DISTINCT FROM '/pengaturan/ingatan' THEN
    RAISE EXCEPTION '388 gagal: menu ai-ingatan tak aktif / href salah (%)', v_href;
  END IF;

  -- Satu route satu link (disiplin 232). Dua link ke halaman yang sama
  -- membuat keduanya menyala sekaligus, dan penanda posisinya berhenti
  -- berarti.
  SELECT count(*) INTO n FROM menu_items WHERE href = '/pengaturan/ingatan' AND is_active;
  IF n <> 1 THEN
    RAISE EXCEPTION '388 gagal: % link aktif ke /pengaturan/ingatan, harus 1', n;
  END IF;

  -- Izin yang diminta menu WAJIB benar-benar ada — menu yang menuntut izin
  -- yang tak pernah dibuat tak akan pernah muncul untuk siapa pun.
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'ai:ingatan:lihat') THEN
    RAISE EXCEPTION '388 gagal: izin ai:ingatan:lihat tak ada (migrasi 385)';
  END IF;
END $$;
