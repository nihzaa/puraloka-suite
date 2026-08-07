-- SEED DUMMY — JADWAL CPM, KALENDER, SUMBER DAYA (menyertai migrasi 212/213)
--
-- Bukan sekadar mengisi tabel. Isinya sengaja dibentuk supaya MEMICU aturan
-- bisnis yang berbeda, sehingga layar bisa dibuktikan menampilkan hal yang
-- benar — bukan cuma "tidak error":
--
--   · rantai FS penuh          → ada jalur kritis yang bisa dilihat
--   · satu relasi SS ber-jeda  → membuktikan SS ≠ FS di kolom "dipicu oleh"
--   · libur nasional 2026      → membuktikan durasi hari KERJA ≠ hari kalender
--   · tenaga puncak > tersedia → membuktikan histogram menandai kelebihan,
--                                bukan meratakannya jadi angka yang aman
--   · satu method statement    → satu disetujui, satu ditolak beralasan
--
-- ── Soal idempotensi
--
-- Penjaga blok `IF EXISTS ... RETURN`, bukan `ON CONFLICT DO NOTHING`.
-- Pelajaran dari seed alat: tabel tanpa unique constraint menerima salinan
-- diam-diam, dan `ON CONFLICT` di sana tak mengikat apa pun.

DO $$
DECLARE
  v_company uuid;
  v_proyek  uuid;
  m_galian uuid; m_lt1 uuid; m_lt23 uuid; m_finishing uuid; m_serah uuid;
BEGIN
  SELECT id INTO v_company FROM companies WHERE is_active ORDER BY created_at LIMIT 1;
  IF v_company IS NULL THEN
    RAISE NOTICE 'Tak ada company aktif — seed dilewati.';
    RETURN;
  END IF;

  -- Proyek dengan milestone terbanyak.
  SELECT p.id INTO v_proyek
    FROM projects p JOIN milestones m ON m.project_id = p.id
   WHERE p.company_id = v_company
   GROUP BY p.id HAVING count(m.id) >= 4
   ORDER BY count(m.id) DESC, p.created_at LIMIT 1;

  IF v_proyek IS NULL THEN
    RAISE NOTICE 'Tak ada proyek ber-milestone >= 4 — seed dilewati.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM milestone_dependencies WHERE company_id = v_company) THEN
    RAISE NOTICE 'Seed jadwal sudah pernah dijalankan — dilewati.';
    RETURN;
  END IF;

  SELECT id INTO m_galian    FROM milestones WHERE project_id = v_proyek ORDER BY sort_order LIMIT 1 OFFSET 0;
  SELECT id INTO m_lt1       FROM milestones WHERE project_id = v_proyek ORDER BY sort_order LIMIT 1 OFFSET 1;
  SELECT id INTO m_lt23      FROM milestones WHERE project_id = v_proyek ORDER BY sort_order LIMIT 1 OFFSET 2;
  SELECT id INTO m_finishing FROM milestones WHERE project_id = v_proyek ORDER BY sort_order LIMIT 1 OFFSET 3;
  SELECT id INTO m_serah     FROM milestones WHERE project_id = v_proyek ORDER BY sort_order LIMIT 1 OFFSET 4;

  -- ── Dependensi ──────────────────────────────────────────────────────────
  --
  -- Rantai FS untuk struktur, TAPI satu relasi SS: finishing tak menunggu
  -- lantai 2-3 SELESAI seluruhnya — ia mulai 20 hari kerja sesudah lantai
  -- 2-3 DIMULAI, karena finishing lantai bawah bisa jalan sementara lantai
  -- atas masih dikerjakan. Kalau ini salah dibaca sebagai FS, jadwalnya
  -- molor berbulan-bulan di atas kertas — padahal di lapangan tidak.
  INSERT INTO milestone_dependencies (company_id, milestone_id, bergantung_pada, jenis, jeda_hari, catatan)
  VALUES
    (v_company, m_lt1,  m_galian, 'FS', 7,
     'Jeda 7 hari kerja: curing bore pile sebelum pile cap'),
    (v_company, m_lt23, m_lt1,    'FS', 14,
     'Jeda 14 hari kerja: curing pelat lantai 1 sebelum kolom lantai 2');

  IF m_finishing IS NOT NULL THEN
    INSERT INTO milestone_dependencies (company_id, milestone_id, bergantung_pada, jenis, jeda_hari, catatan)
    VALUES (v_company, m_finishing, m_lt23, 'SS', 20,
     'SS: finishing lantai bawah jalan sementara lantai atas masih dikerjakan');
  END IF;

  IF m_serah IS NOT NULL THEN
    INSERT INTO milestone_dependencies (company_id, milestone_id, bergantung_pada, jenis, jeda_hari, catatan)
    VALUES (v_company, m_serah, m_finishing, 'FS', 0, 'Serah terima sesudah finishing tuntas');
  END IF;

  -- ── Pola kerja ──────────────────────────────────────────────────────────
  INSERT INTO pola_kerja (company_id, project_id, sabtu, jam_per_hari, catatan)
  VALUES (v_company, NULL, true, 8,
          'Senin-Sabtu, 8 jam. Sabtu setengah hari di lapangan tapi tetap dihitung penuh untuk penjadwalan.');

  -- ── Hari libur nasional 2026 ────────────────────────────────────────────
  --
  -- Inilah yang membuat "durasi 30 hari" berbeda dari "30 hari kalender".
  INSERT INTO hari_libur (company_id, tanggal, nama, jenis)
  VALUES
    (v_company, '2026-01-01', 'Tahun Baru Masehi', 'nasional'),
    (v_company, '2026-01-17', 'Isra Mikraj', 'nasional'),
    (v_company, '2026-02-17', 'Tahun Baru Imlek', 'nasional'),
    (v_company, '2026-03-19', 'Hari Raya Nyepi', 'nasional'),
    (v_company, '2026-03-20', 'Idul Fitri 1447 H', 'nasional'),
    (v_company, '2026-03-21', 'Idul Fitri 1447 H', 'nasional'),
    (v_company, '2026-03-23', 'Cuti bersama Idul Fitri', 'cuti_bersama'),
    (v_company, '2026-03-24', 'Cuti bersama Idul Fitri', 'cuti_bersama'),
    (v_company, '2026-04-03', 'Wafat Isa Almasih', 'nasional'),
    (v_company, '2026-05-01', 'Hari Buruh', 'nasional'),
    (v_company, '2026-05-14', 'Kenaikan Isa Almasih', 'nasional'),
    (v_company, '2026-05-27', 'Idul Adha 1447 H', 'nasional'),
    (v_company, '2026-06-01', 'Hari Lahir Pancasila', 'nasional'),
    (v_company, '2026-06-16', 'Tahun Baru Islam 1448 H', 'nasional'),
    (v_company, '2026-08-17', 'Hari Kemerdekaan RI', 'nasional'),
    (v_company, '2026-08-25', 'Maulid Nabi Muhammad SAW', 'nasional'),
    (v_company, '2026-12-25', 'Hari Raya Natal', 'nasional');

  -- Libur perusahaan yang JUSTRU dikerjakan — lembur terencana kejar tenggat.
  -- Jejaknya tetap ada bahwa hari itu semestinya libur (yang menentukan
  -- tarif upah), tapi jadwalnya tetap berjalan.
  INSERT INTO hari_libur (company_id, project_id, tanggal, nama, jenis, tetap_bekerja)
  VALUES (v_company, v_proyek, '2026-12-26', 'Cuti bersama Natal — DIKERJAKAN (kejar serah terima)',
          'perusahaan', true);

  -- ── Kebutuhan sumber daya ───────────────────────────────────────────────
  --
  -- Struktur lantai 1 dan lantai 2-3 sengaja BERSINGGUNGAN di kalender, dan
  -- keduanya butuh tukang batu. Puncaknya melewati 30 yang tersedia — layar
  -- harus menandainya, bukan meratakannya jadi rata-rata yang aman.
  INSERT INTO kebutuhan_sumber_daya (company_id, milestone_id, jenis, nama, kuantitas, satuan, tersedia)
  VALUES
    (v_company, m_galian, 'tenaga', 'Tukang gali',   12, 'orang', 15),
    (v_company, m_galian, 'alat',   'Excavator',      1, 'unit',   2),
    (v_company, m_lt1,    'tenaga', 'Tukang batu',   22, 'orang', 30),
    (v_company, m_lt1,    'tenaga', 'Tukang besi',   14, 'orang', 18),
    (v_company, m_lt23,   'tenaga', 'Tukang batu',   18, 'orang', 30),
    (v_company, m_lt23,   'tenaga', 'Tukang besi',   16, 'orang', 18),
    (v_company, m_lt23,   'alat',   'Mobile Crane',   1, 'unit',   1);

  IF m_finishing IS NOT NULL THEN
    INSERT INTO kebutuhan_sumber_daya (company_id, milestone_id, jenis, nama, kuantitas, satuan, tersedia)
    VALUES
      (v_company, m_finishing, 'tenaga', 'Tukang batu', 15, 'orang', 30),
      (v_company, m_finishing, 'tenaga', 'Tukang cat',  10, 'orang', 12);
  END IF;

  -- ── Method statement ────────────────────────────────────────────────────
  -- `alasan_tolak` diisi DI SINI, bukan lewat UPDATE menyusul.
  --
  -- Percobaan pertama seed ini menyisipkan MS-002 berstatus `ditolak` dengan
  -- alasan NULL lalu mengisinya belakangan — dan constraint `ms_tolak_beralasan`
  -- menolaknya seketika. Constraint mengikat saat INSERT, bukan sesudah.
  -- Persis perilaku yang diinginkan: penolakan tanpa alasan tak boleh pernah
  -- ada di tabel, sekejap pun.
  INSERT INTO method_statement (company_id, project_id, milestone_id, nomor, judul, status,
                                urutan_kerja, alat_dipakai, tenaga_dibutuhkan,
                                pengendalian_risiko, alasan_tolak, diputuskan_pada)
  VALUES
    (v_company, v_proyek, m_galian, 'MS-001', 'Pekerjaan galian & bore pile', 'disetujui',
     E'1. Pengukuran & pemasangan bouwplank\n2. Galian bertahap, maksimal 1,5 m per tahap\n3. Pemasangan turap pada galian > 1,5 m\n4. Bore pile diameter 40 cm, kedalaman 12 m\n5. Pengecoran bore pile dengan tremie',
     'Excavator PC200, bore pile machine, concrete pump',
     '12 tukang gali, 1 operator excavator, 2 helper',
     E'Galian > 1,5 m WAJIB berturap. Barikade radius 3 m dari bibir galian. Helm & sepatu safety wajib. Dilarang bekerja saat hujan deras — risiko longsor dinding galian.',
     NULL,
     now() - interval '90 days'),

    (v_company, v_proyek, m_lt23, 'MS-002', 'Pengecoran kolom & pelat lantai 2-3', 'ditolak',
     E'1. Pemasangan bekisting kolom\n2. Pemasangan tulangan\n3. Pengecoran dengan concrete pump',
     'Concrete pump, mobile crane, vibrator',
     '18 tukang batu, 16 tukang besi',
     NULL,
     'Pengendalian risiko bekerja di ketinggian belum dijelaskan sama sekali — wajib memuat rencana body harness, life line, dan perlindungan tepi pelat sebelum diajukan ulang.',
     now() - interval '20 days');

  RAISE NOTICE 'OK: seed jadwal — % dependensi, % libur, % pola, % sumber daya, % method statement',
    (SELECT count(*) FROM milestone_dependencies WHERE company_id = v_company),
    (SELECT count(*) FROM hari_libur WHERE company_id = v_company),
    (SELECT count(*) FROM pola_kerja WHERE company_id = v_company),
    (SELECT count(*) FROM kebutuhan_sumber_daya WHERE company_id = v_company),
    (SELECT count(*) FROM method_statement WHERE company_id = v_company);
END $$;
