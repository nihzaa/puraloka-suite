-- ============================================================================
-- 215 — KENDALI DOKUMEN: transmittal · register gambar · notulen · distribusi
-- ============================================================================
--
-- TUNDA kelompok D, enam item sekaligus. Dibangun atas keputusan founder
-- 2026-08-07 meski pemicunya ("proyek dengan pertukaran dokumen formal
-- berlapis") belum menyala.
--
-- ── Kenapa keenamnya satu migrasi
--
-- Karena keenamnya menjawab SATU pertanyaan yang sama: "siapa menerima
-- dokumen apa, versi berapa, kapan — dan bisa dibuktikan?" Memecahnya jadi
-- enam tabel terpisah tanpa relasi akan mengulang cacat yang justru mereka
-- tutup: dokumen yang beredar tanpa jejak.
--
-- ── Yang paling mahal kalau ini tidak ada
--
-- Bukan kerapian arsip. Yang mahal:
--
--   · Tukang mengerjakan gambar REVISI LAMA karena revisi baru tak sampai.
--     Pekerjaan dibongkar, dan yang menanggung biayanya ditentukan oleh
--     siapa yang punya bukti pengiriman.
--   · Keputusan rapat yang "sudah disepakati" tapi tak ada yang mencatat
--     siapa mengerjakan apa dan kapan tenggatnya.
--   · Dokumen dikirim ke orang yang tak berhak, atau justru TIDAK dikirim ke
--     yang berhak — keduanya baru ketahuan saat sudah terlambat.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

-- ── 1. Register gambar (drawing register) ──────────────────────────────────
--
-- Gambar berbeda dari dokumen biasa: ia PUNYA REVISI, dan revisi lama harus
-- tetap ada (untuk membuktikan apa yang berlaku saat pekerjaan dikerjakan)
-- sekaligus JELAS TIDAK BERLAKU LAGI.
CREATE TABLE IF NOT EXISTS register_gambar (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nomor             text NOT NULL,
  judul             text NOT NULL,
  disiplin          text NOT NULL DEFAULT 'arsitektur'
                      CHECK (disiplin IN ('arsitektur','struktur','mep','sipil','lansekap','lainnya')),
  -- Revisi sebagai ANGKA, bukan huruf: 'A','B','AA' tak bisa diurutkan
  -- dengan benar, dan "revisi terbaru" jadi soal tafsir.
  revisi            integer NOT NULL DEFAULT 0,
  tahap             text NOT NULL DEFAULT 'IFR'
                      CHECK (tahap IN ('IFR','IFA','IFC','AB')),
  status            text NOT NULL DEFAULT 'berlaku'
                      CHECK (status IN ('berlaku','digantikan','ditarik')),
  -- Revisi yang menggantikan baris ini. Terisi = baris ini TIDAK BERLAKU.
  digantikan_oleh   uuid REFERENCES register_gambar(id) ON DELETE SET NULL,
  file_url          text,
  tanggal_terbit    date,
  catatan           text,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gambar_unik UNIQUE (project_id, nomor, revisi),
  CONSTRAINT gambar_revisi_tak_negatif CHECK (revisi >= 0),
  -- Gambar yang "digantikan" WAJIB menyebut penggantinya. Tanpa itu, yang
  -- membacanya tahu gambar ini mati tapi tak tahu mana yang hidup — dan
  -- tetap mengerjakan yang lama karena itu satu-satunya yang ia punya.
  CONSTRAINT gambar_pengganti_jelas CHECK (
    status <> 'digantikan' OR digantikan_oleh IS NOT NULL),
  CONSTRAINT gambar_bukan_pengganti_diri CHECK (id <> digantikan_oleh)
);

-- ── 2. Transmittal — bukti kirim-terima dokumen ────────────────────────────
CREATE TABLE IF NOT EXISTS transmittal (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nomor             text NOT NULL,
  perihal           text NOT NULL,
  -- Ke SIAPA. Bisa pihak luar (nama bebas) atau pengguna sistem.
  tujuan_nama       text NOT NULL,
  tujuan_user_id    uuid REFERENCES users(id),
  tujuan_organisasi text,
  maksud            text NOT NULL DEFAULT 'untuk_informasi'
                      CHECK (maksud IN ('untuk_informasi','untuk_persetujuan','untuk_konstruksi','untuk_tinjauan','untuk_arsip')),
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','dikirim','diterima','ditolak')),
  dikirim_pada      timestamptz,
  -- Bukti DITERIMA, terpisah dari bukti DIKIRIM.
  --
  -- Keduanya sengaja tidak digabung: "sudah saya kirim" dan "sudah saya
  -- terima" adalah dua klaim berbeda, dan selisih di antaranya persis yang
  -- diperdebatkan saat pekerjaan salah gambar harus dibongkar.
  diterima_pada     timestamptz,
  diterima_oleh     text,
  catatan           text,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT transmittal_nomor_unik UNIQUE (company_id, nomor),
  CONSTRAINT transmittal_kirim_bertanggal CHECK (
    status = 'draft' OR dikirim_pada IS NOT NULL),
  -- Status 'diterima' WAJIB punya tanggal terima. Tanpa itu, "sudah
  -- diterima" adalah klaim tanpa bukti — dan bukti itulah seluruh gunanya
  -- transmittal.
  CONSTRAINT transmittal_terima_bertanggal CHECK (
    status <> 'diterima' OR diterima_pada IS NOT NULL),
  CONSTRAINT transmittal_terima_sesudah_kirim CHECK (
    diterima_pada IS NULL OR dikirim_pada IS NULL OR diterima_pada >= dikirim_pada)
);

-- Isi transmittal: gambar dan/atau dokumen yang dibawanya.
CREATE TABLE IF NOT EXISTS transmittal_item (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  transmittal_id    uuid NOT NULL REFERENCES transmittal(id) ON DELETE CASCADE,
  gambar_id         uuid REFERENCES register_gambar(id) ON DELETE SET NULL,
  document_id       uuid REFERENCES documents(id) ON DELETE SET NULL,
  -- Untuk lampiran yang tak ada di kedua register.
  uraian            text,
  jumlah_lembar     integer,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Item kosong = transmittal yang mengaku mengirim sesuatu, tanpa sesuatu.
  CONSTRAINT transmittal_item_ada_isi CHECK (
    gambar_id IS NOT NULL OR document_id IS NOT NULL
    OR (uraian IS NOT NULL AND length(trim(uraian)) > 0)),
  CONSTRAINT transmittal_item_lembar_wajar CHECK (
    jumlah_lembar IS NULL OR jumlah_lembar > 0)
);

-- ── 3. Notulen rapat ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notulen_rapat (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nomor             text NOT NULL,
  judul             text NOT NULL,
  tanggal           date NOT NULL,
  tempat            text,
  jenis             text NOT NULL DEFAULT 'mingguan'
                      CHECK (jenis IN ('mingguan','bulanan','kickoff','teknis','k3','khusus')),
  hadir             text,
  pembahasan        text,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','final','disahkan')),
  disahkan_oleh     uuid REFERENCES users(id),
  disahkan_pada     timestamptz,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notulen_nomor_unik UNIQUE (company_id, nomor),
  CONSTRAINT notulen_pengesahan_lengkap CHECK (
    status <> 'disahkan' OR disahkan_pada IS NOT NULL)
);

-- Butir tindakan. INI yang membuat notulen berguna, bukan ringkasan
-- pembicaraannya: keputusan tanpa penanggung jawab dan tenggat adalah
-- keputusan yang tak pernah dikerjakan, dan rapat berikutnya membahasnya lagi.
CREATE TABLE IF NOT EXISTS notulen_tindakan (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  notulen_id        uuid NOT NULL REFERENCES notulen_rapat(id) ON DELETE CASCADE,
  urutan            integer NOT NULL DEFAULT 1,
  uraian            text NOT NULL,
  -- Penanggung jawab: pengguna sistem ATAU nama pihak luar.
  pj_user_id        uuid REFERENCES users(id),
  pj_nama           text,
  tenggat           date,
  status            text NOT NULL DEFAULT 'terbuka'
                      CHECK (status IN ('terbuka','selesai','dibatalkan')),
  selesai_pada      date,
  catatan           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tindakan_ada_pj CHECK (
    pj_user_id IS NOT NULL OR (pj_nama IS NOT NULL AND length(trim(pj_nama)) > 0)),
  CONSTRAINT tindakan_uraian_berisi CHECK (length(trim(uraian)) > 0),
  CONSTRAINT tindakan_selesai_bertanggal CHECK (
    status <> 'selesai' OR selesai_pada IS NOT NULL)
);

-- ── 4. Matriks distribusi ──────────────────────────────────────────────────
--
-- Siapa berhak menerima jenis dokumen apa. Yang dijawabnya: "kenapa
-- konsultan struktur tak pernah dapat gambar MEP?" — dan jawabannya harus
-- berupa aturan tertulis, bukan ingatan orang yang biasa mengirim.
CREATE TABLE IF NOT EXISTS matriks_distribusi (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id        uuid REFERENCES projects(id) ON DELETE CASCADE,
  jenis_dokumen     text NOT NULL,
  penerima_nama     text NOT NULL,
  penerima_user_id  uuid REFERENCES users(id),
  penerima_email    text,
  organisasi        text,
  peran             text NOT NULL DEFAULT 'informasi'
                      CHECK (peran IN ('informasi','tinjauan','persetujuan','arsip')),
  aktif             boolean NOT NULL DEFAULT true,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT distribusi_unik UNIQUE (company_id, project_id, jenis_dokumen, penerima_nama),
  -- Penerima yang tak bisa dihubungi bukan penerima. Salah satunya WAJIB:
  -- akun sistem, atau alamat surel.
  CONSTRAINT distribusi_bisa_dihubungi CHECK (
    penerima_user_id IS NOT NULL
    OR (penerima_email IS NOT NULL AND penerima_email LIKE '%@%'))
);

-- ── 5. Tanda tangan elektronik ─────────────────────────────────────────────
--
-- Bukan gambar tanda tangan. Yang disimpan: SIDIK JARI isi dokumen saat
-- ditandatangani, sehingga bisa dibuktikan dokumennya tidak berubah sesudahnya.
--
-- Gambar coretan bisa disalin-tempel ke dokumen mana pun; hash tak bisa.
CREATE TABLE IF NOT EXISTS tanda_tangan_elektronik (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Dokumen yang ditandatangani, dirujuk secara longgar supaya bisa dipakai
  -- lintas jenis (notulen, transmittal, method statement, berita acara).
  jenis_objek       text NOT NULL
                      CHECK (jenis_objek IN ('notulen','transmittal','method_statement','berita_acara','kontrak','lainnya')),
  objek_id          uuid NOT NULL,
  penanda_tangan    uuid NOT NULL REFERENCES users(id),
  peran_penanda     text,
  -- SHA-256 isi dokumen pada saat ditandatangani, hex 64 karakter.
  sidik_isi         text NOT NULL,
  ditandatangani_pada timestamptz NOT NULL DEFAULT now(),
  alasan            text,
  ip_penanda        inet,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Satu orang menandatangani satu objek sekali. Tanda tangan ganda
  -- membuat "siapa yang mengesahkan" jadi ambigu.
  CONSTRAINT ttd_unik UNIQUE (jenis_objek, objek_id, penanda_tangan),
  -- Sidik yang bukan SHA-256 hex-64 adalah sidik yang tak bisa diverifikasi
  -- ulang — dan tanda tangan yang tak bisa diverifikasi tak lebih baik
  -- daripada tak ada.
  CONSTRAINT ttd_sidik_sha256 CHECK (sidik_isi ~ '^[0-9a-f]{64}$')
);

-- ── 6. Distribusi laporan terjadwal ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jadwal_distribusi_laporan (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id        uuid REFERENCES projects(id) ON DELETE CASCADE,
  nama              text NOT NULL,
  jenis_laporan     text NOT NULL,
  irama             text NOT NULL DEFAULT 'mingguan'
                      CHECK (irama IN ('harian','mingguan','bulanan')),
  -- 1=Senin … 7=Minggu untuk irama mingguan; 1..28 untuk bulanan.
  hari_ke           integer,
  jam               time NOT NULL DEFAULT '07:00',
  aktif             boolean NOT NULL DEFAULT true,
  terakhir_dikirim  timestamptz,
  -- Kegagalan pengiriman DICATAT, bukan ditelan.
  --
  -- Laporan terjadwal yang diam-diam berhenti terkirim adalah cacat yang
  -- paling lama tak ketahuan: tak ada yang mengeluh soal surel yang tak
  -- datang, sampai ada yang menanyakan angka yang seharusnya sudah dibaca.
  gagal_berturut    integer NOT NULL DEFAULT 0,
  galat_terakhir    text,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT distribusi_laporan_unik UNIQUE (company_id, project_id, nama),
  CONSTRAINT distribusi_gagal_tak_negatif CHECK (gagal_berturut >= 0),
  CONSTRAINT distribusi_hari_wajar CHECK (
    hari_ke IS NULL
    OR (irama = 'mingguan' AND hari_ke BETWEEN 1 AND 7)
    OR (irama = 'bulanan'  AND hari_ke BETWEEN 1 AND 28)
    OR irama = 'harian'),
  -- Jadwal mingguan/bulanan TANPA hari akan berjalan kapan? Ditolak di sini,
  -- bukan ditemukan saat laporan tak pernah terkirim.
  CONSTRAINT distribusi_hari_wajib CHECK (
    irama = 'harian' OR hari_ke IS NOT NULL)
);

-- ── Indeks ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gambar_project     ON register_gambar(project_id, nomor);
CREATE INDEX IF NOT EXISTS idx_gambar_status      ON register_gambar(company_id, status);
CREATE INDEX IF NOT EXISTS idx_transmittal_proj   ON transmittal(project_id);
CREATE INDEX IF NOT EXISTS idx_transmittal_status ON transmittal(company_id, status);
CREATE INDEX IF NOT EXISTS idx_tr_item_parent     ON transmittal_item(transmittal_id);
CREATE INDEX IF NOT EXISTS idx_notulen_project    ON notulen_rapat(project_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_tindakan_notulen   ON notulen_tindakan(notulen_id);
CREATE INDEX IF NOT EXISTS idx_tindakan_status    ON notulen_tindakan(company_id, status, tenggat);
CREATE INDEX IF NOT EXISTS idx_distribusi_jenis   ON matriks_distribusi(company_id, jenis_dokumen);
CREATE INDEX IF NOT EXISTS idx_ttd_objek          ON tanda_tangan_elektronik(jenis_objek, objek_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_lap_aktif   ON jadwal_distribusi_laporan(company_id, aktif);

-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- ADR-004 Rule #2: `has_permission('kunci')`, BUKAN `auth_role() = 'admin'`.
-- Helper DIBUNGKUS `(SELECT ...)` supaya jadi InitPlan — dievaluasi sekali
-- per query, bukan sekali per BARIS. Migrasi 212 luput dan harus ditambal
-- migrasi 214; pola ini ditetapkan migrasi 132.
DO $$
DECLARE
  t text;
  n_policy int := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY['register_gambar','transmittal','transmittal_item',
                           'notulen_rapat','notulen_tindakan','matriks_distribusi',
                           'tanda_tangan_elektronik','jadwal_distribusi_laporan']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    -- `tenant_isolation`, BUKAN `<tabel>_tenant`: 142 tabel lain memakai
    -- nama itu, dan `t5a-policy-tenant.test.ts` mencarinya secara harfiah.
    -- Nama yang bervariasi memaksa penjaganya menebak pola — dan penjaga
    -- yang menebak akan melewatkan tabel yang polanya sedikit berbeda.
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    /*
      ⚠ DIPERBAIKI 2026-08-31 — cacat yang SAMA BENTUKNYA dengan 212.

      Versi sebelumnya menulis DUA `%I` tetapi memberi SATU argumen:

          'CREATE POLICY %I ON %I AS RESTRICTIVE ...', t

      dan Postgres menolaknya dengan `too few arguments for format()`.
      Galat itu tak menyebut baris, tak menyebut nama policy, dan tak
      menyebut tabelnya — hanya nama berkas migrasinya.

      Nama policy di sini memang literal `tenant_isolation` (lihat komentar
      di atas), jadi yang benar bukan menambah argumen melainkan MEMBUANG
      placeholder pertama. Satu `%I` tersisa, satu argumen.

      Cacat ini tak pernah terlihat sebelum hari ini karena 212 selalu gagal
      lebih dulu dan menghentikan rantai — kesalahan yang menyembunyikan
      kesalahan berikutnya.
    */
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE FOR ALL
         USING (company_id = (SELECT auth_company_id()))
         WITH CHECK (company_id = (SELECT auth_company_id()))',
      t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_baca', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING ((SELECT has_permission(''projects:view'')))',
      t || '_baca', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tulis', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL
         USING ((SELECT has_permission(''documents:manage'')))
         WITH CHECK ((SELECT has_permission(''documents:manage'')))',
      t || '_tulis', t);
  END LOOP;

  SELECT count(*) INTO n_policy FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname IN ('register_gambar','transmittal','transmittal_item',
                       'notulen_rapat','notulen_tindakan','matriks_distribusi',
                       'tanda_tangan_elektronik','jadwal_distribusi_laporan');

  IF n_policy <> 24 THEN
    RAISE EXCEPTION 'Policy tak lengkap: % (harusnya 24)', n_policy;
  END IF;

  RAISE NOTICE 'OK: 8 tabel kendali dokumen + % policy.', n_policy;
END $$;

-- ── Verifikasi ────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  n_telanjang int;
BEGIN
  FOREACH t IN ARRAY ARRAY['register_gambar','transmittal','transmittal_item',
                           'notulen_rapat','notulen_tindakan','matriks_distribusi',
                           'tanda_tangan_elektronik','jadwal_distribusi_laporan']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Tabel % tak terbentuk', t;
    END IF;
    IF NOT (SELECT relrowsecurity AND relforcerowsecurity
              FROM pg_class WHERE oid = t::regclass) THEN
      RAISE EXCEPTION 'RLS tak aktif/tak dipaksa di %', t;
    END IF;
  END LOOP;

  -- ADR-004: nol literal peran.
  IF EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname IN ('register_gambar','transmittal','transmittal_item',
                         'notulen_rapat','notulen_tindakan','matriks_distribusi',
                         'tanda_tangan_elektronik','jadwal_distribusi_laporan')
       AND pg_get_expr(p.polqual, p.polrelid) LIKE '%auth_role%'
  ) THEN
    RAISE EXCEPTION 'ADR-004 dilanggar: ada policy memakai auth_role()';
  END IF;

  -- InitPlan: nol helper telanjang. Diperiksa DI SINI supaya tak perlu
  -- migrasi penambal seperti 214.
  SELECT count(*) INTO n_telanjang
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname IN ('register_gambar','transmittal','transmittal_item',
                       'notulen_rapat','notulen_tindakan','matriks_distribusi',
                       'tanda_tangan_elektronik','jadwal_distribusi_laporan')
     AND (
       regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''),
                      '\( SELECT (auth_company_id|has_permission)', '(WRAPPED', 'g')
         ~ '(auth_company_id|has_permission)\('
       OR
       regexp_replace(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
                      '\( SELECT (auth_company_id|has_permission)', '(WRAPPED', 'g')
         ~ '(auth_company_id|has_permission)\('
     );

  IF n_telanjang > 0 THEN
    RAISE EXCEPTION 'Ada % policy memanggil helper per baris (bukan InitPlan)', n_telanjang;
  END IF;

  RAISE NOTICE 'VERIFIKASI 215: 8 tabel, RLS dipaksa, nol literal peran, semua InitPlan.';
END $$;
