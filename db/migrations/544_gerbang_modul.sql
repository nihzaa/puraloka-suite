-- ============================================================================
-- 544 — GERBANG MODUL: katalog diselaraskan + snapshot entitlement
-- ============================================================================
--
-- Migrasi 538 mendaftarkan 25 fitur (22 modul + 3 kuota). Diukur 2026-08-31,
-- `bolehPakaiFitur()` di `apps/api/src/utils/batas-paket.ts:346` punya
-- **NOL pemanggil** — ke-22 kunci modul itu terdaftar, tak pernah ditegakkan.
-- Akibat komersialnya langsung: paket Kecil dan Enterprise membuka modul yang
-- sama persis, jadi tak ada alasan siapa pun naik paket.
--
-- Migrasi ini menyiapkan dua hal yang dibutuhkan gerbangnya.
--
-- ══════════════════════════════════════════════════════════════════════════
-- BAGIAN 1 — `modul.mutu` dipensiunkan (cermin migrasi vendor 016)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Katalog menjual tiga barang yang ternyata dua. Bukti dari kode, bukan nama:
--
--   • `/mutu/insiden` dan `/k3/insiden` memanggil endpoint yang SAMA PERSIS
--     (`api/v1/k3/insiden`) — menutup satu sambil membuka yang lain
--     menyisakan jalan masuk utuh.
--   • `mutu-ikhtisar.ts` tak menyentuh satu pun tabel mutu; ketiga sumbernya
--     `dokumen_kepatuhan`, `izin_kerja`, `evaluasi_subkon`.
--
-- Keputusan founder 2026-08-31: gabung jadi dua.
--
-- ⚠ Kedua sisi WAJIB dijalankan. Kalau vendor memensiunkan sementara produk
-- tidak, konsol berhenti menawarkan `modul.mutu` tapi produk tetap
-- memeriksanya — dan pemeriksaan atas kunci yang tak pernah diberikan siapa
-- pun akan selalu menjawab "terbuka". Gerbang yang diam.
--
-- `modul.mutu` DIHAPUS di sisi produk (bukan dinonaktifkan seperti di vendor)
-- karena `plan_features` tak punya kolom `aktif`, dan katalog produk BUKAN
-- layar pemilihan — ia daftar kunci yang bisa ditegakkan. Kunci yang tak
-- boleh ditegakkan lagi tak punya alasan tinggal di sana.

DELETE FROM plan_feature_values
 WHERE feature_id IN (SELECT id FROM plan_features WHERE key = 'modul.mutu');

DELETE FROM plan_features WHERE key = 'modul.mutu';

UPDATE plan_features
   SET label = 'Mutu (QA/QC)',
       description = 'Rencana mutu (ITP), uji material, NCR, audit mutu, dan pelajaran yang dipetik.'
 WHERE key = 'modul.uji_mutu';

UPDATE plan_features
   SET description = 'Kepatuhan K3, JSA, RK3K, insiden, dan pelaporan lingkungan.'
 WHERE key = 'modul.k3_lingkungan';

-- ══════════════════════════════════════════════════════════════════════════
-- BAGIAN 2 — SNAPSHOT ENTITLEMENT, dan kenapa ia hidup di DB PRODUK
-- ══════════════════════════════════════════════════════════════════════════
--
-- Paket dan langganan adalah kebenaran milik KONSOL VENDOR, di basis yang
-- TERPISAH — tak ada FK yang bisa menghubungkan keduanya.
--
-- Godaannya: panggil DB vendor tiap kali gerbang diperiksa. Itu keliru, dan
-- riset praktik industri (2026-08-31) menyebut sebabnya dengan tepat —
-- ia menjadikan DB vendor **titik kegagalan tunggal atas seluruh produk**.
-- Konsol vendor mati, dan 2.022 perusahaan kehilangan seluruh modulnya
-- sekaligus. Itu bukan penegakan batas; itu pemadaman.
--
-- Jadi kebenaran vendor DISALIN ke sini, dan gerbang membaca salinan lokal:
--
--     konsol vendor  --(webhook saat paket berubah)-->  snapshot ini
--     rute API       --(baca lokal, tanpa lintas-basis)-->  gerbang
--
-- Tiga hal didapat sekaligus: latensi lokal, ketahanan saat vendor mati, dan
-- jejak kapan paket sebuah tenant berubah.
--
-- ── `batas` boleh NULL, dan NULL berarti TAK TERBATAS
--
-- ⚠ Bukan nol. Membalik arti keduanya membuat paket termahal jadi paket
-- paling terbatas — dan angka 0 yang terbaca "tanpa batas" jauh lebih mudah
-- lolos tinjauan daripada kebalikannya. Aturan yang sama sudah berlaku di
-- `paket_fitur_ref` (vendor) dan `plan_feature_values` (produk); menyimpang
-- di sini akan membuat ketiganya tak sepakat tanpa satu pun galat.

CREATE TABLE IF NOT EXISTS entitlement_snapshot (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Kunci katalog, mis. `modul.akuntansi`. Sengaja TEXT tanpa FK ke
  -- `plan_features`: snapshot adalah rekaman apa yang vendor katakan, dan itu
  -- tetap benar sebagai rekaman meski katalog lokal berubah kemudian.
  kunci        TEXT NOT NULL,

  -- Untuk kunci `modul.*`: apakah terbuka.
  terbuka      BOOLEAN,
  -- Untuk kunci `kuota.*`: batasnya. NULL = TAK TERBATAS (bukan nol).
  batas        INTEGER,

  -- Dari konsol vendor, untuk pesan ke pengguna ("tidak termasuk paket Kecil").
  paket_kode   TEXT,
  paket_nama   TEXT,

  -- Kapan vendor terakhir mengabarkan. Dipakai memutuskan apakah snapshot
  -- masih layak dipercaya, dan untuk mendiagnosis webhook yang berhenti tiba.
  disegarkan   TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (company_id, kunci)
);

COMMENT ON TABLE entitlement_snapshot IS
  'Salinan LOKAL entitlement dari konsol vendor. Gerbang modul membaca dari sini, TIDAK pernah memanggil DB vendor di jalur permintaan — kalau ia memanggil, konsol vendor mati berarti seluruh tenant kehilangan seluruh modul.';
COMMENT ON COLUMN entitlement_snapshot.batas IS
  'Hanya untuk kunci kuota.*. NULL = TAK TERBATAS, bukan nol. Membalik artinya membuat paket termahal jadi paling terbatas.';
COMMENT ON COLUMN entitlement_snapshot.disegarkan IS
  'Kapan konsol vendor terakhir mengabarkan. Snapshot yang lama tak menyegar adalah gejala webhook yang berhenti tiba — dan diamnya webhook tak mengeluarkan galat.';

CREATE INDEX IF NOT EXISTS idx_entitlement_company
  ON entitlement_snapshot (company_id, kunci);

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
-- Tabel ini ber-`company_id`, jadi tunduk aturan tenancy repo ini.
-- Penulisannya HANYA lewat service-role (webhook vendor); pengguna biasa cuma
-- boleh MEMBACA miliknya sendiri — supaya UI bisa menampilkan gembok dan
-- halaman upsell tanpa harus menebak.
ALTER TABLE entitlement_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement_snapshot FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entitlement_baca_tenant ON entitlement_snapshot;
CREATE POLICY entitlement_baca_tenant ON entitlement_snapshot
  FOR SELECT USING (company_id = auth_company_id());

-- ⚠ RESTRICTIVE, bukan PERMISSIVE. Policy PERMISSIVE digabung dengan OR, jadi
-- satu policy longgar yang ditambahkan kemudian akan MEMBATALKAN penyaringan
-- ini. `document_number_series` pernah membocorkan seluruh isinya ke admin
-- tenant lain persis karena itu.
DROP POLICY IF EXISTS entitlement_pagar_tenant ON entitlement_snapshot;
CREATE POLICY entitlement_pagar_tenant ON entitlement_snapshot
  AS RESTRICTIVE FOR ALL USING (company_id = auth_company_id());

-- ============================================================================
-- VERIFIKASI
-- ============================================================================
DO $$
DECLARE
  v_mutu INT; v_label TEXT; v_modul INT; v_rls BOOLEAN; v_force BOOLEAN;
  v_permissive INT; v_restrictive INT;
BEGIN
  SELECT count(*) INTO v_mutu FROM plan_features WHERE key = 'modul.mutu';
  IF v_mutu <> 0 THEN
    RAISE EXCEPTION '544 gagal: modul.mutu masih ada di plan_features';
  END IF;

  SELECT label INTO v_label FROM plan_features WHERE key = 'modul.uji_mutu';
  IF v_label IS DISTINCT FROM 'Mutu (QA/QC)' THEN
    RAISE EXCEPTION '544 gagal: label modul.uji_mutu = %', coalesce(v_label, '(hilang)');
  END IF;

  -- 21 modul, mencerminkan katalog vendor sesudah 016. Kalau angka kedua sisi
  -- berbeda, gerbangnya akan memeriksa kunci yang tak pernah diberikan.
  SELECT count(*) INTO v_modul FROM plan_features WHERE value_type = 'boolean';
  IF v_modul <> 21 THEN
    RAISE EXCEPTION '544 gagal: modul di plan_features = %, harap 21 (cermin vendor 016)', v_modul;
  END IF;

  SELECT relrowsecurity, relforcerowsecurity INTO v_rls, v_force
    FROM pg_class WHERE oid = 'entitlement_snapshot'::regclass;
  IF NOT v_rls OR NOT v_force THEN
    RAISE EXCEPTION '544 gagal: RLS/FORCE belum aktif pada entitlement_snapshot (rls=%, force=%)', v_rls, v_force;
  END IF;

  -- Tabel FORCE tanpa PERMISSIVE tak terbaca SIAPA PUN — himpunan permissive
  -- yang kosong bernilai FALSE. Keduanya diperiksa, bukan salah satu.
  SELECT count(*) FILTER (WHERE permissive = 'PERMISSIVE'),
         count(*) FILTER (WHERE permissive = 'RESTRICTIVE')
    INTO v_permissive, v_restrictive
    FROM pg_policies WHERE tablename = 'entitlement_snapshot';
  IF v_permissive < 1 THEN
    RAISE EXCEPTION '544 gagal: entitlement_snapshot FORCE tanpa policy PERMISSIVE — tak terbaca siapa pun';
  END IF;
  IF v_restrictive < 1 THEN
    RAISE EXCEPTION '544 gagal: entitlement_snapshot tanpa policy RESTRICTIVE — policy permissive baru bisa membatalkan penyaringan tenant';
  END IF;

  RAISE NOTICE '544 OK — 21 modul, snapshot entitlement siap (permissive=%, restrictive=%)', v_permissive, v_restrictive;
END $$;
