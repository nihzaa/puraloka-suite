-- ============================================================
-- 145 — financial_config: anti-overlap PER-COMPANY
--
-- ── Cacat yang ditutup (dibuktikan di dev, bukan dugaan)
--
-- `no_overlap_financial_config` (migrasi 086) mengunci `(key, daterange)` SAJA.
-- Saat itu benar: sistem berisi satu perusahaan. Migrasi 127 kemudian menambah
-- `company_id NOT NULL` ke tabel ini — tapi constraint-nya tak ikut diperbarui.
--
-- Akibatnya, begitu badan usaha KEDUA berdiri, ia TIDAK BISA menetapkan
-- tarifnya sendiri. Dibuktikan langsung di dev (transaksi di-rollback):
--
--     INSERT financial_config(key='tax.ppn_rate', 2020-01-01..NULL, company=B)
--     → 23P01 conflicting key value violates exclusion constraint
--
-- Perusahaan A memegang rentang tanggal itu, dan karena `company_id` tak ikut
-- dibandingkan, baris A dianggap bertabrakan dengan baris B. Bacanya sudah
-- ter-scope (`getEffectiveFinancialValue` memfilter company), jadi gejalanya
-- tak muncul di mana pun sampai ada yang mencoba MENULIS.
--
-- Ini kelas cacat yang persis dijaga tripwire multi-company: tak bergejala
-- pada satu tenant, menggigit tepat saat tenant kedua lahir — yaitu ketika
-- memperbaikinya paling mahal, karena sudah ada data operasional.
--
-- ── Kenapa `company_id WITH =`, bukan menghapus constraint
--
-- Anti-overlap-nya SENDIRI benar dan wajib: dua tarif PPN berlaku pada tanggal
-- yang sama untuk SATU perusahaan adalah data yang tak bisa dihitung — mana
-- yang dipakai saat menerbitkan invoice? Yang salah bukan aturannya, melainkan
-- lingkupnya. Menambah `company_id WITH =` mempersempit perbandingan ke dalam
-- satu perusahaan: A dan B boleh sama-sama punya tarif untuk 2020-01-01,
-- tapi A tetap tak boleh punya DUA.
--
-- ── Dampak ke data yang sudah ada: NOL
--
-- Dev hanya berisi satu company (9 baris, seluruhnya milik company yang sama).
-- Mempersempit lingkup constraint tak pernah menolak baris yang sudah lolos
-- aturan yang lebih longgar — arah perubahannya melonggarkan, bukan
-- mengetatkan. Diverifikasi di blok DO di bawah.
-- ============================================================

BEGIN;

-- Constraint EXCLUDE tak bisa di-ALTER; ia dibuang lalu dibuat ulang.
ALTER TABLE financial_config
  DROP CONSTRAINT IF EXISTS no_overlap_financial_config;

ALTER TABLE financial_config
  ADD CONSTRAINT no_overlap_financial_config EXCLUDE USING gist (
    company_id WITH =,
    key WITH =,
    daterange(effective_from, effective_to, '[)') WITH &&
  );

COMMENT ON CONSTRAINT no_overlap_financial_config ON financial_config IS
  'Anti-overlap PER-COMPANY (145). Satu perusahaan tak boleh punya dua nilai untuk key yang sama pada rentang tanggal yang bertumpang tindih; perusahaan BERBEDA boleh punya rentang yang sama — itu justru yang diharapkan.';

-- Indeks lookup ikut menyertakan company_id: query pembacanya selalu
-- menyaring company lebih dulu (getEffectiveFinancialValue), jadi indeks lama
-- yang berawalan `key` memaksa pemindaian lintas-tenant sebelum menyaring.
CREATE INDEX IF NOT EXISTS idx_financial_config_lookup_company
  ON financial_config (company_id, key, effective_from DESC);

-- ── Verifikasi: migrasi gagal berisik kalau tak mencapai maksudnya ──────────
DO $$
DECLARE
  v_def TEXT;
  v_a UUID;
  v_b UUID;
BEGIN
  -- ⚠️ `conrelid` WAJIB disaring. Nama constraint hanya unik per-TABEL, bukan
  -- per-database: schema `test` (dipakai test-db.ts) punya `financial_config`
  -- sendiri dengan constraint bernama sama. Tanpa saringan ini, verifikasi bisa
  -- membaca constraint milik schema LAIN dan melaporkan hasil yang salah —
  -- persis yang terjadi saat migrasi ini pertama dijalankan di schema test.
  -- `to_regclass` memakai search_path, jadi ia menunjuk tabel yang BARU SAJA
  -- disunting di atas, bukan selalu `public`.
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'no_overlap_financial_config'
     AND conrelid = to_regclass('financial_config');

  IF v_def IS NULL THEN
    RAISE EXCEPTION '145 GAGAL: constraint no_overlap_financial_config hilang';
  END IF;

  IF v_def NOT LIKE '%company_id%' THEN
    RAISE EXCEPTION '145 GAGAL: constraint tak menyertakan company_id → %', v_def;
  END IF;

  -- Bukti FUNGSIONAL, bukan sekadar bentuk teksnya: dua company benar-benar
  -- boleh memakai rentang yang sama. Tanpa uji ini, salah tulis urutan kolom
  -- tetap lolos pemeriksaan LIKE di atas.
  --
  -- ⚠️ Dijalankan di dalam blok yang SELALU di-rollback lewat exception buatan.
  -- Versi pertama migrasi ini mencoba membersihkan diri dengan `DELETE FROM
  -- companies`, dan itu DITOLAK trigger `fn_company_no_casual_delete` — guard
  -- yang memang benar dan tak boleh dilemahkan hanya demi verifikasi. Rollback
  -- lebih baik daripada pembersihan: ia tak menyisakan apa pun bahkan bila
  -- verifikasinya sendiri gagal di tengah.
  SELECT id INTO v_a FROM companies ORDER BY created_at LIMIT 1;
  IF v_a IS NULL THEN
    RAISE NOTICE '145: nol company di DB — uji fungsional dilewati';
  ELSE
    BEGIN
      INSERT INTO companies (code, name) VALUES ('uji-145', '[UJI-145] sementara')
        RETURNING id INTO v_b;

      INSERT INTO financial_config (key, value, value_type, effective_from, effective_to, company_id)
        VALUES ('uji145.rate', '0.11', 'number', '2020-01-01', NULL, v_a);
      -- Inilah yang SEBELUM migrasi ini gagal dengan 23P01:
      INSERT INTO financial_config (key, value, value_type, effective_from, effective_to, company_id)
        VALUES ('uji145.rate', '0.12', 'number', '2020-01-01', NULL, v_b);

      -- Dan yang HARUS tetap ditolak: dua baris untuk company yang SAMA.
      BEGIN
        INSERT INTO financial_config (key, value, value_type, effective_from, effective_to, company_id)
          VALUES ('uji145.rate', '0.99', 'number', '2020-06-01', NULL, v_a);
        RAISE EXCEPTION '145 GAGAL: tumpang tindih DALAM satu company tidak ditolak — anti-overlap rusak';
      EXCEPTION WHEN exclusion_violation THEN
        NULL;  -- benar: inilah perilaku yang diharapkan
      END;

      -- Sampai di sini seluruh perilaku terbukti benar. Batalkan semuanya.
      RAISE EXCEPTION 'UJI145_SELESAI';
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM <> 'UJI145_SELESAI' THEN
          RAISE;   -- kegagalan sungguhan diteruskan, jangan ditelan
        END IF;
    END;
  END IF;

  RAISE NOTICE '145 OK: anti-overlap kini per-company (lintas-company boleh, dalam-company tetap ditolak)';
END $$;

COMMIT;
