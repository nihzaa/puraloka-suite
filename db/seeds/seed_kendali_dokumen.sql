-- SEED DUMMY — KENDALI DOKUMEN (menyertai migrasi 215)
--
-- Bukan sekadar mengisi tabel. Isinya sengaja dibentuk supaya MEMICU aturan
-- bisnis yang berbeda, sehingga layar bisa dibuktikan menampilkan hal yang
-- benar — bukan cuma "tidak error":
--
--   · STR-101 rev-1 berstatus 'berlaku' PADAHAL rev-2 sudah terbit
--     → membuktikan gambar usang ditandai meski kolom status-nya hijau
--   · TR-002 dikirim 3 minggu lalu, tak pernah dikonfirmasi
--     → membuktikan transmittal menggantung terlihat
--   · notulen dengan butir lewat tenggat + butir TANPA tenggat
--     → membuktikan keduanya dihitung terpisah
--   · jadwal laporan mingguan yang macet 5 kali berturut
--     → membuktikan laporan yang berhenti diam-diam ketahuan
--   · satu penerima distribusi tanpa surel tapi ber-akun sistem
--     → membuktikan constraint "bisa dihubungi" menerima kedua bentuk
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
  v_user    uuid;
  g_rev1 uuid; g_rev2 uuid;
  v_tr uuid; v_notulen uuid;
BEGIN
  SELECT id INTO v_company FROM companies WHERE is_active ORDER BY created_at LIMIT 1;
  IF v_company IS NULL THEN
    RAISE NOTICE 'Tak ada company aktif — seed dilewati.';
    RETURN;
  END IF;

  SELECT id INTO v_proyek FROM projects
   WHERE company_id = v_company ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user FROM users LIMIT 1;

  IF v_proyek IS NULL THEN
    RAISE NOTICE 'Tak ada proyek — seed dilewati.';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM register_gambar WHERE company_id = v_company) THEN
    RAISE NOTICE 'Seed kendali dokumen sudah pernah dijalankan — dilewati.';
    RETURN;
  END IF;

  -- ── Register gambar ─────────────────────────────────────────────────────
  --
  -- STR-101 sengaja punya DUA baris berstatus 'berlaku'. Itu keadaan nyata:
  -- revisi baru diunggah, tapi tak ada yang ingat memperbarui status revisi
  -- lama. Layar harus menandai rev-1 sebagai USANG dari perbandingan revisi,
  -- bukan dari kolom status.
  INSERT INTO register_gambar (company_id, project_id, nomor, judul, disiplin,
                               revisi, tahap, status, tanggal_terbit, created_by)
  VALUES (v_company, v_proyek, 'STR-101', 'Denah pondasi & pile cap', 'struktur',
          1, 'IFC', 'berlaku', CURRENT_DATE - 60, v_user)
  RETURNING id INTO g_rev1;

  INSERT INTO register_gambar (company_id, project_id, nomor, judul, disiplin,
                               revisi, tahap, status, tanggal_terbit, created_by)
  VALUES (v_company, v_proyek, 'STR-101', 'Denah pondasi & pile cap (rev 2)', 'struktur',
          2, 'IFC', 'berlaku', CURRENT_DATE - 12, v_user)
  RETURNING id INTO g_rev2;

  INSERT INTO register_gambar (company_id, project_id, nomor, judul, disiplin,
                               revisi, tahap, status, digantikan_oleh, tanggal_terbit, created_by)
  VALUES
    (v_company, v_proyek, 'ARS-201', 'Denah lantai 1', 'arsitektur',
     0, 'IFC', 'berlaku', NULL, CURRENT_DATE - 90, v_user),
    (v_company, v_proyek, 'ARS-202', 'Tampak depan & samping', 'arsitektur',
     0, 'IFA', 'berlaku', NULL, CURRENT_DATE - 88, v_user),
    (v_company, v_proyek, 'MEP-301', 'Diagram satu garis listrik', 'mep',
     1, 'IFR', 'berlaku', NULL, CURRENT_DATE - 20, v_user);

  -- ── Transmittal ─────────────────────────────────────────────────────────
  --
  -- TR-001 lengkap (kirim + terima), TR-002 MENGGANTUNG 3 minggu.
  INSERT INTO transmittal (company_id, project_id, nomor, perihal, tujuan_nama,
                           tujuan_organisasi, maksud, status, dikirim_pada,
                           diterima_pada, diterima_oleh, created_by)
  VALUES (v_company, v_proyek, 'TR-2026-001', 'Penyerahan gambar IFC struktur',
          'Ir. Bambang S.', 'PT Konsultan Struktur Utama', 'untuk_konstruksi',
          'diterima', now() - interval '30 days', now() - interval '28 days',
          'Ir. Bambang S.', v_user)
  RETURNING id INTO v_tr;

  INSERT INTO transmittal_item (company_id, transmittal_id, gambar_id, jumlah_lembar)
  VALUES (v_company, v_tr, g_rev1, 4);

  INSERT INTO transmittal (company_id, project_id, nomor, perihal, tujuan_nama,
                           tujuan_organisasi, maksud, status, dikirim_pada, created_by)
  VALUES (v_company, v_proyek, 'TR-2026-002', 'Revisi 2 gambar pondasi — MOHON KONFIRMASI',
          'Ir. Bambang S.', 'PT Konsultan Struktur Utama', 'untuk_konstruksi',
          'dikirim', now() - interval '21 days', v_user)
  RETURNING id INTO v_tr;

  INSERT INTO transmittal_item (company_id, transmittal_id, gambar_id, jumlah_lembar)
  VALUES (v_company, v_tr, g_rev2, 4);

  INSERT INTO transmittal (company_id, project_id, nomor, perihal, tujuan_nama,
                           maksud, status, created_by)
  VALUES (v_company, v_proyek, 'TR-2026-003', 'Draft berita acara serah terima',
          'Owner', 'untuk_tinjauan', 'draft', v_user)
  RETURNING id INTO v_tr;

  INSERT INTO transmittal_item (company_id, transmittal_id, uraian, jumlah_lembar)
  VALUES (v_company, v_tr, 'Draft BAST + lampiran foto', 12);

  -- ── Notulen rapat + butir tindakan ──────────────────────────────────────
  INSERT INTO notulen_rapat (company_id, project_id, nomor, judul, tanggal, jenis,
                             tempat, hadir, pembahasan, status, created_by)
  VALUES (v_company, v_proyek, 'NR-2026-014', 'Rapat mingguan minggu ke-14',
          CURRENT_DATE - 10, 'mingguan', 'Direksi keet',
          'PM, pengawas, mandor struktur, wakil owner',
          E'1. Progres struktur lantai 1 mencapai 78%, sesuai rencana.\n2. Keterlambatan pengiriman besi D16 dari supplier — 4 hari.\n3. Revisi gambar pondasi (rev 2) belum dikonfirmasi konsultan.',
          'final', v_user)
  RETURNING id INTO v_notulen;

  INSERT INTO notulen_tindakan (company_id, notulen_id, urutan, uraian,
                                pj_nama, tenggat, status, selesai_pada)
  VALUES
    -- LEWAT TENGGAT, masih terbuka — inilah yang harus menonjol.
    (v_company, v_notulen, 1,
     'Kejar konfirmasi konsultan atas gambar STR-101 rev 2',
     'PM Proyek', CURRENT_DATE - 5, 'terbuka', NULL),
    (v_company, v_notulen, 2,
     'Ajukan klaim keterlambatan pengiriman besi ke supplier',
     'Staf pengadaan', CURRENT_DATE - 2, 'terbuka', NULL),
    -- TANPA TENGGAT — tak akan pernah muncul sebagai "lewat", ia hanya mengendap.
    (v_company, v_notulen, 3,
     'Tinjau ulang metode pengecoran kolom lantai 2',
     'Pengawas struktur', NULL, 'terbuka', NULL),
    -- Selesai.
    (v_company, v_notulen, 4,
     'Kirim laporan progres mingguan ke owner',
     'Admin proyek', CURRENT_DATE - 8, 'selesai', CURRENT_DATE - 8),
    (v_company, v_notulen, 5,
     'Perbaiki pagar pengaman sisi utara',
     'Mandor', CURRENT_DATE - 6, 'selesai', CURRENT_DATE - 7);

  -- ── Matriks distribusi ──────────────────────────────────────────────────
  INSERT INTO matriks_distribusi (company_id, project_id, jenis_dokumen,
                                  penerima_nama, penerima_email, organisasi, peran, created_by)
  VALUES
    (v_company, v_proyek, 'gambar_struktur', 'Ir. Bambang S.',
     'bambang@konsultan-struktur.co.id', 'PT Konsultan Struktur Utama', 'persetujuan', v_user),
    (v_company, v_proyek, 'gambar_arsitektur', 'Sdri. Rina',
     'rina@arsitek-nusantara.co.id', 'Arsitek Nusantara', 'tinjauan', v_user),
    (v_company, v_proyek, 'laporan_progres', 'Owner',
     'owner@contoh.co.id', 'Pemilik proyek', 'informasi', v_user),
    (v_company, v_proyek, 'notulen_rapat', 'Owner',
     'owner@contoh.co.id', 'Pemilik proyek', 'informasi', v_user);

  -- Penerima TANPA surel tapi ber-akun sistem — bentuk kedua yang sah.
  INSERT INTO matriks_distribusi (company_id, project_id, jenis_dokumen,
                                  penerima_nama, penerima_user_id, peran, created_by)
  VALUES (v_company, v_proyek, 'gambar_struktur', 'PM Internal', v_user, 'arsip', v_user);

  -- ── Jadwal distribusi laporan ───────────────────────────────────────────
  INSERT INTO jadwal_distribusi_laporan (company_id, project_id, nama, jenis_laporan,
                                         irama, hari_ke, jam, aktif,
                                         terakhir_dikirim, gagal_berturut, galat_terakhir, created_by)
  VALUES
    -- Sehat.
    (v_company, v_proyek, 'Progres mingguan ke owner', 'progres_mingguan',
     'mingguan', 1, '07:00', true, now() - interval '3 days', 0, NULL, v_user),
    -- MACET: 5 kali gagal berturut. Tak ada yang mengeluh soal surel yang
    -- tak datang — sampai ada yang menanyakan angkanya.
    (v_company, v_proyek, 'Rekap biaya bulanan ke direksi', 'rekap_biaya',
     'bulanan', 5, '08:00', true, now() - interval '65 days', 5,
     'SMTP timeout: connect ETIMEDOUT', v_user),
    -- Dimatikan dengan sengaja — bukan kegagalan.
    (v_company, v_proyek, 'Laporan harian (dinonaktifkan)', 'laporan_harian',
     'harian', NULL, '18:00', false, now() - interval '200 days', 0, NULL, v_user);

  RAISE NOTICE 'OK: seed kendali dokumen — % gambar, % transmittal, % notulen, % tindakan, % distribusi, % jadwal',
    (SELECT count(*) FROM register_gambar WHERE company_id = v_company),
    (SELECT count(*) FROM transmittal WHERE company_id = v_company),
    (SELECT count(*) FROM notulen_rapat WHERE company_id = v_company),
    (SELECT count(*) FROM notulen_tindakan WHERE company_id = v_company),
    (SELECT count(*) FROM matriks_distribusi WHERE company_id = v_company),
    (SELECT count(*) FROM jadwal_distribusi_laporan WHERE company_id = v_company);
END $$;
