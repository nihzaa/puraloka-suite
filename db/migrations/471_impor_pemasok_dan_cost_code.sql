-- ════════════════════════════════════════════════════════════════════════════
-- 427 — Impor massal: pemasok & cost code, dan dua unik GLOBAL yang menghalangi
-- ════════════════════════════════════════════════════════════════════════════
--
-- Menutup separuh `sy-import`: importer punya SATU skema (`material`) sejak
-- TJS-P3, sementara menunya bernama "Impor & Ekspor Data". Yang ditambah di
-- sini dua tabel yang paling sering datang sebagai daftar Excel saat
-- onboarding pelanggan baru — pemasok dan cost code.
--
-- ── Yang ketahuan saat mengukur, dan kenapa ia diperbaiki DULU
--
-- Diukur 2026-08-16 sebelum menulis satu baris pun kode importer:
--
--     cost_codes_code_key : UNIQUE (code)     ← tanpa company_id
--     suppliers_code_key  : UNIQUE (code)     ← tanpa company_id
--
-- Keduanya unik GLOBAL. Itu kelas cacat yang persis sama dengan yang sudah
-- ditutup migrasi 333 untuk `rfq`, `tender_subkon`, dan `sertifikat_ipc`:
--
--   1. Tenant B DITOLAK memakai kode yang dipakai tenant A — padahal kode
--      pemasok "SUP-001" adalah kode INTERNAL masing-masing perusahaan, dan
--      hampir setiap perusahaan memulai dari angka yang sama.
--   2. Penolakannya sendiri MEMBOCORKAN keberadaan data tenant lain: "kode
--      sudah dipakai" adalah jawaban yang hanya bisa benar kalau ada baris
--      milik orang lain di sana.
--
-- Tanpa ini, impor 200 pemasok milik pelanggan kedua akan gagal semua di baris
-- pertama yang kodenya bertabrakan — dan karena importer ini ALL-OR-NOTHING,
-- yang gagal bukan satu baris melainkan seluruh berkas. Cacatnya akan terbaca
-- sebagai "importer rusak", bukan sebagai kebocoran tenant.
--
-- ── Kenapa unik parsial, bukan unik biasa atas (company_id, code)
--
-- `code` NULLABLE di kedua tabel, dan NULL memang sah — pemasok boleh tak
-- berkode. Unik biasa memperlakukan tiap NULL sebagai berbeda, jadi itu bukan
-- masalahnya; yang jadi masalah adalah `company_id` yang juga NULL. 44 baris
-- `cost_codes` hari ini SELURUHNYA ber-company_id NULL (diukur), warisan dari
-- sebelum 127 menambahkan kolomnya.
--
-- Karena itu indexnya `WHERE code IS NOT NULL`: baris tak berkode tak ikut
-- diperiksa sama sekali, dan baris warisan ber-company NULL tetap saling unik
-- di antara mereka sendiri (NULL company dianggap satu "ruang" oleh btree
-- karena NULLS NOT DISTINCT tidak dipakai — dua baris company NULL berkode
-- sama tetap bertabrakan, dan itu yang kita mau: warisan tetap konsisten).
--
-- ── `payment_terms` BUKAN angka hari, dan saya sempat menulisnya begitu
--
-- Percobaan pertama migrasi ini GAGAL di blok verifikasinya sendiri:
--
--     new row for relation "suppliers"
--     violates check constraint "suppliers_payment_terms_check"
--
-- Kolomnya daftar tertutup — `cod`, `prepaid`, `net_7`, `net_14`, `net_30`,
-- `open_account` — bukan INTEGER hari seperti yang saya asumsikan dari
-- namanya. Dicatat di sini karena kegagalannya berguna: blok verifikasi
-- menangkapnya SEBELUM buku migrasi ditulis, jadi tak ada migrasi setengah
-- jadi yang tercatat "berhasil". Itu persis alasan pola verifikasi ini ada.
--
-- Pelajarannya bukan "hati-hati" melainkan: UKUR constraint tabel target,
-- jangan menyimpulkan tipe dari nama kolom.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Membuang unik GLOBAL ────────────────────────────────────────────────
--
-- Dicari berdasarkan BENTUK, bukan nama — pelajaran migrasi 333: menghapus
-- berdasarkan nama tebakan menghasilkan no-op yang verifikasinya ikut lulus
-- karena ia mencari nama yang salah pula.
DO $$
DECLARE
  t   TEXT;
  idx TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers', 'cost_codes'] LOOP
    FOR idx IN
      SELECT i.relname
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_class c ON c.oid = x.indrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relname = t
         AND n.nspname = 'public'
         AND x.indisunique
         AND x.indnatts = 1
         AND pg_get_indexdef(x.indexrelid) ILIKE '%(code)%'
    LOOP
      -- Constraint lebih dulu: index penopang constraint tak bisa di-DROP
      -- langsung, dan galatnya menyebut hal lain.
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, idx);
      EXECUTE format('DROP INDEX IF EXISTS public.%I', idx);
      RAISE NOTICE '427 — unik global %.% dihapus', t, idx;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_code_per_company
  ON public.suppliers (company_id, code) WHERE code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cost_codes_code_per_company
  ON public.cost_codes (company_id, code) WHERE code IS NOT NULL;

-- ─── 2. Importer: dua tabel baru di daftar TERTUTUP ─────────────────────────
--
-- Daftar tetap `CASE`, bukan `format('%I', p_tabel)`. Alasannya tak berubah
-- sejak 316: nama tabel dari luar yang disambung ke query adalah SQL injection,
-- dan "tabel mana yang boleh ditulis massal" bukan keputusan yang boleh
-- diambil dari badan permintaan.
CREATE OR REPLACE FUNCTION impor_commit(
  p_tabel      TEXT,
  p_company_id UUID,
  p_baris      JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $function$
DECLARE
  n INT := 0;
BEGIN
  IF p_baris IS NULL OR jsonb_typeof(p_baris) <> 'array' THEN
    RAISE EXCEPTION 'impor_commit: p_baris harus array JSON';
  END IF;

  IF jsonb_array_length(p_baris) = 0 THEN
    RAISE EXCEPTION 'impor_commit: tak ada baris untuk diimpor';
  END IF;

  IF jsonb_array_length(p_baris) > 5000 THEN
    RAISE EXCEPTION 'impor_commit: % baris melebihi batas 5000',
      jsonb_array_length(p_baris);
  END IF;

  CASE p_tabel
    WHEN 'materials' THEN
      INSERT INTO materials (company_id, code, name, unit, unit_price, min_stock, is_active)
      SELECT
        p_company_id,
        x.code, x.name,
        COALESCE(x.unit, 'unit'),
        COALESCE(x.unit_price, 0),
        COALESCE(x.min_stock, 0),
        COALESCE(x.is_active, TRUE)
      FROM jsonb_to_recordset(p_baris) AS x(
        code TEXT, name TEXT, unit TEXT,
        unit_price NUMERIC, min_stock NUMERIC, is_active BOOLEAN);
      GET DIAGNOSTICS n = ROW_COUNT;

    WHEN 'suppliers' THEN
      -- `company_id` WAJIB, alasan sama dengan materials: kolomnya nullable,
      -- jadi lupa mengisinya tak menghasilkan galat — pemasok impor hanya
      -- akan terlihat oleh SELURUH tenant.
      INSERT INTO suppliers (
        company_id, code, name, contact_person, phone, email,
        address, city, payment_terms, credit_limit, notes, is_active)
      SELECT
        p_company_id,
        x.code, x.name, x.contact_person, x.phone, x.email,
        x.address, x.city,
        -- `payment_terms` DAFTAR TERTUTUP (`suppliers_payment_terms_check`),
        -- bukan angka hari. Yang menerjemahkan "NET 30"/"tempo 30 hari" ke
        -- nilai sah adalah `lib/importer-nilai.ts` SEBELUM sampai ke sini.
        --
        -- Nilai tak dikenal jadi NULL, tidak ditebak: termin menentukan kapan
        -- uang keluar, dan tebakan menghasilkan jatuh tempo yang terlihat
        -- pasti padahal karangan. Pemeriksaan di sini lapis kedua — kalau
        -- pemanggil lalai menormalkan, yang masuk NULL, bukan baris yang
        -- ditolak CHECK dan menggagalkan seluruh berkas.
        CASE WHEN x.payment_terms IN
               ('cod','prepaid','net_7','net_14','net_30','open_account')
             THEN x.payment_terms ELSE NULL END,
        GREATEST(COALESCE(x.credit_limit, 0), 0),
        x.notes,
        COALESCE(x.is_active, TRUE)
      FROM jsonb_to_recordset(p_baris) AS x(
        code TEXT, name TEXT, contact_person TEXT, phone TEXT, email TEXT,
        address TEXT, city TEXT, payment_terms TEXT, credit_limit NUMERIC,
        notes TEXT, is_active BOOLEAN);
      GET DIAGNOSTICS n = ROW_COUNT;

    WHEN 'cost_codes' THEN
      -- `status` SENGAJA tak diimpor — ia dipaksa 'draft'.
      --
      -- 102 menegakkan lifecycle draft→active→deprecated lewat trigger, dan
      -- `cost_codes_status_timestamps` menuntut `activated_at` terisi saat
      -- status 'active'. Berkas Excel yang membawa kolom "status" berisi
      -- "active" akan melanggar CHECK itu — tapi yang lebih penting: kode biaya
      -- yang lahir langsung AKTIF melewati satu-satunya tahap di mana orang
      -- memeriksa apakah kodenya benar. Impor memasukkan CALON, bukan putusan.
      INSERT INTO cost_codes (company_id, code, name, description, category, status)
      SELECT
        p_company_id,
        x.code, x.name, x.description, x.category,
        'draft'
      FROM jsonb_to_recordset(p_baris) AS x(
        code TEXT, name TEXT, description TEXT, category TEXT);
      GET DIAGNOSTICS n = ROW_COUNT;

    ELSE
      RAISE EXCEPTION 'impor_commit: tabel "%" tidak didukung importer', p_tabel;
  END CASE;

  RETURN jsonb_build_object('masuk', n);
END;
$function$;

COMMENT ON FUNCTION impor_commit(TEXT, UUID, JSONB) IS
  'Commit importer ALL-OR-NOTHING. Satu pemanggilan = satu transaksi: '
  'berhasil seluruhnya, atau tak ada yang berubah. Daftar tabel TERTUTUP '
  '(CASE, bukan format %I) — nama tabel dari luar adalah SQL injection. '
  'Tabel didukung: materials, suppliers, cost_codes (427).';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_co    UUID;
  v_co2   UUID;
  v_awal  INT;
  v_akhir INT;
  v_hasil JSONB;
  v_lolos BOOLEAN := FALSE;
  v_stat  TEXT;
BEGIN
  SELECT company_id INTO v_co FROM projects WHERE company_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_co2 FROM companies WHERE id <> v_co LIMIT 1;

  -- 1. Unik GLOBAL benar-benar HILANG dari kedua tabel.
  IF EXISTS (
    SELECT 1 FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_class c ON c.oid = x.indrelid
      JOIN pg_namespace nsp ON nsp.oid = c.relnamespace
     WHERE c.relname IN ('suppliers', 'cost_codes')
       AND nsp.nspname = 'public'
       AND x.indisunique AND x.indnatts = 1
       AND pg_get_indexdef(x.indexrelid) ILIKE '%(code)%'
  ) THEN
    RAISE EXCEPTION '427 gagal: unik GLOBAL atas (code) masih ada';
  END IF;

  -- 2. Dua tenant BOLEH memakai kode pemasok yang sama.
  --    Inti seluruh migrasi ini — kalau ini gagal, kebocorannya masih terbuka.
  IF v_co2 IS NOT NULL THEN
    INSERT INTO suppliers (company_id, code, name) VALUES (v_co,  '[427-SUP]', 'Uji A');
    BEGIN
      INSERT INTO suppliers (company_id, code, name) VALUES (v_co2, '[427-SUP]', 'Uji B');
    EXCEPTION WHEN unique_violation THEN
      DELETE FROM suppliers WHERE code = '[427-SUP]';
      RAISE EXCEPTION '427 gagal: tenant kedua DITOLAK kode pemasok tenant pertama';
    END;

    -- ...tapi kode yang sama DI TENANT YANG SAMA tetap ditolak.
    v_lolos := FALSE;
    BEGIN
      INSERT INTO suppliers (company_id, code, name) VALUES (v_co, '[427-SUP]', 'Kembar');
      v_lolos := TRUE;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    DELETE FROM suppliers WHERE code = '[427-SUP]';
    IF v_lolos THEN
      RAISE EXCEPTION '427 gagal: kode pemasok KEMBAR dalam satu tenant DITERIMA';
    END IF;
  ELSE
    RAISE NOTICE '427 — hanya satu company di basis, uji lintas-tenant dilewati';
  END IF;

  -- 3. Tabel tak dikenal tetap DITOLAK (regresi 316).
  v_lolos := FALSE;
  BEGIN
    PERFORM impor_commit('users', v_co, '[{"code":"X"}]'::jsonb);
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    RAISE EXCEPTION '427 gagal: tabel sembarang DITERIMA importer';
  END IF;

  -- 4. Impor pemasok yang SAH masuk, ber-company_id benar.
  SELECT count(*) INTO v_awal FROM suppliers;
  v_hasil := impor_commit('suppliers', v_co,
    '[{"code":"[427-A]","name":"Pemasok A","payment_terms":"net_30"},
      {"code":"[427-B]","name":"Pemasok B","payment_terms":"sesuai kesepakatan"}]'::jsonb);
  IF (v_hasil->>'masuk')::INT <> 2 THEN
    DELETE FROM suppliers WHERE code LIKE '[427-%';
    RAISE EXCEPTION '427 gagal: melaporkan % pemasok masuk (harus 2)', v_hasil->>'masuk';
  END IF;
  IF EXISTS (SELECT 1 FROM suppliers WHERE code LIKE '[427-%' AND company_id IS DISTINCT FROM v_co) THEN
    DELETE FROM suppliers WHERE code LIKE '[427-%';
    RAISE EXCEPTION '427 gagal: pemasok impor ber-company_id salah/NULL — bocor ke tenant lain';
  END IF;
  -- Nilai sah tersimpan apa adanya…
  IF NOT EXISTS (SELECT 1 FROM suppliers WHERE code = '[427-A]' AND payment_terms = 'net_30') THEN
    DELETE FROM suppliers WHERE code LIKE '[427-%';
    RAISE EXCEPTION '427 gagal: termin SAH tak tersimpan';
  END IF;
  -- …dan yang TAK DIKENAL jadi NULL, bukan ditebak dan bukan menggagalkan
  -- 200 baris lain yang benar.
  IF NOT EXISTS (SELECT 1 FROM suppliers WHERE code = '[427-B]' AND payment_terms IS NULL) THEN
    DELETE FROM suppliers WHERE code LIKE '[427-%';
    RAISE EXCEPTION '427 gagal: termin tak dikenal TIDAK jadi NULL — ditebak diam-diam';
  END IF;
  DELETE FROM suppliers WHERE code LIKE '[427-%';

  SELECT count(*) INTO v_akhir FROM suppliers;
  IF v_akhir <> v_awal THEN
    RAISE EXCEPTION '427 gagal: sisa baris uji pemasok tak terbersihkan';
  END IF;

  -- 5. ALL-OR-NOTHING masih berlaku untuk tabel baru: baris kedua melanggar
  --    NOT NULL, baris pertama TIDAK boleh tersisa.
  SELECT count(*) INTO v_awal FROM suppliers;
  v_lolos := FALSE;
  BEGIN
    PERFORM impor_commit('suppliers', v_co,
      '[{"code":"[427-X]","name":"Sah"},{"code":"[427-Y]","name":null}]'::jsonb);
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  SELECT count(*) INTO v_akhir FROM suppliers;
  IF v_akhir <> v_awal THEN
    DELETE FROM suppliers WHERE code LIKE '[427-%';
    RAISE EXCEPTION '427 gagal: % baris tersisa dari impor pemasok yang GAGAL', v_akhir - v_awal;
  END IF;
  IF v_lolos THEN
    RAISE EXCEPTION '427 gagal: pemasok ber-name NULL LOLOS';
  END IF;

  -- 6. Cost code impor lahir 'draft', bukan langsung aktif.
  v_hasil := impor_commit('cost_codes', v_co,
    '[{"code":"[427-CC]","name":"Uji cost code","category":"uji"}]'::jsonb);
  IF (v_hasil->>'masuk')::INT <> 1 THEN
    DELETE FROM cost_codes WHERE code LIKE '[427-%';
    RAISE EXCEPTION '427 gagal: cost code tak masuk';
  END IF;
  SELECT status INTO v_stat FROM cost_codes WHERE code = '[427-CC]';
  IF v_stat <> 'draft' THEN
    DELETE FROM cost_codes WHERE code LIKE '[427-%';
    RAISE EXCEPTION '427 gagal: cost code impor lahir berstatus % — melewati tahap periksa', v_stat;
  END IF;
  IF EXISTS (SELECT 1 FROM cost_codes WHERE code LIKE '[427-%' AND company_id IS DISTINCT FROM v_co) THEN
    DELETE FROM cost_codes WHERE code LIKE '[427-%';
    RAISE EXCEPTION '427 gagal: cost code impor ber-company_id salah/NULL';
  END IF;

  -- 102 melarang DELETE cost_codes lewat trigger (jejak RAB→EVM). Baris uji
  -- dinetralkan dengan menandainya deprecated, bukan dihapus.
  UPDATE cost_codes SET status = 'deprecated', deprecated_at = now()
   WHERE code LIKE '[427-%';

  RAISE NOTICE '427 OK — unik per-tenant terbukti (dua tenant boleh kode sama, '
    'kembar dalam satu tenant ditolak); pemasok & cost code masuk importer '
    'dengan all-or-nothing utuh dan cost code lahir draft';
END $$;
