-- ════════════════════════════════════════════════════════════════════════════
-- 301 — Markup & Margin sebagai DATA, bukan angka yang mengambang (G6)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Cacat yang ditemukan dengan mengukur, bukan dari daftar pekerjaan
--
-- `buk_fraction` — Biaya Umum & Keuntungan, angka yang menentukan SELURUH
-- keuntungan perusahaan dari sebuah penawaran — **tidak tersimpan di mana
-- pun.** Diukur 2026-08-12: nol kolom bernama `buk*` di seluruh skema, nol
-- kunci markup/margin di `company_settings`, nol kolom margin di
-- `estimate_versions` (2.221 baris).
--
-- Ia dikirim ulang pada setiap permintaan perhitungan. Akibatnya berlapis:
--
--   1. Dua orang mengestimasi proyek yang sama dengan margin berbeda, dan
--      tak ada satu pun tempat yang bisa ditanya "berapa margin kita?".
--   2. Estimasi yang sudah disetujui tak bisa dihitung ulang dengan angka
--      yang SAMA — angkanya tak ikut tersimpan bersama hasilnya.
--   3. Saat direksi bertanya "kenapa penawaran ini tipis?", jawabannya harus
--      ditebak dari ingatan orang yang mengetik.
--
-- ── Dan yang lebih buruk: API menolak default, UI diam-diam mengisinya
--
-- `routes/v1/ahsp.ts:411` tegas:
--
--     'buk_fraction wajib angka 0..1 (mis. 0.1) — tidak ada default'
--
-- Penolakan yang tepat. Tapi `estimasi/page.tsx:789` menulis:
--
--     const [bukPct, setBukPct] = useState("10")
--
-- Sepuluh persen menjadi angka bawaan **tanpa seorang pun memutuskannya**.
-- Penjaga di lapisan API dibatalkan oleh satu nilai awal di lapisan UI, dan
-- karena hasilnya terlihat wajar, tak ada yang pernah mempertanyakannya.
--
-- Ini pola yang sama persis dengan tarif payroll (G2a) dan peta akun jurnal
-- (R-012, migrasi 297): **angka bawaan yang menghasilkan keluaran meyakinkan
-- adalah bentuk paling berbahaya dari menebak**, karena ia tak pernah
-- memicu pertanyaan.
--
-- ── Bentuknya: periode berlaku, bukan satu kolom
--
-- Margin perusahaan berubah — mengikuti persaingan, jenis pekerjaan, dan
-- keputusan direksi. Menyimpannya sebagai SATU kolom di `companies` berarti
-- estimasi tahun lalu tak bisa lagi dihitung ulang dengan angka yang berlaku
-- saat itu.
--
-- Karena itu polanya sama dengan `tarif_payroll_periode` (284): ditambah,
-- bukan ditimpa. Yang berlaku pada suatu tanggal adalah baris dengan
-- `berlaku_sejak` terbesar yang <= tanggal itu.
--
-- ── Kenapa dipisah per JENIS PEKERJAAN
--
-- Margin bangunan gedung tidak sama dengan margin pekerjaan jalan atau
-- renovasi kecil. Satu angka untuk semuanya memaksa estimator memilih antara
-- menawar terlalu tinggi di segmen ketat atau membuang laba di segmen longgar
-- — dan yang terjadi di lapangan: ia mengetik angkanya sendiri, kembali ke
-- keadaan sebelum migrasi ini.
--
-- `jenis_pekerjaan = NULL` berarti "berlaku umum" — yang dipakai bila tak ada
-- baris yang lebih spesifik.
--
-- ── NOL BARIS TER-SEED — dan migrasi ini GAGAL kalau ada
--
-- Sama dengan 284 dan 297. Menanam "10%" di sini hanya memindahkan tebakan
-- dari kode ke basis, dan membuatnya terlihat resmi.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Periode markup
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS markup_periode (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- NULL = berlaku umum. Terisi = hanya untuk jenis pekerjaan itu.
  jenis_pekerjaan   TEXT,

  berlaku_sejak     DATE NOT NULL,

  -- ── Dipecah, tidak digabung jadi satu angka
  --
  -- BUK adalah "Biaya Umum & Keuntungan" — dua hal berbeda yang secara
  -- tradisional ditulis sebagai satu persentase. Menggabungkannya membuat
  -- pertanyaan "berapa laba kita sebenarnya?" tak terjawab: 10% BUK bisa
  -- berarti 10% laba dengan overhead nol, atau 2% laba dengan overhead 8%.
  --
  -- Keduanya numeric (§5.4), disimpan sebagai FRAKSI (0.08 = 8%) supaya
  -- sama dengan yang diterima `computeAhsp`. Menyimpan persen lalu membagi
  -- 100 di beberapa tempat adalah cara paling mudah kehilangan faktor 100.
  overhead_fraksi   NUMERIC(6,4) NOT NULL,
  keuntungan_fraksi NUMERIC(6,4) NOT NULL,

  -- Total yang dipakai perhitungan. GENERATED — bukan kolom yang diisi
  -- aplikasi, supaya tak pernah ada baris yang totalnya tak sama dengan
  -- jumlah komponennya.
  buk_fraksi        NUMERIC(7,4) GENERATED ALWAYS AS
                      (overhead_fraksi + keuntungan_fraksi) STORED,

  -- Risiko & kontinjensi: DIPISAH dari keuntungan dengan sengaja.
  -- Menyembunyikan cadangan risiko di dalam margin membuat penawaran terlihat
  -- untung besar padahal sebagiannya dialokasikan untuk hal yang belum tentu
  -- terjadi — dan saat risikonya menyala, labanya menguap tanpa penjelasan.
  kontinjensi_fraksi NUMERIC(6,4) NOT NULL DEFAULT 0,

  -- Kenapa angkanya segini. Tidak WAJIB seperti `dasar_hukum` di 284 —
  -- margin adalah keputusan bisnis, bukan aturan yang bisa dirujuk. Tapi
  -- kolomnya ada supaya alasannya BISA ditulis dan ditemukan kembali.
  alasan            TEXT,
  catatan           TEXT,

  ditetapkan_oleh   UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Fraksi, bukan persen. Batas atas 1 (=100%) bukan kesopanan: markup di
  -- atas 100% hampir selalu berarti orang mengetik "15" alih-alih "0.15",
  -- dan angka itu menghasilkan penawaran 15× lipat yang terlihat sah.
  CONSTRAINT chk_markup_overhead_wajar
    CHECK (overhead_fraksi >= 0 AND overhead_fraksi <= 1),
  CONSTRAINT chk_markup_untung_wajar
    CHECK (keuntungan_fraksi >= 0 AND keuntungan_fraksi <= 1),
  CONSTRAINT chk_markup_kontinjensi_wajar
    CHECK (kontinjensi_fraksi >= 0 AND kontinjensi_fraksi <= 1)
);

-- Satu baris per (company, jenis, tanggal). `jenis_pekerjaan` NULL tak
-- ditangkap UNIQUE biasa — NULL tidak sama dengan NULL di Postgres — jadi
-- dipakai DUA indeks: satu untuk yang terisi, satu untuk yang NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_markup_jenis_terisi
  ON markup_periode (company_id, jenis_pekerjaan, berlaku_sejak)
  WHERE jenis_pekerjaan IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_markup_jenis_umum
  ON markup_periode (company_id, berlaku_sejak)
  WHERE jenis_pekerjaan IS NULL;

CREATE INDEX IF NOT EXISTS idx_markup_cari
  ON markup_periode (company_id, berlaku_sejak DESC);

ALTER TABLE markup_periode ENABLE ROW LEVEL SECURITY;
ALTER TABLE markup_periode FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. Markup yang DIPAKAI sebuah versi estimasi — tersimpan bersama hasilnya
--
-- Tanpa ini, perbaikan di atas hanya setengah: angkanya punya rumah, tetapi
-- estimasi yang sudah dibuat tetap tak bisa dijelaskan. Estimasi yang
-- disetujui adalah PERNYATAAN tentang harga yang ditawarkan; menghitungnya
-- ulang dengan markup hari ini membuat angka di layar berbeda dari angka di
-- surat penawaran yang sudah dikirim.
--
-- Pelajaran yang sama sudah dibayar di G2c (slip gaji menyimpan hasilnya,
-- tak menghitung ulang dengan tarif baru).
-- ------------------------------------------------------------
ALTER TABLE estimate_versions
  ADD COLUMN IF NOT EXISTS markup_periode_id UUID REFERENCES markup_periode(id),
  ADD COLUMN IF NOT EXISTS overhead_fraksi   NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS keuntungan_fraksi NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS kontinjensi_fraksi NUMERIC(6,4);

COMMENT ON COLUMN estimate_versions.markup_periode_id IS
  'Periode markup yang DIPAKAI saat versi ini dihitung. Disimpan supaya '
  'angkanya bisa DITUNJUK saat dipertanyakan, bukan ditebak dari ingatan.';

COMMENT ON COLUMN estimate_versions.overhead_fraksi IS
  'Salinan nilai saat perhitungan — bukan turunan dari markup_periode_id. '
  'Periode boleh disunting; estimasi yang sudah jadi tidak boleh ikut berubah.';

-- ------------------------------------------------------------
-- 3. Izin
-- ------------------------------------------------------------
-- Prefiks `cecep:` — DIUKUR, bukan ditebak. Versi pertama migrasi ini memakai
-- `estimasi:markup:*` dan `category`; keduanya salah: kolomnya `module`/`label`,
-- dan seluruh izin estimasi di basis ini berawalan `cecep:estimate:*`.
-- Izin dengan prefiks karangan akan lolos INSERT lalu tak pernah cocok dengan
-- apa pun — gerbang yang selalu tertutup untuk semua orang.
INSERT INTO permissions (key, module, label, description)
VALUES
  ('cecep:markup:view',   'cecep', 'Lihat markup & margin',
   'Melihat markup, overhead, dan keuntungan yang berlaku'),
  ('cecep:markup:manage', 'cecep', 'Tetapkan markup & margin',
   'Menetapkan overhead, keuntungan, dan kontinjensi perusahaan')
ON CONFLICT (key) DO NOTHING;

-- Menetapkan margin = menetapkan laba perusahaan. Yang wajar memilikinya:
-- peran yang sudah boleh MENYETUJUI estimasi.
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM role_permissions rp
  JOIN permissions px ON px.id = rp.permission_id
  CROSS JOIN permissions p
 WHERE px.key = 'cecep:estimate:approve'
   AND p.key IN ('cecep:markup:view', 'cecep:markup:manage')
ON CONFLICT DO NOTHING;

-- Yang boleh MELIHAT: siapa pun yang boleh melihat estimasi. Estimator yang
-- tak tahu marginnya sedang menawar dengan mata tertutup.
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM role_permissions rp
  JOIN permissions px ON px.id = rp.permission_id
  CROSS JOIN permissions p
 WHERE px.key = 'cecep:estimate:view'
   AND p.key = 'cecep:markup:view'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
  v_co UUID;
  v_id UUID;
  v_buk NUMERIC;
  v_lolos BOOLEAN := FALSE;
BEGIN
  -- 1. NOL baris ter-seed. Menanam angka bawaan hanya memindahkan tebakan
  --    dari kode ke basis, dan membuatnya terlihat resmi.
  SELECT count(*) INTO n FROM markup_periode;
  IF n > 0 THEN
    RAISE EXCEPTION '301 gagal: % baris markup ter-seed. Margin HARUS ditetapkan '
      'perusahaan, bukan ditebak migrasi.', n;
  END IF;

  -- 2. `buk_fraksi` benar-benar dihitung, bukan kolom biasa.
  SELECT company_id INTO v_co FROM projects WHERE company_id IS NOT NULL LIMIT 1;
  IF v_co IS NOT NULL THEN
    INSERT INTO markup_periode
      (company_id, berlaku_sejak, overhead_fraksi, keuntungan_fraksi, catatan)
    VALUES (v_co, '1999-01-01', 0.0300, 0.0700, '[301-VERIFIKASI]')
    RETURNING id, buk_fraksi INTO v_id, v_buk;

    IF v_buk <> 0.1000 THEN
      RAISE EXCEPTION '301 gagal: buk_fraksi = % (harusnya 0.1000 = 0.03 + 0.07)', v_buk;
    END IF;

    -- 3. Angka di atas 1 DITOLAK — "15" alih-alih "0.15" menghasilkan
    --    penawaran 15x lipat yang terlihat sah.
    BEGIN
      INSERT INTO markup_periode
        (company_id, berlaku_sejak, overhead_fraksi, keuntungan_fraksi, catatan)
      VALUES (v_co, '1999-01-02', 0, 15, '[301-VERIFIKASI-NGAWUR]');
      v_lolos := TRUE;
    EXCEPTION WHEN check_violation THEN
      NULL;   -- ditolak: benar
    END;
    IF v_lolos THEN
      DELETE FROM markup_periode WHERE catatan LIKE '[301-VERIFIKASI%';
      RAISE EXCEPTION '301 gagal: keuntungan 15 (=1500%%) LOLOS — constraint tak menjaga apa pun';
    END IF;

    -- 4. Dua baris "berlaku umum" pada tanggal sama DITOLAK — kalau lolos,
    --    "markup mana yang berlaku" jadi pertanyaan tanpa jawaban tunggal.
    v_lolos := FALSE;
    BEGIN
      INSERT INTO markup_periode
        (company_id, berlaku_sejak, overhead_fraksi, keuntungan_fraksi, catatan)
      VALUES (v_co, '1999-01-01', 0.05, 0.05, '[301-VERIFIKASI-GANDA]');
      v_lolos := TRUE;
    EXCEPTION WHEN unique_violation THEN
      NULL;   -- ditolak: benar
    END;
    IF v_lolos THEN
      DELETE FROM markup_periode WHERE catatan LIKE '[301-VERIFIKASI%';
      RAISE EXCEPTION '301 gagal: dua markup umum pada tanggal sama LOLOS';
    END IF;

    DELETE FROM markup_periode WHERE catatan LIKE '[301-VERIFIKASI%';
  END IF;

  -- 5. Kolom salinan di estimate_versions ada.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'estimate_versions'
     AND column_name IN ('markup_periode_id','overhead_fraksi','keuntungan_fraksi','kontinjensi_fraksi');
  IF n <> 4 THEN
    RAISE EXCEPTION '301 gagal: hanya % dari 4 kolom markup ada di estimate_versions', n;
  END IF;

  -- 6. Izinnya SAMPAI ke peran. Izin yang terdaftar tetapi tak dimiliki
  --    siapa pun adalah gerbang yang selalu tertutup — halaman jadi, dan
  --    tak ada satu orang pun yang bisa membukanya. Cacat ini persis yang
  --    memakan G2b (halaman lengkap yang tak bisa dibuka siapa pun).
  SELECT count(DISTINCT rp.role_id) INTO n
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'cecep:markup:manage';
  IF n = 0 THEN
    RAISE EXCEPTION '301 gagal: cecep:markup:manage tak dimiliki SATU peran pun — '
      'halaman markup akan 403 untuk semua orang';
  END IF;

  SELECT count(DISTINCT rp.role_id) INTO n
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'cecep:markup:view';
  IF n = 0 THEN
    RAISE EXCEPTION '301 gagal: cecep:markup:view tak dimiliki SATU peran pun';
  END IF;

  -- 7. Basis kembali kosong sesudah verifikasi.
  SELECT count(*) INTO n FROM markup_periode;
  IF n > 0 THEN
    RAISE EXCEPTION '301 gagal: % baris verifikasi tertinggal', n;
  END IF;

  RAISE NOTICE '301 OK — markup config-first, nol ter-seed, buk_fraksi terhitung, 1500%% ditolak';
END $$;
