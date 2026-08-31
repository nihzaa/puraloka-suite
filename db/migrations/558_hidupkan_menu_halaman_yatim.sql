-- ============================================================================
-- 558 — 53 halaman jadi TAK PUNYA PINTU; menunya dihidupkan kembali
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- Sesudah rantai 164 migrasi tertinggal dijalankan (2026-09-01), `menu_items`
-- berakhir dengan 276 dari 420 baris NONAKTIF — 246 di antaranya berubah pada
-- hari itu juga. `audit-nav-yatim.mjs` merah:
--
--     halaman (page.tsx)  : 298
--     href sidebar (DB)   : 112     ← sebelumnya 151
--     ❌ YATIM — halaman tanpa satu pun tautan nav: 36
--
-- Halamannya JADI dan berfungsi; yang hilang jalan masuknya. Pengguna hanya
-- bisa membukanya dengan mengetik URL — dan itu berarti fitur yang sudah
-- dibangun tak terpakai.
--
-- Enam belas GRUP INDUK ikut mati, bersamanya 104 anak berhalaman nyata.
-- Diukur: dari 104 anak itu, NOL yang aktif. Bukan sekadar induk yang padam —
-- seluruh cabangnya padam.
--
-- ── Kenapa BUKAN sekadar "nyalakan semua yang mati"
--
-- Diukur lebih dulu, dan angkanya mengubah rencana:
--
--     menu mati berhalaman nyata : 167
--       href SUDAH dipegang menu aktif : 98   ← menyalakannya = menu GANDA
--       href tanpa menu aktif           : 53   ← ini yang benar-benar yatim
--
-- Sembilan puluh delapan di antaranya halamannya SUDAH bisa dibuka lewat menu
-- lain. Menyalakannya melanggar aturan 232 (satu rute = satu tautan) yang
-- dijaga `audit-menu-berbagi-href` dengan ambang NOL — dan bagi pengguna
-- artinya dua tombol yang membuka layar yang sama persis.
--
-- ── Aturan memilih saat satu href punya DUA kandidat mati
--
-- Enam belas href punya lebih dari satu menu mati. Yang dipilih: kunci
-- BERNAMA, bukan yang berawalan `yt-`.
--
--     /k3          hse-inspeksi  ✓   yt-k3          ✗
--     /mutu/audit  qc-audit      ✓   yt-mutu-audit  ✗
--     /risiko      rk-register   ✓   yt-risiko      ✗
--
-- Alasannya: `yt-*` adalah menu YATIM yang dibuat massal oleh migrasi 531
-- untuk menambal halaman tanpa tautan — nama generik, label seadanya. Yang
-- bernama lahir dari penataan menu yang disengaja, dengan label dan ikon yang
-- dipilih orang. Yang bernama menang atas yang otomatis; pola yang sama sudah
-- dipakai migrasi 338 (`hr-reimburse` vs `yt-sdm-klaim`).
--
-- ── Induk ikut dinyalakan, tapi HANYA yang beranak nyala
--
-- Sidebar merender anak DI DALAM induknya: anak menyala di bawah induk padam
-- tetap tak terlihat. Tiga belas grup ikut dinyalakan — dan hanya yang
-- sesudah migrasi ini punya minimal satu anak aktif, supaya tak lahir grup
-- kosong yang cuma menambah baris di sidebar.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

-- ── (1) Menu anak: hidupkan yang href-nya TAK dipegang menu aktif ───────────
--
-- `DISTINCT ON (href)` dengan urutan `key NOT LIKE 'yt-%'` lebih dulu:
-- satu href dapat TEPAT SATU menu, dan yang bernama menang.
WITH kandidat AS (
  SELECT DISTINCT ON (m.href) m.id, m.href
    FROM menu_items m
    JOIN menu_items g ON g.id = m.parent_id
   WHERE NOT m.is_active
     AND m.href LIKE '/%'
     AND m.href NOT LIKE '/m/%'
     AND NOT EXISTS (
       SELECT 1 FROM menu_items a
        WHERE a.is_active AND a.href = m.href)
   ORDER BY m.href, (m.key LIKE 'yt-%'), m.key
)
UPDATE menu_items t
   SET is_active = TRUE, updated_at = now()
  FROM kandidat k
 WHERE t.id = k.id;

-- ── (2) Induk: hidupkan yang kini punya anak aktif ──────────────────────────
UPDATE menu_items g
   SET is_active = TRUE, updated_at = now()
 WHERE g.parent_id IS NULL
   AND NOT g.is_active
   AND EXISTS (
     SELECT 1 FROM menu_items a
      WHERE a.parent_id = g.id AND a.is_active);

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  n_ganda    INT;
  v_ganda    TEXT;
  n_gantung  INT;
  n_aktif    INT;
BEGIN
  /*
    PAGAR TERPENTING: nol href dipegang lebih dari satu menu aktif.

    Kalau blok (1) salah dan menyalakan dua menu untuk satu halaman, yang
    gagal migrasi ini — bukan `audit-menu-berbagi-href` di CI besok, jauh
    dari sebabnya.
  */
  SELECT count(*), string_agg(href, ', ') INTO n_ganda, v_ganda
    FROM (SELECT href FROM menu_items
           WHERE is_active AND href IS NOT NULL
           GROUP BY href HAVING count(*) > 1) x;
  IF n_ganda > 0 THEN
    RAISE EXCEPTION '558 gagal: % href dipegang >1 menu aktif: %',
      n_ganda, left(coalesce(v_ganda, ''), 200);
  END IF;

  /*
    Anak aktif di bawah induk padam tetap tak terlihat — itu cacat yang
    persis sedang diperbaiki, dan blok (2) harus menutupnya seluruhnya.
  */
  SELECT count(*) INTO n_gantung
    FROM menu_items a JOIN menu_items g ON g.id = a.parent_id
   WHERE a.is_active AND NOT g.is_active;
  IF n_gantung > 0 THEN
    RAISE EXCEPTION '558 gagal: % menu aktif di bawah induk padam', n_gantung;
  END IF;

  SELECT count(*) INTO n_aktif FROM menu_items WHERE is_active;
  RAISE NOTICE '558 OK — % menu aktif, nol href ganda, nol anak menggantung', n_aktif;
END $$;
