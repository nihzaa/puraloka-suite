-- ════════════════════════════════════════════════════════════════════════════
-- 328 — Surat Perintah Kerja (E1): rantai yang putus antara menang dan bekerja
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Yang diukur 2026-08-12
--
-- Rantai subkontrak di repo ini sudah panjang, tetapi putus tepat di
-- tengahnya:
--
--     tender_subkon        3 tender, 1 penawaran MENANG      ADA
--     penawaran_subkon     nilai, waktu kerja, alasan pilih  ADA
--     ────────────────────────────────────────────────────────────
--     SPK                  perintah kerja resmi              TAK ADA
--     ────────────────────────────────────────────────────────────
--     work_scopes          20 lingkup, pembayaran, retensi   ADA
--     opname_bersama       pengukuran bersama (D1)           ADA
--     progress_payments    pembayaran progres                ADA
--
-- Diukur: NOL dari 3 tender punya `work_scope_id`. Satu penawaran menang, dan
-- tak ada apa pun yang menghubungkannya ke lingkup kerja yang dikerjakan.
--
-- Lebih jauh: `work_scopes` sudah punya LIMA kolom kontrak sejak migrasi 044 —
-- `contract_pdf_url`, `contract_signed_at`, `mandor_signature_url`,
-- `pm_signature_url`, `contract_status` — dan kelimanya **tak pernah dibaca
-- satu baris kode pun**. Dua puluh dari dua puluh lingkup kerja berstatus
-- `unsigned`, termasuk yang bernilai Rp 280 juta.
--
-- Pola yang sama dengan `requires_opname` (D1): kolom yang menjanjikan
-- gerbang, tanpa apa pun yang menegakkannya.
--
-- ── Kenapa tabel sendiri, bukan mengisi kolom `work_scopes` yang ada
--
-- Kolom di `work_scopes` menyimpan HASIL (sudah ditandatangani atau belum).
-- Yang tak bisa disimpannya: nomor SPK, tanggal terbit, lingkup yang
-- diperintahkan, jangka waktu, sanksi keterlambatan, dan siapa yang
-- menerbitkan — isi surat itu sendiri.
--
-- Satu lingkup kerja juga bisa punya SPK susulan (addendum) saat lingkupnya
-- bertambah. Kolom tunggal memaksa yang kedua menimpa yang pertama, dan
-- jejak perintah pertama hilang.
--
-- Kolom `work_scopes` TETAP dipakai sebagai cache status — diperbarui trigger
-- di bawah, supaya layar yang sudah membacanya tak perlu diubah.
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE spk_status AS ENUM ('draf', 'diterbitkan', 'ditandatangani', 'dibatalkan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS surat_perintah_kerja (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id),
  work_scope_id   uuid NOT NULL REFERENCES work_scopes(id) ON DELETE CASCADE,

  -- Tender yang mendasarinya. Boleh NULL: tak semua pekerjaan ditenderkan
  -- (penunjukan langsung untuk nilai kecil adalah praktik yang sah), tetapi
  -- yang ADA tendernya harus bisa dirunut balik.
  tender_id       uuid REFERENCES tender_subkon(id) ON DELETE SET NULL,
  penawaran_id    uuid REFERENCES penawaran_subkon(id) ON DELETE SET NULL,

  nomor           text NOT NULL,
  tanggal_terbit  date NOT NULL,

  -- ── Isi surat ───────────────────────────────────────────────────────────
  lingkup_kerja   text NOT NULL CHECK (btrim(lingkup_kerja) <> ''),
  nilai_kontrak   numeric NOT NULL CHECK (nilai_kontrak > 0),
  tanggal_mulai   date NOT NULL,
  tanggal_selesai date NOT NULL,

  -- Sanksi keterlambatan. Nol berarti "tak ada sanksi" dan itu SAH —
  -- dibedakan dari null yang berarti "belum diputuskan".
  denda_per_hari  numeric CHECK (denda_per_hari IS NULL OR denda_per_hari >= 0),
  denda_maks_pct  numeric CHECK (denda_maks_pct IS NULL OR (denda_maks_pct >= 0 AND denda_maks_pct <= 100)),

  syarat_khusus   text,

  -- ── Tanda tangan dua pihak ──────────────────────────────────────────────
  --
  -- SPK yang hanya ditandatangani satu pihak bukan perintah yang disepakati;
  -- ia pemberitahuan. Yang membuatnya mengikat adalah penerimaan pelaksana.
  ttd_penerbit_url  text,
  ttd_penerbit_pada timestamptz,
  ttd_pelaksana_url text,
  ttd_pelaksana_pada timestamptz,

  status          spk_status NOT NULL DEFAULT 'draf',
  alasan_batal    text,

  pdf_url         text,
  diterbitkan_oleh uuid NOT NULL REFERENCES users(id),
  dibuat_pada     timestamptz NOT NULL DEFAULT now(),
  diubah_pada     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, nomor),

  -- Tanggal selesai tak boleh mendahului mulai. Jangka waktu negatif membuat
  -- perhitungan denda keterlambatan menghasilkan angka yang tak masuk akal
  -- sejak hari pertama.
  CHECK (tanggal_selesai >= tanggal_mulai),

  -- `ditandatangani` menuntut KEDUA tanda tangan. Status yang berkata sudah
  -- ditandatangani dengan satu pihak saja adalah klaim sepihak berlabel
  -- kesepakatan.
  CHECK (status <> 'ditandatangani'
         OR (ttd_penerbit_url IS NOT NULL AND ttd_pelaksana_url IS NOT NULL)),

  -- Pembatalan WAJIB beralasan.
  CHECK (status <> 'dibatalkan' OR btrim(coalesce(alasan_batal, '')) <> '')
);

CREATE INDEX IF NOT EXISTS idx_spk_company ON surat_perintah_kerja (company_id, tanggal_terbit DESC);
CREATE INDEX IF NOT EXISTS idx_spk_scope   ON surat_perintah_kerja (work_scope_id, status);
CREATE INDEX IF NOT EXISTS idx_spk_tender  ON surat_perintah_kerja (tender_id)
  WHERE tender_id IS NOT NULL;

-- ── Sesudah DITANDATANGANI, isinya terkunci ─────────────────────────────────
--
-- Yang boleh berubah hanya perpindahan ke `dibatalkan` — pembatalan adalah
-- keputusan yang sah dan tercatat. Mengubah nilai atau jangka waktu sesudah
-- kedua pihak menandatangani berarti mengubah kesepakatan sepihak.
CREATE OR REPLACE FUNCTION fn_spk_terkunci() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'ditandatangani' AND NEW.status <> 'dibatalkan' THEN
    IF NEW.nilai_kontrak IS DISTINCT FROM OLD.nilai_kontrak
       OR NEW.lingkup_kerja IS DISTINCT FROM OLD.lingkup_kerja
       OR NEW.tanggal_mulai IS DISTINCT FROM OLD.tanggal_mulai
       OR NEW.tanggal_selesai IS DISTINCT FROM OLD.tanggal_selesai
       OR NEW.denda_per_hari IS DISTINCT FROM OLD.denda_per_hari THEN
      RAISE EXCEPTION
        'SPK % sudah ditandatangani kedua pihak; nilai, lingkup, jangka waktu, '
        'dan denda tak bisa diubah. Terbitkan addendum bila lingkupnya berubah.',
        OLD.nomor;
    END IF;
  END IF;
  NEW.diubah_pada := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_spk_terkunci ON surat_perintah_kerja;
CREATE TRIGGER trg_spk_terkunci
  BEFORE UPDATE ON surat_perintah_kerja
  FOR EACH ROW EXECUTE FUNCTION fn_spk_terkunci();

-- ── Cache status ke `work_scopes` ───────────────────────────────────────────
--
-- Lima kolom kontrak di `work_scopes` sudah ada sejak 2024 dan tak pernah
-- terisi. Trigger ini mengisinya dari SPK, supaya:
--
--   1. layar yang sudah membaca `contract_status` (mis. tender-subkon) tak
--      perlu diubah, dan
--   2. angka "20 dari 20 unsigned" berhenti berbohong begitu SPK pertama
--      ditandatangani.
--
-- Cache, bukan sumber kebenaran: yang benar tetap `surat_perintah_kerja`.
CREATE OR REPLACE FUNCTION fn_spk_sinkron_scope() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'ditandatangani' THEN
    UPDATE work_scopes
       SET contract_status      = 'signed',
           contract_signed_at   = COALESCE(NEW.ttd_pelaksana_pada, NEW.ttd_penerbit_pada, now()),
           contract_pdf_url     = COALESCE(NEW.pdf_url, contract_pdf_url),
           pm_signature_url     = COALESCE(NEW.ttd_penerbit_url, pm_signature_url),
           mandor_signature_url = COALESCE(NEW.ttd_pelaksana_url, mandor_signature_url)
     WHERE id = NEW.work_scope_id;
  ELSIF NEW.status = 'dibatalkan' THEN
    -- Dikembalikan ke `unsigned` HANYA bila tak ada SPK lain yang masih
    -- berlaku untuk lingkup kerja itu. Tanpa syarat ini, membatalkan
    -- addendum akan menghapus status kontrak induknya.
    IF NOT EXISTS (
      SELECT 1 FROM surat_perintah_kerja s
       WHERE s.work_scope_id = NEW.work_scope_id
         AND s.id <> NEW.id
         AND s.status = 'ditandatangani'
    ) THEN
      UPDATE work_scopes SET contract_status = 'unsigned' WHERE id = NEW.work_scope_id;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_spk_sinkron_scope ON surat_perintah_kerja;
CREATE TRIGGER trg_spk_sinkron_scope
  AFTER INSERT OR UPDATE OF status ON surat_perintah_kerja
  FOR EACH ROW EXECUTE FUNCTION fn_spk_sinkron_scope();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE surat_perintah_kerja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spk_baca ON surat_perintah_kerja;
CREATE POLICY spk_baca ON surat_perintah_kerja
  FOR SELECT USING ((SELECT has_permission('mandor:view')));

DROP POLICY IF EXISTS spk_tulis ON surat_perintah_kerja;
CREATE POLICY spk_tulis ON surat_perintah_kerja
  FOR ALL USING ((SELECT has_permission('spk:kelola')))
          WITH CHECK ((SELECT has_permission('spk:kelola')));

-- ── Izin ────────────────────────────────────────────────────────────────────
INSERT INTO permissions (key, module, label, description, sort_order)
SELECT v.key, 'mandor', v.label, v.deskripsi,
       COALESCE((SELECT max(sort_order) FROM permissions), 0) + v.n
  FROM (VALUES
    ('spk:kelola', 'Kelola SPK',
     'Menyusun dan menerbitkan surat perintah kerja ke subkontraktor.', 1),
    ('spk:tandatangan', 'Tanda tangani SPK',
     'Membubuhkan tanda tangan penerbit pada SPK.', 2)
  ) AS v(key, label, deskripsi, n)
 WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = v.key);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('spk:kelola', 'spk:tandatangan')
   AND r.name IN ('admin', 'direktur')
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- PM menyusun SPK, tetapi penandatanganan penerbit tetap di tangan yang
-- berwenang mengikat perusahaan.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'spk:kelola'
   AND r.name = 'pm'
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- ------------------------------------------------------------
-- Verifikasi — dibuktikan LANGSUNG di basis
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
  co uuid; pr uuid; ws uuid; u1 uuid; sp uuid; st text;
BEGIN
  FOR n IN SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM permissions WHERE key = 'spk:tandatangan') LOOP
    RAISE EXCEPTION '328 gagal: izin spk:tandatangan tak terbentuk';
  END LOOP;

  FOR n IN
    SELECT 1 FROM permissions p WHERE p.key LIKE 'spk:%'
      AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id)
  LOOP
    RAISE EXCEPTION '328 gagal: ada izin spk yang tak diberikan ke role mana pun';
  END LOOP;

  SELECT count(*) INTO n FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname = 'surat_perintah_kerja' AND p.polpermissive;
  IF n < 2 THEN
    RAISE EXCEPTION '328 gagal: % policy PERMISSIVE (butuh >= 2) — tabel akan mati total', n;
  END IF;

  -- Fixture dipilih menurut SYARATNYA, bukan `LIMIT 1` apa adanya.
  --
  -- Versi pertama mengambil company pertama, dan company itu punya 1 proyek
  -- dengan NOL work_scope — seluruh blok verifikasi perilaku dilewati, dan
  -- migrasi melaporkan sukses tanpa menguji satu pun aturannya.
  --
  -- Hijau yang melewati adalah hijau yang paling meyakinkan sekaligus paling
  -- kosong. Pelajaran yang sama sudah muncul di test D1 dan D3 hari ini.
  SELECT ws2.id, ma.project_id, p.company_id
    INTO ws, pr, co
    FROM work_scopes ws2
    JOIN mandor_assignments ma ON ma.id = ws2.assignment_id
    JOIN projects p ON p.id = ma.project_id
   LIMIT 1;
  SELECT id INTO u1 FROM users LIMIT 1;
  IF co IS NULL OR pr IS NULL OR ws IS NULL OR u1 IS NULL THEN
    RAISE NOTICE '328: basis tak lengkap untuk uji perilaku — dilewati';
    RETURN;
  END IF;

  -- Tanggal terbalik ditolak.
  BEGIN
    INSERT INTO surat_perintah_kerja (company_id, project_id, work_scope_id, nomor,
      tanggal_terbit, lingkup_kerja, nilai_kontrak, tanggal_mulai, tanggal_selesai, diterbitkan_oleh)
    VALUES (co, pr, ws, '[328-UJI-TGL]', CURRENT_DATE, 'uji', 1000,
            CURRENT_DATE, CURRENT_DATE - 1, u1);
    RAISE EXCEPTION '328 gagal: tanggal_selesai < tanggal_mulai DITERIMA';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Nilai nol ditolak.
  BEGIN
    INSERT INTO surat_perintah_kerja (company_id, project_id, work_scope_id, nomor,
      tanggal_terbit, lingkup_kerja, nilai_kontrak, tanggal_mulai, tanggal_selesai, diterbitkan_oleh)
    VALUES (co, pr, ws, '[328-UJI-NOL]', CURRENT_DATE, 'uji', 0,
            CURRENT_DATE, CURRENT_DATE + 30, u1);
    RAISE EXCEPTION '328 gagal: nilai_kontrak nol DITERIMA';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- `ditandatangani` tanpa dua tanda tangan ditolak.
  BEGIN
    INSERT INTO surat_perintah_kerja (company_id, project_id, work_scope_id, nomor,
      tanggal_terbit, lingkup_kerja, nilai_kontrak, tanggal_mulai, tanggal_selesai,
      diterbitkan_oleh, status, ttd_penerbit_url)
    VALUES (co, pr, ws, '[328-UJI-SATU-TTD]', CURRENT_DATE, 'uji', 1000,
            CURRENT_DATE, CURRENT_DATE + 30, u1, 'ditandatangani', 'x.png');
    RAISE EXCEPTION '328 gagal: status ditandatangani DITERIMA dengan satu tanda tangan';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Yang sah diterima, lalu cache status di work_scopes dibuktikan tersinkron.
  INSERT INTO surat_perintah_kerja (company_id, project_id, work_scope_id, nomor,
    tanggal_terbit, lingkup_kerja, nilai_kontrak, tanggal_mulai, tanggal_selesai,
    diterbitkan_oleh, status, ttd_penerbit_url, ttd_penerbit_pada,
    ttd_pelaksana_url, ttd_pelaksana_pada)
  VALUES (co, pr, ws, '[328-UJI]', CURRENT_DATE, 'Pekerjaan uji migrasi', 5000000,
          CURRENT_DATE, CURRENT_DATE + 30, u1, 'ditandatangani',
          'penerbit.png', now(), 'pelaksana.png', now())
  RETURNING id INTO sp;

  SELECT contract_status INTO st FROM work_scopes WHERE id = ws;
  IF st <> 'signed' THEN
    RAISE EXCEPTION '328 gagal: work_scopes.contract_status masih % — trigger sinkron tak bekerja', st;
  END IF;

  -- Nilai kontrak TAK BISA diubah sesudah ditandatangani.
  BEGIN
    UPDATE surat_perintah_kerja SET nilai_kontrak = 9999999 WHERE id = sp;
    RAISE EXCEPTION '328 gagal: nilai SPK yang sudah ditandatangani BISA diubah';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '328 gagal%' THEN RAISE; END IF;
  END;

  -- Pembatalan tetap boleh, dan mengembalikan cache.
  UPDATE surat_perintah_kerja
     SET status = 'dibatalkan', alasan_batal = 'uji migrasi 328'
   WHERE id = sp;

  SELECT contract_status INTO st FROM work_scopes WHERE id = ws;
  IF st <> 'unsigned' THEN
    RAISE EXCEPTION '328 gagal: pembatalan tak mengembalikan contract_status (kini %)', st;
  END IF;

  DELETE FROM surat_perintah_kerja WHERE nomor LIKE '[328-UJI%';

  RAISE NOTICE '328 OK — SPK ada, dua tanda tangan & kunci-sesudah-ttd ditegakkan, cache work_scopes tersinkron';
END $$;
