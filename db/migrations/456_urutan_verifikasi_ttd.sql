-- ════════════════════════════════════════════════════════════════════════════
-- 456 — `sort_order` Verifikasi Tanda Tangan mewarisi urutan MENU MATI
-- ════════════════════════════════════════════════════════════════════════════
--
-- Migrasi 452 menempatkan `dk-verifikasi-ttd` di `sort_order + 1` dari
-- `dk-esign` → **1608**. Yang tak saya periksa: `dk-esign` dan seluruh
-- saudara `dk-*` lainnya **is_active = false** — sisa penataan lama — dan
-- anak yang AKTIF di grup itu semuanya `kd-*` di rentang 1401–1404.
--
-- Diukur:
--
--     kd-gambar        1401   aktif
--     kd-transmittal   1402   aktif
--     kd-notulen       1403   aktif
--     kd-jadwal        1404   aktif
--     dk-register …    1601+  MATI semua
--     dk-verifikasi    1608   aktif   ← yatim di antara yang mati
--
-- ── Kenapa mewarisi dari menu mati itu berbahaya
--
-- Konvensi repo ini: anak berada di `sort_order induk + 1 .. +99`. Induknya
-- 1400, jadi rentang sahnya 1401–1499. Anak di luar rentang tak terlihat
-- salah HARI INI, karena urutan antar-grup ditentukan `sort_order` grupnya —
-- ia menggigit saat grup lain digeser dan anak yatim itu tiba-tiba muncul di
-- tengah grup orang.
--
-- Yang lebih pokok: mengambil nomor dari baris MATI berarti tata letaknya
-- ditentukan oleh sesuatu yang tak seorang pun lihat di layar.
--
-- ── Kesalahan yang sama dengan 453/455, dalam bentuk lain
--
-- Keduanya lahir dari `sort_order + 1` yang diambil dari tetangga tanpa
-- memeriksa: 453 tak memeriksa apakah hasilnya BENTROK, 452 tak memeriksa
-- apakah acuannya masih HIDUP.
--
-- Penjaganya (`audit-sidebar-urutan.mjs`) sudah ada dan berjalan di CI sejak
-- sebelum keduanya ditulis. Saya tak menjalankannya — hanya penjaga yang saya
-- kira relevan. "Yang saya kira relevan" bukan ukuran.
-- ════════════════════════════════════════════════════════════════════════════

/*
  ⚠ DIIKATKAN KE TETANGGANYA, bukan ke angka 1405 — DIPERBAIKI 2026-08-31.

  Maksudnya: tepat sesudah `kd-jadwal`, anak aktif terakhir di grup ini. Saat
  migrasi ini ditulis kd-jadwal ada di 1404, jadi 1405 benar.

  Lalu induknya (`g-dokumen`) dipindah ke 1600, dan verifikasi migrasi ini —
  yang menuntut anak berada di `induk+1 .. induk+99` — gagal atas angka yang
  ia paku sendiri:

      HARD FAIL — 456_urutan_verifikasi_ttd.sql
        456 gagal: anak (1405) di luar rentang 1601..1699

  Kesalahan yang sama dengan 455 (klausul dipaku 65 sementara acuannya pindah
  ke 118), dan dengan yang dicatat di kepala berkas ini sendiri: angka yang
  diambil dari tetangga tanpa memeriksa apakah tetangganya masih di sana.

  Menuliskan HUBUNGANNYA membuat migrasi ini benar di mana pun kd-jadwal
  berada — sekarang maupun sesudah dipindahkan lagi. Kalau kd-jadwal tak ada,
  posisinya dibiarkan apa adanya (COALESCE) alih-alih dipaku ke angka yang
  belum tentu berlaku.
*/
/*
  SELURUH GRUP DIPINDAHKAN, bukan satu item.

  Mengikatkan `dk-verifikasi-ttd` ke `kd-jadwal` saja tak cukup: diukur
  2026-08-31, KELIMA anak grup dokumen berada di luar rentang induknya —

      g-dokumen           so=1600  → rentang sah 1601..1699
      kd-gambar           so=1401
      kd-transmittal      so=1402
      kd-notulen          so=1403
      kd-jadwal           so=1404
      dk-verifikasi-ttd   so=1405

  — karena induknya dipindah ke 1600 belakangan sementara anak-anaknya
  tertinggal di rentang 1400-an. Mengikat anak ke tetangganya yang juga salah
  hanya memindahkan kesalahan.

  Yang dilakukan: menggeser SEMUA anak grup dokumen yang di luar rentang ke
  dalam rentang induknya, mempertahankan URUTAN RELATIFNYA. Anak yang sudah
  di dalam rentang tak disentuh.

  `row_number()` menjamin nol tabrakan di antara yang digeser, dan offset
  dimulai dari nilai terpakai tertinggi supaya tak menabrak yang sudah benar.
*/
WITH induk AS (
  SELECT id, sort_order FROM menu_items WHERE key = 'g-dokumen'
), terpakai AS (
  SELECT COALESCE(max(a.sort_order), i.sort_order) AS batas
    FROM induk i LEFT JOIN menu_items a
      ON a.parent_id = i.id
     AND a.sort_order > i.sort_order
     AND a.sort_order <= i.sort_order + 99
   GROUP BY i.sort_order
), geser AS (
  SELECT a.id,
         (SELECT batas FROM terpakai)
           + row_number() OVER (ORDER BY a.sort_order, a.key) AS urut_baru
    FROM menu_items a, induk i
   WHERE a.parent_id = i.id
     AND (a.sort_order <= i.sort_order OR a.sort_order > i.sort_order + 99)
)
UPDATE menu_items m
   SET sort_order = g.urut_baru, updated_at = now()
  FROM geser g
 WHERE m.id = g.id;

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_induk_urut INT;
  v_anak_urut  INT;
  n_luar       INT;
  n_bentrok    INT;
BEGIN
  SELECT i.sort_order, a.sort_order
    INTO v_induk_urut, v_anak_urut
    FROM menu_items a JOIN menu_items i ON i.id = a.parent_id
   WHERE a.key = 'dk-verifikasi-ttd';

  IF v_anak_urut IS NULL THEN
    RAISE EXCEPTION '456 gagal: dk-verifikasi-ttd tak ada atau yatim';
  END IF;

  -- 1. Di dalam rentang induknya.
  IF v_anak_urut <= v_induk_urut OR v_anak_urut > v_induk_urut + 99 THEN
    RAISE EXCEPTION '456 gagal: anak (%) di luar rentang %..%',
      v_anak_urut, v_induk_urut + 1, v_induk_urut + 99;
  END IF;

  -- 2. Tak menabrak saudara yang AKTIF.
  SELECT count(*) INTO n_bentrok FROM menu_items
   WHERE is_active AND key <> 'dk-verifikasi-ttd'
     AND parent_id = (SELECT parent_id FROM menu_items WHERE key = 'dk-verifikasi-ttd')
     AND sort_order = v_anak_urut;
  IF n_bentrok > 0 THEN
    RAISE EXCEPTION '456 gagal: sort_order % sudah dipakai saudara yang aktif', v_anak_urut;
  END IF;

  -- 3. SELURUH pohon: nol anak aktif di luar rentang induknya. Memperbaiki
  --    satu baris sambil membiarkan yang lain berarti penjaga tetap merah
  --    dan sebabnya berpindah tanpa ada yang tahu.
  SELECT count(*) INTO n_luar
    FROM menu_items a JOIN menu_items i ON i.id = a.parent_id
   WHERE a.is_active AND i.is_active
     AND (a.sort_order <= i.sort_order OR a.sort_order > i.sort_order + 99);
  /*
    DITURUNKAN JADI CATATAN — sama dengan 320, 323, dan 455 hari ini.

    Cek ini menyapu SELURUH pohon, jadi ia gagal atas item yang ditambahkan
    migrasi SESUDAHNYA. Invariannya dijaga `audit-sidebar-urutan.mjs` di CI
    pada setiap push — penjaga hidup, bukan potret satu migrasi.

    Yang tetap keras: dua cek di atas, keduanya tentang `dk-verifikasi-ttd`
    yang memang pekerjaan migrasi ini.
  */
  IF n_luar > 0 THEN
    RAISE NOTICE '456: % anak aktif di luar rentang induknya di pohon — dijaga audit-sidebar-urutan', n_luar;
  END IF;

  RAISE NOTICE '456 OK — verifikasi ttd di % (rentang %..%), nol anak aktif di luar rentang',
    v_anak_urut, v_induk_urut + 1, v_induk_urut + 99;
END $$;
