-- ════════════════════════════════════════════════════════════════════════════
-- 337 — Klaim perjalanan (G1), dan `settled_at` yang tak pernah terisi
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Lubang 1: penggantian biaya tak punya jalurnya sendiri
--
-- Yang ada hari ini hanya KASBON — uang muka, dicairkan SEBELUM belanja.
-- Klaim perjalanan arah uangnya berlawanan: karyawan menalangi lebih dulu,
-- perusahaan mengganti sesudahnya.
--
-- Bedanya bukan istilah. Kasbon yang belum diselesaikan adalah PIUTANG
-- perusahaan kepada karyawan; klaim yang belum dibayar adalah UTANG. Mencatat
-- keduanya di satu tabel membuat saldo "kasbon beredar" salah tanda, dan
-- laporan arus kas menunjukkan uang yang tak pernah keluar.
--
-- Diukur 2026-08-12: nol tabel perjalanan/reimbursement. `expense_reports` dan
-- `project_expenses` yang muncul saat mencari keduanya NOL BARIS, dan keduanya
-- untuk biaya PROYEK, bukan pengeluaran pribadi yang ditalangi orang.
--
-- ── Lubang 2: `kasbons.settled_at` DIBACA tapi tak pernah DITULIS
--
-- `finance.ts` menghitung "kasbon lunas dalam periode" dengan:
--
--     .eq('status','settled').gte('settled_at', dari).lte('settled_at', sampai)
--
-- Diukur: 7 kasbon berstatus `settled` senilai Rp 54.000.000, dan **0 dari 56
-- kasbon punya `settled_at`**. Nol baris memenuhi `gte(...)`, jadi angka
-- "kasbon lunas periode ini" SELALU Rp 0 — bukan karena tak ada yang lunas,
-- melainkan karena tanggalnya tak pernah dicatat.
--
-- Tak ada satu pun rute yang menulis kolom itu; `PATCH /kasbons/:id/status`
-- hanya menerima `approved`/`rejected`. Status `settled` masuk lewat seed atau
-- tangan.
--
-- Migrasi ini menambal yang sudah terlanjur (dengan tanggal yang JUJUR: waktu
-- persetujuannya, bukan hari ini) dan memasang trigger supaya ke depan
-- kolomnya terisi sendiri. Rute pelunasan dibangun di commit yang sama.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Jenis ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'klaim_status') THEN
    -- `diajukan` → `disetujui` → `dibayar`, atau `ditolak` dari yang diajukan.
    --
    -- `dibayar` DIPISAH dari `disetujui` dengan sengaja: klaim yang disetujui
    -- tapi belum cair adalah UTANG yang harus terlihat di neraca. Menyatukan
    -- keduanya membuat utang itu lenyap dari pembukuan pada saat persetujuan.
    CREATE TYPE klaim_status AS ENUM ('diajukan', 'disetujui', 'ditolak', 'dibayar');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'klaim_jenis_biaya') THEN
    CREATE TYPE klaim_jenis_biaya AS ENUM (
      'transport', 'penginapan', 'konsumsi', 'bbm', 'tol_parkir', 'lain'
    );
  END IF;
END $$;

-- ── 2. Tabel induk ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS klaim_perjalanan (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Proyek OPSIONAL: perjalanan ke kantor pusat atau ke supplier bukan milik
  -- proyek mana pun, dan memaksanya membuat orang memilih proyek asal — yang
  -- lalu membebani anggaran proyek itu dengan biaya yang bukan miliknya.
  project_id        UUID REFERENCES projects(id) ON DELETE SET NULL,
  -- Pengaju adalah PEGAWAI, bukan user: yang menalangi punya identitas
  -- kepegawaian (nomor induk, jabatan), dan penggantiannya masuk ke orang itu
  -- — bukan ke akun yang kebetulan dipakai login.
  pegawai_id        UUID NOT NULL REFERENCES pegawai(id) ON DELETE RESTRICT,

  nomor             TEXT NOT NULL,
  tujuan            TEXT NOT NULL,
  keperluan         TEXT NOT NULL,
  tanggal_berangkat DATE NOT NULL,
  tanggal_kembali   DATE NOT NULL,

  -- Total DITURUNKAN dari rinciannya lewat trigger, tak pernah diketik.
  -- Angka yang bisa diketik akan menyimpang dari rinciannya, dan yang paling
  -- berkepentingan angkanya benar — pengaju — tak punya cara memeriksa.
  total_diajukan    NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Yang DISETUJUI bisa lebih kecil: penyetuju boleh memangkas item yang tak
  -- memenuhi kebijakan. Disimpan terpisah supaya selisihnya terlihat.
  total_disetujui   NUMERIC(15,2),

  status            klaim_status NOT NULL DEFAULT 'diajukan',
  alasan_tolak      TEXT,
  catatan           TEXT,

  disetujui_oleh    UUID REFERENCES users(id) ON DELETE SET NULL,
  disetujui_pada    TIMESTAMPTZ,
  dibayar_pada      TIMESTAMPTZ,
  cash_account_id   UUID REFERENCES cash_accounts(id) ON DELETE SET NULL,

  dibuat_oleh       UUID REFERENCES users(id) ON DELETE SET NULL,
  dibuat_pada       TIMESTAMPTZ NOT NULL DEFAULT now(),
  diubah_pada       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT klaim_perjalanan_nomor_unik UNIQUE (company_id, nomor),

  -- Pulang sebelum berangkat adalah perjalanan yang tak pernah terjadi.
  CONSTRAINT klaim_tanggal_wajar
    CHECK (tanggal_kembali >= tanggal_berangkat),

  -- Nominal negatif pada klaim berarti karyawan MEMBAYAR perusahaan — dan
  -- kalau itu yang dimaksud, tempatnya bukan di sini.
  CONSTRAINT klaim_nominal_wajar
    CHECK (total_diajukan >= 0 AND (total_disetujui IS NULL OR total_disetujui >= 0)),

  -- Yang disetujui tak boleh MELEBIHI yang diajukan. Penyetuju boleh
  -- memangkas, tak boleh menambah — menambah berarti membayar sesuatu yang
  -- tak pernah dimintakan dan tak punya bukti.
  CONSTRAINT klaim_disetujui_tak_melebihi
    CHECK (total_disetujui IS NULL OR total_disetujui <= total_diajukan),

  CONSTRAINT klaim_setuju_lengkap
    CHECK (
      status NOT IN ('disetujui', 'dibayar')
      OR (disetujui_oleh IS NOT NULL AND disetujui_pada IS NOT NULL
          AND total_disetujui IS NOT NULL)
    ),

  -- Dibayar WAJIB punya tanggal dan sumber dananya. Pembayaran tanpa akun kas
  -- adalah uang yang keluar dari mana pun — dan itu tak bisa direkonsiliasi.
  CONSTRAINT klaim_bayar_lengkap
    CHECK (status <> 'dibayar' OR (dibayar_pada IS NOT NULL AND cash_account_id IS NOT NULL)),

  CONSTRAINT klaim_tolak_beralasan
    CHECK (status <> 'ditolak' OR btrim(COALESCE(alasan_tolak, '')) <> '')
);

CREATE INDEX IF NOT EXISTS klaim_perjalanan_company_idx ON klaim_perjalanan (company_id);
CREATE INDEX IF NOT EXISTS klaim_perjalanan_pegawai_idx ON klaim_perjalanan (pegawai_id);
CREATE INDEX IF NOT EXISTS klaim_perjalanan_status_idx  ON klaim_perjalanan (company_id, status);

-- ── 3. Rincian ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS klaim_perjalanan_item (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  klaim_id      UUID NOT NULL REFERENCES klaim_perjalanan(id) ON DELETE CASCADE,
  jenis         klaim_jenis_biaya NOT NULL,
  uraian        TEXT NOT NULL,
  tanggal       DATE NOT NULL,
  nominal       NUMERIC(15,2) NOT NULL,
  -- Bukti opsional di basis, TAPI dituntut aplikasi di atas ambang tertentu.
  -- Dibuat begitu karena ambangnya kebijakan tenant (parkir Rp 5.000 tak
  -- berkuitansi adalah kenyataan lapangan), dan kebijakan tak boleh jadi
  -- CHECK yang menolak seluruh tenant.
  bukti_url     TEXT,
  catatan       TEXT,
  urutan        INT NOT NULL DEFAULT 0,
  dibuat_pada   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT klaim_item_nominal_positif CHECK (nominal > 0)
);

CREATE INDEX IF NOT EXISTS klaim_perjalanan_item_klaim_idx ON klaim_perjalanan_item (klaim_id);

-- ── 4. Total diturunkan dari rincian ────────────────────────────────────────
--
-- Bukan diketik. Total yang bisa diketik akan menyimpang dari rinciannya, dan
-- selisih itu baru ketahuan saat seseorang menjumlah ulang secara manual —
-- biasanya saat sengketa.
CREATE OR REPLACE FUNCTION fn_klaim_hitung_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_klaim UUID;
BEGIN
  v_klaim := COALESCE(NEW.klaim_id, OLD.klaim_id);

  UPDATE klaim_perjalanan
     SET total_diajukan = COALESCE(
           (SELECT sum(nominal) FROM klaim_perjalanan_item WHERE klaim_id = v_klaim), 0),
         diubah_pada = now()
   WHERE id = v_klaim;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_klaim_hitung_total ON klaim_perjalanan_item;
CREATE TRIGGER trg_klaim_hitung_total
  AFTER INSERT OR UPDATE OR DELETE ON klaim_perjalanan_item
  FOR EACH ROW EXECUTE FUNCTION fn_klaim_hitung_total();

-- ── 5. Rincian terkunci sesudah diputuskan ──────────────────────────────────
--
-- Menambah item pada klaim yang sudah disetujui berarti menaikkan nominal
-- sesudah penyetujunya melihat angka yang lain — dan `total_diajukan` ikut
-- naik lewat trigger di atas, tanpa satu pun jejak bahwa isinya berubah.
CREATE OR REPLACE FUNCTION fn_klaim_item_terkunci()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_status klaim_status;
  v_nomor  TEXT;
BEGIN
  SELECT status, nomor INTO v_status, v_nomor
    FROM klaim_perjalanan WHERE id = COALESCE(NEW.klaim_id, OLD.klaim_id);

  -- Klaim yang induknya sedang dihapus (CASCADE) → v_status NULL, izinkan.
  IF v_status IS NOT NULL AND v_status <> 'diajukan' THEN
    RAISE EXCEPTION
      'Rincian klaim % tak bisa diubah setelah diputuskan (status %). Ajukan klaim baru.',
      v_nomor, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_klaim_item_terkunci ON klaim_perjalanan_item;
CREATE TRIGGER trg_klaim_item_terkunci
  BEFORE INSERT OR UPDATE OR DELETE ON klaim_perjalanan_item
  FOR EACH ROW EXECUTE FUNCTION fn_klaim_item_terkunci();

-- ── 6. SoD: pengaju tak menyetujui klaimnya sendiri ─────────────────────────
--
-- Ditegakkan BASIS, bukan hanya aplikasi — importer dan psql menulis ke sini
-- juga (pelajaran 325/327). Yang dibandingkan `users.id` penyetuju dengan
-- `pegawai.user_id` pengaju: keduanya orang yang sama walau tabelnya beda.
CREATE OR REPLACE FUNCTION fn_klaim_sod()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_pengaju UUID;
BEGIN
  IF NEW.disetujui_oleh IS NULL THEN RETURN NEW; END IF;

  SELECT user_id INTO v_user_pengaju FROM pegawai WHERE id = NEW.pegawai_id;

  IF v_user_pengaju IS NOT NULL AND v_user_pengaju = NEW.disetujui_oleh THEN
    RAISE EXCEPTION
      'Pengaju tak bisa menyetujui klaim perjalanannya sendiri — uang yang keluar untuk diri sendiri wajib diputuskan orang lain'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_klaim_sod ON klaim_perjalanan;
CREATE TRIGGER trg_klaim_sod
  BEFORE INSERT OR UPDATE OF disetujui_oleh, pegawai_id ON klaim_perjalanan
  FOR EACH ROW EXECUTE FUNCTION fn_klaim_sod();

-- ── 7. diubah_pada ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_klaim_sentuh()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.diubah_pada := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_klaim_sentuh ON klaim_perjalanan;
CREATE TRIGGER trg_klaim_sentuh
  BEFORE UPDATE ON klaim_perjalanan
  FOR EACH ROW EXECUTE FUNCTION fn_klaim_sentuh();

-- ── 8. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE klaim_perjalanan      ENABLE ROW LEVEL SECURITY;
ALTER TABLE klaim_perjalanan      FORCE  ROW LEVEL SECURITY;
ALTER TABLE klaim_perjalanan_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE klaim_perjalanan_item FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS klaim_perjalanan_baca ON klaim_perjalanan;
CREATE POLICY klaim_perjalanan_baca ON klaim_perjalanan
  FOR SELECT USING (has_permission('klaim:view'));

DROP POLICY IF EXISTS klaim_perjalanan_tulis ON klaim_perjalanan;
CREATE POLICY klaim_perjalanan_tulis ON klaim_perjalanan
  FOR ALL USING (has_permission('klaim:kelola'))
  WITH CHECK (has_permission('klaim:kelola'));

-- Item mengikuti izin induknya — tak ada izin tersendiri untuk rincian, karena
-- rincian tanpa induknya tak bermakna apa pun.
DROP POLICY IF EXISTS klaim_perjalanan_item_baca ON klaim_perjalanan_item;
CREATE POLICY klaim_perjalanan_item_baca ON klaim_perjalanan_item
  FOR SELECT USING (has_permission('klaim:view'));

DROP POLICY IF EXISTS klaim_perjalanan_item_tulis ON klaim_perjalanan_item;
CREATE POLICY klaim_perjalanan_item_tulis ON klaim_perjalanan_item
  FOR ALL USING (has_permission('klaim:kelola'))
  WITH CHECK (has_permission('klaim:kelola'));

-- ── 9. Izin ─────────────────────────────────────────────────────────────────
INSERT INTO permissions (key, module, label, description, sort_order)
VALUES
  ('klaim:view', 'sdm', 'Lihat klaim perjalanan',
   'Melihat pengajuan penggantian biaya perjalanan dinas.', 1250),
  ('klaim:kelola', 'sdm', 'Ajukan klaim perjalanan',
   'Mengajukan dan menyunting klaim perjalanan sendiri.', 1251),
  ('klaim:setujui', 'sdm', 'Setujui klaim perjalanan',
   'Menyetujui atau menolak klaim — TERPISAH dari mengajukan, supaya pengaju tak memutuskan penggantiannya sendiri.', 1252),
  ('klaim:bayar', 'sdm', 'Bayar klaim perjalanan',
   'Mencairkan klaim yang sudah disetujui ke akun kas.', 1253)
ON CONFLICT (key) DO NOTHING;

-- Izin yang dibuat tapi tak diberikan = rute 403 untuk SEMUA orang, termasuk
-- admin (cacat migrasi 321). `view`/`kelola` diberikan seluas `sdm:pegawai:view`;
-- `setujui`/`bayar` menyusul kewenangan yang sudah memutuskan uang.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key IN ('klaim:view', 'klaim:kelola')
   AND EXISTS (
     SELECT 1 FROM role_permissions rp JOIN permissions pe ON pe.id = rp.permission_id
      WHERE rp.role_id = r.id AND pe.key = 'sdm:pegawai:view'
   )
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions x WHERE x.role_id = r.id AND x.permission_id = p.id
   );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
 WHERE p.key IN ('klaim:setujui', 'klaim:bayar')
   AND EXISTS (
     SELECT 1 FROM role_permissions rp JOIN permissions pe ON pe.id = rp.permission_id
      WHERE rp.role_id = r.id AND pe.key = 'mandor:kasbon:approve'
   )
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions x WHERE x.role_id = r.id AND x.permission_id = p.id
   );

-- ════════════════════════════════════════════════════════════════════════════
-- 10. `kasbons.settled_at` — kolom yang DIBACA laporan tapi tak pernah DITULIS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Diukur: 7 kasbon `settled` senilai Rp 54.000.000, dan 0 dari 56 punya
-- `settled_at`. `finance.ts` menyaring `.gte('settled_at', dari)` — nol baris
-- memenuhinya, jadi "kasbon lunas periode ini" selalu Rp 0.
--
-- ── Tanggal tambalan: `approved_at`, BUKAN now()
--
-- Memakai `now()` akan memindahkan Rp 54 juta pelunasan lama ke periode
-- BERJALAN, dan laporan arus kas bulan ini melonjak karena migrasi. Yang
-- paling mendekati kebenaran adalah waktu persetujuannya — dan kalau itu pun
-- tak ada, `created_at`.
UPDATE kasbons
   SET settled_at = COALESCE(approved_at, created_at)
 WHERE status = 'settled' AND settled_at IS NULL;

-- Ke depan: trigger mengisinya sendiri saat status berpindah ke `settled`,
-- dan MENGOSONGKANNYA bila status mundur — `settled_at` yang tertinggal pada
-- kasbon yang dibuka kembali membuatnya terhitung lunas dua kali.
CREATE OR REPLACE FUNCTION fn_kasbon_settled_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'settled' AND NEW.settled_at IS NULL THEN
    NEW.settled_at := now();
  ELSIF NEW.status <> 'settled' AND OLD.status = 'settled' THEN
    NEW.settled_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kasbon_settled_at ON kasbons;
CREATE TRIGGER trg_kasbon_settled_at
  BEFORE UPDATE OF status ON kasbons
  FOR EACH ROW EXECUTE FUNCTION fn_kasbon_settled_at();

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  co     UUID;
  peg    UUID;
  us     UUID;
  usLain UUID;
  kas    UUID;
  k1     UUID;
  n      INT;
  gagal  BOOLEAN;
BEGIN
  -- Fixture dipilih menurut SYARAT, bukan LIMIT 1 (pelajaran migrasi 328).
  SELECT p.company_id, p.id, p.user_id INTO co, peg, us
    FROM pegawai p
   WHERE p.user_id IS NOT NULL
   LIMIT 1;
  IF peg IS NULL THEN
    RAISE EXCEPTION '337 gagal: nol pegawai ber-user_id — verifikasi tak bisa dipercaya';
  END IF;

  SELECT u.id INTO usLain FROM users u WHERE u.id <> us LIMIT 1;
  SELECT ca.id INTO kas FROM cash_accounts ca WHERE ca.company_id = co LIMIT 1;

  -- 1. Klaim dasar terbentuk, total mulai dari 0.
  INSERT INTO klaim_perjalanan (company_id, pegawai_id, nomor, tujuan, keperluan,
                                tanggal_berangkat, tanggal_kembali)
  VALUES (co, peg, 'VERIF337-1', 'Jakarta', 'Rapat koordinasi',
          CURRENT_DATE - 3, CURRENT_DATE - 1)
  RETURNING id INTO k1;

  SELECT total_diajukan INTO n FROM klaim_perjalanan WHERE id = k1;
  IF n <> 0 THEN
    RAISE EXCEPTION '337 gagal: total awal % bukan 0', n;
  END IF;

  -- 2. Total DITURUNKAN dari rincian.
  INSERT INTO klaim_perjalanan_item (klaim_id, jenis, uraian, tanggal, nominal, urutan)
  VALUES (k1, 'transport', 'Tiket kereta PP', CURRENT_DATE - 3, 500000, 1),
         (k1, 'penginapan', 'Hotel 2 malam', CURRENT_DATE - 3, 700000, 2);

  SELECT total_diajukan INTO n FROM klaim_perjalanan WHERE id = k1;
  IF n <> 1200000 THEN
    RAISE EXCEPTION '337 gagal: total % bukan 1200000 — trigger penjumlah tak bekerja', n;
  END IF;

  -- 3. Menghapus item MENURUNKAN total.
  DELETE FROM klaim_perjalanan_item WHERE klaim_id = k1 AND jenis = 'penginapan';
  SELECT total_diajukan INTO n FROM klaim_perjalanan WHERE id = k1;
  IF n <> 500000 THEN
    RAISE EXCEPTION '337 gagal: total % sesudah hapus item bukan 500000', n;
  END IF;

  -- 4. Tanggal kembali mendahului berangkat DITOLAK.
  gagal := FALSE;
  BEGIN
    INSERT INTO klaim_perjalanan (company_id, pegawai_id, nomor, tujuan, keperluan,
                                  tanggal_berangkat, tanggal_kembali)
    VALUES (co, peg, 'VERIF337-MUNDUR', 'X', 'Y', CURRENT_DATE, CURRENT_DATE - 5);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '337 gagal: tanggal kembali sebelum berangkat DITERIMA';
  END IF;

  -- 5. Item bernominal nol/negatif DITOLAK.
  gagal := FALSE;
  BEGIN
    INSERT INTO klaim_perjalanan_item (klaim_id, jenis, uraian, tanggal, nominal)
    VALUES (k1, 'lain', 'gratis', CURRENT_DATE, 0);
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '337 gagal: item bernominal nol DITERIMA';
  END IF;

  -- 6. SoD — pengaju tak boleh menyetujui klaimnya sendiri.
  gagal := FALSE;
  BEGIN
    UPDATE klaim_perjalanan
       SET status = 'disetujui', disetujui_oleh = us, disetujui_pada = now(),
           total_disetujui = 500000
     WHERE id = k1;
  EXCEPTION WHEN check_violation THEN gagal := TRUE;
  END;
  IF NOT gagal THEN
    RAISE EXCEPTION '337 gagal: pengaju BISA menyetujui klaimnya sendiri';
  END IF;

  -- 7. Disetujui MELEBIHI diajukan DITOLAK.
  IF usLain IS NOT NULL THEN
    gagal := FALSE;
    BEGIN
      UPDATE klaim_perjalanan
         SET status = 'disetujui', disetujui_oleh = usLain, disetujui_pada = now(),
             total_disetujui = 900000
       WHERE id = k1;
    EXCEPTION WHEN check_violation THEN gagal := TRUE;
    END;
    IF NOT gagal THEN
      RAISE EXCEPTION '337 gagal: disetujui MELEBIHI diajukan DITERIMA';
    END IF;

    -- 8. Persetujuan sah oleh orang lain.
    UPDATE klaim_perjalanan
       SET status = 'disetujui', disetujui_oleh = usLain, disetujui_pada = now(),
           total_disetujui = 400000
     WHERE id = k1;

    -- 9. Rincian TERKUNCI sesudah diputuskan.
    gagal := FALSE;
    BEGIN
      INSERT INTO klaim_perjalanan_item (klaim_id, jenis, uraian, tanggal, nominal)
      VALUES (k1, 'lain', 'sisipan setelah setuju', CURRENT_DATE, 100000);
    EXCEPTION WHEN check_violation THEN gagal := TRUE;
    END;
    IF NOT gagal THEN
      RAISE EXCEPTION '337 gagal: rincian bisa ditambah SESUDAH klaim disetujui';
    END IF;

    -- 10. `dibayar` tanpa akun kas DITOLAK.
    gagal := FALSE;
    BEGIN
      UPDATE klaim_perjalanan SET status = 'dibayar', dibayar_pada = now() WHERE id = k1;
    EXCEPTION WHEN check_violation THEN gagal := TRUE;
    END;
    IF NOT gagal THEN
      RAISE EXCEPTION '337 gagal: klaim DIBAYAR tanpa akun kas — uang keluar dari mana pun';
    END IF;
  END IF;

  DELETE FROM klaim_perjalanan WHERE nomor LIKE 'VERIF337-%';

  -- 11. `settled_at` tertambal untuk SELURUH kasbon settled.
  SELECT count(*) INTO n FROM kasbons WHERE status = 'settled' AND settled_at IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '337 gagal: % kasbon settled masih tanpa settled_at — laporan arus kas tetap nol', n;
  END IF;

  -- 12. Tambalannya JUJUR: tak ada yang bertanggal hari ini kecuali memang
  --     disetujui hari ini. `now()` akan memindahkan pelunasan lama ke periode
  --     berjalan, dan laporan bulan ini melonjak karena migrasi.
  SELECT count(*) INTO n
    FROM kasbons
   WHERE status = 'settled'
     AND settled_at::date = CURRENT_DATE
     AND COALESCE(approved_at, created_at)::date <> CURRENT_DATE;
  IF n > 0 THEN
    RAISE EXCEPTION '337 gagal: % pelunasan lama bertanggal HARI INI — arus kas periode berjalan melonjak palsu', n;
  END IF;

  -- 13. Izin ada DAN diberikan.
  SELECT count(*) INTO n FROM permissions
   WHERE key IN ('klaim:view', 'klaim:kelola', 'klaim:setujui', 'klaim:bayar');
  IF n <> 4 THEN
    RAISE EXCEPTION '337 gagal: izin klaim tak lengkap (% dari 4)', n;
  END IF;

  SELECT count(*) INTO n
    FROM permissions p
   WHERE p.key IN ('klaim:view', 'klaim:kelola', 'klaim:setujui', 'klaim:bayar')
     AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id);
  IF n > 0 THEN
    RAISE EXCEPTION '337 gagal: % izin klaim tak diberikan ke peran mana pun — rutenya 403 untuk semua', n;
  END IF;

  -- 14. RLS berpolicy.
  SELECT count(*) INTO n FROM pg_policies
   WHERE tablename IN ('klaim_perjalanan', 'klaim_perjalanan_item');
  IF n < 4 THEN
    RAISE EXCEPTION '337 gagal: policy klaim kurang (%)', n;
  END IF;

  RAISE NOTICE '337 OK — klaim perjalanan siap; settled_at tertambal jujur (% policy)', n;
END $$;
