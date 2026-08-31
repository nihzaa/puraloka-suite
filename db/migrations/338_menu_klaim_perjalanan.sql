-- ════════════════════════════════════════════════════════════════════════════
-- 338 — Menu Klaim Perjalanan (G1)
-- ════════════════════════════════════════════════════════════════════════════
--
-- `hr-reimburse` sudah ada sejak lama: `is_active = false`, `href = '/kas'` —
-- menunjuk halaman kas umum, bukan klaim. Pola yang sama dengan `sk-opname`
-- (D1), `sk-wo` (E1), `lp-serah` (E2), dan `md-wbs` (F2).
--
-- ── Kenapa 858, bukan 856
--
-- Blok SDM padat 851–855 (`hr-absensi` … `hr-bpjs`), lalu 856–857 diambil
-- entri PENGATURAN (`set-markup`, `set-api-key`) yang menyusup ke grup ini
-- entah kapan.
--
-- Yang paling masuk akal secara isi adalah menaruh klaim tepat sesudah
-- `hr-cuti` — sesama pengajuan karyawan. Tapi itu menuntut menggeser empat
-- entri yang sudah hidup, dan menggeser urutan menu yang sudah dihafal orang
-- demi kerapian adalah biaya yang tak sebanding.
--
-- Jadi 858: di ujung, sesudah dua entri pengaturan yang salah tempat itu.
-- Kalau kelak grup ini dirapikan, klaim ikut bergeser bersamanya — dan
-- perapiannya jadi satu pekerjaan tersendiri, bukan efek samping G1.
--
-- ── Izin: `klaim:view`
--
-- Yang perlu MELIHAT klaim lebih banyak daripada yang berwenang memutuskan.
-- Menu yang menuntut `klaim:setujui` akan menyembunyikannya dari pengaju —
-- dan pengaju adalah orang yang paling sering membukanya.
-- ════════════════════════════════════════════════════════════════════════════

/*
  ── Duplikat href dilepas lebih dulu (2026-09-01)

  Migrasi 531 membuat `yt-sdm-klaim` yang menunjuk href YANG SAMA. Ia lahir
  jauh sesudah migrasi ini, dan saat rantai diputar dari nol keduanya bertemu:

      x 338  2 menu menunjuk /sdm/klaim-perjalanan (harus 1)

  Aturan 232 (satu rute = satu tautan) BENAR dan tak dilonggarkan — dua menu
  ke halaman yang sama membuat sidebar punya dua pintu identik, dan
  `audit-menu-berbagi-href` berambang NOL untuk itu.

  Yang dilepas href-nya: `yt-sdm-klaim`. Alasannya bisa diukur — ia menu
  YATIM otomatis (awalan `yt-`) yang dibuat massal untuk menutup halaman
  tanpa tautan, sementara `hr-reimburse` menu bernama yang sudah lama ada
  dan sengaja dipindahkan ke sini. Yang bernama menang atas yang otomatis.

  Idempoten: hanya menyentuh baris yang masih memegang href itu.
*/
UPDATE menu_items
   SET href = NULL, is_active = FALSE
 WHERE key = 'yt-sdm-klaim'
   AND href = '/sdm/klaim-perjalanan';
UPDATE menu_items
   SET href = '/sdm/klaim-perjalanan',
       label = 'Klaim Perjalanan',
       icon = 'Plane',
       is_active = TRUE,
       required_permissions = ARRAY['klaim:view']::text[],
       parent_id = (SELECT parent_id FROM menu_items WHERE key = 'hr-cuti' LIMIT 1),
       section = (SELECT section FROM menu_items WHERE key = 'hr-cuti' LIMIT 1),
       sort_order = 858
 WHERE key = 'hr-reimburse';

INSERT INTO menu_items (key, label, href, icon, parent_id, required_permissions, sort_order, section, is_active)
SELECT 'hr-reimburse',
       'Klaim Perjalanan',
       '/sdm/klaim-perjalanan',
       'Plane',
       (SELECT parent_id FROM menu_items WHERE key = 'hr-cuti' LIMIT 1),
       ARRAY['klaim:view']::text[],
       858,
       (SELECT section FROM menu_items WHERE key = 'hr-cuti' LIMIT 1),
       TRUE
 WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'hr-reimburse');

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
BEGIN
  /*
    Yang diperiksa: menunya ADA dan menunjuk halaman yang benar —
    BUKAN apakah ia sedang aktif.

    ── Kenapa diubah (2026-09-01)

    Versi asli menuntut hr-reimburse AKTIF. Diukur ke basis:

        hr-reimburse  href=/m/hr-reimburse  aktif=false  induk=g-hr (juga false)
        SELURUH grup g-hr (SDM & Payroll) nonaktif — tujuh menunya sekaligus

    Itu KEPUTUSAN penataan menu, bukan cacat: modul SDM sengaja disembunyikan
    sampai siap. Migrasi lama tak boleh memaksa menu tetap menyala sesudah
    seseorang memutuskan mematikannya — dan tuntutan itu menghentikan
    seluruh rantai:

        x 338  induk hr-reimburse nonaktif — itemnya menggantung
          BERHENTI - sisa 109 tak pernah dijalankan

    Halamannya sendiri ADA (apps/web/app/(dashboard)/sdm/klaim-perjalanan).
    Yang sesungguhnya dijaga migrasi ini: menunya terdaftar, menunjuk href
    yang benar, dan berizin. Nyala-matinya urusan penataan, dan dijaga
    audit-nav-yatim di CI dengan daftar yang dibaca dari basis.

    Menyunting 338 sah: diperiksa ke buku migrasi, BELUM PERNAH tercatat.
  */
  IF NOT EXISTS (
    SELECT 1 FROM menu_items
     WHERE key = 'hr-reimburse' AND href = '/sdm/klaim-perjalanan'
       AND 'klaim:view' = ANY(required_permissions)
  ) THEN
    RAISE EXCEPTION '338 gagal: hr-reimburse tak terdaftar, href salah, atau tanpa izin';
  END IF;

  -- href NOT NULL untuk item aktif. Item aktif ber-href null dirender sidebar
  -- sebagai tautan yang diam saat diklik — terbaca sebagai fitur rusak, dan
  -- itu persis yang terjadi pada `sk-opname` sesudah migrasi 326.
  IF EXISTS (SELECT 1 FROM menu_items WHERE key = 'hr-reimburse' AND is_active AND href IS NULL) THEN
    RAISE EXCEPTION '338 gagal: menu aktif ber-href NULL';
  END IF;

  -- Izin yang dirujuk WAJIB ada DAN diberikan. Menu yang menuntut izin hantu
  -- tak pernah terlihat siapa pun, dan tak ada galat yang menandainya.
  IF NOT EXISTS (SELECT 1 FROM permissions WHERE key = 'klaim:view') THEN
    RAISE EXCEPTION '338 gagal: izin klaim:view tak ada — jalankan migrasi 337 lebih dulu';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
     WHERE p.key = 'klaim:view'
  ) THEN
    RAISE EXCEPTION '338 gagal: klaim:view tak diberikan ke peran mana pun';
  END IF;

  -- Satu rute = satu tautan (aturan 232).
  -- Dihitung dari yang TERDAFTAR, bukan yang aktif: modul SDM sedang
  -- dimatikan seluruhnya, dan aturan 'satu rute satu tautan' tetap berlaku
  -- baik menunya menyala maupun tidak.
  SELECT count(*) INTO n FROM menu_items WHERE href = '/sdm/klaim-perjalanan';
  IF n <> 1 THEN
    RAISE EXCEPTION '338 gagal: % menu menunjuk /sdm/klaim-perjalanan (harus 1)', n;
  END IF;

  -- Induk wajib ADA — nyala-matinya urusan penataan menu, dan seluruh grup
  -- g-hr sedang dimatikan sengaja. Item tanpa induk sama sekali BARU
  -- menggantung; item di bawah induk yang sedang disembunyikan tidak.
  IF NOT EXISTS (
    SELECT 1 FROM menu_items m JOIN menu_items p ON p.id = m.parent_id
     WHERE m.key = 'hr-reimburse'
  ) THEN
    RAISE EXCEPTION '338 gagal: hr-reimburse tak punya induk — itemnya menggantung';
  END IF;

  -- sort_order tak bentrok dengan SAUDARA SEKELOMPOK.
  --
  -- Angkanya TIDAK dipaku: 858 adalah celah saat migrasi ini ditulis, dan
  -- migrasi 530 menomori ulang seluruh pohon berjarak. Yang dijaga bentrokan,
  -- bukan angka tertentu.
  SELECT count(*) INTO n
    FROM menu_items m
   WHERE m.parent_id = (SELECT parent_id FROM menu_items WHERE key = 'hr-reimburse' LIMIT 1)
     AND m.sort_order = (SELECT sort_order FROM menu_items WHERE key = 'hr-reimburse')
     AND m.key <> 'hr-reimburse';
  IF n > 0 THEN
    RAISE EXCEPTION '338 gagal: % saudara berbagi sort_order dengan hr-reimburse', n;
  END IF;

  RAISE NOTICE '338 OK — /sdm/klaim-perjalanan terdaftar berizin, nol bentrok urutan';
END $$;
