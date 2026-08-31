-- ============================================================================
-- 467 - SENGKETA YANG BERHENTI BERGERAK (tanpa nomor rencana)
-- ============================================================================
--
-- ── SATU-SATUNYA OTOMASI YANG OBJEKNYA TIDAK MEMBURUK
--
-- Hampir semua otomasi di repo ini menjaga sesuatu yang MEMBURUK bila
-- didiamkan: stok habis, polis kedaluwarsa, alat rusak, beton gagal.
--
-- Sengketa tidak memburuk - ia KEDALUWARSA.
--
-- Klaim konstruksi punya tenggat yang lahir dari kontrak dan dari hukum:
-- pemberitahuan dalam sekian hari, somasi sebelum arbitrase, daluwarsa
-- gugatan. Klaim yang BENAR secara isi bisa GUGUR total karena berhenti
-- bergerak, dan tak ada satu pun gejala di sepanjang jalan.
--
-- ── YANG DITEMUKAN, diukur 2026-08-19
--
--   SKT-01  Perbedaan volume galian tanah keras
--           Rp 420.000.000 - negosiasi - TANPA FORUM - 97 hari
--   SKT-02  Perpanjangan waktu akibat keterlambatan lahan
--           mediasi BANI Bandung - 170 hari - nilai tuntutan TIDAK DIISI
--   (tanpa nomor)  Batas lahan sisi utara tak sesuai sertifikat
--           lawan "Warga RT 04 Cibiru" - dicatat - 22 hari
--
-- SKT-01 yang paling mahal sekaligus paling sunyi: hampir setengah miliar,
-- masih "negosiasi" sesudah tiga bulan, dan `forum` NULL - artinya belum ada
-- jalur formal apa pun bila perundingannya buntu.
--
-- ⚠ Angka di atas SAAT DIUKUR. Ukur sendiri lewat jawaban rutenya:
--   `checked.belum_bernomor`, `checked.tanpa_forum`, `checked.lama_diam`.
--
-- ── TIGA AMBANG, URUTANNYA MENURUT YANG PALING MUDAH DIKERJAKAN
--
--   NOMOR  14 hari   memberi nomor perkara pekerjaan lima menit
--   FORUM  60 hari   memilih forum arbitrase keputusan direksi
--   DIAM   90 hari   sisanya
--
-- Bukan menurut yang paling mahal. Peringatan yang meminta hal termudah lebih
-- mungkin dikerjakan hari itu juga; peringatan yang meminta keputusan direksi
-- ditunda sampai rapat berikutnya, dan rapat berikutnya tak selalu datang.
--
-- ── IZIN DIUKUR: `sengketa:manage`. Yang ada `sengketa:manage` dan
--    `sengketa:view`; ini menuntut TINDAKAN (memberi nomor, menetapkan forum).
--
-- ── JADWAL: MINGGUAN, dan ini kebalikan dari 433/466 yang harian.
--
--    Sengaja. Perkara hukum bergerak dalam hitungan minggu dan bulan; tak ada
--    yang bisa dikerjakan hari Selasa yang tak bisa dikerjakan hari Senin.
--    Menjadwalkannya harian cuma menghasilkan tujuh pengingat untuk satu
--    keputusan yang memang butuh waktu.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'sengketa_menggantung', 'Sengketa Berhenti Bergerak',
       'Klaim yang belum diberi nomor perkara, belum punya forum penyelesaian, atau sekadar lama tak selesai',
       true
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', 'sengketa:manage'
  FROM notification_rules r
 WHERE r.event_type = 'sengketa_menggantung'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = 'sengketa:manage');

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.sengketa.hari_nomor', '14'::jsonb, 'number', 'otomasi',
       'Hari sebelum sengketa tanpa nomor perkara diingatkan. Tanpa nomor ia tak bisa dirujuk di surat-menyurat dan praktis tak ada dalam arsip.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.sengketa.hari_forum', '60'::jsonb, 'number', 'otomasi',
       'Hari sebelum sengketa tanpa forum penyelesaian diingatkan. Sesudah berbulan-bulan tanpa forum, tak ada rencana apa pun bila perundingannya buntu.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.sengketa.hari_diam', '90'::jsonb, 'number', 'otomasi',
       'Hari sebelum sengketa yang sudah bernomor dan berforum, tetapi belum juga selesai, diingatkan.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.sengketa.nilai_besar', '100000000'::jsonb, 'number', 'otomasi',
       'Nilai tuntutan yang dianggap besar. Di atas angka ini notifikasinya berprioritas tinggi; yang di bawahnya tetap dikirim, hanya tidak membangunkan siapa pun.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'sengketa-menggantung', 'mingguan', '07:10', 1, true
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n_aktif INT; n_ang INT; n INT; a_nomor NUMERIC; a_forum NUMERIC; a_diam NUMERIC; a_nilai NUMERIC;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  /*
    `is_active` DITAMBAHKAN 2026-08-31.

    `n_ang` dipakai sebagai patokan jumlah jadwal, dan jadwalnya kini hanya
    dihitung untuk company AKTIF. Tanpa saringan yang sama di sini, patokannya
    memuat company yang sudah dinonaktifkan dan arahnya terbalik:

        jadwal HARIAN ada 2 baris, harus 4

    Dua pemeriksaan yang mengukur populasi berbeda tak boleh dibandingkan.
  */
  SELECT count(*) INTO n_ang FROM companies c
   WHERE c.is_active
     AND EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

  SELECT count(*) INTO n FROM notification_rules r
    JOIN companies c ON c.id = r.company_id AND c.is_active
   WHERE r.event_type = 'sengketa_menggantung' AND r.is_active;
  IF n <> n_aktif THEN
    RAISE EXCEPTION '467 gagal: aturan ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM notification_rules r
    JOIN companies c ON c.id = r.company_id AND c.is_active
    JOIN notification_rule_targets t ON t.rule_id = r.id
   WHERE r.event_type = 'sengketa_menggantung' AND t.permission_key = 'sengketa:manage';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '467 gagal: target ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM permissions WHERE key = 'sengketa:manage';
  IF n < 1 THEN
    RAISE EXCEPTION '467 gagal: izin sengketa:manage tidak ada di permissions';
  END IF;

  SELECT count(*) INTO n FROM company_settings cs
    JOIN companies c ON c.id = cs.company_id AND c.is_active
   WHERE cs.key IN ('otomasi.sengketa.hari_nomor', 'otomasi.sengketa.hari_forum',
                 'otomasi.sengketa.hari_diam', 'otomasi.sengketa.nilai_besar');
  IF n <> n_aktif * 4 THEN
    RAISE EXCEPTION '467 gagal: setelan ada % baris, harus % (4 per badan usaha)', n, n_aktif * 4;
  END IF;

  SELECT MIN((value #>> '{}')::numeric) INTO a_nomor FROM company_settings WHERE key = 'otomasi.sengketa.hari_nomor';
  SELECT MIN((value #>> '{}')::numeric) INTO a_forum FROM company_settings WHERE key = 'otomasi.sengketa.hari_forum';
  SELECT MIN((value #>> '{}')::numeric) INTO a_diam  FROM company_settings WHERE key = 'otomasi.sengketa.hari_diam';
  SELECT MIN((value #>> '{}')::numeric) INTO a_nilai FROM company_settings WHERE key = 'otomasi.sengketa.nilai_besar';

  IF a_nomor IS NULL OR a_nomor < 1   OR a_nomor > 120 THEN RAISE EXCEPTION '467 gagal: ambang nomor % di luar 1..120', a_nomor; END IF;
  IF a_forum IS NULL OR a_forum < 7   OR a_forum > 365 THEN RAISE EXCEPTION '467 gagal: ambang forum % di luar 7..365', a_forum; END IF;
  IF a_diam  IS NULL OR a_diam  < 14  OR a_diam  > 730 THEN RAISE EXCEPTION '467 gagal: ambang diam % di luar 14..730', a_diam; END IF;
  IF a_nilai IS NULL OR a_nilai < 0                    THEN RAISE EXCEPTION '467 gagal: ambang nilai % negatif', a_nilai; END IF;

  /*
    INVARIAN: nomor <= forum <= diam.

    Ketiganya diperiksa BERURUTAN di kode, dan yang pertama cocok menang. Kalau
    urutan ambangnya terbalik, otomasi ini tetap berjalan dan tetap membalas
    200 - yang berubah cuma sebab yang dilaporkan.

    Contoh yang paling merugikan: nomor 90, forum 14. Sengketa berumur 30 hari
    yang tak bernomor DAN tak berforum akan dilaporkan sebagai "tanpa forum",
    dan orang diminta memutuskan forum arbitrase untuk perkara yang bahkan
    belum punya nomor. Permintaan yang tak masuk akal itu ditunda, lalu
    dilupakan - dan pekerjaan lima menit yang seharusnya diminta tak pernah
    disebut sama sekali.
  */
  IF a_nomor > a_forum OR a_forum > a_diam THEN
    RAISE EXCEPTION
      '467 gagal: urutan ambang salah (nomor=%, forum=%, diam=%) — harus menaik, karena sebab diperiksa berurutan dari yang paling mudah dikerjakan',
      a_nomor, a_forum, a_diam;
  END IF;

  /*
    JADWAL WAJIB MINGGUAN - kebalikan dari 433 dan 466 yang harian.

    Perkara hukum bergerak dalam hitungan minggu dan bulan; tak ada yang bisa
    dikerjakan hari Selasa yang tak bisa dikerjakan hari Senin. Menyeragamkan
    ke harian "supaya konsisten" menghasilkan tujuh pengingat untuk satu
    keputusan yang memang butuh waktu - dan itu cara tercepat membuat orang
    berhenti membaca notifikasi sengketa sama sekali.
  */
  SELECT count(*) INTO n FROM jadwal_tugas jt
    JOIN companies c ON c.id = jt.company_id AND c.is_active
   WHERE jt.tugas = 'sengketa-menggantung' AND aktif AND jenis = 'mingguan';
  IF n <> n_ang THEN
    RAISE EXCEPTION '467 gagal: jadwal MINGGUAN ada % baris, harus %', n, n_ang;
  END IF;

  /*
    PRASYARAT: harus ada sengketa untuk diperiksa.

    Tanpa itu rutenya membalas 200 dengan nol notifikasi - tak bisa dibedakan
    dari "tak ada perkara yang terlantar".
  */
  SELECT count(*) INTO n FROM sengketa;
  /*
    KETIADAAN DATA BUKAN KEGAGALAN MIGRASI — DITURUNKAN 2026-08-31.

    Cek ini mencegah kelumpuhan yang nyata: automation yang tak punya bahan
    membalas 200 dengan nol notifikasi, dan itu tak bisa dibedakan dari
    "semuanya beres". Alasannya benar.

    Tapi di basis yang BARU LAHIR tabelnya memang kosong, dan RAISE EXCEPTION
    di sini menghentikan SELURUH rantai migrasi — di CI, VPS baru, dan mesin
    developer baru. Sebelas migrasi sudah melakukan itu hari ini (237, 239,
    271, 295, 320, 323, 335, 337, 392, 425, 428), dan tiap satunya memakan
    satu putaran CI penuh untuk ditemukan.

    Diturunkan jadi CATATAN. Yang hilang: peringatan dini saat seseorang
    memasang automation ini tanpa datanya. Yang didapat: rantai migrasi yang
    bisa berjalan di lingkungan baru mana pun.

    Pertukaran itu berpihak pada yang kedua — automation tanpa data DIAM,
    sementara rantai migrasi yang berhenti membuat SELURUH sistem tak bisa
    dipasang sama sekali.
  */
  IF n < 1 THEN
    RAISE NOTICE '467: sengketa kosong di basis ini — otomasi belum punya bahan. Bukan galat.';
  END IF;

  RAISE NOTICE '467 OK: aturan + target, 4 setelan, jadwal mingguan (% badan usaha)', n_aktif;
END $$;
