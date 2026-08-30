-- ════════════════════════════════════════════════════════════════════════════
-- 237 — SEED DATA LAPANGAN: tukang, absensi, punch list, NCR, inspeksi
--
-- ── Kenapa ada
--
-- Founder 2026-08-09 minta dashboard menu induk dibuat "semirip mungkin" dengan
-- referensi BuildAxis, dan menambahkan: *"kalo di aplikasi kita belum ada data
-- untuk menyamakan dengan referensi, buatlah dulu."*
--
-- Diaudit sebelum menulis apa pun. Modul Lapangan yang paling kosong, dan
-- justru referensinya yang paling kaya:
--
--   progress_logs         271 baris   ✅ kaya
--   project_photos         36 baris   ✅ cukup
--   workers                 3 baris   ❌ tak cukup untuk "Labor Strength 236"
--   absensi_harian          0 baris   ❌ kosong
--   punch_items             0 baris   ❌ kosong
--   ncr_items               0 baris   ❌ kosong
--   inspection_requests     0 baris   ❌ kosong
--
-- Empat tabel nol baris berarti empat kartu referensi mustahil dibangun jujur.
--
-- ── Tunduk CLAUDE.md §8a.5
--
-- Seluruh isi basis saat ini data dummy, jadi MENAMBAH data uji diizinkan.
-- Yang tetap butuh konfirmasi adalah MENGHAPUS/MENGUBAH yang sudah ada —
-- migrasi ini tak menyentuh satu baris pun yang sudah lebih dulu ada.
--
-- ── Idempoten, dan itu bukan basa-basi
--
-- Setiap baris memakai id tetap (bukan gen_random_uuid()) + ON CONFLICT DO
-- NOTHING. Dijalankan dua kali menghasilkan keadaan yang sama persis. Tanpa
-- ini, replay CI akan menggandakan absensi dan angka "Labor Strength" ikut
-- berlipat tanpa ada yang sadar.
--
-- ── Angkanya dibuat masuk akal, bukan asal besar
--
-- 60 tukang untuk 15 proyek ≈ 4 orang/proyek — wajar untuk kontraktor
-- renovasi/rumah tinggal skala Puraloka. Referensi menampilkan 236 orang untuk
-- proyek highrise; menyalin angkanya akan membuat dashboard berbohong tentang
-- skala usaha yang sebenarnya.
--
-- Absensi 30 hari ke belakang dengan porsi_hari bervariasi (1 = penuh,
-- 0.5 = setengah hari) dan sebagian hari bolong — kehadiran 100% selama 30
-- hari berturut-turut tak pernah terjadi di lapangan mana pun.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- GERBANG — seed ini terikat pada SATU perusahaan yang id-nya dipaku
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⚠ DITAMBAHKAN 2026-08-31. Migrasi ini MEMBUNUH CI selama berhari-hari:
--
--     HARD FAIL — 237_seed_lapangan_dummy.sql
--       insert or update on table "workers"
--       violates foreign key constraint "workers_company_id_fkey"
--
-- Sebabnya bukan cacat SQL. `company_id` di sini adalah id perusahaan di basis
-- DEV, dipaku sebagai literal. Basis CI dimulai kosong dan tak pernah punya
-- baris itu, jadi FK-nya menolak — dan karena tiap migrasi dibungkus transaksi,
-- kegagalan ini menghentikan SELURUH rantai di belakangnya.
--
-- ── Kenapa TIDAK dimasukkan ke SKIP_ALLOWLIST
--
-- Allowlist membuat CI melewatinya. Itu memperbaiki CI, dan hanya CI. Lingkungan
-- baru mana pun — VPS, mesin developer baru, tenant baru — akan menabrak
-- kegagalan yang sama, dan di sana tak ada allowlist yang menolong.
--
-- Preseden repo ini (016 → dicatat di 181, dan 212 pada 2026-08-31) sudah jelas:
-- yang rusak diperbaiki di tempatnya, bukan dilewati.
--
-- ── Yang dilakukan gerbang ini
--
-- Kalau perusahaannya ada  → seed berjalan seperti biasa (dev).
-- Kalau tidak ada          → NO-OP dengan catatan, bukan galat (CI, lingkungan baru).
--
-- Data ini murni dummy untuk mengisi dashboard (lihat kepala berkas), jadi
-- ketiadaannya di lingkungan bersih bukan kerugian. Yang merugikan adalah
-- rantai migrasi yang berhenti karenanya.
DO $seed_lapangan$
BEGIN
IF NOT EXISTS (SELECT 1 FROM companies WHERE id = '48befb54-113d-4e1b-b4dd-91cf79d6d8a0'::uuid) THEN
  RAISE NOTICE '237 dilewati: perusahaan dev 48befb54-113d-4e1b-b4dd-91cf79d6d8a0 tak ada di basis ini. Seed dummy — bukan galat.';
  RETURN;
END IF;

-- ------------------------------------------------------------
-- 1. TUKANG — 57 tambahan (3 sudah ada, total 60)
--
-- Nama diambil dari khazanah nama Sunda/Jawa yang lazim di Bandung Raya, tempat
-- seluruh proyek berada. Nama generik ("Pekerja 1") membuat setiap tangkapan
-- layar terlihat seperti data mentah dan tak bisa dipakai menilai tata letak
-- nyata: nama pendek dan nama panjang berperilaku berbeda pada kolom sempit.
--
-- `tipe` mengikuti nilai yang SUDAH dipakai tiga baris lama: 'tukang' | 'laden'.
-- Perbandingannya ±70/30, angka lapangan yang lazim: satu laden melayani dua
-- sampai tiga tukang.
-- ------------------------------------------------------------
INSERT INTO workers (id, company_id, mandor_id, name, phone, tipe, skills, is_active)
SELECT
  ('d0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  '48befb54-113d-4e1b-b4dd-91cf79d6d8a0'::uuid,
  m.mandor_id,
  n.nama,
  '08' || lpad((1200000000 + i * 7919)::text, 10, '0'),
  CASE WHEN i % 10 < 7 THEN 'tukang' ELSE 'laden' END,
  CASE
    WHEN i % 10 >= 7 THEN ARRAY[]::text[]
    WHEN i % 5 = 0 THEN ARRAY['batu', 'plester']
    WHEN i % 5 = 1 THEN ARRAY['kayu']
    WHEN i % 5 = 2 THEN ARRAY['besi', 'cor']
    WHEN i % 5 = 3 THEN ARRAY['listrik']
    ELSE ARRAY['pipa', 'sanitair']
  END,
  true
FROM generate_series(1, 57) AS i
CROSS JOIN LATERAL (
  SELECT (ARRAY[
    'Asep Sunarya','Dadang Kurnia','Endang Suherman','Yayan Mulyana','Cecep Ridwan',
    'Ujang Saepudin','Tatang Hidayat','Wawan Setiawan','Iwan Gunawan','Deden Rustandi',
    'Nana Suryana','Aep Saepuloh','Dicky Firmansyah','Eman Sulaeman','Jajang Nurjaman',
    'Rohman Hakim','Toto Sugiarto','Ade Rahmat','Maman Suparman','Kusnadi',
    'Herman Wijaya','Rudi Hartono','Slamet Riyadi','Bambang Prasetyo','Joko Susilo',
    'Sutrisno','Marno','Paijo Santoso','Wagiman','Sarno Adi',
    'Untung Prakoso','Darsono','Bagyo Utomo','Legiman','Sukirman',
    'Nurdin Aziz','Sopian Hadi','Rahmat Hidayat','Dodi Setiawan','Yusuf Maulana',
    'Agus Salim','Hendra Kusuma','Irfan Maulana','Kiki Sulaeman','Lukman Nurhakim',
    'Mulyadi','Nandang Suparta','Oman Rohman','Pepen Supendi','Qomarudin',
    'Ridwan Kamil S','Solihin','Tarmidzi','Usep Setiabudi','Wahyu Nugraha',
    'Yana Suryana','Zaenal Arifin'
  ])[i] AS nama
) n
CROSS JOIN LATERAL (
  -- Sebar merata ke mandor yang benar-benar ada; kalau tak ada satu pun,
  -- mandor_id NULL tetap sah (kolomnya nullable).
  SELECT ma.mandor_id
    FROM (SELECT DISTINCT mandor_id FROM mandor_assignments ORDER BY mandor_id) ma
   OFFSET (i % GREATEST((SELECT count(DISTINCT mandor_id) FROM mandor_assignments), 1))
   LIMIT 1
) m
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 2. ABSENSI HARIAN — 30 hari ke belakang
--
-- `scope_id` menunjuk `work_scopes`, bukan proyek langsung. Tiap tukang
-- ditempelkan ke satu scope tetap (dihitung dari nomor urutnya) supaya
-- riwayatnya konsisten — tukang yang berpindah-pindah scope tiap hari adalah
-- pola yang tak pernah terjadi dan akan merusak laporan produktivitas.
--
-- Kehadiran ±82%: hari yang bolong disengaja. Absensi 100% selama sebulan
-- membuat kartu "kehadiran" tak pernah bisa diuji pada keadaan tidak normal —
-- dan keadaan tidak normal itulah yang dashboard harus tunjukkan.
--
-- Lembur hanya pada sebagian kecil hari, dan tak pernah pada hari setengah.
-- ------------------------------------------------------------
INSERT INTO absensi_harian (id, scope_id, worker_id, tanggal, porsi_hari, jam_lembur, keterangan)
SELECT
  ('d1000000-' || lpad(w.n::text, 4, '0') || '-0000-0000-' || lpad(d.hari::text, 12, '0'))::uuid,
  s.id,
  w.id,
  (CURRENT_DATE - d.hari)::date,
  CASE WHEN (w.n * 7 + d.hari * 13) % 11 = 0 THEN 0.5 ELSE 1 END,
  CASE WHEN (w.n * 3 + d.hari * 5) % 9 = 0
            AND (w.n * 7 + d.hari * 13) % 11 <> 0 THEN 2 ELSE 0 END,
  NULL
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
    FROM workers
   WHERE is_active
) w
CROSS JOIN generate_series(0, 29) AS d(hari)
CROSS JOIN LATERAL (
  SELECT ws.id
    FROM work_scopes ws
   ORDER BY ws.id
  OFFSET (w.n % GREATEST((SELECT count(*) FROM work_scopes), 1))
   LIMIT 1
) s
-- Hari Minggu libur, dan ±18% hari kerja bolong (sakit/izin/tak dipanggil).
WHERE EXTRACT(DOW FROM (CURRENT_DATE - d.hari)) <> 0
  AND (w.n * 17 + d.hari * 23) % 100 >= 18
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 3. PUNCH LIST — temuan sisa pekerjaan
--
-- Sebarannya sengaja tidak merata di seluruh status: referensi menampilkan
-- "Open 32 · In Progress 18 · Resolved Today 9", dan bentuk itu hanya muncul
-- kalau statusnya memang bertingkat. Semua-terbuka atau semua-tertutup
-- membuat kartu ringkasannya tak bisa dinilai.
--
-- `ditemukan_oleh` memakai user nyata (bukan uuid karangan): kolom itu FK ke
-- users, dan nilai yang tak ada akan menggagalkan migrasi — sebagaimana
-- seharusnya.
-- ------------------------------------------------------------
--
-- ⚠️ `punch_tutup_terverifikasi` MENOLAK status 'ditutup' tanpa
--    `diverifikasi_oleh` + `ditutup_pada`. Percobaan pertama migrasi ini
--    gagal di situ — dan itu benar: constraint-nya menjaga agar tak ada item
--    yang "selesai" tanpa ada yang bertanggung jawab memeriksanya.
--
--    Yang diperbaiki DATANYA, bukan constraint-nya. Melonggarkan aturan
--    supaya data dummy muat adalah cara termudah membuat data dummy
--    mengajarkan kebiasaan yang salah ke produksi.
INSERT INTO punch_items (id, project_id, nomor, judul, deskripsi, lokasi, severity, status,
                         ditemukan_oleh, target_selesai, ditutup_pada,
                         diverifikasi_oleh, diverifikasi_pada)
SELECT
  ('d2000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  p.id,
  'PL-' || to_char(CURRENT_DATE, 'YYMM') || '-' || lpad(i::text, 3, '0'),
  t.judul,
  t.deskripsi,
  (ARRAY['Lantai 1','Lantai 2','Kamar mandi utama','Dapur','Teras depan',
         'Ruang tamu','Kamar tidur 2','Carport','Taman belakang','Void tangga'])[1 + (i % 10)],
  (ARRAY['ringan','sedang','berat','kritis'])[1 + (i % 4)]::punch_severity,
  CASE
    WHEN i % 10 < 5 THEN 'terbuka'
    WHEN i % 10 < 8 THEN 'dikerjakan'
    WHEN i % 10 = 8 THEN 'menunggu_cek'
    ELSE 'ditutup'
  END::punch_status,
  u.id,
  (CURRENT_DATE + ((i % 21) - 5))::date,
  CASE WHEN i % 10 = 9 THEN now() - ((i % 5) || ' days')::interval ELSE NULL END,
  CASE WHEN i % 10 = 9 THEN v.id ELSE NULL END,
  CASE WHEN i % 10 = 9 THEN now() - ((i % 5) || ' days')::interval ELSE NULL END
FROM generate_series(1, 40) AS i
CROSS JOIN LATERAL (
  SELECT pr.id FROM projects pr WHERE pr.status = 'active'
   ORDER BY pr.created_at
  OFFSET (i % GREATEST((SELECT count(*) FROM projects WHERE status = 'active'), 1)) LIMIT 1
) p
CROSS JOIN LATERAL (
  SELECT us.id FROM users us WHERE us.email LIKE '%@puraloka.id'
   ORDER BY us.id OFFSET (i % GREATEST((SELECT count(*) FROM users WHERE email LIKE '%@puraloka.id'), 1)) LIMIT 1
) u
CROSS JOIN LATERAL (
  SELECT (ARRAY[
    'Cat dinding belang','Nat keramik tidak rata','Pintu tidak menutup rapat',
    'Stop kontak belum terpasang','Bocor pada sambungan pipa','Plafon gypsum retak rambut',
    'Kusen belum difinishing','Kran wastafel goyang','Keramik pecah satu buah',
    'Sealant kaca belum rapi'
  ])[1 + (i % 10)] AS judul,
  (ARRAY[
    'Warna tidak seragam antara panel kiri dan kanan, perlu pengecatan ulang satu lapis.',
    'Selisih ketinggian nat terasa saat diraba; perlu digerinda dan diisi ulang.',
    'Daun pintu menggantung ±3mm, engsel perlu disetel ulang.',
    'Kabel sudah ditarik tetapi armatur belum dipasang.',
    'Rembes terlihat pada sambungan setelah 2 jam pengujian tekanan.',
    'Retak rambut sepanjang ±40cm di dekat sambungan panel.',
    'Kayu masih mentah, belum dicat dasar maupun finish.',
    'Baut pengunci kurang kencang, kran bergerak saat dipakai.',
    'Pecah pada sudut, perlu diganti satu keping.',
    'Sealant meluber ke bidang kaca, perlu dibersihkan dan dirapikan.'
  ])[1 + (i % 10)] AS deskripsi
) t
CROSS JOIN LATERAL (
  -- Verifikator, dipilih BERBEDA dari penemu: orang yang menemukan cacat tak
  -- boleh jadi orang yang menyatakan cacat itu beres. Di NCR aturan ini
  -- bahkan ditegakkan constraint (`ncr_verifikator_bukan_pelapor`); di punch
  -- belum, tetapi datanya tetap dibuat konsisten dengan aturan yang sama.
  SELECT us.id FROM users us
   WHERE us.email LIKE '%@puraloka.id' AND us.id <> u.id
   ORDER BY us.id
  OFFSET ((i + 1) % GREATEST((SELECT count(*) FROM users WHERE email LIKE '%@puraloka.id') - 1, 1))
   LIMIT 1
) v
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 4. INSPEKSI — permintaan pemeriksaan
--
-- Dibuat SEBELUM NCR karena sebagian NCR merujuk hasil inspeksi yang tidak
-- lolos (`inspection_request_id`). Urutan ini bukan selera: FK-nya nyata.
-- ------------------------------------------------------------
--
-- ⚠️ DUA constraint mengikat di sini, dan keduanya benar:
--    `inspeksi_hasil_berpemeriksa` — status lolos/tidak_lolos wajib punya
--       `diperiksa_oleh` DAN `diperiksa_pada`. Hasil tanpa pemeriksa adalah
--       hasil yang tak bisa dipertanggungjawabkan.
--    `inspeksi_gagal_beralasan`   — status tidak_lolos wajib `hasil_catatan`
--       terisi. "Gagal" tanpa alasan tak bisa ditindaklanjuti siapa pun.
INSERT INTO inspection_requests (id, project_id, nomor, judul, lokasi, status,
                                 diminta_oleh, diminta_untuk,
                                 diperiksa_oleh, diperiksa_pada,
                                 hasil_catatan, catatan)
SELECT
  ('d3000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  p.id,
  'IR-' || to_char(CURRENT_DATE, 'YYMM') || '-' || lpad(i::text, 3, '0'),
  (ARRAY[
    'Inspeksi pembesian sloof','Inspeksi bekisting kolom','Inspeksi pengecoran pelat',
    'Inspeksi pasangan bata','Inspeksi instalasi pipa air bersih','Inspeksi instalasi listrik',
    'Inspeksi rangka atap','Inspeksi waterproofing','Inspeksi finishing cat',
    'Inspeksi pemasangan keramik'
  ])[1 + (i % 10)],
  (ARRAY['Zona A','Zona B','Lantai 1','Lantai 2','Area basah','Selasar'])[1 + (i % 6)],
  CASE
    WHEN i % 8 < 2 THEN 'diminta'
    WHEN i % 8 < 4 THEN 'dijadwalkan'
    WHEN i % 8 < 7 THEN 'lolos'
    ELSE 'tidak_lolos'
  END::inspeksi_status,
  u.id,
  now() - ((i % 14) || ' days')::interval,
  CASE WHEN i % 8 >= 4 THEN v.id ELSE NULL END,
  CASE WHEN i % 8 >= 4 THEN now() - ((i % 12) || ' days')::interval ELSE NULL END,
  CASE
    WHEN i % 8 = 7 THEN (ARRAY[
      'Selimut beton kurang dari 25mm pada tiga titik; wajib diperbaiki sebelum lanjut.',
      'Kemiringan pipa di bawah 2%, berpotensi mampet. Ulangi pemasangan.',
      'Pasangan bata melenceng melebihi toleransi 1cm pada ketinggian 3m.'
    ])[1 + (i % 3)]
    WHEN i % 8 >= 4 THEN 'Sesuai gambar kerja dan spesifikasi. Pekerjaan boleh dilanjutkan.'
    ELSE NULL
  END,
  CASE WHEN i % 8 = 7 THEN 'Diterbitkan NCR untuk temuan ini.' ELSE NULL END
FROM generate_series(1, 24) AS i
CROSS JOIN LATERAL (
  SELECT pr.id FROM projects pr WHERE pr.status = 'active'
   ORDER BY pr.created_at
  OFFSET (i % GREATEST((SELECT count(*) FROM projects WHERE status = 'active'), 1)) LIMIT 1
) p
CROSS JOIN LATERAL (
  SELECT us.id FROM users us WHERE us.email LIKE '%@puraloka.id'
   ORDER BY us.id OFFSET (i % GREATEST((SELECT count(*) FROM users WHERE email LIKE '%@puraloka.id'), 1)) LIMIT 1
) u
CROSS JOIN LATERAL (
  -- Pemeriksa berbeda dari peminta: yang meminta inspeksi tak boleh jadi yang
  -- menyatakan hasilnya lolos.
  SELECT us.id FROM users us
   WHERE us.email LIKE '%@puraloka.id' AND us.id <> u.id
   ORDER BY us.id
  OFFSET ((i + 2) % GREATEST((SELECT count(*) FROM users WHERE email LIKE '%@puraloka.id') - 1, 1))
   LIMIT 1
) v
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 5. NCR — ketidaksesuaian
--
-- `biaya_dampak` diisi hanya pada sebagian: tidak setiap ketidaksesuaian punya
-- angka rupiah yang bisa dihitung, dan mengarang nominal untuk semuanya akan
-- membuat kartu "biaya dampak NCR" terlihat lebih presisi daripada kenyataan.
--
-- Nominalnya numeric (§5.4), bukan float.
-- ------------------------------------------------------------
--
-- ⚠️ TIGA constraint mengikat, yang paling ketat di seluruh migrasi ini:
--    `ncr_lanjut_perlu_disposisi`  status selain terbuka/dibatalkan wajib
--       punya disposisi + disposisi_oleh + disposisi_pada. NCR tak boleh maju
--       ke tahap perbaikan sebelum ada yang MEMUTUSKAN apa tindakannya.
--    `ncr_tutup_lengkap`           status ditutup wajib SEMBILAN kolom terisi
--       (verifikator, waktu, tindakan, akar masalah). Menutup NCR tanpa akar
--       masalah berarti masalah yang sama akan terulang.
--    `ncr_verifikator_bukan_pelapor` — pemisahan tugas, ditegakkan DB.
--
-- Ketiganya adalah Ember [C] (CLAUDE.md §5.3): tak dilonggarkan, datanya yang
-- dibuat memenuhi syarat.
INSERT INTO ncr_items (id, project_id, nomor, judul, deskripsi, lokasi, acuan,
                       severity, status, dilaporkan_oleh, target_selesai,
                       biaya_dampak, akar_masalah, tindakan_perbaikan, ditutup_pada,
                       disposisi, disposisi_oleh, disposisi_pada,
                       diverifikasi_oleh, diverifikasi_pada)
SELECT
  ('d4000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  p.id,
  'NCR-' || to_char(CURRENT_DATE, 'YYMM') || '-' || lpad(i::text, 3, '0'),
  t.judul,
  t.deskripsi,
  (ARRAY['Zona A','Zona B','Lantai 1','Lantai 2','Area basah'])[1 + (i % 5)],
  (ARRAY['SNI 2847:2019','SNI 03-6861-2002','Spesifikasi teknis pasal 4.2',
         'Gambar kerja rev.C','RKS bab 5'])[1 + (i % 5)],
  (ARRAY['minor','major','kritis'])[1 + (i % 3)]::ncr_severity,
  CASE
    WHEN i % 7 < 3 THEN 'terbuka'
    WHEN i % 7 < 5 THEN 'perbaikan'
    WHEN i % 7 = 5 THEN 'verifikasi'
    ELSE 'ditutup'
  END::ncr_status,
  u.id,
  (CURRENT_DATE + ((i % 18) - 4))::date,
  CASE WHEN i % 3 = 0 THEN (750000 + (i * 137000))::numeric ELSE NULL END,
  CASE WHEN i % 7 >= 3
       THEN (ARRAY['Pengawasan tidak hadir saat pengecoran.',
                   'Material datang tidak sesuai spesifikasi dan tetap dipakai.',
                   'Metode kerja tidak mengikuti method statement.'])[1 + (i % 3)]
       ELSE NULL END,
  CASE WHEN i % 7 >= 3
       THEN (ARRAY['Bongkar dan kerjakan ulang sesuai gambar.',
                   'Ganti material dengan yang sesuai spesifikasi.',
                   'Perbaiki setempat lalu uji ulang.'])[1 + (i % 3)]
       ELSE NULL END,
  CASE WHEN i % 7 = 6 THEN now() - ((i % 9) || ' days')::interval ELSE NULL END,
  -- Disposisi WAJIB ada begitu status melewati 'terbuka'.
  CASE WHEN i % 7 >= 3
       THEN (ARRAY['perbaiki','terima','bongkar','ubah_spek'])[1 + (i % 4)]::ncr_disposisi
       ELSE NULL END,
  CASE WHEN i % 7 >= 3 THEN v.id ELSE NULL END,
  CASE WHEN i % 7 >= 3 THEN now() - ((i % 11) || ' days')::interval ELSE NULL END,
  -- Verifikasi hanya pada yang sudah ditutup, dan verifikatornya BUKAN pelapor.
  CASE WHEN i % 7 = 6 THEN v.id ELSE NULL END,
  CASE WHEN i % 7 = 6 THEN now() - ((i % 9) || ' days')::interval ELSE NULL END
FROM generate_series(1, 18) AS i
CROSS JOIN LATERAL (
  SELECT pr.id FROM projects pr WHERE pr.status = 'active'
   ORDER BY pr.created_at
  OFFSET (i % GREATEST((SELECT count(*) FROM projects WHERE status = 'active'), 1)) LIMIT 1
) p
CROSS JOIN LATERAL (
  SELECT us.id FROM users us WHERE us.email LIKE '%@puraloka.id'
   ORDER BY us.id OFFSET (i % GREATEST((SELECT count(*) FROM users WHERE email LIKE '%@puraloka.id'), 1)) LIMIT 1
) u
CROSS JOIN LATERAL (
  SELECT (ARRAY[
    'Mutu beton di bawah rencana','Selimut beton kurang','Pasangan bata tidak tegak lurus',
    'Kemiringan pipa air kotor kurang','Sambungan kabel tanpa terminal','Waterproofing tidak menerus'
  ])[1 + (i % 6)] AS judul,
  (ARRAY[
    'Hasil uji tekan silinder 21 MPa, rencana 25 MPa.',
    'Terukur 15mm pada beberapa titik, minimum 25mm sesuai SNI.',
    'Deviasi ±2cm pada ketinggian 3m, melebihi toleransi 1cm.',
    'Kemiringan terukur 0,5%, minimum 2% agar tidak mampet.',
    'Sambungan hanya dipuntir dan diisolasi, tanpa terminal.',
    'Terputus di sudut pertemuan dinding dan lantai.'
  ])[1 + (i % 6)] AS deskripsi
) t
CROSS JOIN LATERAL (
  -- Satu orang untuk disposisi DAN verifikasi, asal bukan pelapor. Di dunia
  -- nyata keduanya bisa orang berbeda, tetapi yang ditegakkan constraint
  -- hanyalah "bukan pelapor" — dan itulah yang dijaga di sini.
  SELECT us.id FROM users us
   WHERE us.email LIKE '%@puraloka.id' AND us.id <> u.id
   ORDER BY us.id
  OFFSET ((i + 3) % GREATEST((SELECT count(*) FROM users WHERE email LIKE '%@puraloka.id') - 1, 1))
   LIMIT 1
) v
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 6. VERIFIKASI — migrasi gagal keras kalau datanya tak benar-benar masuk.
--
-- Pelajaran migrasi 043/142: migrasi bisa tercatat sukses tanpa pernah membuat
-- apa pun. Blok ini memastikan kegagalan itu tak bisa terulang diam-diam.
--
-- Ambangnya SENGAJA di bawah jumlah yang di-insert: sebagian baris memang
-- disaring (hari Minggu, kehadiran bolong), dan mematok angka persis akan
-- membuat migrasi ini merah setiap kali tanggal berganti.
-- ------------------------------------------------------------

END $seed_lapangan$;

DO $$
DECLARE
  n_worker  INT;
  n_absen   INT;
  n_punch   INT;
  n_ncr     INT;
  n_inspek  INT;
BEGIN
  /*
    VERIFIKASI TUNDUK PADA GERBANG YANG SAMA.

    Tanpa ini, blok ini tetap berjalan di lingkungan yang seed-nya di-no-op
    dan RAISE EXCEPTION karena mendapati nol baris — jadi gerbang di atas
    tak menolong apa pun: migrasinya tetap mematikan rantai, hanya dengan
    pesan yang berbeda.

    Diukur 2026-08-31: gerbang dipasang, no-op berhasil, lalu blok INI yang
    gagal. Memasang gerbang di satu tempat dan lupa tempat kedua adalah cara
    paling mudah menyimpulkan "sudah beres" atas sesuatu yang belum.
  */
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = '48befb54-113d-4e1b-b4dd-91cf79d6d8a0'::uuid) THEN
    RAISE NOTICE '237 verifikasi dilewati: seed tak dijalankan di basis ini.';
    RETURN;
  END IF;

  SELECT count(*) INTO n_worker FROM workers WHERE is_active;
  SELECT count(*) INTO n_absen  FROM absensi_harian;
  SELECT count(*) INTO n_punch  FROM punch_items;
  SELECT count(*) INTO n_ncr    FROM ncr_items;
  SELECT count(*) INTO n_inspek FROM inspection_requests;

  IF n_worker < 55 THEN
    RAISE EXCEPTION '237 gagal: workers hanya %, diharapkan >= 55', n_worker;
  END IF;
  IF n_absen < 800 THEN
    RAISE EXCEPTION '237 gagal: absensi_harian hanya %, diharapkan >= 800', n_absen;
  END IF;
  IF n_punch < 35 THEN
    RAISE EXCEPTION '237 gagal: punch_items hanya %, diharapkan >= 35', n_punch;
  END IF;
  IF n_ncr < 15 THEN
    RAISE EXCEPTION '237 gagal: ncr_items hanya %, diharapkan >= 15', n_ncr;
  END IF;
  IF n_inspek < 20 THEN
    RAISE EXCEPTION '237 gagal: inspection_requests hanya %, diharapkan >= 20', n_inspek;
  END IF;

  -- Sebaran status WAJIB bertingkat. Kalau semuanya jatuh ke satu status,
  -- kartu ringkasan di dashboard tak akan pernah bisa diuji — dan itu jenis
  -- data uji yang lolos hitungan tapi tak berguna.
  IF (SELECT count(DISTINCT status) FROM punch_items) < 3 THEN
    RAISE EXCEPTION '237 gagal: punch_items tak bertingkat statusnya';
  END IF;
  IF (SELECT count(DISTINCT status) FROM inspection_requests) < 3 THEN
    RAISE EXCEPTION '237 gagal: inspection_requests tak bertingkat statusnya';
  END IF;

  RAISE NOTICE '237 OK — workers=% absensi=% punch=% ncr=% inspeksi=%',
    n_worker, n_absen, n_punch, n_ncr, n_inspek;
END $$;
