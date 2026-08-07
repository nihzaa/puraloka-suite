-- ============================================================================
-- 218 — KEPATUHAN & K3: evaluasi subkon · izin/asuransi/pajak · izin kerja
-- ============================================================================
--
-- TUNDA kelompok E, tiga item sekaligus. Dibangun atas keputusan founder
-- 2026-08-07 meski pemicunya ("subkon formal ber-kontrak" & "proyek dengan
-- syarat K3 formal dari owner") belum menyala.
--
-- ── Kenapa ketiganya satu migrasi
--
-- Ketiganya menjawab pertanyaan yang sama dari sudut berbeda: **"pihak ini
-- boleh bekerja hari ini, atau tidak?"**
--
--   · Evaluasi kinerja    → boleh dipakai LAGI?
--   · Kepatuhan dokumen   → izin/asuransi/pajaknya masih hidup?
--   · Izin kerja (K3)     → pekerjaan berisiko ini boleh dimulai?
--
-- Memisahkannya membuat jawaban yang bertentangan bisa hidup berdampingan:
-- subkon berkinerja bagus dengan asuransi mati tetap terlihat hijau di layar
-- yang hanya membaca kinerjanya.
--
-- ── Yang paling mahal kalau ini tidak ada
--
--   · Pekerja terluka, dan asuransi ternyata sudah kedaluwarsa dua bulan
--     lalu. Biaya pengobatan jadi tanggungan perusahaan, dan itu belum
--     termasuk urusan hukumnya.
--   · Pekerjaan panas di dekat bahan mudah terbakar dimulai tanpa izin
--     kerja. Kalau terjadi kebakaran, yang ditanya pertama: mana izinnya.
--   · Subkon yang sama dipakai berulang kali meski selalu telat, karena
--     tak ada yang mencatat evaluasinya.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

-- ── Permission ──────────────────────────────────────────────────────────────
--
-- ADR-004: permission adalah CAPABILITY, bukan jabatan. Kuncinya kontrak
-- publik — jangan di-rename sesudah dipakai.
INSERT INTO permissions (key, module, label, description, sort_order) VALUES
  ('kepatuhan:view',   'kepatuhan', 'Lihat Kepatuhan',
   'Melihat status izin, asuransi, pajak, dan evaluasi subkontraktor', 10),
  ('kepatuhan:manage', 'kepatuhan', 'Kelola Kepatuhan',
   'Mencatat dokumen kepatuhan dan menilai kinerja subkontraktor', 20),
  ('k3:permit:view',   'k3', 'Lihat Izin Kerja',
   'Melihat izin kerja (work permit) beserta status persetujuannya', 30),
  ('k3:permit:manage', 'k3', 'Ajukan Izin Kerja',
   'Mengajukan izin kerja untuk pekerjaan berisiko tinggi', 40),
  ('k3:permit:decide', 'k3', 'Putuskan Izin Kerja',
   'Menyetujui atau menolak izin kerja — pemutus terpisah dari pengaju', 50)
ON CONFLICT (key) DO NOTHING;

-- Pewarisan permission: diturunkan dari permission yang SETARA MAKNANYA,
-- bukan dipatok ke nama peran (ADR-004 Rule #2, pola migrasi 189).
--
--   kepatuhan:view   ← procurement:view   (yang menilai vendor/subkon)
--   kepatuhan:manage ← procurement:supplier:manage
--   k3:permit:view   ← projects:view      (semua yang melihat proyek)
--   k3:permit:manage ← punch:manage       (yang bekerja di lapangan)
--   k3:permit:decide ← punch:verify       (pola "menyatakan pekerjaan sah")
DO $$
DECLARE
  pasangan text[][] := ARRAY[
    ARRAY['kepatuhan:view',   'procurement:view'],
    ARRAY['kepatuhan:manage', 'procurement:supplier:manage'],
    ARRAY['k3:permit:view',   'projects:view'],
    ARRAY['k3:permit:manage', 'punch:manage'],
    ARRAY['k3:permit:decide', 'punch:verify']
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(pasangan, 1) LOOP
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
     WHERE p.key = pasangan[i][1]
       AND EXISTS (SELECT 1 FROM role_permissions rp
                     JOIN permissions p2 ON p2.id = rp.permission_id
                    WHERE rp.role_id = r.id AND p2.key = pasangan[i][2])
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- ── 1. Dokumen kepatuhan (izin · asuransi · pajak) ─────────────────────────
--
-- Berlaku untuk pihak mana pun yang bekerja di proyek: subkontraktor,
-- supplier, mandor, atau perusahaan sendiri.
CREATE TABLE IF NOT EXISTS dokumen_kepatuhan (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Pemilik dokumen. Salah satu terisi, atau `pihak_nama` untuk pihak luar
  -- yang belum jadi entitas di sistem.
  supplier_id       uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  pihak_nama        text,
  jenis             text NOT NULL
                      CHECK (jenis IN ('nib','siujk','sbu','npwp','pkp','skt',
                                       'bpjs_ketenagakerjaan','bpjs_kesehatan',
                                       'asuransi_car','asuransi_tpl','asuransi_cpm',
                                       'smk3','iso_9001','iso_45001','lainnya')),
  nomor             text,
  penerbit          text,
  berlaku_dari      date,
  -- NULL = tak bermasa berlaku (mis. NPWP). Terisi = ada tanggal matinya.
  berlaku_sampai    date,
  -- Nilai pertanggungan untuk dokumen asuransi. NUMERIC, bukan float (§5.4).
  nilai_pertanggungan numeric,
  file_url          text,
  terverifikasi     boolean NOT NULL DEFAULT false,
  diverifikasi_oleh uuid REFERENCES users(id),
  diverifikasi_pada timestamptz,
  catatan           text,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Dokumen tanpa pemilik tak bisa ditagih ke siapa pun.
  CONSTRAINT kepatuhan_ada_pemilik CHECK (
    supplier_id IS NOT NULL
    OR (pihak_nama IS NOT NULL AND length(trim(pihak_nama)) > 0)),
  -- Masa berlaku mundur: dokumen yang "berlaku sampai" sebelum terbitnya.
  CONSTRAINT kepatuhan_masa_maju CHECK (
    berlaku_dari IS NULL OR berlaku_sampai IS NULL OR berlaku_sampai >= berlaku_dari),
  CONSTRAINT kepatuhan_nilai_tak_negatif CHECK (
    nilai_pertanggungan IS NULL OR nilai_pertanggungan >= 0),
  -- Terverifikasi WAJIB bertanggal & berpemeriksa. "Sudah diperiksa" tanpa
  -- siapa dan kapan adalah klaim yang tak bisa ditelusuri saat dipersoalkan.
  CONSTRAINT kepatuhan_verifikasi_lengkap CHECK (
    terverifikasi = false
    OR (diverifikasi_oleh IS NOT NULL AND diverifikasi_pada IS NOT NULL))
);

-- ── 2. Evaluasi kinerja subkontraktor ──────────────────────────────────────
--
-- Berbeda dari `evaluasi_vendor` (migrasi 210): itu menilai PEMASOK barang
-- (mutu/waktu/harga/layanan). Ini menilai pelaksana PEKERJAAN, dan dimensinya
-- berbeda — K3 dan kepatuhan administratif menentukan di sini, tidak di sana.
CREATE TABLE IF NOT EXISTS evaluasi_subkon (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  supplier_id       uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  pihak_nama        text,
  periode           date NOT NULL,
  -- Lima dimensi, masing-masing 0-100.
  skor_mutu         numeric NOT NULL DEFAULT 0,
  skor_waktu        numeric NOT NULL DEFAULT 0,
  skor_k3           numeric NOT NULL DEFAULT 0,
  skor_kepatuhan    numeric NOT NULL DEFAULT 0,
  skor_kerjasama    numeric NOT NULL DEFAULT 0,
  -- Kejadian yang tak tertangkap skor: kecelakaan kerja & pelanggaran K3.
  --
  -- Dipisah dari `skor_k3` karena rata-rata bisa menyembunyikannya: subkon
  -- dengan skor K3 80 dan satu kecelakaan berat BUKAN subkon yang aman.
  jumlah_kecelakaan integer NOT NULL DEFAULT 0,
  jumlah_pelanggaran_k3 integer NOT NULL DEFAULT 0,
  catatan           text,
  masuk_daftar_hitam boolean NOT NULL DEFAULT false,
  alasan_daftar_hitam text,
  dinilai_oleh      uuid REFERENCES users(id),
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT eval_subkon_ada_pihak CHECK (
    supplier_id IS NOT NULL
    OR (pihak_nama IS NOT NULL AND length(trim(pihak_nama)) > 0)),
  CONSTRAINT eval_subkon_skor_wajar CHECK (
    skor_mutu BETWEEN 0 AND 100 AND skor_waktu BETWEEN 0 AND 100
    AND skor_k3 BETWEEN 0 AND 100 AND skor_kepatuhan BETWEEN 0 AND 100
    AND skor_kerjasama BETWEEN 0 AND 100),
  CONSTRAINT eval_subkon_kejadian_tak_negatif CHECK (
    jumlah_kecelakaan >= 0 AND jumlah_pelanggaran_k3 >= 0),
  -- Menutup pintu rezeki orang WAJIB beralasan — dan alasannya harus bisa
  -- dibaca, bukan satu kata.
  CONSTRAINT eval_subkon_hitam_beralasan CHECK (
    masuk_daftar_hitam = false
    OR (alasan_daftar_hitam IS NOT NULL AND length(trim(alasan_daftar_hitam)) >= 10))
);

-- ── 3. Izin kerja (work permit) ────────────────────────────────────────────
--
-- Pekerjaan berisiko tinggi tak boleh dimulai tanpa izin yang DISETUJUI.
-- Yang membuatnya bukan formalitas: pemutusnya terpisah dari pengaju, dan
-- izin yang sudah kedaluwarsa tak lagi sah meski statusnya 'disetujui'.
CREATE TABLE IF NOT EXISTS izin_kerja (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nomor             text NOT NULL,
  jenis             text NOT NULL
                      CHECK (jenis IN ('pekerjaan_panas','ketinggian','ruang_terbatas',
                                       'galian','listrik','pengangkatan','bahan_kimia',
                                       'radiografi','lainnya')),
  uraian_pekerjaan  text NOT NULL,
  lokasi            text,
  -- Rentang berlakunya izin. Izin kerja BUKAN dokumen abadi: ia berlaku
  -- untuk satu jendela waktu, dan pekerjaan di luar jendela itu tak berizin.
  berlaku_dari      timestamptz NOT NULL,
  berlaku_sampai    timestamptz NOT NULL,
  -- Pengendalian risiko WAJIB diisi sebelum bisa diajukan (dijaga endpoint);
  -- di sini dijaga saat DISETUJUI — izin yang disetujui tanpa pengendalian
  -- risiko adalah tanda tangan atas dokumen kosong.
  pengendalian_risiko text,
  apd_wajib         text,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','diajukan','disetujui','ditolak','ditutup','kedaluwarsa')),
  diajukan_oleh     uuid REFERENCES users(id),
  diajukan_pada     timestamptz,
  diputuskan_oleh   uuid REFERENCES users(id),
  diputuskan_pada   timestamptz,
  alasan_tolak      text,
  ditutup_pada      timestamptz,
  ditutup_oleh      uuid REFERENCES users(id),
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT izin_nomor_unik UNIQUE (company_id, nomor),
  CONSTRAINT izin_uraian_berisi CHECK (length(trim(uraian_pekerjaan)) > 0),
  -- Jendela waktu mundur = izin yang tak pernah berlaku.
  CONSTRAINT izin_jendela_maju CHECK (berlaku_sampai > berlaku_dari),
  CONSTRAINT izin_keputusan_lengkap CHECK (
    status NOT IN ('disetujui','ditolak') OR diputuskan_pada IS NOT NULL),
  CONSTRAINT izin_tolak_beralasan CHECK (
    status <> 'ditolak'
    OR (alasan_tolak IS NOT NULL AND length(trim(alasan_tolak)) >= 10)),
  -- DISETUJUI tanpa pengendalian risiko = tanda tangan atas dokumen kosong.
  -- Ini yang ditanya pertama saat terjadi kecelakaan.
  CONSTRAINT izin_setuju_ada_pengendalian CHECK (
    status <> 'disetujui'
    OR (pengendalian_risiko IS NOT NULL AND length(trim(pengendalian_risiko)) >= 10)),
  -- Pemutus TIDAK BOLEH pengaju. Izin kerja yang disetujui sendiri oleh
  -- yang mengajukan bukan pengendalian apa pun — ini inti pemisahan tugas.
  CONSTRAINT izin_pemutus_bukan_pengaju CHECK (
    diputuskan_oleh IS NULL OR diajukan_oleh IS NULL OR diputuskan_oleh <> diajukan_oleh),
  CONSTRAINT izin_tutup_bertanggal CHECK (
    status <> 'ditutup' OR ditutup_pada IS NOT NULL)
);

-- ── Indeks ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kepatuhan_supplier ON dokumen_kepatuhan(supplier_id);
CREATE INDEX IF NOT EXISTS idx_kepatuhan_masa     ON dokumen_kepatuhan(company_id, berlaku_sampai);
CREATE INDEX IF NOT EXISTS idx_kepatuhan_jenis    ON dokumen_kepatuhan(company_id, jenis);
CREATE INDEX IF NOT EXISTS idx_eval_subkon_pihak  ON evaluasi_subkon(supplier_id, periode);
CREATE INDEX IF NOT EXISTS idx_eval_subkon_comp   ON evaluasi_subkon(company_id, periode);
CREATE INDEX IF NOT EXISTS idx_izin_project       ON izin_kerja(project_id, status);
CREATE INDEX IF NOT EXISTS idx_izin_berlaku       ON izin_kerja(company_id, berlaku_sampai);

-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- ADR-004 Rule #2: `has_permission('kunci')`, BUKAN `auth_role() = 'admin'`.
-- Helper DIBUNGKUS `(SELECT ...)` → InitPlan (pelajaran migrasi 214).
-- Policy tenant BERNAMA `tenant_isolation` (pelajaran migrasi 216).
DO $$
DECLARE
  t text;
  baca text;
  tulis text;
  n_policy int := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY['dokumen_kepatuhan','evaluasi_subkon','izin_kerja']
  LOOP
    IF t = 'izin_kerja' THEN
      baca := 'k3:permit:view';
      tulis := 'k3:permit:manage';
    ELSE
      baca := 'kepatuhan:view';
      tulis := 'kepatuhan:manage';
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE FOR ALL
         USING (company_id = (SELECT auth_company_id()))
         WITH CHECK (company_id = (SELECT auth_company_id()))', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_baca', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING ((SELECT has_permission(%L)))',
      t || '_baca', t, baca);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tulis', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL
         USING ((SELECT has_permission(%L)))
         WITH CHECK ((SELECT has_permission(%L)))',
      t || '_tulis', t, tulis, tulis);
  END LOOP;

  SELECT count(*) INTO n_policy FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname IN ('dokumen_kepatuhan','evaluasi_subkon','izin_kerja');

  IF n_policy <> 9 THEN
    RAISE EXCEPTION 'Policy tak lengkap: % (harusnya 9)', n_policy;
  END IF;

  RAISE NOTICE 'OK: 3 tabel kepatuhan/K3 + % policy.', n_policy;
END $$;

-- ── Verifikasi ────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  n_telanjang int;
  n_perm int;
BEGIN
  FOREACH t IN ARRAY ARRAY['dokumen_kepatuhan','evaluasi_subkon','izin_kerja']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Tabel % tak terbentuk', t;
    END IF;
    IF NOT (SELECT relrowsecurity AND relforcerowsecurity
              FROM pg_class WHERE oid = t::regclass) THEN
      RAISE EXCEPTION 'RLS tak aktif/tak dipaksa di %', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
       WHERE c.relname = t AND p.polname = 'tenant_isolation'
         AND p.polpermissive = false
         AND pg_get_expr(p.polqual, p.polrelid) LIKE '%auth_company_id%'
    ) THEN
      RAISE EXCEPTION 'Tabel % tak punya tenant_isolation RESTRICTIVE', t;
    END IF;
  END LOOP;

  -- ADR-004: nol literal peran.
  IF EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname IN ('dokumen_kepatuhan','evaluasi_subkon','izin_kerja')
       AND pg_get_expr(p.polqual, p.polrelid) LIKE '%auth_role%'
  ) THEN
    RAISE EXCEPTION 'ADR-004 dilanggar: ada policy memakai auth_role()';
  END IF;

  -- InitPlan (pelajaran 214).
  SELECT count(*) INTO n_telanjang
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname IN ('dokumen_kepatuhan','evaluasi_subkon','izin_kerja')
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

  -- Permission benar-benar terpasang ke SETIDAKNYA satu peran. Permission
  -- yang tak dimiliki siapa pun membuat halamannya lahir terkunci — dan
  -- gejalanya layar kosong tanpa pesan galat, bukan "akses ditolak".
  SELECT count(DISTINCT p.key) INTO n_perm
    FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id
   WHERE p.key IN ('kepatuhan:view','kepatuhan:manage',
                   'k3:permit:view','k3:permit:manage','k3:permit:decide');
  IF n_perm <> 5 THEN
    RAISE EXCEPTION 'Hanya % dari 5 permission baru terpasang ke peran', n_perm;
  END IF;

  RAISE NOTICE 'VERIFIKASI 218: 3 tabel, RLS dipaksa, nol literal peran, InitPlan, 5 permission terpasang.';
END $$;
