-- ============================================================================
-- 256 — KANAL WHATSAPP: nomor terikat USER, idempotensi KELUAR, log pesan
-- ============================================================================
--
-- ── Rujukan TJS, dan dua hal yang ia TIDAK punya
--
-- `automation-tjs/admin-dashboard/lib/wa/` sudah punya struktur yang baik:
-- satu pintu keluar (`send.ts`) + registry adaptor. Itu ditiru.
--
-- Yang TIDAK ada di sana, dan justru diminta kriteria D1:
--
--   IDEMPOTENSI KELUAR   TJS punya dedup MASUK (`providerMessageId`), tetapi
--                        tak ada apa pun yang mencegah pesan KELUAR terkirim
--                        dua kali. Webhook yang diulang penyedia — hal biasa,
--                        bukan kelainan — menghasilkan notifikasi ganda ke
--                        mandor, dan yang kedua terbaca sebagai kejadian baru.
--
--   IKATAN KE user_id    TJS mengikat nomor ke `ownerAiContact`/`staffAiContact`
--                        (`synthetic-session.ts:97`), yaitu daftar kontak
--                        terpisah. Peran diambil dari daftar itu, bukan dari
--                        keanggotaan perusahaan — jadi orang yang dicabut
--                        aksesnya di ERP tetap bisa bertanya lewat WhatsApp
--                        sampai seseorang ingat menghapusnya dari daftar kedua.
--
-- Di sini nomor terikat `users.id`, dan perannya SELALU diresolusi ulang dari
-- `company_members` saat dipakai. Mencabut akses di satu tempat mencabutnya
-- di semua tempat.
--
-- ── Kenapa nomornya disimpan ter-normalisasi
--
-- `+62 812-3456-7890`, `62812 3456 7890`, dan `0812-3456-7890` adalah nomor
-- yang SAMA. Menyimpannya apa adanya berarti pencarian gagal untuk bentuk yang
-- tak persis, dan gagalnya senyap: pesannya masuk ke `ai_akses_ditolak` seolah
-- pengirimnya orang asing.
-- ============================================================================

-- ------------------------------------------------------------
-- 1. Nomor WhatsApp terikat PENGGUNA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wa_nomor_pengguna (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Digit saja, berawalan kode negara. Normalisasi ditegakkan CHECK, bukan
  -- hanya di aplikasi: satu jalur masuk yang lupa menormalkan akan menyimpan
  -- bentuk lain, dan pencarian nomor yang sama jadi gagal.
  nomor       TEXT NOT NULL,

  -- Verifikasi lewat kode sekali-pakai. Nomor yang belum terverifikasi TIDAK
  -- boleh dipakai: siapa pun bisa mengetik nomor orang lain di halaman profil.
  terverifikasi_pada TIMESTAMPTZ,
  kode_verifikasi    TEXT,
  kode_kedaluwarsa   TIMESTAMPTZ,
  percobaan_gagal    INTEGER NOT NULL DEFAULT 0,

  aktif       BOOLEAN NOT NULL DEFAULT true,
  dibuat_pada     TIMESTAMPTZ NOT NULL DEFAULT now(),
  diperbarui_pada TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Satu nomor = satu pengguna, LINTAS TENANT. Bukan per-company: kalau nomor
  -- yang sama bisa terdaftar di dua tenant, pesan masuk tak punya cara
  -- menentukan atas nama siapa ia bertanya — dan menebaknya berarti menjawab
  -- pertanyaan tenant A dengan data tenant B.
  CONSTRAINT wa_nomor_unik UNIQUE (nomor),
  CONSTRAINT wa_nomor_bentuk CHECK (nomor ~ '^[1-9][0-9]{7,14}$'),
  CONSTRAINT wa_percobaan_wajar CHECK (percobaan_gagal BETWEEN 0 AND 99)
);

CREATE INDEX IF NOT EXISTS idx_wa_nomor_user ON wa_nomor_pengguna(user_id);
CREATE INDEX IF NOT EXISTS idx_wa_nomor_company ON wa_nomor_pengguna(company_id);

COMMENT ON TABLE wa_nomor_pengguna IS
  'Nomor WA terikat users.id — BUKAN whitelist nomor telanjang. Peran selalu '
  'diresolusi ulang dari company_members saat dipakai, jadi mencabut akses di '
  'ERP langsung mencabut akses WhatsApp.';

-- ------------------------------------------------------------
-- 2. IDEMPOTENSI KELUAR — yang TJS tak punya
--
-- Kuncinya ditentukan PEMANGGIL dari peristiwa yang memicunya, mis.
-- `invoice:<id>:jatuh-tempo`. Bukan dari isi pesan: teks yang sama untuk dua
-- peristiwa berbeda memang harus terkirim dua kali.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wa_kirim_idempotensi (
  kunci       TEXT PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nomor       TEXT NOT NULL,
  -- Id pesan di sisi penyedia. NULL berarti pengiriman gagal — dan barisnya
  -- TETAP ada supaya percobaan berikutnya tahu ini pernah dicoba.
  pesan_id_penyedia TEXT,
  berhasil    BOOLEAN NOT NULL DEFAULT false,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_idem_waktu ON wa_kirim_idempotensi(dibuat_pada DESC);

COMMENT ON TABLE wa_kirim_idempotensi IS
  'Mencegah pesan KELUAR terkirim dua kali. TJS hanya punya dedup MASUK; '
  'webhook yang diulang penyedia — hal biasa — menghasilkan notifikasi ganda '
  'ke mandor, dan yang kedua terbaca sebagai kejadian baru.';

-- ------------------------------------------------------------
-- 3. Log pesan — untuk menelusuri, bukan untuk menyimpan isi selamanya
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wa_pesan_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  arah        TEXT NOT NULL,
  nomor       TEXT NOT NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Isi pesan TIDAK disimpan di sini — hanya panjangnya. Alasannya sama
  -- dengan `ai_akses_ditolak` (migrasi 249): pesan bisa memuat apa saja, dan
  -- log yang menyimpannya jadi salinan kedua data operasional yang retensinya
  -- tak pernah ikut diatur.
  panjang     INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL,
  galat       TEXT,
  pesan_id_penyedia TEXT,
  dibuat_pada TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT wa_arah_sah CHECK (arah IN ('masuk', 'keluar')),
  CONSTRAINT wa_status_sah CHECK (status IN ('terkirim', 'gagal', 'diterima', 'ditolak'))
);

CREATE INDEX IF NOT EXISTS idx_wa_log_company_waktu ON wa_pesan_log(company_id, dibuat_pada DESC);

-- ------------------------------------------------------------
-- 4. Tenancy — kategori B
-- ------------------------------------------------------------
ALTER TABLE wa_nomor_pengguna     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_kirim_idempotensi  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_pesan_log          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON wa_nomor_pengguna;
CREATE POLICY tenant_isolation ON wa_nomor_pengguna AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS wa_nomor_kelola ON wa_nomor_pengguna;
CREATE POLICY wa_nomor_kelola ON wa_nomor_pengguna FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation ON wa_kirim_idempotensi;
CREATE POLICY tenant_isolation ON wa_kirim_idempotensi AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS wa_idem_kelola ON wa_kirim_idempotensi;
CREATE POLICY wa_idem_kelola ON wa_kirim_idempotensi FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation ON wa_pesan_log;
CREATE POLICY tenant_isolation ON wa_pesan_log AS RESTRICTIVE FOR ALL
  USING (company_id = (SELECT auth_company_id()))
  WITH CHECK (company_id = (SELECT auth_company_id()));
DROP POLICY IF EXISTS wa_log_kelola ON wa_pesan_log;
CREATE POLICY wa_log_kelola ON wa_pesan_log FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION fn_wa_nomor_sentuh()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.diperbarui_pada := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wa_nomor_sentuh ON wa_nomor_pengguna;
CREATE TRIGGER trg_wa_nomor_sentuh
  BEFORE UPDATE ON wa_nomor_pengguna
  FOR EACH ROW EXECUTE FUNCTION fn_wa_nomor_sentuh();

-- ------------------------------------------------------------
-- 5. Permission
-- ------------------------------------------------------------
INSERT INTO permissions (key, module, label, description, sort_order)
VALUES
  ('settings:wa:view', 'settings', 'Lihat kanal WhatsApp',
   'Melihat nomor terdaftar dan riwayat pengiriman.', 950),
  ('settings:wa:manage', 'settings', 'Kelola kanal WhatsApp',
   'Mendaftarkan nomor, memverifikasi, dan menonaktifkan.', 951)
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE p.key IN ('settings:wa:view', 'settings:wa:manage') AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 6. Verifikasi — pola migrasi 142.
-- ------------------------------------------------------------
DO $$
DECLARE v_n INT; v_company UUID; v_user UUID;
BEGIN
  FOR v_n IN
    SELECT 1 FROM (VALUES ('wa_nomor_pengguna'), ('wa_kirim_idempotensi'), ('wa_pesan_log')) t(n)
    WHERE to_regclass('public.' || t.n) IS NULL
  LOOP
    RAISE EXCEPTION '256 gagal: ada tabel yang tidak terbentuk';
  END LOOP;

  FOR v_n IN
    SELECT 1 FROM (VALUES ('wa_nomor_pengguna'), ('wa_kirim_idempotensi'), ('wa_pesan_log')) t(n)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = t.n AND policyname = 'tenant_isolation' AND permissive = 'RESTRICTIVE'
    )
  LOOP
    RAISE EXCEPTION '256 gagal: ada tabel tanpa tenant_isolation RESTRICTIVE';
  END LOOP;

  SELECT c.id INTO v_company FROM companies c
   WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1;
  SELECT user_id INTO v_user FROM company_members WHERE company_id = v_company LIMIT 1;

  -- Nomor tak ternormalisasi DITOLAK. CHECK-nya ada supaya satu jalur masuk
  -- yang lupa menormalkan tak menyimpan bentuk lain diam-diam.
  BEGIN
    INSERT INTO wa_nomor_pengguna (company_id, user_id, nomor)
    VALUES (v_company, v_user, '+62 812-3456-7890');
    RAISE EXCEPTION '256 gagal: nomor tak ternormalisasi tidak ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO wa_nomor_pengguna (company_id, user_id, nomor)
    VALUES (v_company, v_user, '0812345678');
    RAISE EXCEPTION '256 gagal: nomor berawalan 0 tidak ditolak';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Nomor ternormalisasi diterima, lalu dibersihkan.
  INSERT INTO wa_nomor_pengguna (company_id, user_id, nomor)
  VALUES (v_company, v_user, '628129999001');

  -- Nomor yang SAMA di tenant mana pun ditolak — pesan masuk tak boleh punya
  -- dua kemungkinan pemilik.
  BEGIN
    INSERT INTO wa_nomor_pengguna (company_id, user_id, nomor)
    VALUES (v_company, v_user, '628129999001');
    RAISE EXCEPTION '256 gagal: nomor ganda tidak ditolak';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  DELETE FROM wa_nomor_pengguna WHERE nomor = '628129999001';

  -- Idempotensi: kunci yang sama tak boleh masuk dua kali.
  INSERT INTO wa_kirim_idempotensi (kunci, company_id, nomor, berhasil)
  VALUES ('uji:256', v_company, '628129999001', true);
  BEGIN
    INSERT INTO wa_kirim_idempotensi (kunci, company_id, nomor, berhasil)
    VALUES ('uji:256', v_company, '628129999001', true);
    RAISE EXCEPTION '256 gagal: kunci idempotensi ganda tidak ditolak';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  DELETE FROM wa_kirim_idempotensi WHERE kunci = 'uji:256';

  -- Log TIDAK boleh punya kolom isi pesan.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wa_pesan_log' AND column_name IN ('isi', 'pesan', 'teks', 'body')
  ) THEN
    RAISE EXCEPTION '256 gagal: wa_pesan_log punya kolom isi pesan';
  END IF;
END $$;
