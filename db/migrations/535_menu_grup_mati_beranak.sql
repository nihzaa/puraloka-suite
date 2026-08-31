-- ============================================================================
-- 535 — 100 menu AKTIF bergantung pada grup induk yang MATI
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- `audit-sidebar-urutan.mjs` merah:
--
--     ❌ MERAH: 100 item AKTIF bergantung pada grup yang MATI.
--
-- Sidebar merender anak DI DALAM induknya. Induk `is_active = false` tak
-- pernah dirender — dan seluruh anaknya ikut hilang, meski anak-anak itu
-- sendiri aktif, punya izin, dan halamannya jalan.
--
-- Yang hilang bukan halaman sepele. Diukur sebelum migrasi ini:
--
--     AI & Otomasi    16 anak   Asisten AI, Katalog Otomasi, Ingatan Asisten,
--                               Preferensi Pesan, Wawasan Portofolio, …
--     Administrasi    14 anak
--     Master Data     13 anak   Klien, Supplier, Katalog Material, …
--     Akuntansi        7 anak
--     Mutu & K3        6 anak
--     …                          total 100
--
-- Semua bisa dibuka dengan mengetik URL. Tak satu pun bisa ditemukan dengan
-- mengklik. Tak ada galat: sidebar memang hanya merender apa yang aktif.
--
-- ── DUA cacat berbeda, dua perbaikan berlawanan
--
-- Membedakannya penting; menyamakannya merusak salah satunya.
--
-- **(A) Grup MATI yang punya KEMBAR HIDUP** — 45 anak, 5 grup.
--
--   "Pengadaan", "Gudang & Material", "Mandor & Subkon", "Alat & Aset",
--   "Master Data" masing-masing ada DUA baris `parent_id IS NULL` berlabel
--   sama: satu hidup, satu mati. Anaknya menggantung di yang mati.
--
--   Ini duplikat, bukan grup yang sengaja dipensiunkan. Menyalakan yang mati
--   akan memberi DUA grup berjudul sama di sidebar — memperbaiki satu cacat
--   dengan membuat cacat yang lebih membingungkan.
--
--   Perbaikannya: PINDAHKAN anaknya ke kembar yang hidup.
--
-- **(B) Grup MATI tanpa pengganti** — 55 anak, 8 grup.
--
--   "AI & Otomasi", "Administrasi", "Akuntansi", "Mutu & K3", "Proyek",
--   "Estimasi & Anggaran", "Pelaporan & BI", "CRM & Tender" tak punya kembar.
--   Anaknya tak punya rumah lain.
--
--   Perbaikannya: NYALAKAN induknya.
--
-- ⚠ Kenapa menyalakan induk itu AMAN, dan kenapa saya memeriksanya dulu.
--
-- Grup yang dimatikan bisa berarti "fiturnya belum siap". Kalau begitu,
-- menyalakannya menampilkan menu ke halaman yang belum ada.
--
-- Yang diukur sebelum menulis ini: kedelapan grup HANYA dinyalakan bila masih
-- punya anak AKTIF, dan anak aktif itu menunjuk `href` yang halamannya sudah
-- dijaga `audit-nav-yatim.mjs` + `audit-klaim-layar-nyata.mjs`. Grup mati
-- yang anaknya juga mati TIDAK disentuh migrasi ini — kalau memang
-- dipensiunkan, ia tetap pensiun.
--
-- ── Kenapa BUKAN memindahkan semuanya ke satu grup baru
--
-- Cara itu lebih pendek ditulis dan salah: ia membuang pengelompokan yang
-- sudah dipahami pengguna, dan menaruh Asisten AI bersebelahan dengan Klien.
-- Struktur menu adalah pengetahuan, bukan sekadar susunan.
-- ============================================================================

-- ── (A) Anak dipindahkan ke kembar yang HIDUP ───────────────────────────────
--
-- Dicocokkan lewat LABEL, bukan `key`: pasangan kembar ini memang lahir dari
-- dua sumber berbeda dan kuncinya tak sama. Label-nya identik persis — itulah
-- yang membuat keduanya duplikat.
--
-- ⚠ `sort_order` anak WAJIB ikut disesuaikan — dan saya salah menduga
-- sebaliknya.
--
-- Dugaan pertama saya: biarkan saja, 530 sudah memberi jarak, dan menyentuhnya
-- berisiko membangunkan bentrok. Dijalankan dengan dugaan itu, penjaga
-- berpindah merah:
--
--     anak di luar rentang  : 0  →  7
--
-- Sebabnya jelas begitu terlihat: konvensinya `gso+1 .. gso+99` — anak hidup
-- di rentang milik INDUKNYA. Tujuh anak "Master Data" membawa sort_order lama
-- 57–99 dari induk matinya (gso 0), sementara induk barunya ada di 100, jadi
-- rentang sahnya 101–199.
--
-- Memindahkan anak antar-induk KARENA ITU selalu berarti menomori ulang. Yang
-- "aman karena tak menyentuh apa pun" justru meninggalkan anak di rentang
-- milik grup lain — dan itu tak bergejala sampai grup berikutnya lahir di
-- rentang yang sudah ditempati.
UPDATE menu_items a
   SET parent_id = hidup.id,
       updated_at = now()
  FROM menu_items mati
  JOIN menu_items hidup
    ON hidup.parent_id IS NULL
   AND hidup.is_active
   AND hidup.label = mati.label
   AND hidup.id <> mati.id
 WHERE a.parent_id = mati.id
   AND a.is_active
   AND mati.parent_id IS NULL
   AND NOT mati.is_active;

-- ── (A2) Anak yang PINDAH dinomori ulang ke rentang induk barunya ───────────
--
-- Konvensi repo: anak hidup di `gso+1 .. gso+99`, dengan gso = sort_order
-- induknya. Dijaga `audit-sidebar-urutan.mjs`.
--
-- Dinomori berjarak 7 supaya masih ada ruang menyisipkan menu baru di
-- antaranya tanpa menomori ulang tetangganya — pola yang sama dengan
-- migrasi 530. Urutan RELATIF antar-anak dipertahankan (`ORDER BY sort_order`),
-- jadi susunan yang sudah dikenal pengguna tidak teracak.
--
-- Idempoten: dijalankan dua kali memberi hasil yang sama, karena nomornya
-- dihitung dari peringkat, bukan ditambahkan ke nilai yang ada.
WITH urut AS (
  SELECT a.id,
         g.sort_order + 1 + (row_number() OVER (
           PARTITION BY a.parent_id ORDER BY a.sort_order, a.label
         ) - 1) * 7 AS baru
    FROM menu_items a
    JOIN menu_items g ON g.id = a.parent_id
   WHERE a.is_active
     AND g.parent_id IS NULL
     AND g.is_active
     -- Hanya grup yang benar-benar punya anak di luar rentang. Menomori ulang
     -- SELURUH sidebar akan mengacak grup yang tak bermasalah, dan diff-nya
     -- jadi mustahil ditinjau.
     AND EXISTS (
       SELECT 1 FROM menu_items x
        WHERE x.parent_id = g.id AND x.is_active
          AND (x.sort_order <= g.sort_order OR x.sort_order > g.sort_order + 99)
     )
)
UPDATE menu_items m
   SET sort_order = u.baru,
       updated_at = now()
  FROM urut u
 WHERE m.id = u.id
   AND m.sort_order IS DISTINCT FROM u.baru;

-- ── (B) Induk tanpa pengganti DINYALAKAN ────────────────────────────────────
--
-- Hanya yang MASIH punya anak aktif. Grup mati tanpa anak aktif dibiarkan
-- mati: itu grup yang memang dipensiunkan, dan menyalakannya menambah menu
-- kosong.
UPDATE menu_items g
   SET is_active = true,
       updated_at = now()
 WHERE g.parent_id IS NULL
   AND NOT g.is_active
   AND EXISTS (
     SELECT 1 FROM menu_items a
      WHERE a.parent_id = g.id AND a.is_active
   )
   AND NOT EXISTS (
     SELECT 1 FROM menu_items h
      WHERE h.parent_id IS NULL AND h.is_active AND h.label = g.label AND h.id <> g.id
   );

-- ── (C) Grup beranak TIDAK boleh punya href sendiri ─────────────────────────
--
-- Ditemukan dari menjalankan penjaganya, bukan dari membaca kode:
--
--     ❌ MERAH: 4 item menu berbagi 2 href.
--        2  /mutu       Ikhtisar Mutu · Mutu & K3
--        2  /otomasi    AI & Otomasi · Ikhtisar Otomasi
--
-- Dua grup yang dihidupkan (A/B di atas) membawa `href` sendiri, dan href itu
-- SAMA dengan anaknya yang bernama "Ikhtisar …". Sesudah induknya hidup,
-- sidebar menampilkan dua tautan ke halaman yang sama — satu di judul grup,
-- satu di anak pertamanya.
--
-- Aturan sesudah migrasi 232: SATU route = SATU link sidebar. Grup yang
-- BERANAK adalah wadah; yang ditautkan anaknya.
--
-- ⚠ Hanya grup yang PUNYA anak aktif. `beranda` juga ber-href (/dashboard)
-- tetapi tak beranak — ia memang tautan, bukan wadah, dan mengosongkannya
-- membuat menu yang tak bisa diklik ke mana pun.
--
-- ⚠ Dan pembanding href-nya TIDAK boleh dibatasi ke anak SENDIRI.
--
-- Percobaan pertama menulis `a.parent_id = g.id`, dan verifikasi ke-5 di bawah
-- MENOLAK migrasinya — "2 href dipakai lebih dari satu menu aktif". Diukur
-- setelahnya: kedua "Ikhtisar" itu bernaung di grup LAIN.
--
--     yt-mutu     /mutu      induknya g-qaqc   (Rencana & Uji Mutu)
--     yt-otomasi  /otomasi   induknya g-sistem (Layanan & Plafon AI)
--
-- Aturannya SATU route = SATU link di seluruh sidebar, bukan sekadar di dalam
-- satu keluarga. Yang menahan saya dari perbaikan setengah jadi bukan
-- ketelitian membaca, melainkan blok verifikasi yang menolak dijalankan.
UPDATE menu_items g
   SET href = NULL,
       updated_at = now()
 WHERE g.parent_id IS NULL
   AND g.is_active
   AND g.href IS NOT NULL
   AND EXISTS (SELECT 1 FROM menu_items a WHERE a.parent_id = g.id AND a.is_active)
   AND EXISTS (
     SELECT 1 FROM menu_items lain
      WHERE lain.is_active AND lain.href = g.href AND lain.id <> g.id
   );

-- ============================================================================
-- VERIFIKASI
-- ============================================================================
DO $$
DECLARE
  v_yatim   INT;
  v_bentrok INT;
  v_kembar  INT;
  v_rentang INT;
  v_href    INT;
BEGIN
  -- 1. Tak boleh ada lagi anak aktif di bawah induk mati. Ini angka yang
  --    dimerahkan penjaga; kalau masih > 0, migrasi ini tak menyelesaikan
  --    apa pun.
  SELECT count(*) INTO v_yatim
    FROM menu_items a JOIN menu_items g ON g.id = a.parent_id
   WHERE a.is_active AND NOT g.is_active AND g.parent_id IS NULL;

  IF v_yatim <> 0 THEN
    RAISE EXCEPTION '535 gagal: masih % anak aktif di bawah induk MATI', v_yatim;
  END IF;

  -- 2. Tak boleh MEMBUAT grup berjudul kembar yang sama-sama hidup. Inilah
  --    cacat yang muncul kalau (A) dan (B) tertukar — dan ia tak akan
  --    mengeluarkan galat, cuma dua menu identik di sidebar.
  SELECT count(*) INTO v_kembar FROM (
    SELECT label FROM menu_items
     WHERE parent_id IS NULL AND is_active
     GROUP BY label HAVING count(*) > 1
  ) x;

  IF v_kembar <> 0 THEN
    RAISE EXCEPTION '535 gagal: % label grup HIDUP muncul lebih dari sekali', v_kembar;
  END IF;

  -- 3. Migrasi 530 baru saja menihilkan bentrok sort_order. Migrasi ini
  --    memindahkan anak antar-induk, dan itu bisa membangunkannya kembali:
  --    dua anak dari induk berbeda yang kebetulan ber-sort_order sama kini
  --    bersaudara.
  SELECT count(*) INTO v_bentrok FROM (
    SELECT parent_id, sort_order FROM menu_items
     WHERE is_active AND parent_id IS NOT NULL
     GROUP BY parent_id, sort_order HAVING count(*) > 1
  ) y;

  IF v_bentrok <> 0 THEN
    RAISE EXCEPTION '535 gagal: % bentrok sort_order antar-saudara — 530 dibatalkan diam-diam', v_bentrok;
  END IF;

  -- 4. Anak WAJIB berada di rentang induknya (gso+1 .. gso+99).
  --
  --    Pemeriksaan ini ditambahkan SESUDAH versi pertama migrasi ini melanggar
  --    aturannya sendiri: memindahkan anak tanpa menomori ulang membuat
  --    "anak di luar rentang" naik 0 → 7. Ketiga pemeriksaan di atas semuanya
  --    HIJAU saat itu — mereka menjaga hal lain.
  --
  --    Pelajarannya: blok verifikasi hanya menjaga yang terpikir saat
  --    menulisnya, dan yang menemukan sisanya adalah menjalankan penjaganya.
  SELECT count(*) INTO v_rentang
    FROM menu_items a JOIN menu_items g ON g.id = a.parent_id
   WHERE a.is_active AND g.is_active AND g.parent_id IS NULL
     AND (a.sort_order <= g.sort_order OR a.sort_order > g.sort_order + 99);

  IF v_rentang <> 0 THEN
    RAISE EXCEPTION '535 gagal: % anak di luar rentang gso+1..gso+99', v_rentang;
  END IF;

  -- 5. Nol href yang dipakai lebih dari satu menu aktif. Dua tautan ke halaman
  --    yang sama bukan sekadar tak rapi: pengguna yang menekan salah satunya
  --    tak pernah tahu keduanya sama, dan menu yang "tak berfungsi" itu
  --    sebenarnya berfungsi.
  SELECT count(*) INTO v_href FROM (
    SELECT href FROM menu_items
     WHERE is_active AND href IS NOT NULL
     GROUP BY href HAVING count(*) > 1
  ) z;

  IF v_href <> 0 THEN
    RAISE EXCEPTION '535 gagal: % href dipakai lebih dari satu menu aktif', v_href;
  END IF;
END $$;
