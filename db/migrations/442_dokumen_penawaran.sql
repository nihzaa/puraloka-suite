-- ════════════════════════════════════════════════════════════════════════════
-- 442 — DOKUMEN PENAWARAN (crm-proposal)
--
-- ── Yang ada sebelum ini, dan apa yang kurang
--
-- `bids` menyimpan ANGKA penawaran (`bid_value`) dan hasilnya (menang/kalah).
-- Yang tak pernah ada: DOKUMENNYA — nomor surat, masa berlaku, syarat, dan
-- baris rinciannya.
--
-- Akibatnya surat penawaran disusun di luar aplikasi (Word/Excel), dan yang
-- dikirim ke owner berbeda dari yang tercatat di sini. Saat menang, RAB-nya
-- disusun dari angka yang tak pernah dibandingkan dengan yang ditawarkan —
-- dan selisihnya baru ketahuan sebagai margin yang hilang.
--
-- ── Kenapa MENEMPEL pada `bids`, bukan tabel berdiri sendiri
--
-- Register tender sudah menjawab "tender apa saja yang kita ikuti, dan
-- bagaimana hasilnya". Penawaran adalah DOKUMEN dari salah satu baris itu.
-- Memisahkannya menciptakan dua daftar tender yang harus dicocokkan tangan —
-- dan yang tak pernah dicocokkan adalah yang kalah, justru yang paling
-- berguna dipelajari.
--
-- `ON DELETE CASCADE`: menghapus baris tender menghapus penawarannya. Tender
-- yang salah input saat masih prospek memang boleh dihapus (rutenya menjaga
-- yang sudah diputuskan), dan meninggalkan surat penawaran yatim hanya
-- menghasilkan dokumen yang tak bisa dilacak asalnya.
--
-- ── Kenapa nilai TIDAK disimpan di kepala
--
-- Tak ada kolom `subtotal`/`total` di `penawaran`. Angkanya DITURUNKAN dari
-- barisnya tiap kali diminta (`lib/penawaran.ts`, 24 test).
--
-- Menyimpannya berarti dua sumber untuk satu nilai, dan yang menyimpang
-- pertama selalu yang tersimpan: satu baris disunting, totalnya tidak. Pola
-- yang sama sudah diputuskan di tender subkon (migrasi 201) dengan alasan
-- yang sama persis.
--
-- Yang TETAP disimpan: `diskon` dan `ppn_persen` — keduanya MASUKAN, bukan
-- hasil hitungan.
--
-- Idempoten; verifikasi GAGAL KERAS.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Kepala surat penawaran ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS penawaran (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bid_id          uuid REFERENCES bids(id) ON DELETE CASCADE,

  nomor           text NOT NULL,
  perihal         text NOT NULL,
  kepada          text,
  kepada_alamat   text,
  tanggal         date NOT NULL DEFAULT CURRENT_DATE,

  -- Masa berlaku: penawaran tanpa batas waktu mengikat harga hari ini untuk
  -- pekerjaan tahun depan, dan kenaikan harga material di antaranya
  -- ditanggung sendiri.
  berlaku_sampai  date,

  -- MASUKAN, bukan hasil. Lihat catatan kepala berkas.
  diskon          numeric(15,2) NOT NULL DEFAULT 0 CHECK (diskon >= 0),
  ppn_persen      numeric(5,2)  NOT NULL DEFAULT 0 CHECK (ppn_persen >= 0 AND ppn_persen <= 100),

  syarat          text,
  catatan         text,

  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','terkirim','menang','kalah','batal')),
  dikirim_pada    timestamptz,

  created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Nomor surat unik per perusahaan. Dua surat bernomor sama membuat
  -- korespondensi berikutnya menunjuk dokumen yang ambigu — dan itu yang
  -- dicari saat penawarannya dipersoalkan.
  CONSTRAINT penawaran_nomor_unik UNIQUE (company_id, nomor),

  -- Yang sudah TERKIRIM wajib punya waktu kirimnya. Tanpa itu, "berapa lama
  -- penawaran ini menggantung" tak bisa dihitung — dan itu satu-satunya
  -- angka yang memberi tahu kapan harus menagih jawaban.
  CONSTRAINT penawaran_terkirim_bertanggal CHECK (
    status = 'draft' OR status = 'batal' OR dikirim_pada IS NOT NULL
  ),

  CONSTRAINT penawaran_masa_berlaku_wajar CHECK (
    berlaku_sampai IS NULL OR berlaku_sampai >= tanggal
  )
);

COMMENT ON TABLE penawaran IS
  'Surat penawaran ke calon pemberi kerja. Nilainya DITURUNKAN dari '
  '`penawaran_item`, tidak disimpan — dua sumber untuk satu nilai selalu '
  'menyimpang, dan yang menyimpang pertama adalah yang tersimpan.';

CREATE INDEX IF NOT EXISTS idx_penawaran_company ON penawaran (company_id, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_penawaran_bid ON penawaran (bid_id) WHERE bid_id IS NOT NULL;

-- ── 2. Baris rincian ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS penawaran_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  penawaran_id    uuid NOT NULL REFERENCES penawaran(id) ON DELETE CASCADE,

  urutan          integer NOT NULL DEFAULT 0,
  uraian          text NOT NULL,
  satuan          text,

  -- Keduanya boleh NULL: baris JUDUL (mis. "A. PEKERJAAN PERSIAPAN") memang
  -- tak bervolume. Memaksanya nol membuat baris judul ikut terhitung sebagai
  -- pekerjaan berharga nol.
  volume          numeric(15,4) CHECK (volume IS NULL OR volume >= 0),
  harga_satuan    numeric(15,2) CHECK (harga_satuan IS NULL OR harga_satuan >= 0),

  catatan         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN penawaran_item.volume IS
  'NULL sah: baris JUDUL tak bervolume. Nol berarti volume nol yang '
  'sesungguhnya — pekerjaan yang ditawarkan tanpa kuantitas.';

CREATE INDEX IF NOT EXISTS idx_penawaran_item_induk
  ON penawaran_item (penawaran_id, urutan);

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE penawaran        ENABLE ROW LEVEL SECURITY;
ALTER TABLE penawaran        FORCE  ROW LEVEL SECURITY;
ALTER TABLE penawaran_item   ENABLE ROW LEVEL SECURITY;
ALTER TABLE penawaran_item   FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON penawaran;
CREATE POLICY tenant_isolation ON penawaran
  FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));

-- `penawaran_item` kategori C: tenancy-nya diwarisi lewat induknya. ADR-004 —
-- nol literal peran di sini.
DROP POLICY IF EXISTS tenant_isolation ON penawaran_item;
CREATE POLICY tenant_isolation ON penawaran_item
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM penawaran p
     WHERE p.id = penawaran_item.penawaran_id
       AND p.company_id = (SELECT auth_company_id())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM penawaran p
     WHERE p.id = penawaran_item.penawaran_id
       AND p.company_id = (SELECT auth_company_id())));

-- ── VERIFIKASI ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_co  UUID;
  v_pen UUID;
  v_n   INT;
BEGIN
  SELECT id INTO v_co FROM companies LIMIT 1;
  IF v_co IS NULL THEN
    RAISE NOTICE '407: tak ada company untuk diverifikasi — dilewati';
    RETURN;
  END IF;

  -- 1. Kepala + baris masuk.
  INSERT INTO penawaran (company_id, nomor, perihal, tanggal, berlaku_sampai)
  VALUES (v_co, '[407-OK] 001/PEN/2026', 'Uji penawaran', '2026-08-16', '2026-09-15')
  RETURNING id INTO v_pen;

  INSERT INTO penawaran_item (penawaran_id, urutan, uraian, satuan, volume, harga_satuan)
  VALUES (v_pen, 1, 'A. PEKERJAAN PERSIAPAN', NULL, NULL, NULL),
         (v_pen, 2, 'Pembersihan lahan', 'm2', 500, 15000);

  SELECT count(*)::INT INTO v_n FROM penawaran_item WHERE penawaran_id = v_pen;
  IF v_n <> 2 THEN
    RAISE EXCEPTION '442 gagal: baris masuk %, harusnya 2', v_n;
  END IF;

  -- 2. Baris JUDUL tanpa volume & harga SAH. Memaksanya nol membuat baris
  --    judul ikut terhitung sebagai pekerjaan berharga nol.
  IF NOT EXISTS (
    SELECT 1 FROM penawaran_item
     WHERE penawaran_id = v_pen AND volume IS NULL AND harga_satuan IS NULL
  ) THEN
    RAISE EXCEPTION '442 gagal: baris judul tanpa volume tak tersimpan';
  END IF;

  -- 3. Masa berlaku sebelum tanggal surat DITOLAK.
  BEGIN
    INSERT INTO penawaran (company_id, nomor, perihal, tanggal, berlaku_sampai)
    VALUES (v_co, '[407-OK] 002/PEN/2026', 'Uji', '2026-08-16', '2026-08-01');
    RAISE EXCEPTION '442 gagal: masa berlaku terbalik diterima';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 4. Status TERKIRIM tanpa waktu kirim DITOLAK — tanpa itu "berapa lama
  --    menggantung" tak bisa dihitung.
  BEGIN
    UPDATE penawaran SET status = 'terkirim' WHERE id = v_pen;
    RAISE EXCEPTION '442 gagal: terkirim tanpa dikirim_pada diterima';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE penawaran SET status = 'terkirim', dikirim_pada = now() WHERE id = v_pen;

  -- 5. Nomor kembar per perusahaan DITOLAK.
  BEGIN
    INSERT INTO penawaran (company_id, nomor, perihal, tanggal)
    VALUES (v_co, '[407-OK] 001/PEN/2026', 'Kembar', '2026-08-16');
    RAISE EXCEPTION '442 gagal: nomor surat kembar diterima';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- 6. Menghapus kepala menghapus barisnya (CASCADE) — nol surat yatim.
  DELETE FROM penawaran WHERE id = v_pen;
  SELECT count(*)::INT INTO v_n FROM penawaran_item WHERE penawaran_id = v_pen;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '442 gagal: % baris yatim tertinggal sesudah kepalanya dihapus', v_n;
  END IF;

  DELETE FROM penawaran WHERE nomor LIKE '[407-OK]%';

  RAISE NOTICE '442 OK: penawaran + item terpasang, RLS aktif, 4 pagar terbukti menolak';
END $$;
