-- ════════════════════════════════════════════════════════════════════════════
-- 321 — Custom field per tenant, dengan batas yang DITEGAKKAN MESIN (TJS-P5)
-- ════════════════════════════════════════════════════════════════════════════
--
-- ── Kenapa ini berbahaya, dan kenapa tetap dibangun
--
-- Never Build List mencoret "EAV penuh". Catatan QUEUE.yaml TJS-P5 menyebut
-- alasannya dengan tepat:
--
--   > Custom field terbatas bukan EAV penuh — tapi batas itu harus ditegakkan
--   > mesin, karena jarak antara keduanya hanya sejauh satu permintaan
--   > pelanggan.
--
-- Jarak itu memang sedekat itu. "Bisa tidak kami tambah satu kolom di
-- proyek?" dijawab ya; enam bulan kemudian ada tenant dengan 40 field di
-- 12 entitas, tak ada yang bisa membuat laporan lintas-tenant lagi, dan
-- tak ada satu pun keputusan yang salah di sepanjang jalan itu.
--
-- Yang mencegahnya bukan disiplin. Yang mencegahnya adalah `ALTER TYPE` —
-- menambah entitas atau tipe baru HARUS lewat migrasi yang terbaca di review,
-- bukan lewat INSERT yang bisa dilakukan siapa pun dengan izin pengaturan.
--
-- ── Tiga batas, ketiganya di schema
--
-- 1. ENTITAS  — enum `cf_entitas`, 5 nilai. Bukan `text`.
-- 2. TIPE     — enum `cf_tipe`, 6 nilai. Bukan `text`.
-- 3. JUMLAH   — maksimum 20 field per (company, entitas), ditegakkan trigger.
--
-- Batas ketiga yang paling sering dilupakan: dua yang pertama membatasi
-- BENTUK, tak satu pun membatasi VOLUME. Tenant bisa membuat 300 field
-- bertipe sah di entitas sah, dan hasilnya EAV penuh dengan enum yang rapi.
--
-- ── Kenapa nilai disimpan sebagai `jsonb`, bukan kolom per-tipe
--
-- Alternatifnya `nilai_teks`/`nilai_angka`/`nilai_tanggal`/... — lima kolom
-- yang empat di antaranya selalu NULL, plus CHECK bahwa tepat satu terisi.
-- Itu lebih "relasional" di permukaan, tetapi tiap tipe baru berarti kolom
-- baru, dan query pembacanya tetap harus CASE per tipe.
--
-- `jsonb` + validasi per-tipe di trigger memberi hal yang sama tanpa lima
-- kolom, DAN menutup lubang yang bentuk lima-kolom justru buka: di sana tak
-- ada yang mencegah `nilai_angka` diisi untuk field bertipe `tanggal`.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Enum: daftar TERTUTUP ───────────────────────────────────────────────────
--
-- Entitas yang boleh punya custom field. Dipilih dari yang benar-benar
-- berbeda antar-perusahaan konstruksi, bukan dari "semua tabel besar":
-- proyek (kode internal, wilayah), pemasok (kualifikasi khusus), material
-- (kode gudang lama), pegawai (nomor BPJS, ukuran seragam), klien (NPWP
-- cabang). Yang TIDAK masuk daftar dan tak akan: apa pun yang menyentuh
-- pembukuan — Ember [C] tak boleh bisa dikonfigurasi dari UI.
--
-- Nilai enum = NAMA TABEL SEBENARNYA, diukur ke `information_schema`.
-- Versi pertama berkas ini menulis 'vendors'; tabelnya bernama `suppliers`,
-- dan enum yang menyebut tabel tak ada adalah entitas yang tak pernah bisa
-- dipakai — tanpa satu pun galat, karena enum tak memvalidasi apa pun ke
-- katalog. Penjaga `audit-custom-field-entitas.mjs` menutup celah itu.
DO $$ BEGIN
  CREATE TYPE cf_entitas AS ENUM ('projects', 'suppliers', 'materials', 'pegawai', 'clients');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tipe nilai. `pilihan` = daftar tertutup yang ditentukan tenant sendiri
-- (dropdown), disimpan di `opsi`.
DO $$ BEGIN
  CREATE TYPE cf_tipe AS ENUM ('teks', 'angka', 'tanggal', 'boolean', 'pilihan', 'uang');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Definisi ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_field_def (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  entitas     cf_entitas NOT NULL,
  tipe        cf_tipe    NOT NULL,

  -- Kunci teknis, dipakai di API. Huruf kecil + garis bawah supaya tak
  -- pernah butuh dikutip, dan supaya tak bisa menyamar jadi kolom nyata.
  kunci       text NOT NULL CHECK (kunci ~ '^[a-z][a-z0-9_]{1,39}$'),
  label       text NOT NULL CHECK (btrim(label) <> ''),

  wajib       boolean NOT NULL DEFAULT false,
  -- Untuk tipe `pilihan`. Array kosong pada tipe lain.
  opsi        text[]  NOT NULL DEFAULT '{}',
  urutan      int     NOT NULL DEFAULT 0,
  aktif       boolean NOT NULL DEFAULT true,

  dibuat_pada timestamptz NOT NULL DEFAULT now(),

  -- Kunci unik PER TENANT PER ENTITAS. Tanpa `entitas` di sini, tenant tak
  -- bisa punya `kode_internal` di proyek DAN di vendor sekaligus.
  UNIQUE (company_id, entitas, kunci),

  -- `pilihan` tanpa opsi adalah dropdown kosong: tak ada nilai sah yang bisa
  -- dipilih, jadi field wajib bertipe itu MENGUNCI form selamanya. Ditolak di
  -- sini, bukan ditemukan pengguna.
  --
  -- `cardinality()`, BUKAN `array_length(opsi, 1)`.
  --
  -- Pada array KOSONG, `array_length` memulangkan NULL — bukan 0. Dan
  -- `NULL >= 1` bernilai NULL, yang CHECK perlakukan sebagai LOLOS. Jadi
  -- versi pertama constraint ini menerima persis satu-satunya hal yang
  -- hendak ia tolak.
  --
  -- Ditemukan blok verifikasi di bawah, bukan oleh mata: bentuk SQL-nya
  -- terbaca benar. Ini alasan tiap migrasi di repo ini menjalankan kasus
  -- negatifnya sendiri (pola migrasi 142).
  CHECK (tipe <> 'pilihan' OR cardinality(opsi) >= 1),
  -- Sebaliknya: opsi pada tipe non-pilihan adalah data yang tak pernah
  -- dibaca — dan data yang tak dibaca selalu jadi salah tanpa ketahuan.
  CHECK (tipe = 'pilihan' OR opsi = '{}')
);

CREATE INDEX IF NOT EXISTS idx_cf_def_company ON custom_field_def (company_id, entitas, urutan);

-- ── Nilai ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_field_nilai (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- `company_id` DINYATAKAN, bukan hanya diwarisi lewat `def_id`.
  --
  -- Kriteria TJS-P5: "definisi DAN nilai, keduanya company_id + RLS". Tanpa
  -- kolomnya sendiri, policy RLS di sini harus menempuh JOIN ke definisi —
  -- dan policy ber-JOIN adalah policy yang mahal dan mudah salah.
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  def_id      uuid NOT NULL REFERENCES custom_field_def(id) ON DELETE CASCADE,

  -- Id baris entitasnya. TIDAK ber-FK: tabel tujuannya berbeda-beda, dan FK
  -- polimorfik tak ada di Postgres. Yang menjaga keutuhannya: `entitas` di
  -- definisi + pembersihan saat entitasnya dihapus (di lapisan aplikasi).
  entitas_id  uuid NOT NULL,

  nilai       jsonb NOT NULL,

  diubah_pada timestamptz NOT NULL DEFAULT now(),

  -- Satu nilai per (field, baris). Tanpa ini, satu baris bisa punya dua nilai
  -- untuk field yang sama dan pembacanya memilih sembarang.
  UNIQUE (def_id, entitas_id)
);

CREATE INDEX IF NOT EXISTS idx_cf_nilai_entitas ON custom_field_nilai (company_id, entitas_id);
CREATE INDEX IF NOT EXISTS idx_cf_nilai_def     ON custom_field_nilai (def_id);

-- ── Batas JUMLAH: 20 field per (company, entitas) ───────────────────────────
--
-- Enum membatasi BENTUK, tak satu pun membatasi VOLUME. 300 field bertipe sah
-- di entitas sah tetap EAV penuh — hanya dengan enum yang rapi.
CREATE OR REPLACE FUNCTION fn_cf_batas_jumlah() RETURNS trigger AS $$
DECLARE
  n INT;
BEGIN
  SELECT count(*) INTO n
    FROM custom_field_def
   WHERE company_id = NEW.company_id AND entitas = NEW.entitas
     AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF n >= 20 THEN
    RAISE EXCEPTION
      'Batas 20 custom field per entitas tercapai untuk %. Nonaktifkan yang '
      'tak terpakai sebelum menambah — batas ini yang memisahkan custom field '
      'terbatas dari EAV penuh.', NEW.entitas;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cf_batas_jumlah ON custom_field_def;
CREATE TRIGGER trg_cf_batas_jumlah
  BEFORE INSERT OR UPDATE OF company_id, entitas ON custom_field_def
  FOR EACH ROW EXECUTE FUNCTION fn_cf_batas_jumlah();

-- ── Validasi NILAI terhadap TIPE-nya ────────────────────────────────────────
--
-- Ini yang membuat `jsonb` tetap tertib. Tanpanya, field bertipe `angka`
-- bisa menyimpan `"dua belas"` dan yang menemukannya adalah laporan yang
-- gagal menjumlah, bukan orang yang mengisinya.
CREATE OR REPLACE FUNCTION fn_cf_nilai_cocok_tipe() RETURNS trigger AS $$
DECLARE
  d custom_field_def%ROWTYPE;
BEGIN
  SELECT * INTO d FROM custom_field_def WHERE id = NEW.def_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Definisi custom field % tak ditemukan', NEW.def_id;
  END IF;

  -- Nilai milik tenant LAIN dari definisinya = kebocoran lintas-tenant yang
  -- tak akan terlihat di UI mana pun. Ditolak di basis, bukan diandaikan.
  IF d.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'company_id nilai (%) tak cocok dengan definisinya (%)',
      NEW.company_id, d.company_id;
  END IF;

  -- `null` JSON diperlakukan sebagai "dikosongkan" dan hanya sah bila field
  -- tak wajib. Menyimpan baris ber-nilai null lebih baik daripada menghapus
  -- barisnya: jejak "pernah diisi lalu dikosongkan" ikut hilang kalau dihapus.
  IF jsonb_typeof(NEW.nilai) = 'null' THEN
    IF d.wajib THEN
      RAISE EXCEPTION 'Field "%" wajib diisi', d.label;
    END IF;
    RETURN NEW;
  END IF;

  CASE d.tipe
    WHEN 'teks' THEN
      IF jsonb_typeof(NEW.nilai) <> 'string' THEN
        RAISE EXCEPTION 'Field "%" bertipe teks, nilainya %', d.label, jsonb_typeof(NEW.nilai);
      END IF;
    WHEN 'angka' THEN
      IF jsonb_typeof(NEW.nilai) <> 'number' THEN
        RAISE EXCEPTION 'Field "%" bertipe angka, nilainya %', d.label, jsonb_typeof(NEW.nilai);
      END IF;
    WHEN 'uang' THEN
      -- Uang disimpan sebagai STRING angka, bukan `number`.
      --
      -- CLAUDE.md §5.4: nominal `numeric`, nol float. `jsonb` number adalah
      -- IEEE754 di banyak driver, dan 0,1 + 0,2 di sana bukan 0,3. Nominal
      -- yang lolos ke sini sebagai float akan salah di digit terakhir tanpa
      -- satu pun galat.
      IF jsonb_typeof(NEW.nilai) <> 'string' OR (NEW.nilai #>> '{}') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
        RAISE EXCEPTION 'Field "%" bertipe uang: kirim sebagai STRING angka (mis. "1250000.50"), bukan %',
          d.label, jsonb_typeof(NEW.nilai);
      END IF;
    WHEN 'boolean' THEN
      IF jsonb_typeof(NEW.nilai) <> 'boolean' THEN
        RAISE EXCEPTION 'Field "%" bertipe boolean, nilainya %', d.label, jsonb_typeof(NEW.nilai);
      END IF;
    WHEN 'tanggal' THEN
      IF jsonb_typeof(NEW.nilai) <> 'string' OR (NEW.nilai #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'Field "%" bertipe tanggal: kirim "YYYY-MM-DD"', d.label;
      END IF;
      -- Bentuknya benar belum berarti tanggalnya ada. '2026-02-31' lolos regex.
      BEGIN
        PERFORM (NEW.nilai #>> '{}')::date;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Field "%": "%" bukan tanggal yang ada', d.label, NEW.nilai #>> '{}';
      END;
    WHEN 'pilihan' THEN
      IF jsonb_typeof(NEW.nilai) <> 'string' THEN
        RAISE EXCEPTION 'Field "%" bertipe pilihan, nilainya %', d.label, jsonb_typeof(NEW.nilai);
      END IF;
      IF NOT ((NEW.nilai #>> '{}') = ANY (d.opsi)) THEN
        RAISE EXCEPTION 'Field "%": "%" bukan salah satu opsi (%)',
          d.label, NEW.nilai #>> '{}', array_to_string(d.opsi, ', ');
      END IF;
  END CASE;

  NEW.diubah_pada := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cf_nilai_cocok_tipe ON custom_field_nilai;
CREATE TRIGGER trg_cf_nilai_cocok_tipe
  BEFORE INSERT OR UPDATE ON custom_field_nilai
  FOR EACH ROW EXECUTE FUNCTION fn_cf_nilai_cocok_tipe();

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- T5A (2026-08-12) menemukan 30 tabel MATI TOTAL karena RLS menyala tanpa satu
-- pun policy PERMISSIVE: `(OR semua PERMISSIVE) AND (AND semua RESTRICTIVE)`,
-- dan OR atas himpunan kosong bernilai FALSE. Tabel baru wajib punya
-- policy-nya di migrasi yang sama.
ALTER TABLE custom_field_def   ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_nilai ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cf_def_baca ON custom_field_def;
CREATE POLICY cf_def_baca ON custom_field_def
  FOR SELECT USING ((SELECT has_permission('settings:customfield:view')));

DROP POLICY IF EXISTS cf_def_tulis ON custom_field_def;
CREATE POLICY cf_def_tulis ON custom_field_def
  FOR ALL USING ((SELECT has_permission('settings:customfield:manage')))
          WITH CHECK ((SELECT has_permission('settings:customfield:manage')));

-- NILAI dijaga izin yang BERBEDA dari definisi, dan itu disengaja.
--
-- Yang mengisi "nomor BPJS" seorang pegawai adalah staf HRD; yang memutuskan
-- ADA field bernama itu adalah admin. Menyatukan keduanya berarti tiap orang
-- yang boleh mengisi juga boleh mengubah bentuk formulirnya.
DROP POLICY IF EXISTS cf_nilai_baca ON custom_field_nilai;
CREATE POLICY cf_nilai_baca ON custom_field_nilai
  FOR SELECT USING ((SELECT has_permission('settings:customfield:view')));

DROP POLICY IF EXISTS cf_nilai_tulis ON custom_field_nilai;
CREATE POLICY cf_nilai_tulis ON custom_field_nilai
  FOR ALL USING ((SELECT has_permission('settings:customfield:isi')))
          WITH CHECK ((SELECT has_permission('settings:customfield:isi')));

-- ── Izin ────────────────────────────────────────────────────────────────────
INSERT INTO permissions (key, module, label, description, sort_order)
SELECT v.key, 'settings', v.label, v.deskripsi,
       COALESCE((SELECT max(sort_order) FROM permissions), 0) + v.n
  FROM (VALUES
    ('settings:customfield:view',   'Lihat field tambahan',  'Membaca definisi dan nilai field tambahan.', 1),
    ('settings:customfield:manage', 'Kelola field tambahan', 'Menambah/mengubah DEFINISI field tambahan (bentuk formulir).', 2),
    ('settings:customfield:isi',    'Isi field tambahan',    'Mengisi NILAI field tambahan pada data — tanpa boleh mengubah bentuknya.', 3)
  ) AS v(key, label, deskripsi, n)
 WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = v.key);

-- ── Pemberian izin ke role ──────────────────────────────────────────────────
--
-- Izin yang DIBUAT tetapi tak DIBERIKAN ke role mana pun = fitur mati total.
--
-- Diukur 2026-08-12: versi pertama migrasi ini berhenti di `INSERT INTO
-- permissions` di atas, dan seluruh rute custom field membalas 403 untuk
-- SEMUA ORANG — termasuk admin. Yang menemukannya test rute, bukan mata:
-- migrasinya lulus, penjaganya hijau, dan fiturnya tak bisa dipakai siapa pun.
--
-- Kelas cacat yang sama dengan T5A (RLS menyala tanpa policy): gerbang yang
-- benar, dan nol orang di sisi dalamnya.
--
-- Pola pemberiannya MENGIKUTI `settings:apikey:manage` yang sudah ada
-- (admin + direktur), diukur bukan ditebak. `isi` diberikan lebih luas: yang
-- mengisi nomor BPJS pegawai adalah staf HRD, bukan direktur.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('settings:customfield:view', 'settings:customfield:manage', 'settings:customfield:isi')
   AND r.name IN ('admin', 'direktur')
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- `view` + `isi` untuk peran operasional — mereka mengisi data, tak mengubah
-- bentuk formulirnya. Pemisahan inilah alasan ada tiga izin, bukan satu.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r CROSS JOIN permissions p
 WHERE p.key IN ('settings:customfield:view', 'settings:customfield:isi')
   AND r.name IN ('pm')
   AND NOT EXISTS (
     SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- ------------------------------------------------------------
-- Verifikasi — dibuktikan LANGSUNG di basis, bukan diandaikan
-- ------------------------------------------------------------
DO $$
DECLARE
  co uuid;
  dnum uuid;
  dpil uuid;
  n INT;
BEGIN
  FOR n IN SELECT 1 WHERE NOT EXISTS (
    SELECT 1 FROM permissions WHERE key = 'settings:customfield:isi') LOOP
    RAISE EXCEPTION '321 gagal: izin settings:customfield:isi tak terbentuk';
  END LOOP;

  SELECT count(*) INTO n FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname IN ('custom_field_def','custom_field_nilai') AND p.polpermissive;
  IF n < 4 THEN
    RAISE EXCEPTION '321 gagal: % policy PERMISSIVE (butuh >= 4) — tabel akan mati total', n;
  END IF;

  -- Izin yang tak sampai ke satu role pun = fitur mati total, dan itulah
  -- yang terjadi pada versi pertama migrasi ini: seluruh rute membalas 403
  -- untuk SEMUA ORANG, termasuk admin. Migrasinya lulus, penjaganya hijau.
  FOR n IN
    SELECT 1 FROM permissions p
     WHERE p.key LIKE 'settings:customfield:%'
       AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.permission_id = p.id)
  LOOP
    RAISE EXCEPTION '321 gagal: ada izin customfield yang tak diberikan ke role mana pun — fitur mati total';
  END LOOP;

  SELECT id INTO co FROM companies LIMIT 1;
  IF co IS NULL THEN
    RAISE NOTICE '321: basis tanpa company — verifikasi perilaku dilewati';
    RETURN;
  END IF;

  -- ENTITAS di luar daftar DITOLAK oleh tipe, bukan oleh kode.
  BEGIN
    INSERT INTO custom_field_def (company_id, entitas, tipe, kunci, label)
    VALUES (co, 'kasbons', 'teks', 'uji_321', '[321-UJI]');
    RAISE EXCEPTION '321 gagal: entitas di luar enum DITERIMA';
  EXCEPTION WHEN invalid_text_representation THEN NULL;
  END;

  -- TIPE di luar daftar DITOLAK oleh tipe.
  BEGIN
    INSERT INTO custom_field_def (company_id, entitas, tipe, kunci, label)
    VALUES (co, 'projects', 'json', 'uji_321', '[321-UJI]');
    RAISE EXCEPTION '321 gagal: tipe di luar enum DITERIMA';
  EXCEPTION WHEN invalid_text_representation THEN NULL;
  END;

  -- `pilihan` tanpa opsi ditolak.
  BEGIN
    INSERT INTO custom_field_def (company_id, entitas, tipe, kunci, label)
    VALUES (co, 'projects', 'pilihan', 'uji_321p', '[321-UJI]');
    RAISE EXCEPTION '321 gagal: pilihan tanpa opsi DITERIMA — dropdown kosong';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO custom_field_def (company_id, entitas, tipe, kunci, label)
  VALUES (co, 'projects', 'angka', 'uji_321_angka', '[321-UJI] Angka')
  RETURNING id INTO dnum;

  INSERT INTO custom_field_def (company_id, entitas, tipe, kunci, label, opsi)
  VALUES (co, 'projects', 'pilihan', 'uji_321_pil', '[321-UJI] Pilihan', ARRAY['A','B'])
  RETURNING id INTO dpil;

  -- Nilai yang tak cocok tipenya ditolak TRIGGER.
  BEGIN
    INSERT INTO custom_field_nilai (company_id, def_id, entitas_id, nilai)
    VALUES (co, dnum, gen_random_uuid(), '"dua belas"'::jsonb);
    RAISE EXCEPTION '321 gagal: teks diterima pada field bertipe angka';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '321 gagal%' THEN RAISE; END IF;
  END;

  -- Opsi di luar daftar ditolak.
  BEGIN
    INSERT INTO custom_field_nilai (company_id, def_id, entitas_id, nilai)
    VALUES (co, dpil, gen_random_uuid(), '"C"'::jsonb);
    RAISE EXCEPTION '321 gagal: opsi di luar daftar DITERIMA';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '321 gagal%' THEN RAISE; END IF;
  END;

  -- Nilai yang cocok DITERIMA — penjaga yang menolak segalanya tak berguna.
  INSERT INTO custom_field_nilai (company_id, def_id, entitas_id, nilai)
  VALUES (co, dnum, gen_random_uuid(), '12'::jsonb);

  DELETE FROM custom_field_def WHERE label LIKE '[321-UJI]%';

  RAISE NOTICE '321 OK — entitas & tipe tertutup di SCHEMA, nilai divalidasi per tipe, RLS hidup';
END $$;
