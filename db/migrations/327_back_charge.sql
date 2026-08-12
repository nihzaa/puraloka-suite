-- ════════════════════════════════════════════════════════════════════════════
-- 327 — Back-Charge (D3): biaya yang seharusnya ditanggung subkon
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Yang diukur 2026-08-12
--
-- Pembayaran ke mandor punya DUA potongan: `deducted_kasbon` dan
-- `retensi_amount`. Keduanya sah, tetapi tak satu pun menampung biaya yang
-- dikeluarkan KONTRAKTOR untuk pekerjaan yang seharusnya jadi tanggungan
-- subkon — perbaikan cacat yang tak dikerjakan ulang, material yang harus
-- dibeli lagi karena rusak di tangannya, alat yang disewa untuk membereskan.
--
-- Diukur:
--
--     wage_deductions      potongan UPAH HARIAN, bukan pembayaran progres
--     invoice_penalties    denda invoice ke KLIEN, arah berlawanan
--     deducted_kasbon      diketik MANUAL saat konfirmasi, tanpa daftar
--                          yang menjadi dasarnya
--
-- Yang terakhir itu inti masalahnya. Angka potongan diketik tangan, tak ada
-- rincian di baliknya, dan tak ada yang bisa dijelaskan ke mandor saat ia
-- menanyakan "kenapa dipotong sekian".
--
-- ── Kenapa perlu tabel sendiri, bukan menambah kolom
--
-- Satu pembayaran bisa memotong beberapa hal sekaligus: perbaikan bocor di
-- KM lantai 2, sewa scaffolding tambahan, material yang dibeli ulang. Satu
-- kolom `back_charge_amount` menyimpan jumlahnya tanpa menyimpan SEBABNYA —
-- dan sebab itulah yang ditanyakan pertama kali.
--
-- ── Kenapa bertaut ke work_scope, bukan langsung ke pembayaran
--
-- Back-charge lahir saat cacatnya ditemukan, bukan saat pembayaran diajukan.
-- Menautkannya ke pembayaran berarti ia tak bisa dicatat sampai ada tagihan
-- masuk — dan yang terjadi berikutnya adalah orang mencatatnya di tempat
-- lain, atau tak mencatatnya sama sekali.
--
-- Ia mengendap di lingkup kerjanya, lalu DIPOTONGKAN saat pembayaran
-- dikonfirmasi. `progress_payment_id` diisi pada saat itu.
-- ════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE back_charge_status AS ENUM ('diajukan', 'disetujui', 'dipotong', 'dibatalkan');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS back_charge (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id),
  work_scope_id   uuid NOT NULL REFERENCES work_scopes(id) ON DELETE CASCADE,

  nomor           text NOT NULL,
  tanggal         date NOT NULL,

  -- Sebab. WAJIB dan tak boleh kosong: back-charge tanpa uraian adalah
  -- potongan yang tak bisa dijelaskan ke mandor, dan itu persis keadaan
  -- yang tabel ini perbaiki.
  uraian          text NOT NULL CHECK (btrim(uraian) <> ''),
  kategori        text NOT NULL DEFAULT 'perbaikan'
    CHECK (kategori IN ('perbaikan', 'material', 'alat', 'tenaga', 'denda', 'lainnya')),

  -- Nominal `numeric`, bukan float (CLAUDE.md §5.4). Harus > 0: back-charge
  -- bernilai nol adalah baris yang tak memotong apa pun, dan ia hanya
  -- membuat daftar potongan terlihat lebih panjang daripada isinya.
  nilai           numeric NOT NULL CHECK (nilai > 0),

  -- Bukti. Nota pembelian, foto cacat, atau berita acara perbaikan.
  bukti_url       text[] NOT NULL DEFAULT '{}',
  -- Cacat yang mendasarinya, bila lahir dari punch list. Boleh NULL: tak
  -- semua back-charge berasal dari punch item (mis. sewa alat tambahan).
  punch_item_id   uuid REFERENCES punch_items(id) ON DELETE SET NULL,

  status          back_charge_status NOT NULL DEFAULT 'diajukan',

  diajukan_oleh   uuid NOT NULL REFERENCES users(id),
  disetujui_oleh  uuid REFERENCES users(id),
  disetujui_pada  timestamptz,
  alasan_batal    text,

  -- Diisi saat benar-benar dipotong dari pembayaran.
  progress_payment_id uuid REFERENCES progress_payments(id) ON DELETE SET NULL,
  dipotong_pada   timestamptz,

  dibuat_pada     timestamptz NOT NULL DEFAULT now(),
  diubah_pada     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (company_id, nomor),

  -- ── SoD: pengaju tak boleh menyetujui potongannya sendiri ───────────────
  --
  -- Sama dengan TJS-P4 dan D1, alasan yang sama: back-charge MENGURANGI
  -- uang yang diterima orang lain. Satu orang yang mengajukan lalu menyetujui
  -- sendiri menghasilkan potongan sepihak dengan dua kolom.
  --
  -- Ditegakkan di BASIS, bukan hanya aplikasi: importer dan psql menulis ke
  -- sini juga.
  CHECK (disetujui_oleh IS NULL OR disetujui_oleh <> diajukan_oleh),

  -- Status `disetujui`/`dipotong` WAJIB punya penyetuju dan waktunya.
  -- Tanpa itu, potongan mengaku sah tanpa seorang pun mengesahkannya.
  CHECK (status NOT IN ('disetujui', 'dipotong')
         OR (disetujui_oleh IS NOT NULL AND disetujui_pada IS NOT NULL)),

  -- `dipotong` WAJIB menunjuk pembayarannya. Status yang berkata "sudah
  -- dipotong" tanpa menyebut dari mana adalah jejak yang tak bisa dirunut.
  CHECK (status <> 'dipotong' OR progress_payment_id IS NOT NULL),

  -- Pembatalan WAJIB beralasan.
  CHECK (status <> 'dibatalkan' OR btrim(coalesce(alasan_batal, '')) <> '')
);

CREATE INDEX IF NOT EXISTS idx_back_charge_company ON back_charge (company_id, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_back_charge_scope   ON back_charge (work_scope_id, status);
CREATE INDEX IF NOT EXISTS idx_back_charge_bayar   ON back_charge (progress_payment_id)
  WHERE progress_payment_id IS NOT NULL;

-- ── Sesudah DIPOTONG, tak boleh berubah ─────────────────────────────────────
--
-- Potongan yang sudah dikurangkan dari pembayaran adalah angka yang sudah
-- masuk pembukuan. Mengubahnya sesudah itu membuat pembayaran dan potongannya
-- bercerita hal yang berbeda — dan yang menemukannya adalah rekonsiliasi
-- bulan depan.
CREATE OR REPLACE FUNCTION fn_back_charge_terkunci() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'dipotong' THEN
    RAISE EXCEPTION
      'Back-charge % sudah dipotong dari pembayaran dan tak bisa diubah. '
      'Buat back-charge koreksi bila ada kekeliruan.', OLD.nomor;
  END IF;
  NEW.diubah_pada := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_back_charge_terkunci ON back_charge;
CREATE TRIGGER trg_back_charge_terkunci
  BEFORE UPDATE ON back_charge
  FOR EACH ROW EXECUTE FUNCTION fn_back_charge_terkunci();

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- T5A menemukan 30 tabel MATI TOTAL karena RLS menyala tanpa policy
-- PERMISSIVE. Tabel baru wajib punya policy-nya di migrasi yang sama.
ALTER TABLE back_charge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS back_charge_baca ON back_charge;
CREATE POLICY back_charge_baca ON back_charge
  FOR SELECT USING ((SELECT has_permission('mandor:view')));

DROP POLICY IF EXISTS back_charge_tulis ON back_charge;
CREATE POLICY back_charge_tulis ON back_charge
  FOR ALL USING ((SELECT has_permission('backcharge:kelola')))
          WITH CHECK ((SELECT has_permission('backcharge:kelola')));

-- ── Izin ────────────────────────────────────────────────────────────────────
--
-- DUA izin terpisah, seperti opname: yang mengajukan potongan bukan yang
-- menyetujuinya. Menyatukannya membuat CHECK SoD di atas jadi hiasan.
INSERT INTO permissions (key, module, label, description, sort_order)
SELECT v.key, 'mandor', v.label, v.deskripsi,
       COALESCE((SELECT max(sort_order) FROM permissions), 0) + v.n
  FROM (VALUES
    ('backcharge:kelola', 'Ajukan back-charge',
     'Mencatat biaya yang seharusnya ditanggung subkon beserta buktinya.', 1),
    ('backcharge:setujui', 'Setujui back-charge',
     'Mengesahkan potongan. Tak boleh menyetujui yang diajukan sendiri.', 2)
  ) AS v(key, label, deskripsi, n)
 WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = v.key);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('backcharge:kelola', 'backcharge:setujui')
   AND r.name IN ('admin', 'direktur')
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- PM mengajukan dari lapangan, TIDAK menyetujui — itu pemisahannya.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key = 'backcharge:kelola'
   AND r.name = 'pm'
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- ------------------------------------------------------------
-- Verifikasi — dibuktikan LANGSUNG di basis
-- ------------------------------------------------------------
DO $$
DECLARE
  n INT;
  co uuid; pr uuid; ws uuid; u1 uuid; u2 uuid; bc uuid;
BEGIN
  FOR n IN SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM permissions WHERE key = 'backcharge:setujui') LOOP
    RAISE EXCEPTION '327 gagal: izin backcharge:setujui tak terbentuk';
  END LOOP;

  -- Izin yang tak sampai ke role mana pun = fitur mati total (pelajaran 321).
  FOR n IN
    SELECT 1 FROM permissions p WHERE p.key LIKE 'backcharge:%'
      AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id)
  LOOP
    RAISE EXCEPTION '327 gagal: ada izin backcharge yang tak diberikan ke role mana pun';
  END LOOP;

  SELECT count(*) INTO n FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname = 'back_charge' AND p.polpermissive;
  IF n < 2 THEN
    RAISE EXCEPTION '327 gagal: % policy PERMISSIVE (butuh >= 2) — tabel akan mati total', n;
  END IF;

  SELECT id INTO co FROM companies LIMIT 1;
  SELECT id INTO pr FROM projects WHERE company_id = co LIMIT 1;
  SELECT ws2.id INTO ws FROM work_scopes ws2 LIMIT 1;
  SELECT id INTO u1 FROM users LIMIT 1;
  SELECT id INTO u2 FROM users WHERE id <> u1 LIMIT 1;
  IF co IS NULL OR pr IS NULL OR ws IS NULL OR u2 IS NULL THEN
    RAISE NOTICE '327: basis tak lengkap untuk uji perilaku — dilewati';
    RETURN;
  END IF;

  -- SoD: pengaju tak boleh menyetujui sendiri.
  BEGIN
    INSERT INTO back_charge (company_id, project_id, work_scope_id, nomor, tanggal,
                             uraian, nilai, diajukan_oleh, disetujui_oleh, disetujui_pada, status)
    VALUES (co, pr, ws, '[327-UJI-SOD]', CURRENT_DATE, 'uji', 1000, u1, u1, now(), 'disetujui');
    RAISE EXCEPTION '327 gagal: pengaju BISA menyetujui back-charge-nya sendiri';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Nilai nol/negatif ditolak.
  BEGIN
    INSERT INTO back_charge (company_id, project_id, work_scope_id, nomor, tanggal,
                             uraian, nilai, diajukan_oleh)
    VALUES (co, pr, ws, '[327-UJI-NOL]', CURRENT_DATE, 'uji', 0, u1);
    RAISE EXCEPTION '327 gagal: nilai nol DITERIMA';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Uraian kosong ditolak.
  BEGIN
    INSERT INTO back_charge (company_id, project_id, work_scope_id, nomor, tanggal,
                             uraian, nilai, diajukan_oleh)
    VALUES (co, pr, ws, '[327-UJI-KOSONG]', CURRENT_DATE, '   ', 1000, u1);
    RAISE EXCEPTION '327 gagal: uraian kosong DITERIMA';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Status `dipotong` tanpa pembayaran ditolak.
  BEGIN
    INSERT INTO back_charge (company_id, project_id, work_scope_id, nomor, tanggal,
                             uraian, nilai, diajukan_oleh, disetujui_oleh, disetujui_pada, status)
    VALUES (co, pr, ws, '[327-UJI-TANPA-BAYAR]', CURRENT_DATE, 'uji', 1000, u1, u2, now(), 'dipotong');
    RAISE EXCEPTION '327 gagal: status dipotong DITERIMA tanpa progress_payment_id';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Yang sah diterima.
  INSERT INTO back_charge (company_id, project_id, work_scope_id, nomor, tanggal,
                           uraian, nilai, diajukan_oleh, disetujui_oleh, disetujui_pada, status)
  VALUES (co, pr, ws, '[327-UJI]', CURRENT_DATE, 'Perbaikan bocor KM lantai 2',
          2500000, u1, u2, now(), 'disetujui')
  RETURNING id INTO bc;

  DELETE FROM back_charge WHERE nomor LIKE '[327-UJI%';

  RAISE NOTICE '327 OK — back_charge ada, SoD & kelengkapan status ditegakkan basis';
END $$;
