-- ============================================================================
-- 588 — SEPULUH sub-menu memakai ikon sendiri; tujuh di antaranya ikon SALAH
-- ============================================================================
--
-- ── Aturan yang dilanggar
--
-- Founder sudah memutuskannya, dan keputusannya tertulis di DUA tempat kode:
--
--   apps/web/lib/ikon-menu.tsx:62
--     "19 ikon grup peta menu (migrasi 153) + `Dot` untuk seluruh sub-menu.
--      Sub-menu SENGAJA seragam: 202 ikon berbeda justru menghapus fungsi
--      ikon sebagai penanda — saat semuanya bergambar, tak ada yang menonjol."
--
--   apps/web/components/sidebar.tsx:313
--     "Submenu TETAP memakai titik, bukan ikon sendiri-sendiri. … saat
--      semuanya bergambar, mata berhenti memakai ikon sebagai pembeda dan
--      kembali membaca teks — ikonnya jadi tinta tanpa informasi."
--
-- Diukur di basis dev 2026-09-15 (`is_active` saja):
--
--     INDUK      29 baris — semuanya ikon sungguhan   ✅ benar
--     ANAK      176 baris — 166 `Dot` + 10 ikon sendiri   ← yang diperbaiki
--
-- ── ⚠ Yang membuatnya lebih dari sekadar ketaksamaan gaya
--
-- TUJUH dari sepuluh nama ikon itu TIDAK TERDAFTAR di tabel `IKON_MENU`
-- (`apps/web/lib/ikon-menu.tsx`). Fungsi pembacanya berakhir dengan
--
--     return IKON_MENU[nama] ?? FolderKanban
--
-- jadi ketujuhnya tidak gagal — mereka terender sebagai FOLDER, ikon yang
-- SAMA PERSIS satu sama lain dan sama dengan ikon grup Proyek. Bukan ikon
-- yang hilang, melainkan penanda yang KELIRU, tanpa satu pun galat:
--
--     ClipboardCheck  lp-serah, sk-opname     → folder
--     CreditCard      pengaturan-langganan    → folder
--     Hash            md-penomoran            → folder
--     IdCard          md-karyawan             → folder
--     Network         md-wbs                  → folder
--     Plane           hr-reimburse            → folder
--     Warehouse       md-gudang               → folder
--
-- Tiga sisanya (`Ruler` cc-pembesian, `FileSignature` sk-wo) memang terdaftar
-- dan tergambar benar — tetap dijadikan `Dot`, sebab aturannya tentang
-- KESERAGAMAN sub-menu, bukan tentang ikon mana yang tersedia.
--
-- ── Yang SENGAJA tidak disentuh migrasi ini
--
-- Dua INDUK juga jatuh ke FolderKanban: `g-akuntansi` (BookOpen) dan
-- `g-alat-dokumen` (Wrench). Induk WAJIB punya ikon sungguhan, jadi
-- perbaikannya bukan di basis melainkan di tabel `IKON_MENU` — keduanya
-- didaftarkan di sana pada commit yang sama. Menjadikannya `Dot` akan
-- MENAATI setengah aturan sambil merusak setengah lainnya.
--
-- Baris NON-AKTIF juga tak disentuh: 216 di antaranya tak pernah tergambar,
-- dan menyentuhnya membuat verifikasi di bawah berbicara tentang baris yang
-- tak seorang pun lihat.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Sub-menu aktif → `Dot`
--
-- Idempoten: `WHERE icon IS DISTINCT FROM 'Dot'` berarti jalan kedua menyentuh
-- NOL baris. Disaring `parent_id IS NOT NULL` — bukan daftar nama kunci, sebab
-- daftar nama membeku sementara sub-menu terus bertambah, dan sub-menu ke-177
-- yang lahir besok dengan ikon sendiri tak akan tersentuh oleh daftar.
-- ------------------------------------------------------------
UPDATE public.menu_items
   SET icon = 'Dot',
       updated_at = NOW()
 WHERE parent_id IS NOT NULL
   AND is_active
   AND icon IS DISTINCT FROM 'Dot';

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
--
-- Memeriksa TIGA hal, dan yang kedua serta ketiga yang menjaga maksud berkas
-- ini. Arah pertama saja (sub-menu seragam) akan tetap hijau seandainya
-- migrasi ini keliru menyapu induk juga — dan sidebar tanpa ikon grup adalah
-- kerusakan yang lebih besar daripada yang sedang diperbaiki.
DO $$
DECLARE
  n_anak_beda   INT;
  n_induk_titik INT;
  n_induk       INT;
BEGIN
  /* 1. Tak boleh ada sub-menu aktif yang bukan `Dot`. */
  SELECT count(*) INTO n_anak_beda
    FROM public.menu_items
   WHERE parent_id IS NOT NULL AND is_active
     AND icon IS DISTINCT FROM 'Dot';

  IF n_anak_beda > 0 THEN
    RAISE EXCEPTION '588 gagal: % sub-menu aktif masih berikon sendiri', n_anak_beda;
  END IF;

  /* 2. Induk TIDAK boleh ikut tersapu — ikon grup adalah satu-satunya
        penanda visual sidebar sesudah sub-menu diseragamkan. */
  SELECT count(*) INTO n_induk_titik
    FROM public.menu_items
   WHERE parent_id IS NULL AND is_active
     AND (icon IS NULL OR icon = 'Dot');

  IF n_induk_titik > 0 THEN
    RAISE EXCEPTION
      '588 gagal: % menu INDUK kehilangan ikonnya — migrasi ini menyapu '
      'terlalu jauh.', n_induk_titik;
  END IF;

  /* 3. Dan induknya masih ada. Nol induk membuat pemeriksaan (2) hijau
        secara hampa: himpunan kosong tak punya pelanggar. */
  SELECT count(*) INTO n_induk
    FROM public.menu_items WHERE parent_id IS NULL AND is_active;

  IF n_induk = 0 THEN
    RAISE EXCEPTION '588 gagal: nol menu induk aktif — verifikasi (2) hampa';
  END IF;

  RAISE NOTICE
    '588 OK — sub-menu aktif seragam `Dot`, % induk aktif tetap berikon', n_induk;
END $$;
