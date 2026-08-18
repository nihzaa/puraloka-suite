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

-- 1405: tepat sesudah `kd-jadwal` (1404), anak aktif terakhir di grup ini.
UPDATE menu_items SET sort_order = 1405, updated_at = now()
 WHERE key = 'dk-verifikasi-ttd';

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
  IF n_luar > 0 THEN
    RAISE EXCEPTION '456 gagal: masih ada % anak aktif di luar rentang induknya', n_luar;
  END IF;

  RAISE NOTICE '456 OK — verifikasi ttd di % (rentang %..%), nol anak aktif di luar rentang',
    v_anak_urut, v_induk_urut + 1, v_induk_urut + 99;
END $$;
