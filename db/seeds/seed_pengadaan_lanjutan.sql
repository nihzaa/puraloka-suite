-- SEED DUMMY — PENGADAAN LANJUTAN (menyertai migrasi 219)
--
-- Bukan sekadar mengisi tabel. Isinya sengaja dibentuk supaya MEMICU aturan
-- bisnis yang berbeda, sehingga layar bisa dibuktikan menampilkan hal yang
-- benar — bukan cuma "tidak error":
--
--   · BO-2026-001: status 'aktif', SELURUH kuota habis
--     → membuktikan "aktif" ≠ "bisa dipakai"; PO berikutnya akan ditagih
--       di luar harga kontrak
--   · BO-2026-002: kuota tersisa 8% pada satu item
--     → membuktikan peringatan dini muncul saat masih bisa dinegosiasikan
--   · BO-2026-003: berakhir 20 hari lagi
--     → membuktikan "segera berakhir" terlihat sebelum terlambat
--   · Expediting: satu kiriman telat 20+ hari, satu tertahan bea cukai,
--     satu vendor MENJANJIKAN tanggal yang sudah lebih lambat dari kebutuhan
--     → membuktikan telat diukur dari KEBUTUHAN, bukan janji vendor
--   · CN-2026-001: disetujui 30 hari lalu, BELUM diterapkan
--     → membuktikan uang yang hilang dengan persetujuan lengkap terlihat
--
-- ── Soal idempotensi
--
-- Penjaga blok `IF EXISTS ... RETURN`, bukan `ON CONFLICT DO NOTHING`.
-- Pelajaran dari seed alat: tabel tanpa unique constraint menerima salinan
-- diam-diam, dan `ON CONFLICT` di sana tak mengikat apa pun.

DO $$
DECLARE
  v_company uuid;
  v_supplier uuid;
  v_supplier2 uuid;
  v_proyek uuid;
  v_u1 uuid; v_u2 uuid;
  k1 uuid; k2 uuid; k3 uuid;
  po1 uuid; po2 uuid; po3 uuid;
  e1 uuid;
  v_butuh date;
  v_inv uuid;
BEGIN
  SELECT id INTO v_company FROM companies WHERE is_active ORDER BY created_at LIMIT 1;
  IF v_company IS NULL THEN
    RAISE NOTICE 'Tak ada company aktif — seed dilewati.';
    RETURN;
  END IF;

  SELECT id INTO v_supplier FROM suppliers
   WHERE company_id = v_company ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_supplier2 FROM suppliers
   WHERE company_id = v_company ORDER BY created_at, id OFFSET 1 LIMIT 1;
  IF v_supplier IS NULL THEN
    RAISE NOTICE 'Tak ada pemasok — seed dilewati.';
    RETURN;
  END IF;
  IF v_supplier2 IS NULL THEN v_supplier2 := v_supplier; END IF;

  SELECT id INTO v_proyek FROM projects
   WHERE company_id = v_company ORDER BY created_at, id LIMIT 1;

  -- Dua pengguna BERBEDA: pemutus nota kredit tak boleh pengajunya sendiri.
  -- `ORDER BY created_at, id` — pelajaran seed kepatuhan: seluruh pengguna
  -- seed punya `created_at` identik, sehingga tanpa pemecah-seri kedua
  -- kueri mengembalikan baris yang sama.
  SELECT id INTO v_u1 FROM users ORDER BY created_at, id LIMIT 1;
  SELECT id INTO v_u2 FROM users ORDER BY created_at, id OFFSET 1 LIMIT 1;
  IF v_u2 IS NULL OR v_u2 = v_u1 THEN
    RAISE NOTICE 'Butuh 2 pengguna berbeda untuk nota kredit — seed dilewati.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM kontrak_payung WHERE company_id = v_company) THEN
    RAISE NOTICE 'Seed pengadaan lanjutan sudah pernah dijalankan — dilewati.';
    RETURN;
  END IF;

  -- ── Kontrak payung ──────────────────────────────────────────────────────
  --
  -- BO-001: status 'aktif', TAPI seluruh kuotanya habis. Inilah keadaan
  -- yang paling merugikan — PO berikutnya menarik dari kontrak mati dan
  -- ditagih di luar harga kontrak, baru ketahuan saat tagihannya datang.
  INSERT INTO kontrak_payung (company_id, supplier_id, nomor, judul,
                              berlaku_dari, berlaku_sampai, pagu_nilai,
                              status, syarat_pembayaran, created_by)
  VALUES (v_company, v_supplier, 'BO-2026-001', 'Besi beton SNI — kuota tahunan',
          '2026-01-01', '2026-12-31', 3000000000, 'aktif', 'NET 30', v_u1)
  RETURNING id INTO k1;

  INSERT INTO kontrak_payung_item (company_id, kontrak_id, uraian, satuan,
                                   harga_satuan, kuota, terpakai)
  VALUES
    (v_company, k1, 'Besi beton ulir D16', 'ton', 14200000, 100, 100),
    (v_company, k1, 'Besi beton ulir D13', 'ton', 13800000, 60, 60);

  -- BO-002: kuota tersisa 8% pada satu item — masih bisa dinegosiasikan.
  INSERT INTO kontrak_payung (company_id, supplier_id, nomor, judul,
                              berlaku_dari, berlaku_sampai, pagu_nilai,
                              status, syarat_pembayaran, created_by)
  VALUES (v_company, v_supplier2, 'BO-2026-002', 'Semen & agregat — kuota semester II',
          '2026-07-01', '2026-12-31', 1800000000, 'aktif', 'NET 14', v_u1)
  RETURNING id INTO k2;

  INSERT INTO kontrak_payung_item (company_id, kontrak_id, uraian, satuan,
                                   harga_satuan, kuota, terpakai)
  VALUES
    (v_company, k2, 'Semen PCC 40 kg', 'sak', 62000, 12000, 11040),   -- sisa 8%
    (v_company, k2, 'Pasir beton', 'm3', 285000, 800, 320),
    (v_company, k2, 'Split 1-2 cm', 'm3', 340000, 600, 180);

  -- BO-003: berakhir 20 hari lagi.
  INSERT INTO kontrak_payung (company_id, supplier_id, nomor, judul,
                              berlaku_dari, berlaku_sampai,
                              status, syarat_pembayaran, created_by)
  VALUES (v_company, v_supplier, 'BO-2026-003', 'Bekisting & perancah — sewa',
          CURRENT_DATE - 160, CURRENT_DATE + 20, 'aktif', 'NET 30', v_u1)
  RETURNING id INTO k3;

  INSERT INTO kontrak_payung_item (company_id, kontrak_id, uraian, satuan,
                                   harga_satuan, kuota, terpakai)
  VALUES (v_company, k3, 'Scaffolding set', 'set-bulan', 185000, 500, 210);

  -- ── Expediting ──────────────────────────────────────────────────────────
  SELECT id INTO po1 FROM purchase_orders
   WHERE project_id IN (SELECT id FROM projects WHERE company_id = v_company)
   ORDER BY created_at, id LIMIT 1;
  SELECT id INTO po2 FROM purchase_orders
   WHERE project_id IN (SELECT id FROM projects WHERE company_id = v_company)
   ORDER BY created_at, id OFFSET 1 LIMIT 1;
  SELECT id INTO po3 FROM purchase_orders
   WHERE project_id IN (SELECT id FROM projects WHERE company_id = v_company)
   ORDER BY created_at, id OFFSET 2 LIMIT 1;

  IF po1 IS NOT NULL THEN
    -- Kiriman TELAT. Tanggalnya diturunkan dari `expected_delivery_date` PO
    -- itu sendiri, BUKAN dari CURRENT_DATE.
    --
    -- Versi pertama seed ini memakai CURRENT_DATE dan menghasilkan "telat
    -- 143 hari" untuk PO bertanggal Maret — aritmetikanya benar, ceritanya
    -- omong kosong: PO Maret dengan perkiraan tiba minggu depan. Data dummy
    -- yang tak masuk akal membuat layar mustahil dinilai.
    SELECT expected_delivery_date INTO v_butuh FROM purchase_orders WHERE id = po1;

    INSERT INTO expediting (company_id, po_id, janji_vendor, perkiraan_tiba,
                            status, lokasi_terkini, nomor_resi, moda, created_by)
    VALUES (v_company, po1,
            v_butuh + 12,      -- vendor menjanjikan 12 hari SESUDAH kebutuhan
            v_butuh + 19,      -- perkiraannya molor 7 hari lagi dari janjinya
            'dalam_perjalanan', 'Gudang transit Cikarang', 'JNE-88213004', 'darat', v_u1)
    RETURNING id INTO e1;

    INSERT INTO expediting_jejak (company_id, expediting_id, status, lokasi, catatan, dicatat_oleh)
    VALUES
      (v_company, e1, 'dipesan', NULL, 'PO dikirim ke vendor', v_u1),
      (v_company, e1, 'diproduksi', 'Pabrik Krakatau', 'Antrean produksi 10 hari', v_u1),
      (v_company, e1, 'dalam_perjalanan', 'Gudang transit Cikarang',
       'Truk berangkat, perkiraan 4 hari lagi', v_u1);
  END IF;

  IF po2 IS NOT NULL THEN
    -- TERTAHAN, dengan sebab tercatat.
    SELECT expected_delivery_date INTO v_butuh FROM purchase_orders WHERE id = po2;

    INSERT INTO expediting (company_id, po_id, janji_vendor, perkiraan_tiba,
                            status, lokasi_terkini, sebab_tertahan, moda, created_by)
    VALUES (v_company, po2, v_butuh + 3, v_butuh + 26,
            'tertahan', 'Pelabuhan Tanjung Priok',
            'Dokumen impor kurang lengkap — menunggu SNI marking dari bea cukai',
            'laut', v_u1)
    RETURNING id INTO e1;

    INSERT INTO expediting_jejak (company_id, expediting_id, status, lokasi, catatan, dicatat_oleh)
    VALUES (v_company, e1, 'tertahan', 'Pelabuhan Tanjung Priok',
            'Ditahan bea cukai sejak ' || (CURRENT_DATE - 6)::text, v_u1);
  END IF;

  IF po3 IS NOT NULL THEN
    -- SUDAH TIBA, TEPAT WAKTU: janji = kebutuhan, tiba pas. Pembanding yang
    -- membuktikan layar tak menuduh semua kiriman telat.
    SELECT expected_delivery_date INTO v_butuh FROM purchase_orders WHERE id = po3;

    INSERT INTO expediting (company_id, po_id, janji_vendor, perkiraan_tiba,
                            tiba_aktual, status, lokasi_terkini, moda, created_by)
    VALUES (v_company, po3, v_butuh, v_butuh, v_butuh,
            'tiba', 'Gudang proyek', 'darat', v_u1);
  END IF;

  -- ── Nota kredit ─────────────────────────────────────────────────────────
  SELECT id INTO v_inv FROM supplier_invoices
   WHERE company_id = v_company ORDER BY created_at, id LIMIT 1;

  -- CN-001: DISETUJUI 30 hari lalu, BELUM diterapkan.
  --
  -- Potongannya disepakati, tagihan penuh tetap dibayar. Uang hilang dengan
  -- seluruh persetujuan lengkap — dan tak satu pun kolom berteriak.
  INSERT INTO nota_kredit (company_id, supplier_id, supplier_invoice_id, project_id,
                           nomor, tanggal, jenis, jumlah, alasan, status,
                           diajukan_oleh, diajukan_pada, diputuskan_oleh, diputuskan_pada,
                           created_by)
  VALUES (v_company, v_supplier, v_inv, v_proyek,
          'CN-2026-001', CURRENT_DATE - 35, 'barang_rusak', 28400000,
          'Besi D16 sebanyak 2 ton berkarat berat saat bongkar muat, ditolak QC dan diretur ke vendor. Berita acara retur BA-2026-014.',
          'disetujui', v_u1, now() - interval '34 days', v_u2, now() - interval '30 days',
          v_u1)
  RETURNING id INTO k1;

  -- CN-002: sudah DITERAPKAN — pembanding yang sehat.
  INSERT INTO nota_kredit (company_id, supplier_id, project_id,
                           nomor, tanggal, jenis, jumlah, alasan, status,
                           diajukan_oleh, diajukan_pada, diputuskan_oleh, diputuskan_pada,
                           diterapkan_pada, created_by)
  VALUES (v_company, v_supplier2, v_proyek,
          'CN-2026-002', CURRENT_DATE - 60, 'kurang_kirim', 6150000,
          'Semen PCC kurang 99 sak dari 1.500 sak yang ditagih. Selisih dihitung dari berita acara penerimaan GR-2026-631.',
          'diterapkan', v_u1, now() - interval '58 days', v_u2, now() - interval '55 days',
          now() - interval '52 days', v_u1);

  -- CN-003: DIAJUKAN, menunggu keputusan.
  INSERT INTO nota_kredit (company_id, supplier_id, project_id,
                           nomor, tanggal, jenis, jumlah, alasan, status,
                           diajukan_oleh, diajukan_pada, created_by)
  VALUES (v_company, v_supplier, v_proyek,
          'CN-2026-003', CURRENT_DATE - 3, 'salah_harga', 3750000,
          'Harga split 1-2 cm ditagih Rp 365.000/m3, sementara kontrak payung BO-2026-002 menyepakati Rp 340.000/m3. Selisih 150 m3.',
          'diajukan', v_u1, now() - interval '3 days', v_u1);

  -- CN-004: DITOLAK, beralasan.
  INSERT INTO nota_kredit (company_id, supplier_id, project_id,
                           nomor, tanggal, jenis, jumlah, alasan, status,
                           diajukan_oleh, diajukan_pada, diputuskan_oleh, diputuskan_pada,
                           alasan_tolak, created_by)
  VALUES (v_company, v_supplier2, v_proyek,
          'CN-2026-004', CURRENT_DATE - 20, 'retur_barang', 12000000,
          'Pasir beton dianggap terlalu banyak lumpur oleh pelaksana lapangan, diminta retur satu rit.',
          'ditolak', v_u1, now() - interval '19 days', v_u2, now() - interval '15 days',
          'Pasir sudah dipakai untuk pengecoran lantai 1 dan hasilnya lolos uji slump. Retur tak bisa diterima sesudah material terpakai.',
          v_u1);

  RAISE NOTICE 'OK: seed pengadaan — % kontrak (% item), % expediting, % nota kredit',
    (SELECT count(*) FROM kontrak_payung WHERE company_id = v_company),
    (SELECT count(*) FROM kontrak_payung_item WHERE company_id = v_company),
    (SELECT count(*) FROM expediting WHERE company_id = v_company),
    (SELECT count(*) FROM nota_kredit WHERE company_id = v_company);
END $$;
