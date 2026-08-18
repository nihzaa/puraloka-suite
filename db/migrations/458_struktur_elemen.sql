-- ════════════════════════════════════════════════════════════════════════════
-- 458 — elemen struktur: menyimpan hasil analisa & menyambungkannya ke RAB
--
-- ── Apa yang disimpan, dan apa yang TIDAK
--
-- Delapan modul `lib/struktur-*.ts` sudah menghitung kapasitas dan volume dari
-- input geometri. Yang belum ada: tempat menyimpannya, sehingga hasil analisa
-- hilang begitu halaman ditutup dan tak pernah sampai ke RAB.
--
-- Tabel ini menyimpan **INPUT** (geometri, mutu, beban) dan **RINGKASAN HASIL**
-- (verdict, volume, tonase). Yang TIDAK disimpan: rincian perhitungan antara —
-- kurva P-M 200 titik, posisi tiap batang, daftar BBS per potongan.
--
-- Alasannya bukan hemat tempat. Angka antara adalah TURUNAN MURNI dari input:
-- fungsi `analisa*` pure, jadi input yang sama selalu menghasilkan keluaran
-- yang sama. Menyimpannya berarti punya dua sumber kebenaran yang bisa
-- berselisih — dan yang berselisih diam-diam adalah yang paling berbahaya:
-- rumus diperbaiki, angka tersimpan tetap yang lama, dan tak ada yang tahu
-- mana yang dipakai.
--
-- Yang DISIMPAN dari hasil hanyalah yang dipakai untuk MENYARING dan
-- MEREKAP tanpa menghitung ulang: `aman`, `beton_m3`, `besi_kg`. Ketiganya
-- diperbarui bersamaan setiap input berubah (dijaga trigger di bawah).
--
-- ── Kenapa `hasil_ringkas` jsonb, bukan kolom-kolom
--
-- Tiap jenis elemen punya verdict yang berbeda: balok punya "Lentur" dan
-- "Geser", footplat punya "Geser pons" dan "Tanah tidak terangkat", tiang
-- punya "Daya dukung". Memaksakannya ke kolom tetap berarti 40+ kolom yang
-- sebagian besar NULL, atau tabel per jenis elemen.
--
-- jsonb menyimpan array `periksa` apa adanya. Yang dijadikan KOLOM hanya tiga
-- angka yang di-query: aman, beton, besi.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS struktur_elemen (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Penanda yang dipakai orang, bukan UUID: "B1", "K2", "P-LANTAI-3".
  kode               TEXT NOT NULL,
  nama               TEXT,

  -- Jenis elemen menentukan bentuk `input` dan modul yang menghitungnya.
  -- Daftar TERTUTUP: jenis karangan akan gagal di rute sebelum sampai sini,
  -- dan CHECK ini adalah jaring terakhirnya.
  jenis              TEXT NOT NULL CHECK (jenis IN (
                       'balok', 'kolom', 'kolom_bulat', 'plat',
                       'footplat', 'pilecap', 'tiang'
                     )),

  -- Jumlah elemen identik. Volume dikalikan ini; kapasitas TIDAK.
  jumlah             INTEGER NOT NULL DEFAULT 1 CHECK (jumlah > 0),

  /*
    INPUT LENGKAP sebagai jsonb — sumber kebenaran satu-satunya.

    Bentuknya mengikuti `Input*` milik modulnya (InputBalok, InputKolom, …).
    Disimpan utuh supaya hasil bisa DIHITUNG ULANG kapan pun: kalau rumus
    diperbaiki, seluruh elemen tinggal dihitung ulang dari input yang sama.
  */
  input              JSONB NOT NULL,

  /*
    RINGKASAN hasil — diturunkan dari `input`, disimpan untuk query.

    `aman` NULL berarti BELUM DIHITUNG, bukan "tidak aman". Dua keadaan yang
    berbeda: elemen yang baru dibuat belum punya verdict, dan menampilkannya
    sebagai merah akan menakuti orang tanpa sebab.
  */
  aman               BOOLEAN,
  beton_m3           NUMERIC(14, 4) CHECK (beton_m3 IS NULL OR beton_m3 >= 0),
  bekisting_m2       NUMERIC(14, 4) CHECK (bekisting_m2 IS NULL OR bekisting_m2 >= 0),
  besi_kg            NUMERIC(14, 3) CHECK (besi_kg IS NULL OR besi_kg >= 0),
  hasil_ringkas      JSONB,

  -- Kapan hasil terakhir dihitung. Dibandingkan dengan `updated_at` untuk
  -- tahu apakah ringkasannya masih sesuai inputnya (lihat kolom `basi`).
  dihitung_pada      TIMESTAMPTZ,

  catatan            TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by         UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Kode unik per proyek — "B1" tak boleh ada dua di satu proyek.
  CONSTRAINT struktur_elemen_kode_unik UNIQUE (project_id, kode)
);

CREATE INDEX IF NOT EXISTS idx_struktur_elemen_proyek
  ON struktur_elemen (project_id, jenis);
CREATE INDEX IF NOT EXISTS idx_struktur_elemen_company
  ON struktur_elemen (company_id);

/*
  ── `basi`: ringkasan yang tak lagi sesuai inputnya

  Kolom TURUNAN, bukan disimpan. Bernilai true bila input berubah sesudah
  hasil terakhir dihitung — keadaan yang PASTI terjadi: orang mengubah
  dimensi lalu lupa menekan "hitung ulang".

  Tanpa penanda ini, halaman menampilkan verdict lama di sebelah dimensi
  baru, dan tak ada satu pun galat. Itu jenis kesalahan yang paling mudah
  dipercaya karena angkanya terlihat wajar.
*/
ALTER TABLE struktur_elemen
  DROP COLUMN IF EXISTS basi;
ALTER TABLE struktur_elemen
  ADD COLUMN basi BOOLEAN GENERATED ALWAYS AS (
    dihitung_pada IS NULL OR dihitung_pada < updated_at
  ) STORED;

/*
  ⚠ `updated_at` memakai `clock_timestamp()`, BUKAN `now()` — dan perbedaan
  itu menentukan apakah `basi` bekerja sama sekali.

  `now()` BEKU sepanjang satu transaksi: seluruh pemanggilannya memulangkan
  waktu yang sama persis. Akibatnya, bila hasil dihitung lalu input diubah
  dalam SATU request (hal yang lazim: simpan → hitung → simpan lagi),
  `updated_at` baru sama dengan `dihitung_pada` lama, `<` tidak terpenuhi,
  dan elemen basi tetap terlihat SEGAR.

  Dibuktikan dengan uji langsung: dua `now()` dalam satu transaksi memulangkan
  timestamp identik, sementara dua `clock_timestamp()` berbeda.

  Penanda yang bisa berbohong lebih buruk daripada tak ada penanda — orang
  akan membaca verdict lama di sebelah dimensi baru tanpa satu pun peringatan.
*/

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE struktur_elemen ENABLE ROW LEVEL SECURITY;
ALTER TABLE struktur_elemen FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS struktur_elemen_tenant_isolation ON struktur_elemen;
CREATE POLICY struktur_elemen_tenant_isolation ON struktur_elemen
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

/*
  ── Trigger: company_id WAJIB cocok dengan proyeknya

  Tanpa ini, elemen tenant A bisa ditempelkan ke proyek tenant B dengan
  mengirim `project_id` milik orang lain — RLS hanya memeriksa `company_id`
  yang DIKIRIM, bukan yang seharusnya.

  CHECK tak bisa melakukannya: ia hanya melihat satu baris, sementara
  pemeriksaan ini menuntut membaca `projects`.
*/
CREATE OR REPLACE FUNCTION fn_struktur_elemen_tenant_cocok()
RETURNS TRIGGER AS $$
DECLARE
  v_company UUID;
BEGIN
  SELECT company_id INTO v_company FROM projects WHERE id = NEW.project_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Proyek % tidak ditemukan', NEW.project_id;
  END IF;
  IF v_company <> NEW.company_id THEN
    RAISE EXCEPTION 'company_id (%) tidak cocok dengan pemilik proyek (%)',
      NEW.company_id, v_company;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_struktur_elemen_tenant ON struktur_elemen;
CREATE TRIGGER trg_struktur_elemen_tenant
  BEFORE INSERT OR UPDATE OF project_id, company_id ON struktur_elemen
  FOR EACH ROW EXECUTE FUNCTION fn_struktur_elemen_tenant_cocok();

/*
  ── Trigger: `updated_at` selalu bergerak saat input berubah

  Kolom `basi` bergantung padanya. Kalau `updated_at` diserahkan ke aplikasi,
  satu pemanggilan yang lupa mengisinya membuat elemen basi terlihat segar —
  dan penanda yang bisa berbohong lebih buruk daripada tak ada penanda.
*/
CREATE OR REPLACE FUNCTION fn_struktur_elemen_sentuh()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.input IS DISTINCT FROM OLD.input
     OR NEW.jumlah IS DISTINCT FROM OLD.jumlah THEN
    -- clock_timestamp(), bukan now() — lihat alasan di atas kolom `basi`.
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_struktur_elemen_sentuh ON struktur_elemen;
CREATE TRIGGER trg_struktur_elemen_sentuh
  BEFORE UPDATE ON struktur_elemen
  FOR EACH ROW EXECUTE FUNCTION fn_struktur_elemen_sentuh();

-- ─── Izin ───────────────────────────────────────────────────────────────────
-- Kolom `module` dan `label` NOT NULL — dibaca dari information_schema, bukan
-- ditebak. Percobaan pertama memakai `category` yang TIDAK ADA di tabel ini.
INSERT INTO permissions (key, module, label, description)
VALUES
  ('cecep:struktur:view',   'cecep', 'Lihat analisa struktur',
   'Melihat hasil analisa & gambar struktur'),
  ('cecep:struktur:manage', 'cecep', 'Kelola analisa struktur',
   'Membuat, mengubah, dan menghapus analisa struktur')
ON CONFLICT (key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON struktur_elemen TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON struktur_elemen TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFIKASI — migrasi GAGAL bila hasilnya tak seperti yang dimaksud
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_rls BOOLEAN;
  v_force BOOLEAN;
  v_kolom INTEGER;
  v_izin INTEGER;
BEGIN
  -- 1. RLS aktif DAN dipaksa. Tanpa FORCE, service-role melewatinya sepenuhnya
  --    dan isolasi tenant jadi hiasan (pelajaran migrasi 457).
  SELECT relrowsecurity, relforcerowsecurity INTO v_rls, v_force
    FROM pg_class WHERE relname = 'struktur_elemen';
  IF NOT v_rls OR NOT v_force THEN
    RAISE EXCEPTION '458 gagal: RLS belum aktif/FORCE (rls=%, force=%)', v_rls, v_force;
  END IF;

  -- 2. Kolom `basi` benar-benar GENERATED — kalau ia kolom biasa, nilainya
  --    bisa ditulis aplikasi dan penandanya berbohong.
  SELECT count(*) INTO v_kolom FROM information_schema.columns
   WHERE table_name = 'struktur_elemen' AND column_name = 'basi'
     AND is_generated = 'ALWAYS';
  IF v_kolom <> 1 THEN
    RAISE EXCEPTION '458 gagal: kolom `basi` bukan GENERATED ALWAYS';
  END IF;

  -- 3. Kedua izin terdaftar — `requirePermission` dengan kunci hantu menolak
  --    SEMUA orang tanpa gejala (dijaga `audit-izin-benar-ada.mjs`).
  SELECT count(*) INTO v_izin FROM permissions
   WHERE key IN ('cecep:struktur:view', 'cecep:struktur:manage');
  IF v_izin <> 2 THEN
    RAISE EXCEPTION '458 gagal: izin cecep:struktur:* belum lengkap (ada %)', v_izin;
  END IF;

  -- 4. Trigger `sentuh` WAJIB memakai clock_timestamp(), bukan now().
  --    Dengan now() penanda `basi` diam-diam berhenti bekerja untuk perubahan
  --    yang terjadi dalam satu transaksi — dan itu keadaan yang lazim.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'fn_struktur_elemen_sentuh'
       AND prosrc LIKE '%clock_timestamp()%'
  ) THEN
    RAISE EXCEPTION '458 gagal: fn_struktur_elemen_sentuh tidak memakai clock_timestamp() — penanda `basi` akan berbohong dalam satu transaksi';
  END IF;
END $$;
