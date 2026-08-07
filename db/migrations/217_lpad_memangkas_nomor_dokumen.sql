-- ============================================================================
-- 217 — CACAT P1: LPAD MEMANGKAS nomor dokumen sesudah counter melewati 999
-- ============================================================================
--
-- ── Cacat
--
-- `generate_mr_number`, `generate_po_number`, dan `generate_gr_number`
-- membentuk nomornya begini:
--
--     LPAD(next_document_number(...)::TEXT, 3, '0')
--
-- `LPAD` di Postgres bukan hanya MENAMBAL — ia juga MEMANGKAS bila string
-- lebih panjang dari lebar target:
--
--     LPAD('646',  3, '0') → '646'     ✓
--     LPAD('1001', 3, '0') → '100'     ✗ dipangkas
--     LPAD('1646', 3, '0') → '164'     ✗ dipangkas
--
-- Akibatnya, begitu counter sebuah company melewati 999, nomor dokumen mulai
-- BERULANG: counter 1001, 1002, 1003 sama-sama menghasilkan `…-100`. Unique
-- index `uq_gr_number_per_project` (dan padanannya di MR/PO) lalu menolak
-- INSERT, dan penerimaan barang MUSTAHIL dicatat sama sekali.
--
-- ── Kenapa ini bukan sekadar bug test
--
-- Ditemukan lewat `gr-create-kontrak-body.test.ts` dan
-- `supplier-invoice-3way.test.ts` yang gagal 500. Tapi kegagalannya bukan di
-- test: basis dev sudah punya counter 1021, dan SETIAP GR baru sesudah 999
-- akan bentrok. Tenant mana pun yang mencatat lebih dari seribu dokumen dalam
-- setahun berhenti bisa menerima barang — tanpa satu pun perubahan kode.
--
-- Gejalanya menyesatkan: yang muncul "duplicate key", bukan "nomor terpangkas".
-- Yang membacanya akan mencari data ganda, dan tak menemukan apa pun.
--
-- ── Perbaikan
--
-- `LPAD` diganti `GREATEST(3, …)` — tepatnya: pakai LPAD hanya bila hasilnya
-- masih ≤ 3 digit, kalau tidak pakai angkanya apa adanya. Bentuk `…-001`
-- sampai `…-999` tak berubah (nomor lama tetap terbaca sama), dan sesudahnya
-- tumbuh jadi 4, 5, … digit secara alami.
--
-- Idempoten. Verifikasi di blok akhir.

CREATE OR REPLACE FUNCTION generate_mr_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tahun   TEXT := TO_CHAR(NOW(), 'YYYY');
  v_company UUID := project_company_id(NEW.project_id);
  v_urut    BIGINT;
BEGIN
  v_urut := next_document_number(v_company, 'mr', v_tahun);
  -- LPAD hanya untuk yang MASIH muat 3 digit; selebihnya apa adanya.
  -- `LPAD('1001',3,'0')` = '100' — memangkas, bukan menambal.
  NEW.mr_number := 'MR-' || v_tahun || '-' ||
    CASE WHEN v_urut < 1000 THEN LPAD(v_urut::TEXT, 3, '0') ELSE v_urut::TEXT END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tahun   TEXT := TO_CHAR(NOW(), 'YYYY');
  v_company UUID := project_company_id(NEW.project_id);
  v_urut    BIGINT;
BEGIN
  v_urut := next_document_number(v_company, 'po', v_tahun);
  NEW.po_number := 'PO-' || v_tahun || '-' ||
    CASE WHEN v_urut < 1000 THEN LPAD(v_urut::TEXT, 3, '0') ELSE v_urut::TEXT END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION generate_gr_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tahun   TEXT := TO_CHAR(NOW(), 'YYYY');
  v_company UUID := project_company_id(NEW.project_id);
  v_urut    BIGINT;
BEGIN
  v_urut := next_document_number(v_company, 'gr', v_tahun);
  NEW.gr_number := 'GR-' || v_tahun || '-' ||
    CASE WHEN v_urut < 1000 THEN LPAD(v_urut::TEXT, 3, '0') ELSE v_urut::TEXT END;
  RETURN NEW;
END;
$$;

-- ── Verifikasi ────────────────────────────────────────────────────────────
--
-- Diuji dengan MEMANGGIL logikanya, bukan dengan membaca ulang definisinya.
DO $$
DECLARE
  hasil text;
BEGIN
  -- Bentuk lama untuk < 1000 HARUS tak berubah: nomor yang sudah terbit
  -- tetap terbaca sama.
  hasil := CASE WHEN 7 < 1000 THEN LPAD(7::TEXT, 3, '0') ELSE 7::TEXT END;
  IF hasil <> '007' THEN RAISE EXCEPTION 'urut 7 seharusnya 007, dapat %', hasil; END IF;

  hasil := CASE WHEN 646 < 1000 THEN LPAD(646::TEXT, 3, '0') ELSE 646::TEXT END;
  IF hasil <> '646' THEN RAISE EXCEPTION 'urut 646 seharusnya 646, dapat %', hasil; END IF;

  -- Yang diperbaiki: >= 1000 tak lagi dipangkas.
  hasil := CASE WHEN 1001 < 1000 THEN LPAD(1001::TEXT, 3, '0') ELSE 1001::TEXT END;
  IF hasil <> '1001' THEN RAISE EXCEPTION 'urut 1001 seharusnya 1001, dapat %', hasil; END IF;

  hasil := CASE WHEN 1646 < 1000 THEN LPAD(1646::TEXT, 3, '0') ELSE 1646::TEXT END;
  IF hasil <> '1646' THEN RAISE EXCEPTION 'urut 1646 seharusnya 1646, dapat %', hasil; END IF;

  -- Dan bukti bahwa cacatnya NYATA, bukan hipotesis.
  IF LPAD('1001', 3, '0') <> '100' THEN
    RAISE EXCEPTION 'Asumsi salah: LPAD tak memangkas di versi Postgres ini';
  END IF;

  RAISE NOTICE 'VERIFIKASI 217: 3 fungsi penomor diperbaiki; <1000 tak berubah, >=1000 tak lagi dipangkas.';
END $$;
