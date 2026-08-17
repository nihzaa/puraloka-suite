-- ════════════════════════════════════════════════════════════════════════════
-- 450 — Klausul kontrak: dari dipaku di kode menjadi milik tiap tenant
-- ════════════════════════════════════════════════════════════════════════════
--
-- Menutup sisa `md-template-dok`. Catatannya berbunyi: "klausul kontrak masih
-- dipaku di kode (`contracts.ts` PASAL 1-11 literal)".
--
-- ── Kenapa ini bukan sekadar kerapian
--
-- Sebelas pasal kontrak tertulis sebagai string di `contracts.ts`. Untuk
-- aplikasi satu perusahaan itu cukup. Untuk SaaS multi-tenant ia berarti:
--
--   1. Tiap PT menerbitkan kontrak berklausul IDENTIK, termasuk pilihan
--      forum sengketa dan definisi force majeure — padahal itu justru bagian
--      yang tiap perusahaan (dan tiap penasihat hukumnya) ingin atur sendiri.
--   2. Mengubah satu kalimat menuntut rilis kode. Notaris yang meminta
--      penyesuaian pasal harus menunggu deploy.
--   3. Kontrak yang sudah TERBIT ikut berubah bunyinya saat kodenya diubah,
--      karena PDF-nya di-generate ulang tiap kali diunduh — dan tak ada
--      jejak bahwa yang dibaca hari ini berbeda dari yang ditandatangani.
--
-- Yang ketiga paling berbahaya, dan itu sebabnya `versi` ada di tabel ini.
--
-- ── Kenapa hanya SEBAGIAN pasal yang bisa diubah
--
-- Diukur di `contracts.ts`: dari 11 pasal, LIMA menganyam data hidup —
-- nilai kontrak + terbilang (3), jangka waktu (4), termin pembayaran (5),
-- masa pemeliharaan (7), dan lingkup dari kategori RAB (2).
--
-- Menjadikannya template berarti menyediakan bahasa templating dengan
-- perulangan dan format rupiah — dan template yang salah tulis akan
-- menghasilkan kontrak bernilai kosong yang tetap tercetak rapi.
--
-- Karena itu yang dibuka HANYA pasal berteks murni: 1, 6, 8, 9, 10, 11.
-- Sisanya tetap dirakit kode. Batas ini DISENGAJA dan ditulis di sini supaya
-- yang membacanya kelak tak menyangkanya kelalaian.
--
-- ── Kenapa `versi`, bukan hanya `isi`
--
-- Kontrak yang sudah ditandatangani harus bisa dicetak ulang PERSIS seperti
-- saat ditandatangani. Tanpa versi, memperbaiki satu salah ketik hari ini
-- diam-diam mengubah bunyi seluruh kontrak yang pernah terbit.
--
-- Nomor versi naik tiap kali isinya berubah, dan yang lama TIDAK dihapus.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS klausul_kontrak (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Nomor pasal sebagai TEKS: kontrak lazim memakai "8a" untuk sisipan, dan
  -- integer memaksa penomoran ulang seluruh pasal sesudahnya.
  nomor       TEXT NOT NULL,
  judul       TEXT NOT NULL,
  isi         TEXT NOT NULL,

  -- Urutan cetak DIPISAH dari nomor. Pasal "8a" harus tercetak sesudah "8",
  -- dan pengurutan teks menaruh "10" sebelum "2".
  urutan      INTEGER NOT NULL DEFAULT 0,

  versi       INTEGER NOT NULL DEFAULT 1,
  aktif       BOOLEAN NOT NULL DEFAULT TRUE,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Isi kosong menghasilkan pasal berjudul tanpa badan — kertas yang
  -- terlihat lengkap padahal kewajibannya hilang.
  CONSTRAINT klausul_isi_tak_kosong CHECK (btrim(isi) <> ''),
  CONSTRAINT klausul_judul_tak_kosong CHECK (btrim(judul) <> ''),
  CONSTRAINT klausul_versi_wajar CHECK (versi >= 1)
);

-- Satu nomor pasal AKTIF per tenant. Parsial: yang non-aktif boleh berulang
-- karena itulah riwayatnya — dan riwayat yang tak boleh berulang bukan
-- riwayat (pelajaran migrasi 343).
CREATE UNIQUE INDEX IF NOT EXISTS klausul_nomor_aktif_per_company
  ON klausul_kontrak (company_id, nomor) WHERE aktif;

CREATE INDEX IF NOT EXISTS idx_klausul_company_urutan
  ON klausul_kontrak (company_id, urutan) WHERE aktif;

COMMENT ON TABLE klausul_kontrak IS
  'Klausul kontrak per tenant (450). HANYA pasal berteks murni — pasal yang '
  'menganyam data hidup (nilai kontrak, termin, jangka waktu) tetap dirakit '
  'kode di contracts.ts, karena template bernilai kosong tetap tercetak rapi.';

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE klausul_kontrak ENABLE ROW LEVEL SECURITY;
ALTER TABLE klausul_kontrak FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS klausul_tenant_isolation ON klausul_kontrak;
CREATE POLICY klausul_tenant_isolation ON klausul_kontrak
  FOR ALL USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- ─── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_co    UUID;
  v_co2   UUID;
  v_id    UUID;
  v_lolos BOOLEAN := FALSE;
  n       INT;
BEGIN
  SELECT id INTO v_co FROM companies LIMIT 1;
  SELECT id INTO v_co2 FROM companies WHERE id <> v_co LIMIT 1;

  -- 1. RLS benar-benar aktif DAN dipaksa.
  SELECT count(*) INTO n FROM pg_class
   WHERE relname = 'klausul_kontrak' AND relrowsecurity AND relforcerowsecurity;
  IF n <> 1 THEN
    RAISE EXCEPTION '450 gagal: RLS/FORCE tidak aktif — service-role akan melewatinya';
  END IF;

  -- 2. Isi kosong DITOLAK. Pasal berjudul tanpa badan adalah kertas yang
  --    terlihat lengkap padahal kewajibannya hilang.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO klausul_kontrak (company_id, nomor, judul, isi)
    VALUES (v_co, '[450-A]', 'Uji', '   ');
    v_lolos := TRUE;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM klausul_kontrak WHERE nomor LIKE '[450-%';
    RAISE EXCEPTION '450 gagal: klausul ber-isi KOSONG diterima';
  END IF;

  -- 3. Nomor pasal AKTIF tak boleh kembar dalam satu tenant.
  INSERT INTO klausul_kontrak (company_id, nomor, judul, isi)
  VALUES (v_co, '[450-B]', 'Uji', 'Isi sah') RETURNING id INTO v_id;

  v_lolos := FALSE;
  BEGIN
    INSERT INTO klausul_kontrak (company_id, nomor, judul, isi)
    VALUES (v_co, '[450-B]', 'Kembar', 'Isi lain');
    v_lolos := TRUE;
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF v_lolos THEN
    DELETE FROM klausul_kontrak WHERE nomor LIKE '[450-%';
    RAISE EXCEPTION '450 gagal: dua pasal AKTIF bernomor sama diterima — '
      'kontrak akan memuat dua PASAL 8 yang berbeda bunyinya';
  END IF;

  -- 4. …tapi versi NON-AKTIF boleh berulang. Itulah riwayatnya.
  UPDATE klausul_kontrak SET aktif = FALSE WHERE id = v_id;
  BEGIN
    INSERT INTO klausul_kontrak (company_id, nomor, judul, isi, versi)
    VALUES (v_co, '[450-B]', 'Versi baru', 'Isi diperbarui', 2);
  EXCEPTION WHEN unique_violation THEN
    DELETE FROM klausul_kontrak WHERE nomor LIKE '[450-%';
    RAISE EXCEPTION '450 gagal: versi LAMA menghalangi versi baru — '
      'riwayat klausul jadi mustahil disimpan';
  END;

  -- 5. Tenant LAIN boleh memakai nomor pasal yang sama.
  IF v_co2 IS NOT NULL THEN
    BEGIN
      INSERT INTO klausul_kontrak (company_id, nomor, judul, isi)
      VALUES (v_co2, '[450-B]', 'Milik tenant lain', 'Isi tenant lain');
    EXCEPTION WHEN unique_violation THEN
      DELETE FROM klausul_kontrak WHERE nomor LIKE '[450-%';
      RAISE EXCEPTION '450 gagal: tenant kedua DITOLAK nomor pasal tenant pertama';
    END;
  END IF;

  DELETE FROM klausul_kontrak WHERE nomor LIKE '[450-%';

  RAISE NOTICE '450 OK — klausul per tenant: isi kosong ditolak, nomor aktif '
    'unik per tenant, versi lama tetap bisa disimpan, tenant lain tak terhalang';
END $$;
