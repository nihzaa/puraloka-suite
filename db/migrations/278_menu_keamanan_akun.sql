-- ============================================================================
-- 278 — MENU "Keamanan Akun" di grup Administrasi
-- ============================================================================
--
-- Halamannya `/pengaturan/keamanan` (verifikasi dua langkah, sesi aktif,
-- riwayat masuk). Didaftarkan di commit yang sama — CLAUDE.md §8a.4.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA TANPA IZIN SAMA SEKALI, DAN ITU BUKAN KELALAIAN
-- ══════════════════════════════════════════════════════════════════════════
--
-- Setiap item lain di grup Administrasi menuntut izin: `settings:manage`,
-- `users:view`, `audit:view`. Halaman ini TIDAK, dan itu disengaja.
--
-- Yang diaturnya adalah **akun pemanggil sendiri** — MFA miliknya, sesinya,
-- riwayatnya. Rutenya (`routes/v1/keamanan.ts`) memaku `auth_id` ke
-- `request.currentUser`, jadi tak ada parameter yang bisa membuatnya membaca
-- akun orang lain.
--
-- Menuntut izin admin di sini justru merusak: mandor dan staf lapangan adalah
-- orang yang paling mungkin kehilangan ponsel atau memakai perangkat bersama,
-- dan merekalah yang paling butuh melihat "siapa saja yang sedang masuk ke
-- akun saya". Mengunci halaman keamanan akun di balik izin administrasi
-- berarti hanya admin yang bisa mengamankan akunnya.
--
-- `required_permissions` = array kosong, bukan NULL: kolomnya NOT NULL di
-- beberapa baris lain dan array kosong sudah berarti "tak ada syarat" bagi
-- penyaring sidebar.
--
-- ── Kenapa di Administrasi, bukan grup sendiri
--
-- Ia bertetangga dengan "Pengguna & Role" dan "Audit Log" — orang yang
-- mencari "keamanan" akan melihat ke sana lebih dulu. Grup baru berisi satu
-- item menambah satu tingkat navigasi tanpa menambah kejelasan.
-- ============================================================================

DO $$
DECLARE
  grup_id UUID;
  urut    INT;
BEGIN
  SELECT id INTO grup_id FROM menu_items WHERE key = 'g-administrasi' AND parent_id IS NULL;
  IF grup_id IS NULL THEN
    RAISE EXCEPTION '278 gagal: grup menu g-administrasi tak ditemukan';
  END IF;

  SELECT coalesce(max(sort_order), 0) + 1 INTO urut
    FROM menu_items WHERE parent_id = grup_id;

  INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active, kesiapan)
  VALUES ('keamanan-akun', 'Keamanan Akun', '/pengaturan/keamanan', 'Dot', grup_id, ARRAY[]::text[], urut, 'main', true, 'hidup')
  ON CONFLICT (key) DO UPDATE
    SET label = EXCLUDED.label,
        href = EXCLUDED.href,
        parent_id = EXCLUDED.parent_id,
        required_permissions = EXCLUDED.required_permissions,
        is_active = true,
        kesiapan = 'hidup',
        updated_at = now();
END $$;

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
--
-- Memeriksa yang menentukan, bukan sekadar "barisnya ada":
--   1. menunya aktif dan href-nya benar
--   2. TIDAK ada di tingkat ketiga (sidebar hanya merender dua — pelajaran 276)
--   3. TIDAK menuntut izin apa pun (kalau tertambah kelak, itu regresi yang
--      mengunci mandor di luar halaman keamanan akunnya sendiri)
--   4. href-nya belum dipakai link lain (audit-menu-berbagi-href ambang NOL)
DO $$
DECLARE
  n_aktif    INT;
  n_tingkat3 INT;
  n_izin     INT;
  n_href     INT;
BEGIN
  SELECT count(*) INTO n_aktif FROM menu_items
   WHERE key = 'keamanan-akun' AND is_active AND href = '/pengaturan/keamanan';
  IF n_aktif <> 1 THEN
    RAISE EXCEPTION '278 verifikasi gagal: menu keamanan-akun tidak aktif / href salah';
  END IF;

  SELECT count(*) INTO n_tingkat3
    FROM menu_items a JOIN menu_items b ON b.id = a.parent_id
   WHERE a.key = 'keamanan-akun' AND b.parent_id IS NOT NULL;
  IF n_tingkat3 > 0 THEN
    RAISE EXCEPTION '278 verifikasi gagal: menu berada di tingkat KETIGA — sidebar tak merendernya';
  END IF;

  SELECT coalesce(array_length(required_permissions, 1), 0) INTO n_izin
    FROM menu_items WHERE key = 'keamanan-akun';
  IF n_izin <> 0 THEN
    RAISE EXCEPTION '278 verifikasi gagal: menu menuntut % izin — halaman keamanan AKUN SENDIRI harus terbuka untuk semua peran', n_izin;
  END IF;

  SELECT count(*) INTO n_href FROM menu_items
   WHERE href = '/pengaturan/keamanan' AND is_active;
  IF n_href <> 1 THEN
    RAISE EXCEPTION '278 verifikasi gagal: href /pengaturan/keamanan dipakai % link', n_href;
  END IF;

  RAISE NOTICE '278 OK — menu keamanan-akun aktif, tingkat 2, nol izin, href unik';
END $$;
