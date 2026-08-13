-- ============================================================================
-- 337 — DAFTARKAN 6 automation Phase 2 ke `jadwal_tugas`
-- ============================================================================
--
-- ── Cacat yang ditutup: kode punya 8 tugas, tabel punya 2
--
-- `KATALOG_TUGAS` (routes/v1/jadwal.ts) mengenal DELAPAN tugas sesudah
-- automation Phase 2 selesai. Tetapi penjadwal TIDAK membaca katalog itu —
-- ia membaca tabel `jadwal_tugas`, dan tabel itu baru berisi DUA baris
-- (`cek-tenggat`, `cek-milestone`, keduanya sejak 2026-08-09).
--
-- Artinya: sekalipun `SCHEDULER_URL` disetel besok, keenam automation baru
-- TIDAK AKAN PERNAH TERPANGGIL. Kode-nya ada, endpoint-nya hidup, test-nya
-- hijau — dan tak satu pun berjalan.
--
-- Kelas cacat yang sama dengan yang berulang di repo ini: satu ujung ada,
-- ujung lainnya tidak, dan tak ada galat di antara keduanya. Persis yang
-- dijaga `audit-jadwal-punya-pembaca` untuk arah sebaliknya.
--
-- ── Kenapa JAM-nya berbeda-beda, bukan 07:00 semua
--
-- Enam tugas yang menyala serempak membuat satu denyut memanggil enam
-- endpoint sekaligus, masing-masing memindai seluruh tenant. Disebar supaya
-- bebannya rata dan — lebih penting — supaya saat satu gagal, jejaknya di
-- `terakhir_galat` tak tertimbun lima tugas lain yang berjalan pada detik
-- yang sama.
--
-- Urutannya mengikuti kapan angkanya paling berguna:
--
--   06:00  stok menipis        sebelum tim pengadaan mulai memesan
--   06:30  progres belum lapor mandor masih di jalan menuju lokasi
--   07:10  invoice dari termin jam kerja keuangan dimulai (07:00 & 07:05
--                             sudah dipakai cek-tenggat & cek-milestone)
--   07:30  PO & penerimaan     sesudah keuangan, sebelum rapat pagi
--   08:00  kasbon belum lunas  bukan hal mendesak, boleh menyusul
--   08:30  dependency Gantt    PM sudah di meja
--
-- ── Kenapa `aktif = true` untuk semuanya
--
-- Tugas yang lahir nonaktif menuntut seseorang ingat menyalakannya, dan
-- yang harus diingat cepat atau lambat terlupa. Semuanya idempoten
-- (dedup harian ber-`action_data.record_id`), jadi menyalakannya aman.
--
-- Founder tetap bisa mematikan satu per satu dari halaman `/sistem` —
-- itulah bentuk config-first yang benar: bawaan yang bekerja, bukan bawaan
-- yang diam.
--
-- ── Untuk SETIAP tenant, bukan hanya yang pertama
--
-- `jadwal_tugas` ber-`company_id` dan unik per (company, tugas), jadi tiap
-- tenant butuh barisnya sendiri — tenant yang tak kebagian jadwal adalah
-- tenant yang automation-nya mati diam-diam.
--
-- ⚠ HANYA tenant `is_active`. Diukur 2026-08-13: basis dev berisi 291
-- company, dan 290 di antaranya sisa test (`[UJI] Tenant …`, seluruhnya
-- `is_active = false`). Menyisipkan untuk semuanya menghasilkan 2.037 baris
-- jadwal yang tak pernah dipakai — dan penjadwal memindainya tiap denyut.
--
-- Bentuk pertama migrasi ini memang membuat 2.039 baris. Ketahuan karena
-- angkanya dicetak di NOTICE, bukan karena ada yang gagal.
-- ============================================================================

INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, aktif)
SELECT c.id, t.tugas, 'harian', t.jam, true
FROM companies c
CROSS JOIN (VALUES
  ('stok-menipis',        '06:00'),
  ('progres-belum-lapor', '06:30'),
  ('invoice-termin',      '07:10'),
  ('gr-matching',         '07:30'),
  ('kasbon-outstanding',  '08:00'),
  ('dependency-breach',   '08:30')
) AS t(tugas, jam)
WHERE c.is_active
ON CONFLICT (company_id, tugas) DO NOTHING;

-- `kasbon-tukang` sengaja TIDAK harian: cicilan kasbon tukang dipotong lewat
-- laporan upah MINGGUAN, jadi mengingatkannya tiap hari adalah kebisingan
-- untuk pekerjaan yang memang baru bisa dilakukan sepekan sekali.
-- Senin pagi, saat mandor menyusun laporan pekan itu.
INSERT INTO jadwal_tugas (company_id, tugas, jenis, jam, hari_pekan, aktif)
SELECT c.id, 'kasbon-tukang', 'mingguan', '07:00', 1, true
FROM companies c
WHERE c.is_active
ON CONFLICT (company_id, tugas) DO NOTHING;

-- ─── Verifikasi: tiap tenant punya KETUJUH tugas baru ───────────────────────

DO $$
DECLARE
  kurang TEXT;
  n      INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies) THEN
    RAISE NOTICE '337: basis tanpa company — dilewati';
    RETURN;
  END IF;

  -- Tenant mana pun yang kekurangan satu tugas = automation mati untuk tenant
  -- itu, tanpa gejala apa pun.
  SELECT string_agg(DISTINCT c.name || ':' || t.tugas, ', ') INTO kurang
  FROM companies c
  CROSS JOIN (VALUES
    ('stok-menipis'), ('progres-belum-lapor'), ('invoice-termin'),
    ('gr-matching'), ('kasbon-outstanding'), ('dependency-breach'),
    ('kasbon-tukang')
  ) AS t(tugas)
  WHERE c.is_active
    AND NOT EXISTS (
      SELECT 1 FROM jadwal_tugas j
      WHERE j.company_id = c.id AND j.tugas = t.tugas
    );

  IF kurang IS NOT NULL THEN
    RAISE EXCEPTION '337 gagal: tenant kekurangan tugas — %', kurang;
  END IF;

  -- Jam yang bentrok membuat enam endpoint dipanggil pada denyut yang sama.
  SELECT count(*) INTO n FROM (
    SELECT company_id, jam, jenis, count(*) AS c
    FROM jadwal_tugas
    WHERE tugas IN ('stok-menipis', 'progres-belum-lapor', 'invoice-termin',
                    'gr-matching', 'kasbon-outstanding', 'dependency-breach')
    GROUP BY 1, 2, 3 HAVING count(*) > 1
  ) d;
  IF n > 0 THEN
    RAISE EXCEPTION '337 gagal: % kelompok tugas harian berjam sama', n;
  END IF;

  SELECT count(*) INTO n FROM jadwal_tugas;
  RAISE NOTICE '337 OK — % baris jadwal, ketujuh automation terdaftar untuk tiap tenant', n;
END $$;
