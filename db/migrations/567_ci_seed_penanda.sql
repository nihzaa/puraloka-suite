-- 567 — Penanda selesai-seed untuk CI, supaya enam shard tak saling menimpa.
--
-- ── Kenapa tabel ini ada
--
-- Job `api` di `ci.yml` adalah matriks 6 shard TANPA `needs`, jadi keenamnya
-- start bersamaan dan MASING-MASING menjalankan `ci-project-setup.mjs`.
-- Diukur di run 33972614249 — seed `resource` selesai di tiga shard berbeda
-- dengan selang 48 detik:
--
--     shard 1  14:45:22      shard 5  14:45:43      shard 3  14:46:10
--
-- Idempotensi seed TIDAK menolong. Yang jadi soal bukan baris yang ditulis
-- dua kali, melainkan seed shard N yang berjalan SEMENTARA shard M sedang
-- menguji basis yang sama. Dan `rls-harness.ts` menguji di `public`, bukan
-- di `TEST_SCHEMA` — env itu hanya melindungi suite `test-db.ts`.
--
-- Gejalanya khas dan mudah salah baca: daftar berkas merah BERGANTI tiap run
-- dengan total tetap. Ronde 4 vs 5 pada kode yang SAMA — 6 sembuh, 6 baru
-- muncul, 38 tetap. Yang bergantian itu bukan cacat, itu tanda balapan.
-- Pembanding lain: 13 berkas merah di dev vs 44 di CI, kode identik.
--
-- ── Kenapa BUKAN di buku migrasi
--
-- Percobaan pertama menulis penanda ke `supabase_migrations.schema_migrations`
-- dengan `version = 'ci-seed-selesai:<run>'`. Itu DIBATALKAN: menulis ke buku
-- migrasi adalah Gerbang Keras G-2 (CHARTER, CLAUDE.md §5.5), dan entri yang
-- bukan migrasi membuat rantai bisa dilewati senyap selamanya. Buku itu
-- menentukan apa yang di-replay; ia bukan papan pengumuman.
--
-- Tabel sendiri tak punya risiko itu.
--
-- ⚠ `selesai_pada` NULLABLE dan TANPA default — dan itu inti mekanismenya.
--
-- Versi pertama menulisnya `NOT NULL DEFAULT now()`. Simulasi enam shard
-- menangkapnya sebelum masuk CI: baris klaim langsung lahir dengan
-- `selesai_pada` terisi, jadi penunggu berangkat SEKETIKA — balapan yang
-- sama, cuma jendelanya lebih sempit dan jauh lebih sulit dilihat.
--
-- Dua stempel memang dibutuhkan: `mulai_pada` menjawab "ada yang mengerjakan",
-- `selesai_pada` menjawab "basisnya sudah siap". Yang ditunggu shard lain
-- selalu yang kedua.
CREATE TABLE IF NOT EXISTS ci_seed_penanda (
  run_id       text PRIMARY KEY,
  shard        text        NOT NULL,
  mulai_pada   timestamptz NOT NULL DEFAULT now(),
  selesai_pada timestamptz            -- NULL = seed masih berjalan
);

COMMENT ON TABLE ci_seed_penanda IS
  'Penanda "seed CI sudah selesai" per run GitHub Actions. Shard 1 menulis, '
  'shard 2-6 menunggu. Bukan data aplikasi — aman dikosongkan kapan saja.';

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_tabel int; n_kolom int; n_pk int; n_null int;
BEGIN
  SELECT count(*) INTO n_tabel FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'ci_seed_penanda';
  IF n_tabel <> 1 THEN
    RAISE EXCEPTION '567 gagal: tabel ci_seed_penanda tak terbentuk';
  END IF;

  /*
    Ketiga kolom diperiksa NAMANYA, bukan cuma jumlahnya. Tabel yang ada
    tetapi berkolom lain membuat `INSERT` seed gagal di CI dengan galat yang
    menuduh skrip seed — bukan migrasi ini.
  */
  SELECT count(*) INTO n_kolom FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'ci_seed_penanda'
     AND column_name IN ('run_id', 'shard', 'mulai_pada', 'selesai_pada');
  IF n_kolom <> 4 THEN
    RAISE EXCEPTION '567 gagal: kolom ci_seed_penanda tak lengkap (% dari 4)', n_kolom;
  END IF;

  /*
    Dan `selesai_pada` WAJIB boleh NULL. Kolom yang NOT NULL DEFAULT now()
    membuat penanda selesai terisi saat KLAIM, bukan saat seed usai — penunggu
    berangkat seketika dan balapannya kembali tanpa satu pun gejala. Cacat itu
    ada di versi pertama migrasi ini dan tertangkap simulasi, bukan CI.
  */
  SELECT count(*) INTO n_null FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'ci_seed_penanda'
     AND column_name = 'selesai_pada' AND is_nullable = 'YES';
  IF n_null <> 1 THEN
    RAISE EXCEPTION '567 gagal: selesai_pada tak nullable — penunggu akan berangkat sebelum seed usai';
  END IF;

  /*
    PRIMARY KEY pada `run_id` BUKAN hiasan: ia yang membuat dua shard tak
    bisa sama-sama mengaku sebagai penyeed. Tanpa itu keduanya menyisipkan
    baris, keduanya merasa menang, dan balapannya kembali persis seperti
    sebelum tabel ini ada.
  */
  SELECT count(*) INTO n_pk FROM pg_constraint
   WHERE conrelid = 'public.ci_seed_penanda'::regclass AND contype = 'p';
  IF n_pk <> 1 THEN
    RAISE EXCEPTION '567 gagal: ci_seed_penanda tanpa PRIMARY KEY — dua shard bisa sama-sama menyeed';
  END IF;

  RAISE NOTICE '567 OK — ci_seed_penanda siap (run_id PK, 4 kolom, selesai_pada nullable)';
END $$;
