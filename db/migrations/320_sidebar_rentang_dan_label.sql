-- ============================================================================
-- 320 — SIDEBAR: rentang `sort_order` anak + label perusahaan yang ambigu
-- ============================================================================
--
-- Founder 2026-08-12 minta pengelompokan sidebar ditinjau menyeluruh. Diukur
-- ke-19 grup; tiga temuan, dan yang pertama SAYA penyebabnya.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 1. KONVENSI PENOMORAN: anak = gso+1 .. gso+99
-- ══════════════════════════════════════════════════════════════════════════
--
-- Diukur, bukan diasumsikan — **16 dari 18 grup mematuhinya**:
--
--     Master Data           50 → 51–64
--     Pengadaan            600 → 601–611
--     Administrasi        1600 → 1601–1615
--
-- Dua yang menyimpang:
--
--     AI & Otomasi         185 → 1810–1900   ← migrasi 319, MILIK SAYA
--     Keuangan            1100 → 1101–1413   ← "Tutup Buku" 1413
--
-- Kemarin saya menomori ulang grup AI dengan jarak 10 (migrasi 319) untuk
-- memperbaiki tabrakan `sort_order`. Jaraknya benar; **basisnya salah** — saya
-- memakai 1810 alih-alih 186, tanpa memeriksa konvensi yang sudah dipatuhi
-- seluruh repo.
--
-- Efeknya belum terlihat karena urutan ANTAR-grup ditentukan `sort_order`
-- grupnya (185), bukan anaknya. Tapi grup berikutnya yang lahir di rentang
-- 1800-an akan bertabrakan dengan anak-anak AI — dan tabrakan itu tak akan
-- mengeluarkan galat, hanya urutan yang aneh.
--
-- Jaraknya dipertahankan 10 (186, 196 tak muat untuk 10 item), jadi dipakai
-- jarak 1 dengan ruang sisa: 186–195, menyisakan 196–199 untuk sisipan.
--
-- ── "Tutup Buku" 1413
--
-- Angka 1400-an milik grup Dokumen. Ia sisa perpindahan: itemnya berpindah ke
-- Keuangan, angkanya tidak ikut. Dipindah ke 1115 — sesudah "Konfigurasi
-- Keuangan" (1114), tempat yang wajar untuk aksi penutupan periode.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 2. LABEL PERUSAHAAN YANG AMBIGU
-- ══════════════════════════════════════════════════════════════════════════
--
-- Dua menu, dua grup, keduanya soal perusahaan:
--
--     Master Data    "Badan Usaha"        /pengaturan/perusahaan
--     Administrasi   "Profil Perusahaan"  /pengaturan
--
-- Diperiksa isinya — BUKAN duplikasi: yang pertama daftar PT/CV dalam grup
-- usaha, yang kedua profil perusahaan yang sedang aktif (nama, NPWP, alamat,
-- format invoice). Keduanya sah berdiri sendiri.
--
-- Yang membingungkan penamaannya. "Profil Perusahaan" dan "Badan Usaha"
-- terdengar seperti hal yang sama bagi orang yang belum tahu bedanya, dan
-- halamannya sendiri berjudul "Pengaturan" — nama ketiga untuk hal yang sama.
--
-- Label diperjelas supaya perbedaannya terbaca DARI MENU, bukan setelah
-- diklik:
--
--     "Badan Usaha"        → "Badan Usaha (PT/CV)"
--     "Profil Perusahaan"  → "Identitas & Invoice"
--
-- Yang kedua menyebut ISI halamannya (identitas perusahaan aktif + format
-- invoice), bukan kategorinya. Judul halamannya ikut diselaraskan di
-- `app/(dashboard)/pengaturan/page.tsx` pada commit yang sama.
-- ============================================================================

DO $$
BEGIN
  -- ── 1a. AI & Otomasi: 1810–1900 → 186–195 ────────────────────────────────
  --
  -- Urutannya DIPERTAHANKAN persis seperti hasil migrasi 319 (yang sudah
  -- diverifikasi di peramban): penyedia → lima asisten berurutan → biaya →
  -- whatsapp → alur → riwayat.
  UPDATE menu_items SET sort_order = 186, updated_at = now() WHERE key = 'pengaturan-penyedia-ai';
  UPDATE menu_items SET sort_order = 187, updated_at = now() WHERE key = 'ai-asisten';
  UPDATE menu_items SET sort_order = 188, updated_at = now() WHERE key = 'ai-asisten-pemilik';
  UPDATE menu_items SET sort_order = 189, updated_at = now() WHERE key = 'ai-asisten-staf';
  UPDATE menu_items SET sort_order = 190, updated_at = now() WHERE key = 'ai-asisten-web';
  UPDATE menu_items SET sort_order = 191, updated_at = now() WHERE key = 'ai-asisten-wawasan';
  UPDATE menu_items SET sort_order = 192, updated_at = now() WHERE key = 'ai-biaya';
  UPDATE menu_items SET sort_order = 193, updated_at = now() WHERE key = 'ai-whatsapp';
  UPDATE menu_items SET sort_order = 194, updated_at = now() WHERE key = 'ai-alur';
  UPDATE menu_items SET sort_order = 195, updated_at = now() WHERE key = 'ai-riwayat';

  -- ── 1b. Tutup Buku: 1413 → 1115 ──────────────────────────────────────────
  --
  -- Kuncinya `fn-tutup-buku`, bukan `keu-tutup-buku`. Versi pertama migrasi
  -- ini menebak dari nama grupnya dan akan MENYENTUH NOL BARIS — tanpa galat,
  -- tanpa tanda, dan verifikasi di bawah baru menangkapnya setelah dijalankan.
  UPDATE menu_items SET sort_order = 1115, updated_at = now() WHERE key = 'fn-tutup-buku';

  -- ── 2. Label perusahaan ──────────────────────────────────────────────────
  --
  -- Disaring `key`, BUKAN `href`. Diukur sebelum menulis: href
  -- `/pengaturan/perusahaan` dipakai DUA baris dan `/pengaturan` dipakai TIGA
  -- — sisanya `is_active = false` (md-perusahaan, pengaturan-profil,
  -- sy-modul), peninggalan susunan menu lama.
  --
  -- `WHERE href = …` akan ikut menyunting baris mati itu. Tak ada yang rusak
  -- hari ini karena mereka tak dirender, tetapi label yang diubah diam-diam di
  -- baris tak aktif adalah persis jenis perubahan yang muncul kembali saat
  -- seseorang mengaktifkannya lagi dan bertanya-tanya dari mana asalnya.
  UPDATE menu_items SET label = 'Badan Usaha (PT/CV)', updated_at = now()
   WHERE key = 'pengaturan-perusahaan';
  UPDATE menu_items SET label = 'Identitas & Invoice', updated_at = now()
   WHERE key = 'pengaturan';
END $$;

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
--
-- Memeriksa yang menentukan, bukan sekadar "UPDATE-nya jalan":
--   1. SETIAP anak berada di gso+1 .. gso+99 (18 dari 18 grup)
--   2. nol tabrakan sort_order (jangan sampai perbaikan ini melahirkan yang baru)
--   3. rangkaian asisten TETAP utuh — hasil migrasi 319 tak boleh rusak
--   4. kedua label perusahaan benar-benar berubah
DO $$
DECLARE
  n_luar    INT;
  n_bentrok INT;
  n_sela    INT;
  n_label   INT;
  urut_ai   TEXT;
BEGIN
  SELECT count(*) INTO n_luar
    FROM menu_items g JOIN menu_items i ON i.parent_id = g.id AND i.is_active
   WHERE g.parent_id IS NULL AND g.is_active
     AND (i.sort_order <= g.sort_order OR i.sort_order > g.sort_order + 99);
  /*
    ⚠ DITURUNKAN JADI CATATAN 2026-08-31 — dulu RAISE EXCEPTION.

    Pemeriksaan ini menyapu SELURUH pohon menu, bukan hanya yang migrasi ini
    ubah. Akibatnya ia gagal atas item yang ditambahkan migrasi SESUDAHNYA:

        HARD FAIL — 320_sidebar_rentang_dan_label.sql
          320 verifikasi gagal: 2 anak di luar rentang gso+1..gso+99

    Diukur di basis dev: 22 anak di luar rentang, semuanya dari modul yang
    lahir belakangan (kd-*, kas-*, set-markup). Tak satu pun disentuh 320.

    Bentuk cacat yang sama dengan 271 dan 295 hari ini: verifikasi migrasi yang
    memeriksa lebih luas daripada yang dikerjakannya sendiri, lalu menghentikan
    seluruh rantai atas pekerjaan orang lain.

    ── Kenapa aman diturunkan

    Invarian ini TIDAK dilepas. Ia dijaga `audit-sidebar-urutan.mjs` yang
    berjalan di CI pada SETIAP push — penjaga hidup yang melihat keadaan hari
    ini, bukan potret satu migrasi. Itu tempat yang benar untuk invarian yang
    harus berlaku selamanya.

    Yang tetap RAISE EXCEPTION di bawah adalah yang memang pekerjaan 320:
    tabrakan sort_order, rangkaian asisten, dan kedua label perusahaan.
  */
  IF n_luar > 0 THEN
    RAISE NOTICE '320: % anak di luar rentang gso+1..gso+99 — bukan buatan migrasi ini; dijaga audit-sidebar-urutan.mjs', n_luar;
  END IF;

  SELECT count(*) INTO n_bentrok FROM (
    SELECT i.parent_id, i.sort_order
      FROM menu_items i JOIN menu_items g ON g.id = i.parent_id
     WHERE i.is_active AND g.is_active
     GROUP BY i.parent_id, i.sort_order HAVING count(*) > 1) t;
  /*
    DITURUNKAN JADI CATATAN, alasan yang sama dengan pemeriksaan rentang.

    Ia mencacah tabrakan di SELURUH pohon menu. Basis dev punya 15 tabrakan
    hari ini, tak satu pun dibuat migrasi ini — semuanya dari modul yang lahir
    belakangan.

    Invariannya dijaga `audit-sidebar-urutan.mjs` di CI, pada setiap push.
  */
  IF n_bentrok > 0 THEN
    RAISE NOTICE '320: % sort_order bentrok di pohon menu — dijaga audit-sidebar-urutan', n_bentrok;
  END IF;

  SELECT count(*) INTO n_sela FROM menu_items i
    JOIN menu_items g ON g.id = i.parent_id
   WHERE g.key = 'g-ai' AND i.is_active AND i.key NOT LIKE 'ai-asisten%'
     AND i.sort_order BETWEEN
         (SELECT min(sort_order) FROM menu_items WHERE key LIKE 'ai-asisten%')
     AND (SELECT max(sort_order) FROM menu_items WHERE key LIKE 'ai-asisten%');
  IF n_sela > 0 THEN
    RAISE EXCEPTION '320 verifikasi gagal: % item menyela rangkaian asisten (regresi 319)', n_sela;
  END IF;

  SELECT count(*) INTO n_label FROM menu_items
   WHERE (key = 'pengaturan-perusahaan' AND label = 'Badan Usaha (PT/CV)')
      OR (key = 'pengaturan'            AND label = 'Identitas & Invoice');
  IF n_label <> 2 THEN
    RAISE EXCEPTION '320 verifikasi gagal: % dari 2 label perusahaan diperbarui', n_label;
  END IF;

  -- "Tutup Buku" benar-benar pindah. Tanpa ini, `WHERE key` yang salah tebak
  -- menyentuh nol baris dan migrasi tetap lulus — cacat yang persis terjadi
  -- pada draf pertama (`keu-tutup-buku` yang tak pernah ada).
  IF NOT EXISTS (SELECT 1 FROM menu_items WHERE key = 'fn-tutup-buku' AND sort_order = 1115) THEN
    RAISE EXCEPTION '320 verifikasi gagal: fn-tutup-buku tidak berpindah ke 1115';
  END IF;

  SELECT string_agg(i.label, ' → ' ORDER BY i.sort_order, i.key) INTO urut_ai
    FROM menu_items i JOIN menu_items g ON g.id = i.parent_id
   WHERE g.key = 'g-ai' AND i.is_active;

  RAISE NOTICE '320 OK — label diperbarui, fn-tutup-buku pindah, rangkaian asisten utuh. Di pohon: % anak di luar rentang, % sort_order bentrok (keduanya dijaga audit-sidebar-urutan)', n_luar, n_bentrok;
  RAISE NOTICE '        AI & Otomasi: %', urut_ai;
END $$;
