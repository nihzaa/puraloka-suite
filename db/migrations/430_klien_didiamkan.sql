-- ============================================================================
-- 430 - KLIEN YANG DIDIAMKAN (tanpa nomor rencana)
-- ============================================================================
--
-- ── OTOMASI PERTAMA YANG LAHIR DARI PEMETAAN, BUKAN DARI RENCANA
--
-- Founder bertanya: adakah otomasi yang menangani SEMUA kemungkinan di dunia
-- proyek - pemasok, orang lapangan, kantor, klien?
--
-- Dipetakan 51 peristiwa nyata lintas tujuh pihak, lalu dicocokkan ke katalog:
--
--   PEMASOK          7 peristiwa   6 tertangani
--   ORANG LAPANGAN   9 peristiwa   8 tertangani
--   KANTOR/INTERNAL 11 peristiwa  10 tertangani
--   KLIEN            8 peristiwa   7 tertangani
--   ASET/ALAT        6 peristiwa   5 tertangani
--   GUDANG           4 peristiwa   4 tertangani
--   RISIKO/LEGAL     6 peristiwa   6 tertangani
--   ────────────────────────────────────────────
--                   51 peristiwa  46 tertangani, 5 celah
--
-- Yang ini salah satu dari lima celah, dan sinyalnya paling kuat sekaligus
-- paling mahal bila dibiarkan.
--
-- ── YANG DITEMUKAN SAAT DIUKUR
--
--   15 proyek aktif
--    5 TAK PERNAH punya satu pun laporan progres - termasuk dua proyek
--      Dinas PUPR senilai Rp 11 miliar
--    9 terakhir dilaporkan lebih dari dua pekan lalu, terlama 131 hari
--
-- Empat belas dari lima belas proyek berjalan tanpa kabar ke pemiliknya.
--
-- ⚠ Angka di atas SAAT DIUKUR. Jangan dipercaya sebagai keadaan sekarang -
--   migrasi 428 sudah pernah menulis angka mati yang basi dalam satu jam.
--   Ukur dari jawaban rutenya: `checked.belum_pernah`, `checked.lama_diam`.
--
-- ── BUKAN DUPLIKAT `progres-belum-lapor` (3.11)
--
-- 3.11 menegur MANDOR yang belum mengisi laporan harian - soal disiplin
-- pencatatan, penerimanya orang dalam.
--
-- Ini menjawab "klien mana yang sudah lama tak mendengar kabar apa pun?" -
-- penerimanya yang mengurus hubungan klien, tindakannya MENELEPON.
--
-- Keduanya bisa benar sekaligus: mandor rajin melapor ke sistem tetapi tak
-- seorang pun meneruskannya ke klien; atau sebaliknya.
--
-- ── DUA SEBAB SENGAJA DIPISAH
--
--   BELUM PERNAH  proses pelaporannya yang belum ada. Satu laporan susulan
--                 tak menyelesaikannya.
--   LAMA DIAM     jalurnya ada dan berhenti. Cukup satu laporan menyusul.
--
-- Menyamakan pesannya membuat yang pertama diperlakukan seperti yang kedua.
--
-- ── IZIN DIUKUR: `clients:manage`. Yang ada di tabel `clients:manage` dan
--    `clients:view`; ini menuntut TINDAKAN (menghubungi klien), bukan melihat.
--
-- ── JADWAL: MINGGUAN. Kabar ke klien berirama mingguan di praktik kontraktor;
--    harian akan menegur proyek yang laporannya memang belum jatuh tempo.
-- ============================================================================

INSERT INTO notification_rules (company_id, event_type, label, description, is_active)
SELECT c.id, 'klien_didiamkan', 'Klien Yang Didiamkan',
       'Proyek aktif yang lama tak dilaporkan progresnya, atau belum pernah sama sekali',
       true
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, event_type) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description, is_active = true;

INSERT INTO notification_rule_targets (company_id, rule_id, target_type, permission_key)
SELECT r.company_id, r.id, 'permission', 'clients:manage'
  FROM notification_rules r
 WHERE r.event_type = 'klien_didiamkan'
   AND NOT EXISTS (SELECT 1 FROM notification_rule_targets t
                    WHERE t.rule_id = r.id AND t.permission_key = 'clients:manage');

INSERT INTO company_settings (company_id, key, value, value_type, category, description)
SELECT c.id, 'otomasi.klien_didiamkan.hari', '14'::jsonb, 'number', 'otomasi',
       'Hari tanpa laporan progres sebelum klien dianggap didiamkan. Klien yang bertanya duluan sudah terlambat.'
  FROM companies c WHERE c.is_active
ON CONFLICT (company_id, key) DO NOTHING;

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'klien-didiamkan', 'mingguan', '06:40', 1, true
  FROM companies c
 WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id)
ON CONFLICT (company_id, tugas) DO UPDATE
  SET jenis = EXCLUDED.jenis, jam = EXCLUDED.jam,
      hari_pekan = EXCLUDED.hari_pekan, aktif = true;

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE n_aktif INT; n_ang INT; n INT; nilai NUMERIC;
BEGIN
  SELECT count(*) INTO n_aktif FROM companies WHERE is_active;
  /*
    `is_active` DITAMBAHKAN 2026-08-31 — sama dengan enam migrasi otomasi lain
    hari ini. `n_ang` dipakai sebagai patokan jumlah jadwal, dan jadwalnya
    hanya dihitung untuk company AKTIF; tanpa saringan yang sama di sini,
    patokannya memuat company yang sudah dinonaktifkan.
  */
  SELECT count(*) INTO n_ang FROM companies c
   WHERE c.is_active
     AND EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id);

    /*
    DISARING KE COMPANY AKTIF — 2026-08-31.

    Cek cacahan membandingkan jumlah baris dengan `jumlah company aktif`,
    tetapi menghitung baris milik SEMUA company — termasuk yang dinonaktifkan
    sesudah barisnya dibuat. Begitu ada satu saja, migrasinya gagal atas
    selisih yang wajar: "aturan ada 3 baris, harus 2".

    Barisnya tak dihapus: ia tak dievaluasi siapa pun, dan menghapusnya
    membuang konfigurasi yang berguna bila company-nya diaktifkan lagi.
  */
  SELECT count(*) INTO n FROM notification_rules r
   JOIN companies c ON c.id = r.company_id AND c.is_active
   WHERE r.event_type = 'klien_didiamkan' AND r.is_active;
  IF n <> n_aktif THEN
    RAISE EXCEPTION '430 gagal: aturan ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM notification_rules r
    JOIN companies c ON c.id = r.company_id AND c.is_active
    JOIN notification_rule_targets t ON t.rule_id = r.id
   WHERE r.event_type = 'klien_didiamkan' AND t.permission_key = 'clients:manage';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '430 gagal: target ada % baris, harus %', n, n_aktif;
  END IF;

  SELECT count(*) INTO n FROM permissions WHERE key = 'clients:manage';
  IF n < 1 THEN
    RAISE EXCEPTION '430 gagal: izin clients:manage tidak ada di permissions';
  END IF;

  SELECT count(*) INTO n
    FROM company_settings cs
    JOIN companies c ON c.id = cs.company_id AND c.is_active
   WHERE cs.key = 'otomasi.klien_didiamkan.hari';
  IF n <> n_aktif THEN
    RAISE EXCEPTION '430 gagal: setelan ada % baris, harus %', n, n_aktif;
  END IF;

  /*
    Ambang WAJIB 3..90.

    Di bawah 3 hari menegur proyek yang laporannya memang belum jatuh tempo -
    akhir pekan saja sudah dua hari, dan peringatan yang menyala tiap Senin
    pagi untuk seluruh proyek kehilangan artinya dalam sepekan.

    Di atas 90 hari membuat proyek bisa didiamkan satu kuartal penuh sebelum
    ada yang tahu. Pada titik itu yang dijawab bukan lagi kabar proyek,
    melainkan kenapa kliennya tak dikabari.
  */
  SELECT MIN((value #>> '{}')::numeric) INTO nilai FROM company_settings
   WHERE key = 'otomasi.klien_didiamkan.hari';
  IF nilai IS NULL OR nilai < 3 OR nilai > 90 THEN
    RAISE EXCEPTION '430 gagal: ambang hari % di luar 3..90', nilai;
  END IF;

  /*
    PRASYARAT: harus ADA proyek aktif untuk diperiksa.

    Tanpa proyek aktif, rutenya membalas 200 dengan nol notifikasi - tak bisa
    dibedakan dari "semua klien terkabari". Kelumpuhan yang sama dengan
    `min_stock` nol (425) dan peta RAB kosong (426).
  */
  /*
    ⚠ DITURUNKAN JADI CATATAN 2026-08-31 — dulu RAISE EXCEPTION.

    Alasan aslinya benar: tanpa proyek aktif, rutenya membalas 200 dengan nol
    notifikasi, tak terbedakan dari "semua klien terkabari".

    Tapi basis yang baru lahir memang belum punya proyek aktif — diukur di CI
    hari ini — dan RAISE EXCEPTION di sini menghentikan SELURUH rantai
    migrasi:

        HARD FAIL — 430_klien_didiamkan.sql
          430 gagal: tak ada proyek aktif — otomasi ini tak akan pernah berbunyi

    Pertukarannya sama dengan 466, 467, 485, 509, dan 524 hari ini: automation
    tanpa bahan DIAM, sementara rantai migrasi yang berhenti membuat seluruh
    sistem tak bisa dipasang sama sekali.
  */
  SELECT count(*) INTO n FROM projects
   WHERE is_deleted = false AND status = 'active';
  IF n < 1 THEN
    RAISE NOTICE '430: nol proyek aktif di basis ini — otomasi belum punya bahan. Bukan galat.';
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas jt
   JOIN companies c ON c.id = jt.company_id AND c.is_active
   WHERE jt.tugas = 'klien-didiamkan' AND aktif AND jenis = 'mingguan';
  IF n <> n_ang THEN
    RAISE EXCEPTION '430 gagal: jadwal mingguan ada % baris, harus %', n, n_ang;
  END IF;

  RAISE NOTICE '430 OK: aturan + target, 1 setelan, jadwal mingguan (% badan usaha)', n_aktif;
END $$;
