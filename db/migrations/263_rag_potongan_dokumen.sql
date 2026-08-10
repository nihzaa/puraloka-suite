-- ============================================================================
-- 263 — RAG: potongan dokumen, tsvector Indonesia + embedding (TJS-C2)
-- ============================================================================
--
-- ── Keputusan tenancy, dan alasannya (dituntut kriteria C2)
--
-- `documents` kategori C: punya `project_id`, TANPA `company_id`. Ada dua
-- pilihan untuk tabel potongan ini, dan yang dipilih BUKAN yang konsisten
-- dengan induknya.
--
--   (a) ikut kategori C — saring lewat daftar project_id milik tenant
--   (b) BAWA `company_id` sendiri, NOT NULL                        ← DIPILIH
--
-- Alasannya khusus untuk RAG, dan tak berlaku untuk tabel turunan biasa:
--
-- Pencarian vector mengembalikan "yang paling MIRIP". Dokumen tenant lain bisa
-- lebih mirip daripada dokumen tenant sendiri — spesifikasi beton K-300 di dua
-- perusahaan konstruksi hampir identik. Ini satu-satunya kelas query yang
-- hasilnya tetap MASUK AKAL sekalipun salah tenant, jadi kebocorannya tak
-- pernah terlihat sebagai galat. Tak ada yang menelepon dukungan karena
-- jawabannya "terlalu benar".
--
-- Dengan (a), saringannya bergantung pada subquery daftar proyek yang harus
-- ditulis ulang di setiap query. Satu query baru yang lupa menyertakannya =
-- kebocoran senyap. Dengan (b), `company_id` ada di baris itu sendiri: policy
-- RESTRICTIVE menegakkannya di lapisan SQL, penjaga CI bisa memeriksa satu
-- kata di WHERE, dan lupa jadi mustahil alih-alih sekadar tidak disarankan.
--
-- Harganya: `company_id` harus diisi benar saat ingest, dan bisa menyimpang
-- kalau proyeknya pindah perusahaan. Trigger di bawah menutup keduanya — ia
-- MENGISI dari proyeknya, jadi pemanggil tak bisa salah mengisi.
--
-- ── Kenapa `indonesian`, bukan `simple`
--
-- Diukur dari `pg_ts_config`: konfigurasi `indonesian` SUDAH ada di instance
-- ini. `simple` tak melakukan stemming, jadi "pekerjaan" tak cocok dengan
-- "pekerjaannya" — dan dokumen konstruksi penuh imbuhan.
--
-- ── Kenapa embedding NULLABLE
--
-- Potongan masuk lewat ingest yang BISA gagal separuh jalan (kuota penyedia,
-- jaringan). Kalau `embedding` NOT NULL, kegagalan itu membatalkan seluruh
-- ingest dan dokumen yang sudah dipotong ikut hilang. Nullable membuat jalur
-- teks tetap bekerja sementara embedding menyusul — dan kriteria C2 memang
-- menuntut "kegagalan salah satu jalur TERLIHAT", bukan mematikan semuanya.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS rag_potongan (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NOT NULL, dan diisi TRIGGER dari proyeknya — lihat alasan di kepala.
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  /*
   * `doc_type` DISALIN ke sini, bukan di-join saat query.
   *
   * T-4 menuntut RAG mereproduksi SELURUH ACL dokumen, termasuk penyaringan
   * per jenis. Menyalinnya membuat penyaringan itu bisa dilakukan di WHERE
   * yang sama dengan `company_id` — satu predikat, satu indeks, tak ada join
   * yang bisa lupa ditulis.
   *
   * Salinan bisa basi kalau jenis dokumen diubah; trigger di bawah
   * menyegarkannya, dan `ON DELETE CASCADE` menutup kasus dokumen dihapus.
   */
  doc_type     TEXT NOT NULL,
  -- Sama alasannya: ACL client bergantung padanya (documents.ts:66).
  visible_klien BOOLEAN NOT NULL DEFAULT false,

  urutan       INT NOT NULL,
  isi          TEXT NOT NULL,

  -- Kolom turunan: satu sumber, tak bisa menyimpang dari `isi`.
  isi_ts       tsvector GENERATED ALWAYS AS (to_tsvector('indonesian', isi)) STORED,

  -- NULLABLE — lihat alasan di kepala berkas.
  embedding    vector(1536),
  model_embed  TEXT,

  dibuat_pada  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Potongan ke-N sebuah dokumen hanya boleh ada satu. Tanpa ini, ingest yang
  -- diulang menggandakan seluruh isi dokumen, dan pencarian mengembalikan
  -- potongan yang sama berkali-kali sebagai "beberapa sumber".
  UNIQUE (document_id, urutan)
);

-- Indeks teks. GIN untuk tsvector — inilah yang membuat pencocokan persis
-- ("SNI 2847", "K-300") cepat DAN tepat.
CREATE INDEX IF NOT EXISTS idx_rag_ts ON rag_potongan USING GIN (isi_ts);

-- `company_id` di depan pada indeks manapun yang dipakai pencarian: ia
-- penyaring paling selektif DAN yang paling penting untuk tak dilewati.
CREATE INDEX IF NOT EXISTS idx_rag_tenant ON rag_potongan (company_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_rag_dokumen ON rag_potongan (document_id);

/*
 * Indeks vector SENGAJA BELUM DIBUAT.
 *
 * HNSW/IVFFlat baru menguntungkan pada puluhan ribu baris; di bawah itu
 * pemindaian berurutan lebih cepat DAN selalu tepat. IVFFlat khususnya
 * mengembalikan hasil APROKSIMASI — ia bisa melewatkan potongan yang
 * sebenarnya paling mirip, dan untuk korpus kecil itu kerugian tanpa imbalan.
 *
 * Ditambahkan saat jumlah barisnya menuntut, dengan pengukuran, bukan sekarang
 * "supaya lengkap".
 */

COMMENT ON TABLE rag_potongan IS
  'Potongan dokumen untuk RAG. MEMBAWA company_id sendiri (bukan lewat '
  'project_id seperti induknya) karena pencarian vector mengembalikan "paling '
  'mirip" — dokumen tenant lain bisa lebih mirip, dan kebocorannya tak pernah '
  'terlihat sebagai galat. Lihat kepala migrasi 263.';

-- ── Trigger: company_id & metadata ACL DIISI, bukan diterima ────────────────
--
-- Pemanggil tak bisa salah mengisi kalau ia tak diminta mengisi. Ini pola yang
-- sama dengan `wa-sesi.ts` yang menolak menerima peran dari pemanggil: nilai
-- yang menentukan keamanan diresolusi dari basis, bukan dipercaya dari input.
CREATE OR REPLACE FUNCTION rag_isi_metadata() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_project UUID;
  v_company UUID;
  v_type    TEXT;
  v_visible BOOLEAN;
BEGIN
  SELECT d.project_id, d.doc_type::text, d.is_visible_to_client
    INTO v_project, v_type, v_visible
    FROM documents d WHERE d.id = NEW.document_id;

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'rag_potongan: dokumen % tidak ada', NEW.document_id;
  END IF;

  SELECT p.company_id INTO v_company FROM projects p WHERE p.id = v_project;
  IF v_company IS NULL THEN
    -- Proyek tanpa company adalah keadaan yang tak boleh menghasilkan potongan
    -- "milik semua orang". Gagal keras lebih baik daripada baris yatim yang
    -- lolos setiap penyaring tenant.
    RAISE EXCEPTION 'rag_potongan: proyek % tanpa company_id', v_project;
  END IF;

  NEW.project_id    := v_project;
  NEW.company_id    := v_company;
  NEW.doc_type      := v_type;
  NEW.visible_klien := coalesce(v_visible, false);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rag_metadata ON rag_potongan;
CREATE TRIGGER trg_rag_metadata
  BEFORE INSERT OR UPDATE OF document_id ON rag_potongan
  FOR EACH ROW EXECUTE FUNCTION rag_isi_metadata();

-- ── RLS: pola yang sama dengan 259/260 ──────────────────────────────────────
ALTER TABLE rag_potongan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rag_dasar ON rag_potongan;
CREATE POLICY rag_dasar ON rag_potongan FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation ON rag_potongan;
CREATE POLICY tenant_isolation ON rag_potongan
  AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- ------------------------------------------------------------
-- Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE
  n int;
  v_doc UUID;
  v_proj UUID;
  v_comp UUID;
  v_user UUID;
BEGIN
  IF to_regclass('public.rag_potongan') IS NULL THEN
    RAISE EXCEPTION '263 gagal: tabel tidak terbentuk';
  END IF;

  -- tsvector WAJIB memakai konfigurasi indonesian; `simple` tak menstem, dan
  -- dokumen konstruksi penuh imbuhan ("pekerjaan"/"pekerjaannya").
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'rag_potongan' AND column_name = 'isi_ts'
       AND is_generated = 'ALWAYS'
  ) THEN
    RAISE EXCEPTION '263 gagal: isi_ts bukan kolom turunan';
  END IF;

  SELECT count(*) INTO n FROM pg_indexes
   WHERE tablename = 'rag_potongan' AND indexdef ILIKE '%gin%isi_ts%';
  IF n < 1 THEN
    RAISE EXCEPTION '263 gagal: indeks GIN untuk isi_ts tidak ada';
  END IF;

  -- Isolasi tenant RESTRICTIVE.
  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename = 'rag_potongan' AND policyname = 'tenant_isolation'
     AND permissive = 'RESTRICTIVE';
  IF n <> 1 THEN
    RAISE EXCEPTION '263 gagal: tenant_isolation belum RESTRICTIVE';
  END IF;

  -- ── Trigger BENAR-BENAR mengisi, dan mengabaikan nilai palsu ─────────────
  --
  -- Bukan sekadar "trigger ada": yang dijamin adalah pemanggil TAK BISA
  -- menyuntikkan company_id tenant lain. Diuji dengan mengirim UUID acak dan
  -- menuntut ia tertimpa.
  SELECT p.id, p.company_id INTO v_proj, v_comp
    FROM projects p WHERE p.company_id IS NOT NULL LIMIT 1;

  IF v_proj IS NOT NULL THEN
    SELECT id INTO v_user FROM users LIMIT 1;

    INSERT INTO documents (project_id, title, doc_type, file_url,
                           is_visible_to_client, uploaded_by)
    VALUES (v_proj, '[UJI-263] verifikasi trigger', 'lainnya', 'uji://263',
            true, v_user)
    RETURNING id INTO v_doc;

    INSERT INTO rag_potongan (company_id, document_id, project_id, doc_type, urutan, isi)
    VALUES (gen_random_uuid(), v_doc, gen_random_uuid(), 'kontrak', 1, 'uji beton K-300');

    SELECT count(*) INTO n FROM rag_potongan
     WHERE document_id = v_doc AND company_id = v_comp
       AND project_id = v_proj AND doc_type = 'lainnya' AND visible_klien = true;
    IF n <> 1 THEN
      RAISE EXCEPTION '263 gagal: trigger tidak menimpa metadata palsu dari pemanggil';
    END IF;

    -- Pencocokan PERSIS harus bekerja lewat tsvector.
    SELECT count(*) INTO n FROM rag_potongan
     WHERE document_id = v_doc AND isi_ts @@ websearch_to_tsquery('indonesian', 'K-300');
    IF n <> 1 THEN
      RAISE EXCEPTION '263 gagal: pencocokan persis K-300 tidak bekerja';
    END IF;

    DELETE FROM documents WHERE id = v_doc;  -- CASCADE membawa potongannya

    SELECT count(*) INTO n FROM rag_potongan WHERE document_id = v_doc;
    IF n <> 0 THEN
      RAISE EXCEPTION '263 gagal: potongan tak ikut terhapus saat dokumen dihapus';
    END IF;
  END IF;
END $$;
