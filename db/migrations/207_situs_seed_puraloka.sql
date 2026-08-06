-- ════════════════════════════════════════════════════════════════════════════
-- 207 — Seed konten situs Puraloka Persada
--
-- Sumber: "Company Profile (WHITE) Puraloka Persada.pdf" (20 halaman) dan
-- berkas SERTIFIKAT STANDAR di `CV PURALOKA PERSADA/`.
--
-- ── FAKTA dipakai apa adanya, PROSA ditulis ulang
--
-- Prosa compro asli — "mengutamakan kualitas, inovasi, dan keberlanjutan",
-- "mitra terpercaya", "solusi konstruksi yang efisien" — adalah kalimat yang
-- ditulis setiap kontraktor di Indonesia. Ia menenggelamkan fakta yang justru
-- meyakinkan: Tol Cipali, Tol Cisumdawu, sub-kontraktor PT PP, dan PT Jaya
-- Cemerlang yang memesan DUA KALI (2015 pabrik, 2020 gudang).
--
-- Register yang dipakai di sini mengikuti suara yang sudah ada di dashboard
-- produk ini — tajam, spesifik, menyebut hal dengan nama aslinya. Contoh dari
-- layar Rekonsiliasi Material: "Selisihnya adalah material yang tak bisa
-- dipertanggungjawabkan — dan tanpa layar ini, ia terlihat persis sama dengan
-- material yang habis terpakai."
--
-- ── Dua typo PDF sengaja TIDAK diteruskan
--
-- "PURALOKA PERSDA" (sampul) dan "embangunan" (2x, hal. 8 dan 12).
--
-- ── NPWP sengaja TIDAK di-seed
--
-- Spec §8.2: NIB sudah cukup membuktikan legalitas di halaman publik. NPWP
-- lebih tepat di dokumen penawaran — menerbitkannya di halaman terindeks tak
-- menambah kepercayaan tapi memperbesar permukaan penyalahgunaan identitas.
--
-- ── Kenapa subquery company, bukan uuid literal
--
-- Migrasi harus tetap benar di lingkungan mana pun. uuid yang dipaku membuat
-- seed ini senyap-tak-berefek di database baru.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Konten teks ─────────────────────────────────────────────────────────────
WITH c AS (SELECT id FROM companies WHERE code = 'puraloka-persada' LIMIT 1)
INSERT INTO situs_konten (company_id, kunci, nilai)
SELECT c.id, k.kunci, k.nilai::jsonb FROM c, (VALUES
  ('merek.nama',        '"Puraloka Persada"'),
  ('merek.sejak',       '2009'),

  -- Hero: menyebut apa yang dibangun, bukan sifat yang diklaim.
  ('hero.judul',        '"Kami membangun pabrik, gudang, dan jalan tol."'),
  ('hero.sub',          '"Sejak 2009. Proyeknya bisa disebut namanya — dan kliennya memesan lagi."'),

  -- Bukti: satu kalimat yang hanya bisa ditulis perusahaan yang mengalaminya.
  ('bukti.judul',       '"Yang sudah berdiri"'),
  ('bukti.sub',         '"PT Jaya Cemerlang memesan dua kali: pabrik 2015, gudang 2020. Dalam jasa konstruksi, klien yang kembali adalah satu-satunya rekomendasi yang tak bisa dikarang."'),

  ('proses.judul',      '"Urutan membangun"'),
  ('proses.sub',        '"Lima tahap, dan tiap tahap punya bukti fotonya sendiri."'),

  ('porto.judul',       '"Yang sudah dikerjakan"'),
  ('porto.sub',         '"Foto lapangan, bukan render. Baja diukur manual, gording bertumpuk, pengecoran tengah jalan."'),

  ('legal.judul',       '"Izin yang dipegang"'),
  ('legal.sub',         '"Tiga belas KBLI bersertifikat standar. Bukan daftar layanan — daftar izin yang sudah terbit."'),

  ('kontak.judul',      '"Ceritakan pekerjaannya"'),
  ('kontak.sub',        '"Sebutkan jenis bangunan, lokasi, dan target waktu. Itu sudah cukup untuk mulai menghitung."'),
  ('kontak.whatsapp',   '"081311081813"'),
  ('kontak.wa_template','"Halo Puraloka Persada, saya ingin menanyakan pekerjaan "'),
  ('kontak.email',      '"puralokapersada@gmail.com"'),
  ('kontak.alamat',     '"Puri Cipageran Indah 2 Blok D13/12, RT 002/RW 022, Tanimulya, Ngamprah, Kabupaten Bandung Barat 40552"'),
  ('kontak.nib',        '"2110240218547"'),

  ('meta.judul',        '"Puraloka Persada — Kontraktor pabrik, gudang, dan infrastruktur"'),
  ('meta.deskripsi',    '"Kontraktor konstruksi Bandung sejak 2009. Pabrik, gudang, konstruksi baja, dan beton pracetak. Pernah mengerjakan Tol Cipali, Tol Cisumdawu, dan pabrik PT Top Torch."')
) AS k(kunci, nilai)
ON CONFLICT (company_id, kunci) DO NOTHING;

-- ── Milestone 2009 → 2024 ───────────────────────────────────────────────────
WITH c AS (SELECT id FROM companies WHERE code = 'puraloka-persada' LIMIT 1)
INSERT INTO situs_milestone (company_id, tahun, judul, keterangan, urutan)
SELECT c.id, m.tahun, m.judul, m.ket, m.urut FROM c, (VALUES
  (2009, 'Berdiri sebagai Gumilar Pramudya',
         'Didirikan Gugum Setiawan. Mulai dari promosi luar ruang — billboard dan baliho.', 1),
  (2011, 'Quarry tanah merah, Tol Cipali',
         'Pembukaan quarry untuk proyek jalan tol Cikopo–Palimanan.', 2),
  (2012, 'Tol Brebes',
         'Bersama PT Amanindo Perkasa Abadi.', 3),
  (2013, 'Retaining wall dan saluran, Tol Cipali',
         'Sub-kontraktor PT PP.', 4),
  (2014, 'GOR Pencak Silat, Garut',
         'Fasilitas olahraga.', 5),
  (2015, 'Pabrik PT Jaya Cemerlang, Bandung',
         'Pembangunan pabrik.', 6),
  (2018, 'Landscape Apartemen Dhika, Bekasi', NULL, 7),
  (2019, 'Digitalisasi SPBU',
         'Sub-kontraktor untuk wilayah Jawa Barat dan Jawa Tengah.', 8),
  (2020, 'Gudang PT Jaya Cemerlang — dan nama baru',
         'Klien 2015 memesan lagi. Tahun yang sama nama berganti menjadi Puraloka Persada, kepemimpinan beralih ke Nizar Ihza Zulkarnain.', 9),
  (2023, 'Pabrik sepatu PT Top Torch, Bandung',
         'Pembangunan pabrik skala besar.', 10),
  (2024, 'Supermarket PT Kijang Mas, Bandung', NULL, 11)
) AS m(tahun, judul, ket, urut)
WHERE NOT EXISTS (
  SELECT 1 FROM situs_milestone sm WHERE sm.company_id = c.id AND sm.tahun = m.tahun
);

-- ── Kategori portofolio ─────────────────────────────────────────────────────
-- Mengikuti judul galeri compro hal. 13-19 — dikelompokkan per JENIS PEKERJAAN,
-- bukan per proyek bernama. Satu foto pemasangan baja bisa milik proyek pabrik
-- mana pun, tapi kategori pekerjaannya pasti benar.
WITH c AS (SELECT id FROM companies WHERE code = 'puraloka-persada' LIMIT 1)
INSERT INTO situs_kategori (company_id, kunci, judul, ringkasan, urutan)
SELECT c.id, k.kunci, k.judul, k.ring, k.urut FROM c, (VALUES
  ('pabrik',           'Pembangunan Pabrik',
   'Struktur baja, lantai kerja, dan fasilitas produksi. PT Top Torch, PT Jaya Cemerlang, PT Sinarmaju.', 1),
  ('konstruksi-baja',  'Konstruksi Baja',
   'Fabrikasi dan ereksi profil WF, gording, dan rangka atap.', 2),
  ('beton-pracetak',   'Beton Pracetak',
   'U-ditch, panel pagar, dan kanstin — dari pengecoran sampai pemasangan dengan crane.', 3),
  ('pematangan-lahan', 'Pematangan Lahan',
   'Cut and fill, quarry, dan penyiapan lahan sebelum pondasi.', 4),
  ('perumahan',        'Pembangunan Perumahan', NULL, 5),
  ('rumah-mewah',      'Pembangunan Rumah Mewah', NULL, 6),
  ('renovasi-rumah',   'Renovasi Rumah', NULL, 7)
) AS k(kunci, judul, ring, urut)
ON CONFLICT (company_id, kunci) DO NOTHING;

-- ── Legalitas: 13 KBLI bersertifikat standar ────────────────────────────────
-- Diturunkan dari berkas "SERTIFIKAT STANDAR" yang benar-benar ada, bukan dari
-- daftar layanan yang diinginkan. Judul mengikuti nomenklatur KBLI 2020.
WITH c AS (SELECT id FROM companies WHERE code = 'puraloka-persada' LIMIT 1)
INSERT INTO situs_legalitas (company_id, kode, judul, urutan)
SELECT c.id, l.kode, l.judul, l.urut FROM c, (VALUES
  ('41011', 'Konstruksi gedung hunian', 1),
  ('41013', 'Konstruksi gedung industri', 2),
  ('41014', 'Konstruksi gedung perbelanjaan', 3),
  ('41019', 'Konstruksi gedung lainnya', 4),
  ('43301', 'Pengerjaan pemasangan kaca dan alumunium', 5),
  ('43302', 'Pengerjaan lantai, dinding, dan peledakan', 6),
  ('43303', 'Pengecatan', 7),
  ('43304', 'Dekorasi interior', 8),
  ('43305', 'Dekorasi eksterior', 9),
  ('43309', 'Penyelesaian konstruksi bangunan lainnya', 10),
  ('43901', 'Pemasangan pondasi dan tiang pancang', 11),
  ('68111', 'Real estat yang dimiliki sendiri atau disewa', 12),
  ('74120', 'Aktivitas desain interior', 13)
) AS l(kode, judul, urut)
ON CONFLICT (company_id, kode) DO NOTHING;

-- ── Seksi halaman ───────────────────────────────────────────────────────────
WITH c AS (SELECT id FROM companies WHERE code = 'puraloka-persada' LIMIT 1)
INSERT INTO situs_seksi (company_id, kunci, aktif, urutan, varian)
SELECT c.id, s.kunci, true, s.urut, 'baku' FROM c, (VALUES
  ('hero', 1), ('bukti', 2), ('proses', 3),
  ('portofolio', 4), ('legalitas', 5), ('kontak', 6)
) AS s(kunci, urut)
ON CONFLICT (company_id, kunci) DO NOTHING;

-- ── Merek ───────────────────────────────────────────────────────────────────
-- #003366 navy dan #FFD600 kuning — keduanya diekstrak terukur dari compro PDF
-- (sampling piksel 6 halaman). Navy identik dengan --navy di globals.css.
WITH c AS (SELECT id FROM companies WHERE code = 'puraloka-persada' LIMIT 1)
INSERT INTO situs_merek (company_id, warna_utama, warna_aksen)
SELECT c.id, '#003366', '#FFD600' FROM c
ON CONFLICT (company_id) DO NOTHING;

COMMIT;
