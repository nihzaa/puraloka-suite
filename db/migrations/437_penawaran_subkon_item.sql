-- ════════════════════════════════════════════════════════════════════════════
-- 437 — Penawaran subkon PER-ITEM: "siapa mahal di pos mana"
-- ════════════════════════════════════════════════════════════════════════════
--
-- Menutup entri Peta Modul `sk-kontrak` (Kontrak & BOQ Subkon).
--
-- ── Cacat yang ditutup, diukur pada schema nyata
--
-- `penawaran_subkon` (migrasi 201:95-149) punya PERSIS SATU kolom uang:
--
--     nilai_penawaran numeric(18,2)      -- 201:106
--
-- Satu angka total per penawar. Akibatnya perbandingan tender hanya bisa
-- menjawab "siapa paling murah SELURUHNYA", dan tak pernah bisa menjawab
-- pertanyaan yang sebenarnya menentukan:
--
--     "Suswoyo Rp 277jt, Agung Rp 265jt — Agung lebih murah di MANA?"
--
-- Selisih Rp 12 juta antara dua penawar bisa berarti dua hal yang sama sekali
-- berbeda: Agung lebih efisien merata di semua pos, ATAU Agung memasang harga
-- normal di semua pos kecuali satu yang ia lupakan/salah baca. Yang kedua
-- adalah risiko klaim tambah, dan ia terbaca IDENTIK dengan yang pertama
-- selama yang tersimpan hanya satu angka.
--
-- Ini kelas cacat yang sama dengan yang sudah ditutup RFQ material lewat
-- `lib/tabulasi-penawaran.ts` — di sana perbandingan sudah per-material dan
-- menandai "termurah" per baris. Sisi subkontraktor tertinggal, padahal
-- nilai per keputusannya jauh lebih besar.
--
-- ── Kenapa OPSIONAL, bukan wajib
--
-- `penawaran_subkon` berisi 8 baris hari ini (diukur), SELURUHNYA hanya
-- ber-total. Memaksa rincian item akan membuat kedelapan penawaran itu
-- seketika tak sah — dan penawaran yang sudah dipakai memutuskan pemenang
-- tak boleh berubah status keabsahannya karena schema-nya berkembang.
--
-- Jadi: penawaran TANPA item tetap sah selamanya, dan dibandingkan lewat
-- totalnya seperti sebelumnya. Item adalah PENAJAMAN, bukan syarat.
--
-- ── KEPUTUSAN: total DIVALIDASI terhadap item, BUKAN dihitung dari item
--
-- Dua rancangan mungkin saat item ada:
--
--   (a) `nilai_penawaran` menjadi kolom turunan — dihitung SUM(item).
--   (b) `nilai_penawaran` tetap ditulis penawar, dan basis MENOLAK bila ia
--       tak cocok dengan SUM(item).
--
-- Dipilih (b). Alasannya:
--
--   1. `nilai_penawaran` adalah ANGKA YANG DIAJUKAN MANDOR — nilai yang ia
--      sebut di surat penawarannya dan yang akan jadi `work_scopes.
--      borongan_value` saat menang (catatan 201:104). Menghitungnya ulang
--      dari rincian berarti basis diam-diam mengubah angka kontraktual saat
--      seorang staf salah ketik satu volume. Yang berubah bukan tampilan —
--      yang berubah adalah berapa rupiah yang akan dibayarkan.
--
--   2. Ketidakcocokan antara total dan rinciannya adalah INFORMASI, bukan
--      gangguan. Surat penawaran yang totalnya tak sama dengan jumlah
--      rinciannya berarti ada yang salah baca — dan itu harus diperbaiki oleh
--      manusia yang memegang suratnya, bukan ditambal diam-diam oleh SUM().
--
--   3. Rancangan (a) mustahil ditegakkan sebagai GENERATED column: Postgres
--      melarang kolom generated yang membaca tabel lain. Ia hanya bisa lewat
--      trigger, dan trigger yang MENULIS ULANG angka uang adalah persis pola
--      yang CLAUDE.md peringatkan lewat `fn_update_cash_balance_on_payment`.
--
-- Toleransinya Rp 1 (`TOLERANSI_RUPIAH` di bawah), bukan nol: numeric(18,2)
-- membuat pembulatan per-baris menghasilkan selisih recehan yang sah, dan
-- menolak penawaran Rp 277.000.000 karena beda Rp 0,50 adalah gangguan tanpa
-- guna. Toleransi PERSENTASE sengaja TIDAK dipakai — 0,1% dari Rp 277 juta
-- adalah Rp 277 ribu, cukup besar untuk menyembunyikan satu pos yang hilang.
--
-- ── Kenapa `urutan`, bukan mengandalkan urutan sisip
--
-- Perbandingan per-item hanya berarti kalau baris "Galian tanah" milik
-- Suswoyo disandingkan dengan baris "Galian tanah" milik Agung. Yang
-- menyatukannya adalah `kode_item` — diisi dari BOQ tender, sama untuk semua
-- penawar. `urutan` hanya menentukan tampilan.
--
-- `kode_item` NULLABLE karena penawar boleh menambah baris yang tak ada di
-- BOQ (pekerjaan yang menurutnya perlu tapi tak diminta). Baris begitu tak
-- punya pembanding, dan itu justru yang paling perlu terlihat.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabel item penawaran ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.penawaran_subkon_item (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  penawaran_id   uuid NOT NULL
                 REFERENCES public.penawaran_subkon(id) ON DELETE CASCADE,

  -- Penyatu antar penawar. NULL = baris tambahan yang tak diminta BOQ.
  kode_item      text,

  uraian         text NOT NULL,
  satuan         text,

  -- numeric, bukan float — CLAUDE.md §5.4. Angka ini dikalikan lalu jadi
  -- bagian dari nilai kontrak; float membuat totalnya bergeser tanpa sebab
  -- yang bisa ditunjuk.
  volume         numeric(14,3) NOT NULL DEFAULT 0,
  harga_satuan   numeric(18,2) NOT NULL DEFAULT 0,

  -- Disimpan sebagai GENERATED, bukan dihitung di aplikasi: subtotal dibaca
  -- oleh perbandingan, oleh penyalinan ke BOQ, dan nanti oleh laporan. Tiga
  -- tempat menghitung ulang perkalian yang sama adalah tiga kesempatan
  -- berbeda untuk membulatkannya berbeda.
  subtotal       numeric(18,2) GENERATED ALWAYS AS (volume * harga_satuan) STORED,

  urutan         integer NOT NULL DEFAULT 0,
  catatan        text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Volume negatif mustahil. Nol SAH: penawar boleh menyatakan sebuah pos
  -- tak ia kerjakan tanpa menghapus barisnya — menghapusnya membuat tabel
  -- perbandingan berlubang dan pembaca tak bisa membedakan "tidak dikerjakan"
  -- dari "lupa diisi".
  CONSTRAINT penawaran_subkon_item_volume_wajar CHECK (volume >= 0),

  -- Harga satuan nol sah (pekerjaan yang ditawarkan gratis/sudah termasuk pos
  -- lain); negatif tidak — harga negatif membuat total turun tanpa ada uang
  -- yang benar-benar berkurang, dan ia akan memenangkan perbandingan.
  CONSTRAINT penawaran_subkon_item_harga_wajar CHECK (harga_satuan >= 0),

  CONSTRAINT penawaran_subkon_item_uraian_terisi CHECK (btrim(uraian) <> ''),

  -- Satu kode item SEKALI per penawaran. Dua baris "Galian tanah" dengan dua
  -- harga berbeda membuat perbandingan per-item menghitungnya dua kali, dan
  -- yang mana yang dipakai jadi bergantung urutan baca.
  --
  -- Parsial atas `kode_item IS NOT NULL`: baris tambahan tanpa kode boleh
  -- berapa pun, karena tak ada yang bisa ditabrakkannya.
  CONSTRAINT penawaran_subkon_item_kode_kosong CHECK (
    kode_item IS NULL OR btrim(kode_item) <> ''
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS penawaran_subkon_item_kode_unik
  ON public.penawaran_subkon_item (penawaran_id, kode_item)
  WHERE kode_item IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_penawaran_subkon_item_penawaran
  ON public.penawaran_subkon_item (penawaran_id);

DROP TRIGGER IF EXISTS trg_penawaran_subkon_item_updated_at
  ON public.penawaran_subkon_item;
CREATE TRIGGER trg_penawaran_subkon_item_updated_at
  BEFORE UPDATE ON public.penawaran_subkon_item
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMENT ON TABLE public.penawaran_subkon_item IS
  'Rincian per-item sebuah penawaran subkon (437). OPSIONAL: penawaran tanpa '
  'item tetap sah dan dibandingkan lewat totalnya. Bila ada item, '
  'nilai_penawaran DIVALIDASI terhadap SUM(subtotal) — bukan dihitung darinya, '
  'karena total adalah angka kontraktual yang diajukan mandor.';

COMMENT ON COLUMN public.penawaran_subkon_item.kode_item IS
  'Penyatu antar penawar untuk perbandingan per-item. NULL = baris tambahan '
  'di luar BOQ tender — tak punya pembanding, dan itu yang perlu terlihat.';

-- ─── 2. RLS: mengikuti induknya ─────────────────────────────────────────────
--
-- Tanpa ini tabel baru terbuka untuk SELURUH tenant. Nilai penawaran adalah
-- informasi komersial yang paling merugikan kalau bocor — terutama ke sesama
-- mandor yang sedang bersaing di tender yang sama.
--
-- Bentuknya menyalin `penawaran_subkon` (201): isolasi tenant lewat rantai
-- penawaran → tender → project, ditambah gerbang permission.
ALTER TABLE public.penawaran_subkon_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS penawaran_subkon_item_tenant ON public.penawaran_subkon_item;
CREATE POLICY penawaran_subkon_item_tenant ON public.penawaran_subkon_item
  USING (EXISTS (
    SELECT 1
      FROM public.penawaran_subkon p
      JOIN public.tender_subkon t ON t.id = p.tender_id
     WHERE p.id = penawaran_subkon_item.penawaran_id
       AND project_company_id(t.project_id) = (SELECT auth_company_id())
  ));

DROP POLICY IF EXISTS penawaran_subkon_item_baca ON public.penawaran_subkon_item;
CREATE POLICY penawaran_subkon_item_baca ON public.penawaran_subkon_item
  FOR SELECT USING ((SELECT has_permission('projects:view')));

DROP POLICY IF EXISTS penawaran_subkon_item_kelola ON public.penawaran_subkon_item;
CREATE POLICY penawaran_subkon_item_kelola ON public.penawaran_subkon_item
  FOR ALL USING ((SELECT has_permission('projects:contract')));

-- ─── 3. Total vs rincian: DIVALIDASI, bukan ditimpa ─────────────────────────
--
-- Trigger di TABEL ITEM, bukan di penawaran: yang berubah lebih sering adalah
-- rinciannya. Dipasang untuk INSERT/UPDATE/DELETE karena menghapus satu pos
-- membuat totalnya melenceng persis seperti menambahnya.
--
-- ⚠ Trigger ini MENOLAK, tidak memperbaiki. Lihat "KEPUTUSAN" di kepala
-- berkas: menulis ulang angka uang diam-diam adalah pola yang justru dijaga
-- supaya tak terjadi di repo ini.
CREATE OR REPLACE FUNCTION public.fn_penawaran_subkon_item_cocok()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  -- Rp 1. Bukan persentase — lihat alasannya di kepala migrasi.
  TOLERANSI_RUPIAH CONSTANT numeric := 1;
  v_penawaran   uuid;
  v_total       numeric(18,2);
  v_jumlah_item numeric(18,2);
  v_n           integer;
  v_tak_menawar boolean;
BEGIN
  v_penawaran := COALESCE(NEW.penawaran_id, OLD.penawaran_id);

  SELECT nilai_penawaran, tidak_menawar
    INTO v_total, v_tak_menawar
    FROM public.penawaran_subkon
   WHERE id = v_penawaran;

  -- Induk hilang: DELETE lewat ON DELETE CASCADE menjalankan trigger ini
  -- setelah induknya lenyap. Tak ada yang bisa divalidasi, dan menolak di
  -- sini akan membuat penghapusan penawaran mustahil.
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
    INTO v_jumlah_item, v_n
    FROM public.penawaran_subkon_item
   WHERE penawaran_id = v_penawaran;

  -- Baris terakhir dihapus → penawaran kembali jadi "total saja", yang SAH.
  IF v_n = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Yang menyatakan TIDAK MENAWAR tak boleh punya rincian harga: nilainya
  -- tersimpan 0, jadi rincian apa pun pasti tak cocok — tapi pesannya harus
  -- menyebut sebab yang sebenarnya, bukan "selisih Rp 5.000.000".
  IF v_tak_menawar THEN
    RAISE EXCEPTION 'Penawar ini menyatakan TIDAK menawar — rincian item tidak '
      'bisa dilampirkan. Batalkan pernyataan tidak menawar lebih dulu bila ia '
      'sebenarnya mengajukan harga.';
  END IF;

  IF abs(v_total - v_jumlah_item) > TOLERANSI_RUPIAH THEN
    RAISE EXCEPTION 'Rincian item berjumlah Rp % tetapi nilai penawaran tertulis '
      'Rp % (selisih Rp %). Perbaiki salah satunya — total yang tak sama dengan '
      'rinciannya berarti ada pos yang salah baca, dan basis tidak menebak yang '
      'mana yang benar.',
      trim(to_char(v_jumlah_item, '999G999G999G999D99')),
      trim(to_char(v_total,       '999G999G999G999D99')),
      trim(to_char(abs(v_total - v_jumlah_item), '999G999G999G999D99'));
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_penawaran_subkon_item_cocok
  ON public.penawaran_subkon_item;
CREATE CONSTRAINT TRIGGER trg_penawaran_subkon_item_cocok
  AFTER INSERT OR UPDATE OR DELETE ON public.penawaran_subkon_item
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fn_penawaran_subkon_item_cocok();

COMMENT ON FUNCTION public.fn_penawaran_subkon_item_cocok() IS
  'Menolak (tidak memperbaiki) penawaran yang totalnya tak cocok dengan jumlah '
  'rinciannya. DEFERRABLE INITIALLY DEFERRED supaya satu transaksi boleh '
  'menyisipkan item satu per satu — pemeriksaan jatuh di COMMIT, saat rincian '
  'sudah utuh. Toleransi Rp 1 untuk pembulatan numeric(18,2).';

-- ─── 4. Sisi penawaran: total yang diubah juga harus tetap cocok ────────────
--
-- Tanpa ini, rincian bisa dibuat cocok lalu totalnya disunting sesudahnya —
-- dan pintu yang dijaga di sisi item terlewati sepenuhnya.
CREATE OR REPLACE FUNCTION public.fn_penawaran_subkon_total_cocok()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  TOLERANSI_RUPIAH CONSTANT numeric := 1;
  v_jumlah_item numeric(18,2);
  v_n           integer;
BEGIN
  SELECT COALESCE(SUM(subtotal), 0), COUNT(*)
    INTO v_jumlah_item, v_n
    FROM public.penawaran_subkon_item
   WHERE penawaran_id = NEW.id;

  -- Penawaran tanpa rincian: sah, tak ada yang dibandingkan.
  IF v_n = 0 THEN
    RETURN NEW;
  END IF;

  IF abs(NEW.nilai_penawaran - v_jumlah_item) > TOLERANSI_RUPIAH THEN
    RAISE EXCEPTION 'Nilai penawaran Rp % tidak cocok dengan rincian itemnya '
      'yang berjumlah Rp %. Ubah rinciannya, atau hapus rincian bila penawaran '
      'ini memang hanya berupa satu angka total.',
      trim(to_char(NEW.nilai_penawaran, '999G999G999G999D99')),
      trim(to_char(v_jumlah_item,       '999G999G999G999D99'));
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_penawaran_subkon_total_cocok
  ON public.penawaran_subkon;
CREATE CONSTRAINT TRIGGER trg_penawaran_subkon_total_cocok
  AFTER UPDATE OF nilai_penawaran ON public.penawaran_subkon
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.fn_penawaran_subkon_total_cocok();

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_proyek   uuid;
  v_worker   uuid;
  v_tender   uuid;
  v_pen      uuid;
  v_pen2     uuid;
  v_lolos    boolean;
  v_subtotal numeric;
  v_sisa     integer;
BEGIN
  SELECT id INTO v_proyek FROM projects WHERE company_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_worker FROM workers LIMIT 1;

  IF v_proyek IS NULL OR v_worker IS NULL THEN
    RAISE NOTICE '437 — basis tanpa proyek/mandor, verifikasi perilaku dilewati';
    RETURN;
  END IF;

  INSERT INTO tender_subkon (project_id, nomor, judul, nilai_perkiraan, tanggal)
  VALUES (v_proyek, '[437-TND]', 'Uji migrasi 437', 100000000, CURRENT_DATE)
  RETURNING id INTO v_tender;

  INSERT INTO penawaran_subkon (tender_id, worker_id, nilai_penawaran)
  VALUES (v_tender, v_worker, 50000000)
  RETURNING id INTO v_pen;

  -- 1. Penawaran TANPA item tetap sah — inti dari "opsional".
  --    Kalau ini gagal, 8 penawaran yang sudah ada di basis jadi tak sah.
  IF NOT EXISTS (SELECT 1 FROM penawaran_subkon WHERE id = v_pen) THEN
    RAISE EXCEPTION '437 gagal: penawaran tanpa item tidak tersimpan';
  END IF;

  -- 2. Item yang JUMLAHNYA COCOK diterima, dan subtotal-nya benar.
  INSERT INTO penawaran_subkon_item (penawaran_id, kode_item, uraian, satuan, volume, harga_satuan, urutan)
  VALUES (v_pen, 'A.1', 'Galian tanah', 'm3', 100, 300000, 1),
         (v_pen, 'A.2', 'Urugan pasir', 'm3',  40, 500000, 2);

  SELECT SUM(subtotal) INTO v_subtotal FROM penawaran_subkon_item WHERE penawaran_id = v_pen;
  IF v_subtotal <> 50000000 THEN
    RAISE EXCEPTION '437 gagal: subtotal generated berjumlah % (harus 50000000)', v_subtotal;
  END IF;

  -- 3. Item yang membuat total MELENCENG ditolak.
  --    Trigger DEFERRED → pelanggarannya jatuh di COMMIT sub-transaksi.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO penawaran_subkon_item (penawaran_id, kode_item, uraian, volume, harga_satuan)
    VALUES (v_pen, 'A.3', 'Pos yang tak ada di total', 1, 7000000);
    -- Memaksa pemeriksaan DEFERRED dijalankan sekarang, di dalam blok ini.
    SET CONSTRAINTS trg_penawaran_subkon_item_cocok IMMEDIATE;
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM tender_subkon WHERE id = v_tender;
    RAISE EXCEPTION '437 gagal: item yang membuat total melenceng DITERIMA — '
      'perbandingan per-item bisa berbohong tentang totalnya';
  END IF;

  -- 4. Total yang disunting supaya tak cocok dengan rinciannya ditolak.
  --    Pintu kedua: tanpa ini rincian dibuat cocok lalu total diubah diam-diam.
  v_lolos := FALSE;
  BEGIN
    UPDATE penawaran_subkon SET nilai_penawaran = 99000000 WHERE id = v_pen;
    SET CONSTRAINTS trg_penawaran_subkon_total_cocok IMMEDIATE;
    v_lolos := TRUE;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM tender_subkon WHERE id = v_tender;
    RAISE EXCEPTION '437 gagal: total disunting melenceng dari rinciannya TETAP DITERIMA';
  END IF;

  -- 5. Kode item KEMBAR dalam satu penawaran ditolak.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO penawaran_subkon_item (penawaran_id, kode_item, uraian, volume, harga_satuan)
    VALUES (v_pen, 'A.1', 'Galian tanah (kembar)', 0, 0);
    v_lolos := TRUE;
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM tender_subkon WHERE id = v_tender;
    RAISE EXCEPTION '437 gagal: kode item KEMBAR dalam satu penawaran DITERIMA';
  END IF;

  -- 6. Penawar yang menyatakan TIDAK MENAWAR tak boleh punya rincian.
  SELECT id INTO v_worker FROM workers WHERE id <> v_worker LIMIT 1;
  IF v_worker IS NOT NULL THEN
    INSERT INTO penawaran_subkon (tender_id, worker_id, nilai_penawaran, tidak_menawar)
    VALUES (v_tender, v_worker, 0, TRUE)
    RETURNING id INTO v_pen2;

    v_lolos := FALSE;
    BEGIN
      INSERT INTO penawaran_subkon_item (penawaran_id, uraian, volume, harga_satuan)
      VALUES (v_pen2, 'Rincian yang tak seharusnya ada', 1, 1000);
      SET CONSTRAINTS trg_penawaran_subkon_item_cocok IMMEDIATE;
      v_lolos := TRUE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    IF v_lolos THEN
      DELETE FROM tender_subkon WHERE id = v_tender;
      RAISE EXCEPTION '437 gagal: penawar TIDAK MENAWAR boleh melampirkan rincian harga';
    END IF;
  END IF;

  -- 7. Menghapus SELURUH item mengembalikan penawaran ke "total saja" — sah.
  DELETE FROM penawaran_subkon_item WHERE penawaran_id = v_pen;
  IF NOT EXISTS (SELECT 1 FROM penawaran_subkon WHERE id = v_pen AND nilai_penawaran = 50000000) THEN
    DELETE FROM tender_subkon WHERE id = v_tender;
    RAISE EXCEPTION '437 gagal: menghapus seluruh rincian merusak penawarannya';
  END IF;

  -- ── Bersihkan fixture. CASCADE menurunkan penawaran + itemnya.
  DELETE FROM tender_subkon WHERE id = v_tender;

  SELECT count(*) INTO v_sisa FROM tender_subkon WHERE nomor = '[437-TND]';
  IF v_sisa <> 0 THEN
    RAISE EXCEPTION '437 gagal: fixture uji tak terbersihkan (% tersisa)', v_sisa;
  END IF;

  RAISE NOTICE '437 OK — item opsional (penawaran tanpa rincian tetap sah), '
    'total DIVALIDASI dua arah terhadap rincian, kode kembar ditolak, '
    'penawar tidak-menawar tak boleh berincian, fixture bersih';
END $$;
