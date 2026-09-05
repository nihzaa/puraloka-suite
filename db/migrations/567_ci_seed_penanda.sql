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

/*
  ── RLS: WAJIB, dan ketiadaannya memerahkan CI dengan pesan yang benar

  Ember [C] — "RLS aktif/mati tidak boleh dikonfigurasi" (CLAUDE.md §5.3).
  `audit-force-rls.mjs` menuntut TIAP tabel `public` ber-RLS, tanpa kecuali
  untuk tabel infrastruktur.

  ⚠ Ini tak terlihat dari dev. Diukur sesudah CI merah: di basis dev tabel ini
  lahir dengan `relrowsecurity = true` tanpa satu baris pun yang menyalakannya
  — ada yang melakukannya otomatis di sana. Di CI tidak, dan penjaga berbunyi
  "1 tabel dengan RLS MATI" pada keenam shard. Menyalakannya EKSPLISIT membuat
  kedua basis sama, alih-alih bergantung pada perilaku yang cuma ada di satu.

  Policy-nya sengaja menolak SEMUA lewat jalur ber-RLS: tabel ini hanya
  disentuh `ci-project-setup.mjs`, yang memakai peran pemilik (bypass RLS).
  Tak ada pengguna aplikasi yang boleh melihat, apalagi menulis, penanda CI.
*/
ALTER TABLE ci_seed_penanda ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid = 'public.ci_seed_penanda'::regclass
       AND polname = 'ci_seed_penanda_tertutup'
  ) THEN
    /*
      PERMISSIVE yang selalu FALSE, bukan RESTRICTIVE. Tabel FORCE tanpa satu
      pun PERMISSIVE tak terbaca SIAPA PUN dan `audit-tabel-force-berpagar`
      menyebutnya "buntu" — jadi pagarnya ditulis sebagai policy yang ADA
      tetapi tak pernah memulangkan baris.
    */
    CREATE POLICY ci_seed_penanda_tertutup ON ci_seed_penanda
      FOR ALL USING (false) WITH CHECK (false);
  END IF;
END $$;

COMMENT ON TABLE ci_seed_penanda IS
  'Penanda "seed CI sudah selesai" per run GitHub Actions. Shard 1 menulis, '
  'shard 2-6 menunggu. Bukan data aplikasi — aman dikosongkan kapan saja.';

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  n_tabel int; n_kolom int; n_pk int; n_null int; n_rls int;
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

  /*
    RLS diperiksa dari katalog, bukan diasumsikan dari ALTER di atas: tabel
    yang sudah ada sejak jalan sebelumnya melewati CREATE, dan tanpa cek ini
    migrasi akan melapor OK atas tabel yang RLS-nya mati.
  */
  SELECT count(*) INTO n_rls FROM pg_class
   WHERE oid = 'public.ci_seed_penanda'::regclass AND relrowsecurity;
  IF n_rls <> 1 THEN
    RAISE EXCEPTION '567 gagal: RLS mati di ci_seed_penanda — Ember [C], dan tripwire F2-6 akan merah';
  END IF;

  RAISE NOTICE '567 OK — ci_seed_penanda siap (run_id PK, 4 kolom, selesai_pada nullable)';
END $$;
