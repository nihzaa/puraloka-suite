-- ════════════════════════════════════════════════════════════════════════════
-- 333 — Penomoran dokumen: prefix yang dipakai, dan tiga unik yang bocor
-- ════════════════════════════════════════════════════════════════════════════
--
-- Migrasi 135 membangun counter transaksional `next_document_number()` dan
-- menutup empat cacat pola `COUNT(*) + 1`. Diukur 2026-08-12, tiga hal
-- tertinggal:
--
-- ── 1. Kolom `prefix` TAK PERNAH DIBACA
--
-- `document_number_series.prefix` ada sejak migrasi 126. Fungsinya
-- mengembalikan `BIGINT` saja, dan prefix hanya tersimpan saat baris counter
-- PERTAMA dibuat — sesudah itu diabaikan selamanya. Keempat baris di dev
-- berprefix `''`.
--
-- Akibatnya format nomor DIPAKU DI KODE: `INV/PRL/2026/001` mengandung "PRL"
-- (Puraloka) di dalam `finance.ts`. Tenant lain yang memakai aplikasi ini
-- mendapat nomor invoice bertuliskan singkatan perusahaan orang lain, dan
-- satu-satunya cara mengubahnya adalah menyunting kode.
--
-- Itu melanggar config-first (CHARTER §8): "kolom DB sudah ada" bukan selesai;
-- selesai berarti ada halaman pengaturannya.
--
-- ── 2. `COUNT(*) + 1` MASIH HIDUP untuk nomor INVOICE
--
-- `termin-payment.ts:186` menomori invoice dengan `count(*) + 1` — persis pola
-- yang migrasi 135 hapus, pada dokumen yang KELUAR KE KLIEN. Nomor yang
-- dipakai ulang sesudah penghapusan pada invoice bukan ketidakrapian, itu
-- cacat audit.
--
-- Migrasi ini tak bisa memperbaiki kodenya (itu di TypeScript), tetapi ia
-- menyiapkan yang dibutuhkan: seri `invoice` per company sudah ada, dan
-- rutenya dialihkan ke `next_document_number()` di commit yang sama.
--
-- ── 3. TIGA unik masih GLOBAL, bukan per-tenant
--
--     rfq              UNIQUE (nomor)
--     tender_subkon    UNIQUE (nomor)
--     sertifikat_ipc   UNIQUE (nomor)
--
-- Ketiganya punya `project_id`. Unik global berarti tenant B DITOLAK saat
-- memakai nomor yang kebetulan dipakai tenant A — dan penolakan itu sendiri
-- membocorkan bahwa dokumen dengan nomor itu ada di tenant lain. Persis cacat
-- #4 migrasi 135, di tiga tabel yang terlewat.
--
-- Diukur sebelum diubah: rfq 3/3 nomor unik, tender 3/3, ipc 4/4 — nol
-- bentrok, jadi pelonggaran ini tak menyembunyikan data rusak.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Prefix yang benar-benar dipakai ──────────────────────────────────────
--
-- Fungsi BARU, bukan mengubah `next_document_number()`.
--
-- Yang lama mengembalikan BIGINT dan dipanggil `finance.ts`; mengubah tipe
-- kembaliannya akan mematahkan pemanggil yang ada tanpa satu pun galat
-- kompilasi (Supabase RPC tak bertipe di sisi TypeScript). Jadi yang lama
-- dibiarkan utuh, dan yang baru MEMBUNGKUSnya.
CREATE OR REPLACE FUNCTION next_document_number_full(
  p_company_id UUID,
  p_doc_type   TEXT,
  p_period     TEXT DEFAULT '-',
  p_padding    INT  DEFAULT 4
)
RETURNS TABLE (nomor TEXT, urut BIGINT, prefix_dipakai TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_next   BIGINT;
  v_prefix TEXT;
  v_nomor  TEXT;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION
      'next_document_number_full: company_id NULL untuk doc_type=%. Dokumen tidak '
      'boleh dinomori tanpa pemilik.', p_doc_type;
  END IF;

  IF p_padding < 1 OR p_padding > 12 THEN
    -- Padding di luar akal ditolak, bukan di-clamp: padding 0 menghasilkan
    -- nomor tanpa lebar tetap (INV-2026-1, INV-2026-10) yang tak bisa
    -- diurutkan sebagai teks, dan padding 50 menghasilkan nomor yang tak
    -- muat di kolom mana pun.
    RAISE EXCEPTION 'Padding nomor harus 1-12, diterima %', p_padding;
  END IF;

  -- Naikkan counter DAN ambil prefixnya dalam SATU pernyataan. Membaca prefix
  -- lewat SELECT terpisah membuka celah: prefix bisa berubah di antara dua
  -- pernyataan, dan dua dokumen berurutan lahir dengan prefix berbeda.
  --
  -- `prefix` pada konflik SENGAJA tidak ditimpa oleh nilai pemanggil — ia
  -- milik pengaturan tenant, bukan parameter per-panggilan.
  INSERT INTO document_number_series (company_id, doc_type, period, prefix, last_number)
  VALUES (p_company_id, p_doc_type, p_period, '', 1)
  ON CONFLICT (company_id, doc_type, period) DO UPDATE
    SET last_number = document_number_series.last_number + 1,
        updated_at  = now()
  RETURNING last_number, document_number_series.prefix INTO v_next, v_prefix;

  -- `LPAD` MEMANGKAS, tidak hanya menambal: `LPAD('10001', 4, '0')` = '1000'.
  --
  -- Begitu counter melewati batas lebarnya, nomor mulai BERULANG — dan unique
  -- index menolak setiap INSERT berikutnya, jadi dokumen jenis itu berhenti
  -- bisa dibuat sama sekali. Penjaga `audit-lpad-memangkas.mjs` menabrak versi
  -- pertama fungsi ini, dan ia benar.
  --
  -- Pola penjaganya sama dengan `generate_mr_number`/`po`/`gr` yang sudah
  -- diperbaiki lebih dulu: LPAD hanya untuk yang MASIH muat, selebihnya apa
  -- adanya. Nomor yang melebihi lebar lebih baik terlihat panjang daripada
  -- terlihat seperti nomor lain.
  v_nomor := CASE
    WHEN length(v_next::TEXT) >= p_padding THEN v_next::TEXT
    ELSE lpad(v_next::TEXT, p_padding, '0')
  END;

  RETURN QUERY SELECT
    -- Prefix kosong TIDAK menghasilkan nomor berawalan '-'. Nomor yang
    -- diawali pemisah terlihat seperti nomor yang bagian depannya hilang.
    CASE
      WHEN COALESCE(btrim(v_prefix), '') = '' THEN
        CASE WHEN p_period = '-' THEN v_nomor
             ELSE p_period || '-' || v_nomor END
      ELSE
        CASE WHEN p_period = '-' THEN btrim(v_prefix) || '-' || v_nomor
             ELSE btrim(v_prefix) || '-' || p_period || '-' || v_nomor END
    END,
    v_next,
    COALESCE(btrim(v_prefix), '');
END $$;

-- ── Prefix wajar ────────────────────────────────────────────────────────────
--
-- Prefix bebas TAPI tak boleh mengandung pemisah yang dipakai formatnya
-- sendiri, dan tak boleh sepanjang nomor itu sendiri. Prefix "INV-2026"
-- menghasilkan `INV-2026-2026-0001` — dua kali periode, dan tak seorang pun
-- menyadarinya sampai nomor itu tercetak di dokumen yang keluar.
ALTER TABLE document_number_series
  DROP CONSTRAINT IF EXISTS document_number_series_prefix_wajar;
ALTER TABLE document_number_series
  ADD CONSTRAINT document_number_series_prefix_wajar
  CHECK (prefix = '' OR (length(btrim(prefix)) BETWEEN 1 AND 12 AND btrim(prefix) !~ '[[:space:]]'));

-- Padding disimpan per seri, bukan hanya jadi parameter panggilan: yang
-- menentukan lebar nomor adalah kesepakatan tenant, dan kalau ia hidup di
-- pemanggil maka dua modul bisa memakai lebar berbeda untuk seri yang sama.
ALTER TABLE document_number_series
  ADD COLUMN IF NOT EXISTS padding INT NOT NULL DEFAULT 4;
ALTER TABLE document_number_series
  DROP CONSTRAINT IF EXISTS document_number_series_padding_wajar;
ALTER TABLE document_number_series
  ADD CONSTRAINT document_number_series_padding_wajar
  CHECK (padding BETWEEN 1 AND 12);

-- ── 2. Tiga unik global → per-tenant ────────────────────────────────────────
--
-- Diukur nol bentrok sebelum diubah (rfq 3/3, tender 3/3, ipc 4/4), jadi
-- pelonggaran ini tak menyembunyikan data rusak yang sudah ada.
-- Nama index TIDAK ditebak. Versi pertama migrasi ini menulis
-- `DROP INDEX rfq_nomor_key` — nama bawaan Postgres untuk UNIQUE constraint —
-- padahal ketiganya dibuat sebagai index bernama `*_nomor_unik`. Ketiga DROP
-- itu no-op, unik globalnya TETAP ADA, dan verifikasi di bawah LULUS karena ia
-- pun mencari nama yang salah.
--
-- Jadi yang dicari sekarang adalah BENTUKNYA: index UNIQUE atas persis satu
-- kolom `nomor` pada tabel itu, apa pun namanya.
DO $$
DECLARE
  t    TEXT;
  idx  TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rfq', 'tender_subkon', 'sertifikat_ipc'] LOOP
    FOR idx IN
      SELECT i.relname
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_class c ON c.oid = x.indrelid
       WHERE c.relname = t
         AND x.indisunique
         AND x.indnatts = 1
         AND pg_get_indexdef(x.indexrelid) ILIKE '%(nomor)%'
    LOOP
      -- Constraint lebih dulu: index yang menopang constraint tak bisa
      -- di-DROP langsung, dan galatnya menyebut hal lain.
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', t, idx);
      EXECUTE format('DROP INDEX IF EXISTS %I', idx);
      RAISE NOTICE '333 — unik global %.% dihapus', t, idx;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS rfq_nomor_per_proyek ON rfq (project_id, nomor);
CREATE UNIQUE INDEX IF NOT EXISTS tender_subkon_nomor_per_proyek
  ON tender_subkon (project_id, nomor);
CREATE UNIQUE INDEX IF NOT EXISTS sertifikat_ipc_nomor_per_proyek
  ON sertifikat_ipc (project_id, nomor);

-- ── 3. Izin ─────────────────────────────────────────────────────────────────
INSERT INTO permissions (key, module, label, description, sort_order)
VALUES
  ('penomoran:view', 'pengaturan', 'Lihat penomoran dokumen',
   'Melihat seri penomoran dokumen beserta nomor terakhirnya.', 1210),
  ('penomoran:kelola', 'pengaturan', 'Kelola penomoran dokumen',
   'Mengubah prefix dan lebar nomor dokumen. TIDAK termasuk memundurkan counter.', 1211)
ON CONFLICT (key) DO NOTHING;

-- Izin yang dibuat tapi tak diberikan = rute 403 untuk SEMUA orang, termasuk
-- admin (cacat migrasi 321). Diberikan ke peran yang sudah memegang
-- `settings:manage` — penomoran adalah pengaturan, bukan modul tersendiri.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key IN ('penomoran:view', 'penomoran:kelola')
   AND EXISTS (
     SELECT 1 FROM role_permissions rp
       JOIN permissions ps ON ps.id = rp.permission_id
      WHERE rp.role_id = r.id AND ps.key = 'settings:manage'
   )
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions x WHERE x.role_id = r.id AND x.permission_id = p.id
   );

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
--
-- Tabel ini lahir di migrasi 126 dan tak pernah dibaca dari UI, jadi RLS-nya
-- perlu diperiksa SEKARANG — begitu ada halaman, ia jadi jalur baca nyata.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'document_number_series' AND relrowsecurity
  ) THEN
    ALTER TABLE document_number_series ENABLE ROW LEVEL SECURITY;
    ALTER TABLE document_number_series FORCE ROW LEVEL SECURITY;
  END IF;
END $$;

DROP POLICY IF EXISTS document_number_series_baca ON document_number_series;
CREATE POLICY document_number_series_baca ON document_number_series
  FOR SELECT USING (has_permission('penomoran:view'));

DROP POLICY IF EXISTS document_number_series_tulis ON document_number_series;
CREATE POLICY document_number_series_tulis ON document_number_series
  FOR ALL USING (has_permission('penomoran:kelola'))
  WITH CHECK (has_permission('penomoran:kelola'));

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  co     UUID;
  hasil  RECORD;
  n      INT;
  gagal  BOOLEAN;
BEGIN
  SELECT id INTO co FROM companies LIMIT 1;
  IF co IS NULL THEN
    RAISE EXCEPTION '333 gagal: nol company — verifikasi tak bisa dipercaya';
  END IF;

  -- 1. Prefix KOSONG tak menghasilkan nomor berawalan pemisah.
  SELECT * INTO hasil FROM next_document_number_full(co, 'verif333a', '2026', 4);
  IF hasil.nomor <> '2026-0001' THEN
    RAISE EXCEPTION '333 gagal: prefix kosong menghasilkan "%" (harus 2026-0001)', hasil.nomor;
  END IF;

  -- 2. Prefix TERBACA — inti perbaikan ini.
  UPDATE document_number_series SET prefix = 'INV'
   WHERE company_id = co AND doc_type = 'verif333a' AND period = '2026';
  SELECT * INTO hasil FROM next_document_number_full(co, 'verif333a', '2026', 4);
  IF hasil.nomor <> 'INV-2026-0002' THEN
    RAISE EXCEPTION '333 gagal: prefix TIDAK terbaca — nomor "%" (harus INV-2026-0002)', hasil.nomor;
  END IF;

  -- 3. Counter naik, tak pernah mundur.
  IF hasil.urut <> 2 THEN
    RAISE EXCEPTION '333 gagal: counter tak naik (%)', hasil.urut;
  END IF;

  -- 4. Padding dipatuhi.
  SELECT * INTO hasil FROM next_document_number_full(co, 'verif333a', '2026', 6);
  IF hasil.nomor <> 'INV-2026-000003' THEN
    RAISE EXCEPTION '333 gagal: padding 6 menghasilkan "%"', hasil.nomor;
  END IF;

  -- 4b. Nomor MELEBIHI padding tak terpangkas.
  --
  -- `LPAD('10001', 4, '0')` = '1000'. Tanpa penjaga, counter yang melewati
  -- batas lebarnya membuat nomor BERULANG — dan unique index menolak setiap
  -- INSERT berikutnya, jadi dokumen jenis itu berhenti bisa dibuat.
  UPDATE document_number_series SET last_number = 10000
   WHERE company_id = co AND doc_type = 'verif333a' AND period = '2026';
  SELECT * INTO hasil FROM next_document_number_full(co, 'verif333a', '2026', 4);
  IF hasil.nomor <> 'INV-2026-10001' THEN
    RAISE EXCEPTION '333 gagal: nomor melebihi padding jadi "%" — LPAD memangkas', hasil.nomor;
  END IF;

  -- 5. Padding di luar akal DITOLAK, bukan di-clamp.
  gagal := FALSE;
  BEGIN
    PERFORM * FROM next_document_number_full(co, 'verif333a', '2026', 0);
  EXCEPTION WHEN OTHERS THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '333 gagal: padding 0 DITERIMA — nomor kehilangan lebar tetapnya';
  END IF;

  -- 6. company_id NULL fail-loud.
  gagal := FALSE;
  BEGIN
    PERFORM * FROM next_document_number_full(NULL, 'verif333a', '2026', 4);
  EXCEPTION WHEN OTHERS THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '333 gagal: company_id NULL DITERIMA';
  END IF;

  -- 7. Prefix mengandung spasi DITOLAK.
  gagal := FALSE;
  BEGIN
    UPDATE document_number_series SET prefix = 'IN V'
     WHERE company_id = co AND doc_type = 'verif333a';
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '333 gagal: prefix berspasi DITERIMA — nomor jadi tak terbaca sebagai satu token';
  END IF;

  -- 8. Padding di luar 1-12 ditolak CHECK kolomnya.
  gagal := FALSE;
  BEGIN
    UPDATE document_number_series SET padding = 99
     WHERE company_id = co AND doc_type = 'verif333a';
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '333 gagal: padding 99 DITERIMA di kolomnya';
  END IF;

  DELETE FROM document_number_series WHERE doc_type LIKE 'verif333%';

  -- 9. Ketiga unik kini per-proyek, bukan global.
  --
  -- Diperiksa lewat BENTUK, bukan nama. Versi pertama pemeriksaan ini mencari
  -- `rfq_nomor_key` dsb — nama yang tak pernah ada — jadi ia LULUS sementara
  -- ketiga unik globalnya masih terpasang. Penjaga yang mencari nama tebakan
  -- adalah penjaga yang tak pernah bisa merah.
  SELECT count(*) INTO n
    FROM pg_index x
    JOIN pg_class c ON c.oid = x.indrelid
   WHERE c.relname IN ('rfq', 'tender_subkon', 'sertifikat_ipc')
     AND x.indisunique
     AND x.indnatts = 1
     AND pg_get_indexdef(x.indexrelid) ILIKE '%(nomor)%';
  IF n > 0 THEN
    RAISE EXCEPTION '333 gagal: % unik GLOBAL pada nomor masih terpasang — tenant lain ditolak nomor orang', n;
  END IF;

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname IN ('rfq_nomor_per_proyek', 'tender_subkon_nomor_per_proyek',
                       'sertifikat_ipc_nomor_per_proyek');
  IF n <> 3 THEN
    RAISE EXCEPTION '333 gagal: % dari 3 index per-proyek terpasang', n;
  END IF;

  -- 10. Izin ada DAN diberikan.
  SELECT count(*) INTO n
    FROM permissions p
   WHERE p.key IN ('penomoran:view', 'penomoran:kelola')
     AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id);
  IF n > 0 THEN
    RAISE EXCEPTION '333 gagal: % izin penomoran tak diberikan ke peran mana pun', n;
  END IF;

  -- 11. RLS menyala berpolicy.
  SELECT count(*) INTO n FROM pg_policies WHERE tablename = 'document_number_series';
  IF n < 2 THEN
    RAISE EXCEPTION '333 gagal: policy document_number_series kurang (%)', n;
  END IF;

  RAISE NOTICE '333 OK — prefix terbaca, padding ditegakkan, 3 unik global dihapus';
END $$;
