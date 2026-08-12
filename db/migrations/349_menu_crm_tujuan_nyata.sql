-- ════════════════════════════════════════════════════════════════════════════
-- 349 — Menu CRM menunjuk halaman yang benar-benar ada
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Yang diukur 2026-08-13
--
--     crm-lead      → /crm/prospek     is_active = true,  kesiapan = 'rencana'
--     crm-proposal  → /crm/penawaran   is_active = true,  kesiapan = 'rencana'
--
-- Tak satu pun dari kedua halaman itu pernah ada. Disisir: tidak ada direktori
-- `crm/` sama sekali di `apps/web/app/(dashboard)/`. Keduanya AKTIF di sidebar,
-- jadi siapa pun yang mengkliknya menemui 404.
--
-- ── `crm-lead` bukan pekerjaan yang tertunda — ia SUDAH ADA, dengan nama lain
--
-- Register tender `bids` (migrasi 147) sudah memikul perannya: status
-- prospek → go/no_go → diajukan → menang/kalah, dengan halaman `/tender`
-- setinggi 571 baris. Dan CRM pipeline penuh (lead → opportunity → quote,
-- probabilitas, tanggal follow-up) **sengaja dicoret** — dinyatakan di
-- `PETA-PRIORITAS-ERP.md` §"Sengaja tidak dibangun" dan ditegaskan ulang di
-- migrasi 147:15-20:
--
--     "yang dibutuhkan cuma register tender. Jadi ini SATU tabel, bukan
--      lead→opportunity→quote."
--
-- Jadi menandainya 'rencana' selama ini menyiratkan ada pekerjaan tertunda,
-- padahal keputusannya sudah diambil.
--
-- Tetapi ia TIDAK diarahkan ke `/tender` sebagai tautan aktif kedua: baris
-- `tender` ("Register Tender") sudah menempati rute itu dan aktif. Aturan 232
-- — satu rute, satu tautan aktif — dan `audit-menu-berbagi-href` memerahkannya
-- saat rancangan pertama berkas ini melakukannya. Penjaganya benar.
--
-- Yang dilakukan: `crm-lead` DINONAKTIFKAN. Perannya sudah dipikul baris lain
-- yang tampil; membiarkan dua tautan ke halaman sama hanya membuat penanda
-- "Anda di sini" menyala di dua tempat.
--
-- ── `crm-proposal` MEMANG belum ada, dan tetap ditandai begitu
--
-- Yang ada baru ANGKA penawaran (`bids.bid_value`) — bukan dokumennya. Tak ada
-- header (nomor, tanggal, masa berlaku, syarat) maupun baris rincian. Ia tetap
-- `kesiapan = 'rencana'`, dan href-nya dipindahkan dari `/crm/penawaran` yang
-- mati ke `/tender` — bukan supaya diklik (ia dinonaktifkan, lihat di bawah),
-- melainkan supaya bila kelak dihidupkan ia tak menghidupkan tautan rusak.
--
-- Aturannya (migrasi 241): menu ber-`rencana` boleh tampil dengan titik abu
-- supaya yang belum digarap tak terlupa. Yang tak boleh adalah menunjuk URL
-- mati — itu bukan "belum digarap", itu tautan rusak.
--
-- Karena `/tender` sudah dipegang baris lain (aturan 232), `crm-proposal` juga
-- dinonaktifkan sampai halamannya benar-benar dibangun. Ia tetap tercatat
-- `rencana` di tabel, jadi tak hilang dari daftar yang harus digarap — yang
-- hilang hanya tautan yang menjanjikan halaman tak ada.
--
-- Idempoten; verifikasi GAGAL KERAS.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Prospek: sudah ada sebagai Register Tender, jadi ini dipensiunkan ────
UPDATE menu_items
   SET href = '/tender',
       kesiapan = 'hidup',
       is_active = FALSE,
       updated_at = now()
 WHERE key = 'crm-lead';

-- ── 2. Dokumen penawaran: belum ada, jadi tak ditampilkan ───────────────────
UPDATE menu_items
   SET href = '/tender',
       kesiapan = 'rencana',
       is_active = FALSE,
       updated_at = now()
 WHERE key = 'crm-proposal';

-- ── 3. Verifikasi ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_mati INT;
  v_ganda INT;
  v_lead TEXT;
  v_prop TEXT;
BEGIN
  SELECT href INTO v_lead FROM menu_items WHERE key = 'crm-lead';
  SELECT href INTO v_prop FROM menu_items WHERE key = 'crm-proposal';

  IF v_lead IS DISTINCT FROM '/tender' THEN
    RAISE EXCEPTION '349: crm-lead menunjuk % — bukan /tender', COALESCE(v_lead, 'NULL');
  END IF;
  IF v_prop IS DISTINCT FROM '/tender' THEN
    RAISE EXCEPTION '349: crm-proposal menunjuk % — bukan /tender', COALESCE(v_prop, 'NULL');
  END IF;

  -- Tak boleh ada menu AKTIF yang masih menunjuk /crm/* — direktori itu tak
  -- pernah ada. Diperiksa dari POLANYA, bukan dari dua kunci yang kebetulan
  -- saya ingat: kalau ada baris ketiga dengan penyakit sama, ia harus ikut
  -- merah, bukan lolos karena namanya tak disebut di sini.
  SELECT count(*) INTO v_mati
    FROM menu_items WHERE is_active AND href LIKE '/crm/%';
  IF v_mati > 0 THEN
    RAISE EXCEPTION '349: masih ada % menu aktif menunjuk /crm/* yang halamannya tak ada', v_mati;
  END IF;

  -- Aturan 232: satu rute = satu tautan AKTIF.
  SELECT count(*) INTO v_ganda
    FROM (SELECT href FROM menu_items
           WHERE is_active AND href IS NOT NULL
           GROUP BY href HAVING count(*) > 1) t;
  IF v_ganda > 0 THEN
    RAISE EXCEPTION '349: % href dipakai lebih dari satu tautan aktif', v_ganda;
  END IF;

  RAISE NOTICE '349 OK — crm-lead & crm-proposal tak lagi menunjuk halaman mati; nol href aktif kembar';
END $$;
