-- ════════════════════════════════════════════════════════════════════════════
-- 438 — `perangkat_pengguna`: token push NATIF, dan kenapa ia TIDAK menumpang
--        di `users.push_subscription`
-- ════════════════════════════════════════════════════════════════════════════
--
-- Menutup entri Peta Modul `mb-notif` (Notifikasi Perangkat). Catatan lamanya
-- berbunyi *"Web Push sudah dikonfigurasi; belum diverifikasi di perangkat
-- nyata"* — dan kalimat itu menunjuk ke arah yang salah, sehingga siapa pun
-- yang membacanya akan menghabiskan waktu menguji HP alih-alih menulis kode
-- yang memang belum ada.
--
-- ── Yang diukur 2026-08-16, sebelum satu baris pun ditulis
--
-- Web Push (browser) LENGKAP end-to-end, dan tak disentuh migrasi ini:
--
--     utils/webpush.ts:19-32   setVapidDetails dari VAPID_*
--     utils/webpush.ts:83-107  fan-out membaca `users.push_subscription`
--     utils/notifications.ts:369  DIPANGGIL dari corong createNotifications()
--     routes/v1/notifications.ts:714  POST /subscribe
--     apps/web/lib/webpush.ts + public/sw.js + notification-panel.tsx:277-300
--
-- Yang BENAR-BENAR hilang adalah push natif di `apps/mobile`:
--
--     apps/mobile/package.json          NOL kecocokan `expo-notif|push`
--     app/(app)/notifications/index.tsx MURNI TARIK/POLL — GET saat mount
--                                       + tarik-untuk-segarkan. HP-nya tak
--                                       pernah dibangunkan.
--
-- Web Push TIDAK sampai ke React Native: `sw.js` adalah service worker
-- peramban, dan React Native tak menjalankan service worker. Jadi
-- "pemberitahuan ke HP" untuk aplikasi mobile memang BELUM ADA — bukan
-- "belum diverifikasi".
--
-- ════════════════════════════════════════════════════════════════════════════
-- KENAPA TABEL BARU, BUKAN KOLOM BARU DI `users`
-- ════════════════════════════════════════════════════════════════════════════
--
-- Godaan yang jelas: tambah `users.expo_push_token TEXT` di sebelah
-- `push_subscription` dan selesai dalam satu baris. Itu ditolak, dan
-- alasannya bukan selera:
--
--   1. SATU PENGGUNA PUNYA BEBERAPA PERANGKAT — dan justru pengguna yang
--      paling butuh push-lah yang punya lebih dari satu. Mandor memakai HP
--      lapangan; orang yang sama membuka aplikasi dari HP pribadinya saat
--      libur. Kolom tunggal menampung SATU nilai: login di perangkat kedua
--      MENIMPA token perangkat pertama, dan perangkat pertama berhenti
--      berbunyi tanpa satu pun galat, di mana pun. Pemiliknya akan menyimpulkan
--      "notifikasi memang tak jalan", bukan "token saya tertimpa".
--
--      `users.push_subscription` memang mengidap cacat ini hari ini. Ia tidak
--      diperbaiki di sini karena memperbaikinya berarti memindahkan Web Push
--      yang sedang bekerja — pekerjaan tersendiri, dengan risikonya sendiri.
--      Yang penting: cacat itu TIDAK DIWARISKAN ke jalur yang baru dibangun.
--
--   2. BENTUKNYA BEDA, jadi satu kolom akan menampung dua bahasa. Web Push
--      menyimpan objek langganan peramban:
--
--          { endpoint: "https://fcm.googleapis.com/…",
--            keys: { p256dh: "…", auth: "…" } }
--
--      Expo menyimpan STRING opaque: `ExponentPushToken[xxxxxxxx]`. Dua bentuk
--      di satu kolom JSONB berarti tiap pembaca harus menebak yang mana yang
--      sedang ia pegang, dan tebakan itu akan salah pada suatu hari.
--
--   3. TOKEN PUNYA RIWAYAT, KOLOM TIDAK. Token mati perlu dibuang, perangkat
--      perlu dikenali ("Android · Redmi Note"), dan pengguna berhak melihat
--      "perangkat apa saja yang menerima notifikasi saya". Semua itu butuh
--      baris, bukan sel.
--
-- ── Kenapa `token` unik GLOBAL, bukan per-(user, token)
--
-- Ini kebalikan dari keputusan migrasi 427 — dan sengaja. Di 427, `code`
-- pemasok adalah kode INTERNAL tiap perusahaan, jadi unik global membocorkan
-- keberadaan tenant lain. Di sini `token` bukan milik siapa pun: ia
-- diterbitkan Expo untuk SATU pemasangan aplikasi di SATU perangkat fisik.
--
-- Konsekuensinya konkret. Satu HP dipakai bergantian dua orang — lazim di
-- lapangan, HP proyek yang dipegang siapa pun yang jaga hari itu. Pengguna B
-- login, Expo memulangkan token yang SAMA (token melekat pada pemasangan,
-- bukan pada sesi). Tanpa unik global, tabel ini menyimpan dua baris untuk
-- satu HP, dan kasbon milik A dikirim ke HP yang sekarang dipegang B.
--
-- Unik global memaksa penyerahan: `ON CONFLICT (token) DO UPDATE` memindahkan
-- kepemilikan baris ke pengguna yang terakhir login. Satu perangkat fisik =
-- satu baris = satu penerima. Kebocoran lintas-pengguna tertutup oleh BENTUK
-- tabelnya, bukan oleh kedisiplinan pemanggilnya.
--
-- ── Kenapa `company_id` ikut, padahal token milik pengguna
--
-- Tenancy (CLAUDE.md §5.2). Tanpa kolomnya, tabel ini tak bisa dipagari RLS
-- dan `audit-gerbang-tenancy.mjs` benar untuk menuduhnya. Ia diisi dari
-- keanggotaan pengguna saat mendaftar, dan ikut berpindah saat token
-- berpindah pemilik — kalau tidak, baris warisan akan menunjuk tenant lama
-- sementara pemiliknya sudah tenant baru.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabel ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.perangkat_pengguna (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_id   UUID REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Token Expo apa adanya: `ExponentPushToken[…]`. TEXT, bukan JSONB —
  -- ia memang string opaque, dan membungkusnya jadi JSON hanya menambah
  -- satu lapis yang harus dilucuti tiap kali dipakai.
  token        TEXT NOT NULL,

  -- 'expo' hari ini. Kolomnya ada supaya penambahan penyedia lain (APNs/FCM
  -- langsung, kalau Expo ditinggalkan) tak butuh migrasi bentuk — hanya nilai
  -- baru. Daftarnya TERTUTUP: penyedia tak dikenal berarti tak ada pengirim
  -- yang tahu cara memakainya, dan barisnya jadi sampah diam-diam.
  penyedia     TEXT NOT NULL DEFAULT 'expo'
                 CHECK (penyedia IN ('expo', 'fcm', 'apns')),

  -- Untuk layar "perangkat saya" — pengguna harus bisa mengenali mana yang
  -- mau ia cabut. Nullable: perangkat tetap sah tanpa nama.
  platform     TEXT CHECK (platform IN ('ios', 'android', 'web')),
  nama_perangkat TEXT,

  -- Dipakai untuk membersihkan token yang lama tak terpakai, dan untuk
  -- menjawab "kapan terakhir HP ini terlihat".
  terakhir_dipakai_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Satu perangkat fisik = satu baris. Alasan lengkap di header.
CREATE UNIQUE INDEX IF NOT EXISTS perangkat_pengguna_token_unik
  ON public.perangkat_pengguna (token);

-- Jalur baca panas: "ambil semua token milik N pengguna ini" — persis yang
-- dilakukan fan-out di `utils/push-natif.ts` untuk tiap notifikasi.
CREATE INDEX IF NOT EXISTS perangkat_pengguna_user_idx
  ON public.perangkat_pengguna (user_id);

CREATE INDEX IF NOT EXISTS perangkat_pengguna_company_idx
  ON public.perangkat_pengguna (company_id);

COMMENT ON TABLE public.perangkat_pengguna IS
  'Token push NATIF per-PERANGKAT (Expo). Terpisah dari users.push_subscription '
  '(Web Push, bentuk langganan peramban, hanya menampung SATU) karena satu '
  'pengguna punya beberapa perangkat dan bentuk tokennya berbeda. `token` unik '
  'GLOBAL: satu HP dipakai bergantian dua orang harus memindahkan kepemilikan '
  'baris, bukan menggandakannya (438).';

COMMENT ON COLUMN public.perangkat_pengguna.token IS
  'ExponentPushToken[…] apa adanya. Dihapus barisnya saat Expo memulangkan '
  'DeviceNotRegistered — token mati yang dibiarkan membuat tiap notifikasi '
  'membawa kegagalan yang tak pernah berkurang.';

-- ─── 2. RLS ─────────────────────────────────────────────────────────────────
--
-- Pengguna hanya boleh melihat & mencabut perangkatnya SENDIRI. Tak ada
-- kebutuhan sah bagi seorang pengguna untuk membaca token pengguna lain, dan
-- token yang terbaca adalah token yang bisa dipakai mengirim notifikasi palsu
-- atas nama perusahaan.
--
-- Penulisan oleh server memakai service role, yang MELEWATI RLS — jadi
-- fan-out pengirim tetap bisa membaca token seluruh penerima. Yang dipagari
-- di sini adalah akses BER-KONTEKS-PENGGUNA.
ALTER TABLE public.perangkat_pengguna ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perangkat_pengguna_self ON public.perangkat_pengguna;
CREATE POLICY perangkat_pengguna_self ON public.perangkat_pengguna
  FOR ALL
  USING      (user_id = (SELECT auth_user_id()))
  WITH CHECK (user_id = (SELECT auth_user_id()));

-- Isolasi tenant sebagai lapis kedua — pola yang sama dengan `notifications`.
-- ⚠️ `auth_company_id()` NULL tak boleh berarti "lolos semua" (penjaga
-- `audit-izin-tanpa-konteks.mjs`), karena itu dibandingkan lurus: NULL = NULL
-- memulangkan NULL, dan NULL bukan TRUE — barisnya tersaring, gagal-tertutup.
--
-- ⚠ DINAMAI `tenant_isolation`, DIPERBAIKI DI TEMPAT 2026-08-31.
--
-- Semula `perangkat_pengguna_tenant` — nama yang migrasi 216 justru dibuat
-- untuk MENGHAPUS. 216 mengganti `<tabel>_tenant` → `tenant_isolation` di
-- seluruh repo, lalu memeriksa nol sisa dengan pemindaian GLOBAL:
--
--     FROM pg_policy WHERE polname LIKE '%\_tenant'
--
-- Migrasi ini lahir SESUDAH 216, jadi namanya lolos daftar rename-nya tetapi
-- tetap tertangkap pemindaian globalnya. Akibatnya 216 gagal saat diputar
-- ulang di lingkungan bersih:
--
--     Masih ada 1 policy bernama <tabel>_tenant
--
-- Tak pernah terlihat karena penyiapan basis CI selalu berhenti lebih dulu di
-- migrasi 212. Baru muncul sesudah 212-214 diperbaiki hari ini.
--
-- Nama lamanya tetap di-DROP supaya basis yang sudah terlanjur memakainya
-- ikut bersih.
DROP POLICY IF EXISTS perangkat_pengguna_tenant ON public.perangkat_pengguna;
DROP POLICY IF EXISTS tenant_isolation ON public.perangkat_pengguna;
CREATE POLICY tenant_isolation ON public.perangkat_pengguna
  FOR ALL
  USING (company_id = (SELECT auth_company_id()));

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_user  UUID;
  v_user2 UUID;
  v_co    UUID;
  v_lolos BOOLEAN := FALSE;
  v_n     INT;
  v_pemilik UUID;
BEGIN
  SELECT id INTO v_user  FROM users WHERE is_active LIMIT 1;
  SELECT id INTO v_user2 FROM users WHERE is_active AND id <> v_user LIMIT 1;
  SELECT company_id INTO v_co FROM projects WHERE company_id IS NOT NULL LIMIT 1;

  /*
    ⚠ "Tak ada user untuk menguji" BUKAN kegagalan — diperbaiki 2026-09-04.

    Pesannya jujur menyebut sebabnya, tetapi tetap MENGGAGALKAN migrasi. Di
    schema bersih tak ada satu pun `users`, jadi replay dari nol berhenti di
    sini atas keadaan yang sepenuhnya wajar.

    Kelas yang sama dengan 252, 254, 256, dan 316: pembuktian yang kehilangan
    bahannya melapor sebagai kegagalan. Yang dilewati hanya pembuktiannya —
    pembuatan tabel, RLS, dan indeks di atas TETAP berjalan, dan di
    lingkungan mana pun yang punya user pembuktian ini berjalan penuh.
  */
  IF v_user IS NULL THEN
    RAISE NOTICE '438: belum ada user — pembuktian perangkat push DILEWATI (schema bersih)';
    RETURN;
  END IF;

  -- 1. Tabelnya benar-benar ada, dan RLS-nya HIDUP.
  --    Tabel per-pengguna tanpa RLS adalah tabel yang bisa dibaca siapa pun
  --    yang punya koneksi ber-konteks pengguna mana pun.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'perangkat_pengguna'
       AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION '438 gagal: perangkat_pengguna tak ada atau RLS-nya MATI';
  END IF;

  -- 2. Waktu WAJIB timestamptz (CLAUDE.md §5.4). Diperiksa di sini, bukan
  --    dipercaya dari DDL di atas: migrasi bisa dijalankan di atas tabel
  --    warisan yang sudah terlanjur ber-`timestamp without time zone`, dan
  --    `CREATE TABLE IF NOT EXISTS` diam saja soal itu.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'perangkat_pengguna'
       AND data_type = 'timestamp without time zone'
  ) THEN
    RAISE EXCEPTION '438 gagal: ada kolom waktu TANPA zona waktu';
  END IF;

  -- 3. Token boleh masuk.
  INSERT INTO perangkat_pengguna (user_id, company_id, token, platform)
    VALUES (v_user, v_co, '[438-TOKEN-A]', 'android');

  -- 4. Token KEMBAR ditolak — inti seluruh migrasi ini.
  --    Kalau ini lolos, satu HP bisa punya dua baris dan notifikasi pemilik
  --    lama tetap mengalir ke perangkat yang sudah berpindah tangan.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO perangkat_pengguna (user_id, company_id, token)
      VALUES (v_user, v_co, '[438-TOKEN-A]');
    v_lolos := TRUE;
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM perangkat_pengguna WHERE token LIKE '[438-%';
    RAISE EXCEPTION '438 gagal: token KEMBAR diterima — satu HP jadi dua baris';
  END IF;

  -- 5. Satu pengguna BOLEH punya beberapa perangkat.
  --    Ini justru yang tak bisa dilakukan `users.push_subscription`, dan
  --    alasan tabel ini ada. Kalau ini gagal, kita cuma memindahkan cacat lama
  --    ke tempat baru.
  INSERT INTO perangkat_pengguna (user_id, company_id, token, platform)
    VALUES (v_user, v_co, '[438-TOKEN-B]', 'ios');
  SELECT count(*) INTO v_n FROM perangkat_pengguna
   WHERE user_id = v_user AND token LIKE '[438-%';
  IF v_n <> 2 THEN
    DELETE FROM perangkat_pengguna WHERE token LIKE '[438-%';
    RAISE EXCEPTION '438 gagal: satu pengguna hanya menampung % perangkat (harus 2)', v_n;
  END IF;

  -- 6. Token yang SAMA login sebagai pengguna LAIN memindahkan kepemilikan,
  --    bukan menggandakan. Skenario nyata: HP proyek dipegang bergantian.
  IF v_user2 IS NOT NULL THEN
    INSERT INTO perangkat_pengguna (user_id, company_id, token)
      VALUES (v_user2, v_co, '[438-TOKEN-A]')
    ON CONFLICT (token) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          company_id = EXCLUDED.company_id,
          terakhir_dipakai_at = now();

    SELECT user_id INTO v_pemilik FROM perangkat_pengguna WHERE token = '[438-TOKEN-A]';
    IF v_pemilik <> v_user2 THEN
      DELETE FROM perangkat_pengguna WHERE token LIKE '[438-%';
      RAISE EXCEPTION '438 gagal: token tak berpindah pemilik — notifikasi orang lama tetap ke HP ini';
    END IF;

    SELECT count(*) INTO v_n FROM perangkat_pengguna WHERE token = '[438-TOKEN-A]';
    IF v_n <> 1 THEN
      DELETE FROM perangkat_pengguna WHERE token LIKE '[438-%';
      RAISE EXCEPTION '438 gagal: % baris untuk satu token setelah pindah tangan', v_n;
    END IF;
  ELSE
    RAISE NOTICE '438 — hanya satu user aktif, uji pindah-tangan dilewati';
  END IF;

  -- 7. Penyedia di luar daftar DITOLAK. Baris ber-penyedia asing tak punya
  --    pengirim yang tahu cara memakainya — ia jadi sampah yang tak pernah
  --    berbunyi dan tak pernah mengeluh.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO perangkat_pengguna (user_id, company_id, token, penyedia)
      VALUES (v_user, v_co, '[438-TOKEN-C]', 'onesignal');
    v_lolos := TRUE;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM perangkat_pengguna WHERE token LIKE '[438-%';
    RAISE EXCEPTION '438 gagal: penyedia di luar daftar DITERIMA';
  END IF;

  -- 8. Hapus pengguna → perangkatnya ikut hilang (ON DELETE CASCADE).
  --    Token yatim adalah token yang tetap menerima push untuk akun yang
  --    sudah tak ada. Diuji lewat katalog, bukan dengan menghapus user
  --    sungguhan.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.perangkat_pengguna'::regclass
       AND contype = 'f' AND confdeltype = 'c'
       AND conname LIKE '%user_id%'
  ) THEN
    DELETE FROM perangkat_pengguna WHERE token LIKE '[438-%';
    RAISE EXCEPTION '438 gagal: user_id tak ber-ON DELETE CASCADE — token yatim akan tertinggal';
  END IF;

  -- Fixture dibersihkan. Blok ini dipanggil ulang tiap kali migrasi di-replay
  -- di lingkungan bersih, jadi sisa baris uji akan menumpuk kalau dibiarkan.
  DELETE FROM perangkat_pengguna WHERE token LIKE '[438-%';
  SELECT count(*) INTO v_n FROM perangkat_pengguna WHERE token LIKE '[438-%';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '438 gagal: % baris fixture tak terbersihkan', v_n;
  END IF;

  RAISE NOTICE '438 OK — perangkat_pengguna hidup ber-RLS; token unik global '
    '(satu HP satu baris, pindah tangan memindahkan kepemilikan), satu pengguna '
    'boleh banyak perangkat, penyedia asing ditolak, token yatim tak mungkin';
END $$;
