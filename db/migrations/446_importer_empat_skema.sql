-- ════════════════════════════════════════════════════════════════════════════
-- 446 — Importer: EMPAT skema, dan tabrakan `code` yang harus ditutup dulu
-- ════════════════════════════════════════════════════════════════════════════
--
-- Butir 5 rencana merge bertahap R-013, dan satu-satunya yang menuntut migrasi
-- baru alih-alih memindahkan berkas.
--
-- ── Kenapa migrasi baru, bukan mengambil 441 apa adanya
--
-- Dua branch menambah skema importer secara terpisah:
--
--     branch ini          supplier · cost_code       (migrasi 427)
--     kematangan-modul    pemasok  · workers         (migrasi 441)
--
-- Ternyata itu BUKAN tabrakan: `supplier` dan `pemasok` menulis ke tabel yang
-- sama, sementara `cost_code` dan `workers` sama sekali tak bersinggungan.
-- Hasil yang benar EMPAT skema, bukan memilih dua dan membuang dua.
--
-- ── ⚠ TEMUAN YANG MEMAKSA MIGRASI INI ADA
--
-- Migrasi 441 menulis asumsi ini di headernya sendiri:
--
--     "`code` pemasok bahkan tak unik di basis (diukur: nol unique index
--      pada `suppliers.code`). Duplikat karena itu MUNGKIN, dan itu
--      keputusan sadar."
--
-- Asumsi itu BENAR saat ditulis, dan SUDAH TIDAK BENAR sekarang. Migrasi 427
-- (branch ini, sudah jalan) memasang:
--
--     suppliers_code_per_company  UNIQUE (company_id, code) WHERE code IS NOT NULL
--
-- Dan `INSERT INTO suppliers` di 441 tak punya `ON CONFLICT`. Digabung apa
-- adanya, mengimpor dua pemasok berkode sama akan MENGGAGALKAN SELURUH
-- BERKAS — importer ini all-or-nothing — padahal 441 justru dirancang
-- membolehkan duplikat.
--
-- Gejalanya akan muncul sebagai "importer rusak" pada pelanggan pertama yang
-- berkasnya memuat kode berulang. Bukan sebagai tabrakan desain, yang justru
-- penyebabnya.
--
-- Yang dipilih: `ON CONFLICT DO NOTHING` pada baris berkode kembar, dan
-- jumlah yang DILEWATI dilaporkan. Bukan `DO UPDATE` — menimpa berarti
-- menebak "baris ini yang mana", dan yang tertimpa adalah data pelanggan
-- (alasan 441 sendiri menolak upsert, dan alasan itu masih berlaku).
--
-- ── `payment_terms` tak dikenal: NULL, bukan 'cod' (R-013 butir 1)
--
-- 441 menjatuhkannya ke `'cod'` dengan alasan yang sah: menolak seluruh
-- berkas karena satu sel membuat importer tak terpakai.
--
-- Alasan itu benar, tapi jalan keluarnya sudah ditutup di tempat lain:
-- `lib/importer-nilai.ts` menerjemahkan "NET 30"/"30 hari"/"tunai" ke nilai
-- sah SEBELUM sampai ke sini. Yang tersisa jatuh ke sini hanyalah yang
-- benar-benar tak terbaca — "sesuai kesepakatan", "nego".
--
-- Untuk sisa itu, diukur: `net_14` 2 · `net_30` 1 · `cod` 1 · `net_7` 1.
-- EMPAT dari lima pemasok BUKAN `cod`. Jadi menjatuhkan yang tak terbaca ke
-- `'cod'` menebak salah untuk mayoritas — dan tebakan itu tak meninggalkan
-- jejak bahwa ia pernah ditebak.
--
-- NULL jujur: kolomnya nullable, dan termin kosong TERLIHAT kosong.
-- ════════════════════════════════════════════════════════════════════════════

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
  n_minta INT := 0;
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

  n_minta := jsonb_array_length(p_baris);

  CASE p_tabel
    WHEN 'materials' THEN
      INSERT INTO materials (company_id, code, name, unit, unit_price, min_stock, is_active)
      SELECT
        p_company_id, x.code, x.name,
        COALESCE(x.unit, 'unit'), COALESCE(x.unit_price, 0),
        COALESCE(x.min_stock, 0), COALESCE(x.is_active, TRUE)
      FROM jsonb_to_recordset(p_baris) AS x(
        code TEXT, name TEXT, unit TEXT,
        unit_price NUMERIC, min_stock NUMERIC, is_active BOOLEAN);
      GET DIAGNOSTICS n = ROW_COUNT;

    WHEN 'suppliers' THEN
      INSERT INTO suppliers (
        company_id, code, name, contact_person, phone, email,
        address, city, payment_terms, credit_limit, notes, is_active)
      SELECT
        p_company_id,
        NULLIF(TRIM(COALESCE(x.code, '')), ''),
        x.name,
        NULLIF(TRIM(COALESCE(x.contact_person, '')), ''),
        NULLIF(TRIM(COALESCE(x.phone, '')), ''),
        NULLIF(TRIM(COALESCE(x.email, '')), ''),
        NULLIF(TRIM(COALESCE(x.address, '')), ''),
        NULLIF(TRIM(COALESCE(x.city, '')), ''),
        -- Lapis KEDUA. Yang pertama `lib/importer-nilai.ts` yang
        -- menerjemahkan bahasa manusia; ini menahan nilai yang tetap tak sah
        -- supaya CHECK basis tak menggagalkan seluruh berkas.
        --
        -- NULL, bukan 'cod' — lihat header.
        CASE lower(TRIM(COALESCE(x.payment_terms, '')))
          WHEN 'cod' THEN 'cod'
          WHEN 'prepaid' THEN 'prepaid'
          WHEN 'net_7' THEN 'net_7'
          WHEN 'net_14' THEN 'net_14'
          WHEN 'net_30' THEN 'net_30'
          WHEN 'open_account' THEN 'open_account'
          ELSE NULL
        END,
        GREATEST(COALESCE(x.credit_limit, 0), 0),
        NULLIF(TRIM(COALESCE(x.notes, '')), ''),
        COALESCE(x.is_active, TRUE)
      FROM jsonb_to_recordset(p_baris) AS x(
        code TEXT, name TEXT, contact_person TEXT, phone TEXT, email TEXT,
        address TEXT, city TEXT, payment_terms TEXT, credit_limit NUMERIC,
        notes TEXT, is_active BOOLEAN)
      -- Kode kembar DILEWATI, bukan menggagalkan berkas dan bukan menimpa.
      -- Menimpa berarti menebak "baris ini yang mana" dari kolom yang bisa
      -- diketik ulang orang — dan yang tertimpa adalah data pelanggan.
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS n = ROW_COUNT;

    WHEN 'cost_codes' THEN
      -- `status` dipaku 'draft': kode biaya yang lahir AKTIF melewati
      -- satu-satunya tahap di mana orang memeriksa kodenya benar.
      INSERT INTO cost_codes (company_id, code, name, description, category, status)
      SELECT p_company_id, x.code, x.name, x.description, x.category, 'draft'
      FROM jsonb_to_recordset(p_baris) AS x(
        code TEXT, name TEXT, description TEXT, category TEXT)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS n = ROW_COUNT;

    WHEN 'workers' THEN
      -- `tipe` yang tak dikenali jadi NULL, bukan ditebak. Kolomnya memang
      -- nullable dan artinya "belum diketahui" — sementara menebak "tukang"
      -- untuk sel bertulis "Tukang Batu" terdengar wajar sampai laporan
      -- komposisi regu memakainya sebagai fakta.
      --
      -- `mandor_id` SENGAJA tak diisi: registry pekerja global sejak migrasi
      -- 029, dan menautkannya ke mandor saat impor berarti menebak penugasan
      -- yang sebenarnya ditentukan per lingkup kerja.
      INSERT INTO workers (company_id, name, phone, tipe, notes, is_active)
      SELECT
        p_company_id,
        x.name,
        NULLIF(TRIM(COALESCE(x.phone, '')), ''),
        CASE lower(TRIM(COALESCE(x.tipe, '')))
          WHEN 'tukang' THEN 'tukang'
          WHEN 'laden'  THEN 'laden'
          WHEN 'kenek'  THEN 'kenek'
          ELSE NULL
        END,
        NULLIF(TRIM(COALESCE(x.notes, '')), ''),
        COALESCE(x.is_active, TRUE)
      FROM jsonb_to_recordset(p_baris) AS x(
        name TEXT, phone TEXT, tipe TEXT, notes TEXT, is_active BOOLEAN);
      GET DIAGNOSTICS n = ROW_COUNT;

    ELSE
      RAISE EXCEPTION 'impor_commit: tabel "%" tidak didukung importer', p_tabel;
  END CASE;

  -- `dilewati` dilaporkan, bukan disembunyikan. Berkas 200 baris yang
  -- menghasilkan 180 masuk TANPA menyebut 20 sisanya membuat orang mengira
  -- seluruhnya berhasil — lalu mencari 20 pemasok yang tak pernah ada.
  RETURN jsonb_build_object('masuk', n, 'dilewati', n_minta - n);
END;
$function$;

COMMENT ON FUNCTION impor_commit(TEXT, UUID, JSONB) IS
  'Commit importer ALL-OR-NOTHING. Satu pemanggilan = satu transaksi. Daftar '
  'tabel TERTUTUP (CASE, bukan format %I). Tabel: materials, suppliers, '
  'cost_codes, workers (446). Kode kembar DILEWATI dan dilaporkan lewat '
  '`dilewati`, tidak menggagalkan berkas dan tidak menimpa.';

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_co    UUID;
  v_hasil JSONB;
  v_lolos BOOLEAN := FALSE;
  v_term  TEXT;
BEGIN
  SELECT company_id INTO v_co FROM projects WHERE company_id IS NOT NULL LIMIT 1;

  -- 1. Keempat skema dikenali; yang di luar daftar DITOLAK.
  v_lolos := FALSE;
  BEGIN
    PERFORM impor_commit('users', v_co, '[{"name":"X"}]'::jsonb);
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    RAISE EXCEPTION '446 gagal: tabel sembarang DITERIMA importer';
  END IF;

  -- 2. `payment_terms` tak terbaca jadi NULL, BUKAN 'cod'.
  --    Inti keputusan R-013 butir 1.
  v_hasil := impor_commit('suppliers', v_co,
    '[{"code":"[446-A]","name":"Pemasok A","payment_terms":"sesuai kesepakatan"}]'::jsonb);
  SELECT payment_terms INTO v_term FROM suppliers WHERE code = '[446-A]';
  IF v_term IS NOT NULL THEN
    DELETE FROM suppliers WHERE code LIKE '[446-%';
    RAISE EXCEPTION
      '446 gagal: termin tak terbaca jadi "%" — seharusnya NULL. Menebak '
      'termin berarti menebak KAPAN UANG KELUAR.', v_term;
  END IF;

  -- 3. Nilai SAH tetap tersimpan apa adanya.
  PERFORM impor_commit('suppliers', v_co,
    '[{"code":"[446-B]","name":"Pemasok B","payment_terms":"net_30"}]'::jsonb);
  SELECT payment_terms INTO v_term FROM suppliers WHERE code = '[446-B]';
  IF v_term IS DISTINCT FROM 'net_30' THEN
    DELETE FROM suppliers WHERE code LIKE '[446-%';
    RAISE EXCEPTION '446 gagal: termin sah berubah jadi %', COALESCE(v_term, 'NULL');
  END IF;

  -- 4. Kode KEMBAR dilewati — tidak menggagalkan berkas, tidak menimpa.
  --    Ini yang tabrakan 427↔441 akan sebabkan kalau dibiarkan.
  v_hasil := impor_commit('suppliers', v_co,
    '[{"code":"[446-B]","name":"Pemasok B DUPLIKAT"},
      {"code":"[446-C]","name":"Pemasok C"}]'::jsonb);
  IF (v_hasil->>'masuk')::INT <> 1 THEN
    DELETE FROM suppliers WHERE code LIKE '[446-%';
    RAISE EXCEPTION '446 gagal: melaporkan % masuk (harus 1 — satu kembar dilewati)',
      v_hasil->>'masuk';
  END IF;
  IF (v_hasil->>'dilewati')::INT <> 1 THEN
    DELETE FROM suppliers WHERE code LIKE '[446-%';
    RAISE EXCEPTION '446 gagal: `dilewati` = % (harus 1) — baris yang tak masuk '
      'harus DILAPORKAN, bukan disembunyikan', v_hasil->>'dilewati';
  END IF;
  -- Yang lama TIDAK tertimpa.
  IF EXISTS (SELECT 1 FROM suppliers WHERE code = '[446-B]' AND name <> 'Pemasok B') THEN
    DELETE FROM suppliers WHERE code LIKE '[446-%';
    RAISE EXCEPTION '446 gagal: baris kembar MENIMPA yang lama — data pelanggan hilang';
  END IF;

  DELETE FROM suppliers WHERE code LIKE '[446-%';

  RAISE NOTICE '446 OK — 4 skema; termin tak terbaca jadi NULL (bukan cod); '
    'kode kembar dilewati & dilaporkan, tidak menggagalkan berkas & tidak menimpa';
END $$;
