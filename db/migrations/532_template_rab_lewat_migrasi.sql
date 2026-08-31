-- ============================================================================
-- 532 — `template_rab` dan turunannya: tiga tabel yang lahir di luar migrasi
-- ============================================================================
--
-- ── Cacat yang ditutup
--
-- Test `t7-exit-criteria-l2.test.ts` merah di CI:
--
--     tabel ber-tenant tanpa kolom company_id:
--       expected [ 'template_rab' ] to deeply equal []
--
-- `template_rab` terdaftar di `PETA_TENANCY` sebagai tabel ber-tenant, dan di
-- basis CI ia TAK ADA sama sekali — jadi kolom `company_id`-nya juga tak ada.
--
-- Diukur 2026-08-31 dengan memindai seluruh `CREATE TABLE` di db/migrations:
-- ketiga tabel ini tak pernah dibuat migrasi mana pun. Ia ada di basis dev
-- karena dibuat di luar jalur migrasi, dan migrasi 510/517/518/519 sekadar
-- memakainya.
--
-- Dua migrasi hari ini sudah menambal AKIBATNYA — 518 dan 519 dibungkus
-- `to_regclass IS NULL` supaya tak mati di lingkungan baru. Itu benar sebagai
-- pertahanan, dan tak menyelesaikan sebabnya: di CI, VPS baru, dan mesin
-- developer baru, template RAB tetap TIDAK ADA.
--
-- ── Kenapa sekarang bisa dibuat, padahal tadi saya menolak
--
-- Pagi ini saya menulis di migrasi 518: "membuat tabelnya berarti menebak
-- bentuknya, dan bentuk yang salah lebih buruk daripada tabel yang tak ada."
--
-- Itu masih benar. Yang berubah: bentuknya tak lagi ditebak. Seluruh definisi
-- di bawah DISALIN dari basis dev lewat `information_schema` dan
-- `pg_get_constraintdef` — kolom, tipe, default, NOT NULL, CHECK, UNIQUE, FK,
-- dan kedua enum-nya, satu per satu.
--
-- ── Yang TIDAK disalin: isinya
--
-- Sembilan baris template di basis dev tidak ikut. Template RAB adalah
-- konfigurasi milik perusahaan, bukan katalog bersama — menyalinnya ke setiap
-- lingkungan baru akan menanamkan template Puraloka di tenant orang lain.
--
-- Idempoten (`IF NOT EXISTS` di mana-mana). Verifikasi di blok akhir (pola 142).

-- ── Enum ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tpl_status') THEN
    CREATE TYPE tpl_status AS ENUM ('draft', 'active', 'superseded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tpl_tipe_input') THEN
    CREATE TYPE tpl_tipe_input AS ENUM ('angka', 'teks', 'pilihan', 'boolean');
  END IF;
END $$;

-- ── template_rab ────────────────────────────────────────────────────────────
--
-- `company_id` NULLABLE dengan sengaja: NULL berarti template STANDARD milik
-- katalog bersama, bukan milik satu perusahaan. Pola yang sama dengan
-- `cbs_templates` (migrasi 335), dan pagar RLS-nya (519) memang menuliskan
-- `company_id IS NULL OR company_id = auth_company_id()`.
CREATE TABLE IF NOT EXISTS public.template_rab (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid REFERENCES companies(id) ON DELETE CASCADE,
  kode         text NOT NULL CHECK (kode ~ '^[A-Z][A-Z0-9-]{1,31}$'),
  nama         text NOT NULL CHECK (btrim(nama) <> ''),
  golongan     text NOT NULL CHECK (btrim(golongan) <> ''),
  deskripsi    text,
  versi        integer NOT NULL DEFAULT 1 CHECK (versi >= 1),
  status       tpl_status NOT NULL DEFAULT 'draft',
  sumber       text,
  dibuat_pada  timestamptz NOT NULL DEFAULT now(),
  dibuat_oleh  uuid,
  diubah_pada  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, kode, versi)
);

-- ── template_input ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.template_input (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES template_rab(id) ON DELETE CASCADE,
  kunci       text NOT NULL CHECK (kunci ~ '^[a-z][a-z0-9_]{1,39}$'),
  label       text NOT NULL CHECK (btrim(label) <> ''),
  satuan      text,
  tipe        tpl_tipe_input NOT NULL DEFAULT 'angka',
  wajib       boolean NOT NULL DEFAULT true,
  bawaan      text,
  opsi        text[] NOT NULL DEFAULT '{}',
  min_nilai   numeric,
  maks_nilai  numeric,
  bantuan     text,
  urutan      integer NOT NULL DEFAULT 0,
  UNIQUE (template_id, kunci),
  CONSTRAINT tpl_input_batas_waras
    CHECK (min_nilai IS NULL OR maks_nilai IS NULL OR min_nilai <= maks_nilai),
  -- Tipe `pilihan` tanpa opsi menghasilkan dropdown kosong: pemakainya melihat
  -- kotak yang tak bisa diisi apa pun, dan tak satu pun galat menjelaskannya.
  CONSTRAINT tpl_input_pilihan_ada_opsi
    CHECK (tipe <> 'pilihan' OR array_length(opsi, 1) >= 1)
);

-- ── template_item ───────────────────────────────────────────────────────────
--
-- `assembly_id` ON DELETE RESTRICT, bukan CASCADE: menghapus analisa AHSP yang
-- masih dipakai template akan mengosongkan rumusnya tanpa jejak.
CREATE TABLE IF NOT EXISTS public.template_item (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES template_rab(id) ON DELETE CASCADE,
  bab          text NOT NULL CHECK (btrim(bab) <> ''),
  sub_bab      text,
  uraian       text NOT NULL CHECK (btrim(uraian) <> ''),
  assembly_id  uuid REFERENCES assemblies(id) ON DELETE RESTRICT,
  satuan       text NOT NULL,
  rumus        text NOT NULL CHECK (btrim(rumus) <> ''),
  syarat       text,
  catatan      text,
  urutan       integer NOT NULL DEFAULT 0,
  cost_code    text
);

-- ── Verifikasi (pola migrasi 142) ───────────────────────────────────────────
DO $$
DECLARE
  v_tabel  TEXT;
  v_kurang TEXT := '';
  n_kolom  INT;
BEGIN
  FOREACH v_tabel IN ARRAY ARRAY['template_rab', 'template_input', 'template_item'] LOOP
    IF to_regclass('public.' || v_tabel) IS NULL THEN
      v_kurang := v_kurang || v_tabel || ' ';
    END IF;
  END LOOP;
  IF v_kurang <> '' THEN
    RAISE EXCEPTION '532 gagal: tabel tak terbentuk: %', v_kurang;
  END IF;

  /*
    Kolom `company_id` di `template_rab` adalah alasan migrasi ini ditulis.

    ⚠ `table_schema = 'public'` WAJIB. CLAUDE.md §1 mencatatnya: basis ini
    punya skema `test` yang membayangi tabel `public` bernama sama, dan tanpa
    saringan itu cacah kolom jadi DUA KALI.
  */
  SELECT count(*) INTO n_kolom FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'template_rab'
     AND column_name = 'company_id';
  IF n_kolom <> 1 THEN
    RAISE EXCEPTION '532 gagal: template_rab.company_id ada % kali, harus tepat 1', n_kolom;
  END IF;

  -- Turunannya wajib punya FK ke induknya: tanpa itu baris yatim bisa lahir
  -- dan RLS turunan (migrasi 519) tak punya apa pun untuk disandarkan.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.template_input'::regclass AND contype = 'f'
       AND confrelid = 'public.template_rab'::regclass
  ) THEN
    RAISE EXCEPTION '532 gagal: template_input tanpa FK ke template_rab';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.template_item'::regclass AND contype = 'f'
       AND confrelid = 'public.template_rab'::regclass
  ) THEN
    RAISE EXCEPTION '532 gagal: template_item tanpa FK ke template_rab';
  END IF;

  RAISE NOTICE '532 OK: template_rab + template_input + template_item ada, company_id terpasang, FK utuh';
END $$;
