-- ═══════════════════════════════════════════════════════════════════════════
-- 565 — `yt-*` yang halamannya SUDAH punya menu: padamkan
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Ditemukan CI 2026-09-04 pada PR #148, di schema BERSIH:
--
--     HARD FAIL — migrasi GAGAL di LUAR allowlist: 558_hidupkan_menu_halaman_yatim.sql
--       558 gagal: 18 href dipegang >1 menu aktif: /sdm/timesheet, /k3/rk3k,
--       /risiko/izin, /risiko/sengketa, /sdm/klaim-perjalanan, /risiko, ...
--
-- Keenam shard test API mati di langkah penyiapan — NOL test berjalan. Bukan
-- satu test pun merah; suite-nya tak pernah sampai dijalankan.
--
-- ── Kenapa tak terlihat lokal, dan kenapa itu bentuk yang berbahaya
--
-- Diukur di basis pengembangan: **0 href ganda**. Diukur di CI: **18**.
--
-- Selisih itu bukan keanehan CI. 558 sudah TERCATAT jalan di buku migrasi
-- lokal, jadi ia tak pernah diputar ulang di sini — pagarnya tak pernah
-- diminta memeriksa apa pun lagi. Hanya schema bersih yang memutar seluruh
-- rantai dari nol, dan hanya di sana pagarnya bicara.
--
-- Sebuah cacat yang hanya muncul di lingkungan bersih akan bertahan selama
-- yang mengukurnya cuma lingkungan yang sudah kotor. Itu sebabnya angka dari
-- basis pengembangan tak pernah bisa membebaskan sebuah migrasi.
--
-- ── Akar masalahnya di 531, bukan di 558
--
-- Migrasi 531 menyisipkan 28 menu "halaman yatim" dengan `is_active = true`,
-- dan syarat masuknya HANYA `NOT EXISTS (… WHERE m.key = t.kunci)` — kuncinya
-- belum ada. Ia tak pernah bertanya apakah HREF-nya sudah dipegang menu lain.
--
-- Diukur: **20 dari 29** baris `yt-*` punya kembaran ber-href sama yang aktif.
--
--     /k3/insiden           yt-k3-insiden      <->  hse-insiden
--     /risiko               yt-risiko          <->  rk-register
--     /sdm/timesheet        yt-sdm-timesheet   <->  hr-absensi
--     …
--
-- Dua menu, satu halaman. Di sidebar itu tampil sebagai dua baris berbeda
-- nama yang membuka layar yang sama persis — pengguna menyimpulkan salah satu
-- pasti sesuatu yang lain, lalu mengkliknya untuk memastikan.
--
-- 558 tak menyebabkannya; ia yang pertama memasang pagar dan meneriakkannya.
-- Pagar itu benar dan TIDAK dilemahkan di sini.
--
-- ── Kenapa `yt-*` yang padam, bukan kembarannya
--
-- Yang bernama asli (`hse-insiden`, `rk-register`) sudah ada lebih dulu,
-- punya label yang ditulis untuk manusia, dan sudah dipakai. Yang `yt-*`
-- lahir otomatis dari daftar halaman yatim — label generiknya ("Insiden K3"
-- di sebelah "Laporan Insiden") justru yang membingungkan.
--
-- Urutan yang sama dipakai 558 sendiri: `ORDER BY (key LIKE 'yt-%')` —
-- yang bernama menang. Migrasi ini meneruskan aturan itu, tidak membuat
-- aturan baru.
--
-- ── Kenapa migrasi MAJU, bukan menyunting 531
--
-- CLAUDE.md §5.5: migrasi lama tak disunting. 531 sudah jalan di produksi;
-- mengubah isinya membuat basis yang sudah menjalankannya menyimpang diam-
-- diam dari yang akan dijalankan lingkungan berikutnya.
--
-- Idempoten: aman dijalankan berkali-kali. Verifikasi di blok akhir (pola 142).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Padamkan `yt-*` yang href-nya dipegang menu aktif LAIN ──────────────────
--
-- `o.key <> y.key` bukan basa-basi: tanpa itu baris cocok dengan dirinya
-- sendiri dan SELURUH `yt-*` padam, termasuk sembilan yang memang satu-
-- satunya pintu ke halamannya.
UPDATE menu_items y
   SET is_active = FALSE, updated_at = now()
 WHERE y.key LIKE 'yt-%'
   AND y.is_active
   AND EXISTS (
     SELECT 1 FROM menu_items o
      WHERE o.href = y.href
        AND o.key <> y.key
        AND o.key NOT LIKE 'yt-%'
        AND o.is_active
   );

-- ── Verifikasi ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_ganda   INT;
  v_ganda   TEXT;
  n_yt      INT;
  n_gantung INT;
BEGIN
  /*
    Pagar yang sama dengan 558. Diulang di sini karena migrasi ini ADA untuk
    membuat pagar itu lulus — kalau ia tak lulus, kegagalannya harus muncul
    DI SINI, bukan di 558 yang sudah berlalu.
  */
  SELECT count(*), string_agg(href, ', ') INTO n_ganda, v_ganda
    FROM (SELECT href FROM menu_items
           WHERE is_active AND href IS NOT NULL
           GROUP BY href HAVING count(*) > 1) x;
  IF n_ganda > 0 THEN
    RAISE EXCEPTION '565 gagal: masih % href dipegang >1 menu aktif: %',
      n_ganda, left(coalesce(v_ganda, ''), 200);
  END IF;

  /*
    Anak aktif di bawah induk padam tetap tak terlihat. Memadamkan menu bisa
    membuat induknya kehilangan seluruh anak aktif — dan induk yang menyala
    tanpa isi adalah baris sidebar yang tak membuka apa pun.
  */
  SELECT count(*) INTO n_gantung
    FROM menu_items a JOIN menu_items g ON g.id = a.parent_id
   WHERE a.is_active AND NOT g.is_active;
  IF n_gantung > 0 THEN
    RAISE EXCEPTION '565 gagal: % menu aktif di bawah induk padam', n_gantung;
  END IF;

  /*
    Sembilan `yt-*` TANPA kembaran adalah satu-satunya pintu ke halamannya.
    Kalau angka ini nol, penyaring `o.key <> y.key` di atas gagal dan
    migrasi ini baru saja memadamkan sembilan halaman — kerusakan yang tak
    mengeluarkan galat apa pun, karena sidebar yang kekurangan baris terlihat
    persis seperti sidebar yang benar.
  */
  SELECT count(*) INTO n_yt FROM menu_items WHERE key LIKE 'yt-%' AND is_active;
  IF n_yt = 0 THEN
    RAISE EXCEPTION '565 gagal: SEMUA yt-* padam — penyaring kembaran tak bekerja';
  END IF;

  RAISE NOTICE '565 OK — nol href ganda, % yt-* tetap menyala (pintu satu-satunya)', n_yt;
END $$;
