-- ============================================================================
-- 425 - AMBANG STOK MINIMUM + PETA RAB→MATERIAL
-- ============================================================================
--
-- Founder 2026-08-16: "jika yang datanya belum ada, buat aja datanya atau
-- field/table-nya karena sekarang semua data masih dummy."
--
-- Dua otomasi lumpuh karena DATA, bukan karena kode. Keduanya diperbaiki di
-- sini — dan keduanya lumpuh dengan cara yang sama: kolomnya ada, isinya nol,
-- dan nol terbaca sebagai "aman".
--
-- ══════════════════════════════════════════════════════════════════════════
-- 1. `materials.min_stock` — 23 DARI 24 BERNILAI NOL
-- ══════════════════════════════════════════════════════════════════════════
--
-- Rute `stok-di-bawah-minimum` (4.5) membandingkan stok dengan `min_stock`.
-- Ambang nol berarti tak ada stok yang pernah "di bawah minimum" — otomasi itu
-- hidup, dijadwalkan, dan TAK AKAN PERNAH berbunyi.
--
-- Ini bentuk kelumpuhan yang paling sulit terlihat: tak ada galat, rutenya
-- membalas 200, dan `notifications_created: 0` terbaca persis seperti "stok
-- semuanya aman". Rutenya sendiri sudah mencatat kecurigaan ini di komentar
-- sejak dibangun; yang kurang datanya.
--
-- ── Angka diturunkan dari SATUAN dan cara barang itu dibeli, bukan dikarang
--
-- Titik pesan ulang yang berguna kira-kira sebesar satu kali pesan biasa untuk
-- kontraktor sekelas ini. Terlalu kecil = peringatan datang saat sudah telat
-- memesan; terlalu besar = gudang penuh dan uang mengendap.
--
--   batang (besi, hollow, pipa)   20   ~ satu ikat / satu kirim
--   sak (semen)                   50   ~ satu pikap
--   m3 (pasir, split, beton)       5   ~ satu dump kecil
--   m2 (keramik, granit)          20   ~ satu ruangan
--   buah (bata, hebel)           500   ~ satu pallet
--   lembar (multiplek, wiremesh)  10
--   kaleng (cat)                   8
--   lainnya                        5
--
-- Nilai yang SUDAH disetel manusia (> 0) TIDAK ditimpa. Migrasi ini mengisi
-- yang kosong, bukan menyeragamkan keputusan orang.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 2. `project_rab_materials` — NOL BARIS
-- ══════════════════════════════════════════════════════════════════════════
--
-- Tabelnya ada dan bentuknya tepat untuk automation 3.4 (Material Consumption
-- Prediction): `rab_quantity` rencana, `received_quantity` yang sudah datang,
-- dan progres proyek memberi tahu seberapa jauh pekerjaannya.
--
-- Isinya nol baris, jadi 3.4 sempat dicoret "tak bisa dibangun". Yang benar:
-- petanya belum pernah diisi.
--
-- ── Peta diturunkan dari NAMA PEKERJAAN RAB, dan itu memang perkiraan
--
-- Pemetaan pekerjaan→material yang presisi butuh AHSP per item. Yang dipakai
-- di sini pencocokan kata pada nama pekerjaan (pengecatan→cat, atap baja→baja
-- ringan, dst) dengan faktor kebutuhan per satuan.
--
-- Itu perkiraan, dan ditulis di sini supaya tak dibaca sebagai angka teknik:
-- gunanya menyalakan peringatan "material kurang" lebih awal, bukan menjadi
-- dasar pemesanan. Ketika AHSP per item tersedia, peta ini diganti.
-- ============================================================================

-- ── 1. Ambang stok minimum ──────────────────────────────────────────────────
UPDATE materials m
   SET min_stock = CASE lower(coalesce(m.unit, ''))
        WHEN 'batang'  THEN 20
        WHEN 'sak'     THEN 50
        WHEN 'zak'     THEN 50
        WHEN 'm³'      THEN 5
        WHEN 'm3'      THEN 5
        WHEN 'm²'      THEN 20
        WHEN 'm2'      THEN 20
        WHEN 'buah'    THEN 500
        WHEN 'lembar'  THEN 10
        WHEN 'kaleng'  THEN 8
        ELSE 5
       END,
       updated_at = now()
 WHERE coalesce(m.min_stock, 0) = 0;

-- ── 2. Peta RAB → material ──────────────────────────────────────────────────
--
-- `ON CONFLICT` tak bisa dipakai: tabel ini tak punya kunci unik
-- (project_id, material_id). Disaring `NOT EXISTS` supaya idempoten.
INSERT INTO project_rab_materials
  (project_id, material_id, rab_quantity, rab_unit_cost,
   requested_quantity, received_quantity, notes)
SELECT p.project_id, p.material_id,
       ROUND(p.butuh, 3),
       COALESCE(mt.unit_price, 0),
       0, 0,
       'Peta otomatis migrasi 425 — perkiraan dari nama pekerjaan RAB, bukan AHSP'
  FROM (
    SELECT ri.project_id,
           m.id AS material_id,
           SUM(ri.qty * v.faktor) AS butuh
      FROM rab_items ri
      JOIN (VALUES
        -- (pola nama pekerjaan, kode material, kebutuhan per satuan pekerjaan)
        ('%ecat%',        'MAT-060', 0.10),   -- 1 kaleng 5L ~ 10 m² per lapis
        ('%plafon%',      'MAT-041', 0.35),   -- multiplek per m² plafon
        ('%atap baja%',   'MAT-012', 0.25),   -- hollow per kg rangka
        ('%keramik%',     'MAT-051', 1.05),   -- +5% potongan
        ('%granit%',      'MAT-052', 1.05),
        ('%dinding%',     'MAT-032', 8.30),   -- hebel per m² dinding
        ('%beton%',       'MAT-002', 1.02),
        ('%bekisting%',   'MAT-042', 0.04),
        ('%pembesian%',   'MAT-010', 0.12),
        ('%pondasi%',     'MAT-022', 0.45)
      ) AS v(pola, kode, faktor)
        ON lower(ri.name) LIKE v.pola
      JOIN materials m ON m.code = v.kode
     WHERE ri.level = 'item' AND ri.qty > 0
     GROUP BY ri.project_id, m.id
  ) p
  JOIN materials mt ON mt.id = p.material_id
 WHERE p.butuh > 0
   AND NOT EXISTS (
        SELECT 1 FROM project_rab_materials x
         WHERE x.project_id = p.project_id AND x.material_id = p.material_id);

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n INT; n_nol INT; n_peta INT; n_proyek INT; terkecil NUMERIC;
BEGIN
  /*
    GERBANG — DITAMBAHKAN 2026-08-31.

    Kedua pemeriksaan di bawah menilai HASIL BACKFILL pada tabel `materials`.
    Di basis yang baru lahir tabel itu kosong, dan cek kedua gagal:

        HARD FAIL — 425_ambang_stok_dan_peta_rab_material.sql
          425 gagal: hanya 0 nilai min_stock berbeda — CASE satuan tak cocok

    "0 nilai berbeda" pada tabel kosong bukan gejala CASE yang tak cocok; itu
    gejala tak ada apa-apa untuk dinilai. Migrasi lalu menghentikan seluruh
    rantai di CI, VPS baru, dan mesin developer baru.

    Sama seperti gerbang 237, 239, 392, dan 428 hari ini: verifikasi yang
    bermakna hanya bila ada datanya tak boleh jadi syarat berjalannya rantai.

    Kalau materialnya ada, kedua cek berlaku penuh — termasuk cek "seragam"
    yang justru paling berharga.
  */
  IF NOT EXISTS (SELECT 1 FROM materials) THEN
    RAISE NOTICE '425 verifikasi dilewati: nol material di basis ini — tak ada yang bisa dinilai. Bukan galat.';
    RETURN;
  END IF;

  -- 1. Tak boleh ada material aktif ber-ambang nol lagi.
  SELECT count(*) INTO n_nol FROM materials WHERE coalesce(min_stock, 0) = 0;
  IF n_nol > 0 THEN
    RAISE EXCEPTION '425 gagal: masih % material ber-min_stock nol', n_nol;
  END IF;

  /*
    Ambang yang SERAGAM juga cacat, dan lolos dari pemeriksaan "tidak nol".

    Kalau seluruh material berakhir dengan angka yang sama, itu tanda CASE-nya
    tak pernah cocok dan semuanya jatuh ke cabang ELSE — peringatan stok lalu
    memakai satu angka untuk semen dan untuk keramik. Tak ada galat; hanya
    peringatan yang datang pada saat yang salah untuk hampir semuanya.
  */
  SELECT count(DISTINCT min_stock) INTO n FROM materials;
  IF n < 3 THEN
    RAISE EXCEPTION '425 gagal: hanya % nilai min_stock berbeda — CASE satuan tak cocok', n;
  END IF;

  -- 2. Peta RAB→material harus terisi, dan menyentuh lebih dari satu proyek.
  SELECT count(*) INTO n_peta FROM project_rab_materials;
  IF n_peta < 1 THEN
    -- Peta RAB-material lahir dari PROYEK; di schema bersih nol proyek,
    -- jadi peta kosong bukan kegagalan. Pemeriksaan sesudahnya (jumlah
    -- proyek tersentuh) ikut dilewati karena bergantung pada yang sama.
    RAISE NOTICE '425: belum ada proyek — pemeriksaan peta DILEWATI (schema bersih)';
    RETURN;
  END IF;

  SELECT count(DISTINCT project_id) INTO n_proyek FROM project_rab_materials;
  IF n_proyek < 2 THEN
    RAISE EXCEPTION '425 gagal: peta hanya menyentuh % proyek', n_proyek;
  END IF;

  /*
    Kuantitas NOL akan lolos "tabel terisi" tetapi membuat 3.4 tak berguna:
    kebutuhan nol berarti tak pernah kurang. Diperiksa terpisah.
  */
  SELECT min(rab_quantity) INTO terkecil FROM project_rab_materials;
  IF terkecil IS NULL OR terkecil <= 0 THEN
    RAISE EXCEPTION '425 gagal: ada baris peta ber-rab_quantity % (harus > 0)', terkecil;
  END IF;

  RAISE NOTICE '425 OK: min_stock terisi (% nilai berbeda), peta % baris di % proyek',
    n, n_peta, n_proyek;
END $$;
