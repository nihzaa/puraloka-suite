-- ════════════════════════════════════════════════════════════════════════════
-- 447 — Status PKP per tenant, dan e-Faktur yang tak lagi mengandaikan
-- ════════════════════════════════════════════════════════════════════════════
--
-- Founder mengoreksi lingkup 2026-08-17, dan koreksinya tepat:
--
--     "urusan PKP atau belum PKP kerjakan aja, jangan terpatok pada
--      Puraloka saja"
--
-- Ekspor bukti potong (446/lib `ekspor-bupot.ts`) dibangun dengan alasan yang
-- BENAR untuk Puraloka — 18 dari 18 catatan pajaknya `pph_final_42`, nol PPN,
-- jadi e-Faktur tak relevan. Tapi ini produk SaaS multi-tenant: tenant lain
-- PASTI ada yang PKP, dan bagi mereka Faktur Pajak justru kewajiban bulanan.
--
-- Menyempitkan keputusan produk ke data satu tenant adalah kesalahan yang
-- sama bentuknya dengan menulis angka di dokumen konteks: benar hari ini,
-- salah begitu pelanggan kedua masuk.
--
-- ── Kenapa `pkp_sejak`, bukan boolean `is_pkp`
--
-- Status PKP punya TANGGAL. Perusahaan yang dikukuhkan PKP pada 1 Juli tak
-- boleh menerbitkan Faktur Pajak untuk transaksi Juni — dan tak boleh pula
-- dianggap non-PKP untuk transaksi Agustus.
--
-- Boolean hanya bisa menjawab "sekarang", jadi laporan pajak periode lalu
-- akan dihitung memakai status HARI INI. Itu kelas cacat yang sama dengan
-- harga satuan tanpa tanggal berlaku: angkanya wajar sampai dibandingkan
-- dengan dokumen aslinya.
--
-- `pkp_dicabut_sejak` melengkapinya — pencabutan juga bertanggal, dan tanpa
-- kolomnya satu-satunya cara menyatakan "tidak lagi PKP" adalah menghapus
-- `pkp_sejak`, yang menghapus pula sejarah bahwa ia PERNAH PKP.
--
-- ── Kenapa nomor seri faktur DIJATAH, bukan bebas
--
-- DJP memberi PKP jatah Nomor Seri Faktur Pajak (NSFP) lewat e-Nofa: satu
-- rentang, sekali pakai, dan yang terlewat harus dilaporkan sebagai batal.
-- Nomor yang dipakai dua kali membuat SPT Masa PPN ditolak.
--
-- Karena itu `nsfp_awal`/`nsfp_akhir`/`nsfp_terpakai` disimpan per tenant,
-- dan penerbitan mengambil dari counter — bukan dari `COUNT(*)+1` yang
-- menghitung baris yang ADA, bukan yang PERNAH ada (pelajaran migrasi 333).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Status PKP per tenant ───────────────────────────────────────────────
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS pkp_sejak         DATE,
  ADD COLUMN IF NOT EXISTS pkp_dicabut_sejak DATE,
  ADD COLUMN IF NOT EXISTS nsfp_awal         TEXT,
  ADD COLUMN IF NOT EXISTS nsfp_akhir        TEXT,
  ADD COLUMN IF NOT EXISTS nsfp_terpakai     INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN companies.pkp_sejak IS
  'Tanggal dikukuhkan PKP. NULL = belum PKP, tak menerbitkan Faktur Pajak. '
  'BERTANGGAL, bukan boolean: transaksi sebelum tanggal ini tetap non-PKP '
  'meski hari ini perusahaannya sudah PKP.';

COMMENT ON COLUMN companies.nsfp_terpakai IS
  'Berapa nomor seri faktur yang SUDAH terpakai dari jatah e-Nofa. Naik saja '
  '— nomor yang terbit tak boleh lahir kembali, dan lubang pada urutannya '
  'dilaporkan sebagai batal, bukan diisi ulang.';

-- Pencabutan tak boleh mendahului pengukuhan. Tanpa ini, salah ketik tanggal
-- menghasilkan perusahaan yang "dicabut sebelum dikukuhkan" — dan periode
-- di antaranya jadi tak terdefinisi.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'companies_pkp_urut' AND conrelid = 'companies'::regclass
  ) THEN
    ALTER TABLE companies ADD CONSTRAINT companies_pkp_urut
      CHECK (pkp_dicabut_sejak IS NULL OR pkp_sejak IS NULL
             OR pkp_dicabut_sejak >= pkp_sejak);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'companies_nsfp_tak_negatif' AND conrelid = 'companies'::regclass
  ) THEN
    ALTER TABLE companies ADD CONSTRAINT companies_nsfp_tak_negatif
      CHECK (nsfp_terpakai >= 0);
  END IF;
END $$;

-- ─── 2. `tax_records` tahu company-nya sendiri ──────────────────────────────
--
-- Sebelumnya company hanya bisa ditelusuri lewat invoice → project → company.
-- Untuk laporan PPN per masa pajak itu tiga join demi satu penyaring, dan
-- rantai yang panjang berarti satu baris tanpa invoice hilang dari laporan
-- tanpa gejala.
ALTER TABLE tax_records
  ADD COLUMN IF NOT EXISTS company_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'tax_records_company_id_fkey' AND conrelid = 'tax_records'::regclass
  ) THEN
    ALTER TABLE tax_records ADD CONSTRAINT tax_records_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Backfill dari rantai yang sudah ada. Idempoten: hanya yang masih NULL.
UPDATE tax_records t
   SET company_id = p.company_id
  FROM invoices i
  JOIN projects p ON p.id = i.project_id
 WHERE t.invoice_id = i.id
   AND t.company_id IS NULL
   AND p.company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tax_records_company_periode
  ON tax_records (company_id, period_month);

-- ─── 3. Nomor e-Faktur unik per tenant ──────────────────────────────────────
--
-- Unik PARSIAL: `efaktur_number` NULL sah (belum diterbitkan), dan hanya yang
-- terisi yang tak boleh kembar. Per COMPANY, bukan global — nomor seri dua
-- PKP berbeda memang bisa sama, dan unik global akan menolak yang kedua
-- sambil membocorkan keberadaan yang pertama (kelas cacat migrasi 333/427).
CREATE UNIQUE INDEX IF NOT EXISTS tax_records_efaktur_per_company
  ON tax_records (company_id, efaktur_number)
  WHERE efaktur_number IS NOT NULL;

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_co    UUID;
  v_co2   UUID;
  v_lolos BOOLEAN := FALSE;
  n       INT;
BEGIN
  SELECT id INTO v_co FROM companies LIMIT 1;
  SELECT id INTO v_co2 FROM companies WHERE id <> v_co LIMIT 1;

  -- 1. Kolomnya benar-benar ada.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_name = 'companies'
     AND column_name IN ('pkp_sejak', 'pkp_dicabut_sejak', 'nsfp_awal', 'nsfp_akhir', 'nsfp_terpakai');
  IF n <> 5 THEN
    RAISE EXCEPTION '447 gagal: hanya % dari 5 kolom PKP terpasang', n;
  END IF;

  -- 2. Pencabutan MENDAHULUI pengukuhan DITOLAK.
  v_lolos := FALSE;
  BEGIN
    UPDATE companies SET pkp_sejak = '2026-07-01', pkp_dicabut_sejak = '2026-06-01'
     WHERE id = v_co;
    v_lolos := TRUE;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE companies SET pkp_sejak = NULL, pkp_dicabut_sejak = NULL WHERE id = v_co;
  IF v_lolos THEN
    RAISE EXCEPTION '447 gagal: PKP dicabut SEBELUM dikukuhkan DITERIMA — '
      'periode di antaranya jadi tak terdefinisi';
  END IF;

  -- 3. Backfill company_id benar-benar jalan.
  SELECT count(*) INTO n FROM tax_records WHERE company_id IS NULL AND invoice_id IS NOT NULL;
  IF n > 0 THEN
    RAISE NOTICE '447 — % catatan pajak masih NULL company_id (invoicenya yatim?)', n;
  END IF;

  -- 4. Nomor e-Faktur KEMBAR dalam satu tenant ditolak…
  IF v_co IS NOT NULL THEN
    DECLARE v_inv UUID; v_t1 UUID;
    BEGIN
      SELECT i.id INTO v_inv FROM invoices i
        JOIN projects p ON p.id = i.project_id
       WHERE p.company_id = v_co LIMIT 1;

      IF v_inv IS NOT NULL THEN
        INSERT INTO tax_records (invoice_id, company_id, tax_type, tax_scheme,
                                 base_amount, rate_pct, tax_amount, period_month,
                                 efaktur_number, status)
        VALUES (v_inv, v_co, 'ppn', 'ppn', 1000, 11, 110, '2026-08', '[447-UJI]', 'pending')
        RETURNING id INTO v_t1;

        v_lolos := FALSE;
        BEGIN
          INSERT INTO tax_records (invoice_id, company_id, tax_type, tax_scheme,
                                   base_amount, rate_pct, tax_amount, period_month,
                                   efaktur_number, status)
          VALUES (v_inv, v_co, 'ppn', 'ppn', 1000, 11, 110, '2026-08', '[447-UJI]', 'pending');
          v_lolos := TRUE;
        EXCEPTION WHEN unique_violation THEN NULL;
        END;

        -- …tapi tenant LAIN boleh memakai nomor yang sama.
        IF v_co2 IS NOT NULL AND NOT v_lolos THEN
          DECLARE v_inv2 UUID;
          BEGIN
            SELECT i.id INTO v_inv2 FROM invoices i
              JOIN projects p ON p.id = i.project_id
             WHERE p.company_id = v_co2 LIMIT 1;
            IF v_inv2 IS NOT NULL THEN
              BEGIN
                INSERT INTO tax_records (invoice_id, company_id, tax_type, tax_scheme,
                                         base_amount, rate_pct, tax_amount, period_month,
                                         efaktur_number, status)
                VALUES (v_inv2, v_co2, 'ppn', 'ppn', 1000, 11, 110, '2026-08', '[447-UJI]', 'pending');
              EXCEPTION WHEN unique_violation THEN
                DELETE FROM tax_records WHERE efaktur_number = '[447-UJI]';
                RAISE EXCEPTION '447 gagal: tenant KEDUA ditolak nomor faktur tenant pertama — '
                  'nomor seri dua PKP berbeda memang bisa sama';
              END;
            END IF;
          END;
        END IF;

        DELETE FROM tax_records WHERE efaktur_number = '[447-UJI]';

        IF v_lolos THEN
          RAISE EXCEPTION '447 gagal: nomor e-Faktur KEMBAR dalam satu tenant DITERIMA — '
            'SPT Masa PPN akan ditolak DJP';
        END IF;
      END IF;
    END;
  END IF;

  RAISE NOTICE '447 OK — status PKP bertanggal (pencabutan tak bisa mendahului), '
    'company_id ter-backfill, nomor e-Faktur unik PER TENANT';
END $$;
