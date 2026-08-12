-- ════════════════════════════════════════════════════════════════════════════
-- 325 — Opname Bersama (D1): berita acara pengukuran yang mengunci pembayaran
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa migrasi BARU, bukan menjalankan ulang 044
--
-- `ledger-diff.mjs` memberi verdict TERCATAT-TAPI-ARTEFAK-HILANG untuk
-- migrasi 044: buku migrasi berkata sudah jalan, tabelnya tak ada di basis.
-- Diaudit 2026-08-12 bersama 15 migrasi lain bernasib sama.
--
-- Menjalankan ulang 044 ditolak karena tiga alasan:
--
--   1. Rancangan 2024 itu tak mengenal `company_id`. Repo ini sekarang
--      multi-tenant; tabel tanpa `company_id` langsung ditolak penjaga
--      tenancy dan tak bisa dipakai `request.db`.
--   2. 044 juga menyentuh `work_scopes` (kolom kontrak & tanda tangan) yang
--      SUDAH ADA dan benar. Menjalankan ulang mengulang yang tak perlu.
--   3. Menulis ke `supabase_migrations.schema_migrations` adalah Gerbang
--      Keras G-2. Migrasi maju bernomor tak menyentuhnya sama sekali.
--
-- Kolom `progress_payments.opname_report_id` dan `requires_opname` SUDAH ADA
-- (dua-duanya artefak 044 yang selamat). Migrasi ini melengkapi sisinya yang
-- hilang, lalu memasang FK-nya.
--
-- ── Lubang yang ditutup
--
-- Diukur 2026-08-12:
--
--     17 dari 20 work_scope wajib opname (borongan 14, progress_pct 3)
--      5 dari  5 progress_payment bertanda `requires_opname = true`
--      0 punya `opname_report_id`
--      0 baris kode membaca kedua kolom itu
--
-- Gerbang yang dijanjikan schema sejak 2024, tak pernah ditegakkan siapa pun.
-- Pembayaran ke mandor lolos tanpa berita acara pengukuran bersama.
--
-- ── Kenapa "bersama"
--
-- Opname bukan pengukuran sepihak. Yang membuatnya bernilai adalah DUA pihak
-- menyaksikan angka yang sama: pelaksana yang mengukur, dan penyetuju yang
-- memverifikasi. Karena itu `diukur_oleh` dan `diverifikasi_oleh` terpisah,
-- dan penyetuju tak boleh sama dengan pengukur (SoD — sama dengan TJS-P4).
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE opname_status AS ENUM ('diajukan', 'diverifikasi', 'disengketakan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS opname_bersama (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- `company_id` DINYATAKAN, bukan hanya diwarisi lewat proyek.
  --
  -- Kategori C (lewat project_id) menuntut JOIN pada tiap policy RLS, dan
  -- policy ber-JOIN mahal serta mudah salah. Rancangan 044 tak punya ini
  -- sama sekali — itulah alasan utama ia tak bisa dijalankan ulang apa adanya.
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id),
  work_scope_id   uuid NOT NULL REFERENCES work_scopes(id) ON DELETE CASCADE,

  nomor           text NOT NULL,
  tanggal_opname  date NOT NULL,

  -- ── Dua pihak, dua kolom ────────────────────────────────────────────────
  diukur_oleh         uuid NOT NULL REFERENCES users(id),
  diverifikasi_oleh   uuid REFERENCES users(id),
  diverifikasi_pada   timestamptz,

  status          opname_status NOT NULL DEFAULT 'diajukan',
  alasan_sengketa text,

  catatan         text,
  -- Foto bukti. Array, bukan tabel terpisah: opname punya 2-5 foto dan tak
  -- pernah dicari per-foto. Tabel terpisah hanya menambah join tanpa
  -- menjawab satu pertanyaan pun.
  foto_url        text[] NOT NULL DEFAULT '{}',

  dibuat_pada     timestamptz NOT NULL DEFAULT now(),
  diubah_pada     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, nomor),

  -- Sengketa WAJIB beralasan. Sengketa tanpa alasan menghentikan pembayaran
  -- tanpa memberi tahu siapa pun apa yang harus diperbaiki.
  CHECK (status <> 'disengketakan' OR btrim(coalesce(alasan_sengketa, '')) <> ''),

  -- Verifikasi WAJIB punya penyetuju dan waktunya. Status `diverifikasi`
  -- tanpa `diverifikasi_oleh` adalah gerbang yang mengaku terbuka tanpa
  -- seorang pun membukanya.
  CHECK (status <> 'diverifikasi' OR (diverifikasi_oleh IS NOT NULL AND diverifikasi_pada IS NOT NULL)),

  -- ── SoD: pengukur tak boleh memverifikasi ukurannya sendiri ─────────────
  --
  -- Sama dengan TJS-P4 dan alasan yang sama: yang membuat opname bernilai
  -- adalah DUA pihak menyaksikan angka yang sama. Satu orang yang mengukur
  -- lalu menyetujui sendiri menghasilkan berita acara yang isinya persis
  -- sama dengan klaim sepihak.
  --
  -- Ditegakkan di BASIS, bukan hanya aplikasi: importer dan skrip perbaikan
  -- data menulis ke sini juga.
  CHECK (diverifikasi_oleh IS NULL OR diverifikasi_oleh <> diukur_oleh)
);

CREATE INDEX IF NOT EXISTS idx_opname_company  ON opname_bersama (company_id, tanggal_opname DESC);
CREATE INDEX IF NOT EXISTS idx_opname_scope    ON opname_bersama (work_scope_id, status);
CREATE INDEX IF NOT EXISTS idx_opname_proyek   ON opname_bersama (project_id);

-- ── Baris ukur per item ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opname_bersama_item (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opname_id       uuid NOT NULL REFERENCES opname_bersama(id) ON DELETE CASCADE,
  -- Boleh NULL: opname bisa dilakukan di level lingkup keseluruhan, sebelum
  -- item detailnya diisi. Alasan yang sama sudah ditulis di migrasi 044.
  scope_item_id   uuid REFERENCES work_scope_items(id) ON DELETE SET NULL,

  uraian          text NOT NULL CHECK (btrim(uraian) <> ''),
  satuan          text NOT NULL,
  volume_rencana  numeric,
  volume_terukur  numeric NOT NULL CHECK (volume_terukur >= 0),

  -- Persen selesai DISIMPAN, bukan dihitung saat baca.
  --
  -- Volume rencana bisa berubah lewat change order sesudah opname; menghitung
  -- ulang membuat berita acara yang sudah ditandatangani berubah angkanya
  -- sendiri. Yang ditandatangani harus tetap seperti saat ditandatangani.
  pct_selesai     numeric NOT NULL CHECK (pct_selesai >= 0 AND pct_selesai <= 100),

  catatan         text,
  urutan          int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_opname_item_induk ON opname_bersama_item (opname_id, urutan);

-- ── Sesudah diverifikasi, berita acara TAK BOLEH berubah ────────────────────
--
-- Berita acara yang bisa disunting sesudah ditandatangani bukan berita acara.
-- Yang boleh berubah hanya perpindahan ke `disengketakan` — itulah jalan
-- keluar yang sah bila salah satu pihak menemukan kekeliruan.
CREATE OR REPLACE FUNCTION fn_opname_terkunci() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'diverifikasi' AND NEW.status <> 'disengketakan' THEN
    RAISE EXCEPTION
      'Opname % sudah diverifikasi dan tak bisa diubah. Ajukan sengketa bila ada kekeliruan.',
      OLD.nomor;
  END IF;
  NEW.diubah_pada := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_opname_terkunci ON opname_bersama;
CREATE TRIGGER trg_opname_terkunci
  BEFORE UPDATE ON opname_bersama
  FOR EACH ROW EXECUTE FUNCTION fn_opname_terkunci();

-- Item ikut terkunci: mengubah volume terukur sesudah verifikasi sama saja
-- mengubah isi berita acaranya.
CREATE OR REPLACE FUNCTION fn_opname_item_terkunci() RETURNS trigger AS $$
DECLARE
  st opname_status;
BEGIN
  SELECT status INTO st FROM opname_bersama
   WHERE id = COALESCE(NEW.opname_id, OLD.opname_id);
  IF st = 'diverifikasi' THEN
    RAISE EXCEPTION 'Item opname tak bisa diubah setelah berita acaranya diverifikasi.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_opname_item_terkunci ON opname_bersama_item;
CREATE TRIGGER trg_opname_item_terkunci
  BEFORE INSERT OR UPDATE OR DELETE ON opname_bersama_item
  FOR EACH ROW EXECUTE FUNCTION fn_opname_item_terkunci();

-- ── FK yang hilang sejak 044 ────────────────────────────────────────────────
--
-- `progress_payments.opname_report_id` ada sejak 2024 TANPA foreign key —
-- tabel tujuannya tak pernah terbentuk. Sekarang dipasang, jadi id yang
-- menunjuk berita acara tak ada akan ditolak basis.
DO $$ BEGIN
  ALTER TABLE progress_payments
    ADD CONSTRAINT progress_payments_opname_fkey
    FOREIGN KEY (opname_report_id) REFERENCES opname_bersama(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- T5A menemukan 30 tabel MATI TOTAL karena RLS menyala tanpa policy
-- PERMISSIVE: `(OR semua PERMISSIVE) AND (AND semua RESTRICTIVE)`, dan OR
-- atas himpunan kosong bernilai FALSE.
ALTER TABLE opname_bersama      ENABLE ROW LEVEL SECURITY;
ALTER TABLE opname_bersama_item ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opname_baca ON opname_bersama;
CREATE POLICY opname_baca ON opname_bersama
  FOR SELECT USING ((SELECT has_permission('mandor:view')));

DROP POLICY IF EXISTS opname_tulis ON opname_bersama;
CREATE POLICY opname_tulis ON opname_bersama
  FOR ALL USING ((SELECT has_permission('opname:kelola')))
          WITH CHECK ((SELECT has_permission('opname:kelola')));

DROP POLICY IF EXISTS opname_item_baca ON opname_bersama_item;
CREATE POLICY opname_item_baca ON opname_bersama_item
  FOR SELECT USING ((SELECT has_permission('mandor:view')));

DROP POLICY IF EXISTS opname_item_tulis ON opname_bersama_item;
CREATE POLICY opname_item_tulis ON opname_bersama_item
  FOR ALL USING ((SELECT has_permission('opname:kelola')))
          WITH CHECK ((SELECT has_permission('opname:kelola')));

-- ── Izin ────────────────────────────────────────────────────────────────────
--
-- DUA izin terpisah, dan itu inti modul ini: yang mengukur di lapangan bukan
-- yang memverifikasi. Menyatukannya membuat SoD di atas jadi hiasan — siapa
-- pun yang boleh mengukur juga boleh menyetujui ukurannya sendiri lewat akun
-- kedua.
INSERT INTO permissions (key, module, label, description, sort_order)
SELECT v.key, 'mandor', v.label, v.deskripsi,
       COALESCE((SELECT max(sort_order) FROM permissions), 0) + v.n
  FROM (VALUES
    ('opname:kelola',   'Buat opname bersama',
     'Mengukur volume terpasang di lapangan dan mengajukan berita acaranya.', 1),
    ('opname:verifikasi', 'Verifikasi opname',
     'Menyetujui berita acara opname. Tak boleh memverifikasi opname yang diukur sendiri.', 2)
  ) AS v(key, label, deskripsi, n)
 WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = v.key);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('opname:kelola', 'opname:verifikasi')
   AND r.name IN ('admin', 'direktur')
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- PM mengukur di lapangan, tetapi TIDAK memverifikasi — itu pemisahannya.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'opname:kelola'
   AND r.name = 'pm'
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- ------------------------------------------------------------
-- Verifikasi — dibuktikan LANGSUNG di basis
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
  co uuid; pr uuid; ws uuid; u1 uuid; u2 uuid; op uuid;
BEGIN
  FOR n IN SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM permissions WHERE key = 'opname:verifikasi') LOOP
    RAISE EXCEPTION '325 gagal: izin opname:verifikasi tak terbentuk';
  END LOOP;

  -- Izin yang tak sampai ke role mana pun = fitur mati total (pelajaran 321).
  FOR n IN
    SELECT 1 FROM permissions p WHERE p.key LIKE 'opname:%'
      AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id)
  LOOP
    RAISE EXCEPTION '325 gagal: ada izin opname yang tak diberikan ke role mana pun';
  END LOOP;

  SELECT count(*) INTO n FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname IN ('opname_bersama','opname_bersama_item') AND p.polpermissive;
  IF n < 4 THEN
    RAISE EXCEPTION '325 gagal: % policy PERMISSIVE (butuh >= 4) — tabel akan mati total', n;
  END IF;

  -- FK yang hilang sejak 044 harus terpasang.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'progress_payments'::regclass
       AND conname = 'progress_payments_opname_fkey'
  ) THEN
    RAISE EXCEPTION '325 gagal: FK progress_payments.opname_report_id tak terpasang';
  END IF;

  SELECT id INTO co FROM companies LIMIT 1;
  SELECT id INTO pr FROM projects WHERE company_id = co LIMIT 1;
  SELECT ws2.id INTO ws FROM work_scopes ws2 LIMIT 1;
  SELECT id INTO u1 FROM users LIMIT 1;
  SELECT id INTO u2 FROM users WHERE id <> u1 LIMIT 1;
  IF co IS NULL OR pr IS NULL OR ws IS NULL OR u2 IS NULL THEN
    RAISE NOTICE '325: basis tak lengkap untuk uji perilaku — dilewati';
    RETURN;
  END IF;

  -- SoD: pengukur tak boleh jadi penyetuju.
  BEGIN
    INSERT INTO opname_bersama (company_id, project_id, work_scope_id, nomor, tanggal_opname,
                                diukur_oleh, diverifikasi_oleh, diverifikasi_pada, status)
    VALUES (co, pr, ws, '[325-UJI-SOD]', CURRENT_DATE, u1, u1, now(), 'diverifikasi');
    RAISE EXCEPTION '325 gagal: pengukur BISA memverifikasi opname-nya sendiri';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Verifikasi tanpa penyetuju ditolak.
  BEGIN
    INSERT INTO opname_bersama (company_id, project_id, work_scope_id, nomor, tanggal_opname,
                                diukur_oleh, status)
    VALUES (co, pr, ws, '[325-UJI-KOSONG]', CURRENT_DATE, u1, 'diverifikasi');
    RAISE EXCEPTION '325 gagal: status diverifikasi DITERIMA tanpa penyetuju';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Sengketa tanpa alasan ditolak.
  BEGIN
    INSERT INTO opname_bersama (company_id, project_id, work_scope_id, nomor, tanggal_opname,
                                diukur_oleh, status)
    VALUES (co, pr, ws, '[325-UJI-SENGKETA]', CURRENT_DATE, u1, 'disengketakan');
    RAISE EXCEPTION '325 gagal: sengketa DITERIMA tanpa alasan';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Yang sah diterima, lalu dibuktikan TERKUNCI sesudah diverifikasi.
  INSERT INTO opname_bersama (company_id, project_id, work_scope_id, nomor, tanggal_opname,
                              diukur_oleh, diverifikasi_oleh, diverifikasi_pada, status)
  VALUES (co, pr, ws, '[325-UJI]', CURRENT_DATE, u1, u2, now(), 'diverifikasi')
  RETURNING id INTO op;

  BEGIN
    UPDATE opname_bersama SET catatan = 'diubah' WHERE id = op;
    RAISE EXCEPTION '325 gagal: opname terverifikasi BISA diubah';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '325 gagal%' THEN RAISE; END IF;
  END;

  -- Sengketa TETAP boleh — itu jalan keluar yang sah.
  UPDATE opname_bersama
     SET status = 'disengketakan', alasan_sengketa = 'uji migrasi 325'
   WHERE id = op;

  DELETE FROM opname_bersama WHERE nomor LIKE '[325-UJI%';

  RAISE NOTICE '325 OK — opname_bersama ada, SoD & kunci-sesudah-verifikasi ditegakkan basis';
END $$;
