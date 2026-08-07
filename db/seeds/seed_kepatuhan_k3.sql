-- SEED DUMMY — KEPATUHAN & K3 (menyertai migrasi 218)
--
-- Bukan sekadar mengisi tabel. Isinya sengaja dibentuk supaya MEMICU aturan
-- bisnis yang berbeda, sehingga layar bisa dibuktikan menampilkan hal yang
-- benar — bukan cuma "tidak error":
--
--   · PT Baja Perkasa: kinerja BAGUS (skor >85) tapi asuransi CAR MATI
--     → membuktikan kinerja bagus tak menutupi dokumen kedaluwarsa
--   · CV Karya Mandiri: dokumen lengkap tapi ada 1 KECELAKAAN KERJA
--     → membuktikan kecelakaan MENGGUGURKAN, bukan diratakan skor
--   · PT Sinar Konstruksi: SBU habis 40 hari lagi
--     → membuktikan peringatan dini muncul saat masih bisa diurus
--   · WP-002: DISETUJUI tapi jendela waktunya sudah lewat kemarin
--     → membuktikan "disetujui" ≠ "masih berlaku"
--   · WP-003: diajukan, menunggu keputusan → pekerjaan belum boleh dimulai
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
  v_u1 uuid; v_u2 uuid;
BEGIN
  SELECT id INTO v_company FROM companies WHERE is_active ORDER BY created_at LIMIT 1;
  IF v_company IS NULL THEN
    RAISE NOTICE 'Tak ada company aktif — seed dilewati.';
    RETURN;
  END IF;

  SELECT id INTO v_proyek FROM projects
   WHERE company_id = v_company ORDER BY created_at LIMIT 1;
  IF v_proyek IS NULL THEN
    RAISE NOTICE 'Tak ada proyek — seed dilewati.';
    RETURN;
  END IF;

  -- Dua pengguna BERBEDA: pemutus izin kerja tak boleh pengajunya sendiri.
  --
  -- Diurutkan `created_at, id` — BUKAN `created_at` saja. Seluruh pengguna
  -- seed punya `created_at` identik, sehingga urutannya tak stabil dan
  -- `LIMIT 1` + `OFFSET 1 LIMIT 1` bisa mengembalikan BARIS YANG SAMA.
  -- Ketahuan saat constraint `izin_pemutus_bukan_pengaju` menolak seed ini
  -- pada percobaan pertama — constraint-nya bekerja persis seperti maunya.
  SELECT id INTO v_u1 FROM users ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_u2 FROM users ORDER BY created_at, id OFFSET 1 LIMIT 1;

  IF v_u2 IS NULL OR v_u2 = v_u1 THEN
    -- Tanpa dua pengguna berbeda, izin kerja DISETUJUI tak bisa dibuat sama
    -- sekali. Dinyatakan, bukan disiasati dengan menyetujui sendiri.
    RAISE NOTICE 'Butuh 2 pengguna berbeda untuk izin kerja — seed dilewati.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM dokumen_kepatuhan WHERE company_id = v_company) THEN
    RAISE NOTICE 'Seed kepatuhan sudah pernah dijalankan — dilewati.';
    RETURN;
  END IF;

  -- ── Dokumen kepatuhan ───────────────────────────────────────────────────
  --
  -- PT Baja Perkasa: SIUJK & SBU hidup, tapi ASURANSI CAR MATI 3 bulan lalu.
  -- Inilah keadaan yang paling merugikan — kinerjanya bagus (lihat evaluasi
  -- di bawah), jadi layar yang hanya membaca skor akan menghijaukannya.
  INSERT INTO dokumen_kepatuhan (company_id, pihak_nama, jenis, nomor, penerbit,
                                 berlaku_dari, berlaku_sampai, nilai_pertanggungan,
                                 terverifikasi, diverifikasi_oleh, diverifikasi_pada, created_by)
  VALUES
    (v_company, 'PT Baja Perkasa', 'siujk', 'SIUJK-3273-00891', 'DPMPTSP Kota Bandung',
     '2024-03-01', '2027-03-01', NULL, true, v_u1, now() - interval '200 days', v_u1),
    (v_company, 'PT Baja Perkasa', 'sbu', 'SBU-BG009-0221', 'LPJK',
     '2024-03-15', '2027-03-15', NULL, true, v_u1, now() - interval '200 days', v_u1),
    -- MATI, tapi bercentang hijau karena diperiksa sebelum mati.
    (v_company, 'PT Baja Perkasa', 'asuransi_car', 'CAR-2025-00417', 'PT Asuransi Jasindo',
     '2025-05-01', CURRENT_DATE - 98, 5000000000, true, v_u1, now() - interval '150 days', v_u1),
    (v_company, 'PT Baja Perkasa', 'bpjs_ketenagakerjaan', 'BPJSTK-99001122', 'BPJS Ketenagakerjaan',
     '2025-01-01', NULL, NULL, true, v_u1, now() - interval '150 days', v_u1);

  -- CV Karya Mandiri: dokumen LENGKAP dan hidup semua.
  INSERT INTO dokumen_kepatuhan (company_id, pihak_nama, jenis, nomor, penerbit,
                                 berlaku_dari, berlaku_sampai, nilai_pertanggungan,
                                 terverifikasi, diverifikasi_oleh, diverifikasi_pada, created_by)
  VALUES
    (v_company, 'CV Karya Mandiri', 'siujk', 'SIUJK-3273-01204', 'DPMPTSP Kota Bandung',
     '2025-02-01', '2028-02-01', NULL, true, v_u1, now() - interval '90 days', v_u1),
    (v_company, 'CV Karya Mandiri', 'asuransi_tpl', 'TPL-2026-00088', 'PT Asuransi Astra',
     '2026-01-01', '2027-01-01', 1000000000, true, v_u1, now() - interval '90 days', v_u1),
    (v_company, 'CV Karya Mandiri', 'npwp', '01.234.567.8-423.000', 'DJP',
     '2020-06-01', NULL, NULL, true, v_u1, now() - interval '90 days', v_u1);

  -- PT Sinar Konstruksi: SBU habis 40 hari lagi — masih bisa diurus.
  INSERT INTO dokumen_kepatuhan (company_id, pihak_nama, jenis, nomor, penerbit,
                                 berlaku_dari, berlaku_sampai,
                                 terverifikasi, diverifikasi_oleh, diverifikasi_pada, created_by)
  VALUES
    (v_company, 'PT Sinar Konstruksi', 'sbu', 'SBU-BG004-0555', 'LPJK',
     '2023-09-20', CURRENT_DATE + 40, true, v_u1, now() - interval '30 days', v_u1),
    -- Belum diverifikasi siapa pun — masalah yang berbeda dari kedaluwarsa.
    (v_company, 'PT Sinar Konstruksi', 'smk3', 'SMK3-2026-0091', 'Kemnaker',
     '2026-02-01', '2029-02-01', false, NULL, NULL, v_u1);

  -- ── Evaluasi subkontraktor ──────────────────────────────────────────────
  --
  -- PT Baja Perkasa: skor TINGGI. Kalau layar hanya membaca ini, ia terlihat
  -- pilihan terbaik — padahal asuransinya mati.
  INSERT INTO evaluasi_subkon (company_id, project_id, pihak_nama, periode,
                               skor_mutu, skor_waktu, skor_k3, skor_kepatuhan, skor_kerjasama,
                               jumlah_kecelakaan, jumlah_pelanggaran_k3, catatan,
                               dinilai_oleh, created_by)
  VALUES (v_company, v_proyek, 'PT Baja Perkasa', CURRENT_DATE - 30,
          90, 88, 92, 85, 90, 0, 0,
          'Pekerjaan rangka baja rapi, selalu tepat waktu. Koordinasi lapangan baik.',
          v_u1, v_u1);

  -- CV Karya Mandiri: skor sedang, TAPI ada 1 kecelakaan kerja. Kecelakaan
  -- menggugurkan — ia tak boleh diratakan dengan empat dimensi lain.
  INSERT INTO evaluasi_subkon (company_id, project_id, pihak_nama, periode,
                               skor_mutu, skor_waktu, skor_k3, skor_kepatuhan, skor_kerjasama,
                               jumlah_kecelakaan, jumlah_pelanggaran_k3, catatan,
                               dinilai_oleh, created_by)
  VALUES (v_company, v_proyek, 'CV Karya Mandiri', CURRENT_DATE - 20,
          78, 72, 65, 80, 75, 1, 2,
          'Pekerja jatuh dari perancah lantai 2 (luka ringan, dirawat 3 hari). Body harness tersedia tapi tak dipakai.',
          v_u1, v_u1);

  -- PT Sinar Konstruksi: masuk daftar hitam, beralasan.
  INSERT INTO evaluasi_subkon (company_id, project_id, pihak_nama, periode,
                               skor_mutu, skor_waktu, skor_k3, skor_kepatuhan, skor_kerjasama,
                               jumlah_kecelakaan, jumlah_pelanggaran_k3,
                               masuk_daftar_hitam, alasan_daftar_hitam,
                               dinilai_oleh, created_by)
  VALUES (v_company, v_proyek, 'PT Sinar Konstruksi', CURRENT_DATE - 45,
          45, 38, 40, 50, 55, 0, 6,
          true,
          'Enam pelanggaran K3 dalam dua bulan: bekerja di ketinggian tanpa harness, APAR kedaluwarsa, tak ada rambu galian. Peringatan tertulis diabaikan.',
          v_u1, v_u1);

  -- Evaluasi LAMA PT Baja Perkasa — membuktikan yang TERBARU yang dipakai,
  -- bukan rata-rata sepanjang masa (yang membaik tak dihukum selamanya).
  INSERT INTO evaluasi_subkon (company_id, project_id, pihak_nama, periode,
                               skor_mutu, skor_waktu, skor_k3, skor_kepatuhan, skor_kerjasama,
                               catatan, dinilai_oleh, created_by)
  VALUES (v_company, v_proyek, 'PT Baja Perkasa', CURRENT_DATE - 400,
          60, 55, 70, 65, 70,
          'Awal kerja sama: koordinasi masih kaku, dua kali telat kirim material.',
          v_u1, v_u1);

  -- ── Izin kerja ──────────────────────────────────────────────────────────
  --
  -- WP-001: aktif hari ini.
  INSERT INTO izin_kerja (company_id, project_id, nomor, jenis, uraian_pekerjaan, lokasi,
                          berlaku_dari, berlaku_sampai, pengendalian_risiko, apd_wajib,
                          status, diajukan_oleh, diajukan_pada,
                          diputuskan_oleh, diputuskan_pada, created_by)
  VALUES (v_company, v_proyek, 'WP-2026-001', 'ketinggian',
          'Pemasangan rangka atap baja ringan lantai 3', 'Zona A, elevasi +9,50 m',
          date_trunc('day', now()) + interval '7 hours',
          date_trunc('day', now()) + interval '17 hours',
          'Body harness double lanyard wajib dikaitkan pada life line; perancah diperiksa sebelum naik; area bawah dibarikade radius 4 m; dilarang bekerja saat angin kencang atau hujan.',
          'Helm bertali dagu, body harness, sepatu safety, sarung tangan',
          'disetujui', v_u1, now() - interval '2 days', v_u2, now() - interval '1 day', v_u1);

  -- WP-002: DISETUJUI tapi jendelanya sudah lewat KEMARIN.
  --
  -- Kolom `status` di basis masih 'disetujui'. Pekerjaan yang berjalan atas
  -- izin ini TIDAK BERIZIN — dan yang membacanya dari kolom status saja akan
  -- mengira sebaliknya.
  INSERT INTO izin_kerja (company_id, project_id, nomor, jenis, uraian_pekerjaan, lokasi,
                          berlaku_dari, berlaku_sampai, pengendalian_risiko, apd_wajib,
                          status, diajukan_oleh, diajukan_pada,
                          diputuskan_oleh, diputuskan_pada, created_by)
  VALUES (v_company, v_proyek, 'WP-2026-002', 'pekerjaan_panas',
          'Pengelasan sambungan kolom baja', 'Zona B, lantai 2',
          date_trunc('day', now()) - interval '1 day' + interval '7 hours',
          date_trunc('day', now()) - interval '1 day' + interval '17 hours',
          'APAR 2 unit di radius 5 m; fire watcher berjaga selama pengelasan dan 30 menit sesudahnya; bahan mudah terbakar disingkirkan radius 10 m.',
          'Helm las, apron kulit, sarung tangan las, sepatu safety',
          'disetujui', v_u1, now() - interval '3 days', v_u2, now() - interval '2 days', v_u1);

  -- WP-003: menunggu keputusan — pekerjaan BELUM boleh dimulai.
  INSERT INTO izin_kerja (company_id, project_id, nomor, jenis, uraian_pekerjaan, lokasi,
                          berlaku_dari, berlaku_sampai, pengendalian_risiko, apd_wajib,
                          status, diajukan_oleh, diajukan_pada, created_by)
  VALUES (v_company, v_proyek, 'WP-2026-003', 'ruang_terbatas',
          'Pembersihan dan pengecatan bagian dalam ground water tank', 'GWT sisi timur',
          date_trunc('day', now()) + interval '2 days' + interval '8 hours',
          date_trunc('day', now()) + interval '2 days' + interval '16 hours',
          'Uji kadar oksigen sebelum masuk dan tiap 2 jam; blower ventilasi menyala terus; petugas jaga di mulut lubang; tali penarik terpasang pada pekerja.',
          'Full body harness, masker respirator, senter tahan ledak',
          'diajukan', v_u1, now() - interval '4 hours', v_u1);

  -- WP-004: ditolak dengan alasan.
  INSERT INTO izin_kerja (company_id, project_id, nomor, jenis, uraian_pekerjaan, lokasi,
                          berlaku_dari, berlaku_sampai, pengendalian_risiko,
                          status, diajukan_oleh, diajukan_pada,
                          diputuskan_oleh, diputuskan_pada, alasan_tolak, created_by)
  VALUES (v_company, v_proyek, 'WP-2026-004', 'galian',
          'Galian saluran drainase kedalaman 2,2 m', 'Sisi selatan tapak',
          date_trunc('day', now()) + interval '1 day' + interval '7 hours',
          date_trunc('day', now()) + interval '1 day' + interval '17 hours',
          'Barikade sekeliling galian.',
          'ditolak', v_u1, now() - interval '2 days', v_u2, now() - interval '1 day',
          'Galian lebih dari 1,5 m WAJIB berturap — rencana turap belum dilampirkan. Tambahkan detail turap dan tangga akses sebelum diajukan ulang.',
          v_u1);

  RAISE NOTICE 'OK: seed kepatuhan — % dokumen, % evaluasi, % izin kerja',
    (SELECT count(*) FROM dokumen_kepatuhan WHERE company_id = v_company),
    (SELECT count(*) FROM evaluasi_subkon WHERE company_id = v_company),
    (SELECT count(*) FROM izin_kerja WHERE company_id = v_company);
END $$;
