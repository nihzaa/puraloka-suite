-- ============================================================================
-- 212 — JADWAL: CPM, KALENDER KERJA, SUMBER DAYA, METHOD STATEMENT
-- ============================================================================
--
-- TUNDA kelompok C, empat item sekaligus. Dibangun atas keputusan founder
-- 2026-08-07 meski pemicunya ("proyek dengan jadwal yang benar-benar
-- dinegosiasikan owner") belum menyala.
--
-- ── Kenapa keempatnya satu migrasi
--
-- Karena tanpa salah satunya, tiga sisanya bohong:
--
--   · CPM tanpa KALENDER menghitung jalur kritis lewat hari Minggu dan
--     Lebaran. Durasi 30 hari kalender bukan 30 hari kerja, dan selisihnya
--     persis yang jadi sengketa denda keterlambatan.
--   · CPM tanpa DEPENDENSI cuma daftar tanggal — dan itu yang ada hari ini:
--     39 milestone tanpa satu pun relasi antar-mereka.
--   · SUMBER DAYA tanpa CPM tak tahu kapan puncaknya terjadi.
--   · METHOD STATEMENT tanpa apa pun di atas cuma lampiran.
--
-- ── Yang TIDAK dilakukan migrasi ini
--
-- Tidak menghitung jalur kritis di dalam SQL. Perhitungannya di
-- `apps/api/src/lib/cpm.ts` — pure, bisa diuji, dan jawabannya berubah tiap
-- kali sebuah tanggal digeser. Menyimpannya sebagai kolom membuat "kritis"
-- basi diam-diam: pekerjaan berhenti jadi kritis pada Selasa, layarnya masih
-- merah sampai ada yang menjalankan ulang.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

-- ── 1. Dependensi antar-milestone (bahan CPM) ───────────────────────────────
--
-- Empat jenis relasi standar penjadwalan. Yang paling dipakai FS
-- (selesai-lalu-mulai), tapi SS dan FF menentukan pada pekerjaan paralel:
-- pengecoran lantai 2 tak menunggu lantai 1 SELESAI, ia menunggu lantai 1
-- MULAI plus jeda curing.
CREATE TABLE IF NOT EXISTS milestone_dependencies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Yang menunggu.
  milestone_id      uuid NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  -- Yang ditunggu.
  bergantung_pada   uuid NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  jenis             text NOT NULL DEFAULT 'FS'
                      CHECK (jenis IN ('FS','SS','FF','SF')),
  -- Jeda WAJIB sesudah relasi terpenuhi: curing beton 28 hari, pengeringan
  -- cat, masa tunggu persetujuan. Boleh negatif (tumpang tindih terencana).
  jeda_hari         integer NOT NULL DEFAULT 0,
  catatan           text,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Pekerjaan tak boleh menunggu dirinya sendiri. Ini menutup lingkaran
  -- panjang-1; lingkaran yang lebih panjang dideteksi di lapisan aplikasi
  -- (SQL tak bisa menolaknya tanpa trigger rekursif yang mahal).
  CONSTRAINT dep_bukan_diri_sendiri CHECK (milestone_id <> bergantung_pada),
  CONSTRAINT dep_unik UNIQUE (milestone_id, bergantung_pada)
);

-- ── 2. Kalender kerja: hari libur & hari kerja ─────────────────────────────
--
-- Kenapa per-company, bukan tabel nasional bersama: libur perusahaan
-- (cuti bersama internal, libur pabrik) berbeda antar-tenant, dan proyek di
-- Bali punya Nyepi yang tak berlaku di tempat lain.
CREATE TABLE IF NOT EXISTS hari_libur (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- NULL = berlaku seluruh perusahaan. Terisi = khusus satu proyek.
  project_id        uuid REFERENCES projects(id) ON DELETE CASCADE,
  tanggal           date NOT NULL,
  nama              text NOT NULL,
  jenis             text NOT NULL DEFAULT 'nasional'
                      CHECK (jenis IN ('nasional','cuti_bersama','perusahaan','proyek')),
  -- Hari libur yang JUSTRU dikerjakan (lembur terencana). Disimpan sebagai
  -- baris libur ber-flag, bukan dihapus: jejaknya tetap ada bahwa hari itu
  -- semestinya libur, dan itu yang menentukan tarif upahnya.
  tetap_bekerja     boolean NOT NULL DEFAULT false,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT libur_unik UNIQUE (company_id, project_id, tanggal)
);

-- Pola hari kerja mingguan. Satu baris per company/proyek.
CREATE TABLE IF NOT EXISTS pola_kerja (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id        uuid REFERENCES projects(id) ON DELETE CASCADE,
  -- Senin..Minggu. Default: Senin-Jumat penuh, Sabtu setengah, Minggu libur —
  -- pola paling umum di proyek konstruksi Indonesia.
  senin             boolean NOT NULL DEFAULT true,
  selasa            boolean NOT NULL DEFAULT true,
  rabu              boolean NOT NULL DEFAULT true,
  kamis             boolean NOT NULL DEFAULT true,
  jumat             boolean NOT NULL DEFAULT true,
  sabtu             boolean NOT NULL DEFAULT true,
  minggu            boolean NOT NULL DEFAULT false,
  jam_per_hari      numeric NOT NULL DEFAULT 8,
  catatan           text,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pola_kerja_unik UNIQUE (company_id, project_id),
  CONSTRAINT pola_jam_wajar CHECK (jam_per_hari > 0 AND jam_per_hari <= 24),
  -- Pola tanpa satu pun hari kerja membuat SETIAP durasi jadi tak terhingga.
  -- Ditolak di sini, bukan ditemukan saat jadwal tak pernah selesai dihitung.
  CONSTRAINT pola_ada_hari_kerja CHECK (senin OR selasa OR rabu OR kamis OR jumat OR sabtu OR minggu)
);

-- ── 3. Kebutuhan sumber daya per milestone (bahan histogram & leveling) ────
CREATE TABLE IF NOT EXISTS kebutuhan_sumber_daya (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  milestone_id      uuid NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  jenis             text NOT NULL
                      CHECK (jenis IN ('tenaga','alat','material')),
  nama              text NOT NULL,
  -- Berapa BANYAK yang dibutuhkan SERENTAK selama pekerjaan ini berjalan.
  -- Bukan total: 10 tukang selama 5 hari = kuantitas 10, bukan 50.
  kuantitas         numeric NOT NULL,
  satuan            text,
  -- Batas yang benar-benar tersedia. Dipakai leveling untuk menandai
  -- periode yang kelebihan beban.
  tersedia          numeric,
  catatan           text,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sumber_daya_kuantitas_positif CHECK (kuantitas > 0),
  CONSTRAINT sumber_daya_tersedia_wajar CHECK (tersedia IS NULL OR tersedia >= 0),
  CONSTRAINT sumber_daya_unik UNIQUE (milestone_id, jenis, nama)
);

-- ── 4. Method statement — cara pekerjaan dikerjakan ────────────────────────
--
-- Dokumen yang disetujui SEBELUM pekerjaan berisiko dimulai: urutan kerja,
-- alat, tenaga, dan pengendalian risikonya. Yang membuatnya bukan lampiran:
-- statusnya mengikat, dan pekerjaan yang method statement-nya belum disetujui
-- tak boleh dimulai.
CREATE TABLE IF NOT EXISTS method_statement (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id      uuid REFERENCES milestones(id) ON DELETE SET NULL,
  nomor             text NOT NULL,
  judul             text NOT NULL,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','diajukan','disetujui','ditolak','revisi')),
  urutan_kerja      text,
  alat_dipakai      text,
  tenaga_dibutuhkan text,
  -- Pengendalian risiko K3. Method statement tanpa ini adalah jadwal kerja
  -- yang menyamar — dan justru bagian inilah yang ditanya saat ada kecelakaan.
  pengendalian_risiko text,
  diajukan_oleh     uuid REFERENCES users(id),
  diajukan_pada     timestamptz,
  diputuskan_oleh   uuid REFERENCES users(id),
  diputuskan_pada   timestamptz,
  -- Penolakan WAJIB beralasan: pelaksana yang ditolak tanpa penjelasan akan
  -- mengajukan ulang dokumen yang sama, dan siklusnya tak pernah putus.
  alasan_tolak      text,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ms_nomor_unik UNIQUE (company_id, nomor),
  CONSTRAINT ms_tolak_beralasan CHECK (
    status <> 'ditolak' OR (alasan_tolak IS NOT NULL AND length(trim(alasan_tolak)) >= 10)),
  CONSTRAINT ms_keputusan_lengkap CHECK (
    status NOT IN ('disetujui','ditolak') OR diputuskan_pada IS NOT NULL)
);

-- ── Indeks ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dep_milestone   ON milestone_dependencies(milestone_id);
CREATE INDEX IF NOT EXISTS idx_dep_bergantung  ON milestone_dependencies(bergantung_pada);
CREATE INDEX IF NOT EXISTS idx_dep_company     ON milestone_dependencies(company_id);
CREATE INDEX IF NOT EXISTS idx_libur_company   ON hari_libur(company_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_libur_project   ON hari_libur(project_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_pola_company    ON pola_kerja(company_id);
CREATE INDEX IF NOT EXISTS idx_sumber_milestone ON kebutuhan_sumber_daya(milestone_id);
CREATE INDEX IF NOT EXISTS idx_sumber_company  ON kebutuhan_sumber_daya(company_id);
CREATE INDEX IF NOT EXISTS idx_ms_project      ON method_statement(project_id);
CREATE INDEX IF NOT EXISTS idx_ms_milestone    ON method_statement(milestone_id);
CREATE INDEX IF NOT EXISTS idx_ms_status       ON method_statement(company_id, status);

-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- ADR-004 Rule #2: `has_permission('kunci')`, BUKAN `auth_role() = 'admin'`.
-- Migrasi 202 harus menghapus 18 policy berliteral-peran buatan saya sendiri;
-- akibatnya peran `direktur` yang punya SELURUH permission tetap terblokir,
-- dan layarnya kosong tanpa satu pun pesan galat.
DO $$
DECLARE
  t text;
  n_policy int := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY['milestone_dependencies','hari_libur','pola_kerja',
                           'kebutuhan_sumber_daya','method_statement']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    -- `tenant_isolation`, BUKAN `<tabel>_tenant`: 142 tabel lain memakai
    -- nama itu, dan `t5a-policy-tenant.test.ts` mencarinya secara harfiah.
    -- Nama yang bervariasi memaksa penjaganya menebak pola — dan penjaga
    -- yang menebak akan melewatkan tabel yang polanya sedikit berbeda.
    /*
      DUA nama di-DROP, bukan satu.

      Kalau basisnya sudah pernah melewati migrasi 216 — yang me-rename
      `<tabel>_tenant` jadi `tenant_isolation` — maka nama lama tak ada untuk
      di-DROP, dan `CREATE` di bawah MENAMBAH policy kedua alih-alih
      menggantikan. Hasilnya 20 policy, dan verifikasi menuntut 15.

      Diukur 2026-08-31 saat memutar ulang rantai ini di atas basis yang sudah
      sampai 216. Migrasi idempoten harus tahan terhadap keadaan mana pun,
      bukan hanya terhadap basis kosong.
    */
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    /*
      ⚠ DIPERBAIKI DI TEMPAT 2026-08-31 — dua `%I`, satu argumen.

      Baris ini semula memberi `t` saja untuk DUA penampung, dan Postgres
      menolak dengan `too few arguments for format()`. Seluruh migrasi ini
      dibungkus transaksi oleh `ci-project-setup.mjs`, jadi kegagalannya
      me-ROLLBACK SEMUANYA — termasuk kelima tabel yang dibuat di atas.

      Akibatnya berantai: migrasi 213 lalu gagal dengan `relation "hari_libur"
      does not exist`, dan seluruh penyiapan basis CI berhenti. Keenam shard
      "API — test" merah karenanya.

      Tak pernah terlihat di basis pengembangan: kelima tabelnya sudah
      berpolicy lengkap dari migrasi lain, jadi keadaan akhirnya benar dan tak
      ada gejala. Hanya lingkungan BERSIH yang membongkarnya — dan itulah yang
      dipakai saat membangun server baru.

      ── Kenapa DIEDIT, bukan ditambal migrasi baru

      Mengikuti preseden 016 yang dicatat di `181_f2_5_storage_tenant_scoped.sql`:
      "Menambal hanya di 181 akan meninggalkan lubang yang terbuka kembali di
      setiap lingkungan baru."

      Di sini lebih tegas lagi: migrasi penambal TAK BISA menolong, karena yang
      hilang bukan policy-nya melainkan TABELNYA — transaksinya membuang
      semua. Migrasi 526 yang saya tulis lebih dulu ternyata memperbaiki gejala
      yang salah, dan itu baru ketahuan sesudah CI melaporkan kegagalan
      BERIKUTNYA di 213.

      ⚠ NAMANYA `<tabel>_tenant`, BUKAN `tenant_isolation` — dan itu DISENGAJA.

      Percobaan pertama saya memakai `tenant_isolation` karena komentar di
      atas menyebutnya sebagai nama yang benar. Akibatnya migrasi 214 gagal:

          Policy tak lengkap sesudah dipasang ulang: 20 (harusnya 15)

      214 memasang ulang policy-nya dengan nama `<tabel>_tenant`, dan
      `tenant_isolation` yang saya buat tetap tinggal — lima policy ekstra.

      Urutan sesungguhnya di repo ini:

          212  memasang `<tabel>_tenant`
          214  memasang ulang, tetap `<tabel>_tenant` (bungkus InitPlan)
          216  RENAME semuanya ke `tenant_isolation`

      Jadi nama akhirnya memang `tenant_isolation`, tetapi 216 yang berhak
      memberinya. Migrasi yang memakai nama akhir terlalu dini merusak yang
      di antaranya — dan komentar di atas menjelaskan TUJUAN, bukan keadaan
      pada baris ini.
    */
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR ALL
         USING (company_id = auth_company_id())
         WITH CHECK (company_id = auth_company_id())',
      t || '_tenant', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_baca', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (has_permission(''projects:view''))',
      t || '_baca', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tulis', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL
         USING (has_permission(''milestones:manage''))
         WITH CHECK (has_permission(''milestones:manage''))',
      t || '_tulis', t);
  END LOOP;

  SELECT count(*) INTO n_policy FROM pg_policy
   WHERE polrelid IN ('milestone_dependencies'::regclass, 'hari_libur'::regclass,
                      'pola_kerja'::regclass, 'kebutuhan_sumber_daya'::regclass,
                      'method_statement'::regclass);

  IF n_policy <> 15 THEN
    RAISE EXCEPTION 'Policy tak lengkap: % (harusnya 15)', n_policy;
  END IF;

  RAISE NOTICE 'OK: 5 tabel jadwal + % policy.', n_policy;
END $$;

-- ── Verifikasi ────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['milestone_dependencies','hari_libur','pola_kerja',
                           'kebutuhan_sumber_daya','method_statement']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Tabel % tak terbentuk', t;
    END IF;
    IF NOT (SELECT relrowsecurity AND relforcerowsecurity
              FROM pg_class WHERE oid = t::regclass) THEN
      RAISE EXCEPTION 'RLS tak aktif/tak dipaksa di %', t;
    END IF;
  END LOOP;

  -- Literal peran di RLS: nol. Diperiksa di sini supaya tak perlu diingat.
  IF EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid IN ('milestone_dependencies'::regclass, 'hari_libur'::regclass,
                        'pola_kerja'::regclass, 'kebutuhan_sumber_daya'::regclass,
                        'method_statement'::regclass)
       AND pg_get_expr(polqual, polrelid) LIKE '%auth_role%'
  ) THEN
    RAISE EXCEPTION 'ADR-004 dilanggar: ada policy memakai auth_role()';
  END IF;

  RAISE NOTICE 'VERIFIKASI 212: 5 tabel, RLS dipaksa, nol literal peran.';
END $$;
