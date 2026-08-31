-- ============================================================================
-- 551 — TAGIHAN yang bisa dilihat pelanggan sendiri
-- ============================================================================
--
-- Diukur 2026-08-31: pelanggan TIDAK PUNYA tempat melihat tagihannya. Layar
-- billing yang ada milik konsol vendor — yang membukanya founder, bukan
-- pelanggan.
--
-- Akibatnya nyata dan berurutan: pelanggan tak tahu sudah bayar berapa, kurang
-- berapa, jatuh tempo kapan. Lalu 30 hari sesudah lewat tempo akunnya jadi
-- baca-saja (migrasi 549) dengan pesan yang menyebut nomor tagihan — nomor
-- yang tak pernah bisa ia periksa di mana pun.
--
-- Membekukan akun atas tagihan yang tak bisa dilihat pemiliknya adalah bentuk
-- penegakan yang paling mudah dibenci.
--
-- ══════════════════════════════════════════════════════════════════════════
-- KENAPA DISALIN KE SINI, BUKAN DIBACA DARI DB VENDOR
-- ══════════════════════════════════════════════════════════════════════════
--
-- Diukur: produk TIDAK PUNYA satu pun kredensial ke basis vendor (nol entri
-- `VENDOR_*` di `apps/api/.env`), dan itu benar secara desain — konsol vendor
-- melayani beberapa produk, dan tiap produk yang bisa membacanya adalah satu
-- pintu tambahan ke data seluruh pelanggan SEMUA produk.
--
-- Jadi arah yang sama dengan `entitlement_snapshot` (migrasi 544): konsol
-- MENDORONG, produk membaca salinan lokalnya. Tiga alasan yang sama berlaku —
-- latensi lokal, ketahanan saat konsol mati, dan jejak perubahan.
--
-- ══════════════════════════════════════════════════════════════════════════
-- YANG SENGAJA TIDAK DISALIN
-- ══════════════════════════════════════════════════════════════════════════
--
-- Tak ada `dibuat_oleh`, tak ada id admin vendor, tak ada catatan internal.
-- Tabel ini dibaca PELANGGAN; menyalin kolom yang tak akan pernah ia lihat
-- berarti menaruh data internal vendor di basis milik pelanggan, tanpa
-- keuntungan apa pun.

CREATE TABLE IF NOT EXISTS tagihan_tenant (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Id tagihan DI KONSOL VENDOR. Rujukan lunak — tak ada FK lintas-basis.
  -- Dipakai sebagai kunci dorongan supaya penyegaran tak menggandakan baris.
  tagihan_ref     TEXT NOT NULL,

  nomor           TEXT NOT NULL,
  -- ⚠ `numeric`, bukan float (CLAUDE.md §5.4). Nominal uang yang dibulatkan
  -- biner akan menyimpang dari angka di konsol vendor, dan pelanggan yang
  -- melihat dua angka berbeda untuk tagihan yang sama berhenti mempercayai
  -- keduanya.
  jumlah_idr      NUMERIC NOT NULL,

  -- Kunci status dari konsol (`draf` tak pernah didorong — lihat CHECK).
  status          TEXT NOT NULL,
  periode_mulai   DATE NOT NULL,
  periode_selesai DATE NOT NULL,
  jatuh_tempo     DATE NOT NULL,
  dibayar_pada    TIMESTAMPTZ,

  -- Cara membayar, didorong dari pengaturan vendor. Disimpan sebagai TEKS
  -- siap tampil, bukan disusun produk: rekening bisa berubah, dan produk yang
  -- menyusunnya sendiri akan menampilkan rekening lama sampai ada yang ingat
  -- memperbaruinya.
  cara_bayar      TEXT,

  disegarkan      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (company_id, tagihan_ref)
);

COMMENT ON TABLE tagihan_tenant IS
  'Salinan LOKAL tagihan dari konsol vendor, supaya pelanggan bisa melihat tagihannya sendiri. Produk tak punya kredensial ke basis vendor (dan tak boleh punya) — konsol yang mendorong.';
COMMENT ON COLUMN tagihan_tenant.tagihan_ref IS
  'Id tagihan di konsol vendor. Rujukan lunak: FK lintas-database tak ada. Kunci dorongan.';
COMMENT ON COLUMN tagihan_tenant.cara_bayar IS
  'Teks siap tampil dari pengaturan vendor. Disimpan apa adanya — produk yang menyusunnya sendiri akan menampilkan rekening lama tanpa ada yang tahu.';

-- Tagihan `draf` TIDAK BOLEH didorong: ia belum disetujui siapa pun untuk
-- dilihat pelanggan, dan mungkin masih diperbaiki. Ditegakkan CHECK, bukan
-- kesepakatan — kesepakatan yang tak ditegakkan akan dilanggar oleh kode
-- berikutnya yang menulis ke sini.
ALTER TABLE tagihan_tenant DROP CONSTRAINT IF EXISTS tagihan_tenant_status_check;
ALTER TABLE tagihan_tenant ADD CONSTRAINT tagihan_tenant_status_check
  CHECK (status IN ('terkirim', 'dibayar', 'lewat_tempo', 'dibatalkan'));

CREATE INDEX IF NOT EXISTS idx_tagihan_tenant
  ON tagihan_tenant (company_id, jatuh_tempo DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Ber-`company_id`, jadi tunduk aturan tenancy. Ditulis HANYA lewat
-- service-role (dorongan konsol); pengguna cuma MEMBACA miliknya sendiri.
ALTER TABLE tagihan_tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tagihan_tenant FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tagihan_tenant_baca ON tagihan_tenant;
CREATE POLICY tagihan_tenant_baca ON tagihan_tenant
  FOR SELECT USING (company_id = auth_company_id());

-- ⚠ RESTRICTIVE, bukan PERMISSIVE. Policy PERMISSIVE digabung dengan OR, jadi
-- satu policy longgar yang ditambahkan kemudian MEMBATALKAN penyaringan ini.
-- `document_number_series` pernah membocorkan seluruh isinya ke admin tenant
-- lain persis karena itu — dan di sini yang bocor adalah keuangan pelanggan.
DROP POLICY IF EXISTS tagihan_tenant_pagar ON tagihan_tenant;
CREATE POLICY tagihan_tenant_pagar ON tagihan_tenant
  AS RESTRICTIVE FOR ALL USING (company_id = auth_company_id());

-- ============================================================================
-- VERIFIKASI
-- ============================================================================
DO $$
DECLARE
  v_rls BOOLEAN; v_force BOOLEAN; v_perm INT; v_restr INT; v_tipe TEXT; v_ok BOOLEAN;
BEGIN
  SELECT relrowsecurity, relforcerowsecurity INTO v_rls, v_force
    FROM pg_class WHERE oid = 'tagihan_tenant'::regclass;
  IF NOT v_rls OR NOT v_force THEN
    RAISE EXCEPTION '551 gagal: RLS/FORCE belum aktif (rls=%, force=%)', v_rls, v_force;
  END IF;

  -- Tabel FORCE tanpa PERMISSIVE tak terbaca SIAPA PUN — himpunan permissive
  -- yang kosong bernilai FALSE. Keduanya diperiksa, bukan salah satu.
  SELECT count(*) FILTER (WHERE permissive = 'PERMISSIVE'),
         count(*) FILTER (WHERE permissive = 'RESTRICTIVE')
    INTO v_perm, v_restr
    FROM pg_policies WHERE tablename = 'tagihan_tenant';
  IF v_perm < 1 THEN
    RAISE EXCEPTION '551 gagal: FORCE tanpa policy PERMISSIVE — tabel tak terbaca siapa pun';
  END IF;
  IF v_restr < 1 THEN
    RAISE EXCEPTION '551 gagal: tanpa policy RESTRICTIVE — policy permissive baru bisa membatalkan penyaringan tenant';
  END IF;

  -- Nominal WAJIB numeric. Float akan menyimpang dari angka di konsol, dan
  -- pelanggan yang melihat dua angka berbeda berhenti mempercayai keduanya.
  SELECT data_type INTO v_tipe FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'tagihan_tenant'
     AND column_name = 'jumlah_idr';
  IF v_tipe <> 'numeric' THEN
    RAISE EXCEPTION '551 gagal: jumlah_idr bertipe %, harus numeric', v_tipe;
  END IF;

  -- CHECK-nya DIBUKTIKAN menolak `draf`, bukan diasumsikan dari DDL.
  SELECT pg_get_constraintdef(oid) NOT LIKE '%draf%' INTO v_ok
    FROM pg_constraint
   WHERE conrelid = 'tagihan_tenant'::regclass AND conname = 'tagihan_tenant_status_check';
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION '551 gagal: CHECK status menerima draf — tagihan yang belum disetujui akan terlihat pelanggan';
  END IF;

  RAISE NOTICE '551 OK — tagihan_tenant siap (permissive=%, restrictive=%)', v_perm, v_restr;
END $$;
