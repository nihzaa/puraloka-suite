-- ============================================================================
-- 396 — Ambang otomasi terjadwal jadi pengaturan tenant, bukan angka di kode
-- ============================================================================
--
-- Founder, 2026-08-15: *"kalo bisa workflownya itu kalo bisa jangan di
-- hardcode langsung yaa"*.
--
-- Tepat, dan tepat waktu: saya baru menulis `angka(q.ambang, 5_000_000, …)`
-- untuk automation 2.11 — lima juta yang saya pilih sendiri, untuk uang
-- perusahaan orang lain.
--
-- "Saldo di bawah berapa yang bikin khawatir" berbeda antara kontraktor rumah
-- tinggal dan kontraktor infrastruktur, dan satu-satunya yang tahu adalah
-- pemiliknya. Sama untuk "berapa hari sebelum tenggat mulai ditegur" — terlalu
-- cepat jadi kebisingan, terlalu lambat jadi tak berguna.
--
-- ── Kenapa `company_settings`, bukan tabel baru
--
-- Mekanismenya SUDAH ADA dan sudah dipakai: lima baris aktif
-- (`kasbon.limit.enabled`, `tax.ppn_rate`, `project.dp_default_pct`, …),
-- dibaca `lib/kasbon-limit.ts` dan `routes/v1/procurement.ts`, dengan halaman
-- pengaturannya sendiri.
--
-- Tabel `ambang_otomasi` terpisah berarti tempat KEDUA untuk hal yang sama,
-- dan pengguna harus tahu mana yang berlaku.
--
-- ── Kenapa kodenya TETAP punya bawaan
--
-- Bukan hardcode yang mengikat, melainkan jaring: tenant yang belum mengisi
-- tetap mendapat otomasi yang bekerja.
--
-- Bedanya sudah terbukti mahal. `stok-menipis` memakai `materials.min_stock`
-- yang WAJIB diisi manusia — diukur: dari 24 material, SATU yang terisi, dan
-- automation-nya diam berbulan-bulan sambil melaporkan sehat. Kolom yang wajib
-- diisi manusia adalah kolom yang akan kosong.
--
-- Urutan yang berlaku di kode (`lib/ambang-otomasi.ts`):
--
--     query (?ambang=)  →  company_settings  →  bawaan katalog
--
-- Query menang karena ia dipakai untuk pengujian dan untuk penjadwal yang
-- sengaja memakai angka berbeda pada satu jalannya. Kebijakannya tetap di
-- pengaturan.
--
-- ── Nilai yang diseed = bawaan di kode
--
-- Disengaja, dan penting: seed yang BERBEDA dari bawaan kode membuat perilaku
-- berubah diam-diam saat baris pengaturannya kebetulan terhapus. Keduanya
-- sama, jadi menghapus barisnya tak mengubah apa pun — ia cuma kembali ke
-- jalur bawaan.
-- ============================================================================

/*
  ── KEUNIKAN DIPERBAIKI LEBIH DULU: `(key)` → `(company_id, key)`

  Ditemukan saat migrasi ini gagal dua kali berturut, dan kegagalan kedua
  membongkar cacat yang jauh lebih besar daripada seed-nya sendiri:

      UNIQUE (key)          ← keadaan sebelum migrasi ini

  Artinya `tax.ppn_rate` hanya boleh ada SATU BARIS di seluruh instalasi —
  tenant kedua yang mencoba menyimpan tarif PPN-nya sendiri akan ditolak
  dengan galat keunikan, dan tarif tenant pertama berlaku untuk semuanya.

  Kolom `company_id` sudah ada dan NOT NULL, jadi niatnya jelas per-tenant;
  indeksnya saja yang tertinggal dari niat itu. Diukur: satu company nyata
  hari ini, jadi cacatnya belum pernah terasa — dan akan terasa pertama kali
  persis saat perusahaan kedua masuk.

  Diperbaiki di sini karena seed di bawah membutuhkannya, dan karena founder
  meminta kesiapan multi-perusahaan secara eksplisit.
*/
ALTER TABLE public.company_settings
  DROP CONSTRAINT IF EXISTS company_settings_key_key;

DROP INDEX IF EXISTS company_settings_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS company_settings_company_key_uniq
  ON public.company_settings (company_id, key);

/*
  Di-seed PER COMPANY, bukan sekali untuk semua.

  Migrasi 089 (`project.dp_default_pct`) ditulis sebelum multi-tenant dan
  memakai `INSERT … VALUES` tanpa `company_id` — bentuk itu GAGAL sekarang:
  kolomnya NOT NULL. Diukur saat migrasi ini pertama dijalankan.

  Polanya menyalin migrasi 355 (`aturan_stok_menipis`): ambil company dari
  baris yang sudah ada, supaya tenant yang lahir kemudian ikut lewat jalur
  pendirian tenant, bukan lewat migrasi yang harus diingat.
*/
INSERT INTO company_settings (key, value, value_type, category, description, company_id)
SELECT v.key, v.value, 'number', 'otomasi', v.deskripsi, c.id
FROM (SELECT DISTINCT company_id AS id FROM company_settings) c
CROSS JOIN (VALUES
  ('otomasi.invoice_terlambat.hari', '1'::jsonb,
   'Berapa hari invoice lewat jatuh tempo sebelum PM ditegur. 0 = ditegur hari itu juga.'),
  ('otomasi.saldo_menipis.rupiah', '5000000'::jsonb,
   'Saldo rekening kas di bawah nilai ini memicu peringatan ke pemegang cash:manage.'),
  ('otomasi.milestone_berisiko.hari', '7'::jsonb,
   'Berapa hari sebelum tenggat milestone mulai ditegur. Yang sudah terlewat selalu ditegur.'),
  ('otomasi.hutang_supplier.hari', '7'::jsonb,
   'Berapa hari sebelum jatuh tempo hutang supplier ditegur. Sengaja SEBELUM, bukan sesudah.'),
  ('otomasi.harga_material.persen', '10'::jsonb,
   'Kenaikan harga material (%) yang dianggap signifikan dan perlu dikabari.')
) AS v(key, value, deskripsi)
ON CONFLICT (company_id, key) DO NOTHING;

-- ── Verifikasi ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  n INT;
  n_bukan_angka INT;
  n_uniq_lama INT;
BEGIN
  /*
    Keunikan lama HARUS hilang.

    Kalau `UNIQUE(key)` masih ada, seed di atas kebetulan lolos (satu company)
    tetapi tenant kedua akan ditolak saat menyimpan pengaturannya sendiri —
    dan galatnya muncul berbulan-bulan kemudian, di tempat yang tak menyebut
    migrasi ini sama sekali.
  */
  SELECT count(*) INTO n_uniq_lama
    FROM pg_indexes
   WHERE tablename = 'company_settings'
     AND indexdef ILIKE '%UNIQUE%'
     AND indexdef ~ '\(key\)$';

  IF n_uniq_lama > 0 THEN
    RAISE EXCEPTION '396 gagal: UNIQUE(key) masih ada — tenant kedua tak bisa punya pengaturan sendiri';
  END IF;

  SELECT count(*) INTO n
    FROM company_settings
   WHERE category = 'otomasi';

  IF n < 5 THEN
    RAISE EXCEPTION '396 gagal: hanya % dari 5 ambang otomasi terseed', n;
  END IF;

  /*
    Nilai yang bukan angka membuat `ambilAmbang()` jatuh ke bawaan sambil
    mencatat peringatan — otomasi tetap jalan, tetapi pengaturan yang
    dimasukkan tenant TIDAK berlaku, dan layarnya tetap menampilkan angka yang
    ia isi. Bentuk kebohongan yang tenang.
  */
  SELECT count(*) INTO n_bukan_angka
    FROM company_settings
   WHERE category = 'otomasi'
     AND jsonb_typeof(value) <> 'number';

  IF n_bukan_angka > 0 THEN
    RAISE EXCEPTION '396 gagal: % ambang otomasi bukan angka — akan diabaikan diam-diam', n_bukan_angka;
  END IF;

  RAISE NOTICE '396: % ambang otomasi terpasang, semuanya bertipe angka', n;
END $$;
