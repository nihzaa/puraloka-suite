-- ============================================================================
-- 464 — Harga agregat per KILOGRAM: koreksi harga m³ yang tersalin ke baris kg
-- ============================================================================
--
-- ── Apa yang salah
--
-- Ditemukan 2026-08-19 saat menyambungkan volume struktur ke RAB. Angka yang
-- keluar dari analisa AHSP:
--
--     1 m³ beton f'c 25 MPa  =  Rp 626.849.988
--
-- Yang benar sekitar Rp 1 juta. Salah sekitar 600×.
--
-- Sebabnya harga per m³ tersalin apa adanya ke resource bersatuan kg:
--
--     AHSP-R0101  "Pasir beton (quarry…)"  m3  Rp 370.200   ← benar
--     AHSP-R0076  "Pasir beton"            kg  Rp 370.200   ← angka m³ di baris kg
--     AHSP-R0108  "Pasir beton (quarry…)"  kg  Rp 370.200   ← sama
--     AHSP-R0009  "Kerikil"                m3  Rp 352.300   ← benar
--     AHSP-R0077  "Kerikil"                kg  Rp 352.300   ← angka m³ di baris kg
--     AHSP-R0602  "Pupuk Organik"          m3  Rp 178.000   ← benar
--     AHSP-R0821  "Pupuk Organik"          kg  Rp 178.000   ← angka m³ di baris kg
--
-- ── Kenapa KOEFISIENNYA tidak ikut disalahkan
--
-- Diukur pada AHSP `2.2.1.5.6` (1 m³ beton f'c 25):
--
--     731 kg pasir + 1.009 kg kerikil + 407 kg semen = 2.147 kg
--
-- ditambah 202 liter air ≈ 2.349 kg/m³ — cocok dengan densitas beton nyata
-- (~2.400 kg/m³). Koefisiennya BENAR dan memang bersatuan kg. Yang salah cuma
-- harganya, jadi yang dikoreksi harganya.
--
-- ── Kenapa ENTRI BARU, bukan UPDATE
--
-- Percobaan pertama migrasi ini meng-UPDATE harganya di tempat, dan basis
-- MENOLAK lewat `fn_price_book_immutable()`:
--
--     "Price Book Entry sudah di-verify (status=active): harga & atribut inti
--      tak bisa diubah — Estimate Item yang merujuknya tak boleh berubah
--      retroaktif. Buat entry baru (version berikutnya) untuk harga baru."
--
-- Penolakan itu BENAR dan tidak dilemahkan di sini. Estimasi yang sudah
-- disetujui memakai harga pada tanggalnya; mengubah angkanya di tempat membuat
-- penawaran lama diam-diam bernilai lain. Jadi yang ditambahkan adalah entri
-- versi berikutnya, dan yang lama dibiarkan utuh sebagai riwayat.
--
-- Resolver memilih entri ber-`effective_date` paling baru (`price-resolver.ts`),
-- jadi estimasi BARU otomatis memakai harga yang benar tanpa kode apa pun
-- berubah.
--
-- ── Densitas yang dipakai
--
-- Nilai curah (bulk density) lapangan, bukan densitas partikel:
--
--     pasir beton   1.400 kg/m³
--     kerikil/split 1.350 kg/m³
--     pupuk organik   700 kg/m³
--
-- Ditulis EKSPLISIT supaya bisa diperiksa dan diperbaiki — bukan tersembunyi di
-- dalam hasil bagi.
--
-- ── Kenapa dikoreksi, bukan resource-nya dipensiunkan
--
-- Diukur: `AHSP-R0076` dipakai 27 AHSP, `R0077` 21, `R0108` 5, `R0821` 12.
-- Mempensiunkannya berarti 65 AHSP kehilangan bahannya dan gagal ter-resolve —
-- mengganti angka yang salah dengan angka yang hilang.
--
-- ── Idempoten
--
-- Entri baru hanya dibuat bila belum ada entri lebih baru bagi resource itu
-- yang harganya sudah masuk akal. Menjalankan ulang tak menumpuk versi.
--
-- Dijaga `apps/api/scripts/audit-harga-satuan-waras.mjs` (ambang NOL).
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _densitas (kode text PRIMARY KEY, kg_per_m3 numeric NOT NULL)
  ON COMMIT DROP;

INSERT INTO _densitas (kode, kg_per_m3) VALUES
  ('AHSP-R0076', 1400),   -- Pasir beton
  ('AHSP-R0108', 1400),   -- Pasir beton (quarry - lokasi pekerjaan)
  ('AHSP-R0077', 1350),   -- Kerikil
  ('AHSP-R0821',  700);   -- Pupuk Organik

/*
  Entri baru dibuat dari entri TERBARU tiap resource, dengan:
    · amount          = harga m³ ÷ densitas
    · version_number  = versi tertinggi + 1
    · effective_date  = sekarang (supaya resolver memilihnya)

  Kolom lain disalin apa adanya — lokasi, supplier, dan company_id ikut, supaya
  entri baru berada di lingkup yang sama dengan yang dikoreksinya. Entri
  berlokasi yang salah tak akan tertutup oleh entri umum yang benar.

  `verified_by`/`verified_at` WAJIB terisi untuk entri berstatus `active`
  (CHECK `price_book_verified_trace`), dan itu aturan yang benar: harga yang
  dipakai menghitung uang harus punya penanggung jawab. Jejaknya disalin dari
  entri yang dikoreksi — orang yang sama yang memverifikasi harga m³-nya, dan
  koreksi ini semata membagi angka itu dengan densitas, bukan memasukkan harga
  baru dari sumber lain.

  Entri yang belum pernah diverifikasi (`verified_by` NULL) dibuat berstatus
  `draft`, bukan dipaksa `active` dengan jejak karangan.
*/
INSERT INTO price_book_entries (
  resource_id, amount, currency, version_number, effective_date, expired_date,
  location, supplier, confidence_level, status, company_id, created_by,
  verified_by, verified_at
)
SELECT p.resource_id,
       round(p.amount / d.kg_per_m3, 2),
       p.currency,
       (SELECT max(p3.version_number) + 1 FROM price_book_entries p3
         WHERE p3.resource_id = p.resource_id),
       now(),
       p.expired_date,
       p.location,
       p.supplier,
       p.confidence_level,
       CASE WHEN p.verified_by IS NOT NULL THEN 'active' ELSE 'draft' END,
       p.company_id,
       p.created_by,
       p.verified_by,
       CASE WHEN p.verified_by IS NOT NULL THEN now() ELSE NULL END
  FROM price_book_entries p
  JOIN resources r ON r.id = p.resource_id
  JOIN _densitas d ON d.kode = r.code
 WHERE r.unit_code = 'kg'
   /* hanya entri TERBARU tiap resource — bukan tiap versi lama */
   AND p.effective_date = (SELECT max(p2.effective_date) FROM price_book_entries p2
                            WHERE p2.resource_id = p.resource_id)
   /* dan hanya bila harganya MASIH harga m³ (tanda: ada m³ berharga sama) */
   AND EXISTS (SELECT 1 FROM price_book_entries pm
                 JOIN resources rm ON rm.id = pm.resource_id
                WHERE rm.unit_code = 'm3' AND pm.amount = p.amount);

-- ── Verifikasi: gagalkan migrasi bila hasilnya tak masuk akal ───────────────
DO $$
DECLARE
  harga numeric;
  sisa  int;
BEGIN
  /*
    GERBANG — DITAMBAHKAN 2026-08-31.

    Verifikasi di bawah menilai HASIL backfill harga pada katalog AHSP. Di
    basis yang baru lahir katalog itu belum terisi, dan `harga` jadi NULL:

        HARD FAIL — 464_harga_agregat_per_kg.sql
          Harga berlaku pasir beton per kg di luar akal: <NULL>

    "NULL di luar akal" tak sama dengan "harga salah" — itu ketiadaan bahan.
    Yang kedua yang cek ini ada untuk menangkap, dan pesannya menyebut
    keduanya dengan kalimat yang sama.

    Gerbang ini memisahkannya. Kalau katalognya terisi, kedua cek di bawah
    berlaku penuh — termasuk ambang 150..600 per kg yang justru paling
    berharga (harga per m³ yang tersalin ke baris kg membuat 1 m³ beton
    terhitung ratusan juta; itu kelas cacat yang dicatat di CLAUDE.md §6).
  */
  IF NOT EXISTS (SELECT 1 FROM resources WHERE code = 'AHSP-R0076') THEN
    RAISE NOTICE '464 verifikasi dilewati: katalog AHSP belum terisi di basis ini. Bukan galat.';
    RETURN;
  END IF;

  -- Harga BERLAKU (entri terbaru) untuk pasir beton harus masuk akal.
  SELECT p.amount INTO harga
    FROM price_book_entries p JOIN resources r ON r.id = p.resource_id
   WHERE r.code = 'AHSP-R0076'
   ORDER BY p.effective_date DESC, p.version_number DESC LIMIT 1;
  IF harga IS NULL OR harga < 150 OR harga > 600 THEN
    RAISE EXCEPTION 'Harga berlaku pasir beton per kg di luar akal: %', harga;
  END IF;

  -- Tak boleh ada resource kg di daftar ini yang harga BERLAKUnya masih
  -- identik dengan harga m3 mana pun.
  SELECT count(*) INTO sisa FROM (
    SELECT DISTINCT ON (p.resource_id) p.resource_id, p.amount
      FROM price_book_entries p
      JOIN resources r ON r.id = p.resource_id
      JOIN _densitas d ON d.kode = r.code
     WHERE r.unit_code = 'kg'
     ORDER BY p.resource_id, p.effective_date DESC, p.version_number DESC
  ) t
  WHERE EXISTS (SELECT 1 FROM price_book_entries pm
                  JOIN resources rm ON rm.id = pm.resource_id
                 WHERE rm.unit_code = 'm3' AND pm.amount = t.amount);
  IF sisa > 0 THEN
    RAISE EXCEPTION 'Masih ada % resource kg yang harga berlakunya sama dengan harga m3', sisa;
  END IF;

  RAISE NOTICE 'OK — harga agregat per kg dikoreksi; pasir beton berlaku = Rp %/kg', harga;
END $$;

COMMIT;
