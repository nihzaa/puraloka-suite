-- ============================================================================
-- 219 — KONTRAK PAYUNG · EXPEDITING & LOGISTIK · NOTA KREDIT
-- ============================================================================
--
-- TUNDA kelompok F, tiga item sekaligus. Dibangun atas keputusan founder
-- 2026-08-07 meski pemicunya ("volume pengadaan berulang dari vendor yang
-- sama" & "ada retur/koreksi tagihan pertama") belum menyala.
--
-- ── Kenapa ketiganya satu migrasi
--
-- Ketiganya mengikuti SATU barang dari kesepakatan sampai uangnya kembali:
--
--   kontrak payung  → harga & kuota disepakati DI MUKA, PO tinggal menarik
--   expediting      → barangnya sekarang di mana, dan telat berapa hari
--   nota kredit     → barang salah/rusak dikembalikan, tagihan dikoreksi
--
-- Memisahkannya membuat pertanyaan "kenapa tagihan ini beda dari PO-nya?"
-- tak punya satu tempat pun untuk dijawab.
--
-- ── Yang paling mahal kalau ini tidak ada
--
--   · Kontrak payung 1.000 ton disepakati, PO menarik 1.200 ton tanpa ada
--     yang sadar. Kelebihannya ditagih di luar harga kontrak — dan baru
--     ketahuan saat rekonsiliasi akhir tahun.
--   · Barang telat 3 minggu, tak ada yang mengejar karena tak ada yang
--     mencatat kapan seharusnya tiba. Pekerjaan berhenti, dan penyebabnya
--     baru ditelusuri sesudah kerugiannya terjadi.
--   · Retur barang rusak tanpa nota kredit: tagihan penuh tetap dibayar,
--     dan selisihnya jadi kerugian yang tak pernah tercatat sebagai apa pun.
--
-- Idempoten. Verifikasi di blok akhir (pola migrasi 142).

-- ── 1. Kontrak payung (blanket order) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS kontrak_payung (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id       uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  nomor             text NOT NULL,
  judul             text NOT NULL,
  -- Jendela berlaku. Kontrak payung SELALU bertanggal — harga yang
  -- disepakati tahun lalu bukan harga hari ini.
  berlaku_dari      date NOT NULL,
  berlaku_sampai    date NOT NULL,
  -- Pagu nilai. NULL = tak berpagu nilai (dibatasi kuota per-item saja).
  pagu_nilai        numeric,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','aktif','habis','kedaluwarsa','dibatalkan')),
  syarat_pembayaran text,
  catatan           text,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payung_nomor_unik UNIQUE (company_id, nomor),
  CONSTRAINT payung_jendela_maju CHECK (berlaku_sampai >= berlaku_dari),
  CONSTRAINT payung_pagu_positif CHECK (pagu_nilai IS NULL OR pagu_nilai > 0)
);

-- Item kontrak payung: harga & kuota yang disepakati di muka.
CREATE TABLE IF NOT EXISTS kontrak_payung_item (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kontrak_id        uuid NOT NULL REFERENCES kontrak_payung(id) ON DELETE CASCADE,
  material_id       uuid REFERENCES materials(id) ON DELETE SET NULL,
  uraian            text NOT NULL,
  satuan            text NOT NULL,
  harga_satuan      numeric NOT NULL,
  -- Kuota yang boleh ditarik sepanjang masa kontrak.
  kuota             numeric NOT NULL,
  -- Kuota yang SUDAH ditarik PO. Diperbarui saat PO menarik dari kontrak.
  --
  -- Disimpan, bukan dihitung ulang tiap kali: penarikan kuota harus atomik
  -- terhadap constraint di bawah, dan agregat yang dihitung belakangan tak
  -- bisa mencegah dua PO menarik sisa yang sama secara bersamaan.
  terpakai          numeric NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payung_item_harga_positif CHECK (harga_satuan > 0),
  CONSTRAINT payung_item_kuota_positif CHECK (kuota > 0),
  CONSTRAINT payung_item_terpakai_tak_negatif CHECK (terpakai >= 0),
  -- INTI kontrak payung: penarikan tak boleh melebihi kuota.
  --
  -- Tanpa ini, PO bisa menarik 1.200 ton dari kontrak 1.000 ton, dan
  -- kelebihannya ditagih di luar harga kontrak — baru ketahuan saat
  -- rekonsiliasi akhir tahun.
  CONSTRAINT payung_item_tak_lebih_kuota CHECK (terpakai <= kuota),
  CONSTRAINT payung_item_unik UNIQUE (kontrak_id, uraian, satuan)
);

-- PO yang menarik dari kontrak payung. Kolom ditambahkan ke tabel yang ada.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'purchase_orders' AND column_name = 'kontrak_payung_id') THEN
    ALTER TABLE purchase_orders
      ADD COLUMN kontrak_payung_id uuid REFERENCES kontrak_payung(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 2. Expediting & logistik ───────────────────────────────────────────────
--
-- BUKAN `po_delivery_log` — itu jejak PENGIRIMAN DOKUMEN PO ke vendor
-- (WhatsApp/email), bukan pelacakan barangnya. Nama miripnya menyesatkan;
-- keduanya sengaja dibiarkan terpisah.
CREATE TABLE IF NOT EXISTS expediting (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  po_id             uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  -- Tanggal yang DIJANJIKAN vendor, terpisah dari `expected_delivery_date`
  -- di PO.
  --
  -- Dua tanggal berbeda dengan sengaja: yang di PO adalah KEBUTUHAN kita,
  -- yang di sini adalah JANJI vendor. Menyatukannya menghapus bukti bahwa
  -- vendor pernah menjanjikan tanggal yang lebih lambat dari kebutuhan —
  -- dan itu percakapan yang berbeda saat pekerjaan telat.
  janji_vendor      date,
  -- Perkiraan tiba terkini menurut pelacakan.
  perkiraan_tiba    date,
  tiba_aktual       date,
  status            text NOT NULL DEFAULT 'dipesan'
                      CHECK (status IN ('dipesan','diproduksi','siap_kirim','dalam_perjalanan',
                                        'tiba','tertahan','dibatalkan')),
  lokasi_terkini    text,
  nomor_resi        text,
  moda              text CHECK (moda IS NULL OR moda IN ('darat','laut','udara','kereta')),
  -- Kenapa tertahan. WAJIB terisi bila status 'tertahan' — barang tertahan
  -- tanpa sebab tercatat adalah barang yang tak seorang pun kejar.
  sebab_tertahan    text,
  catatan           text,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expediting_po_unik UNIQUE (po_id),
  CONSTRAINT expediting_tertahan_bersebab CHECK (
    status <> 'tertahan'
    OR (sebab_tertahan IS NOT NULL AND length(trim(sebab_tertahan)) >= 5)),
  -- Status 'tiba' WAJIB bertanggal. Tanpa itu, "sudah datang" adalah klaim
  -- tanpa tanggal — dan keterlambatan jadi tak bisa dihitung sama sekali.
  CONSTRAINT expediting_tiba_bertanggal CHECK (
    status <> 'tiba' OR tiba_aktual IS NOT NULL)
);

-- Jejak perubahan status expediting — riwayat, bukan hanya keadaan terkini.
CREATE TABLE IF NOT EXISTS expediting_jejak (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expediting_id     uuid NOT NULL REFERENCES expediting(id) ON DELETE CASCADE,
  status            text NOT NULL,
  lokasi            text,
  catatan           text,
  dicatat_oleh      uuid REFERENCES users(id),
  dicatat_pada      timestamptz NOT NULL DEFAULT now()
);

-- ── 3. Nota kredit (credit note) ───────────────────────────────────────────
--
-- Koreksi tagihan pemasok: barang rusak, kurang kirim, atau salah harga.
CREATE TABLE IF NOT EXISTS nota_kredit (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id       uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  -- Tagihan yang dikoreksi. NULL = nota kredit berdiri sendiri (mis. retur
  -- barang yang tagihannya belum terbit).
  supplier_invoice_id uuid REFERENCES supplier_invoices(id) ON DELETE SET NULL,
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  nomor             text NOT NULL,
  tanggal           date NOT NULL,
  jenis             text NOT NULL DEFAULT 'retur_barang'
                      CHECK (jenis IN ('retur_barang','kurang_kirim','salah_harga',
                                       'barang_rusak','potongan','lainnya')),
  jumlah            numeric NOT NULL,
  -- Alasan WAJIB. Nota kredit adalah pengurangan uang yang harus dibayar —
  -- tanpa alasan tercatat, ia tak bisa dibedakan dari kesalahan pencatatan.
  alasan            text NOT NULL,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','diajukan','disetujui','ditolak','diterapkan')),
  diajukan_oleh     uuid REFERENCES users(id),
  diajukan_pada     timestamptz,
  diputuskan_oleh   uuid REFERENCES users(id),
  diputuskan_pada   timestamptz,
  alasan_tolak      text,
  -- Kapan potongannya benar-benar mengurangi tagihan.
  diterapkan_pada   timestamptz,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nota_kredit_nomor_unik UNIQUE (company_id, nomor),
  CONSTRAINT nota_kredit_jumlah_positif CHECK (jumlah > 0),
  CONSTRAINT nota_kredit_beralasan CHECK (length(trim(alasan)) >= 10),
  CONSTRAINT nota_kredit_keputusan_lengkap CHECK (
    status NOT IN ('disetujui','ditolak') OR diputuskan_pada IS NOT NULL),
  CONSTRAINT nota_kredit_tolak_beralasan CHECK (
    status <> 'ditolak'
    OR (alasan_tolak IS NOT NULL AND length(trim(alasan_tolak)) >= 10)),
  -- DITERAPKAN wajib bertanggal DAN wajib sudah disetujui sebelumnya.
  -- Potongan yang diterapkan tanpa persetujuan adalah uang yang hilang
  -- tanpa satu pun tanda tangan.
  CONSTRAINT nota_kredit_terap_lengkap CHECK (
    status <> 'diterapkan'
    OR (diterapkan_pada IS NOT NULL AND diputuskan_pada IS NOT NULL)),
  -- Pemutus tak boleh pengaju — sama alasannya dengan izin kerja (218).
  CONSTRAINT nota_kredit_pemutus_bukan_pengaju CHECK (
    diputuskan_oleh IS NULL OR diajukan_oleh IS NULL
    OR diputuskan_oleh <> diajukan_oleh)
);

-- ── Indeks ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payung_supplier  ON kontrak_payung(supplier_id);
CREATE INDEX IF NOT EXISTS idx_payung_status    ON kontrak_payung(company_id, status);
CREATE INDEX IF NOT EXISTS idx_payung_masa      ON kontrak_payung(company_id, berlaku_sampai);
CREATE INDEX IF NOT EXISTS idx_payung_item_par  ON kontrak_payung_item(kontrak_id);
CREATE INDEX IF NOT EXISTS idx_expediting_po    ON expediting(po_id);
CREATE INDEX IF NOT EXISTS idx_expediting_stat  ON expediting(company_id, status);
CREATE INDEX IF NOT EXISTS idx_exp_jejak_parent ON expediting_jejak(expediting_id, dicatat_pada);
CREATE INDEX IF NOT EXISTS idx_nota_supplier    ON nota_kredit(supplier_id);
CREATE INDEX IF NOT EXISTS idx_nota_invoice     ON nota_kredit(supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_nota_status      ON nota_kredit(company_id, status);
CREATE INDEX IF NOT EXISTS idx_po_payung        ON purchase_orders(kontrak_payung_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- ADR-004 Rule #2: `has_permission('kunci')`, BUKAN `auth_role() = 'admin'`.
-- Helper DIBUNGKUS `(SELECT ...)` → InitPlan (pelajaran migrasi 214).
-- Policy tenant BERNAMA `tenant_isolation` (pelajaran migrasi 216).
DO $$
DECLARE
  t text;
  n_policy int := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY['kontrak_payung','kontrak_payung_item',
                           'expediting','expediting_jejak','nota_kredit']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE FOR ALL
         USING (company_id = (SELECT auth_company_id()))
         WITH CHECK (company_id = (SELECT auth_company_id()))', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_baca', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING ((SELECT has_permission(''procurement:view'')))',
      t || '_baca', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tulis', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL
         USING ((SELECT has_permission(''procurement:po:manage'')))
         WITH CHECK ((SELECT has_permission(''procurement:po:manage'')))',
      t || '_tulis', t);
  END LOOP;

  SELECT count(*) INTO n_policy FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname IN ('kontrak_payung','kontrak_payung_item',
                       'expediting','expediting_jejak','nota_kredit');

  IF n_policy <> 15 THEN
    RAISE EXCEPTION 'Policy tak lengkap: % (harusnya 15)', n_policy;
  END IF;

  RAISE NOTICE 'OK: 5 tabel pengadaan lanjutan + % policy.', n_policy;
END $$;

-- ── Verifikasi ────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  n_telanjang int;
BEGIN
  FOREACH t IN ARRAY ARRAY['kontrak_payung','kontrak_payung_item',
                           'expediting','expediting_jejak','nota_kredit']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Tabel % tak terbentuk', t;
    END IF;
    IF NOT (SELECT relrowsecurity AND relforcerowsecurity
              FROM pg_class WHERE oid = t::regclass) THEN
      RAISE EXCEPTION 'RLS tak aktif/tak dipaksa di %', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
       WHERE c.relname = t AND p.polname = 'tenant_isolation'
         AND p.polpermissive = false
         AND pg_get_expr(p.polqual, p.polrelid) LIKE '%auth_company_id%'
    ) THEN
      RAISE EXCEPTION 'Tabel % tak punya tenant_isolation RESTRICTIVE', t;
    END IF;
  END LOOP;

  -- ADR-004: nol literal peran.
  IF EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname IN ('kontrak_payung','kontrak_payung_item',
                         'expediting','expediting_jejak','nota_kredit')
       AND pg_get_expr(p.polqual, p.polrelid) LIKE '%auth_role%'
  ) THEN
    RAISE EXCEPTION 'ADR-004 dilanggar: ada policy memakai auth_role()';
  END IF;

  -- InitPlan (pelajaran 214).
  SELECT count(*) INTO n_telanjang
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname IN ('kontrak_payung','kontrak_payung_item',
                       'expediting','expediting_jejak','nota_kredit')
     AND (
       regexp_replace(coalesce(pg_get_expr(p.polqual, p.polrelid), ''),
                      '\( SELECT (auth_company_id|has_permission)', '(WRAPPED', 'g')
         ~ '(auth_company_id|has_permission)\('
       OR
       regexp_replace(coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
                      '\( SELECT (auth_company_id|has_permission)', '(WRAPPED', 'g')
         ~ '(auth_company_id|has_permission)\('
     );
  IF n_telanjang > 0 THEN
    RAISE EXCEPTION 'Ada % policy memanggil helper per baris (bukan InitPlan)', n_telanjang;
  END IF;

  -- Kolom penarik kontrak payung di PO.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'purchase_orders' AND column_name = 'kontrak_payung_id') THEN
    RAISE EXCEPTION 'purchase_orders.kontrak_payung_id tak terbentuk';
  END IF;

  RAISE NOTICE 'VERIFIKASI 219: 5 tabel, RLS dipaksa, nol literal peran, InitPlan, PO ber-kontrak_payung_id.';
END $$;
