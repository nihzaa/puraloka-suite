-- ============================================================
-- 135 — T6: penomoran dokumen per company, berbasis counter
--
-- Mengganti pola `COUNT(*) + 1` (migrasi 041) dengan counter transaksional
-- di `document_number_series` (tabelnya lahir di migrasi 126, menunggu tahap ini).
--
-- ------------------------------------------------------------
-- EMPAT MASALAH, SEMUANYA DIBUKTIKAN DI DEV — bukan kekhawatiran teoretis
-- ------------------------------------------------------------
--
-- 1. NOMOR BERLANJUT LINTAS COMPANY. `COUNT(*)` tak menyaring company sama
--    sekali. Terbukti: company A dapat MR-2026-006, company B berikutnya dapat
--    MR-2026-007 — bukan mulai dari 001. Selain salah secara akuntansi, itu
--    membocorkan informasi: dari lompatan nomornya, tenant B bisa menyimpulkan
--    berapa banyak dokumen yang dibuat tenant A.
--
-- 2. NOMOR DIPAKAI ULANG SETELAH PENGHAPUSAN. `COUNT(*)` menghitung baris yang
--    ADA, bukan yang PERNAH ada. Terbukti: MR-2026-009 dibuat, dihapus, lalu
--    MR berikutnya mendapat MR-2026-009 lagi. Untuk dokumen yang keluar ke
--    pihak ketiga (PO ke supplier, invoice ke klien) nomor kembar bukan
--    ketidakrapian — itu cacat audit.
--
-- 3. RENTAN BALAPAN. Dua INSERT bersamaan sama-sama membaca COUNT yang sama dan
--    menghasilkan nomor yang sama; yang kalah gagal dengan unique violation.
--    Hari ini jarang terlihat karena beban rendah, tapi ia adalah kegagalan yang
--    muncul justru saat sistem sedang sibuk.
--
-- 4. CONSTRAINT UNIK MASIH GLOBAL. `UNIQUE (mr_number)` — tanpa company.
--    Ini yang membuat tiga masalah di atas TIDAK BISA diperbaiki hanya dengan
--    mengganti generatornya: begitu penomoran benar-benar per-company, dua
--    tenant WAJIB boleh sama-sama punya MR-2026-001, dan constraint global
--    justru akan menolaknya. Jadi constraint-nya ikut diubah di sini.
--
-- ------------------------------------------------------------
-- YANG TIDAK DIKLAIM
-- ------------------------------------------------------------
-- `COUNT(*)` juga sering disebut lambat. Diukur di dev: 0,06 ms — jadi hari ini
-- BUKAN masalah performa, dan tidak dijadikan alasan di sini. Ia baru relevan
-- setelah puluhan ribu dokumen. Perbaikan ini soal kebenaran, bukan kecepatan.
--
-- ------------------------------------------------------------
-- MEKANISME
-- ------------------------------------------------------------
-- `next_document_number()` melakukan UPSERT + `RETURNING last_number` dalam satu
-- pernyataan. Baris counter-nya terkunci oleh transaksi itu sendiri, jadi dua
-- transaksi bersamaan mengantre dan mendapat nomor berbeda — tanpa perlu
-- advisory lock atau retry di aplikasi.
--
-- Counter TIDAK PERNAH mundur saat dokumen dihapus. Itu disengaja: nomor
-- dokumen yang sudah terbit tak boleh lahir kembali, bahkan kalau dokumennya
-- dibatalkan. Lubang pada urutan nomor adalah perilaku yang benar.
--
-- MR/PO/GR ada di kategori C (tak punya `company_id` sendiri) sehingga
-- company-nya diambil lewat `project_company_id(project_id)` — helper yang sama
-- dipakai policy RLS T5a, jadi hanya ada SATU definisi "punya siapa dokumen ini".
-- ============================================================

-- ------------------------------------------------------------
-- 1. Pengambil nomor berikutnya.
--
-- SECURITY DEFINER: menulis ke `document_number_series` yang ber-RLS. Tanpa ini
-- generator akan gagal begitu service_role dilepas (T5c) — kegagalan yang muncul
-- di tahap paling tidak boleh gagal.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_document_number(
  p_company_id UUID,
  p_doc_type   TEXT,
  p_period     TEXT DEFAULT '-',
  p_prefix     TEXT DEFAULT ''
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_next BIGINT;
BEGIN
  IF p_company_id IS NULL THEN
    -- Fail-loud. Menomori dokumen tanpa tahu pemiliknya berarti menaruhnya di
    -- urutan milik tenant lain — persis masalah yang migrasi ini tutup.
    RAISE EXCEPTION
      'next_document_number: company_id NULL untuk doc_type=%. Dokumen tidak '
      'boleh dinomori tanpa pemilik.', p_doc_type;
  END IF;

  INSERT INTO document_number_series (company_id, doc_type, period, prefix, last_number)
  VALUES (p_company_id, p_doc_type, p_period, p_prefix, 1)
  ON CONFLICT (company_id, doc_type, period) DO UPDATE
    SET last_number = document_number_series.last_number + 1,
        updated_at  = now()
  RETURNING last_number INTO v_next;

  RETURN v_next;
END;
$$;

COMMENT ON FUNCTION next_document_number(UUID, TEXT, TEXT, TEXT) IS
  'T6: nomor urut berikutnya per (company, jenis dokumen, periode). Aman '
  'terhadap INSERT bersamaan (baris counter terkunci transaksi) dan tidak '
  'pernah memakai ulang nomor dokumen yang dihapus.';

-- ------------------------------------------------------------
-- 2. Generator MR/PO/GR — memakai counter, di-scope company proyeknya.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_mr_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tahun   TEXT := TO_CHAR(NOW(), 'YYYY');
  v_company UUID := project_company_id(NEW.project_id);
BEGIN
  NEW.mr_number := 'MR-' || v_tahun || '-' ||
    LPAD(next_document_number(v_company, 'mr', v_tahun)::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tahun   TEXT := TO_CHAR(NOW(), 'YYYY');
  v_company UUID := project_company_id(NEW.project_id);
BEGIN
  NEW.po_number := 'PO-' || v_tahun || '-' ||
    LPAD(next_document_number(v_company, 'po', v_tahun)::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION generate_gr_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tahun   TEXT := TO_CHAR(NOW(), 'YYYY');
  v_company UUID := project_company_id(NEW.project_id);
BEGIN
  NEW.gr_number := 'GR-' || v_tahun || '-' ||
    LPAD(next_document_number(v_company, 'gr', v_tahun)::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 3. Selaraskan counter dengan nomor tertinggi yang SUDAH ADA.
--
-- Tanpa langkah ini counter mulai dari 0 sementara dokumen lama sudah memakai
-- 001-00N, sehingga dokumen berikutnya bertabrakan dengan yang lama. Diambil
-- MAX dari nomor existing, bukan COUNT — supaya nomor yang pernah terpakai lalu
-- dihapus tidak lahir kembali (masalah 2 di atas).
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT 'mr' AS jenis, project_company_id(project_id) AS comp,
           TO_CHAR(created_at, 'YYYY') AS periode,
           MAX(NULLIF(regexp_replace(mr_number, '^.*-', ''), '')::BIGINT) AS tertinggi
      FROM material_requests WHERE mr_number ~ '^MR-\d{4}-\d+$'
     GROUP BY 2, 3
    UNION ALL
    SELECT 'po', project_company_id(project_id), TO_CHAR(created_at, 'YYYY'),
           MAX(NULLIF(regexp_replace(po_number, '^.*-', ''), '')::BIGINT)
      FROM purchase_orders WHERE po_number ~ '^PO-\d{4}-\d+$'
     GROUP BY 2, 3
    UNION ALL
    SELECT 'gr', project_company_id(project_id), TO_CHAR(created_at, 'YYYY'),
           MAX(NULLIF(regexp_replace(gr_number, '^.*-', ''), '')::BIGINT)
      FROM goods_receipts WHERE gr_number ~ '^GR-\d{4}-\d+$'
     GROUP BY 2, 3
    UNION ALL
    -- invoice: periode per BULAN (prefix/YYYY/MM/NNN) — format yang dipakai kode
    -- sekarang.
    SELECT 'invoice', project_company_id(project_id),
           regexp_replace(invoice_number, '^.*/(\d{4})/(\d{2})/\d+$', '\1-\2'),
           MAX(NULLIF(regexp_replace(invoice_number, '^.*/', ''), '')::BIGINT)
      FROM invoices WHERE invoice_number ~ '/\d{4}/\d{2}/\d+$'
     GROUP BY 2, 3
    UNION ALL
    -- invoice format LAMA: prefix/YYYY/NNN (tahunan, tanpa bulan). Seluruh 26
    -- baris di dev berbentuk ini — peninggalan sebelum format diubah jadi
    -- bulanan. Diikutkan supaya counter bulan mana pun di tahun itu tidak mulai
    -- dari 001 dan bertabrakan dengan nomor lama yang masih beredar.
    --
    -- Nomor tertingginya disalin ke SETIAP bulan di tahun tsb: lebih aman
    -- melompati nomor daripada menerbitkan nomor kembar (lubang pada urutan =
    -- benar; kembar = cacat audit).
    SELECT 'invoice', project_company_id(i.project_id),
           regexp_replace(i.invoice_number, '^.*/(\d{4})/\d+$', '\1') || '-' ||
             LPAD(b::TEXT, 2, '0'),
           MAX(NULLIF(regexp_replace(i.invoice_number, '^.*/', ''), '')::BIGINT)
      FROM invoices i CROSS JOIN generate_series(1, 12) AS b
     WHERE i.invoice_number ~ '/\d{4}/\d+$'
       AND i.invoice_number !~ '/\d{4}/\d{2}/\d+$'
     GROUP BY 2, 3
  LOOP
    CONTINUE WHEN r.comp IS NULL OR r.tertinggi IS NULL;  -- dokumen yatim: lewati
    INSERT INTO document_number_series (company_id, doc_type, period, last_number)
    VALUES (r.comp, r.jenis, r.periode, r.tertinggi)
    ON CONFLICT (company_id, doc_type, period) DO UPDATE
      SET last_number = GREATEST(document_number_series.last_number, EXCLUDED.last_number);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4. Constraint unik: global → per company.
--
-- WAJIB, bukan kerapian: dengan penomoran per-company, dua tenant HARUS boleh
-- sama-sama punya MR-2026-001. `UNIQUE (mr_number)` global akan menolaknya, dan
-- perbaikan di atas jadi mustahil dipakai.
--
-- Dipakai index unik parsial atas ekspresi `project_company_id(...)`? TIDAK —
-- Postgres melarang index atas fungsi yang tidak IMMUTABLE. Karena itu keunikan
-- ditegakkan lewat (project_id, nomor) untuk MR/PO/GR: project_id sudah menentukan
-- company secara unik, jadi ini setara "unik per company" tanpa perlu kolom baru
-- maupun fungsi IMMUTABLE yang menipu.
-- ------------------------------------------------------------
ALTER TABLE material_requests DROP CONSTRAINT IF EXISTS material_requests_mr_number_key;
ALTER TABLE purchase_orders   DROP CONSTRAINT IF EXISTS purchase_orders_po_number_key;
ALTER TABLE goods_receipts    DROP CONSTRAINT IF EXISTS goods_receipts_gr_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mr_number_per_project
  ON material_requests (project_id, mr_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_po_number_per_project
  ON purchase_orders (project_id, po_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gr_number_per_project
  ON goods_receipts (project_id, gr_number);

-- invoices: sama, tapi tabelnya kategori C lewat project_id juga.
--
-- Kenapa invoice ikut di sini padahal generatornya di aplikasi (finance.ts),
-- bukan trigger: cacatnya identik. Query MAX-nya memakai klien MENTAH sehingga
-- memindai invoice SELURUH company; yang menyamarkannya hanya prefix per-company
-- — dan default prefix untuk company baru SAMA ('INV'). Jadi tenant kedua akan
-- melanjutkan penomoran tenant pertama, lalu ditolak `UNIQUE (invoice_number)`
-- global. Keduanya diperbaiki: aplikasi memakai counter, constraint jadi
-- per-project.
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_number_per_project
  ON invoices (project_id, invoice_number);

-- ------------------------------------------------------------
-- 5. Verifikasi: tak boleh ada nomor kembar DI DALAM satu company.
--
-- Index di atas menjaga per-project (lebih ketat dari yang diperlukan untuk
-- keunikan, lebih longgar dari yang diinginkan untuk kerapian). Cek ini
-- memastikan keadaan SEKARANG memang bersih per-company — kalau data lama sudah
-- terlanjur punya kembar, lebih baik migrasinya batal dan ketahuan.
-- ------------------------------------------------------------
DO $$
DECLARE v_kembar INT;
BEGIN
  SELECT count(*) INTO v_kembar FROM (
    SELECT project_company_id(project_id) comp, mr_number
      FROM material_requests GROUP BY 1, 2 HAVING count(*) > 1
    UNION ALL
    SELECT project_company_id(project_id), po_number
      FROM purchase_orders GROUP BY 1, 2 HAVING count(*) > 1
    UNION ALL
    SELECT project_company_id(project_id), gr_number
      FROM goods_receipts GROUP BY 1, 2 HAVING count(*) > 1
  ) x;

  IF v_kembar > 0 THEN
    RAISE EXCEPTION
      '135: ada % nomor dokumen kembar di dalam company yang sama. Perbaiki '
      'datanya dulu — penomoran baru tak boleh menutupi nomor kembar lama.', v_kembar;
  END IF;
  RAISE NOTICE '135: penomoran per-company aktif; counter tersinkron.';
END $$;
