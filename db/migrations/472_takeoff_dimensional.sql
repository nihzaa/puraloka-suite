-- ════════════════════════════════════════════════════════════════════════════
-- 431 — Take-off dimensional umum: dari mana volume itu datang
-- ════════════════════════════════════════════════════════════════════════════
--
-- Menutup separuh `crm-boq` yang tersisa. Diukur di HEAD sebelum menulis SQL:
--
--   122_cecep_material_takeoff.sql  →  material_pack · steel_profiles · rebar_takeoff
--
-- Ketiganya nyata dan dipakai, tapi geometri yang mereka tangani hanya BESI
-- (`rebar_takeoff`: Ø × jumlah batang × panjang) dan BAJA PROFIL
-- (`steel_profiles`: kg/m dari katalog). Beton, galian, urugan, dan pasangan —
-- pekerjaan yang volumenya justru paling sering salah — tak punya jalur input
-- geometri sama sekali.
--
-- Akibatnya bisa dilihat di satu baris kode, `estimate-versions.ts:708`:
--
--     if (typeof b.quantity !== 'number' || b.quantity <= 0) { … }
--
-- Itu SELURUH pemeriksaan yang dilalui sebuah volume sebelum dikalikan HSP
-- (`computeRabLineTotal`, :787) dan menjadi rupiah di `estimate_items.amount`.
-- Angka 84,5 m³ yang benar dan angka 84,5 m³ yang salah ketik dari 8,45 masuk
-- lewat pintu yang sama, dan sesudah masuk keduanya terlihat identik: tak ada
-- kolom yang menyimpan p × l × t yang melahirkannya.
--
-- Pertanyaan "kenapa volumenya segini" karena itu hanya bisa dijawab dengan
-- membuka kembali gambar dan menghitung ulang dari nol — persis pertanyaan yang
-- muncul saat opname lapangan tak cocok dengan RAB, yaitu saat orang paling
-- butuh jawaban cepat.
--
-- ── Yang disimpan, dan kenapa BUKAN cuma hasilnya
--
-- Pola diambil UTUH dari `rebar_takeoff` (122:98-127), termasuk alasannya:
-- masukan geometri disimpan per baris, faktor disimpan per baris, hasil
-- disimpan (bukan hanya dihitung saat dibaca).
--
-- Faktor per baris itu yang membuat angka historis tetap bisa direproduksi.
-- `faktor` di sini menampung hal yang di lapangan memang berubah-ubah dan
-- diperdebatkan: faktor gembur galian tanah (1,2–1,3 tergantung jenis tanah),
-- susut urugan padat, tebal siar pasangan bata. Kalau seseorang merevisi
-- kebiasaan perusahaan dari 1,25 ke 1,20 tahun depan, RAB tahun ini HARUS tetap
-- memulangkan angka yang sama seperti saat ia disetujui — kalau tidak,
-- dokumen yang sudah ditandatangani berubah isinya sendiri.
--
-- `hasil_volume` disimpan dengan alasan kembar: ia yang diadu dengan
-- `estimate_items.quantity`. Selisih antara keduanya adalah sinyal, dan sinyal
-- itu hilang kalau salah satunya dihitung ulang saat dibaca.
--
-- ── KEPUTUSAN: take-off MENGUSULKAN, manusia MENERAPKAN
-- ── (ini keputusan desain utama migrasi ini — dibuat sadar, bukan bawaan)
--
-- Godaannya jelas: begitu p × l × t × n × faktor menghasilkan angka, tulis saja
-- ia ke `estimate_items.quantity` supaya orang tak perlu menyalin. TIDAK.
--
-- `quantity` bukan angka yang berdiri sendiri. Rantainya, diukur di kode:
--
--     estimate_items.quantity
--       → computeRabLineTotal(quantity, hspRounded)   (estimate-versions.ts:787)
--       → estimate_items.amount
--       → estimate_versions.total_amount              (:688-694)
--       → rantai approval estimate_versions
--       → nilai kontrak, termin, dan progres yang ditagihkan
--
-- Menimpanya otomatis berarti: seseorang membetulkan satu angka panjang di
-- layar take-off, dan nilai kontrak yang sudah disepakati ikut bergeser tanpa
-- ada yang memutuskan apa-apa. Tak ada galat, tak ada persetujuan, tak ada
-- jejak keputusan — hanya total yang berbeda dari kemarin.
--
-- Karena itu tabel ini SENGAJA tak punya trigger yang menyentuh
-- `estimate_items`. Ia hanya menyediakan `hasil_volume`, dan rute
-- `POST …/terapkan` menuliskannya ke `quantity` HANYA saat manusia menekan
-- tombol — dengan versi masih `draft` sebagai syarat, dan dengan
-- `volume_diterapkan` + `diterapkan_pada` sebagai jejak siapa menerapkan apa.
--
-- Kolom jejak itu juga yang membuat pertanyaan ketiga bisa dijawab: "apakah
-- volume yang dipakai RAB masih sama dengan hasil take-off terakhir?" Kalau
-- `volume_diterapkan` tertinggal dari `hasil_volume`, berarti take-off sudah
-- direvisi tapi RAB belum menyusul — keadaan yang sah (mungkin sengaja), tapi
-- harus KELIHATAN, bukan disamarkan dengan menyamakannya diam-diam.
--
-- ── Kenapa `metode` daftar tertutup, bukan teks bebas
--
-- Rumusnya sama untuk semua (p × l × t × n × faktor), yang berbeda hanya
-- dimensi mana yang dipakai: galian pakai ketiganya, pasangan dinding pakai
-- p × t saja (tebal ikut di analisa AHSP per-m²), pembesian panjang saja.
-- Daftar tertutup membuat UI bisa menyembunyikan kolom yang tak relevan dan
-- membuat CHECK bisa menuntut dimensi yang wajib ada — dua hal yang mustahil
-- kalau metodenya string bebas. Menambah metode = migrasi maju, dan itu
-- disengaja: bentuk perhitungan volume bukan hal yang boleh diketik pengguna.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS takeoff_dimensi (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_item_id   UUID NOT NULL REFERENCES estimate_items(id) ON DELETE CASCADE,

  -- Penanda bagian gambar yang dihitung ("Pondasi P1 as A-3", "Sloof 15/20 lt.1").
  -- Inilah yang membuat 40 baris take-off bisa dicocokkan kembali ke gambar
  -- setahun kemudian; tanpa nama, yang tersisa cuma deretan angka.
  uraian             TEXT NOT NULL CHECK (length(btrim(uraian)) > 0),

  -- Bentuk perhitungan. Menentukan dimensi mana yang WAJIB (CHECK di bawah).
  metode             TEXT NOT NULL CHECK (metode IN (
                       'volume',   -- p × l × t  (galian, beton, urugan)
                       'luas',     -- p × l      (lantai, plesteran, atap)
                       'dinding',  -- p × t      (pasangan bata — tebal di AHSP per-m²)
                       'panjang'   -- p          (sloof, pipa, keliling)
                     )),

  -- Masukan geometri. NULL berarti "tidak dipakai metode ini", bukan nol —
  -- CHECK di bawah yang memastikan yang WAJIB benar-benar terisi.
  panjang_m          NUMERIC(12, 4) CHECK (panjang_m  > 0),
  lebar_m            NUMERIC(12, 4) CHECK (lebar_m    > 0),
  tinggi_m           NUMERIC(12, 4) CHECK (tinggi_m   > 0),

  -- Jumlah bagian identik (12 pondasi P1 yang sama).
  jumlah             NUMERIC(12, 4) NOT NULL DEFAULT 1 CHECK (jumlah > 0),

  -- Faktor koreksi lapangan: gembur galian, susut urugan, siar pasangan.
  -- DISIMPAN per baris — alasan panjangnya di header. 1 = tanpa koreksi.
  -- Batas atas 10 menahan salah ketik yang menggandakan volume 100×; batas
  -- bawahnya menolak 0 (yang membuat seluruh baris menguap tanpa gejala).
  faktor             NUMERIC(8, 4) NOT NULL DEFAULT 1 CHECK (faktor > 0 AND faktor <= 10),

  -- Hasil: satuan mengikuti metode (m³ · m² · m² · m'). Disimpan, bukan hanya
  -- dihitung — ia yang diadu dengan estimate_items.quantity.
  hasil_volume       NUMERIC(16, 4) NOT NULL CHECK (hasil_volume >= 0),

  -- ── Jejak penerapan ke RAB (lihat KEPUTUSAN di header) ────────────────────
  -- NULL = hasil take-off ini belum pernah dipakai RAB. Terisi = pernah, dan
  -- nilainya adalah volume yang BENAR-BENAR masuk saat itu. Kalau ia tertinggal
  -- dari hasil_volume, take-off sudah direvisi tapi RAB belum menyusul.
  volume_diterapkan  NUMERIC(16, 4) CHECK (volume_diterapkan >= 0),
  diterapkan_pada    TIMESTAMPTZ,
  diterapkan_oleh    UUID REFERENCES users(id) ON DELETE SET NULL,

  catatan            TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Dimensi WAJIB per metode. Tanpa ini, 'volume' tanpa tinggi menghasilkan
  -- hasil_volume yang terlihat wajar (karena NULL diperlakukan 1 oleh kode yang
  -- ceroboh) padahal salah satu dimensinya tak pernah diisi.
  CONSTRAINT takeoff_dimensi_dimensi_wajib CHECK (
    CASE metode
      WHEN 'volume'  THEN panjang_m IS NOT NULL AND lebar_m IS NOT NULL AND tinggi_m IS NOT NULL
      WHEN 'luas'    THEN panjang_m IS NOT NULL AND lebar_m IS NOT NULL
      WHEN 'dinding' THEN panjang_m IS NOT NULL AND tinggi_m IS NOT NULL
      WHEN 'panjang' THEN panjang_m IS NOT NULL
    END
  ),

  -- Jejak penerapan datang bertiga atau tidak sama sekali. Separuh terisi
  -- berarti "diterapkan oleh entah siapa" atau "entah kapan" — jejak yang
  -- tak bisa dipakai justru saat ia dibutuhkan.
  CONSTRAINT takeoff_dimensi_jejak_utuh CHECK (
    (volume_diterapkan IS NULL AND diterapkan_pada IS NULL AND diterapkan_oleh IS NULL)
    OR (volume_diterapkan IS NOT NULL AND diterapkan_pada IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_takeoff_dimensi_item ON takeoff_dimensi(estimate_item_id);

COMMENT ON TABLE takeoff_dimensi IS
  'Take-off dimensional umum (431) — p × l × t × jumlah × faktor untuk beton, '
  'galian, urugan, pasangan. Melengkapi rebar_takeoff (besi) & steel_profiles '
  '(baja profil) dari 122. MENGUSULKAN volume, TIDAK menimpa estimate_items.'
  'quantity otomatis: quantity mengalir ke amount → total_amount → approval → '
  'kontrak, jadi penerapannya keputusan manusia yang berjejak.';

COMMENT ON COLUMN takeoff_dimensi.faktor IS
  'Faktor koreksi lapangan (gembur galian, susut urugan, siar pasangan). '
  'Disimpan per baris supaya angka historis tetap reproducible bila kebiasaan '
  'perusahaan direvisi kelak — dokumen yang sudah disetujui tak boleh berubah '
  'isinya sendiri.';

COMMENT ON COLUMN takeoff_dimensi.volume_diterapkan IS
  'Volume yang BENAR-BENAR masuk ke estimate_items.quantity saat tombol terapkan '
  'ditekan. NULL = belum pernah diterapkan. Tertinggal dari hasil_volume = '
  'take-off sudah direvisi tapi RAB belum menyusul (keadaan sah, harus terlihat).';

-- ─── Capability & RLS ───────────────────────────────────────────────────────
--
-- Memakai kunci yang SUDAH ADA dari 122 (`cecep:takeoff:view`/`:manage`) —
-- sengaja tak membuat kunci baru. Kunci yang tak ada di tabel `permissions`
-- menolak SEMUA orang tanpa satu pun gejala (penjaga `audit-izin-benar-ada`),
-- dan lebih dari itu: take-off dimensional adalah pekerjaan yang sama dengan
-- take-off besi, dikerjakan orang yang sama. Kunci terpisah hanya akan membuat
-- estimator punya separuh layar yang kosong tanpa tahu kenapa.

ALTER TABLE takeoff_dimensi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS takeoff_dimensi_read ON takeoff_dimensi;
CREATE POLICY takeoff_dimensi_read ON takeoff_dimensi
  FOR SELECT USING (has_permission('cecep:takeoff:view'));

DROP POLICY IF EXISTS takeoff_dimensi_write ON takeoff_dimensi;
CREATE POLICY takeoff_dimensi_write ON takeoff_dimensi
  FOR ALL USING (has_permission('cecep:takeoff:manage'))
  WITH CHECK (has_permission('cecep:takeoff:manage'));

-- ------------------------------------------------------------
-- Verifikasi
-- ------------------------------------------------------------
DO $$
DECLARE
  v_co     UUID;
  v_user   UUID;
  v_cc     UUID;
  v_klien  UUID;
  v_proyek UUID;
  v_sc     UUID;
  v_ev     UUID;
  v_item   UUID;
  v_row    UUID;
  v_lolos  BOOLEAN;
  v_hasil  NUMERIC;
  v_qty    NUMERIC;
  v_sisa   INT;
BEGIN
  SELECT id INTO v_co FROM companies WHERE parent_company_id IS NULL ORDER BY created_at LIMIT 1;
  SELECT u.id INTO v_user FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'admin' LIMIT 1;
  IF v_co IS NULL OR v_user IS NULL THEN
    -- Fixture tak terbentuk BUKAN kegagalan: di schema bersih memang belum
    -- ada proyek/user. Yang dilewati hanya pembuktiannya; di lingkungan
    -- yang berisi data ia berjalan penuh. (2026-09-04, kelas 252/254/316)
    RAISE NOTICE '431: fixture belum ada — verifikasi DILEWATI (schema bersih)';
    RETURN;
  END IF;

  -- Fixture: rantai penuh sampai estimate_items, karena yang diuji justru
  -- HUBUNGANNYA dengan quantity — menguji tabel sendirian akan melewatkan
  -- pertanyaan pokoknya.
  INSERT INTO cost_codes (code, name, created_by)
    VALUES ('[431-CC]', '[431] Beton uji', v_user) RETURNING id INTO v_cc;
  INSERT INTO clients (company_id, contact_person, phone, created_by)
    VALUES (v_co, '[431] Klien', '08', v_user) RETURNING id INTO v_klien;
  INSERT INTO projects (company_id, client_id, pm_id, name, location, start_date, end_date, created_by)
    VALUES (v_co, v_klien, v_user, '[431] Proyek', 'Bandung', CURRENT_DATE, CURRENT_DATE + 30, v_user)
    RETURNING id INTO v_proyek;
  INSERT INTO scenarios (project_id, name, created_by)
    VALUES (v_proyek, '[431] Skenario', v_user) RETURNING id INTO v_sc;
  INSERT INTO estimate_versions (scenario_id, version_number, total_amount, created_by)
    VALUES (v_sc, 1, 0, v_user) RETURNING id INTO v_ev;
  -- `estimate_items` TIDAK punya `created_by` — diukur, bukan diasumsikan.
  -- Percobaan pertama migrasi ini gagal di sini dengan "column created_by of
  -- relation estimate_items does not exist", karena saya menyalin bentuk
  -- INSERT dari tabel tetangga yang punya kolom itu. Sama persis dengan
  -- pelajaran 427 soal `payment_terms`: UKUR kolom tabel target, jangan
  -- menyimpulkan dari kebiasaan tabel lain. Dan sekali lagi blok verifikasi
  -- ini yang menangkapnya SEBELUM buku migrasi ditulis.
  INSERT INTO estimate_items (estimate_version_id, cost_code_id, quantity, amount)
    VALUES (v_ev, v_cc, 1, 0) RETURNING id INTO v_item;

  -- 1. Baris SAH masuk, dan hasilnya tersimpan apa adanya.
  --    Golden: 12,5 × 0,8 × 0,6 × 4 × 1,25 = 30,0000 m³.
  INSERT INTO takeoff_dimensi
    (estimate_item_id, uraian, metode, panjang_m, lebar_m, tinggi_m, jumlah, faktor, hasil_volume, created_by)
    VALUES (v_item, '[431] Galian pondasi P1', 'volume', 12.5, 0.8, 0.6, 4, 1.25, 30.0, v_user)
    RETURNING id INTO v_row;
  SELECT hasil_volume INTO v_hasil FROM takeoff_dimensi WHERE id = v_row;
  IF v_hasil <> 30.0 THEN
    RAISE EXCEPTION '431 gagal: hasil_volume tersimpan % (harus 30.0)', v_hasil;
  END IF;

  -- 2. Faktor DISIMPAN, bukan dibuang setelah dipakai menghitung. Ini yang
  --    membuat angka historis reproducible — inti alasan tabel ini ada.
  IF NOT EXISTS (SELECT 1 FROM takeoff_dimensi WHERE id = v_row AND faktor = 1.25) THEN
    RAISE EXCEPTION '431 gagal: faktor tak tersimpan per baris — angka historis tak bisa direproduksi';
  END IF;

  -- 3. Metode 'volume' TANPA tinggi DITOLAK. Tanpa CHECK ini, dimensi yang
  --    lupa diisi menghasilkan angka yang terlihat wajar.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO takeoff_dimensi
      (estimate_item_id, uraian, metode, panjang_m, lebar_m, jumlah, faktor, hasil_volume, created_by)
      VALUES (v_item, '[431] Tanpa tinggi', 'volume', 10, 2, 1, 1, 20, v_user);
    v_lolos := TRUE;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF v_lolos THEN
    RAISE EXCEPTION '431 gagal: metode volume TANPA tinggi_m DITERIMA';
  END IF;

  -- 4. Metode di luar daftar DITOLAK — bentuk perhitungan volume bukan hal
  --    yang boleh diketik pengguna.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO takeoff_dimensi
      (estimate_item_id, uraian, metode, panjang_m, jumlah, faktor, hasil_volume, created_by)
      VALUES (v_item, '[431] Metode karangan', 'kubikasi', 10, 1, 1, 10, v_user);
    v_lolos := TRUE;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF v_lolos THEN
    RAISE EXCEPTION '431 gagal: metode di luar daftar tertutup DITERIMA';
  END IF;

  -- 5. Faktor 0 DITOLAK. Nol membuat seluruh baris menguap jadi volume 0 —
  --    dan nol adalah angka yang tak pernah memicu kecurigaan siapa pun.
  v_lolos := FALSE;
  BEGIN
    INSERT INTO takeoff_dimensi
      (estimate_item_id, uraian, metode, panjang_m, jumlah, faktor, hasil_volume, created_by)
      VALUES (v_item, '[431] Faktor nol', 'panjang', 10, 1, 0, 0, v_user);
    v_lolos := TRUE;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF v_lolos THEN
    RAISE EXCEPTION '431 gagal: faktor 0 DITERIMA — volume menguap tanpa gejala';
  END IF;

  -- 6. INTI KEPUTUSAN: menyisipkan take-off TIDAK menyentuh quantity.
  --    Kalau ini gagal, ada trigger yang menimpa diam-diam — persis yang
  --    sengaja TIDAK dibangun. quantity fixture = 1, hasil take-off = 30.
  SELECT quantity INTO v_qty FROM estimate_items WHERE id = v_item;
  IF v_qty <> 1 THEN
    RAISE EXCEPTION
      '431 gagal: estimate_items.quantity berubah jadi % hanya karena take-off '
      'disisipkan — volume kontrak tak boleh bergeser tanpa keputusan manusia', v_qty;
  END IF;

  -- 7. Jejak penerapan tak boleh separuh: volume tanpa waktu = "diterapkan
  --    entah kapan", jejak yang tak berguna justru saat dibutuhkan.
  v_lolos := FALSE;
  BEGIN
    UPDATE takeoff_dimensi SET volume_diterapkan = 30.0 WHERE id = v_row;
    v_lolos := TRUE;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF v_lolos THEN
    RAISE EXCEPTION '431 gagal: jejak penerapan SEPARUH (tanpa diterapkan_pada) DITERIMA';
  END IF;

  -- 8. Jejak yang UTUH diterima — pintunya tertutup untuk yang cacat, bukan
  --    untuk semua.
  UPDATE takeoff_dimensi
     SET volume_diterapkan = 30.0, diterapkan_pada = now(), diterapkan_oleh = v_user
   WHERE id = v_row;
  IF NOT EXISTS (SELECT 1 FROM takeoff_dimensi WHERE id = v_row AND volume_diterapkan = 30.0) THEN
    RAISE EXCEPTION '431 gagal: jejak penerapan UTUH tak tersimpan';
  END IF;

  -- 9. RLS benar-benar menyala di tabel baru.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'takeoff_dimensi' AND n.nspname = 'public' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION '431 gagal: RLS TIDAK aktif di takeoff_dimensi';
  END IF;

  -- 10. Nominal geometri semuanya numeric — §5.4, nol float.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'takeoff_dimensi'
       AND column_name IN ('panjang_m','lebar_m','tinggi_m','jumlah','faktor',
                           'hasil_volume','volume_diterapkan')
       AND data_type <> 'numeric'
  ) THEN
    RAISE EXCEPTION '431 gagal: ada kolom geometri BUKAN numeric';
  END IF;

  -- ── Bersihkan fixture. CASCADE dari projects tak cukup: cost_codes berdiri
  --    sendiri, dan 102 melarang DELETE cost_codes lewat trigger (jejak
  --    RAB→EVM) — jadi ia dinetralkan jadi deprecated, sama seperti 427.
  DELETE FROM takeoff_dimensi WHERE estimate_item_id = v_item;
  DELETE FROM estimate_items    WHERE id = v_item;
  DELETE FROM estimate_versions WHERE id = v_ev;
  DELETE FROM scenarios         WHERE id = v_sc;
  DELETE FROM projects          WHERE id = v_proyek;
  DELETE FROM clients           WHERE id = v_klien;
  UPDATE cost_codes SET status = 'deprecated', deprecated_at = now() WHERE id = v_cc;

  SELECT count(*) INTO v_sisa FROM takeoff_dimensi WHERE uraian LIKE '[431]%';
  IF v_sisa <> 0 THEN
    RAISE EXCEPTION '431 gagal: % baris fixture tak terbersihkan', v_sisa;
  END IF;

  RAISE NOTICE '431 OK — takeoff_dimensi berdiri; dimensi wajib per metode '
    'ditegakkan, faktor tersimpan per baris, jejak penerapan utuh-atau-kosong, '
    'dan quantity TIDAK bergerak sendiri saat take-off disisipkan';
END $$;
