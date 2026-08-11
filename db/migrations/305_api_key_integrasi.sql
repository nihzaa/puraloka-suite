-- ════════════════════════════════════════════════════════════════════════════
-- 305 — API key: jalan masuk bagi sistem luar (G6c)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Yang terukur, dan kenapa ini yang hilang
--
-- Diukur 2026-08-12: nol tabel `api_key`, nol kolom `api_key`/`secret` di
-- seluruh skema. Satu-satunya jalan masuk ke API adalah token Supabase Auth
-- (`plugins/auth.ts:103`) — yaitu **sesi manusia yang login lewat peramban**.
--
-- `otomasi_alur.jalur_webhook` yang sudah ada berjalan ke ARAH SEBALIKNYA:
-- Puraloka memanggil n8n (14 alur, 6 ber-webhook). Yang tak ada adalah arah
-- masuk — sistem luar memanggil Puraloka.
--
-- Akibatnya nyata: tiap integrasi hari ini menuntut seseorang menaruh
-- kredensial LOGIN MANUSIA di sistem lain. Kredensial itu punya seluruh
-- kewenangan orangnya, tak bisa dicabut tanpa mengunci orangnya sendiri, dan
-- jejaknya di audit log tertulis sebagai perbuatan orang itu — bukan mesin.
--
-- ── Kenapa HASH, bukan enkripsi
--
-- Repo ini sudah punya `lib/kredensial-sandi.ts` (AES-256-GCM) dan menggoda
-- dipakai ulang. Untuk API key itu SALAH: enkripsi bisa dibalik, jadi siapa
-- pun yang memegang server bisa membaca kembali kunci setiap pelanggan.
--
-- Kunci di sini di-hash SATU ARAH (SHA-256). Konsekuensinya disengaja:
-- nilainya ditampilkan **sekali** saat dibuat, dan sesudah itu tak ada yang
-- bisa memulihkannya — termasuk kami. Yang hilang harus dicabut dan dibuat
-- ulang.
--
-- Kenapa SHA-256 dan bukan bcrypt/scrypt seperti kata sandi: API key adalah
-- 32 byte ACAK, bukan frasa yang bisa ditebak. KDF lambat melindungi dari
-- serangan kamus yang tak berlaku di sini, sementara biayanya dibayar pada
-- SETIAP permintaan — dan integrasi berarti banyak permintaan.
--
-- ── Kenapa ada `awalan` yang disimpan terang
--
-- Tanpa itu, layar hanya bisa menampilkan daftar kunci tanpa cara membedakan
-- satu dari yang lain, dan orang akan mencabut kunci yang salah. Delapan
-- karakter pertama cukup untuk mengenali, terlalu pendek untuk dipakai.
--
-- ── Ember [C]? Mendekat, dan sengaja dibuat gagal-tertutup
--
-- Kunci tanpa masa berlaku tak pernah dipertanyakan lagi setelah dibuat.
-- Karena itu `kedaluwarsa_pada` WAJIB — bukan opsional dengan bawaan NULL.
-- ════════════════════════════════════════════════════════════════════════════

-- ------------------------------------------------------------
-- 1. Kunci
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_key (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  nama            TEXT NOT NULL,

  -- Untuk apa kunci ini. WAJIB: kunci tanpa keterangan tak bisa dinilai saat
  -- audit — "boleh dicabut atau tidak?" jadi pertanyaan tanpa jawaban, dan
  -- yang terjadi kemudian selalu sama: tak ada yang berani mencabutnya.
  keperluan       TEXT NOT NULL,

  -- SHA-256 heksadesimal dari kunci penuh. 64 karakter, dan bentuknya
  -- ditegakkan CHECK: nilai yang lebih pendek berarti seseorang menyimpan
  -- kunci mentah atau hash algoritma lain.
  hash_kunci      TEXT NOT NULL,

  -- 8 karakter pertama, disimpan TERANG untuk pengenalan.
  awalan          TEXT NOT NULL,

  -- Izin yang boleh dipakai kunci ini. Sengaja ARRAY dan bukan rujukan ke
  -- peran: kunci mesin tak seharusnya mewarisi kewenangan sebuah jabatan
  -- yang bisa berubah tanpa ada yang memikirkan integrasinya.
  --
  -- Kosong = TAK BISA APA-APA. Itu bawaan yang benar: kunci yang lahir
  -- dengan seluruh izin adalah cara paling cepat kehilangan kendali.
  izin            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- WAJIB — lihat kepala berkas.
  kedaluwarsa_pada TIMESTAMPTZ NOT NULL,

  dicabut_pada    TIMESTAMPTZ,
  dicabut_oleh    UUID REFERENCES users(id),
  alasan_cabut    TEXT,

  dibuat_oleh     UUID REFERENCES users(id),
  dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Jejak pemakaian. Kunci yang tak pernah dipakai berbulan-bulan adalah
  -- kunci yang lebih baik dicabut, dan tanpa kolom ini tak ada yang tahu.
  dipakai_terakhir TIMESTAMPTZ,
  jumlah_pakai    BIGINT NOT NULL DEFAULT 0,

  CONSTRAINT chk_api_key_nama     CHECK (length(trim(nama)) > 0),
  CONSTRAINT chk_api_key_keperluan CHECK (length(trim(keperluan)) >= 10),
  -- 64 heksadesimal — SHA-256 dan bukan yang lain.
  CONSTRAINT chk_api_key_hash     CHECK (hash_kunci ~ '^[0-9a-f]{64}$'),
  CONSTRAINT chk_api_key_awalan   CHECK (length(awalan) BETWEEN 4 AND 16),
  -- Pencabutan tanpa alasan menghilangkan satu-satunya keterangan yang dicari
  -- saat orang bertanya "kenapa integrasi kami mati?".
  CONSTRAINT chk_api_key_cabut_beralasan
    CHECK (dicabut_pada IS NULL OR length(trim(coalesce(alasan_cabut, ''))) >= 5)
);

-- Hash HARUS unik lintas tenant. Bukan per company: dua kunci dengan hash
-- sama berarti satu kunci bisa membuka dua tenant, dan itu kebocoran isolasi
-- yang tak akan pernah terlihat di layar mana pun.
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_key_hash ON api_key (hash_kunci);

CREATE INDEX IF NOT EXISTS idx_api_key_company
  ON api_key (company_id, dibuat_pada DESC);

-- Pencarian saat autentikasi: hash + belum dicabut + belum kedaluwarsa.
CREATE INDEX IF NOT EXISTS idx_api_key_hidup
  ON api_key (hash_kunci) WHERE dicabut_pada IS NULL;

ALTER TABLE api_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. Hash TIDAK boleh diubah
--
-- Menyunting hash berarti mengganti kunci tanpa mencabut yang lama — dan
-- pemilik kunci lama tak pernah tahu aksesnya berpindah. Yang boleh:
-- mencabut, lalu membuat yang baru.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_api_key_hash_beku()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.hash_kunci IS DISTINCT FROM OLD.hash_kunci
  OR NEW.awalan IS DISTINCT FROM OLD.awalan
  OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION
      'Kunci API tak bisa diganti isinya. Cabut kunci ini lalu buat yang baru '
      '— mengganti hash diam-diam memindahkan akses tanpa pemilik lama tahu.';
  END IF;

  -- Kunci yang SUDAH dicabut tak bisa dihidupkan lagi. Pencabutan adalah
  -- pernyataan bahwa kunci itu bocor atau tak dipercaya; menghidupkannya
  -- kembali menghapus arti pernyataan itu.
  IF OLD.dicabut_pada IS NOT NULL AND NEW.dicabut_pada IS NULL THEN
    RAISE EXCEPTION
      'Kunci yang sudah dicabut tak bisa dihidupkan kembali. Buat kunci baru.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_api_key_hash_beku ON api_key;
CREATE TRIGGER trg_api_key_hash_beku
  BEFORE UPDATE ON api_key
  FOR EACH ROW EXECUTE FUNCTION fn_api_key_hash_beku();

-- ------------------------------------------------------------
-- 3. Jejak pemakaian
--
-- Terpisah dari `api_key` supaya baris kuncinya tetap kecil dan jejaknya bisa
-- dipangkas tanpa menyentuh kuncinya. Tanpa tabel ini, "siapa yang memakai
-- kunci ini dan untuk apa" hanya bisa dijawab dari log server — yang berputar
-- dan hilang.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_key_pakai (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id   UUID NOT NULL REFERENCES api_key(id) ON DELETE CASCADE,
  pada         TIMESTAMPTZ NOT NULL DEFAULT now(),
  metode       TEXT,
  jalur        TEXT,
  status       INT,
  ip           TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_key_pakai_kunci
  ON api_key_pakai (api_key_id, pada DESC);

ALTER TABLE api_key_pakai ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key_pakai FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 4. Izin
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description)
VALUES
  ('settings:apikey:view',   'settings', 'Lihat kunci API',
   'Melihat daftar kunci API beserta pemakaiannya'),
  ('settings:apikey:manage', 'settings', 'Kelola kunci API',
   'Membuat dan mencabut kunci API — memberi sistem luar akses ke data')
ON CONFLICT (key) DO NOTHING;

-- Membuat kunci API = memberi sistem luar akses ke seluruh data tenant.
-- Yang wajar memilikinya: peran yang sudah boleh mengelola pengaturan.
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
  FROM role_permissions rp
  JOIN permissions px ON px.id = rp.permission_id
  CROSS JOIN permissions p
 WHERE px.key = 'settings:manage'
   AND p.key IN ('settings:apikey:view', 'settings:apikey:manage')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
  v_co UUID;
  v_id UUID;
  v_lolos BOOLEAN := FALSE;
  v_hash TEXT := repeat('a', 64);
BEGIN
  -- 1. Nol kunci ter-seed. Kunci yang dibuat migrasi adalah pintu yang tak
  --    pernah diputuskan siapa pun untuk dibuka.
  SELECT count(*) INTO n FROM api_key;
  IF n > 0 THEN
    RAISE EXCEPTION '305 gagal: % kunci API ter-seed', n;
  END IF;

  SELECT company_id INTO v_co FROM projects WHERE company_id IS NOT NULL LIMIT 1;
  IF v_co IS NOT NULL THEN
    INSERT INTO api_key (company_id, nama, keperluan, hash_kunci, awalan, kedaluwarsa_pada)
    VALUES (v_co, '[305-VERIFIKASI]', 'blok verifikasi migrasi 305',
            v_hash, 'pk_test1', now() + INTERVAL '1 day')
    RETURNING id INTO v_id;

    -- 2. Izin bawaan KOSONG — kunci baru tak bisa apa-apa sampai diberi izin.
    SELECT cardinality(izin) INTO n FROM api_key WHERE id = v_id;
    IF n <> 0 THEN
      DELETE FROM api_key WHERE nama LIKE '[305-%';
      RAISE EXCEPTION '305 gagal: kunci baru lahir dengan % izin (harus 0)', n;
    END IF;

    -- 3. Hash tak bisa diganti.
    BEGIN
      UPDATE api_key SET hash_kunci = repeat('b', 64) WHERE id = v_id;
      v_lolos := TRUE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    IF v_lolos THEN
      DELETE FROM api_key WHERE nama LIKE '[305-%';
      RAISE EXCEPTION '305 gagal: hash kunci BISA diganti — akses berpindah diam-diam';
    END IF;

    -- 4. Hash bukan-SHA256 ditolak.
    v_lolos := FALSE;
    BEGIN
      INSERT INTO api_key (company_id, nama, keperluan, hash_kunci, awalan, kedaluwarsa_pada)
      VALUES (v_co, '[305-NGAWUR]', 'verifikasi bentuk hash', 'bukan-hash',
              'pk_test2', now() + INTERVAL '1 day');
      v_lolos := TRUE;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    IF v_lolos THEN
      DELETE FROM api_key WHERE nama LIKE '[305-%';
      RAISE EXCEPTION '305 gagal: hash sembarang LOLOS — kunci mentah bisa tersimpan';
    END IF;

    -- 5. Pencabutan tanpa alasan ditolak.
    v_lolos := FALSE;
    BEGIN
      UPDATE api_key SET dicabut_pada = now() WHERE id = v_id;
      v_lolos := TRUE;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    IF v_lolos THEN
      DELETE FROM api_key WHERE nama LIKE '[305-%';
      RAISE EXCEPTION '305 gagal: pencabutan tanpa alasan LOLOS';
    END IF;

    -- 6. Dicabut DENGAN alasan boleh, lalu tak bisa dihidupkan lagi.
    UPDATE api_key SET dicabut_pada = now(), alasan_cabut = 'verifikasi 305'
     WHERE id = v_id;
    v_lolos := FALSE;
    BEGIN
      UPDATE api_key SET dicabut_pada = NULL WHERE id = v_id;
      v_lolos := TRUE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    IF v_lolos THEN
      DELETE FROM api_key WHERE nama LIKE '[305-%';
      RAISE EXCEPTION '305 gagal: kunci yang dicabut BISA dihidupkan kembali';
    END IF;

    -- 7. Keperluan terlalu pendek ditolak.
    v_lolos := FALSE;
    BEGIN
      INSERT INTO api_key (company_id, nama, keperluan, hash_kunci, awalan, kedaluwarsa_pada)
      VALUES (v_co, '[305-PENDEK]', 'sinkron', repeat('c', 64),
              'pk_test3', now() + INTERVAL '1 day');
      v_lolos := TRUE;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    IF v_lolos THEN
      DELETE FROM api_key WHERE nama LIKE '[305-%';
      RAISE EXCEPTION '305 gagal: keperluan 7 huruf LOLOS';
    END IF;

    DELETE FROM api_key WHERE nama LIKE '[305-%';
  END IF;

  -- 8. Izin sampai ke peran.
  SELECT count(DISTINCT rp.role_id) INTO n
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
   WHERE p.key = 'settings:apikey:manage';
  IF n = 0 THEN
    RAISE EXCEPTION '305 gagal: settings:apikey:manage tak dimiliki satu peran pun';
  END IF;

  SELECT count(*) INTO n FROM api_key;
  IF n > 0 THEN
    RAISE EXCEPTION '305 gagal: % baris verifikasi tertinggal', n;
  END IF;

  RAISE NOTICE '305 OK — hash beku, izin bawaan kosong, cabut wajib beralasan & tak bisa dibatalkan';
END $$;
