-- ============================================================================
-- 253 — GRUP MENU "AI & OTOMASI" + rail asisten menggantikan halaman khusus
-- ============================================================================
--
-- ── Dua keputusan founder, 2026-08-10
--
-- 1. *"obrolan dengan asisten itu harusnya DI SINI, ngga usah halaman khusus"*
--    — menunjuk rail kanan yang sudah ada. Halaman `/asisten` dibatalkan;
--    obrolannya pindah ke `RailAsisten`, yang bisa diperbesar.
--
--    Alasannya kuat dan bukan soal selera: asisten dipakai SAMBIL melihat
--    data. Halaman khusus memaksa orang meninggalkan angka yang sedang ia
--    tanyakan — lalu menyalin nomor PO ke kepala, pindah halaman, dan bertanya
--    dari ingatan. Rail membiarkan pertanyaan dan jawabannya berdampingan.
--
-- 2. *"semua konfigurasi bikin menu induk khusus dan di bawahnya membawahi
--    sub-menu, kaya di TJS"*.
--
--    TJS menaruh Penyedia AI, AI Assistant Owner, dan AI Assistant Staff di
--    section "Admin & Sistem" (`lib/access.ts:1256-1300`) — bercampur dengan
--    pengaturan lain. Di sini dibuat LEBIH BAIK: satu grup induk sendiri,
--    sehingga seluruh permukaan AI (penyedia, tiap asisten, kanal WhatsApp,
--    biaya) berada di satu tempat alih-alih tersebar di antara belasan menu
--    administrasi yang tak berhubungan.
--
-- Menu `asisten` (halaman khusus) DINONAKTIFKAN, bukan dihapus: `menu_items`
-- dirujuk audit log dan `/m/<key>`, dan menghapus baris membuat jejak lama
-- menunjuk sesuatu yang tak ada.
-- ============================================================================

UPDATE menu_items SET is_active = false WHERE key = 'asisten';

-- ------------------------------------------------------------
-- 1. Grup induk
--
-- sort_order 185 — tepat SEBELUM Administrasi (190). AI & Otomasi adalah
-- konfigurasi, jadi tempatnya di ujung bersama pengaturan lain; tetapi ia
-- grup sendiri karena isinya akan terus bertambah (WhatsApp, alur otomatis,
-- basis pengetahuan) dan menumpuknya di Administrasi akan mengubur menu
-- pengguna & izin yang jauh lebih sering dibuka.
-- ------------------------------------------------------------
INSERT INTO menu_items (key, label, href, icon, sort_order, section, parent_id, is_active, kesiapan)
VALUES ('g-ai', 'AI & Otomasi', NULL, 'Bot', 185, 'main', NULL, true, 'hidup')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order, is_active = true;

-- ------------------------------------------------------------
-- 2. Sub-menu — pindahkan Penyedia AI ke sini, tambah yang baru
-- ------------------------------------------------------------
UPDATE menu_items
   SET parent_id = (SELECT id FROM menu_items WHERE key = 'g-ai'),
       sort_order = 1851
 WHERE key = 'pengaturan-penyedia-ai';

INSERT INTO menu_items (
  key, label, href, icon, sort_order, section, parent_id, is_active, kesiapan, required_permissions
)
VALUES
  -- Konfigurasi PER ASISTEN: prompt, batas ronde, tool yang aktif. Inilah
  -- yang membuat "semuanya bisa dikonfigurasi di UI" jadi kenyataan, bukan
  -- janji — sebelum ini prompt sistem dipaku di `routes/v1/ai-chat.ts`.
  ('ai-asisten', 'Perilaku Asisten', '/pengaturan/asisten', 'Dot',
   1852, 'main', (SELECT id FROM menu_items WHERE key = 'g-ai'),
   true, 'hidup', ARRAY['settings:ai:manage']),

  -- Biaya: sudah ada datanya (ai_biaya_token per ronde), belum ada halamannya
  -- sendiri. Ditandai `rencana` supaya taksonomi jujur.
  ('ai-biaya', 'Pemakaian & Biaya', NULL, 'Dot',
   1853, 'main', (SELECT id FROM menu_items WHERE key = 'g-ai'),
   true, 'rencana', ARRAY['settings:ai:view']),

  -- WhatsApp: Evolution sudah terpasang (TJS-A0), kanalnya belum tersambung.
  ('ai-whatsapp', 'Kanal WhatsApp', NULL, 'Dot',
   1854, 'main', (SELECT id FROM menu_items WHERE key = 'g-ai'),
   true, 'rencana', ARRAY['settings:ai:manage'])
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label, href = EXCLUDED.href,
  sort_order = EXCLUDED.sort_order, parent_id = EXCLUDED.parent_id,
  is_active = true, kesiapan = EXCLUDED.kesiapan,
  required_permissions = EXCLUDED.required_permissions;

-- ------------------------------------------------------------
-- 3. Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE v_bentrok INT; v_anak INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'g-ai' AND is_active) THEN
    RAISE EXCEPTION '253 gagal: grup g-ai tidak terbentuk';
  END IF;

  SELECT count(*) INTO v_anak FROM menu_items
   WHERE parent_id = (SELECT id FROM menu_items WHERE key = 'g-ai') AND is_active;
  IF v_anak < 4 THEN
    RAISE EXCEPTION '253 gagal: grup AI hanya punya % sub-menu aktif (harap 4)', v_anak;
  END IF;

  -- Halaman khusus HARUS nonaktif — kalau tidak, ada dua pintu ke asisten dan
  -- rail-nya jadi tampak sebagai versi kedua yang setengah jadi.
  IF EXISTS (SELECT 1 FROM menu_items WHERE key = 'asisten' AND is_active) THEN
    RAISE EXCEPTION '253 gagal: menu halaman /asisten masih aktif';
  END IF;

  -- R-1 di dalam grup.
  SELECT count(*) INTO v_bentrok FROM (
    SELECT sort_order FROM menu_items
     WHERE parent_id = (SELECT id FROM menu_items WHERE key = 'g-ai') AND is_active
     GROUP BY sort_order HAVING count(*) > 1
  ) s;
  IF v_bentrok > 0 THEN
    RAISE EXCEPTION '253 gagal: % sort_order bentrok di grup AI', v_bentrok;
  END IF;

  -- Penyedia AI benar-benar PINDAH, bukan tersalin.
  IF (SELECT parent_id FROM menu_items WHERE key = 'pengaturan-penyedia-ai')
     <> (SELECT id FROM menu_items WHERE key = 'g-ai') THEN
    RAISE EXCEPTION '253 gagal: Penyedia AI tidak pindah ke grup AI';
  END IF;
END $$;
